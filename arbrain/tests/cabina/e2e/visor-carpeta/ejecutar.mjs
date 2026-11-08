// Tocar un video de una carpeta de entrega lo abre y se QUEDA abierto (6 nov 2026, Daniel 18:10: «doy clic a un video y
// luego me saca no puedo he podido ver ninguno aun»). Playwright WebKit (el motor de la app de escritorio y del iPhone).
//   node tests/cabina/e2e/visor-carpeta/ejecutar.mjs [carpeta de salida] [--antes] [--carpeta <ruta>]   (desde arbrain/)
// La API es la de verdad (src/app/api/cabina/documento, compilada para node con el dueño simulado) sobre una carpeta de
// verdad: por defecto una copia (enlaces duros) de los cortos del 6 nov SIN entrega.json, que es el caso del reporte.
// Casos: hilo (escritorio), panel (pestaña grande) y teléfono (hilo a 390 px, táctil). En cada uno: toca el primer video,
// mira 9 s (tres relecturas del panel) que siga el visor de video con «volver», vuelve a la carpeta y abre una hoja y el .md.
// Con --antes solo mide y captura (sus aserciones no aplican).
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, linkSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir, homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const args = process.argv.slice(2), ANTES = args.includes('--antes')
const iCarpeta = args.indexOf('--carpeta'), CARPETA_PEDIDA = iCarpeta >= 0 ? args[iCarpeta + 1] : null
const pos = args.filter((a, i) => a !== '--antes' && (iCarpeta < 0 || (i !== iCarpeta && i !== iCarpeta + 1)))
const SALIDA = resolve(pos[0] ?? join(tmpdir(), 'capturas-visor-carpeta')); mkdirSync(SALIDA, { recursive: true })
const ETIQUETA = ANTES ? 'antes' : 'despues'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const PW = process.env.PLAYWRIGHT_CORE ?? execFileSync('sh', ['-c', `for d in ~/.npm/_npx/*/node_modules/playwright-core; do r=$(node -e "console.log(require('$d/browsers.json').browsers.find(b=>b.name==='webkit').revision)"); [ -d ~/Library/Caches/ms-playwright/webkit-$r ] && echo $d && break; done`]).toString().trim()
const { webkit, devices } = createRequire(import.meta.url)(PW)
const dist = mkdtempSync(join(tmpdir(), 'visor-carpeta-e2e-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)

// ── La carpeta: los cortos reales sin entrega.json (enlaces duros en /tmp: mismos bytes, sin copiar 150 MB) ──
const CORTOS = join(homedir(), 'Developer/labs/god-animation/practicas/2026-11-06-cortos/final')
let CARPETA = CARPETA_PEDIDA
if (!CARPETA) {
  CARPETA = join('/tmp', 'visor-carpeta-e2e-cortos')
  rmSync(CARPETA, { recursive: true, force: true }); mkdirSync(CARPETA)
  if (existsSync(CORTOS)) for (const n of readdirSync(CORTOS)) { if (n !== 'entrega.json' && !n.startsWith('.')) linkSync(join(CORTOS, n), join(CARPETA, n)) }
  else {
    // Sin los cortos en esta máquina: tres mp4 verticales de 2 s, sus hojas y un .md, hechos con ffmpeg.
    for (const n of ['bonos-1', 'garantia-1', 'mensualidad-1']) {
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=540x960:rate=30:duration=2', '-pix_fmt', 'yuv420p', join(CARPETA, `${n}.mp4`)])
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=540x960', '-frames:v', '1', join(CARPETA, `${n}.hoja.jpg`)])
    }
    writeFileSync(join(CARPETA, 'CORTOS.md'), '# Cortos\n\nTres cortos de prueba.\n')
  }
}

// ── El cliente (next/navigation y next/link sin el router de Next: el .md los pide) ──
execFileSync(ESBUILD, [join(aqui, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', '--loader:.woff2=empty', '--loader:.woff=empty', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(raiz, 'tests/panel/e2e/runtime-stub.ts')}`,
  `--alias:next/navigation=${join(aqui, 'navegacion-stub.ts')}`, `--alias:next/link=${join(aqui, 'enlace-stub.tsx')}`,
  '--define:process.env.NODE_ENV="development"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
const postcss = (await import(join(raiz, 'node_modules/postcss/lib/postcss.js'))).default
const tailwind = (await import(join(raiz, 'node_modules/@tailwindcss/postcss/dist/index.mjs'))).default
const globales = join(raiz, 'src/app/globals.css')
writeFileSync(join(dist, 'tailwind.css'), (await postcss([tailwind()]).process(readFileSync(globales, 'utf8'), { from: globales })).css)

// ── La API real, para node: el dueño ya verificado y sin optimizar imágenes (se pintan por su URL cruda) ──
const stubs = join(dist, 'stubs'); mkdirSync(stubs)
writeFileSync(join(stubs, 'planning.ts'), `export const planningOwner = async () => 'dueno'\nexport const planningError = (e: unknown) => Response.json({ error: String(e) }, { status: 500 })\nexport const checkMutationOrigin = () => {}\n`)
writeFileSync(join(stubs, 'optimizar.ts'), `export const registrarArchivo = async (_: string) => null\n`)
writeFileSync(join(stubs, 'vacio.ts'), `export {}\n`)
writeFileSync(join(stubs, 'servidor.ts'), `export * as documento from ${JSON.stringify(join(raiz, 'src/app/api/cabina/documento/route.ts'))}\nexport * as crudo from ${JSON.stringify(join(raiz, 'src/app/api/cabina/documento/crudo/[token]/[...ruta]/route.ts'))}\n`)
execFileSync(ESBUILD, [join(stubs, 'servidor.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${join(dist, 'servidor.mjs')}`, `--tsconfig=${join(raiz, 'tsconfig.json')}`,
  `--alias:@/lib/planning/server=${join(stubs, 'planning.ts')}`, `--alias:@/lib/imagenes/optimizar=${join(stubs, 'optimizar.ts')}`, `--alias:server-only=${join(stubs, 'vacio.ts')}`,
  '--packages=external', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
const api = await import(pathToFileURL(join(dist, 'servidor.mjs')).href)

const TOKENS = `:root{--background:#faf8fc;--surface:#fff;--card:#fff;--foreground:#1d1726;--muted:#7a7088;--border:#e7e1ef;--brand:#7c3aed;--brand-rgb:124,58,237;--gold-rgb:245,158,11}
body{margin:0;background:var(--background);color:var(--foreground);font:14px system-ui}`
const PAGINA = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style><div id="raiz"></div><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/entrada.css"><script src="/entrada.js"></script>`

const lecturas = []
const servidor = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1'), p = decodeURIComponent(u.pathname)
  const json = o => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o))
  try {
    if (p === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA)
    if (u.pathname === '/api/cabina/documento' || u.pathname.startsWith('/api/cabina/documento/crudo/')) {
      const esCrudo = u.pathname !== '/api/cabina/documento'
      if (!esCrudo) lecturas.push({ t: Date.now(), ruta: u.searchParams.get('ruta') })
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers })
      let r
      if (esCrudo) {
        const [token, ...ruta] = u.pathname.slice('/api/cabina/documento/crudo/'.length).split('/')
        r = await api.crudo.GET(request, { params: Promise.resolve({ token, ruta }) })
      } else r = await api.documento.GET(request)
      res.writeHead(r.status, Object.fromEntries(r.headers))
      if (r.body) { for await (const c of r.body) { if (!res.write(c)) await new Promise(ok => res.once('drain', ok)) } }
      return res.end()
    }
    if (p.startsWith('/api/')) return json({})
    const f = join(dist, p); if (existsSync(f)) return res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f))
    res.writeHead(404).end()
  } catch (e) { if (!res.headersSent) res.writeHead(500).end(String(e)); else res.end() }
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`
const navegador = await webkit.launch()
setTimeout(() => { console.log('TIEMPO AGOTADO'); process.exit(2) }, 300_000).unref()

const CASOS = {
  hilo: { modo: 'hilo', ctx: { viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 } },
  panel: { modo: 'panel', ctx: { viewport: { width: 640, height: 900 }, deviceScaleFactor: 2 } },
  telefono: { modo: 'hilo', ctx: { ...devices['iPhone 13'], defaultBrowserType: undefined } },
}

/** Lo que se ve en la vista: carpeta, visor de video, imagen o documento, y si hay «volver». */
const estado = page => page.evaluate(() => {
  const vista = document.querySelector('[data-cabina-vista="documento"], [data-fijada]')
  const v = vista?.querySelector('[role="group"][aria-label^="Video "]')
  const video = v?.querySelector('video')
  const r = video?.getBoundingClientRect()
  return {
    carpeta: !!vista?.querySelector('section[aria-label="Finales"], section[aria-label="Piezas"]'),
    resumen: vista?.querySelector('header p')?.textContent ?? null,
    video: v ? v.getAttribute('aria-label') : null,
    caja: r ? { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) } : null,
    proporcionVideo: video?.videoWidth ? video.videoWidth / video.videoHeight : null,
    volver: [...(vista?.querySelectorAll('button') ?? [])].find(b => /volver|carpeta/i.test(b.getAttribute('aria-label') ?? '') || b.dataset.volverCarpeta != null)?.textContent?.trim() ?? null,
    imagen: !!vista?.querySelector('figure img, [data-visor-imagen] img'),
    md: !!vista?.querySelector('[data-lector-dom]'),
    estadoVista: document.querySelector('[data-cabina-vista]')?.getAttribute('data-cabina-estado') ?? null,
    viewportH: window.innerHeight,
  }
})

const resultados = {}
for (const [nombre, caso] of Object.entries(CASOS)) {
  const ctx = await navegador.newContext(caso.ctx)
  const page = await ctx.newPage()
  const errores = []; page.on('pageerror', e => errores.push(String(e)))
  await page.goto(`${BASE}/?modo=${caso.modo}&ruta=${encodeURIComponent(CARPETA)}`)
  await page.waitForSelector('section[aria-label="Finales"], section[aria-label="Piezas"]', { timeout: 30_000 })
  await dormir(800)
  const inicio = await estado(page)
  await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-1-carpeta.png`) })
  // Toca el ÚLTIMO video de la carpeta, como quien bajó hasta él: la vista se encoge al abrirlo.
  const tarjeta = page.locator('[data-clase="video"]').last()
  await tarjeta.evaluate(el => el.scrollIntoView({ block: 'center' }))
  await dormir(500)
  await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-1b-bajo-al-video.png`) })
  if (nombre === 'telefono') await tarjeta.tap(); else await tarjeta.click()
  const muestras = []
  for (let i = 0; i < 18; i++) { await dormir(500); muestras.push(await estado(page)); if (i === 3) await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-2-video.png`) }) }
  await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-3-video-9s.png`) })
  // Daniel sube a buscar su video: la vista vuelve a la pantalla.
  await page.evaluate(() => document.querySelector('[data-cabina-vista], [data-fijada]')?.scrollIntoView({ block: 'start' }))
  await dormir(1500)
  const alVolverArriba = await estado(page)
  await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-3b-al-subir.png`) })
  const r = resultados[nombre] = { inicio, alAbrir: muestras[2], a9s: muestras.at(-1), alVolverArriba, dormida: muestras.some(m => m.estadoVista === 'dormida'), sacado: muestras.some(m => !m.video) || !alVolverArriba.video, cuandoSaco: muestras.findIndex(m => !m.video) * 0.5 + 0.5, errores }
  if (!ANTES) {
    // Volver a la carpeta y abrir una hoja (imagen) y el .md: los mismos, dentro de la pestaña.
    await page.locator('[data-volver-carpeta]').first().click()
    await page.waitForSelector('section[aria-label="Piezas"]', { timeout: 10_000 })
    await page.locator('[data-clase="imagen"]').first().click()
    await dormir(1500); r.imagen = await estado(page)
    await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-4-hoja.png`) })
    await page.locator('[data-volver-carpeta]').first().click()
    await page.waitForSelector('section[aria-label="Piezas"]', { timeout: 10_000 })
    await page.locator('[data-clase="documento"]').first().click()
    await dormir(1500); r.md = await estado(page)
    await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-5-md.png`) })
  }
  log(nombre, JSON.stringify(r))
  await ctx.close()
}
// ── Un solo video: 9:16 y 16:9, teléfono y escritorio; reproducir y pantalla completa sin que la vista lo saque ──
const VERTICAL = existsSync(join(CARPETA, 'mensualidad-2.mp4')) ? join(CARPETA, 'mensualidad-2.mp4') : join(CARPETA, readdirSync(CARPETA).find(n => n.endsWith('.mp4')))
const HORIZONTAL_REAL = join(homedir(), 'Developer/labs/god-animation/practicas/2026-11-06-garantia/final/garantia-yt-v1.mp4')
const HORIZONTAL = existsSync(HORIZONTAL_REAL) ? HORIZONTAL_REAL : (() => { const f = join(CARPETA, 'horizontal.mp4'); if (!existsSync(f)) execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=3', '-pix_fmt', 'yuv420p', f]); return f })()
const videoEstado = page => page.evaluate(() => {
  const g = document.querySelector('[role="group"][aria-label^="Video "]'), el = g?.querySelector('video'), r = el?.getBoundingClientRect()
  const tecla = g?.querySelector('[aria-label="Reproducir"], [aria-label="Pausar"]')?.getBoundingClientRect()
  return { hay: !!g, enUso: g?.hasAttribute('data-en-uso') ?? false, pantalla: g?.hasAttribute('data-pantalla') ?? false, t: el ? Math.round(el.currentTime * 10) / 10 : null, corre: el ? !el.paused : false,
    nodo: el ? (el.__id ??= Math.random()) : null, caja: r ? { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) } : null,
    teclaAbajo: tecla ? Math.round(tecla.bottom) : null, viewportH: window.innerHeight, estadoVista: document.querySelector('[data-cabina-vista]')?.getAttribute('data-cabina-estado') ?? null }
})
for (const [nombre, caso] of Object.entries({
  'vertical-telefono': { ruta: VERTICAL, ctx: CASOS.telefono.ctx, tacto: true },
  'horizontal-telefono': { ruta: HORIZONTAL, ctx: CASOS.telefono.ctx, tacto: true },
  'vertical-escritorio': { ruta: VERTICAL, ctx: CASOS.hilo.ctx },
  'horizontal-escritorio': { ruta: HORIZONTAL, ctx: CASOS.hilo.ctx },
})) {
  const ctx = await navegador.newContext(caso.ctx)
  const page = await ctx.newPage()
  const errores = []; page.on('pageerror', e => errores.push(String(e)))
  // El iPhone: la pantalla completa nativa del <video> (WebKit de escritorio sin pantalla no la hace). Como iOS: entra con el
  // toque, el <video> queda «mostrándose a pantalla completa» y avisa `webkitendfullscreen` al salir.
  if (caso.tacto) await page.addInitScript(() => {
    Object.defineProperty(HTMLVideoElement.prototype, 'webkitDisplayingFullscreen', { configurable: true, get() { return !!this.__nativa } })
    HTMLVideoElement.prototype.webkitEnterFullscreen = function () { this.__nativa = true; window.__entroNativa = (window.__entroNativa ?? 0) + 1 }
    HTMLVideoElement.prototype.webkitExitFullscreen = function () { this.__nativa = false; this.dispatchEvent(new Event('webkitendfullscreen')) }
  })
  await page.goto(`${BASE}/?modo=hilo&ruta=${encodeURIComponent(caso.ruta)}`)
  await page.waitForSelector('[role="group"][aria-label^="Video "] video', { timeout: 30_000 })
  await page.waitForFunction(() => (document.querySelector('[role="group"][aria-label^="Video "] video')?.readyState ?? 0) >= 2, null, { timeout: 30_000 }).catch(() => {})
  await page.evaluate(() => document.querySelector('[data-cabina-vista]')?.scrollIntoView({ block: 'start' }))
  await dormir(700)
  const r = { inicio: await videoEstado(page), errores }
  await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-1-abierto.png`) })
  const tocar = loc => caso.tacto ? loc.tap() : loc.click()
  // Reproducir con la tecla (la del centro si está; si no, la de los controles).
  const play = page.locator('[role="group"][aria-label^="Video "] [aria-label="Reproducir"]').first()
  await tocar(play); await dormir(1600)
  r.reproduciendo = await videoEstado(page)
  await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-2-reproduciendo.png`) })
  // Pantalla completa, y el hilo se mueve debajo (lo que la dormía): el mismo <video> sigue montado.
  await tocar(page.locator('[role="group"][aria-label^="Video "] [aria-label="Pantalla completa"]').first())
  await dormir(900)
  r.enPantalla = { ...await videoEstado(page), nativa: await page.evaluate(() => window.__entroNativa ?? 0) }
  await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-3-pantalla-completa.png`) })
  await page.evaluate(() => { const h = document.querySelector('[data-hilo]'); if (h) h.scrollTop = h.scrollHeight })
  await dormir(1500)
  r.trasMoverHilo = await videoEstado(page)
  // Salir: la API, la nativa del video o Escape (capa propia).
  await page.evaluate(() => {
    const v = document.querySelector('[role="group"][aria-label^="Video "] video')
    if (document.fullscreenElement) return document.exitFullscreen()
    if (v?.webkitDisplayingFullscreen) return v.webkitExitFullscreen()
  })
  await page.keyboard.press('Escape').catch(() => {})
  await dormir(900)
  r.alSalir = await videoEstado(page)
  await page.evaluate(() => document.querySelector('[data-cabina-vista]')?.scrollIntoView({ block: 'start' }))
  await dormir(500)
  await page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}-4-al-salir.png`) })
  resultados[nombre] = r
  log(nombre, JSON.stringify(r))
  await ctx.close()
}

