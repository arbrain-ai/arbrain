// Tablero de agentes por estado (27 oct 2026): agrupa los subagentes de Levy por la columna que mide el servidor,
// con la regla vieja de respaldo, y resume la píldora sin perder a los muertos.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { COLUMNA, GRUPO, GRUPO_DE, VEREDICTO, VENTANA_MS, armarTablero, cuentas, filasDeGrupo, razonHumana, recortarMedio, columnaDe, demoTablero, entregablesDe, filaDe, laten, latidoEnPalabras, pasoDesdeAccion, resumenPildora, senal, tiempoDe, totalTablero } from '../../src/features/cabina/tablero-modelo'
import type { EstadoTablero, TareaInterna, Terminal, Trabajos } from '../../src/features/cabina/trabajos-modelo'

const T = Date.parse('2026-10-27T20:00:00Z')
const tab = (columna: EstadoTablero['columna'], vivo = true, minutos = 1): EstadoTablero => ({ columna, motivo: 'x', latido: { ultimaEscritura: T - minutos * 60_000, procesoVivo: vivo, edadMs: minutos * 60_000, umbralMs: 20 * 60_000 } })
const term = (id: number, extra: Partial<Terminal> = {}, origen = 'chat-a'): Terminal => ({ id, titulo: `a${id}`, cwd: '/tmp', proc: 'claude', estado: 'trabajando', actividad: null, ultimaAccion: null, ultimas: [], origen: 'sin-pantalla',
  subagente: { id, nombre: `agente ${id}`, harness: 'claude', encargo: 'e', cwd: '/tmp', creado: new Date(T - id * 1000).toISOString(), origen }, ...extra })
const datos = (terminales: Terminal[], internas: TareaInterna[] = []): Trabajos => ({ sfterm: false, terminales, internas, servidores: [], servicios: [], leidoEn: '' })

test('la columna del servidor manda; sin ella, la regla de siempre', () => {
  assert.equal(columnaDe(term(1, { tablero: tab('murió', false) })), 'murió')
  assert.equal(columnaDe(term(2)), 'trabajando')
  assert.equal(columnaDe(term(3, { estado: 'esperando' })), 'listo')
  assert.equal(columnaDe(term(4, { estado: 'esperando', conversacion: { harness: 'claude', modelo: null, ctxPct: null, turno: 'terminado', pregunta: true, tokens: null, titulo: null, mensajes: [] } })), 'te-espera')
})

test('agrupa solo subagentes de Levy, por conversación si se pide, lo más nuevo primero', () => {
  const shell: Terminal = { id: 9, titulo: 'zsh', cwd: '/', proc: 'zsh', estado: 'terminal', actividad: null, ultimaAccion: null, ultimas: [] }
  const d = datos([term(10, { tablero: tab('trabajando') }), term(11, { tablero: tab('trabajando') }), term(12, { tablero: tab('murió', false) }, 'chat-b'), shell])
  const todo = armarTablero(d, undefined, T)
  assert.equal(totalTablero(todo), 3)
  assert.deepEqual(todo.trabajando.map(f => f.id), [10, 11])
  assert.equal(totalTablero(armarTablero(d, null)), 0)
  const a = armarTablero(d, 'sdk:chat-a', T)
  assert.equal(totalTablero(a), 2)
  assert.equal(a['murió'].length, 0)
})

test('Detener solo cuando hay un paso en curso de un subagente sin pantalla', () => {
  assert.equal(filaDe(term(1, { tablero: tab('trabajando') })).puedeDetener, true)
  assert.equal(filaDe(term(2, { estado: 'esperando', tablero: tab('listo', false) })).puedeDetener, false)
  assert.equal(filaDe(term(3, { estado: 'esperando', tablero: tab('murió', false) })).puedeDetener, false)
  assert.equal(filaDe(term(4, { origen: 'motor' })).puedeDetener, false)
})

test('la píldora resume en orden y en plural correcto', () => {
  const d = datos([term(1, { tablero: tab('trabajando') }), term(2, { tablero: tab('listo', false) }), term(3, { tablero: tab('listo', false) }), term(4, { tablero: tab('murió', false) })])
  assert.deepEqual(resumenPildora(armarTablero(d, undefined, T)).map(p => p.texto), ['1 trabajando', '1 sin terminar', '2 listos'])
})

