// Galería de videos del editor (19 nov 2026): estados, capítulos, post, transcript, cotejo y pedidos a Levy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  capitulos, cotejar, estadoPost, estadoSolicitud, estadoVideo, extraerDescripcion, extraerPost, fechaCdmx, partirId, pasaFiltro,
  pedidoALevy, segmentar, tipoFinal, titulosDe, transcriptDeTexto, youtubeDe, type Evidencia, type Publish,
} from '../../src/features/editor/galeria/modelo'

const VACIA: Evidencia = { hayGrabacion: false, hayCorte: false, hayRevision: false, hayArte: false, finales: [], enCanal: null }
const AHORA = new Date('2026-11-19T15:00:00Z')

test('las fechas sin zona del pipeline son hora de Ciudad de México', () => {
  assert.equal(fechaCdmx('2026-09-02 17:00')?.toISOString(), '2026-09-02T23:00:00.000Z')
  assert.equal(fechaCdmx('2026-09-23T01:00:00Z')?.toISOString(), '2026-09-23T01:00:00.000Z')
  assert.equal(fechaCdmx('mañana'), null)
})

test('el video avanza por etapas según la evidencia y publish.json', () => {
  assert.equal(estadoVideo(null, VACIA, AHORA).clave, 'guion')
  assert.equal(estadoVideo(null, { ...VACIA, hayGrabacion: true }, AHORA).clave, 'grabado')
  assert.equal(estadoVideo(null, { ...VACIA, hayGrabacion: true, hayCorte: true }, AHORA).clave, 'cortando')
  assert.equal(estadoVideo(null, { ...VACIA, hayCorte: true, hayRevision: true }, AHORA).clave, 'revisar')
  assert.equal(estadoVideo(null, { ...VACIA, hayArte: true }, AHORA).clave, 'arte')
  assert.equal(estadoVideo(null, { ...VACIA, finales: [{ nombre: 'renders/final.mp4', tipo: 'largo', bytes: 1, url: '', modificado: '' }] }, AHORA).clave, 'exportado')
  const futuro: Publish = { data: { launch: { publish_at: '2026-11-21 09:00' } } }
  const e = estadoVideo(futuro, VACIA, AHORA)
  assert.equal(e.clave, 'programado'); assert.match(e.etiqueta, /^Programado · 21 nov/)
  assert.equal(estadoVideo({ data: { launch: { publish_at: '2026-09-02 17:00' } } }, VACIA, AHORA).clave, 'por-verificar')
  assert.equal(estadoVideo({ data: { launch: { publish_at: '2026-09-02 17:00' } }, stages: { published: { status: 'done' } } }, VACIA, AHORA).clave, 'publicado')
  // El canal manda: si la analítica lo tiene, está publicado aunque publish.json diga privado.
  const privado: Publish = { video: { youtube_id: 'Knsxge39PvA' }, data: { youtube: { video_id: 'Knsxge39PvA', observation: { video_id: 'Knsxge39PvA', privacy_status: 'private' } } } }
  assert.equal(estadoVideo(privado, VACIA, AHORA).clave, 'guion')
  assert.equal(estadoVideo(privado, { ...VACIA, enCanal: { published_at: '2026-09-23T01:00:00Z' } }, AHORA).clave, 'publicado')
})

test('el post es su propio eje: borrador, en la bandeja, aprobado, pendiente y publicado', () => {
  const pub = (data: Publish['data']): Publish => ({ data })
  const obra = estadoVideo(null, { ...VACIA, hayGrabacion: true }, AHORA)
  const publicado = { clave: 'publicado' as const, etiqueta: 'Publicado', tono: 'live' as const }
  assert.equal(estadoPost(pub({}), obra, false).clave, 'sin-post')
  assert.equal(estadoPost(pub({}), obra, true).clave, 'borrador')
  assert.equal(estadoPost(pub({ post_draft: { body: 'x' } }), obra, false, { id: 'cf_000000000000', pedida: '', estado: 'pendiente' }).clave, 'en-bandeja')
  assert.equal(estadoPost(pub({ post_draft: { body: 'x', approved_at: '2026-11-19T10:00:00Z' } }), obra, false).clave, 'aprobado')
  assert.equal(estadoPost(pub({ post_draft: { body: 'x' } }), publicado, false).clave, 'pendiente')
  assert.equal(estadoPost(pub({ post_published_at: '2026-09-02T23:35:29Z' }), publicado, false).clave, 'publicado')
  assert.equal(estadoPost(null, publicado, false).clave, 'sin-registro')
})

test('los capítulos exigen empezar en 0:00 y aceptan horas', () => {
  const d = 'Intro\n\nCAPÍTULOS\n0:00 Arranque\n1:05 - La caricatura\n1:02:03 Cierre\nhttps://x.y'
  assert.deepEqual(capitulos(d), [{ t: 0, titulo: 'Arranque' }, { t: 65, titulo: 'La caricatura' }, { t: 3723, titulo: 'Cierre' }])
  assert.deepEqual(capitulos('En el 3:20 pasa algo\n5:00 otra cosa'), [])
})

test('descripción y post salen limpios de sus archivos de trabajo', () => {
  assert.equal(extraerDescripcion('Notas\nDESCRIPCIÓN (pegar tal cual)\n====\nHola\n0:00 Inicio\n====\nnotas'), 'Hola\n0:00 Inicio')
  assert.equal(extraerDescripcion('sin marcas'), 'sin marcas')
  const md = '# Post\n> nota para Levy\n\n## El post\n\nComunidad!\n> otra nota\nTexto\n\n---\n\n## Checklist\n- [ ] x'
  assert.equal(extraerPost(md), 'Comunidad!\nTexto')
  assert.equal(extraerPost('## El post\nSolo esto'), 'Solo esto')
})

