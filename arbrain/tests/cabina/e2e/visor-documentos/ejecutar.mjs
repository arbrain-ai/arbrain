// Visor de documentos (14 nov 2026): CSV, Excel, Word y un libro en PDF, en claro y en oscuro, con sus interacciones.
//   node tests/cabina/e2e/visor-documentos/ejecutar.mjs <carpeta de salida> --csv a.csv --xlsx b.xlsx --docx c.docx --pdf d.pdf   (desde arbrain/)
// La Cabina REAL (pestaña del panel, 1280 × 860 a 2×) con la API de verdad (documento y crudo, compiladas para node con el
// dueño simulado), servida por http local; Playwright WebKit, el motor del WKWebView de la app de escritorio.
// Mide además: tiempo hasta ver la tabla y el libro, y fluidez del desplazamiento (cuadros perdidos) en la tabla y el PDF.
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const descarga = resolve(aqui, '../visor-descarga')
const args = process.argv.slice(2)
const opcion = k => { const i = args.indexOf(`--${k}`); return i >= 0 ? resolve(args[i + 1]) : null }
const SALIDA = resolve(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? join(tmpdir(), 'capturas-visor-documentos')); mkdirSync(SALIDA, { recursive: true })
const ARCHIVOS = { csv: opcion('csv'), xlsx: opcion('xlsx'), docx: opcion('docx'), pdf: opcion('pdf') }
const SOLO = (opcion('solo') ?? '').split('/').pop()
process.env.ARBRAIN_DOC_SECRET ??= 'arnes-visor-documentos-0123456789abcdef'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const PW = process.env.PLAYWRIGHT_CORE ?? execFileSync('sh', ['-c', `for d in ~/.npm/_npx/*/node_modules/playwright-core; do r=$(node -e "console.log(require('$d/browsers.json').browsers.find(b=>b.name==='webkit').revision)"); [ -d ~/Library/Caches/ms-playwright/webkit-$r ] && echo $d && break; done`]).toString().trim()
const { webkit } = createRequire(import.meta.url)(PW)
// Dentro de node_modules/.cache: el bundle del servidor deja sus paquetes afuera y node los resuelve subiendo desde ahí.
mkdirSync(join(raiz, 'node_modules/.cache'), { recursive: true })
const dist = mkdtempSync(join(raiz, 'node_modules/.cache/visor-documentos-e2e-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)

// ── El cliente (la misma entrada del arnés de «Descargar»: la pestaña real del panel) ──
execFileSync(ESBUILD, [join(descarga, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', '--loader:.woff2=empty', '--loader:.woff=empty', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(descarga, 'runtime-stub.ts')}`,
  `--alias:next/navigation=${join(raiz, 'tests/cabina/e2e/visor-carpeta/navegacion-stub.ts')}`, `--alias:next/link=${join(raiz, 'tests/cabina/e2e/visor-carpeta/enlace-stub.tsx')}`,
  `--alias:pdfjs-dist/webpack.mjs=${join(descarga, 'pdfjs-stub.ts')}`,
  '--define:process.env.NODE_ENV="production"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
const postcss = (await import(join(raiz, 'node_modules/postcss/lib/postcss.js'))).default
const tailwind = (await import(join(raiz, 'node_modules/@tailwindcss/postcss/dist/index.mjs'))).default
const globales = join(raiz, 'src/app/globals.css')
writeFileSync(join(dist, 'tailwind.css'), (await postcss([tailwind()]).process(readFileSync(globales, 'utf8'), { from: globales })).css)

// ── La API real, para node ──
const stubs = join(dist, 'stubs'); mkdirSync(stubs)
writeFileSync(join(stubs, 'planning.ts'), `export const planningOwner = async () => 'dueno'\nexport const planningError = (e: unknown) => Response.json({ error: String(e) }, { status: 500 })\nexport const checkMutationOrigin = () => {}\n`)
writeFileSync(join(stubs, 'optimizar.ts'), `export const registrarArchivo = async (_: string) => null\n`)
writeFileSync(join(stubs, 'vacio.ts'), `export {}\n`)
writeFileSync(join(stubs, 'directo.ts'), `export const estadoDirecto = async () => ({ prendido: false, velo: null })\nexport const directoPrendido = async () => false\nexport const respuestaOculta = (q: string) => Response.json({ error: q }, { status: 423 })\n`)
writeFileSync(join(stubs, 'servidor.ts'), [
  `export * as documento from ${JSON.stringify(join(raiz, 'src/app/api/cabina/documento/route.ts'))}`,
  `export * as crudo from ${JSON.stringify(join(raiz, 'src/app/api/cabina/documento/crudo/[token]/[...ruta]/route.ts'))}`, ''].join('\n'))
execFileSync(ESBUILD, [join(stubs, 'servidor.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${join(dist, 'servidor.mjs')}`, `--tsconfig=${join(raiz, 'tsconfig.json')}`,
  `--alias:@/lib/planning/server=${join(stubs, 'planning.ts')}`, `--alias:@/lib/imagenes/optimizar=${join(stubs, 'optimizar.ts')}`, `--alias:server-only=${join(stubs, 'vacio.ts')}`, `--alias:@/lib/modo-directo/servidor=${join(stubs, 'directo.ts')}`,
  '--packages=external', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
const api = await import(pathToFileURL(join(dist, 'servidor.mjs')).href)

const PAGINA = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--font-inter:'Inter',-apple-system,BlinkMacSystemFont,system-ui;--font-jetbrains-mono:'JetBrains Mono','SF Mono',ui-monospace,Menlo}body{margin:0;background:var(--background);color:var(--foreground);font:14px var(--font-inter)}</style><div id="raiz"></div><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/entrada.css"><script src="/entrada.js"></script>`
const TIPOS = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf' }
const servidor = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1'), p = decodeURIComponent(u.pathname)
  try {
    if (p === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA)
    if (u.pathname === '/api/cabina/documento' || u.pathname.startsWith('/api/cabina/documento/crudo/')) {
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers })
      let r
      if (u.pathname.startsWith('/api/cabina/documento/crudo/')) {
        const [token, ...ruta] = u.pathname.slice('/api/cabina/documento/crudo/'.length).split('/')
        r = await api.crudo.GET(request, { params: Promise.resolve({ token, ruta }) })
      } else r = await api.documento.GET(request)
      res.writeHead(r.status, Object.fromEntries(r.headers))
      if (r.body) for await (const c of r.body) { if (!res.write(c)) await new Promise(ok => res.once('drain', ok)) }
      return res.end()
    }
    if (p === '/pdf.worker.mjs') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(join(raiz, 'node_modules/pdfjs-dist/build/pdf.worker.mjs')))
    if (p.startsWith('/pdfjs/') && existsSync(join(raiz, 'public', p))) return res.writeHead(200, { 'content-type': TIPOS[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(join(raiz, 'public', p)))
    if (p.startsWith('/api/')) return res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    const f = join(dist, p); if (existsSync(f)) return res.writeHead(200, { 'content-type': TIPOS[extname(p)] ?? 'text/javascript' }).end(readFileSync(f))
    res.writeHead(404).end()
  } catch (e) { if (!res.headersSent) res.writeHead(500).end(String(e)); else res.end() }
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`
setTimeout(() => { console.log('TIEMPO AGOTADO'); process.exit(2) }, 900_000).unref()

const navegador = await webkit.launch()
const resumen = { capturas: [], medidas: {} }
const captura = async (page, nombre) => { const f = join(SALIDA, `${nombre}.png`); await page.screenshot({ path: f }); resumen.capturas.push(f); log('captura', nombre) }

/** Cuadros perdidos al desplazar: rAF durante un desplazamiento programado de `px` en `ms`. */
const fluidez = (page, selector, px, ms) => page.evaluate(async ({ selector, px, ms }) => {
  const el = document.querySelector(selector); if (!el) return null
  const t0 = performance.now(); const marcas = []
  await new Promise(fin => { const paso = t => { marcas.push(t); const f = Math.min(1, (t - t0) / ms); el.scrollTop = f * px; if (f < 1) requestAnimationFrame(paso); else fin() }; requestAnimationFrame(paso) })
  const dt = marcas.slice(1).map((t, i) => t - marcas[i]); dt.sort((a, b) => a - b)
  return { cuadros: marcas.length, mediana: +dt[Math.floor(dt.length / 2)].toFixed(1), p95: +dt[Math.floor(dt.length * 0.95)].toFixed(1), largos: dt.filter(x => x > 34).length }
}, { selector, px, ms })

async function abrir(tema, ruta, ancho = 1280, alto = 860) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2 })
  await ctx.addInitScript(([t]) => { localStorage.setItem('mission-control-theme', t); localStorage.setItem('mission-control-theme-hasta', String(Date.now() + 864e5)) }, [tema])
  const page = await ctx.newPage()
  const errores = []; page.on('pageerror', e => errores.push(String(e))); page.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })
  const t0 = Date.now()
  await page.goto(`${BASE}/?modo=panel&ruta=${encodeURIComponent(ruta)}`)
  return { ctx, page, errores, t0 }
}

for (const tema of ['light', 'dark']) {
  const t = tema === 'light' ? 'claro' : 'oscuro'
  if (ARCHIVOS.csv && (!SOLO || SOLO === 'csv')) {
    const { ctx, page, errores, t0 } = await abrir(tema, ARCHIVOS.csv)
    await page.locator('[role="grid"]').waitFor({ timeout: 30_000 })
    resumen.medidas[`csv-${t}-ms-hasta-ver`] = Date.now() - t0
    await dormir(1300); await captura(page, `csv-${t}-1-abre`)
    if (!(await page.locator('[role="columnheader"]', { hasText: 'total_usd' }).count())) {
      // Otro CSV (p. ej. el de 100 mil filas): solo abrir, medir el desplazamiento y ordenar la primera columna numérica.
      resumen.medidas[`csv-${t}-fluidez`] = await fluidez(page, '[role="grid"]', 30 * 20000, 3000)
      const t1 = Date.now(); await page.locator('[role="columnheader"] button').nth(8).click(); await page.waitForTimeout(50)
      await page.locator('[role="gridcell"]').first().waitFor(); resumen.medidas[`csv-${t}-ms-ordenar`] = Date.now() - t1
      await captura(page, `csv-${t}-2-ordenada`)
      assert.deepEqual(errores, [], `csv ${t}: sin errores (${errores.join(' | ')})`)
      await ctx.close()
    } else {
    // Ordenar por el total (dos toques: de mayor a menor) y elegir una celda: la barra de abajo resume la columna.
    const total = page.locator('[role="columnheader"]', { hasText: 'total_usd' }).locator('button').first()
    await total.click(); await dormir(150); await total.click(); await dormir(500)
    await page.locator('[role="gridcell"]').nth(7 + 11 * 2).click(); await dormir(400)
    await captura(page, `csv-${t}-2-ordena-y-resume`)
    // Embudo de la ciudad: valores con su barra.
    await page.locator('[role="columnheader"]', { hasText: 'ciudad' }).hover(); await page.locator('[role="columnheader"]', { hasText: 'ciudad' }).locator('button[aria-label^="Filtrar"]').click(); await dormir(800)
    await captura(page, `csv-${t}-3-embudo-texto`)
    await page.locator('[role="option"]', { hasText: 'Morelia' }).click(); await dormir(250)
    await page.keyboard.press('Escape'); await dormir(200)
    // Rango de un número: histograma.
    await page.locator('[role="columnheader"]', { hasText: 'total_usd' }).hover(); await page.locator('[role="columnheader"]', { hasText: 'total_usd' }).locator('button[aria-label^="Filtrar"]').click(); await dormir(900)
    await page.locator('input[type="number"]').first().fill('500'); await dormir(500)
    await captura(page, `csv-${t}-4-embudo-rango`)
    await page.keyboard.press('Escape'); await dormir(200)
    await page.locator('input[aria-label="Buscar en la tabla"]').fill('referido'); await dormir(700)
    await captura(page, `csv-${t}-5-busca`)
    resumen.medidas[`csv-${t}-fluidez`] = await page.evaluate(() => 0) // placeholder: se mide abajo sin filtros
    await page.locator('input[aria-label="Buscar en la tabla"]').fill(''); await page.locator('button', { hasText: 'filtro' }).first().click().catch(() => {}); await dormir(400)
    resumen.medidas[`csv-${t}-fluidez`] = await fluidez(page, '[role="grid"]', 30 * 1900, 2500)
    assert.deepEqual(errores, [], `csv ${t}: sin errores (${errores.join(' | ')})`)
    await ctx.close()
    }
  }
  if (ARCHIVOS.xlsx && (!SOLO || SOLO === 'xlsx')) {
    const { ctx, page, errores, t0 } = await abrir(tema, ARCHIVOS.xlsx)
    await page.locator('[role="grid"]').waitFor({ timeout: 30_000 })
    resumen.medidas[`xlsx-${t}-ms-hasta-ver`] = Date.now() - t0
    await dormir(1300)
    await page.locator('[role="gridcell"]').nth(9 * 3 + 7).click(); await dormir(300)
    await captura(page, `xlsx-${t}-1-hoja-ventas`)
    await page.locator('[role="tab"]', { hasText: 'Resumen' }).click(); await dormir(1300)
    await page.locator('[role="row"]').last().locator('[role="gridcell"]').nth(2).click(); await dormir(400)
    await captura(page, `xlsx-${t}-2-hoja-resumen`)
    assert.deepEqual(errores, [], `xlsx ${t}: sin errores (${errores.join(' | ')})`)
    await ctx.close()
  }
  if (ARCHIVOS.docx && (!SOLO || SOLO === 'docx')) {
    const { ctx, page, errores } = await abrir(tema, ARCHIVOS.docx)
    await page.locator('[role="document"] section').first().waitFor({ timeout: 30_000 })
    await dormir(1400); await captura(page, `docx-${t}-1-abre`)
    await page.locator('input[aria-label="Buscar en el documento"]').fill('ficticio'); await dormir(900)
    await captura(page, `docx-${t}-2-busca`)
    await page.locator('input[aria-label="Buscar en el documento"]').fill('')
    await page.locator('nav[aria-label="Índice del documento"] button').nth(4).click().catch(() => {}); await dormir(1200)
    await page.locator('button[aria-label="Papel sepia"]').click(); await dormir(700)
    await captura(page, `docx-${t}-3-indice-y-sepia`)
    await page.locator('button[aria-label="Papel de noche"]').click(); await dormir(700)
    await captura(page, `docx-${t}-4-noche`)
    await page.locator('button[aria-label="Papel claro"]').click(); await dormir(200)
    assert.deepEqual(errores, [], `docx ${t}: sin errores (${errores.join(' | ')})`)
    await ctx.close()
  }
  if (ARCHIVOS.pdf && (!SOLO || SOLO === 'pdf')) {
    const { ctx, page, errores, t0 } = await abrir(tema, ARCHIVOS.pdf)
    await page.locator('[data-pagina="1"] canvas').waitFor({ timeout: 60_000 })
    await page.waitForFunction(() => { const c = document.querySelector('[data-pagina="1"] canvas'); return c && c.width > 0 }, null, { timeout: 60_000 })
    resumen.medidas[`pdf-${t}-ms-primera-pagina`] = Date.now() - t0
    await dormir(1800); await captura(page, `pdf-${t}-1-abre`)
    const indice = page.locator('button[role="tab"]', { hasText: 'Índice' })
    if (await indice.count()) { await indice.click(); await dormir(900); await captura(page, `pdf-${t}-2-indice`) }
    await page.locator('input[aria-label="Página actual"]').fill('42'); await page.locator('input[aria-label="Página actual"]').press('Enter'); await dormir(1600)
    await captura(page, `pdf-${t}-3-pagina-42`)
    const noche = page.locator('button[aria-label="Papel de noche"]')
    if (await noche.count()) { await noche.click(); await dormir(900); await captura(page, `pdf-${t}-4-noche`); await page.locator('button[aria-label="Papel claro"]').click() }
    resumen.medidas[`pdf-${t}-fluidez-lectura`] = await fluidez(page, '[role="document"]', 6000, 3000)
    resumen.medidas[`pdf-${t}-fluidez-hojeo`] = await fluidez(page, '[role="document"]', 40000, 3000)
    await page.locator('input[aria-label="Buscar en el PDF"]').fill(process.env.BUSCAR_PDF ?? 'maestría'); await dormir(3500)
    await captura(page, `pdf-${t}-5-busca`)
    assert.deepEqual(errores.filter(e => !/Warning|TT: undefined function/.test(e)), [], `pdf ${t}: sin errores (${errores.join(' | ')})`)
    await ctx.close()
  }
}
// Teléfono (la vista dentro del hilo, como la pinta la PWA en el iPhone): el primer vistazo de cada formato.
if (args.includes('--telefono')) for (const [tipo, ruta] of Object.entries(ARCHIVOS)) {
  if (!ruta) continue
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => { localStorage.setItem('mission-control-theme', 'dark'); localStorage.setItem('mission-control-theme-hasta', String(Date.now() + 864e5)) })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/?modo=hilo&ruta=${encodeURIComponent(ruta)}`)
  await dormir(3500)
  await captura(page, `telefono-${tipo}`)
  await ctx.close()
}
await navegador.close(); servidor.close()
writeFileSync(join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2))
rmSync(dist, { recursive: true, force: true }) // los bundles de esta corrida (node_modules/.cache/visor-documentos-e2e-*)
console.log(JSON.stringify(resumen.medidas, null, 2))
console.log('OK ·', resumen.capturas.length, 'capturas en', SALIDA)
process.exit(0)
