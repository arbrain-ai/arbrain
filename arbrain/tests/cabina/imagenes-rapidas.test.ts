import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { anchoAceptado, anchoVariante, esOptimizable, esStorageOptimizable, pxNecesarios, srcSetDe, urlVariante } from '../../src/lib/imagenes/variantes'

const cache = mkdtempSync(path.join(tmpdir(), 'arbrain-img-cache-'))
process.env.ARBRAIN_IMG_CACHE = cache

test('ancho de variante: escalón que cubre, nunca más que el original', () => {
  assert.equal(anchoVariante(700, 3192), 800)
  assert.equal(anchoVariante(1400, 3192), 1600)
  assert.equal(anchoVariante(800, 3192), 800)
  assert.equal(anchoVariante(3000, 3192), 3192)
  assert.equal(anchoVariante(5000, 3192), 3192)
  assert.equal(anchoVariante(500, 600), 600) // 640 pasaría del original: el original
  assert.equal(anchoVariante(0.4, 3192), 160)
})

test('el servidor solo acepta escalones menores que el original, o el original', () => {
  assert.ok(anchoAceptado(800, 3192))
  assert.ok(anchoAceptado(3192, 3192))
  assert.ok(!anchoAceptado(801, 3192))
  assert.ok(!anchoAceptado(3840, 3192))
})

test('srcset de densidad 1x y 2x; una sola entrada si ambas caen en el original', () => {
  const meta = { hash: 'a'.repeat(32), ancho: 3192 }
  assert.equal(srcSetDe(meta, 700, 'avif'), `${urlVariante(meta.hash, 800, 'avif')} 1x, ${urlVariante(meta.hash, 1600, 'avif')} 2x`)
  assert.equal(srcSetDe({ ...meta, ancho: 500 }, 600, 'webp'), `/api/imagen/${meta.hash}/500.webp 1x`)
})

test('cover cubre el alto de la caja según la proporción; contain solo el ancho', () => {
  assert.equal(pxNecesarios({ ancho: 128, alto: 128 }, { ancho: 1600, alto: 900 }, 'cover'), 128 * 1600 / 900)
  assert.equal(pxNecesarios({ ancho: 128, alto: 128 }, { ancho: 1600, alto: 900 }, 'contain'), 128)
})

test('qué se optimiza: fotos y láminas sí; GIF, SVG y URLs ajenas no', () => {
  assert.deepEqual(['a.PNG', 'b.jpg', 'c.webp', 'd.gif', 'e.svg', 'f.txt'].map(esOptimizable), [true, true, true, false, false, false])
  assert.ok(esStorageOptimizable('https://x.supabase.co/storage/v1/object/public/chat/chat-1-abc-foto.jpg'))
  assert.ok(esStorageOptimizable('http://127.0.0.1:8000/storage/v1/object/public/chat/a.png'))
  assert.ok(!esStorageOptimizable('https://i.ytimg.com/vi/x/hqdefault.jpg'))
  assert.ok(!esStorageOptimizable('https://x.supabase.co/storage/v1/object/public/chat/a.gif'))
  assert.ok(!esStorageOptimizable(undefined))
})

test('Storage permitido: Studio y Supabase; nunca una URL cualquiera (SSRF)', async () => {
  const { urlDeStoragePermitida } = await import('../../src/lib/imagenes/optimizar')
  assert.ok(urlDeStoragePermitida('http://127.0.0.1:8000/storage/v1/object/public/chat/a.png'))
  assert.ok(urlDeStoragePermitida('https://abc.supabase.co/storage/v1/object/public/chat/a.png'))
  // El Storage propio sale de la configuración (o de la variable): aquí uno ficticio, sin el host de nadie.
  const antes = process.env.NEXT_PUBLIC_MC_STORAGE_PUBLIC_URL
  process.env.NEXT_PUBLIC_MC_STORAGE_PUBLIC_URL = 'https://estudio.ejemplo.ts.net:10000'
  try {
    assert.ok(urlDeStoragePermitida('https://estudio.ejemplo.ts.net:10000/storage/v1/object/public/chat/a.png'))
  } finally {
    if (antes === undefined) delete process.env.NEXT_PUBLIC_MC_STORAGE_PUBLIC_URL
    else process.env.NEXT_PUBLIC_MC_STORAGE_PUBLIC_URL = antes
  }
  assert.ok(!urlDeStoragePermitida('http://127.0.0.1:3300/storage/v1/object/public/chat/a.png'))
  assert.ok(!urlDeStoragePermitida('https://evil.com/storage/v1/object/public/a.png'))
  assert.ok(!urlDeStoragePermitida('https://abc.supabase.co.evil.com/storage/v1/object/public/a.png'))
  assert.ok(!urlDeStoragePermitida('https://abc.supabase.co/storage/v1/object/sign/a.png'))
})

test('pipeline: ficha por hash de contenido, variante AVIF en disco una vez, y el archivo cambiado ya no se sirve', async () => {
  const { registrarArchivo, variante } = await import('../../src/lib/imagenes/optimizar')
  const dir = mkdtempSync(path.join(tmpdir(), 'arbrain-img-src-'))
  const archivo = path.join(dir, 'lamina.png')
  writeFileSync(archivo, await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 40, b: 10 } } }).png().toBuffer())

  const meta = await registrarArchivo(archivo)
  assert.ok(meta)
  assert.match(meta.hash, /^[0-9a-f]{32}$/)
  assert.equal(meta.ancho, 1200)
  assert.equal(meta.alto, 800)
  assert.match(meta.color, /^#[0-9a-f]{6}$/)
  assert.ok(meta.placeholder.startsWith('data:image/webp;base64,') && meta.placeholder.length < 1000)
  assert.equal(await registrarArchivo(archivo), meta, 'segunda vez: de memoria')

  const ruta = await variante(meta.hash, 640, 'avif')
  assert.ok(ruta)
  const salida = await sharp(ruta).metadata()
  assert.equal(salida.width, 640)
  assert.equal(salida.format, 'heif')
  const mtime = statSync(ruta).mtimeMs
  assert.equal(await variante(meta.hash, 640, 'avif'), ruta)
  assert.equal(statSync(ruta).mtimeMs, mtime, 'no se regenera')
  assert.ok(await variante(meta.hash, 1200, 'webp'), 'el original como tope')

  assert.equal(await variante(meta.hash, 700, 'avif'), null, 'ancho fuera de escalón')
  assert.equal(await variante(meta.hash, 1600, 'avif'), null, 'nunca agrandar')
  assert.equal(await variante('f'.repeat(32), 640, 'avif'), null, 'hash desconocido')
  assert.equal(await variante('../../etc', 640, 'avif'), null, 'hash inválido')

  // Levy regenera la lámina: la URL vieja no genera variantes nuevas del contenido nuevo.
  writeFileSync(archivo, await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer())
  assert.equal(await variante(meta.hash, 320, 'avif'), null)
  const nueva = await registrarArchivo(archivo)
  assert.ok(nueva && nueva.hash !== meta.hash)
  assert.deepEqual(readdirSync(path.join(cache, meta.hash)).sort(), ['1200.webp', '640.avif', 'meta.json'])
})

test('GIF y SVG no se registran: se sirven tal cual', async () => {
  const { registrarArchivo } = await import('../../src/lib/imagenes/optimizar')
  const dir = mkdtempSync(path.join(tmpdir(), 'arbrain-img-src-'))
  writeFileSync(path.join(dir, 'a.gif'), 'GIF89a')
  assert.equal(await registrarArchivo(path.join(dir, 'a.gif')), null)
})
