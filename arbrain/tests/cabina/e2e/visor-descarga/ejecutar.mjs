// «Descargar» del visor (12 nov 2026, Daniel: «me dejas un botón para "download" por si lo veo en la laptop o teléfono»).
//   node tests/cabina/e2e/visor-descarga/ejecutar.mjs [carpeta de salida] [--grande-mb 700]      (desde arbrain/)
// La API es la de verdad (documento, crudo y descargar, compiladas para node con el dueño simulado), servida por http local.
// Playwright WebKit (el motor del iPhone y del WKWebView de la app de escritorio):
//   1. capturas del botón en el teléfono (iPhone 13, 390 px, hilo) y en escritorio (pestaña del panel, 1280 px) para video,
//      .md, imagen y audio;
//   2. clic real en «Descargar» en el navegador: llega una descarga con el nombre original y los mismos bytes;
//   3. clic en la app de escritorio simulada (Tauri): no navega ni descarga en el WebView, pide al opener la URL completa;
//   4. `curl -OJ` de un archivo grande (700 MB por defecto) por el enlace que entrega la vista, midiendo la memoria del servidor;
//   5. `curl` con Range y con un enlace alterado.
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, statSync, createReadStream, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const args = process.argv.slice(2)
const iMb = args.indexOf('--grande-mb'), GRANDE_MB = iMb >= 0 ? Number(args[iMb + 1]) : 700
const pos = args.filter((a, i) => iMb < 0 || (i !== iMb && i !== iMb + 1))
const SALIDA = resolve(pos[0] ?? join(tmpdir(), 'capturas-visor-descarga')); mkdirSync(SALIDA, { recursive: true })
process.env.ARBRAIN_DOC_SECRET ??= 'arnes-visor-descarga-0123456789abcdef'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const PW = process.env.PLAYWRIGHT_CORE ?? execFileSync('sh', ['-c', `for d in ~/.npm/_npx/*/node_modules/playwright-core; do r=$(node -e "console.log(require('$d/browsers.json').browsers.find(b=>b.name==='webkit').revision)"); [ -d ~/Library/Caches/ms-playwright/webkit-$r ] && echo $d && break; done`]).toString().trim()
const { webkit, devices } = createRequire(import.meta.url)(PW)
const dist = mkdtempSync(join(tmpdir(), 'visor-descarga-e2e-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)
const mb = n => `${(n / 1048576).toFixed(1)} MB`

// ── Los archivos (en /tmp, que la vista documento permite) ──
const CARPETA = '/tmp/visor-descarga-e2e'; mkdirSync(CARPETA, { recursive: true })
const VIDEO = join(CARPETA, 'Clase 3 · La garantía.mp4')
if (!existsSync(VIDEO)) execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-shortest', '-pix_fmt', 'yuv420p', VIDEO])
const AUDIO = join(CARPETA, 'nota de voz.m4a')
if (!existsSync(AUDIO)) execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=8', AUDIO])
const IMAGEN = join(CARPETA, 'lámina.png')
if (!existsSync(IMAGEN)) execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1200x800', '-frames:v', '1', IMAGEN])
const MD = join(CARPETA, 'Guion de la clase.md')
writeFileSync(MD, '# Guion de la clase\n\nLa garantía no es un riesgo: es la promesa medida.\n\n- Qué prometes\n- Cómo lo mides\n- Qué pasa si no llega\n')
const PDF = join(CARPETA, 'Propuesta.pdf')
{ // Un PDF mínimo válido de una página (con su tabla xref calculada).
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const flujo = 'BT /F1 28 Tf 72 700 Td (Propuesta de la clase) Tj ET'
  objs[3] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`
  let out = '%PDF-1.4\n'; const pos = []
  objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  writeFileSync(PDF, out)
}
const HTML = join(CARPETA, 'Lámina viva.html')
writeFileSync(HTML, '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;font:600 32px system-ui;background:#1d1726;color:#fff">Lámina viva</body>')
// El grande: bytes aleatorios (no se reproduce, solo se baja) del tamaño del video de Daniel.
const GRANDE = join(CARPETA, 'Grabación larga 700MB.mp4')
if (!existsSync(GRANDE) || statSync(GRANDE).size !== GRANDE_MB * 1048576) execFileSync('dd', ['if=/dev/urandom', `of=${GRANDE}`, 'bs=1048576', `count=${GRANDE_MB}`], { stdio: 'ignore' })
const sha = f => new Promise((ok, mal) => { const h = createHash('sha256'); createReadStream(f).on('data', c => h.update(c)).on('end', () => ok(h.digest('hex'))).on('error', mal) })

// ── El cliente ──
execFileSync(ESBUILD, [join(aqui, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', '--loader:.woff2=empty', '--loader:.woff=empty', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(aqui, 'runtime-stub.ts')}`,
  `--alias:next/navigation=${join(raiz, 'tests/cabina/e2e/visor-carpeta/navegacion-stub.ts')}`, `--alias:next/link=${join(raiz, 'tests/cabina/e2e/visor-carpeta/enlace-stub.tsx')}`,
  `--alias:pdfjs-dist/webpack.mjs=${join(aqui, 'pdfjs-stub.ts')}`,
  '--define:process.env.NODE_ENV="development"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
const postcss = (await import(join(raiz, 'node_modules/postcss/lib/postcss.js'))).default
const tailwind = (await import(join(raiz, 'node_modules/@tailwindcss/postcss/dist/index.mjs'))).default
const globales = join(raiz, 'src/app/globals.css')
writeFileSync(join(dist, 'tailwind.css'), (await postcss([tailwind()]).process(readFileSync(globales, 'utf8'), { from: globales })).css)

// ── La API real, para node: el dueño ya verificado ──
const stubs = join(dist, 'stubs'); mkdirSync(stubs)
writeFileSync(join(stubs, 'planning.ts'), `export const planningOwner = async () => 'dueno'\nexport const planningError = (e: unknown) => Response.json({ error: String(e) }, { status: 500 })\nexport const checkMutationOrigin = () => {}\n`)
writeFileSync(join(stubs, 'optimizar.ts'), `export const registrarArchivo = async (_: string) => null\n`)
writeFileSync(join(stubs, 'vacio.ts'), `export {}\n`)
// Modo directo apagado (su lector habla con el daemon por claudeclaw/Supabase; las pruebas unitarias cubren el veto).
writeFileSync(join(stubs, 'directo.ts'), `export const estadoDirecto = async () => ({ prendido: false, velo: null })\nexport const directoPrendido = async () => false\nexport const respuestaOculta = (q: string) => Response.json({ error: q }, { status: 423 })\n`)
writeFileSync(join(stubs, 'servidor.ts'), [
  `export * as documento from ${JSON.stringify(join(raiz, 'src/app/api/cabina/documento/route.ts'))}`,
  `export * as crudo from ${JSON.stringify(join(raiz, 'src/app/api/cabina/documento/crudo/[token]/[...ruta]/route.ts'))}`,
  `export * as descargar from ${JSON.stringify(join(raiz, 'src/app/api/cabina/documento/descargar/[token]/[nombre]/route.ts'))}`, ''].join('\n'))
execFileSync(ESBUILD, [join(stubs, 'servidor.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${join(dist, 'servidor.mjs')}`, `--tsconfig=${join(raiz, 'tsconfig.json')}`,
  `--alias:@/lib/planning/server=${join(stubs, 'planning.ts')}`, `--alias:@/lib/imagenes/optimizar=${join(stubs, 'optimizar.ts')}`, `--alias:server-only=${join(stubs, 'vacio.ts')}`, `--alias:@/lib/modo-directo/servidor=${join(stubs, 'directo.ts')}`,
  '--packages=external', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
const api = await import(pathToFileURL(join(dist, 'servidor.mjs')).href)

const TOKENS = `:root{--background:#faf8fc;--surface:#fff;--card:#fff;--foreground:#1d1726;--muted:#7a7088;--border:#e7e1ef;--brand:#7c3aed;--brand-rgb:124,58,237;--gold-rgb:245,158,11}
body{margin:0;background:var(--background);color:var(--foreground);font:14px system-ui}`
const PAGINA = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style><div id="raiz"></div><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/entrada.css"><script src="/entrada.js"></script>`

let picoRss = 0
const servidor = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1'), p = decodeURIComponent(u.pathname)
  try {
    if (p === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA)
    if (u.pathname === '/api/cabina/documento' || u.pathname.startsWith('/api/cabina/documento/crudo/') || u.pathname.startsWith('/api/cabina/documento/descargar/')) {
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers })
      let r
      if (u.pathname.startsWith('/api/cabina/documento/crudo/')) {
        const [token, ...ruta] = u.pathname.slice('/api/cabina/documento/crudo/'.length).split('/')
        r = await api.crudo.GET(request, { params: Promise.resolve({ token, ruta }) })
      } else if (u.pathname.startsWith('/api/cabina/documento/descargar/')) {
        // Next entrega los segmentos dinámicos ya decodificados; aquí igual.
        const [token, nombre] = u.pathname.slice('/api/cabina/documento/descargar/'.length).split('/')
        r = await api.descargar.GET(request, { params: Promise.resolve({ token, nombre: decodeURIComponent(nombre ?? '') }) })
      } else r = await api.documento.GET(request)
      res.writeHead(r.status, Object.fromEntries(r.headers))
      if (r.body) { for await (const c of r.body) { picoRss = Math.max(picoRss, process.memoryUsage().rss); if (!res.write(c)) await new Promise(ok => res.once('drain', ok)) } }
      return res.end()
    }
    if (p === '/pdf.worker.mjs') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(join(raiz, 'node_modules/pdfjs-dist/build/pdf.worker.mjs')))
    if (p.startsWith('/api/')) return res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    const f = join(dist, p); if (existsSync(f)) return res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f))
    res.writeHead(404).end()
  } catch (e) { if (!res.headersSent) res.writeHead(500).end(String(e)); else res.end() }
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`
const leerDoc = async ruta => (await fetch(`${BASE}/api/cabina/documento?ruta=${encodeURIComponent(ruta)}`)).json()
/** curl de verdad, sin bloquear el servidor (vive en este mismo proceso). */
const curl = (argv, cwd) => new Promise((ok, mal) => {
  const c = spawn('curl', argv, { cwd }); let out = '', err = ''
  c.stdout.on('data', d => { out += d }); c.stderr.on('data', d => { err += d })
  c.on('close', code => code === 0 ? ok(out) : mal(new Error(`curl ${code}: ${err}`)))
})
setTimeout(() => { console.log('TIEMPO AGOTADO'); process.exit(2) }, 600_000).unref()

const resumen = {}

// ── 4 y 5. curl ──
const docGrande = await leerDoc(GRANDE)
assert.ok(docGrande.descarga?.startsWith('/api/cabina/documento/descargar/'), 'la vista entrega el enlace de descarga')
const destino = mkdtempSync(join(tmpdir(), 'curl-OJ-'))
const rssAntes = process.memoryUsage().rss; picoRss = rssAntes
const t0 = Date.now()
const cabeceras = await curl(['-sS', '-OJ', '-D', '-', `${BASE}${docGrande.descarga}`], destino)
const seg = (Date.now() - t0) / 1000
// curl -J usa el `filename=` ASCII (no lee `filename*` UTF-8, que es el que usan los navegadores): «Grabacion», sin acento.
const bajado = join(destino, 'Grabacion larga 700MB.mp4')
assert.ok(existsSync(bajado), `curl -OJ guardó con el nombre de Content-Disposition (en ${destino})`)
assert.equal(statSync(bajado).size, statSync(GRANDE).size)
const [h1, h2] = await Promise.all([sha(GRANDE), sha(bajado)])
assert.equal(h1, h2, 'mismos bytes que el original')
resumen.curl = { archivo: bajado, bytes: statSync(bajado).size, segundos: seg, MBs: Math.round(statSync(bajado).size / 1048576 / seg), rssAntes: mb(rssAntes), rssPico: mb(picoRss), crecimientoRss: mb(picoRss - rssAntes), sha256: h1, cabeceras: cabeceras.trim().split(/\r?\n/) }
log('curl -OJ', resumen.curl.bytes, 'bytes en', seg.toFixed(1), 's · RSS', resumen.curl.rssAntes, '→ pico', resumen.curl.rssPico)
assert.ok(picoRss - rssAntes < 200 * 1048576, `el servidor no carga el archivo en memoria (creció ${mb(picoRss - rssAntes)} para ${mb(statSync(GRANDE).size)})`)
const tramo = await curl(['-sS', '-D', '-', '-o', '/dev/null', '-H', 'Range: bytes=1048576-2097151', `${BASE}${docGrande.descarga}`])
assert.match(tramo, /^HTTP\/1\.1 206/); assert.match(tramo, new RegExp(`content-range: bytes 1048576-2097151/${statSync(GRANDE).size}`, 'i'))
const alterado = docGrande.descarga.replace(/\.([A-Za-z0-9_-])/, (_, c) => '.' + (c === 'A' ? 'B' : 'A'))
const malo = await curl(['-sS', '-D', '-', '-o', '/dev/null', `${BASE}${alterado}`])
assert.match(malo, /^HTTP\/1\.1 403/)
resumen.range = tramo.trim().split(/\r?\n/); resumen.alterado = malo.split(/\r?\n/)[0]

// ── 1, 2 y 3. WebKit ──
const navegador = await webkit.launch()
const CASOS = {
  telefono: { modo: 'hilo', ctx: { ...devices['iPhone 13'], defaultBrowserType: undefined, acceptDownloads: true } },
  escritorio: { modo: 'panel', ctx: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, acceptDownloads: true } },
}
const ARCHIVOS = { video: VIDEO, md: MD, imagen: IMAGEN, audio: AUDIO, pdf: PDF, html: HTML }
resumen.capturas = []
for (const [nombre, caso] of Object.entries(CASOS)) {
  const ctx = await navegador.newContext(caso.ctx)
  for (const [tipo, ruta] of Object.entries(ARCHIVOS)) {
    const page = await ctx.newPage()
    const errores = []; page.on('pageerror', e => errores.push(String(e)))
    await page.goto(`${BASE}/?modo=${caso.modo}&ruta=${encodeURIComponent(ruta)}`)
    const boton = page.locator('a[data-descargar]').first()
    await boton.waitFor({ timeout: 30_000 }).catch(async e => { console.log('SIN BOTÓN', tipo, (await page.locator('body').innerText()).slice(0, 600), errores); throw e })
    await dormir(tipo === 'video' || tipo === 'audio' ? 1500 : 600)
    const caja = await boton.boundingBox()
    assert.ok(caja && caja.width >= 24 && caja.height >= 24, `${nombre}/${tipo}: el botón se ve (${JSON.stringify(caja)})`)
    assert.ok(caja.x >= 0 && caja.x + caja.width <= (caso.ctx.viewport?.width ?? 390) + 1, `${nombre}/${tipo}: cabe en el ancho`)
    const archivo = join(SALIDA, `${nombre}-${tipo}.png`)
    await page.screenshot({ path: archivo })
    // Recorte de la barra donde vive el botón, para verlo de cerca.
    const barra = boton.locator('xpath=..')
    const cajaBarra = await barra.boundingBox()
    if (cajaBarra) await page.screenshot({ path: join(SALIDA, `${nombre}-${tipo}-barra.png`), clip: { x: Math.max(0, cajaBarra.x - 8), y: Math.max(0, cajaBarra.y - 8), width: Math.min(cajaBarra.width + 16, (caso.ctx.viewport?.width ?? 390) - Math.max(0, cajaBarra.x - 8)), height: cajaBarra.height + 16 } })
    resumen.capturas.push(archivo)
    // 2. Clic real: una descarga con el nombre original y los bytes del original.
    const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), boton.click()])
    const guardado = join(destino, `${nombre}-${descarga.suggestedFilename()}`)
    await descarga.saveAs(guardado)
    const nombreOriginal = ruta.split('/').pop()
    // WebKit propone el nombre en NFD (la forma de macOS): mismo nombre, otra normalización.
    assert.equal(descarga.suggestedFilename().normalize('NFC'), nombreOriginal.normalize('NFC'), `${nombre}/${tipo}: nombre original`)
    assert.equal(statSync(guardado).size, statSync(ruta).size, `${nombre}/${tipo}: tamaño original`)
    assert.deepEqual(errores, [], `${nombre}/${tipo}: sin errores de página`)
    log(nombre, tipo, '· botón', `${Math.round(caja.width)}×${Math.round(caja.height)}`, '· descarga', descarga.suggestedFilename())
    await page.close()
  }
  await ctx.close()
}

// 3. App de escritorio simulada: el clic va al opener con la URL completa; el WebView ni navega ni descarga.
{
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/?modo=panel&escritorio=1&ruta=${encodeURIComponent(VIDEO)}`)
  const boton = page.locator('a[data-descargar]').first()
  await boton.waitFor({ timeout: 30_000 })
  let descargo = false; page.on('download', () => { descargo = true })
  const antes = page.url()
  await boton.click(); await dormir(800)
  // La app hace otras llamadas a Tauri al montar; aquí cuentan solo las del opener.
  const abiertos = (await page.evaluate(() => window.__ABIERTOS__)).filter(x => x.cmd === 'plugin:opener|open_url')
  assert.equal(page.url(), antes, 'el WebView no navega')
  assert.equal(descargo, false, 'el WebView no descarga (Tauri la cancelaría)')
  assert.equal(abiertos.length, 1); assert.equal(abiertos[0].cmd, 'plugin:opener|open_url')
  assert.match(abiertos[0].args.url, new RegExp(`^${BASE}/api/cabina/documento/descargar/[^/]+/Clase%203%20%C2%B7%20La%20garant%C3%ADa\\.mp4$`))
  const r = await fetch(abiertos[0].args.url)
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /^attachment;/); await r.arrayBuffer()
  resumen.escritorio = abiertos[0]
  log('escritorio · opener', abiertos[0].args.url.replace(/descargar\/[^/]+/, 'descargar/<token>'))
  await ctx.close()
}

await navegador.close(); servidor.close()
unlinkSync(bajado) // la copia de 700 MB que bajó curl (el original queda en /tmp para la siguiente corrida)
writeFileSync(join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2))
console.log('OK · capturas y resumen en', SALIDA)
console.log(JSON.stringify(resumen.curl, null, 2))
