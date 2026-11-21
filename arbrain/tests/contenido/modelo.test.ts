// Cuartel de Contenido (15 nov 2026): lógica pura de la pantalla. Contratos: docs/builds/contenido-cuartel/ESQUEMA.md y CEREBRO.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  banda, compacto, desdeRadar, dosisProvisional, esShort, leerTranscriptMd, lineaActual, multiplicador, normalizarDosis, normalizarIdeas,
  normalizarLazo, normalizarRanking, outlierReal, posicionLog, reloj, segundos,
} from '../../src/features/contenido/modelo'
import type { VideoCuartel } from '../../src/features/contenido/tipos'

const AHORA = Date.parse('2026-11-15T15:00:00Z')
const video = (id: string, extra: Partial<VideoCuartel> = {}): VideoCuartel => ({
  video_id: id, channel_id: `UC${id}`, canal: `Canal ${id}`, capa: 'referente', titulo: `Video ${id}`, publicado: '2026-11-12T15:00:00Z', duracion_s: 900, vistas: 1000, ...extra,
})

test('formatos: cifras compactas, reloj y multiplicador', () => {
  assert.equal(compacto(1234), '1.2 K')
  assert.equal(compacto(4_640_000), '4.6 M')
  assert.equal(compacto(null), '—')
  assert.equal(reloj(75), '1:15')
  assert.equal(reloj(3725), '1:02:05')
  assert.equal(multiplicador(3.42), '×3.4')
  assert.equal(multiplicador(64.9), '×65')
})

test('outlier de verdad: ×2 con confianza media/alta, o ×3 con cualquiera (ESQUEMA §3.1)', () => {
  assert.equal(outlierReal({ puntaje: 2.1, esperado: 1, metodo: 'maduro', confianza: 'media' }), true)
  assert.equal(outlierReal({ puntaje: 2.5, esperado: 1, metodo: 'curva_generica', confianza: 'baja' }), false)
  assert.equal(outlierReal({ puntaje: 3, esperado: 1, metodo: 'curva_generica', confianza: 'baja' }), true)
  assert.equal(outlierReal(null), false)
  assert.equal(posicionLog(1), 0)
  assert.equal(posicionLog(30), 1)
  assert.ok(posicionLog(3) > 0.3 && posicionLog(3) < 0.33)
})

test('Shorts: por duración o por #shorts; un largo de 20 min no lo es', () => {
  assert.equal(esShort({ duracion_s: 58, titulo: 'x' }), true)
  assert.equal(esShort({ duracion_s: 1200, titulo: 'Algo #shorts' }), true)
  assert.equal(esShort({ duracion_s: 1200, titulo: 'Largo' }), false)
})

test('transcript del corpus: título, canal y líneas con su segundo; la línea que suena', () => {
  const md = '# Mi video\n\n- **Canal:** Hormozi\n\n---\n\n## Transcript\n\n`[00:00]` Hola\n`[01:05]` La oferta\n`[1:02:03]` Cierre\n'
  const t = leerTranscriptMd(md)
  assert.equal(t.titulo, 'Mi video')
  assert.equal(t.canal, 'Hormozi')
  assert.deepEqual(t.lineas, [{ s: 0, texto: 'Hola' }, { s: 65, texto: 'La oferta' }, { s: 3723, texto: 'Cierre' }])
  assert.equal(lineaActual(t.lineas, 70), 1)
  assert.equal(lineaActual(t.lineas, 0), 0)
  assert.equal(lineaActual(t.lineas, 99999), 2)
  assert.equal(segundos('12:34'), 754)
  assert.equal(segundos(754), 754)
})

test('dosis v1.2: la fecha siempre viaja y lo viejo dice por qué entra', () => {
  const d = normalizarDosis({
    fecha: '2026-11-15', ventana_dias: 28, recientes: 1,
    videos: [
      { video_id: 'aaaaaaaaaaa', titulo: 'Nuevo', publicado: '2026-11-14T10:00:00Z', edad_dias: 1.4, frescura: 'nuevo', fecha_txt: 'ayer', por_que_viejo: null },
      { video_id: 'bbbbbbbbbbb', titulo: 'Viejo', publicado: '2026-09-02T13:41:20Z', edad_dias: 74, frescura: 'viejo', fecha_txt: '2 sep', por_que_viejo: 'Del 2 sep: entra porque vale 1.6× lo mejor de estas 4 semanas.' },
      { video_id: 'ccccccccccc', titulo: 'Raro', frescura: 'antiguo' },
    ],
  }, new Map())!
  assert.equal(d.ventana_dias, 28)
  assert.equal(d.recientes, 1)
  assert.deepEqual([d.videos[0].frescura, d.videos[0].fecha_txt, d.videos[0].por_que_viejo], ['nuevo', 'ayer', null])
  assert.match(d.videos[1].por_que_viejo ?? '', /1\.6×/)
  assert.equal(d.videos[1].edad_dias, 74)
  assert.equal(d.videos[2].frescura, null)
})

test('dosis de CEREBRO: por qué, oro verificado, estado y «terminaste» cuando nada queda pendiente', () => {
  const porId = new Map([['aaaaaaaaaaa', video('aaaaaaaaaaa')]])
  const d = normalizarDosis({
    fecha: '2026-11-15', meta: { ejes: [{ id: 'youtube', nombre: 'Empaquetado' }] },
    videos: [
      { video_id: 'aaaaaaaaaaa', por_que_verlo: 'Porque sí', oro: { inicio_s: 754, fin_s: 912, etiqueta: '12:34', cita: 'frase', verificado: true }, estado: 'sirvio' },
      { video_id: 'bbbbbbbbbbb', titulo: 'Solo de CEREBRO', canal: 'X', por_que_verlo: 'Otro', oro: { inicio_s: 10, verificado: false }, estado: 'no_sirvio' },
    ],
  }, porId)!
  assert.equal(d.fuente, 'cerebro')
  assert.equal(d.videos[0].oro?.verificado, true)
  assert.equal(d.videos[0].video?.titulo, 'Video aaaaaaaaaaa')
  assert.equal(d.videos[1].video?.titulo, 'Solo de CEREBRO')
  assert.equal(d.videos[1].oro?.verificado, false)
  assert.equal(d.terminaste, true)
  assert.equal(d.ejes?.[0].nombre, 'Empaquetado')
  assert.equal(normalizarDosis({ videos: [] }, porId), null)
})

