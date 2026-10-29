// Taller › Agentes por conversación (29 oct 2026): los mismos renglones del tablero, juntos por la conversación que los
// lanzó; la abierta primero, «Sin conversación» al final y, dentro, trabajando · te espera · falló · listo.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { armarTablero, cuentas, demoTablero } from '../../src/features/cabina/tablero-modelo'
import { MAX_CARRILES, agruparPorConversacion, claveFila, lineaDeTiempo } from '../../src/features/cabina/tablero-por-conversacion'
import type { EstadoTablero, TareaInterna, Terminal, Trabajos } from '../../src/features/cabina/trabajos-modelo'

const T = Date.parse('2026-10-29T13:00:00Z')
const tab = (columna: EstadoTablero['columna'], vivo = true, minutos = 1, desdeMin?: number): EstadoTablero => ({
  columna, motivo: 'x', latido: { ultimaEscritura: T - minutos * 60_000, procesoVivo: vivo, edadMs: minutos * 60_000, umbralMs: 20 * 60_000 },
  ...(desdeMin != null ? { desde: T - desdeMin * 60_000 } : {}),
})
const term = (id: number, origen: string | undefined, tablero: EstadoTablero, creadoMin = id): Terminal => ({
  id, titulo: `a${id}`, cwd: '/tmp', proc: 'claude', estado: tablero.columna === 'trabajando' ? 'trabajando' : 'esperando', actividad: null, ultimaAccion: null, ultimas: [], origen: 'sin-pantalla', tablero,
  subagente: { id, nombre: `agente ${id}`, harness: 'claude', encargo: 'e', cwd: '/tmp', creado: new Date(T - creadoMin * 60_000).toISOString(), origen },
})
const interna = (id: string, conversacion: string, estado: TareaInterna['estado']): TareaInterna => ({ id, tipo: 'subagente', descripcion: id, estado, desde: new Date(T - 5 * 60_000).toISOString(), actualizado: new Date(T - 60_000).toISOString(), conversacion, turno: 't' })
const datos = (terminales: Terminal[], internas: TareaInterna[] = []): Trabajos => ({ sfterm: false, terminales, internas, servidores: [], servicios: [], leidoEn: '' })

const D = datos([
  term(1, 'sdk:chat-a', tab('listo', false, 3)),
  term(2, 'chat-a', tab('trabajando', true, 0.5, 4)),
  term(3, 'chat-a', tab('falló', false, 8)),
  term(4, 'chat-a', tab('te-espera', true, 2)),
  term(5, 'chat-b', tab('listo', false, 30)),
  term(6, 'chat-c', tab('trabajando', true, 1, 20)),
  term(7, undefined, tab('trabajando', true, 1, 2)),
], [interna('i1', 'sdk:chat-b', 'trabajando')])

test('un grupo por conversación: sdk:<id> y <id> son la misma y la suma no cambia', () => {
  const t = armarTablero(D, undefined, T)
  const g = agruparPorConversacion(t, { ahora: T })
  assert.deepEqual(g.map(x => x.conversacion).sort(), ['', 'chat-a', 'chat-b', 'chat-c'])
  const n = cuentas(t)
  assert.equal(g.reduce((s, x) => s + x.filas.length, 0), n.trabajando + n.espera + n.listos)
})

test('la conversación abierta va primero y «Sin conversación» al final, aunque la abierta esté quieta', () => {
  const g = agruparPorConversacion(armarTablero(D, undefined, T), { activa: 'sdk:chat-b', ahora: T })
  assert.equal(g[0].conversacion, 'chat-b')
  assert.equal(g[0].activa, true)
  assert.equal(g.at(-1)!.conversacion, '')
  // sin abierta: primero lo que pide algo de ti entre lo vivo (chat-a tiene una pregunta), luego lo más reciente
  const sin = agruparPorConversacion(armarTablero(D, undefined, T), { ahora: T })
  assert.equal(sin[0].conversacion, 'chat-a')
  assert.equal(sin.filter(x => x.activa).length, 0)
})

test('dentro del grupo: trabajando, te espera, no pudo terminar, listo', () => {
  const a = agruparPorConversacion(armarTablero(D, undefined, T), { ahora: T }).find(x => x.conversacion === 'chat-a')!
  assert.deepEqual(a.filas.map(f => f.columna), ['trabajando', 'te-espera', 'falló', 'listo'])
  assert.deepEqual(a.resumen.map(p => p.texto), ['1 trabajando', '1 te espera', '1 sin terminar', '1 listo'])
  assert.equal(a.plegadoInicial, false)
})

test('un grupo con solo listos se pliega, salvo que sea la conversación abierta', () => {
  const D2 = datos([term(5, 'chat-b', tab('listo', false, 30)), term(8, 'chat-b', tab('listo', false, 40))])
  const [b] = agruparPorConversacion(armarTablero(D2, undefined, T), { ahora: T })
  assert.equal(b.plegadoInicial, true)
  assert.deepEqual(b.resumen.map(p => p.texto), ['2 listos'])
  assert.equal(agruparPorConversacion(armarTablero(D2, undefined, T), { activa: 'chat-b', ahora: T })[0].plegadoInicial, false)
})

test('la línea de tiempo: un carril por agente, lo abierto llega hasta ahora y nada se sale de la ventana', () => {
  const a = agruparPorConversacion(armarTablero(D, undefined, T), { ahora: T }).find(x => x.conversacion === 'chat-a')!
  const { tramos, desde, hasta } = a.linea
  assert.equal(hasta, T)
  assert.match(a.linea.escala, /^hace \d+ min$/)
  assert.ok(desde <= T - 10 * 60_000)
  assert.equal(tramos.length, 4)
  assert.equal(tramos[0].clave, claveFila(a.filas[0]))
  const trab = tramos.find(x => x.columna === 'trabajando')!
  assert.ok(trab.abierto && Math.abs(trab.x + trab.ancho - 1) < 1e-9)
  for (const x of tramos) assert.ok(x.x >= 0 && x.ancho > 0 && x.x + x.ancho <= 1 + 1e-9, JSON.stringify(x))
})

test('más de seis agentes: seis carriles y el resto se cuenta', () => {
  const muchos = Array.from({ length: 9 }, (_, i) => term(20 + i, 'chat-z', tab('listo', false, i + 1)))
  const [z] = agruparPorConversacion(armarTablero(datos(muchos), undefined, T), { ahora: T })
  assert.equal(z.linea.tramos.length, MAX_CARRILES)
  assert.equal(z.linea.ocultos, 3)
  assert.deepEqual(lineaDeTiempo([], T).tramos, [])
})

test('el demo trae varias conversaciones y un grupo sin conversación', () => {
  const g = agruparPorConversacion(armarTablero(demoTablero(T), undefined, T), { ahora: T })
  assert.ok(g.length >= 3)
  assert.equal(g.at(-1)!.conversacion, '')
})