test('títulos: el elegido primero, sin repetidos', () => {
  const t = titulosDe({ video: { titulo: 'A' }, data: { metadata: { titles: ['A', 'B', ' b ', 'C'] } } })
  assert.deepEqual(t, [{ texto: 'A', elegido: true }, { texto: 'B', elegido: false }, { texto: 'C', elegido: false }])
})

test('transcript: palabras a renglones y texto con tiempos', () => {
  const ws = Array.from({ length: 40 }, (_, i) => ({ texto: i === 9 ? 'fin.' : `p${i}`, t: i * 0.5 }))
  const segs = segmentar(ws)
  assert.ok(segs.length >= 2 && segs[0].t === 0)
  assert.ok(segs.every(s => s.texto.length > 0))
  assert.deepEqual(transcriptDeTexto('[00:01.50] hola\n[1:02:03] adiós\nbasura'), [{ t: 1.5, texto: 'hola' }, { t: 3723, texto: 'adiós' }])
  assert.deepEqual(transcriptDeTexto('0.000–44.033 | take-000 | fuente\nAmigos cómo están\nfecha'), [{ t: 0, texto: 'Amigos cómo están' }])
})

test('ids: nunca una ruta del cliente', () => {
  assert.deepEqual(partirId('y/2026-09-22-opus-5-5'), { tipo: 'y', valor: '2026-09-22-opus-5-5' })
  assert.deepEqual(partirId('c/Knsxge39PvA'), { tipo: 'c', valor: 'Knsxge39PvA' })
  for (const malo of ['y/../etc', 'y/a/b', 'x/abc', '', null, 'y/..', 'y/a..b']) assert.equal(partirId(malo), null, String(malo))
})

test('el id de YouTube sale de cualquiera de sus lugares', () => {
  assert.equal(youtubeDe({ data: { launch: { video_id: 'AZ3-JUAEqHM' } } }), 'AZ3-JUAEqHM')
  assert.equal(youtubeDe({ video: { url: 'https://youtu.be/ihZZCCleDKs' } }), 'ihZZCCleDKs')
  assert.equal(youtubeDe({ video: { youtube_id: 'corto' } }), null)
})

test('cotejo carpeta ↔ canal por título y fecha, sin robar videos ya reclamados', () => {
  const canal = [
    { video_id: 'aaaaaaaaaaa', title: 'Claude Code vs Antigravity: cuál usar', published_at: '2026-03-10T18:00:00Z' },
    { video_id: 'bbbbbbbbbbb', title: 'Claude Code vs Antigravity (otra vez)', published_at: '2026-06-01T18:00:00Z' },
  ]
  assert.equal(cotejar('2026-03-08-claude-code-vs-antigravity', canal, new Set())?.video_id, 'aaaaaaaaaaa')
  assert.equal(cotejar('2026-03-08-claude-code-vs-antigravity', canal, new Set(['aaaaaaaaaaa'])), null)
  assert.equal(cotejar('2026-03-08-hermes-explicado', canal, new Set()), null)
})

test('filtros y búsqueda sin acentos', () => {
  const v = (clave: string, post = 'sin-post') => ({ video: { clave, etiqueta: '', tono: 'idle' }, post: { clave: post, etiqueta: '', tono: 'idle' }, titulo: 'Animación con Claude', carpeta: null }) as Parameters<typeof pasaFiltro>[0]
  assert.ok(pasaFiltro(v('cortando'), 'obra'))
  assert.ok(!pasaFiltro(v('publicado'), 'obra'))
  assert.ok(pasaFiltro(v('por-verificar'), 'programados'))
  assert.ok(pasaFiltro(v('publicado', 'pendiente'), 'post'))
  assert.ok(pasaFiltro(v('publicado'), 'todos', 'animacion'))
  assert.ok(!pasaFiltro(v('publicado'), 'todos', 'gpt'))
})

test('finales por nombre y respuesta de la bandeja', () => {
  assert.equal(tipoFinal('final-v1.2.mp4'), 'largo')
  assert.equal(tipoFinal('corto-1-vertical.mp4'), 'vertical')
  assert.equal(tipoFinal('final-N-720p.mp4'), '720p')
  assert.deepEqual(estadoSolicitud({ estado: 'resuelta', respuesta: 'si' }), { estado: 'si', comentario: null })
  assert.deepEqual(estadoSolicitud({ estado: 'pendiente' }), { estado: 'pendiente' })
  assert.deepEqual(estadoSolicitud(null), { estado: 'desconocido' })
})

test('el pedido a Levy dice qué, dónde y repite el freno', () => {
  const t = pedidoALevy('post', { titulo: 'Opus 5.5', carpeta: 'contenido/youtube/proyectos/2026-09-22-opus-5-5', youtube_id: null })
  assert.match(t, /«Opus 5\.5»/); assert.match(t, /publish\.json/); assert.match(t, /no publiques ni postees/)
})

test('un post que el dueño publicó a mano no se marca pendiente', () => {
  const publicado = { clave: 'publicado' as const, etiqueta: 'Publicado', tono: 'live' as const }
  assert.equal(estadoPost({ data: { launch: { post_status: 'manual-por-daniel' }, post_draft: { body: 'x' } } }, publicado, true).clave, 'sin-registro')
})
