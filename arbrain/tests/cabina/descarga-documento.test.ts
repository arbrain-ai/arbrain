// «Descargar» del visor (12 nov 2026, lib/cabina/descarga-documento.ts): el endpoint sirve el ORIGINAL como adjunto, en
// flujo y con Range, solo con su enlace firmado y solo lo que la vista documento ya permite (misma `resolverEnDisco`).
// Corre sobre un repo temporal (nunca el real) pasado como raíces.
process.env.ARBRAIN_DOC_SECRET ??= 'prueba-descarga-documento-0123456789abcdef'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DESCARGABLES, firmarDescarga, servirDescarga, urlDescargaDocumento, verificarDescarga } from '../../src/lib/cabina/descarga-documento'
import { firmarArchivo } from '../../src/lib/archivos-chat-server'
import { rangoPedido } from '../../src/lib/flujo-archivo'
import { decidirCliente } from '../../src/lib/proxy-cliente'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'

let base: string, repo: string, fuera: string
const raices = () => ({ repo, home: join(base, 'home') })
const BYTES = Buffer.alloc(300_000)
for (let i = 0; i < BYTES.length; i++) BYTES[i] = (i * 31 + 7) & 0xff

before(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'descarga-doc-')))
  repo = join(base, 'repo'); fuera = join(base, 'fuera')
  for (const d of [repo, fuera, join(base, 'home'), join(repo, 'videos'), join(repo, '.ssh'), join(repo, 'finanzas'), join(repo, 'carpeta')]) mkdirSync(d, { recursive: true })
  writeFileSync(join(repo, 'videos', 'Clase 3 · Garantía.mp4'), BYTES)
  writeFileSync(join(repo, 'nota.md'), '# Hola\n')
  writeFileSync(join(repo, 'codigo.ts'), 'export {}\n')
  writeFileSync(join(repo, '.ssh', 'video.mp4'), BYTES.subarray(0, 10))
  writeFileSync(join(repo, 'finanzas', 'reporte.pdf'), '%PDF-1.4\n')
  writeFileSync(join(fuera, 'privado.mp4'), BYTES.subarray(0, 10))
  symlinkSync(join(fuera, 'privado.mp4'), join(repo, 'enlace.mp4'))
})
after(() => { rmSync(base, { recursive: true, force: true }) })

/** Pide la descarga como lo haría el navegador con la URL que entrega la vista documento. */
function pedir(url: string, o: { rango?: string; directo?: boolean; ahora?: number } = {}) {
  const [, , , , , token, nombre] = url.split('/')
  return servirDescarga({ token, nombre, rango: o.rango ?? null, directoPrendido: async () => !!o.directo, raices: raices(), ahora: o.ahora })
}
const cuerpo = async (r: Response) => Buffer.from(await r.arrayBuffer())

// ── Permitido ──

test('permitido: el original entero, como adjunto, con su nombre y su tamaño', async () => {
  const real = join(repo, 'videos', 'Clase 3 · Garantía.mp4')
  const url = urlDescargaDocumento(real)
  assert.match(url, /^\/api\/cabina\/documento\/descargar\/[^/]+\/Clase%203%20%C2%B7%20Garant%C3%ADa\.mp4$/)
  const r = await pedir(url)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'video/mp4')
  assert.equal(r.headers.get('content-length'), String(BYTES.length))
  assert.equal(r.headers.get('accept-ranges'), 'bytes')
  const cd = r.headers.get('content-disposition') ?? ''
  assert.match(cd, /^attachment; /)
  assert.match(cd, /filename="Clase 3 _ Garantia\.mp4"/)
  assert.match(cd, /filename\*=UTF-8''Clase%203%20%C2%B7%20Garant%C3%ADa\.mp4/)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.ok((await cuerpo(r)).equals(BYTES), 'los bytes son los del original')
})

test('permitido: un .md se baja tal cual (no la vista pintada)', async () => {
  const r = await pedir(urlDescargaDocumento(join(repo, 'nota.md')))
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-disposition') ?? '', /^attachment; filename="nota\.md"/)
  assert.equal((await cuerpo(r)).toString('utf8'), '# Hola\n')
})

// ── Range ──

test('Range: un tramo da 206 con Content-Range y solo esos bytes', async () => {
  const url = urlDescargaDocumento(join(repo, 'videos', 'Clase 3 · Garantía.mp4'))
  const r = await pedir(url, { rango: 'bytes=1000-1999' })
  assert.equal(r.status, 206)
  assert.equal(r.headers.get('content-range'), `bytes 1000-1999/${BYTES.length}`)
  assert.equal(r.headers.get('content-length'), '1000')
  assert.match(r.headers.get('content-disposition') ?? '', /^attachment; /)
  assert.ok((await cuerpo(r)).equals(BYTES.subarray(1000, 2000)))

  const cola = await pedir(url, { rango: 'bytes=-500' })
  assert.equal(cola.status, 206)
  assert.equal(cola.headers.get('content-range'), `bytes ${BYTES.length - 500}-${BYTES.length - 1}/${BYTES.length}`)
  assert.ok((await cuerpo(cola)).equals(BYTES.subarray(BYTES.length - 500)))

  const resto = await pedir(url, { rango: 'bytes=299990-' })
  assert.equal(resto.status, 206)
  assert.equal((await cuerpo(resto)).length, 10)

  const fuera = await pedir(url, { rango: `bytes=${BYTES.length}-` })
  assert.equal(fuera.status, 416)
  assert.equal(fuera.headers.get('content-range'), `bytes */${BYTES.length}`)
})