test('dosis provisional: solo outliers reales de la semana, uno por canal, y no la inventa con menos de 3', () => {
  const o = (p: number) => ({ puntaje: p, esperado: 100, metodo: 'maduro', confianza: 'alta' })
  const vs = [
    video('a0000000001', { outlier: o(5) }), video('a0000000002', { outlier: o(4), channel_id: 'UCa0000000001' }),
    video('a0000000003', { outlier: o(3) }), video('a0000000004', { outlier: o(2.5) }), video('a0000000005', { outlier: o(1.2) }),
    video('a0000000006', { outlier: o(9), publicado: '2026-10-01T00:00:00Z' }),
  ]
  const d = dosisProvisional(vs, AHORA)!
  assert.equal(d.fuente, 'provisional')
  assert.deepEqual(d.videos.map(v => v.video_id), ['a0000000001', 'a0000000003', 'a0000000004'])
  assert.ok(d.videos.every(v => v.oro === null))
  assert.equal(dosisProvisional(vs.slice(0, 2), AHORA), null)
})

test('ideas de CEREBRO: títulos con patrón, miniaturas, voz del cliente y origen', () => {
  const [i] = normalizarIdeas({ ideas: [{
    id: 'idea-1', estado: 'nueva', tipo: 'veta', angulo: 'El ángulo', promesa: 'Se lleva X',
    titulos: [{ texto: 'T1', patron: 'versus' }, 'T2'], miniaturas: [{ texto: 'NADIE LO TOCÓ', objeto: 'la terminal' }],
    voz_cliente: [{ cita_id: 'c031', texto: 'cita literal', tipo: 'objecion' }], origen: { video_id: 'abc', canal: 'Brock', outlier: 2.2 },
  }, { estado: 'nueva' }] })
  assert.equal(i.angulo, 'El ángulo')
  assert.deepEqual(i.titulos.map(t => t.texto), ['T1', 'T2'])
  assert.equal(i.miniaturas[0].objeto, 'la terminal')
  assert.equal(i.voz_cliente[0].texto, 'cita literal')
  assert.equal(i.origen?.outlier, 2.2)
  assert.equal(normalizarIdeas({ ideas: [{ estado: 'nueva' }] }).length, 0)
})

test('ranking y lazo: solo ids de YouTube válidos; el lazo cuenta ideas aplicadas', () => {
  const r = normalizarRanking({ videos: { abcdefghijk: { puntaje: 87.2, tesis: 'T' }, malo: { puntaje: 1 } } })
  assert.deepEqual(Object.keys(r), ['abcdefghijk'])
  assert.equal(r.abcdefghijk.tesis, 'T')
  assert.equal(normalizarLazo({ ideas_aplicadas: { total: 3, semana: 1 } })?.ideas_aplicadas?.total, 3)
})

test('banda del universo: percentil del dueño y posiciones dentro de 0..1', () => {
  const b = banda([10, 20, 30, 40, 50], 45)!
  assert.equal(b.mediana, 30)
  assert.equal(b.percentil, 0.8)
  assert.ok(b.tu! > b.p50 && b.tu! <= 1)
  assert.equal(banda([], 3), null)
})

test('radar de antes: sin Shorts y con outlier aproximado de confianza baja', () => {
  const filas = Array.from({ length: 6 }, (_, i) => ({ video_id: `x${String(i).padStart(10, '0')}`, title: `V${i}`, channel_id: 'UC1', channel_name: 'C', views: i === 5 ? 5000 : 1000, duration_seconds: 600, published_at: '2026-11-01T00:00:00Z' }))
  filas.push({ video_id: 'shortshort1', title: 'S', channel_id: 'UC1', channel_name: 'C', views: 9, duration_seconds: 40, published_at: '2026-11-01T00:00:00Z' })
  const { videos } = desdeRadar(filas)
  assert.equal(videos.length, 6)
  const alto = videos.find(v => v.vistas === 5000)!
  assert.equal(alto.outlier?.confianza, 'baja')
  assert.equal(alto.outlier?.puntaje, 5)
})

test('reproductor que no arranca: espera 8 s y distingue red bloqueada de marco filtrado', async () => {
  const { ESPERA_ARRANQUE_MS, motivoNoArranca, textoNoArranca } = await import('../../src/features/contenido/modelo')
  assert.equal(ESPERA_ARRANQUE_MS, 8000)
  assert.equal(motivoNoArranca(false), 'sin-api')
  assert.equal(motivoNoArranca(true), 'sin-respuesta')
  assert.match(textoNoArranca('sin-respuesta').pista!, /Tiempo en pantalla/)
  assert.match(textoNoArranca('sin-api').pista!, /www\.youtube\.com/)
  assert.match(textoNoArranca('error', 'El video ya no existe o es privado.').texto, /ya no existe/)
  // Ninguna salida manda a youtube.com: todas ofrecen bajarlo y verlo aquí.
  for (const m of ['sin-api', 'sin-respuesta', 'error'] as const) assert.match(textoNoArranca(m).texto, /Bájalo una vez/)
})
