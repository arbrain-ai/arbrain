// Capturas headless de tema por hora, documentos, ícono de agente, indicador y enfoque.
//   node tests/panel/e2e/tema/ejecutar.mjs [carpeta de salida]    (desde arbrain/)
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const SALIDA = resolve(process.argv[2] ?? join(tmpdir(), 'capturas-tema')); mkdirSync(SALIDA, { recursive: true })
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const dist = mkdtempSync(join(tmpdir(), 'tema-e2e-')), perfil = mkdtempSync(join(tmpdir(), 'tema-chrome-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)

execFileSync(ESBUILD, [join(aqui, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(aqui, '../runtime-stub.ts')}`,
  '--define:process.env.NODE_ENV="development"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
// El mismo inyector que usa la ruta real.
execFileSync(ESBUILD, [join(raiz, 'src/features/cabina/documento/tema-html.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${join(dist, 'tema-html.mjs')}`, '--log-level=error'], { cwd: raiz })
const { inyectarTema } = await import(join(dist, 'tema-html.mjs'))

const PLAN = readFileSync(resolve(raiz, '../docs/guardados/plan-octubre-2026/index.html'), 'utf8')
const MD = '# Notas del día\n\nUn texto **largo** que debe seguir el tema del panel y la letra a su tamaño.\n\n- uno\n- dos\n\n> cita\n\n' + 'Párrafo de relleno para ver el reflujo sin scroll horizontal. '.repeat(8)
const TOKENS = `:root{--background:#faf8fc;--surface:#fff;--card:#fff;--foreground:#1d1726;--muted:#7a7088;--border:#e7e1ef;--brand:#7c3aed;--brand-rgb:124,58,237;--gold-rgb:245,158,11}
:root.dark{--background:#09090b;--surface:#101014;--card:#16161c;--foreground:#f7f8f8;--muted:#a1a1aa;--border:#2c2c34;--brand:#a78bfa;--brand-rgb:167,139,250}
body{margin:0;background:var(--background);color:var(--foreground);font:14px system-ui}`
const PAGINA = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><style>${TOKENS}</style><div id="raiz"></div><link rel="stylesheet" href="/entrada.css"><style>html[data-enfoque] [data-oculta-enfoque],html[data-enfoque] [data-shell-main]{display:none !important}</style><script src="/entrada.js"></script>`

const servidor = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname
  const json = o => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o))
  if (p === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA)
  if (p === '/api/cabina/documento') {
    const r = u.searchParams.get('ruta')
    return r.endsWith('.html') ? json({ ruta: r, archivo: 'plan.html', tipo: 'html', editable: false, url: '/crudo/plan.html', hash: 'h1' })
      : json({ ruta: r, archivo: 'notas.md', tipo: 'md', editable: false, texto: MD, hash: 'h2' })
  }
  if (p === '/crudo/plan.html') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(inyectarTema(PLAN, u.searchParams.get('tema')))
  if (p.startsWith('/api/')) return json({ ok: true, terminales: [{ id: 1, titulo: 'a', cwd: '/tmp', proc: 'claude', estado: 'trabajando', actividad: null, ultimaAccion: null, ultimas: [], subagente: { harness: 'claude', origen: 'c1' } }, { id: 2, titulo: 'b', cwd: '/tmp', proc: 'claude', estado: 'trabajando', actividad: null, ultimaAccion: null, ultimas: [], subagente: { harness: 'claude', origen: 'c1' } }, { id: 3, titulo: 'otra', cwd: '/tmp', proc: 'claude', estado: 'trabajando', actividad: null, ultimaAccion: null, ultimas: [], subagente: { harness: 'claude', origen: 'otra' } }], internas: [], servidores: [], servicios: [], permitidos: { harness: [], carpetas: [] }, leidoEn: new Date().toISOString(), fuente: 'motor', sfterm: false })
  const f = join(dist, p); if (existsSync(f)) return res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f))
  res.writeHead(404).end()
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`

const PUERTO = 9800 + Math.floor(Math.random() * 300)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--window-size=1400,820', 'about:blank'], { stdio: 'ignore' })
const fin = () => { try { chrome.kill('SIGKILL') } catch {} servidor.close() }
process.on('exit', fin); setTimeout(() => { console.log('TIEMPO AGOTADO'); fin(); process.exit(2) }, 120_000).unref()
async function json(r) { for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${PUERTO}${r}`)).json() } catch { await dormir(100) } } throw new Error('sin Chrome') }
const ws = new WebSocket((await json('/json/list')).find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let n = 0; const esp = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && esp.has(m.id)) { const [ok, mal] = esp.get(m.id); esp.delete(m.id); m.error ? mal(new Error(m.error.message)) : ok(m.result) } }
const cdp = (method, params = {}, sessionId) => new Promise((ok, mal) => { const id = ++n; esp.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
const ev = async expr => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value
const foto = async nombre => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SALIDA, nombre), Buffer.from(data, 'base64')); log('captura', nombre) }
await cdp('Page.enable'); await cdp('Runtime.enable')
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') console.log('EXC', m.params.exceptionDetails.exception?.description?.slice(0,300)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('ERR', m.params.args.map(a => a.value ?? a.description).join(' ').slice(0,300)) })
const ir = async (hora, doc, tema) => {
  await cdp('Page.navigate', { url: 'about:blank' })
  await cdp('Page.navigate', { url: BASE + '/' }); await dormir(300)
  await ev(`localStorage.clear(); ${hora != null ? `localStorage.setItem('arbrain-hora-forzada','${hora}');` : ''} ${tema ? `localStorage.setItem('mission-control-theme','${tema}');` : ''} localStorage.removeItem('arbrain.zoomPestana')`)
  await cdp('Page.navigate', { url: BASE + '/?doc=' + encodeURIComponent(doc) }); await dormir(1800)
}
const marcoDoc = `document.querySelector('iframe').contentDocument`  // sandbox sin mismo origen: no se puede; se pide por postMessage abajo

for (const [hora, doc, etiqueta] of [[22, '/tmp/plan.html', 'noche-html'], [12, '/tmp/plan.html', 'dia-html'], [22, '/tmp/n.md', 'noche-md'], [12, '/tmp/n.md', 'dia-md']]) {
  await ir(hora, doc)
  const tema = await ev(`document.documentElement.dataset.theme`)
  if (!tema) console.log('BODY:', (await ev(`document.body.innerText.slice(0,300)`)), await ev(`window.__err||''`))
  assert.equal(tema, hora === 22 ? 'dark' : 'light', `tema auto a las ${hora}`)
  assert.equal(await ev(`document.querySelectorAll('[data-testid=agentes-trabajando]').length`), 1, 'indicador de agentes')
  assert.match(await ev(`document.querySelector('[data-testid=agentes-trabajando]').textContent`), /2 subagentes trabajando/)
  assert.equal(await ev(`document.querySelectorAll('svg.lucide-bot').length >= 2`), true, 'ícono Bot en delegar')
  assert.equal(await ev(`document.documentElement.scrollWidth <= window.innerWidth`), true, 'sin scroll horizontal')
  await foto(`${etiqueta}.png`)
}

// En vivo: cruzar la hora cambia el tema solo (20 s de revisión; se acelera avisando por storage + focus).
await ir(12, '/tmp/n.md')
await ev(`localStorage.setItem('arbrain-hora-forzada','20'); window.dispatchEvent(new Event('focus'))`); await dormir(300)
assert.equal(await ev(`document.documentElement.dataset.theme`), 'dark', 'cruza 19:00 y pasa a oscuro en vivo')

// Documento HTML sigue al tema: se lee dentro del iframe pidiéndole su data-tema por captura de pantalla + sonda de mensajes.
await ir(22, '/tmp/plan.html')
await ev(`window.__t=[];addEventListener('message',e=>{});0`)
const nodos = await cdp('Target.getTargets'); const marco = nodos.targetInfos.find(t => t.url.includes('/crudo/plan.html'))
assert.ok(marco, 'el iframe cargó con el tema'); assert.ok(marco.url.includes('tema=oscuro'), 'nace con ?tema=oscuro')
await ev(`document.documentElement.classList.contains('dark')`)
// Cambio manual a claro (botón de tema) → postMessage al iframe.
await ev(`localStorage.setItem('arbrain-hora-forzada','12'); window.dispatchEvent(new Event('focus'))`); await dormir(500)
await foto('html-claro-en-vivo.png')

// Zoom: ⌘+rueda sobre el documento md, persistido por pestaña.
await ir(12, '/tmp/n.md')
const caja = await ev(`(()=>{const r=document.querySelector('aside [class*=zoomable]').getBoundingClientRect();return [r.x+r.width/2,r.y+60]})()`)
for (let i = 0; i < 3; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: caja[0], y: caja[1], deltaX: 0, deltaY: -100, modifiers: 4 })
await dormir(300)
const z = await ev(`getComputedStyle(document.querySelector('aside [class*=zoomable]')).zoom`)
assert.ok(Number(z) > 1.2, `zoom por rueda ${z}`)
assert.ok(JSON.parse(await ev(`localStorage.getItem('arbrain.zoomPestana')`))['doc:/tmp/n.md'] > 1.2, 'recordado por pestaña')
assert.equal(await ev(`document.documentElement.scrollWidth <= window.innerWidth`), true, 'sin scroll horizontal con zoom')
await foto('zoom-md.png')

// Zoom dentro del iframe aislado: la rueda ⌘ se reenvía por postMessage.
await ir(12, '/tmp/plan.html')
await ev(`window.__m=[];addEventListener('message',e=>__m.push(JSON.stringify(e.data).slice(0,50)))`)
const f = await ev(`(()=>{const r=document.querySelector('aside iframe').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)
for (let i = 0; i < 3; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: f[0], y: f[1], deltaX: 0, deltaY: -100, modifiers: 4 })
await dormir(400)
console.log('IFRAME-RUEDA', await ev(`JSON.stringify(__m.slice(0,3))+' '+localStorage.getItem('arbrain.zoomPestana')`))
// Expandir de la pestaña (lienzo): mismo nodo, mismo scroll, misma ruta; Esc o el mismo botón regresan.
await ev(`(()=>{const l=document.getElementById('lienzo');l.scrollTo(300,200);window.__nodo=l;window.__ruta=location.href})()`)
await foto('lienzo-antes.png')
await ev(`document.querySelector('[data-testid=enfoque-pestana]').click()`); await dormir(300)
assert.equal(await ev(`document.getElementById('lienzo')===window.__nodo && __nodo.scrollLeft===300 && __nodo.scrollTop===200 && location.href===__ruta`), true, 'expandir conserva nodo, scroll y ruta')
await foto('lienzo-enfoque.png')
await ev(`document.querySelector('[data-testid=enfoque-pestana]').click()`); await dormir(300)
assert.equal(await ev(`document.getElementById('lienzo')===__nodo && __nodo.scrollLeft===300 && document.documentElement.dataset.enfoque===undefined`), true, 'el mismo botón regresa al estado anterior')
await foto('lienzo-despues.png')
// Enfoque: chat y barra se ocultan, el panel toma el ancho, el borrador sobrevive; Esc regresa.
await ev(`document.getElementById('borrador').value='mi borrador'`)
const antes = await ev(`document.querySelector('aside').getBoundingClientRect().width`)
await ev(`document.querySelector('[data-testid=enfoque-panel]').click()`); await dormir(300)
const despues = await ev(`document.querySelector('aside').getBoundingClientRect().width`)
assert.ok(despues > 1300 && antes < 600, `enfoque ${antes} → ${despues}`)
assert.equal(await ev(`getComputedStyle(document.querySelector('main')).display`), 'none')
await foto('enfoque.png')
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await dormir(300)
assert.equal(await ev(`document.querySelector('aside').getBoundingClientRect().width`), antes, 'Esc regresa')
assert.equal(await ev(`document.getElementById('borrador').value`), 'mi borrador', 'el borrador sigue ahí')

// Teléfono (390 px): pellizco de dos dedos en el md y dentro del iframe; sin scroll horizontal.
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true })
const pellizcar = async (x, y, de, a, sid) => {
  const t = d => [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }]
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: t(de) }, sid)
  for (let i = 1; i <= 8; i++) await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: t(de + (a - de) * i / 8) }, sid)
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sid); await dormir(300)
}
for (const [doc, sel, nombre] of [['/tmp/n.md', 'aside [class*=zoomable]', 'movil-md'], ['/tmp/plan.html', null, 'movil-html']]) {
  await cdp('Page.navigate', { url: 'about:blank' })
  await cdp('Page.navigate', { url: BASE + '/' }); await dormir(300)
  await ev(`localStorage.clear(); localStorage.setItem('arbrain-hora-forzada','22')`)
  await cdp('Page.navigate', { url: BASE + '/?movil=1&doc=' + encodeURIComponent(doc) }); await dormir(1800)
  await foto(nombre + '-antes.png')
  const [cx, cy] = await ev(`(()=>{const e=document.querySelector('aside [class*=zoomable]')||document.querySelector('aside iframe');const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+Math.min(r.height/2,120)]})()`)
  await ev(`window.__tt=[];for(const t of ['touchstart','touchmove','touchend'])document.addEventListener(t,e=>__tt.push(t+e.touches.length),true)`)
  await ev(`window.__m=[];addEventListener('message',e=>__m.push(JSON.stringify(e.data).slice(0,60)))`)
  let sesion = null
  if (!sel) {
    const alvo = (await cdp('Target.getTargets')).targetInfos.find(t => t.url.includes('/crudo/plan.html'))
    console.log('ALVO', alvo?.type, alvo?.targetId)
    if (alvo) { sesion = (await cdp('Target.attachToTarget', { targetId: alvo.targetId, flatten: true })).sessionId
      await cdp('Runtime.evaluate', { expression: `window.__tt=[];for(const t of ['touchstart','touchmove','touchend'])addEventListener(t,e=>__tt.push(t+e.touches.length),true)` }, sesion) }
  }
  if (sesion) {
    const [sw, cw] = JSON.parse((await cdp('Runtime.evaluate', { expression: `JSON.stringify([document.documentElement.scrollWidth, document.documentElement.clientWidth])`, returnByValue: true }, sesion)).result.value)
    console.log('IFRAME-ANCHO', sw, cw); assert.ok(sw <= cw + 1, `el documento del iframe no desborda (${sw} > ${cw})`)
    // CDP no entrega toques reales al iframe aislado (OOPIF sandbox): se prueba el script inyectado con TouchEvent sintéticos dentro de él.
    await cdp('Runtime.evaluate', { expression: `(()=>{const T=(x,y,id)=>new Touch({identifier:id,target:document.body,clientX:x,clientY:y});
      const ev=(t,ps)=>document.body.dispatchEvent(new TouchEvent(t,{bubbles:true,cancelable:true,touches:ps,targetTouches:ps,changedTouches:ps}));
      ev('touchstart',[T(150,200,1),T(230,200,2)]);for(let i=1;i<=8;i++){const d=40+60*i/8;ev('touchmove',[T(190-d,200,1),T(190+d,200,2)])}ev('touchend',[])})()` }, sesion)
    await dormir(300)
  } else await pellizcar(cx, cy, 40, 100)
  if (sesion) console.log('TOQUES-EN-IFRAME', (await cdp('Runtime.evaluate', { expression: `JSON.stringify(__tt.slice(0,5))`, returnByValue: true }, sesion)).result.value)
  if (!sel) console.log('DBG', cx, cy, await ev(`JSON.stringify(__m.slice(0,4))+' '+localStorage.getItem('arbrain.zoomPestana')`))
  if (sel) assert.ok(Number(await ev(`getComputedStyle(document.querySelector('${sel}')).zoom`)) > 1.5, 'pellizco agranda el md')
  else assert.ok(JSON.parse(await ev(`localStorage.getItem('arbrain.zoomPestana')||'{}'`))['doc:/tmp/plan.html'] > 1.5, 'pellizco en el iframe agranda y se recuerda')
  assert.equal(await ev(`document.documentElement.scrollWidth <= window.innerWidth`), true, 'sin scroll horizontal a 390 px')
  await foto(nombre + '-pellizco.png')
}
console.log('OK · capturas en', SALIDA)
fin(); process.exit(0)
