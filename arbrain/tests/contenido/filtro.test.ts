/** Un solo filtro (19 nov 2026): el texto se vuelve fichas, las fichas un criterio y el criterio decide qué se ve. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { analizar, etiqueta, feedFiltrado, normal, pasaCanales, pasaVideo, quitar, resolver, resumen, sugerir, sumar, ultimaPalabra, vocabularioDe, type Ficha } from '../../src/features/contenido/filtro'
import { temasChip } from '../../src/features/contenido/pantalla'
import type { CanalCuartel, VideoCuartel } from '../../src/features/contenido/tipos'

const AHORA = Date.parse('2026-11-19T18:00:00Z')
const DIA = 864e5
const hace = (d: number) => new Date(AHORA - d * DIA).toISOString()
const TEMAS = temasChip([
  { slug: 'claude-code', nombre: 'Claude Code y agentes de código', corto: 'Claude Code', nicho: true },
  { slug: 'ia-agentes', nombre: 'Agentes de IA', corto: 'Agentes', nicho: true },
  { slug: 'ventas', nombre: 'Ventas', corto: 'Ventas', nicho: true },
  { slug: 'robots', nombre: 'Robots y humanoides', corto: 'Robots', nicho: false },
])
const canal = (id: string, nombre: string, o: Partial<CanalCuartel> = {}): CanalCuartel => ({ channel_id: id, nombre, capa: 'competencia', idioma: 'en', temas: ['claude-code'], ...o })
const CANALES = [
  canal('UCuno', 'Fulano Uno', { estudio: true, handle: '@fulanouno' }), canal('UCdos', 'Mengano Dos', { estudio: true }),
  canal('UCtres', 'Zutano Tres', { estudio: true }), canal('UCcuatro', 'Perengano Cuatró', { estudio: true, idioma: 'es' }),
  canal('UCotro', 'Otro Canal', { idioma: 'es', temas: ['robots'] }), canal('UCyo', 'Daniel', { capa: 'propio' }),
  canal('UCdesc', 'Alguien Nuevo', { capa: 'descubierto' }),
]
const VOC = vocabularioDe(TEMAS, CANALES)
const video = (id: string, o: Partial<VideoCuartel> = {}): VideoCuartel => ({
  video_id: id, channel_id: 'UCotro', canal: 'Otro Canal', capa: 'competencia', idioma: 'es', titulo: `Video ${id}`, publicado: hace(3),
  temas: ['claude-code'], vistas: 1000, outlier: { puntaje: 3, esperado: 300, metodo: 'maduro', confianza: 'alta' }, ...o,
})

test('la frase del encargo se vuelve cinco fichas', () => {
  assert.deepEqual(analizar('claude code español 30 días mis 4 ×10', VOC), [
    { k: 'tema', slug: 'claude-code' }, { k: 'idioma', v: 'es' }, { k: 'ventana', dias: 30 }, { k: 'mis4' }, { k: 'mult', min: 10 },
  ])
})

test('variantes: acentos, mayúsculas, x10 y 10x, semanas, meses y año', () => {
  assert.deepEqual(analizar('CLAUDE CODE Espanol 7d x3', VOC), [{ k: 'tema', slug: 'claude-code' }, { k: 'idioma', v: 'es' }, { k: 'ventana', dias: 7 }, { k: 'mult', min: 3 }])
  assert.deepEqual(analizar('10x 2 semanas', VOC), [{ k: 'mult', min: 10 }, { k: 'ventana', dias: 14 }])
  assert.deepEqual(analizar('3 meses', VOC), [{ k: 'ventana', dias: 90 }])
  assert.deepEqual(analizar('1 año', VOC), [{ k: 'ventana', dias: 365 }])
  assert.deepEqual(analizar('un año', VOC), [{ k: 'ventana', dias: 365 }])
  assert.deepEqual(analizar('mis cuatro', VOC), [{ k: 'mis4' }])
  assert.deepEqual(analizar('mis referentes', VOC), [{ k: 'mis4' }])
})

test('canales por nombre completo o handle; lo demás queda como texto a buscar', () => {
  assert.deepEqual(analizar('fulano uno agentes', VOC), [{ k: 'canal', id: 'UCuno' }, { k: 'tema', slug: 'ia-agentes' }])
  assert.deepEqual(analizar('@fulanouno', VOC), [{ k: 'canal', id: 'UCuno' }])
  assert.deepEqual(analizar('fable 5.2 inglés', VOC), [{ k: 'texto', q: 'fable 5.2' }, { k: 'idioma', v: 'en' }])
})

test('los conectores sueltos se tiran: «español e inglés» son dos idiomas, sin texto', () => {
  assert.deepEqual(analizar('español e inglés', VOC), [{ k: 'idioma', v: 'es' }, { k: 'idioma', v: 'en' }])
  assert.deepEqual(analizar('', VOC), [])
})

test('sumar: la ventana, ×N y la capa reemplazan; nicho y todos los temas se excluyen; quitar por clave', () => {
  let fs: Ficha[] = sumar([], [{ k: 'ventana', dias: 7 }, { k: 'nicho' }])
  fs = sumar(fs, [{ k: 'ventana', dias: 90 }, { k: 'todo' }, { k: 'tema', slug: 'ventas' }, { k: 'tema', slug: 'ventas' }])
  assert.deepEqual(fs, [{ k: 'ventana', dias: 90 }, { k: 'todo' }, { k: 'tema', slug: 'ventas' }])
  assert.deepEqual(quitar(fs, { k: 'ventana', dias: 1 }), [{ k: 'todo' }, { k: 'tema', slug: 'ventas' }])
})

test('vacío = lo de hoy: su nicho, español e inglés, 30 días, su universo', () => {
  const c = resolver([], VOC)
  assert.equal(c.deHoy, true)
  assert.deepEqual(c.idiomas, ['es', 'en'])
  assert.equal(c.dias, 30)
  assert.deepEqual([...c.temas!].sort(), ['claude-code', 'ia-agentes', 'ventas'])
  assert.equal(c.canales, null)
  assert.equal(resumen(c, VOC), 'tu nicho · español e inglés · 30 días · tu universo')
})

test('nombrar canales o buscar texto suelta el nicho (salvo que lo pida); «mis 4» sale del universo', () => {
  const c = resolver([{ k: 'mis4' }], VOC)
  assert.equal(c.temas, null)
  assert.deepEqual([...c.canales!].sort(), ['UCcuatro', 'UCdos', 'UCtres', 'UCuno'])
  assert.ok(resolver([{ k: 'mis4' }, { k: 'nicho' }], VOC).temas)
  assert.equal(resolver([{ k: 'texto', q: 'fable' }], VOC).temas, null)
  // Sin marca en el universo, «mis 4» filtra a nada (y la barra lo dice), no a todo.
  assert.equal(resolver([{ k: 'mis4' }], { ...VOC, mis4: [] }).canales?.size, 0)
})

test('pasaVideo: idioma, ventana, capa, canal, tema, ×N y texto', () => {
  const hoy = resolver([], VOC)
  assert.ok(pasaVideo(video('a'), hoy, AHORA))
  assert.ok(!pasaVideo(video('b', { idioma: 'pt' }), hoy, AHORA), 'portugués fuera por defecto')
  assert.ok(!pasaVideo(video('c', { publicado: hace(40) }), hoy, AHORA), 'fuera de 30 días')
  assert.ok(!pasaVideo(video('d', { capa: 'descubierto' }), hoy, AHORA), 'descubiertos tras su filtro')
  assert.ok(!pasaVideo(video('e', { temas: ['robots'] }), hoy, AHORA), 'fuera de su nicho')
  assert.ok(!pasaVideo(video('f', { capa: 'mentalidad' }), hoy, AHORA))
  const c = resolver(analizar('claude code español 30 días mis 4 ×10', VOC), VOC)
  assert.ok(pasaVideo(video('g', { channel_id: 'UCcuatro', canal: 'Perengano Cuatró', outlier: { puntaje: 12, esperado: 1, metodo: 'maduro', confianza: 'alta' } }), c, AHORA))
  assert.ok(!pasaVideo(video('h', { channel_id: 'UCcuatro', outlier: { puntaje: 4, esperado: 1, metodo: 'maduro', confianza: 'alta' } }), c, AHORA), '×4 no llega a ×10')
  assert.ok(!pasaVideo(video('i', { channel_id: 'UCuno', idioma: 'en', outlier: { puntaje: 12, esperado: 1, metodo: 'maduro', confianza: 'alta' } }), c, AHORA), 'inglés fuera')
  assert.ok(!pasaVideo(video('j', { outlier: { puntaje: 12, esperado: 1, metodo: 'maduro', confianza: 'alta' } }), c, AHORA), 'no es de sus 4')
  const t = resolver(analizar('fable', VOC), VOC)
  assert.ok(pasaVideo(video('k', { titulo: 'Así usa la gente Fable 5.2', temas: ['robots'] }), t, AHORA))
  assert.ok(!pasaVideo(video('l', { titulo: 'Otra cosa' }), t, AHORA))
  const d = resolver([{ k: 'capa', capa: 'descubierto' }], VOC)
  assert.ok(pasaVideo(video('m', { capa: 'descubierto' }), d, AHORA))
})

test('pasaCanales: el directorio sigue al filtro; el texto solo si algún nombre lo trae', () => {
  const hoy = resolver([], VOC)
  assert.deepEqual(pasaCanales(CANALES, hoy).map(c => c.nombre), ['Fulano Uno', 'Mengano Dos', 'Zutano Tres', 'Perengano Cuatró'])
  assert.deepEqual(pasaCanales(CANALES, resolver([{ k: 'mis4' }], VOC)).length, 4)
  assert.deepEqual(pasaCanales(CANALES, resolver(analizar('uno', VOC), VOC)).map(c => c.nombre), ['Fulano Uno'])
  assert.equal(pasaCanales(CANALES, resolver(analizar('autónomos raros', VOC), VOC)).length > 0, true)
})

test('feedFiltrado: 2 por canal hacia la meta; sin tope si nombró canales; texto por fecha', () => {
  const xs = [1, 2, 3, 4].map(i => video(`o${i}`, { publicado: hace(i) })).concat([video('n1', { channel_id: 'UCuno', canal: 'Fulano Uno', idioma: 'en' })])
  const hoy = resolver([], VOC)
  const f = feedFiltrado(xs, hoy, { ahora: AHORA })
  assert.equal(f.filter(v => v.channel_id === 'UCotro').length, 2)
  assert.ok(f.some(v => v.video_id === 'n1'))
  const otro = resolver([{ k: 'canal', id: 'UCotro' }], VOC)
  assert.equal(feedFiltrado(xs, otro, { ahora: AHORA }).length, 4)
  const t = feedFiltrado(xs, resolver(analizar('video', VOC), VOC), { ahora: AHORA })
  assert.equal(t[0].video_id, 'o1', 'lo más reciente primero')
  assert.equal(t[t.length - 1].video_id, 'o4', 'el más viejo al final')
})

test('sugerencias: sin texto, atajos y temas de su nicho; con texto, lo que empieza así; nunca lo ya puesto', () => {
  const vacio = sugerir('', VOC, [])
  assert.ok(vacio.some(s => s.ficha.k === 'mis4' && s.detalle?.includes('Fulano Uno')))
  assert.ok(vacio.some(s => s.texto === 'Claude Code'))
  assert.ok(!vacio.some(s => s.texto === 'Robots'), 'fuera de nicho solo si lo escribe')
  assert.ok(sugerir('rob', VOC, []).some(s => s.texto === 'Robots'))
  assert.ok(sugerir('fula', VOC, []).some(s => s.ficha.k === 'canal' && s.texto === 'Fulano Uno'))
  assert.ok(sugerir('x10', VOC, []).some(s => s.ficha.k === 'mult' && s.texto === '×10 o más'))
  assert.ok(!sugerir('', VOC, [{ k: 'mis4' }]).some(s => s.ficha.k === 'mis4'))
  assert.ok(sugerir('', VOC, [{ k: 'ventana', dias: 30 }]).some(s => s.ficha.k === 'ventana' && s.ficha.dias === 7), 'otra ventana sí se sugiere')
  assert.equal(ultimaPalabra('claude code esp'), 'esp')
  assert.equal(ultimaPalabra('claude code '), '')
})

test('etiquetas legibles', () => {
  assert.equal(etiqueta({ k: 'mult', min: 10 }, VOC), '×10 o más')
  assert.equal(etiqueta({ k: 'canal', id: 'UCcuatro' }, VOC), 'Perengano Cuatró')
  assert.equal(etiqueta({ k: 'ventana', dias: 365 }, VOC), '1 año')
  assert.equal(normal('  Español ×10 '), 'espanol x10')
})
