// Miniaturas bajo la barra del visor de video (8 nov 2026, Daniel: «ver la miniatura del frame abajo, justo como YT»).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { argsMiniaturas, celdaDeMiniatura, planMiniaturas } from '../../src/features/cabina/documento/medio'
import { claveMiniaturas, esperarMiniaturas, estadoMiniaturas, hojaMiniaturas } from '../../src/lib/cabina/miniaturas-video'

test('plan: un fotograma cada 1/2/5/10 s según la duración, en cuadrícula de 10 columnas', () => {
  assert.deepEqual(planMiniaturas(60, 16 / 9), { cada: 1, n: 61, cols: 10, filas: 7, ancho: 160, alto: 90 })
  assert.equal(planMiniaturas(300, 16 / 9)!.cada, 2)
  const largo = planMiniaturas(821.7, 16 / 9)!          // el video de 13:41 de Daniel
  assert.deepEqual(largo, { cada: 5, n: 165, cols: 10, filas: 17, ancho: 160, alto: 90 })
  assert.equal(planMiniaturas(3600, 16 / 9)!.cada, 10)
  // La hoja siempre tiene lugar para todas las miniaturas.
  for (const d of [3, 59, 120, 121, 600, 601, 1800, 1801, 7200]) { const p = planMiniaturas(d, 16 / 9)!; assert.ok(p.cols * p.filas >= p.n, `duración ${d}`) }
})

test('plan: la proporción del video manda (vertical 9:16, cuadrado) y las medidas son pares', () => {
  assert.deepEqual([planMiniaturas(30, 9 / 16)!.ancho, planMiniaturas(30, 9 / 16)!.alto], [90, 160])
  assert.deepEqual([planMiniaturas(30, 1)!.ancho, planMiniaturas(30, 1)!.alto], [90, 90])
  for (const p of [16 / 9, 4 / 3, 21 / 9, 9 / 16, 1.0123]) { const x = planMiniaturas(30, p)!; assert.equal(x.ancho % 2, 0); assert.equal(x.alto % 2, 0) }
})

test('plan: sin duración legible no hay plan; con una pieza no se inventan columnas', () => {
  assert.equal(planMiniaturas(0, 16 / 9), null)
  assert.equal(planMiniaturas(NaN, 16 / 9), null)
  const una = planMiniaturas(0.4, 16 / 9)!
  assert.deepEqual([una.n, una.cols, una.filas], [1, 1, 1])
})

test('celda: el instante cae en su miniatura y el final usa la última', () => {
  const p = planMiniaturas(821.7, 16 / 9)!
  assert.deepEqual(celdaDeMiniatura(p, 0), { indice: 0, col: 0, fila: 0 })
  assert.deepEqual(celdaDeMiniatura(p, 4.99), { indice: 0, col: 0, fila: 0 })
  assert.deepEqual(celdaDeMiniatura(p, 5), { indice: 1, col: 1, fila: 0 })
  assert.deepEqual(celdaDeMiniatura(p, 281), { indice: 56, col: 6, fila: 5 })   // 4:41, donde estaba el video de la captura
  assert.deepEqual(celdaDeMiniatura(p, 821.7), { indice: 164, col: 4, fila: 16 })
  assert.deepEqual(celdaDeMiniatura(p, 99999), { indice: 164, col: 4, fila: 16 })
  assert.deepEqual(celdaDeMiniatura(p, -3), { indice: 0, col: 0, fila: 0 })
})

test('ffmpeg: una sola pasada, sin shell (la ruta va como argumento) y con el tamaño del plan', () => {
  const p = planMiniaturas(821.7, 16 / 9)!
  const a = argsMiniaturas('/ruta con espacios/v ideo.mp4', '/tmp/x.jpg', p)
  assert.equal(a[a.indexOf('-i') + 1], '/ruta con espacios/v ideo.mp4')
  assert.equal(a.at(-1), '/tmp/x.jpg')
  assert.match(a[a.indexOf('-vf') + 1], /^fps=1\/5,scale=160:90:flags=bilinear,tile=10x17$/)
  assert.ok(a.includes('-nostdin') && a.includes('-an'))
})

// ── Generación real con ffmpeg (se omite si el equipo no lo tiene) ──
const FFMPEG = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find(p => existsSync(p))
let dir = '', video = ''
before(() => {
  if (!FFMPEG) return
  dir = mkdtempSync(join(tmpdir(), 'miniaturas-'))
  process.env.ARBRAIN_MINIATURAS_DIR = join(dir, 'hojas')
  video = join(dir, 'prueba.mp4')
  // 7 s de patrón de prueba a 320×180: con 1 fotograma por segundo salen 8 miniaturas (2 filas de 8 columnas… tope 10).
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=7', '-pix_fmt', 'yuv420p', video])
})
after(() => { delete process.env.ARBRAIN_MINIATURAS_DIR; if (dir) rmSync(dir, { recursive: true, force: true }) })

test('genera la hoja de verdad: pasa de «generando» a «lista» y entrega un JPEG', { skip: !FFMPEG && 'sin ffmpeg en este equipo' }, async () => {
  const info = statSync(video)
  const sondar = async () => ({ duracion: 7, ancho: 320, alto: 180 })
  const primero = await estadoMiniaturas(video, info, sondar)
  assert.equal(primero.estado, 'generando')
  assert.equal((await estadoMiniaturas(video, info, sondar)).estado, 'generando')   // la segunda petición no lanza otro ffmpeg
  await esperarMiniaturas()
  const listo = await estadoMiniaturas(video, info, sondar)
  assert.equal(listo.estado, 'lista')
  if (listo.estado !== 'lista') return
  assert.deepEqual([listo.cada, listo.n, listo.cols, listo.filas, listo.ancho, listo.alto], [1, 8, 8, 1, 160, 90])
  assert.equal(listo.clave, claveMiniaturas(video, info))
  const hoja = await hojaMiniaturas(video, info)
  assert.ok(hoja && hoja.byteLength > 1000)
  assert.deepEqual([...hoja!.subarray(0, 3)], [0xff, 0xd8, 0xff])                   // JPEG
})

test('si el video cambia (otro tamaño o mtime), la hoja anterior no vale', { skip: !FFMPEG && 'sin ffmpeg en este equipo' }, () => {
  const info = statSync(video)
  assert.notEqual(claveMiniaturas(video, info), claveMiniaturas(video, { size: info.size + 1, mtimeMs: info.mtimeMs }))
  assert.notEqual(claveMiniaturas(video, info), claveMiniaturas(video, { size: info.size, mtimeMs: info.mtimeMs + 1 }))
})

test('un archivo que ffmpeg no puede leer da «error» (y no se reintenta a cada pasada), sin romper nada', { skip: !FFMPEG && 'sin ffmpeg en este equipo' }, async () => {
  const roto = join(dir, 'roto.mp4')
  writeFileSync(roto, 'esto no es un video')
  const info = statSync(roto)
  const sondar = async () => ({ duracion: 5, ancho: 320, alto: 180 })
  assert.equal((await estadoMiniaturas(roto, info, sondar)).estado, 'generando')
  await esperarMiniaturas()
  const e = await estadoMiniaturas(roto, info, sondar)
  assert.equal(e.estado, 'error')                      // y sigue en «error»: no vuelve a lanzar ffmpeg a cada pasada
  assert.equal((await estadoMiniaturas(roto, info, sondar)).estado, 'error')
  assert.equal(await hojaMiniaturas(roto, info), null)
})
