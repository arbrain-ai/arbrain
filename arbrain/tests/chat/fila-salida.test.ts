import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { SalidaDeFila, type EstadoSalida, type ResultadoSoltar, type VistaFila } from '../../src/features/chat/lib/fila-salida'

/**
 * La fila que no salía sola (1 nov 2026, 07:43). Bitácora real de esa mañana:
 *   07:41:27 el dueño manda texto y el turno arranca. 07:41:29 se va a otra conversación.
 *   07:42:12 vuelve (reenganche vivo). 07:43:00 manda un mensaje con 2 fotos: no se puede inyectar, entra a la fila.
 *   07:43:03 se va a otra conversación (el vivo se corta). 07:43:28 el turno termina en el servidor.
 *   07:44:41 vuelve: la respuesta ya está, la fila dice «saliendo…» y no sale. 07:45:16 la empuja con otro mensaje.
 * La salida solo disparaba en el BORDE «trabajando → libre» visto con la conversación abierta: el turno terminó
 * mientras él estaba en otra, así que al volver no hubo borde y nadie la mandó.
 */

function relojFalso() {
  let t = 0, seq = 0
  const pendientes = new Map<number, { en: number; fn: () => void }>()
  return {
    ahora: () => t,
    programar: (fn: () => void, ms: number) => { const id = ++seq; pendientes.set(id, { en: t + Math.max(0, ms), fn }); return id },
    cancelar: (h: unknown) => { pendientes.delete(h as number) },
    /** Avanza el reloj corriendo cada timer a su hora y dejando resolver las promesas que abre. */
    async avanzar(ms: number) {
      const fin = t + ms
      for (;;) {
        await new Promise(r => setImmediate(r))
        let sig: [number, { en: number; fn: () => void }] | null = null
        for (const e of pendientes) if (e[1].en <= fin && (!sig || e[1].en < sig[1].en)) sig = e
        if (!sig) break
        pendientes.delete(sig[0]); t = sig[1].en; sig[1].fn()
      }
      t = fin
      await new Promise(r => setImmediate(r))
    },
  }
}

function montar(opts: { vivo?: (c: string) => boolean | null | Promise<boolean | null>; soltar?: () => ResultadoSoltar } = {}) {
  const reloj = relojFalso()
  const soltados: Array<{ en: number; conversacion: string | null }> = []
  const estados: Array<{ en: number; estado: EstadoSalida; intento: number }> = []
  let pausas = 0, atoradas = 0, consultas = 0
  const servidor = { vivo: new Set<string>() }
  let vista: VistaFila = { conversacion: null, hay: false, pausada: false, turnoEnCurso: false, ocupado: false, listo: true, terminoMal: false }
  const s: SalidaDeFila = new SalidaDeFila({
    reloj,
    soltar: (o) => {
      const r = opts.soltar?.() ?? (!o.forzar && vista.pausada ? 'pausada' : vista.ocupado || vista.turnoEnCurso || !vista.listo ? 'ocupado' : vista.hay ? 'salio' : 'vacia')
      // Como en React: el estado cambia ya y el panel lo vuelve a observar después (efecto), no dentro de la llamada.
      if (r === 'salio') { soltados.push({ en: reloj.ahora(), conversacion: vista.conversacion }); verDespues({ hay: false }) }
      return r
    },
    pausar: () => { pausas++; verDespues({ pausada: true }) },
    turnoVivo: async (c) => { consultas++; return opts.vivo ? opts.vivo(c) : servidor.vivo.has(c) },
    alCambiar: (estado, intento) => estados.push({ en: reloj.ahora(), estado, intento }),
    alAtorarse: () => { atoradas++ },
  })
  function ver(cambio: Partial<VistaFila>) { vista = { ...vista, ...cambio }; s.observar(vista) }
  function verDespues(cambio: Partial<VistaFila>) { vista = { ...vista, ...cambio }; queueMicrotask(() => s.observar(vista)) }
  return { s, reloj, ver, soltados, estados, servidor, get pausas() { return pausas }, get atoradas() { return atoradas }, get consultas() { return consultas }, get vista() { return vista } }
}

