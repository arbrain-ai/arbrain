// Galería de videos · el lector del disco sobre un cerebro de mentira: rejilla, ficha, cotejo con el canal y escritura
// del borrador (solo publish.json, editar retira la aprobación, revisión vieja = conflicto). Leer nunca escribe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { candidatas, carpetaDeId, dentro, escribirBorrador, guardarSolicitud, leerFicha, leerGaleria, reflejarRespuesta } from '../../src/features/editor/galeria/lector'

function cerebro() {
  const R = mkdtempSync(path.join(tmpdir(), 'galeria-'))
  const P = path.join(R, 'contenido', 'youtube', 'proyectos')
  const a = path.join(P, '2026-09-22-opus-5-5')
  mkdirSync(path.join(a, 'thumbnails', 'v2'), { recursive: true }); mkdirSync(path.join(a, 'renders'), { recursive: true })
  writeFileSync(path.join(a, 'thumbnails', 'v2', '1-portada.png'), 'png'); writeFileSync(path.join(a, 'thumbnails', 'ref-estilo.webp'), 'ref')
  writeFileSync(path.join(a, 'renders', 'final-v1.mp4'), 'mp4'); writeFileSync(path.join(a, 'renders', 'corto-1-vertical.mp4'), 'mp4')
  writeFileSync(path.join(a, 'publish.json'), JSON.stringify({
    video: { titulo: 'NUEVO Opus 5.5', youtube_id: 'Knsxge39PvA' },
    data: { metadata: { titles: ['NUEVO Opus 5.5', 'Otro título'], description: 'Hola\n\n0:00 Inicio\n1:00 Prueba', keywords: ['opus'] },
      thumbnail: { chosen: 'thumbnails/v2/1-portada.png' }, link: { url: 'https://x.so/opus55', verified: true, status: 307 },
      launch: { publish_at: '2026-09-23T01:00:00Z' } },
  }))
  writeFileSync(path.join(a, 'post-comunidad.md'), '## El post\n\nComunidad!\n> nota\n')
  writeFileSync(path.join(a, 'words_out.json'), JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ type: 'word', text: `w${i}`, start: i * 0.4, end: i * 0.4 + 0.3 }))))
  const b = path.join(P, '2026-03-08-claude-code-vs-antigravity'); mkdirSync(b); writeFileSync(path.join(b, 'visual-plan.md'), '# plan')
  mkdirSync(path.join(P, '2026-08-27-test-edicion'))
  const V = path.join(R, 'contenido', 'youtube', 'videos'); mkdirSync(path.join(V, 'sin-publish'), { recursive: true })
  return { R, a }
}
const CANAL = [
  { video_id: 'Knsxge39PvA', title: 'NUEVO Opus 5.5', published_at: '2026-09-23T01:00:00Z', views: 1000, duration_seconds: 900 },
  { video_id: 'aaaaaaaaaaa', title: 'Claude Code vs Antigravity', published_at: '2026-03-10T18:00:00Z', views: 50, duration_seconds: 700 },
  { video_id: 'ccccccccccc', title: 'Solo en el canal', published_at: '2026-10-01T18:00:00Z', views: 5, duration_seconds: 600 },
  { video_id: 'sssssssssss', title: 'Un short', published_at: '2026-10-02T18:00:00Z', views: 5, duration_seconds: 40 },
]

test('la rejilla junta carpetas y canal, deja fuera laboratorios y shorts, y no escribe nada', async () => {
  const { R, a } = cerebro()
  const antes = readdirSync(a).sort()
  const g = await leerGaleria(R, CANAL)
  assert.deepEqual(g.videos.map(v => v.id).sort(), ['c/ccccccccccc', 'y/2026-03-08-claude-code-vs-antigravity', 'y/2026-09-22-opus-5-5'])
  const opus = g.videos.find(v => v.id === 'y/2026-09-22-opus-5-5')!
  assert.equal(opus.video.clave, 'publicado'); assert.equal(opus.portada_de, 'elegida'); assert.equal(opus.vistas, 1000)
  const cotejado = g.videos.find(v => v.id.includes('antigravity'))!
  assert.equal(cotejado.youtube_id, 'aaaaaaaaaaa'); assert.equal(cotejado.video.clave, 'publicado'); assert.match(cotejado.portada!, /&yt=aaaaaaaaaaa$/)
  assert.match(g.avisos.join(' '), /1 carpetas de laboratorio/)
  assert.deepEqual(readdirSync(a).sort(), antes)
})

