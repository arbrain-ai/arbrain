// «Pantalla completa» del visor HTML en WebKit con perfiles de iPhone (28 oct 2026; 29 oct, tras fallar en el iPhone real:
// el arnés anterior corría en Chrome y sin el `container-type` del panel, así que no vio que el marco quedaba bajo la barra).
//   node tests/panel/e2e/pantalla-doc/ejecutar.mjs <carpeta del deck> [carpeta de salida] [--antes]    (desde arbrain/)
// Playwright WebKit (el motor del iPhone), 390×844 y 844×390 con toque, rotación en caliente, en «standalone» (PWA del
// Panel: navigator.standalone) y en Safari. Sin Fullscreen API, como en el iPhone. El relé del presentador (3317) se desvía.
// Con --antes solo toma las capturas del código anterior (sus aserciones no aplican).
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const args = process.argv.slice(2), ANTES = args.includes('--antes'), pos = args.filter(a => a !== '--antes')
const DECK = resolve(pos[0] ?? '')
const SALIDA = resolve(pos[1] ?? join(tmpdir(), 'capturas-pantalla-doc')); mkdirSync(SALIDA, { recursive: true })
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
// playwright-core del caché de npx cuyo WebKit ya está descargado (sin instalar nada en el repo).
const PW = process.env.PLAYWRIGHT_CORE ?? execFileSync('sh', ['-c', `for d in ~/.npm/_npx/*/node_modules/playwright-core; do r=$(node -e "console.log(require('$d/browsers.json').browsers.find(b=>b.name==='webkit').revision)"); [ -d ~/Library/Caches/ms-playwright/webkit-$r ] && echo $d && break; done`]).toString().trim()
const { webkit } = createRequire(import.meta.url)(PW)
const dist = mkdtempSync(join(tmpdir(), 'pantalla-e2e-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)

execFileSync(ESBUILD, [join(aqui, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(aqui, '../runtime-stub.ts')}`,
  '--define:process.env.NODE_ENV="development"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
execFileSync(ESBUILD, [join(raiz, 'src/features/cabina/documento/tema-html.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${join(dist, 'tema-html.mjs')}`, '--log-level=error'], { cwd: raiz })
const { inyectarTema } = await import(join(dist, 'tema-html.mjs'))

// Las reglas globales REALES de la pantalla completa (globals.css), no una copia.
const GLOBALES = readFileSync(join(raiz, 'src/app/globals.css'), 'utf8').split('\n').filter(l => l.startsWith('html[data-pantalla-doc]')).join('\n')
assert.ok(GLOBALES.includes('visibility: hidden'), 'las reglas de pantalla completa siguen en globals.css')
const TOKENS = `:root{--background:#f4f1f8;--surface:#fff;--card:#fff;--foreground:#1d1726;--muted:#7a7088;--border:#e7e1ef;--brand:#7c3aed;--brand-rgb:124,58,237}
body{margin:0;background:var(--background);color:var(--foreground);font:14px system-ui}${GLOBALES}`
const PAGINA = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><style>${TOKENS}</style><div id="raiz"></div><link rel="stylesheet" href="/entrada.css"><script src="/entrada.js"></script>`
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' }

const servidor = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname)
  if (p === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA)
  if (p === '/api/cabina/documento') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ruta: '/deck/index.html', archivo: 'index.html', tipo: 'html', editable: false, url: '/crudo/index.html', hash: 'h1' }))
  if (p.startsWith('/api/')) return res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  if (p.startsWith('/crudo/')) {
    const f = join(DECK, p.slice(7))
    if (!f.startsWith(DECK) || !existsSync(f) || statSync(f).isDirectory()) return res.writeHead(404).end()
    if (p === '/crudo/index.html') return res.writeHead(200, { 'content-type': TIPOS['.html'] }).end(inyectarTema(readFileSync(f, 'utf8').replaceAll('"3317"', '"9"'), u.searchParams.get('tema')))
    return res.writeHead(200, { 'content-type': TIPOS[extname(f).toLowerCase()] ?? 'application/octet-stream' }).end(readFileSync(f))
  }
  const f = join(dist, p); if (existsSync(f)) return res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f))
  res.writeHead(404).end()
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`
const navegador = await webkit.launch()
setTimeout(() => { console.log('TIEMPO AGOTADO'); process.exit(2) }, 180_000).unref()

async function recorrido(modo) {
  const pre = `${modo}-`
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' })
  // iPhone: sin Fullscreen API para un div. En la PWA del Panel, navigator.standalone.
  await ctx.addInitScript(`delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; ${modo === 'standalone' ? "Object.defineProperty(navigator,'standalone',{get:()=>true});" : ''}`)
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('  error de página:', e.message))
  await page.goto(BASE + '/'); await page.waitForSelector('iframe'); await dormir(3500)
  const deck = () => page.frames().find(f => f.url().includes('/crudo/index.html'))
  const foto = async nombre => { await dormir(500); await page.screenshot({ path: join(SALIDA, pre + nombre) }); log(modo, 'captura', pre + nombre) }
  const girar = async (w, h) => { await page.setViewportSize({ width: w, height: h }); await page.evaluate(() => { dispatchEvent(new Event('orientationchange')) }); await dormir(1100) }
  const marco = () => page.evaluate(() => { const r = document.querySelector('[data-pantalla]')?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round) : null })
  const escala = () => deck().evaluate(() => Math.round(window.__k * 1000) / 1000)
  const lamina = () => deck().evaluate(() => location.hash)
  // Lo que se ve en un punto: ¿la X, el deck o la app de abajo?
  const quien = (x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('[aria-label="Salir de pantalla completa"]') ? 'x' : e?.closest('[data-pantalla]') ? 'deck' : e?.closest('[data-burbuja-chat]') ? 'burbuja' : e?.closest('[data-cabecera]') ? 'cabecera' : e?.tagName ?? null }, [x, y])
  const xVisible = () => page.evaluate(() => { const b = document.querySelector('[aria-label="Salir de pantalla completa"]'); if (!b) return null; const r = b.getBoundingClientRect(), c = getComputedStyle(b); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), dentro: r.right <= innerWidth && r.bottom <= innerHeight && r.x >= 0 && r.y >= 0, visible: c.visibility === 'visible' && +c.opacity > 0.9, encima: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === b } })
  // Toques sintéticos dentro del deck (Playwright no tiene touchmove): los mismos campos que lee el script inyectado.
  const deslizar = (x0, y0, x1, y1) => deck().evaluate(([x0, y0, x1, y1]) => {
    const ev = (tipo, x, y, lista) => { const e = new Event(tipo, { bubbles: true, cancelable: true }); const t = [{ clientX: x, clientY: y }]; Object.defineProperty(e, 'touches', { value: lista ? t : [] }); Object.defineProperty(e, 'changedTouches', { value: t }); dispatchEvent(e) }
    ev('touchstart', x0, y0, true); ev('touchend', x1, y1, false)
  }, [x0, y0, x1, y1])

  log(modo, 'vertical, panel normal:', await escala())
  await foto('1-vertical-panel.png')

  // Girar a horizontal EN CALIENTE con el deck a la vista.
  await girar(844, 390)
  const m1 = await marco()
  log(modo, 'horizontal tras girar: marco', m1, 'escala', await escala(), 'X', JSON.stringify(await xVisible()))
  await foto('2-horizontal-al-girar.png')
  if (ANTES) {
    // El código anterior no entraba solo: se toca su botón para ver dónde quedaba el marco.
    const b = await page.$('button:has-text("Pantalla completa")'); if (b) { await b.tap(); await dormir(900) }
    log(modo, 'antes · tras tocar «Pantalla completa»: marco', await marco(), 'escala', await escala(), 'X', JSON.stringify(await xVisible()), 'arriba-izq', await quien(30, 30), 'burbuja', await quien(37, 37 + 0) )
    await foto('3-horizontal-pantalla-completa.png')
    await ctx.close(); return
  }
  assert.deepEqual(m1, [0, 0, 844, 390], 'al girar a horizontal el deck entra solo y ocupa todo el viewport')
  assert.equal(await escala(), Math.round(Math.min(844 / 1920, 390 / 1080) * 1000) / 1000, 'el deck 16:9 se re-escala al máximo que cabe')
  let x = await xVisible(); assert.ok(x && x.dentro && x.visible && x.encima && x.w >= 44, 'la X se ve, completa, encima de todo y de 44 px')
  assert.equal(await quien(830, 30), 'x', 'arriba a la derecha está la X, no la burbuja del chat')
  assert.equal(await quien(420, 20), 'deck', 'arriba no se ve la barra de la app')

  // Pasar láminas: toque en la mitad derecha.
  const a0 = await lamina(); await page.touchscreen.tap(650, 220); await dormir(900); const a1 = await lamina()
  log(modo, 'toque derecho', a0, '→', a1); assert.notEqual(a1, a0, 'toque a la derecha avanza')
  await foto('3-horizontal-tras-toque.png')

  // De vuelta a vertical en caliente: sigue en pantalla completa, re-escalado, con la X.
  await girar(390, 844)
  assert.deepEqual(await marco(), [0, 0, 390, 844], 'en vertical sigue ocupando todo')
  assert.equal(await escala(), Math.round(Math.min(390 / 1920, 844 / 1080) * 1000) / 1000, 'y se re-escala a vertical')
  x = await xVisible(); assert.ok(x?.dentro && x.visible && x.encima, 'la X no desaparece al girar')
  await foto('4-vertical-pantalla-completa.png')
  await girar(844, 390)
  assert.deepEqual(await marco(), [0, 0, 844, 390], 'y otra vez en horizontal')

  // Salir 1: deslizar hacia abajo.
  await deslizar(420, 120, 425, 300); await dormir(500)
  assert.equal(await marco(), null, 'deslizar hacia abajo sale')
  assert.equal(await lamina(), a1, 'el deck conserva su lámina (no se recarga)')
  await foto('5-horizontal-tras-salir.png')
  // Salir 2: doble toque arriba (un toque arriba solo hace latir la X; no pasa lámina).
  await page.tap('button:has-text("Pantalla completa")'); await dormir(800)
  assert.deepEqual(await marco(), [0, 0, 844, 390], 'el botón vuelve a entrar')
  await page.touchscreen.tap(420, 25); await dormir(150)
  assert.equal(await page.evaluate(() => !!document.querySelector('[data-llamada]')), true, 'un toque arriba hace latir la X')
  await foto('6-toque-arriba-la-x-late.png')
  await dormir(500); await page.touchscreen.tap(420, 25); await dormir(150); await page.touchscreen.tap(420, 25); await dormir(600)
  assert.equal(await marco(), null, 'doble toque arriba sale')
  assert.equal(await lamina(), a1, 'el toque arriba no pasó lámina')
  // Salir 3: la X.
  await page.tap('button:has-text("Pantalla completa")'); await dormir(800)
  await page.tap('[aria-label="Salir de pantalla completa"]'); await dormir(600)
  assert.equal(await marco(), null, 'la X sale')
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-pantalla-doc')), false, 'la app vuelve a pintarse')
  await girar(390, 844); await foto('7-vertical-de-vuelta.png')
  await ctx.close()
}

for (const modo of ['standalone', 'safari']) await recorrido(modo)
await navegador.close(); servidor.close()
console.log(ANTES ? 'capturas de antes listas' : 'OK pantalla completa en WebKit (standalone y Safari)')
process.exit(0)