test('incidente 1 nov 07:43: el turno termina con el dueño en otra conversación; al volver la fila sale sola', async () => {
  const m = montar()
  m.servidor.vivo.add('A')
  m.ver({ conversacion: 'A', turnoEnCurso: true })        // 07:42:12 reenganchado al turno de A
  await m.reloj.avanzar(48_000)
  m.ver({ hay: true })                                      // 07:43:00 mensaje con 2 fotos → fila
  await m.reloj.avanzar(3_400)
  m.ver({ conversacion: 'B', turnoEnCurso: false, hay: false }) // 07:43:03 se va: el vivo se suelta, la fila de B está vacía
  await m.reloj.avanzar(25_000)
  m.servidor.vivo.delete('A')                               // 07:43:28 el turno de A termina en el servidor
  await m.reloj.avanzar(73_000)
  assert.equal(m.soltados.length, 0, 'nada sale mientras el dueño está en otra conversación')
  const vuelta = m.reloj.ahora()
  m.ver({ conversacion: 'A', hay: true, pausada: false })   // 07:44:41 vuelve: sin turno vivo, la fila sigue ahí
  await m.reloj.avanzar(5_000)
  assert.equal(m.soltados.length, 1, 'la fila sale sola al volver, sin que el dueño la empuje')
  assert.equal(m.soltados[0].conversacion, 'A')
  assert.ok(m.soltados[0].en - vuelta <= 3_000, `sale en segundos, no después (tardó ${m.soltados[0].en - vuelta} ms)`)
  assert.equal(m.pausas, 0)
  await m.reloj.avanzar(60_000)
  assert.equal(m.soltados.length, 1, 'sale una sola vez')
})

test('fotos que terminan de subir después de que el turno terminó: salen igual (antes leía un `loading` viejo)', async () => {
  const m = montar()
  m.ver({ conversacion: 'A', turnoEnCurso: true })
  await m.reloj.avanzar(10_000)
  m.ver({ turnoEnCurso: false })            // el turno termina mientras las fotos aún suben: la fila está vacía
  await m.reloj.avanzar(2_000)
  m.ver({ hay: true })                      // terminan de subir y el mensaje entra a la fila
  await m.reloj.avanzar(1_500)
  assert.equal(m.soltados.length, 1)
  assert.equal(m.consultas, 0, 'el fin ya se vio en esta conversación: no hace falta preguntarle al servidor')
})

test('al volver con el turno TODAVÍA vivo en el servidor no sale: espera al reenganche y sale al terminar', async () => {
  const m = montar()
  m.servidor.vivo.add('A')
  m.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  m.ver({ conversacion: 'B', turnoEnCurso: false, hay: false })
  await m.reloj.avanzar(10_000)
  m.ver({ conversacion: 'A', hay: true })   // vuelve; el reenganche aún no llega
  await m.reloj.avanzar(4_000)
  assert.equal(m.soltados.length, 0, 'no abre un turno encima del que sigue corriendo')
  assert.equal(m.s.estado, 'esperando-turno')
  m.ver({ turnoEnCurso: true })             // el chat vivo se reengancha
  await m.reloj.avanzar(20_000)
  m.servidor.vivo.delete('A')
  m.ver({ turnoEnCurso: false })            // termina a la vista
  await m.reloj.avanzar(1_000)
  assert.equal(m.soltados.length, 1)
})

test('si el reenganche nunca llega pero el servidor ya terminó, la revisión periódica la manda', async () => {
  const m = montar()
  m.servidor.vivo.add('A')
  m.ver({ conversacion: 'A', hay: true })
  await m.reloj.avanzar(5_000)
  assert.equal(m.soltados.length, 0)
  m.servidor.vivo.delete('A')
  await m.reloj.avanzar(6_000)
  assert.equal(m.soltados.length, 1)
})

test('detener a mano o un turno fallido la dejan EN PAUSA; ni al volver sale sola', async () => {
  const m = montar()
  m.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  m.s.detenidoAMano()
  m.ver({ turnoEnCurso: false })
  await m.reloj.avanzar(10_000)
  assert.equal(m.pausas, 1); assert.equal(m.soltados.length, 0)
  m.ver({ conversacion: 'B', hay: false, pausada: false })
  m.ver({ conversacion: 'A', hay: true, pausada: true })
  await m.reloj.avanzar(30_000)
  assert.equal(m.soltados.length, 0)

  const f = montar()
  f.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  f.ver({ turnoEnCurso: false, terminoMal: true })
  await f.reloj.avanzar(10_000)
  assert.equal(f.pausas, 1); assert.equal(f.soltados.length, 0)

  // Falló mientras el dueño estaba en otra conversación: al volver tampoco sale sola.
  const g = montar()
  g.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  g.ver({ conversacion: 'B', turnoEnCurso: false, hay: false })
  g.ver({ conversacion: 'A', hay: true, terminoMal: true })
  await g.reloj.avanzar(10_000)
  assert.equal(g.soltados.length, 0); assert.equal(g.pausas, 1)
})

test('«Enviar ya» detiene y manda aunque haya sido una detención', async () => {
  const m = montar()
  m.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  m.s.enviarYa()
  m.ver({ turnoEnCurso: false, terminoMal: true })
  await m.reloj.avanzar(1_000)
  assert.equal(m.soltados.length, 1); assert.equal(m.pausas, 0)
})