await navegador.close(); servidor.close()
writeFileSync(join(SALIDA, `${ETIQUETA}-resultados.json`), JSON.stringify(resultados, null, 2))
log('capturas en', SALIDA)

if (!ANTES) {
  for (const [nombre, r] of Object.entries(resultados)) {
    if (r.enPantalla) {
      assert.ok(r.reproduciendo.corre, `${nombre}: la tecla reproduce`)
      if (nombre.endsWith('telefono')) assert.ok(r.enPantalla.nativa === 1 && r.enPantalla.enUso, `${nombre}: en el teléfono, la pantalla completa nativa del video, con la vista en uso`)
      else assert.ok(r.enPantalla.pantalla && r.enPantalla.enUso, `${nombre}: en el escritorio, la pantalla completa propia`)
      assert.ok(r.enPantalla.hay && r.trasMoverHilo.hay && r.trasMoverHilo.estadoVista === 'montada', `${nombre}: en pantalla completa la vista no se duerme ni saca (${JSON.stringify(r.trasMoverHilo)})`)
      assert.equal(r.trasMoverHilo.nodo, r.enPantalla.nodo, `${nombre}: el mismo <video>, sin remontar`)
      assert.ok(r.alSalir.hay && !r.alSalir.pantalla && r.alSalir.nodo === r.enPantalla.nodo, `${nombre}: al salir, el mismo video (${JSON.stringify(r.alSalir)})`)
      assert.ok(r.alSalir.t >= r.enPantalla.t, `${nombre}: al salir sigue en su segundo (${r.enPantalla.t} → ${r.alSalir.t})`)
      assert.ok(r.inicio.caja.h <= r.inicio.viewportH && r.inicio.teclaAbajo <= r.inicio.viewportH, `${nombre}: el video y su tecla caben en la pantalla (${JSON.stringify(r.inicio)})`)
      assert.equal(r.errores.length, 0, `${nombre}: sin errores de página (${r.errores.join(' | ')})`)
      continue
    }
    assert.ok(!r.sacado, `${nombre}: tocar un video sacó del visor a los ${r.cuandoSaco} s`)
    assert.ok(r.a9s.video && r.a9s.volver, `${nombre}: a los 9 s sigue el video con «volver a la carpeta»`)
    assert.equal(r.errores.length, 0, `${nombre}: sin errores de página (${r.errores.join(' | ')})`)
    if (!CARPETA_PEDIDA) assert.match(r.inicio.resumen ?? '', /^\d+ finales · \d+ piezas/, `${nombre}: sin entrega.json los videos son finales (${r.inicio.resumen})`)
    assert.ok(r.imagen?.imagen && r.imagen.volver, `${nombre}: una hoja se abre dentro, con «volver»`)
    assert.ok(r.md?.md && r.md.volver, `${nombre}: el .md se abre dentro, con «volver»`)
    // Un vertical se ve entero en la pantalla: la caja del video cabe en el viewport.
    if (r.a9s.caja) assert.ok(r.a9s.caja.h <= r.a9s.viewportH, `${nombre}: el video cabe en la pantalla (${r.a9s.caja.h} de ${r.a9s.viewportH})`)
  }
  log('OK')
}
