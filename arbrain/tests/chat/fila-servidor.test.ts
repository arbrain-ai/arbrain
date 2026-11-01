import { test, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { FilaServidor, cuerpoDelPendiente, veredicto, type EstadoItemServidor, type PendienteServidor } from '../../src/features/chat/lib/fila-servidor'
import { leerDesenlace, notaDelHost, type DesenlaceEnvio } from '../../src/features/chat/lib/inyecciones'
import { ChatJournal, JournalCancelled, type TurnIdentity } from '../../server/src/chat-runtime/journal'
import { ChatInjections } from '../../server/src/chat-runtime/inyecciones'
import { ChatSupervisor, type JobRunner } from '../../server/src/chat-runtime/supervisor'

/**
 * Opción B (firmada el 1 nov 2026, 08:46). Reproduce el incidente de las 07:43 de punta a punta, con el servidor de
 * verdad (journal, inyecciones y supervisor en SQLite en memoria) y el controlador de la web con reloj falso:
 * turno largo → el dueño manda texto + 2 fotos → se va a otra conversación → el turno cierra sin nadie mirando.
 * Antes el mensaje esperaba en el dispositivo hasta que alguien lo empujara. Ahora sale solo en el servidor,
 * antes de que el dueño vuelva, y aparece una sola vez aunque el dispositivo vuelva a preguntar con el mismo id.
 */

function relojFalso() {
  let t = 0, seq = 0
  const pendientes = new Map<number, { en: number; fn: () => void }>()
  return {
    ahora: () => t,
    programar: (fn: () => void, ms: number) => { const id = ++seq; pendientes.set(id, { en: t + Math.max(0, ms), fn }); return id },
    cancelar: (h: unknown) => { pendientes.delete(h as number) },
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

async function hasta(cond: () => boolean, ms = 3_000) {
  const fin = Date.now() + ms
  while (!cond()) { if (Date.now() > fin) throw new Error('timeout'); await new Promise(r => setTimeout(r, 10)) }
}

// SQLite vive en las dependencias del servidor (la web no la trae): se carga desde ahí, como lo carga el journal.
const Database = createRequire(new URL('../../server/package.json', import.meta.url))('better-sqlite3') as new (ruta: string) => ConstructorParameters<typeof ChatJournal>[0]

const cierres: Array<() => void> = []
after(() => { while (cierres.length) cierres.pop()!() })

const FOTOS = ['https://x.supabase.co/storage/v1/object/public/chat/chat-1.png', 'https://x.supabase.co/storage/v1/object/public/chat/chat-2.png']

/** El servidor real y el endpoint POST /chat/stream con `inyectar: true` (mismo camino que server.ts). */
function servidor() {
  let now = 1_000
  const db = new Database(':memory:')
  const journal = new ChatJournal(db, () => ++now)
  const injections = new ChatInjections(db, journal, () => ++now)
  let seguir!: () => void
  const compuerta = new Promise<void>(r => { seguir = r })
  const corridas: Array<{ turnId: string; conversacion: string; input: Record<string, unknown> }> = []
  const run: JobRunner = async (turn, emit) => {
    corridas.push({ turnId: turn.turnId, conversacion: turn.conversationId, input: turn.input as Record<string, unknown> })
    emit({ type: 'text_delta', text: 'ok' })
    if (turn.turnId === 'largo') await compuerta
    return { status: 'completed' as const, payload: { turnId: turn.turnId }, snapshot: { text: 'ok' } }
  }
  const worker = new ChatSupervisor(journal, { workerId: 'w', run, deliver: async () => true, workerConfirmedDead: () => false, injections, inject: () => true, tickMs: 20 })
  worker.start()
  cierres.push(() => { worker.stop(); db.close() })
  const id = (conversationId: string, turnId: string): TurnIdentity => ({ owner: 'dueno', account: 'default', conversationId, turnId })
  let posts = 0, caido = 0
  const endpoint = async (conversacion: string, item: PendienteServidor): Promise<DesenlaceEnvio> => {
    posts++
    if (caido > 0) { caido--; throw new Error('Failed to fetch') }
    const ident = id(conversacion, item.id)
    const input = { ...cuerpoDelPendiente(item), source: 'desktop' }
    try {
      const r = injections.tryInject(ident, input)
      if (r) return leerDesenlace(202, { accepted: true, injected: true, turnId: item.id, into: r.into.turnId, status: r.injection.status })
      const a = worker.accept(ident, input)
      return leerDesenlace(202, { accepted: true, turnId: a.turn.turnId, status: a.turn.status })
    } catch (e) {
      return leerDesenlace(409, { error: e instanceof Error ? e.message : 'conflict', ...(e instanceof JournalCancelled ? { code: 'turn_cancelled' } : {}) })
    }
  }
  return { db, journal, injections, worker, seguir, corridas, id, endpoint, get posts() { return posts }, caerse(n: number) { caido = n } }
}

/** La caja de la fila (useColaMensajes) reducida a lo que importa aquí, y el controlador conectado como en ChatPanel. */
function web(srv: ReturnType<typeof servidor>) {
  const reloj = relojFalso()
  const caja = new Map<string, Array<PendienteServidor & { servidor?: true }>>()
  const estados: Array<ReadonlyMap<string, EstadoItemServidor>> = []
  const devueltos: Array<{ id: string; motivo: string }> = []
  let conversacion: string | null = null, turnoEnCurso = false
  const de = (c: string) => caja.get(c) ?? []
  const f = new FilaServidor({
    reloj,
    enviar: srv.endpoint,
    salio: id => { if (conversacion) caja.set(conversacion, de(conversacion).filter(x => x.id !== id)) },
    devolver: (id, motivo) => { devueltos.push({ id, motivo }); if (conversacion) caja.set(conversacion, de(conversacion).map(x => x.id === id ? { id: x.id, texto: x.texto, imagenes: x.imagenes } : x)) },
    alCambiar: e => estados.push(e),
  })
  const ver = () => f.observar({ conversacion, pendientes: conversacion ? de(conversacion).filter(x => x.servidor) : [], turnoEnCurso })
  return {
    f, reloj, caja: de, estados, devueltos,
    abrir(c: string | null, enCurso = false) { conversacion = c; turnoEnCurso = enCurso; ver() },
    terminaAqui() { turnoEnCurso = false; ver() },
    /** handleSend con Levy trabajando y fotos: al servidor en el acto, espejo en la caja. */
    mandar(texto: string, imagenes: string[]) {
      const item = { id: crypto.randomUUID(), texto, imagenes }
      caja.set(conversacion!, [...de(conversacion!), { ...item, servidor: true }])
      f.registrar(conversacion!, item)
      ver()
      return item.id
    },
    ultimoEstado: (id: string) => estados.at(-1)?.get(id),
  }
}

test('incidente 07:43: turno largo, el dueño se va, manda texto + 2 fotos antes, el turno cierra → sale solo en el servidor y una sola vez', async () => {
  const srv = servidor(), w = web(srv)
  srv.worker.accept(srv.id('A', 'largo'), { message: 'jamás dejé YT…' })
  await hasta(() => srv.corridas.length === 1)
  srv.journal.accept(srv.id('A', 'aviso'), { message: '[Aviso del motor]', despertador: { id: 's', texto: 'Subagente', programadoPara: 1, disparo: 1, tipo: 'subagente' } })
  w.abrir('A', true)
  const id = w.mandar('mira estas dos capturas', FOTOS)
  await w.reloj.avanzar(0)
  assert.equal(srv.injections.get(id)?.status, 'pending', 'las fotos quedan guardadas en el servidor al formar el mensaje')
  assert.deepEqual(w.ultimoEstado(id), { estado: 'en_servidor', intento: 0 })
  // El reenganche no lo pinta como nota dentro del turno: vive en la caja, editable.
  assert.equal(notaDelHost(srv.worker.injectionsOf(srv.id('A', 'largo'))[0] as never), null)

  w.abrir('B')                       // 07:43:03: se va a otra conversación; la pantalla de A ya no mira
  srv.seguir()                       // 07:43:28: el turno cierra sin nadie mirando
  await hasta(() => srv.corridas.length === 3)
  assert.deepEqual(srv.corridas.map(c => c.turnId), ['largo', id, 'aviso'], 'sale solo, mientras el dueño sigue en B, y antes que el aviso')
  assert.deepEqual(String(srv.corridas[1].input.imageUrl).split('\n'), FOTOS)
  assert.equal(srv.corridas[1].input.message, 'mira estas dos capturas')

  const postsAntes = srv.posts
  w.abrir('A')                       // 07:44:41: vuelve. La caja pregunta con el mismo id y lo suelta.
  await w.reloj.avanzar(0)
  assert.ok(srv.posts > postsAntes)
  assert.deepEqual(w.caja('A'), [], 'la caja queda vacía: no se queda «saliendo…»')
  // El dispositivo insiste otra vez con el mismo id: no nace otro turno.
  await srv.endpoint('A', { id, texto: 'mira estas dos capturas', imagenes: FOTOS })
  await new Promise(r => setTimeout(r, 80))
  const n = (srv.db.prepare('SELECT COUNT(*) AS n FROM chat_runtime_turns WHERE turn_id = ?').get(id) as { n: number }).n
  assert.equal(n, 1)
  assert.equal(srv.corridas.filter(c => c.turnId === id).length, 1, 'aparece una sola vez')
})

test('sin red al formar el mensaje: la caja dice «no llega al servidor · reintento N» y al volver la red queda una sola vez', async () => {
  const srv = servidor(), w = web(srv)
  srv.worker.accept(srv.id('A', 'largo'), { message: 'turno largo' })
  await hasta(() => srv.corridas.length === 1)
  w.abrir('A', true)
  srv.caerse(2)
  const id = w.mandar('', FOTOS)
  await w.reloj.avanzar(0)
  assert.deepEqual(w.ultimoEstado(id), { estado: 'reintentando', intento: 1 })
  await w.reloj.avanzar(1_000)
  assert.deepEqual(w.ultimoEstado(id), { estado: 'reintentando', intento: 2 })
  await w.reloj.avanzar(2_000)
  assert.deepEqual(w.ultimoEstado(id), { estado: 'en_servidor', intento: 0 })
  assert.equal(srv.injections.get(id)?.input && (srv.injections.get(id)!.input as { message: string }).message, 'Analiza estas 2 imágenes', 'sin texto viaja el mismo texto por defecto de un envío normal')
  srv.seguir()
  await hasta(() => srv.corridas.length === 2)
  w.terminaAqui()
  await w.reloj.avanzar(400)
  assert.deepEqual(w.caja('A'), [])
  assert.equal(srv.corridas.filter(c => c.turnId === id).length, 1)
})

test('quitar o editar mientras espera: se retira en el servidor y no sale al cerrar el turno', async () => {
  const srv = servidor(), w = web(srv)
  srv.worker.accept(srv.id('A', 'largo'), { message: 'turno largo' })
  await hasta(() => srv.corridas.length === 1)
  w.abrir('A', true)
  const id = w.mandar('esta no', FOTOS)
  await w.reloj.avanzar(0)
  // ChatPanel: olvidar + /api/chat/inyeccion + quitar de la caja.
  w.f.olvidar(id)
  assert.deepEqual(srv.injections.retirar(srv.id('A', id)), { retirada: true, estado: 'unread' })
  srv.seguir()
  await new Promise(r => setTimeout(r, 150))
  assert.deepEqual(srv.corridas.map(c => c.turnId), ['largo'])
})

test('detuviste a Levy: lo que esperaba en el servidor vuelve a la caja del dispositivo, en pausa, con sus fotos', async () => {
  const srv = servidor(), w = web(srv)
  srv.worker.accept(srv.id('A', 'largo'), { message: 'turno largo' })
  await hasta(() => srv.corridas.length === 1)
  w.abrir('A', true)
  const id = w.mandar('con fotos', FOTOS)
  await w.reloj.avanzar(0)
  w.abrir('B')
  srv.worker.interrupt(srv.id('A', 'largo'))
  srv.seguir()
  await hasta(() => srv.injections.get(id)?.status === 'unread')
  w.abrir('A')
  await w.reloj.avanzar(0)
  assert.deepEqual(w.devueltos, [{ id, motivo: 'detenido' }])
  assert.deepEqual(w.caja('A'), [{ id, texto: 'con fotos', imagenes: FOTOS }])
  assert.deepEqual(srv.corridas.map(c => c.turnId), ['largo'])
})

test('una respuesta que llega después de cambiar de conversación no decide nada', async () => {
  const reloj = relojFalso()
  let soltar!: (d: DesenlaceEnvio) => void
  const salidos: string[] = []
  const f = new FilaServidor({ reloj, enviar: () => new Promise(r => { soltar = r }), salio: id => salidos.push(id), devolver: () => {} })
  f.observar({ conversacion: 'A', pendientes: [{ id: 'x', texto: 't', imagenes: FOTOS }], turnoEnCurso: false })
  await reloj.avanzar(0)
  f.observar({ conversacion: 'B', pendientes: [], turnoEnCurso: false })
  soltar({ tipo: 'en_fila_servidor', turnId: 'x' })
  await reloj.avanzar(0)
  assert.deepEqual(salidos, [])
})

test('veredicto: qué hace la caja con cada respuesta del servidor', () => {
  assert.equal(veredicto({ tipo: 'inyectado', into: 't', estado: 'pending' }), 'espera')
  assert.equal(veredicto({ tipo: 'inyectado', into: 't', estado: 'unread' }), 'devolver')
  assert.equal(veredicto({ tipo: 'en_fila_servidor', turnId: 'x' }), 'salio')
  assert.equal(veredicto({ tipo: 'rechazado', motivo: 'Turn id conflicts', status: 409 }), 'salio', 'el id ya existe allá: mandarlo de nuevo lo duplicaría')
  assert.equal(veredicto({ tipo: 'rechazado', motivo: 'retirado', status: 409, codigo: 'turn_cancelled' }), 'devolver')
  assert.equal(veredicto({ tipo: 'rechazado', motivo: 'sin conversación', status: 404 }), 'devolver')
  assert.equal(veredicto({ tipo: 'rechazado', motivo: 'túnel', status: 502 }), 'reintentar')
  assert.equal(veredicto({ tipo: 'rechazado', motivo: 'sin red' }), 'reintentar')
})