test('rangoPedido: formas válidas, imposibles y ausentes', () => {
  assert.deepEqual(rangoPedido('bytes=0-9', 100), { start: 0, end: 9 })
  assert.deepEqual(rangoPedido('bytes=90-500', 100), { start: 90, end: 99 })
  assert.deepEqual(rangoPedido('bytes=-10', 100), { start: 90, end: 99 })
  assert.deepEqual(rangoPedido('bytes=-1000', 100), { start: 0, end: 99 })
  assert.equal(rangoPedido('bytes=100-', 100), 'fuera')
  assert.equal(rangoPedido('bytes=50-10', 100), 'fuera')
  for (const n of [null, '', 'bytes=-', 'items=0-1', 'bytes=0-1,5-6']) assert.equal(rangoPedido(n, 100), null, String(n))
})

// ── Prohibido ──

test('prohibido: sin firma válida no sale nada (alterada, vencida, de otro uso)', async () => {
  const real = join(repo, 'nota.md')
  const url = urlDescargaDocumento(real)
  const [cuerpoT, firma] = url.split('/')[5].split('.')
  const alterada = `${cuerpoT}.${firma.slice(0, -2)}${firma.endsWith('A') ? 'B' : 'A'}A`
  assert.equal((await servirDescarga({ token: alterada, nombre: 'nota.md', rango: null, directoPrendido: async () => false, raices: raices() })).status, 403)
  assert.equal((await pedir(url, { ahora: Date.now() + 13 * 3600_000 })).status, 403, 'vence entre 6 y 12 h')
  // Un enlace del chat (otro prefijo, mismo secreto) no abre la descarga del visor.
  assert.equal((await servirDescarga({ token: firmarArchivo(real), nombre: 'nota.md', rango: null, directoPrendido: async () => false, raices: raices() })).status, 403)
  assert.equal(verificarDescarga(firmarArchivo(real)), null)
  assert.equal(verificarDescarga('basura'), null)
  assert.equal(verificarDescarga(firmarDescarga(real)), real)
})

test('prohibido: el nombre de la URL tiene que ser el del archivo firmado', async () => {
  const token = urlDescargaDocumento(join(repo, 'nota.md')).split('/')[5]
  const r = await servirDescarga({ token, nombre: 'otra-cosa.md', rango: null, directoPrendido: async () => false, raices: raices() })
  assert.equal(r.status, 404)
})

test('prohibido: fuera de las raíces, carpetas de credenciales y enlaces que salen', async () => {
  for (const real of [join(fuera, 'privado.mp4'), join(repo, '.ssh', 'video.mp4'), join(repo, 'enlace.mp4'), '/etc/hosts']) {
    const r = await pedir(urlDescargaDocumento(real))
    assert.equal(r.status, 403, real)
    assert.doesNotMatch(r.headers.get('content-disposition') ?? '', /attachment/, real)
  }
})

test('prohibido: lo que el visor no pinta (código, carpetas) no se descarga', async () => {
  assert.equal((await pedir(urlDescargaDocumento(join(repo, 'codigo.ts')))).status, 403)
  assert.equal((await pedir(urlDescargaDocumento(join(repo, 'carpeta')))).status, 403)
  assert.equal((await pedir(urlDescargaDocumento(join(repo, 'no-existe.mp4')))).status, 404)
  assert.deepEqual([...DESCARGABLES].sort(), ['audio', 'csv', 'docx', 'html', 'imagen', 'md', 'mermaid', 'pdf', 'txt', 'video', 'xlsx'])
})

test('modo directo: con la transmisión prendida, lo sensible no se baja', async () => {
  const url = urlDescargaDocumento(join(repo, 'finanzas', 'reporte.pdf'))
  assert.equal((await pedir(url, { directo: true })).status, 423)
  assert.equal((await pedir(url, { directo: false })).status, 200)
})

// ── Cableado ──

test('la vista documento entrega `descarga` solo para lo que pinta, y la ruta usa la lógica probada', () => {
  const raiz = join(__dirname, '..', '..')
  const doc = readFileSync(join(raiz, 'src/app/api/cabina/documento/route.ts'), 'utf8')
  assert.match(doc, /await planningOwner\(\)[\s\S]*esDescargable\(doc\.tipo\) \? \{ descarga: urlDescargaDocumento\(doc\.real\) \}/)
  const ruta = readFileSync(join(raiz, 'src/app/api/cabina/documento/descargar/[token]/[nombre]/route.ts'), 'utf8')
  assert.match(ruta, /return servirDescarga\(\{ token, nombre, rango: request\.headers\.get\('range'\), directoPrendido:/)
  // El nombre al final puede ser `.png`: el matcher del proxy la mete igual (Host y lista blanca).
  assert.match(readFileSync(join(raiz, 'src/proxy.ts'), 'utf8'), /'\/api\/cabina\/documento\/descargar\/:path\*'/)
})

test('edición cliente: la descarga pasa el proxy sin cookie (la firma es su permiso)', () => {
  const ruta = '/api/cabina/documento/descargar/tok/video.mp4'
  assert.ok(apiPermitidaEnCliente(ruta))
  assert.deepEqual(decidirCliente(ruta, false, false), { tipo: 'pasa' })
  // La que firma sigue pidiendo sesión.
  assert.equal(decidirCliente('/api/cabina/documento', false, false).tipo, 'json')
})