test('sin lectura del canal lo dice y no inventa publicados', async () => {
  const { R } = cerebro()
  const g = await leerGaleria(R, null)
  assert.equal(g.fuentes.canal, null)
  assert.match(g.avisos[0], /Sin lectura del canal/)
  assert.equal(g.videos.find(v => v.id.includes('antigravity'))!.video.clave, 'guion')
})

test('la ficha trae todo lo que hay y marca los huecos', async () => {
  const { R } = cerebro()
  const f = (await leerFicha(R, 'y/2026-09-22-opus-5-5', CANAL))!
  assert.equal(f.titulos[0].elegido, true); assert.equal(f.titulos.length, 2)
  assert.equal(f.capitulos.length, 2); assert.equal(f.link?.verificado, true)
  assert.equal(f.transcript?.corte, 'final'); assert.equal(f.transcript?.palabras, 30)
  assert.equal(f.borrador.cuerpo, 'Comunidad!'); assert.equal(f.borrador.editable, true)
  assert.deepEqual(f.finales.map(x => x.tipo), ['largo', 'vertical'])
  assert.deepEqual(f.candidatas.map(c => c.nombre), ['thumbnails/v2/1-portada.png'])
  assert.deepEqual(f.huecos, [])
  const vacia = (await leerFicha(R, 'c/ccccccccccc', CANAL))!
  assert.ok(vacia.huecos.includes('descripcion') && vacia.huecos.includes('transcript'))
  assert.equal(await leerFicha(R, 'y/../../etc', CANAL), null)
})

test('el borrador se guarda en publish.json; editar retira la aprobación; revisión vieja choca', async () => {
  const { R, a } = cerebro()
  const f = (await leerFicha(R, 'y/2026-09-22-opus-5-5', CANAL))!
  const r1 = await escribirBorrador(R, f.id, 'Texto nuevo', f.revision)
  assert.deepEqual(r1.cambios, ['post editado'])
  await guardarSolicitud(R, f.id, 'aprobar_post', { id: 'cf_0123456789ab', pedida: '2026-11-19T10:00:00Z', estado: 'pendiente' })
  await reflejarRespuesta(R, f.id, 'aprobar_post', 'si')
  let pub = JSON.parse(readFileSync(path.join(a, 'publish.json'), 'utf8'))
  assert.ok(pub.data.post_draft.approved_at); assert.equal(pub.data.galeria.aprobar_post.estado, 'si')
  assert.equal(pub.data.post_published_at, undefined, 'aprobar nunca publica')
  await assert.rejects(escribirBorrador(R, f.id, 'otro', f.revision), /cambió/)
  const r2 = await escribirBorrador(R, f.id, 'Texto editado')
  assert.match(r2.cambios[0], /aprobación retirada/)
  pub = JSON.parse(readFileSync(path.join(a, 'publish.json'), 'utf8'))
  assert.equal(pub.data.post_draft.approved_at, null); assert.equal(pub.data.galeria.aprobar_post, undefined)
  await assert.rejects(escribirBorrador(R, 'y/2026-03-08-claude-code-vs-antigravity', 'x'), /no tiene publish\.json/)
})

test('rutas: candidatas sin referencias y nada fuera de la carpeta', async () => {
  const { R, a } = cerebro()
  assert.deepEqual(await candidatas(a), ['thumbnails/v2/1-portada.png'])
  assert.equal(dentro(a, '../publish.json'), null); assert.equal(dentro(a, '/etc/passwd'), null)
  assert.equal(carpetaDeId(R, 'c/Knsxge39PvA'), null)
})

test('los proyectos del motor entran con su estado; motor caído se dice', async () => {
  const { estadoMotor } = await import('../../src/features/editor/galeria/motor')
  const { fichaMotor } = await import('../../src/features/editor/galeria/lector')
  const p = { id: 'prj_4c0k16x0k60f', name: 'toma 26 sep', mediaCount: 2, pendingChanges: 1, poster: { mediaId: 'med_x', time: 2 }, activity: [] }
  assert.equal(estadoMotor(p).clave, 'revisar')
  assert.equal(estadoMotor({ ...p, activity: [{ kind: 'editing', count: 1 }] }).clave, 'cortando')
  assert.equal(estadoMotor({ ...p, pendingChanges: 0 }).clave, 'grabado')
  const { R } = cerebro()
  const g = await leerGaleria(R, CANAL, new Date(), [p])
  const m = g.videos.find(v => v.id === 'm/prj_4c0k16x0k60f')!
  assert.equal(m.origen, 'motor'); assert.equal(m.portada_de, 'cuadro'); assert.equal(g.fuentes.motor, 1)
  assert.match((await leerGaleria(R, CANAL, new Date(), null)).avisos.join(' '), /motor de edición no respondió/)
  assert.ok(fichaMotor(p).huecos.includes('descripcion'))
})
