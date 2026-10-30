import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { capas, diferidas, filtrar, fmtTokens, fmtPct, type Anatomia, type ArchivoMemoria } from '../../src/features/cabina/vistas/contexto-capas'

const llamada = (input: number, creacion: number, lectura: number) => ({ en: '2026-10-04T20:57:15Z', uso: { input, cacheCreacion: creacion, cacheLectura: lectura, salida: 10 }, total: input + creacion + lectura })

// Números reales de la conversación 239ad6e0 (4 oct 2026) y de la sonda /context del Studio.
const anatomia = (o: Partial<Anatomia> = {}): Anatomia => ({
  conversacion: {
    id: '239ad6e0', cuenta: 'default', sesion: '2de96371', transcript: true,
    primera: llamada(2, 39876, 0), ultima: llamada(2, 4753, 345944),
    ultimoTurno: { en: '2026-10-04T20:57:13Z', caracteres: 2352, llamadas: 1, primera: llamada(2, 4753, 345944) },
    primerMensaje: { caracteres: 70, inyeccion: 4000 }, llamadas: 160, turnos: 42, compactaciones: [], inyeccion: null, modelo: 'claude-opus-5-5',
  },
  desglose: { fuente: 'sonda', en: '2026-10-04T20:57:12Z', datos: {
    modelo: 'claude-opus-5-5', total: 19104, ventana: 1_000_000,
    categorias: [
      { nombre: 'System prompt', tokens: 142, tipo: 'used' }, { nombre: 'MCP tools', tokens: 651, tipo: 'used' },
      { nombre: 'MCP server instructions', tokens: 717, tipo: 'used' }, { nombre: 'MCP tools (deferred)', tokens: 170905, tipo: 'deferred' },
      { nombre: 'System tools (deferred)', tokens: 14084, tipo: 'deferred' }, { nombre: 'Memory files', tokens: 7530, tipo: 'used' },
      { nombre: 'Skills', tokens: 9956, tipo: 'used' }, { nombre: 'Messages', tokens: 108, tipo: 'used' },
      { nombre: 'Autocompact buffer', tokens: 33000, tipo: 'buffer' }, { nombre: 'Free space', tokens: 947896, tipo: 'free' },
    ],
    memoria: [{ ruta: 'CLAUDE.md', tokens: 3995 }, { ruta: '.claude/memory/MEMORY.md', tokens: 2402 }, { ruta: '.claude/now.md', tokens: 1133 }],
    skills: [], mcp: [],
  } },
  ventana: { tokens: 1_000_000, modelo: 'claude-opus-5-5', fuente: 'test' },
  archivos: [], ganchos: [], tokensPorCaracter: 0.44,
  ...o,
})

test('las capas suman exactamente la ventana y lo usado es la última llamada medida', () => {
  const r = capas(anatomia())
  assert.equal(r.usado, 350699)
  assert.equal(r.fuenteUsado, 'medido')
  assert.equal(r.segmentos.reduce((n, s) => n + s.tokens, 0), 1_000_000)
  const por = Object.fromEntries(r.segmentos.map(s => [s.id, s]))
  assert.equal(por.memoria.tokens, 7530)
  assert.equal(por.mcp.tokens, 651 + 717)
  // proveedor = primera llamada − contado (7530 + 9956 + 1368) − primer mensaje estimado (4070 × 0.44 ≈ 1791)
  assert.equal(por.proveedor.tokens, 39878 - 18854 - 1791)
  assert.equal(por.proveedor.fuente, 'por diferencia')
  assert.equal(por.historial.tokens, 350699 - por.proveedor.tokens - 18854)
  assert.equal(por.reserva.tokens, 33000)
})

test('sin conversación medida, lo usado es lo contado por el SDK y el proveedor sale de /context', () => {
  const r = capas(anatomia({ conversacion: null }))
  assert.equal(r.fuenteUsado, 'contado')
  assert.equal(r.usado, 142 + 651 + 717 + 7530 + 9956 + 108)
  assert.equal(r.segmentos[0].fuente, 'contado')
})

test('ventana desconocida: sin reserva ni libre, nunca un cero inventado', () => {
  const r = capas(anatomia({ ventana: { tokens: null, modelo: null, fuente: 'sin dato' } }))
  assert.equal(r.ventana, null)
  assert.ok(!r.segmentos.some(s => s.id === 'libre' || s.id === 'reserva'))
  assert.equal(fmtPct(10, null), '—')
})

test('las herramientas diferidas se cuentan aparte: no ocupan la ventana', () => {
  assert.equal(diferidas(anatomia()), 170905 + 14084)
})

test('el buscador encuentra por título, frase del índice o disparador, sin acentos', () => {
  const f = (ruta: string, capa: ArchivoMemoria['capa'], titulo: string, triggers: string[] = []): ArchivoMemoria =>
    ({ ruta, capa, titulo, bytes: 1, fecha: null, descripcion: null, indice: 'indice', triggers, oculto: false })
  const lista = [f('user/norte.md', 'user', 'Norte: explotar y distribución', ['norte']), f('feedback/cursor.md', 'feedback', 'Cada quien su cursor', ['halo'])]
  assert.deepEqual(filtrar(lista, 'distribucion', 'todo').map(x => x.ruta), ['user/norte.md'])
  assert.deepEqual(filtrar(lista, 'HALO', 'todo').map(x => x.ruta), ['feedback/cursor.md'])
  assert.deepEqual(filtrar(lista, '', 'feedback').map(x => x.ruta), ['feedback/cursor.md'])
})

test('formato de tokens', () => {
  assert.equal(fmtTokens(350699), '350.7K')
  assert.equal(fmtTokens(1_000_000), '1M')
  assert.equal(fmtTokens(142), '142')
})