test('latido en palabras', () => {
  assert.equal(latidoEnPalabras({ columna: 'trabajando', latido: tab('trabajando', true, 0.5).latido }, T), 'latido hace 30 s')
  assert.equal(latidoEnPalabras({ columna: 'trabajando', latido: tab('trabajando', true, 25).latido }, T), 'sin latido hace 25 min')
  assert.equal(latidoEnPalabras({ columna: 'murió', latido: tab('murió', false, 95).latido }, T), 'última escritura hace 2 h · proceso terminado')
  assert.equal(latidoEnPalabras({ columna: 'listo', latido: null }, T), null)
})

test('el modo demostración trae las cinco columnas y solo agentes inventados (el aviso de demostración va una vez arriba)', () => {
  const t = armarTablero(demoTablero(T), undefined, T)
  for (const c of ['te-espera', 'trabajando', 'listo', 'falló', 'murió'] as const) assert.ok(t[c].length > 0, c)
  assert.ok(Object.values(t).flat().every(f => typeof f.id === 'number' ? f.id >= 900000 : String(f.id).startsWith('demo-')))
})

test('el renglón dice en español qué hace: el paso del servidor manda; sin él, la última acción traducida', () => {
  assert.equal(filaDe(term(1, { tablero: { ...tab('trabajando'), paso: 'Corriendo las pruebas' } })).paso, 'Corriendo las pruebas')
  assert.equal(filaDe(term(2, { tablero: tab('trabajando'), ultimaAccion: 'editó src/features/cabina/tablero-modelo.ts' })).paso, 'Editando tablero-modelo.ts')
  assert.equal(filaDe(term(3, { tablero: tab('trabajando') })).paso, 'Pensando')
  assert.equal(pasoDesdeAccion('corrió un comando'), 'Corriendo un comando')
  assert.equal(pasoDesdeAccion('Bash(npm test)'), 'Corriendo un comando')
  assert.equal(pasoDesdeAccion('web abrir'), 'Usando web abrir')
  assert.equal(pasoDesdeAccion('Running Typecheck arbrain --verbose /x'), null)
  // nunca la salida técnica: un agente que falló dice, en humano, que no pudo terminar y por qué; el código vive en el detalle
  const fallo = filaDe(term(4, { estado: 'esperando', tablero: { ...tab('falló', false), motivo: 'npm test salió con código 1' } }))
  assert.equal(fallo.paso, 'No pudo terminar: falló al probar')
  assert.equal(fallo.motivo, 'npm test salió con código 1')
  assert.equal(filaDe(term(5, { estado: 'esperando', tablero: { ...tab('falló', false), motivo: 'el CLI salió con código 1' } })).paso, 'No pudo terminar: algo salió mal')
})

test('Hecho trae lo que entregó: enlaces, commits y rutas, sin repetir y en orden', () => {
  const e = entregablesDe('Listo. Quedó en el commit 3f2a1c9 y en docs/builds/x/SPEC.md; vista en https://ejemplo.dev/a. Otra vez docs/builds/x/SPEC.md.')
  assert.deepEqual(e.map(x => [x.tipo, x.etiqueta]), [['commit', 'Cambios guardados'], ['archivo', 'SPEC.md'], ['enlace', 'ejemplo.dev/a']])
  assert.equal(e[0].valor, '3f2a1c9') // el hash se copia, no se lee
  assert.deepEqual(entregablesDe('nada que entregar'), [])
  const msg = { harness: 'claude', modelo: null, ctxPct: null, turno: 'terminado' as const, pregunta: false, tokens: null, titulo: null, mensajes: [{ rol: 'assistant' as const, texto: 'Escribí ~/Developer/wt/nota.md', herramientas: [] }] }
  assert.equal(filaDe(term(5, { estado: 'esperando', tablero: tab('listo', false), conversacion: msg })).entregables[0]?.etiqueta, 'nota.md')
  // solo lo terminado lleva entregables
  assert.deepEqual(filaDe(term(6, { tablero: tab('trabajando'), conversacion: msg })).entregables, [])
})

test('tiempo, señal y latido: honestos con lo medido', () => {
  const f = { columna: 'trabajando' as const, desde: T - 12 * 60_000, fin: T, latido: tab('trabajando', true, 0.5).latido }
  assert.equal(tiempoDe(f, T).texto, '12 min')
  assert.equal(laten(f, T), true)
  assert.equal(senal(f, T), null)
  const callado = { ...f, latido: tab('trabajando', true, 8).latido }
  assert.equal(laten(callado, T), false)
  assert.equal(senal(callado, T), 'sin señales hace 8 min')
  assert.equal(tiempoDe({ columna: 'listo', desde: T - 60 * 60_000, fin: T - 5 * 60_000 }, T).texto, '5 min')
})