test('si no puede salir, reintenta y lo dice; nunca se queda «saliendo…» callada: al tope queda en pausa y avisa', async () => {
  const m = montar({ soltar: () => 'ocupado' })
  m.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  m.ver({ turnoEnCurso: false })
  await m.reloj.avanzar(3_000)
  assert.equal(m.s.estado, 'reintentando', 'tras unos segundos sin salir, la etiqueta dice que reintenta')
  assert.ok(m.estados.some(e => e.estado === 'reintentando' && e.intento >= 1))
  // «saliendo» nunca dura más de unos segundos seguidos.
  for (let i = 0; i < m.estados.length; i++) {
    if (m.estados[i].estado !== 'saliendo') continue
    const hasta = m.estados[i + 1]?.en ?? m.reloj.ahora()
    assert.ok(hasta - m.estados[i].en <= 3_000, `«saliendo» duró ${hasta - m.estados[i].en} ms`)
  }
  await m.reloj.avanzar(60_000)
  assert.equal(m.s.estado, 'atorada')
  assert.equal(m.atoradas, 1, 'avisa una vez que no pudo salir sola')
  assert.equal(m.pausas, 1, 'queda en pausa, a la vista, con «Enviar»')
})

test('servidor sin respuesta sobre el turno: tras dos intentos la manda igual (el servidor ordena los turnos)', async () => {
  const m = montar({ vivo: () => null })
  m.ver({ conversacion: 'A', hay: true })
  await m.reloj.avanzar(10_000)
  assert.equal(m.soltados.length, 1)
})

test('una fila en pausa (recargar, abrir la app) nunca sale sola; muchos renders no la mandan dos veces', async () => {
  const m = montar()
  m.ver({ conversacion: 'A', hay: true, pausada: true })
  await m.reloj.avanzar(30_000)
  assert.equal(m.soltados.length, 0)

  const r = montar()
  r.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  r.ver({ turnoEnCurso: false })
  for (let i = 0; i < 50; i++) { r.ver({}); await r.reloj.avanzar(20) }
  await r.reloj.avanzar(5_000)
  assert.equal(r.soltados.length, 1)
})

test('tras atorarse, «Enviar» a mano la manda aunque esté en pausa', async () => {
  let libre = false
  const m = montar({ soltar: () => libre ? 'salio' : 'ocupado' })
  m.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  m.ver({ turnoEnCurso: false })
  await m.reloj.avanzar(60_000)
  assert.equal(m.s.estado, 'atorada')
  libre = true
  m.s.soltarAhora({ forzar: true })
  assert.equal(m.soltados.length, 1)
  assert.equal(m.s.estado, 'quieta')
})

test('el fallo que se pinta un render DESPUÉS del fin también la deja en pausa (si aún no salió)', async () => {
  const m = montar()
  m.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  m.ver({ turnoEnCurso: false })            // el fin llega primero…
  await m.reloj.avanzar(50)
  m.ver({ terminoMal: true })               // …y el error del turno en el render siguiente
  await m.reloj.avanzar(5_000)
  assert.equal(m.soltados.length, 0); assert.equal(m.pausas, 1)

  const y = montar()                        // con «Enviar ya» sale igual
  y.ver({ conversacion: 'A', turnoEnCurso: true, hay: true })
  y.s.enviarYa()
  y.ver({ turnoEnCurso: false })
  await y.reloj.avanzar(50)
  y.ver({ terminoMal: true })
  await y.reloj.avanzar(2_000)
  assert.equal(y.soltados.length, 1); assert.equal(y.pausas, 0)
})

test('cambiar de conversación mientras se le pregunta al servidor: la respuesta vieja no decide y la nueva fila sale', async () => {
  const a: { responder?: (vivo: boolean) => void } = {}
  const m = montar({ vivo: (c) => c === 'A' ? new Promise<boolean>(r => { a.responder = r }) : false })
  m.ver({ conversacion: 'A', hay: true })
  await m.reloj.avanzar(1_300)              // la pregunta por A queda en vuelo
  assert.ok(a.responder, 'se preguntó por A')
  m.ver({ conversacion: 'B', hay: true })   // el dueño se va a B, que también tiene fila esperando
  await m.reloj.avanzar(100)
  a.responder!(false)                       // la respuesta de A llega tarde
  await m.reloj.avanzar(3_000)
  assert.equal(m.soltados.length, 1)
  assert.equal(m.soltados[0].conversacion, 'B', 'sale la fila de B; la respuesta de A no manda nada desde B')
})
