// Capturas de «Pantalla completa» del visor HTML con el deck de la grupal (28 oct 2026).
//   node tests/panel/e2e/pantalla-doc/ejecutar.mjs <carpeta del deck> [carpeta de salida]    (desde arbrain/)
// El relé del presentador (127.0.0.1:3317) se desvía a un puerto muerto: el arnés no mueve la clase en vivo.
// Emula el iPhone: sin Fullscreen API (el modo cae al `fixed` por CSS), toques reales por CDP dentro del iframe aislado.
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const DECK = resolve(process.argv[2] ?? '')
const SALIDA = resolve(process.argv[3] ?? join(tmpdir(), 'capturas-pantalla-doc')); mkdirSync(SALIDA, { recursive: true })
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const dist = mkdtempSync(join(tmpdir(), 'pantalla-e2e-')), perfil = mkdtempSync(join(tmpdir(), 'pantalla-chrome-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)

execFileSync(ESBUILD, [join(aqui, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(aqui, '../runtime-stub.ts')}`,
  '--define:process.env.NODE_ENV="development"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
execFileSync(ESBUILD, [join(raiz, 'src/features/cabina/documento/tema-html.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${join(dist, 'tema-html.mjs')}`, '--log-level=error'], { cwd: raiz })
const { inyectarTema } = await import(join(dist, 'tema-html.mjs'))

const TOKENS = `:root{--background:#faf8fc;--surface:#fff;--card:#fff;--foreground:#1d1726;--muted:#7a7088;--border:#e7e1ef;--brand:#7c3aed;--brand-rgb:124,58,237}
body{margin:0;background:var(--background);color:var(--foreground);font:14px system-ui}`
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

const PUERTO = 9800 + Math.floor(Math.random() * 300)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--site-per-process', 'about:blank'], { stdio: 'ignore' })
const fin = () => { try { chrome.kill('SIGKILL') } catch {} servidor.close() }
process.on('exit', fin); setTimeout(() => { console.log('TIEMPO AGOTADO'); fin(); process.exit(2) }, 120_000).unref()
async function json(r) { for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${PUERTO}${r}`)).json() } catch { await dormir(100) } } throw new Error('sin Chrome') }
const ws = new WebSocket((await json('/json/list')).find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let n = 0; const esp = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && esp.has(m.id)) { const [ok, mal] = esp.get(m.id); esp.delete(m.id); m.error ? mal(new Error(m.error.message)) : ok(m.result) } }
const cdp = (method, params = {}, sessionId) => new Promise((ok, mal) => { const id = ++n; esp.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
const ev = async (expr, s) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, s)).result.value
const foto = async nombre => { await dormir(700); const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SALIDA, nombre), Buffer.from(data, 'base64')); log('captura', nombre) }
const pantalla = (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } })
const toque = async (x, y) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await dormir(40); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
const swipe = async (x0, x1, y) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] }); for (let i = 1; i <= 6; i++) { await dormir(16); await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 6, y }] }) } await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }

// iPhone: Safari no tiene Fullscreen API para un div.
await cdp('Page.enable'); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen' })
await pantalla(390, 844)
await cdp('Page.navigate', { url: BASE + '/' }); await dormir(6000)

// Lámina actual: el deck guarda «i.paso» en su hash (location del iframe).
const marcoSesion = async () => {
  const { targetInfos } = await cdp('Target.getTargets'); const t = targetInfos.find(x => x.url.includes('/crudo/index.html'))
  assert.ok(t, 'el iframe del deck cargó'); return (await cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId
}
const s = await marcoSesion()
const lamina = () => ev(`location.hash`, s)
log('al cargar', await lamina(), await ev('window.name', s), await ev(`document.getElementById('num')?.textContent`, s))

await foto('1-telefono-vertical-antes.png')
const btn = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Pantalla completa'));const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)
await toque(btn[0], btn[1]); await dormir(500)
const rect = await ev(`JSON.stringify(document.querySelector('[data-pantalla]')?.getBoundingClientRect())`)
log('marco', rect); assert.deepEqual(JSON.parse(rect), { x: 0, y: 0, width: 390, height: 844, top: 0, right: 390, bottom: 844, left: 0 }, 'el marco llena el viewport vertical')
await foto('2-pantalla-completa-vertical-390x844.png')

await pantalla(844, 390); await dormir(600)
const r2 = JSON.parse(await ev(`JSON.stringify(document.querySelector('[data-pantalla]').getBoundingClientRect())`))
assert.equal(r2.width, 844); assert.equal(r2.height, 390)
await foto('3-pantalla-completa-horizontal-844x390.png')

const a0 = await lamina()
await toque(650, 200); await dormir(900); const a1 = await lamina()
log('toque derecho', a0, '→', a1); assert.notEqual(a1, a0, 'toque en la mitad derecha avanza')
await foto('4-horizontal-tras-toque-derecho.png')
for (let k = 0; k < 4; k++) { await swipe(700, 200, 200); await dormir(500) }
const a2 = await lamina(); log('4 swipes a la izquierda', a1, '→', a2); assert.notEqual(a2, a1, 'swipe avanza')
await foto('5-horizontal-tras-swipes.png')
await toque(150, 200); await dormir(900); const a3 = await lamina()
log('toque izquierdo', a2, '→', a3); assert.notEqual(a3, a2, 'toque en la mitad izquierda retrocede')

const salir = await ev(`(()=>{const r=document.querySelector('[aria-label="Salir de pantalla completa"]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)
await toque(salir[0], salir[1]); await dormir(500)
assert.equal(await ev(`!!document.querySelector('[data-pantalla]')`), false, 'sale del modo')
assert.equal(await lamina(), a3, 'el deck conserva su lámina al salir (no se recarga)')
await pantalla(390, 844); await foto('6-telefono-vertical-despues.png')
console.log('OK pantalla completa')
process.exit(0)