test('tres grupos visibles: lo que falló o se detuvo entra en «Te espera» porque pide una decisión', () => {
  assert.deepEqual(Object.values(GRUPO), ['Te espera', 'Trabajando', 'Listo'])
  assert.equal(GRUPO_DE['falló'], 'te-espera')
  assert.equal(GRUPO_DE['murió'], 'te-espera')
  const d = datos([
    term(1, { estado: 'esperando', tablero: tab('murió', false) }), term(2, { estado: 'esperando', tablero: tab('falló', false) }),
    term(3, { estado: 'esperando', tablero: tab('te-espera', false) }), term(4, { tablero: tab('trabajando') }), term(5, { estado: 'esperando', tablero: tab('listo', false) }),
  ])
  const t = armarTablero(d, undefined, T)
  // primero la pregunta, luego lo que no pudo terminar, luego lo detenido
  assert.deepEqual(filasDeGrupo(t, 'te-espera').map(f => f.id), [3, 2, 1])
  assert.deepEqual(filasDeGrupo(t, 'trabajando').map(f => f.id), [4])
  assert.deepEqual(filasDeGrupo(t, 'listo').map(f => f.id), [5])
  const c = cuentas(t)
  assert.equal(c.espera, 3)
  assert.equal(c.listos, 1)
  assert.equal(c.mas, 0)
})

test('lo detenido dice qué pasó en humano, sin «murió» ni «lo mataron»', () => {
  assert.equal(filaDe(term(1, { estado: 'esperando', tablero: { ...tab('murió', false), motivo: 'Se detuvo sin terminar su turno (se cerró o se cayó)' } })).paso, 'Se detuvo sin terminar')
  assert.equal(filaDe(term(2, { estado: 'esperando', tablero: { ...tab('murió', true), motivo: 'Sigue el proceso pero no escribe nada hace 25 min' } })).paso, 'Dejó de dar señales hace 25 min')
  assert.equal(filaDe(term(3, { estado: 'esperando', tablero: { ...tab('murió', false), motivo: 'Nunca arrancó: no hay proceso ni bitácora' } })).paso, 'No llegó a arrancar')
  assert.ok(Object.values(COLUMNA).every(c => !/murió|falló|mataron/i.test(c.titulo + c.singular + c.plural)))
})

test('las razones de un fallo se dicen como las diría quien no programa', () => {
  assert.equal(razonHumana('npm test salió con código 1'), 'falló al probar')
  assert.equal(razonHumana('Error: ENOSPC: no space left on device'), 'se quedó sin espacio en disco')
  assert.equal(razonHumana('la llave de la API venció'), 'una llave de acceso venció o no sirve')
  assert.equal(razonHumana('npm run typecheck falló'), 'el código no compila')
  assert.equal(razonHumana('next build salió con código 2'), 'falló al armar la app')
  assert.equal(razonHumana(null), 'algo salió mal')
})

test('el veredicto se dice sin siglas', () => {
  assert.ok(Object.values(VEREDICTO).every(v => !/DoD|criterio/i.test(v)))
})

// ── Ronda 3: una sola fuente de conteo ──
const interna = (id: string, estado: TareaInterna['estado'], minFin: number | null, extra: Partial<TareaInterna> = {}): TareaInterna => ({
  id, tipo: 'subagente', descripcion: `tarea ${id}`, estado, desde: new Date(T - 60 * 60_000).toISOString(), actualizado: new Date(T - (minFin ?? 0) * 60_000).toISOString(),
  ...(minFin != null ? { fin: new Date(T - minFin * 60_000).toISOString() } : {}), conversacion: 'chat-a', turno: 't', ...extra,
})

test('el demo cuadra: lo que dice el encabezado es lo que tiene cada grupo', () => {
  const t = armarTablero(demoTablero(T), undefined, T)
  const c = cuentas(t)
  // El encabezado y la pestaña «Agentes» leen `c.trabajando`; el grupo pinta `t.trabajando`.
  assert.equal(c.trabajando, t.trabajando.length)
  assert.equal(c.trabajando, 6) // 5 encargos + 1 tarea interna; el comando no es agente
  assert.equal(c.procesos, 1)
  assert.equal(c.espera, filasDeGrupo(t, 'te-espera').length)
  assert.equal(c.espera, 3) // una pregunta, una que no pudo terminar y una detenida
  assert.equal(c.listos, filasDeGrupo(t, 'listo').length)
  assert.equal(c.mas, t.procesos.length + t.cortas.length + t.comandosHechos.length + t.anteriores.length)
  assert.equal(totalTablero(t), c.espera + c.trabajando + c.listos + c.mas)
  // El fallo de hace tres días no se queda en «Ahora»; la tarea de anteayer no se lista
  assert.ok(t['falló'].every(f => T - f.fin < VENTANA_MS))
  assert.deepEqual(t.anteriores.map(f => f.nombre), ['importar el CSV de Polar'])
  assert.ok(!t.cortas.some(f => f.nombre.includes('anteayer')))
})

test('los grupos solo muestran lo abierto o lo de las últimas 24 h; lo viejo va a «Más actividad» y no suma', () => {
  const d = datos([
    term(1, { estado: 'esperando', tablero: tab('falló', false, 21 * 24 * 60) }),   // falló hace 21 días
    term(2, { estado: 'esperando', tablero: tab('falló', false, 30) }),             // falló hace 30 min
    term(3, { estado: 'esperando', tablero: tab('listo', false, 25 * 60) }),        // listo hace 25 h
    // 28 oct (Daniel vio un encargo con 21 d en Te espera): abierto sin proceso ni señal en 24 h ya no te espera.
    term(4, { estado: 'esperando', tablero: tab('te-espera', false, 21 * 24 * 60) }), // pregunta de hace 21 días, proceso muerto
    term(5, { estado: 'esperando', tablero: tab('te-espera', true, 3 * 24 * 60) }),   // pregunta de hace 3 días, proceso vivo: sigue
    term(6, { estado: 'esperando', tablero: tab('listo', false, 21 * 60) }),          // listo hace 21 h: sigue en «Listo»
  ])
  const t = armarTablero(d, undefined, T)
  assert.deepEqual(t['falló'].map(f => f.id), [2])
  assert.deepEqual(t['te-espera'].map(f => f.id), [5])
  assert.deepEqual(t.listo.map(f => f.id), [6])
  assert.deepEqual(t.anteriores.map(f => f.id).sort(), [1, 3, 4])
  const c = cuentas(t)
  assert.equal(c.espera, 2)
  assert.equal(c.listos, 1)
  assert.equal(c.anteriores, 3)
  assert.equal(c.mas, 3)
  // la píldora del chat tampoco suma lo viejo
  assert.deepEqual(resumenPildora(t).map(p => p.texto), ['1 te pregunta algo', '1 sin terminar', '1 listo'])
})

test('tareas internas y sesiones tuyas entran en la misma cuenta; los comandos van aparte', () => {
  const sesion: Terminal = { id: 50, titulo: 'mi sesión', cwd: '/tmp', proc: 'claude', estado: 'trabajando', actividad: null, ultimaAccion: null, ultimas: [] }
  const d = datos([term(1, { tablero: tab('trabajando') }), sesion], [
    interna('i1', 'trabajando', null), interna('p1', 'trabajando', null, { tipo: 'comando' }), interna('p2', 'completada', 5, { tipo: 'comando' }),
    interna('i2', 'completada', 10), interna('i3', 'falló', 20), interna('i4', 'completada', 26 * 60),
  ])
  const t = armarTablero(d, undefined, T)
  const c = cuentas(t)
  assert.equal(c.trabajando, 3) // encargo, sesión tuya y tarea interna
  assert.equal(c.procesos, 1)
  assert.equal(c.comandosHechos, 1) // un comando terminado no es un agente: no suma a «Hecho»
  assert.deepEqual(t.cortas.map(f => f.id), ['i2', 'i3']) // la de hace 26 h no se lista
  assert.equal(c.listos, 0)
  assert.equal(c.mas, 4) // comando corriendo, comando terminado y dos tareas rápidas
  assert.equal(t['falló'].length, 0) // una tarea interna fallida es de Levy: va a «Tareas cortas», no a «Falló»
  // por conversación (la píldora): las sesiones tuyas no entran
  assert.equal(cuentas(armarTablero(d, 'chat-a', T)).trabajando, 2)
})

test('los nombres largos se recortan por el centro y conservan la extensión', () => {
  assert.equal(recortarMedio('precios.md'), 'precios.md')
  const r = recortarMedio('taller-claro-1280-unificado.png')
  assert.equal(r.length, 20)
  assert.ok(r.endsWith('.png') && r.includes('…'), r)
  assert.ok(entregablesDe('docs/builds/capturas/taller-claro-1280-unificado-demo.png')[0].etiqueta.endsWith('.png'))
})

test('cada veredicto dice qué te toca', () => {
  assert.equal(VEREDICTO.cumple, 'Cumple lo pedido')
  assert.match(VEREDICTO['no-cumple'], /revísalo/)
  assert.match(VEREDICTO['no-verificable'], /revísalo tú/)
  assert.equal(VEREDICTO['sin-dod'], 'Revísalo tú')
})

test('un comando terminado no repite su título en la segunda línea', () => {
  const t = armarTablero(datos([], [interna('c1', 'completada', 3, { tipo: 'comando', descripcion: 'Back up 0.4 m to make room' })]), undefined, T)
  assert.equal(t.comandosHechos[0].paso, 'Terminó')
})

// ── Modelo, esfuerzo y cambios (29 oct 2026, benchmark de orquestación) ──
import { cambiosEnPalabras, esfuerzoEnPalabras, esfuerzoReintento } from '../../src/features/cabina/tablero-modelo'
import type { Coherencia } from '../../src/features/cabina/trabajos-modelo'

const coh = (pedido: string | null, efectivo: string | null, estado: Coherencia['esfuerzo']['estado'], desajuste: string | null = null): Coherencia =>
  ({ modelo: { pedido: 'gpt-5.6-terra', efectivo: 'gpt-5.6-terra', estado: 'coincide' }, esfuerzo: { pedido, efectivo, estado }, desajuste })

test('el renglón lleva lo que corre (medido) y el desajuste en ámbar; lo pedido sin medir nunca se pinta como medido', () => {
  const conv = { harness: 'codex', modelo: 'gpt-5.6-terra', esfuerzo: 'medium', ctxPct: null, turno: 'trabajando' as const, pregunta: false, tokens: null, titulo: null, mensajes: [], coherencia: coh('max', 'medium', 'distinto', 'pediste max · corre medium') }
  const f = filaDe(term(10, { proc: 'codex', conversacion: conv, cambios: { rama: 'x', mas: 3, menos: 1, archivos: 2 }, subagente: { id: 10, nombre: 'a', harness: 'codex', encargo: 'e', cwd: '/tmp', creado: new Date(T).toISOString(), modelo: 'gpt-5.5', esfuerzo: 'max' } }))
  assert.equal(f.modelo, 'gpt-5.6-terra')
  assert.equal(f.coherencia?.desajuste, 'pediste max · corre medium')
  assert.deepEqual(f.cambios, { rama: 'x', mas: 3, menos: 1, archivos: 2 })
  assert.equal(esfuerzoEnPalabras(f.coherencia), 'esfuerzo medium (pediste max)')
  assert.equal(esfuerzoEnPalabras(coh('max', null, 'sin-medir')), 'esfuerzo max (pedido, sin medir)')
  assert.equal(esfuerzoEnPalabras(coh('high', 'high', 'coincide')), 'esfuerzo high')
  assert.equal(esfuerzoEnPalabras(coh(null, 'medium', 'default')), 'esfuerzo medium (el de su configuración)')
  assert.equal(esfuerzoEnPalabras(coh(null, null, 'default')), null)
  // sin datos nuevos del servidor, el renglón no inventa coherencia ni cambios
  assert.equal(filaDe(term(11)).coherencia, null)
  assert.equal(filaDe(term(11)).cambios, null)
})

test('Reintentar con más esfuerzo: un nivel arriba de lo que corrió, con el techo de cada CLI', () => {
  assert.equal(esfuerzoReintento({ harness: 'claude', coherencia: coh('medium', null, 'sin-medir') }), 'high')
  assert.equal(esfuerzoReintento({ harness: 'codex', coherencia: coh('max', 'medium', 'distinto') }), 'high')
  assert.equal(esfuerzoReintento({ harness: 'codex', coherencia: coh(null, 'xhigh', 'default') }), null)
  assert.equal(esfuerzoReintento({ harness: 'claude', coherencia: coh('max', null, 'sin-medir') }), null)
  assert.equal(esfuerzoReintento({ harness: 'claude', coherencia: null }), 'high')
  assert.equal(esfuerzoReintento({ harness: 'opencode', coherencia: null }), null)
})

test('cambios en palabras', () => {
  assert.equal(cambiosEnPalabras({ rama: 'x', mas: 1214, menos: 8, archivos: 4 }), '+1,214 −8 en 4 archivos')
  assert.equal(cambiosEnPalabras({ rama: 'x', mas: 1, menos: 0, archivos: 1 }), '+1 −0 en 1 archivo')
  assert.equal(cambiosEnPalabras({ rama: 'x', mas: 0, menos: 0, archivos: 0 }), 'Sin cambios todavía')
})

test('la demo trae un renglón en ámbar y uno con «Ver cambios» (capturas del 29 oct)', () => {
  const filas = demoTablero(T).terminales.map(filaDe)
  assert.ok(filas.some(f => f.coherencia?.desajuste === 'pediste max · corre medium'))
  assert.ok(filas.some(f => f.cambios && f.columna === 'falló'))
})
