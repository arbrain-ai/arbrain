// «Escuchar» en la pestaña de un documento, de verdad (7 oct 2026): pergaminos reales en Chrome sin pantalla.
//   node tests/panel/e2e/lector/ejecutar.mjs [carpeta de capturas]    (desde arbrain/)
// Real: VistaDocumento, EscucharDocumento, el motor chat-speech.ts, el agente inyectado por inyectarTema, el iframe
// aislado, el resaltado (CSS Highlight). Simulada: SOLO la salida de voz (speechSynthesis), que emite un `boundary` por
// palabra como la voz del sistema; un Chrome sin pantalla no tiene altavoz y así la prueba no habla en voz alta.
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const DOCS = resolve(raiz, '../docs/business-os')
const SALIDA = resolve(process.argv[2] ?? join(tmpdir(), 'capturas-lector')); mkdirSync(SALIDA, { recursive: true })
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const dist = mkdtempSync(join(tmpdir(), 'lector-e2e-')), perfil = mkdtempSync(join(tmpdir(), 'lector-chrome-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)

execFileSync(ESBUILD, [join(aqui, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(raiz, 'tests/panel/e2e/runtime-stub.ts')}`,
  '--define:process.env.NODE_ENV="development"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
// El CSS real de la app (Tailwind v4 sobre globals.css): la barra del chat se pinta con sus clases.
const postcss = (await import(join(raiz, 'node_modules/postcss/lib/postcss.js'))).default
const tailwind = (await import(join(raiz, 'node_modules/@tailwindcss/postcss/dist/index.mjs'))).default
const globales = join(raiz, 'src/app/globals.css')
writeFileSync(join(dist, 'tailwind.css'), (await postcss([tailwind()]).process(readFileSync(globales, 'utf8'), { from: globales })).css)
// El mismo inyector que usa la ruta real.
execFileSync(ESBUILD, [join(raiz, 'src/features/cabina/documento/tema-html.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${join(dist, 'tema-html.mjs')}`, '--log-level=error'], { cwd: raiz })
const { inyectarTema } = await import(join(dist, 'tema-html.mjs'))

const TOKENS = `:root{--background:#faf8fc;--surface:#fff;--card:#fff;--foreground:#1d1726;--muted:#7a7088;--border:#e7e1ef;--brand:#7c3aed;--brand-rgb:124,58,237;--gold-rgb:245,158,11}
:root.dark{--background:#09090b;--surface:#101014;--card:#16161c;--foreground:#f7f8f8;--muted:#a1a1aa;--border:#2c2c34;--brand:#a78bfa;--brand-rgb:167,139,250}
body{margin:0;background:var(--background);color:var(--foreground);font:14px system-ui}`
// Voz simulada: un boundary por palabra cada 70 ms, luego onend. Registra lo que se "dice".
const VOZ = `(()=>{const S=speechSynthesis;let t=null;window.__dicho=[];
  S.getVoices=()=>[];
  S.speak=u=>{window.__dicho.push(u.text);let i=0;const w=[...u.text.matchAll(/\\S+/g)];setTimeout(()=>{u.onstart&&u.onstart({});
    t=setInterval(()=>{if(i>=w.length){clearInterval(t);t=null;u.onend&&u.onend({});return}u.onboundary&&u.onboundary({name:'word',charIndex:w[i].index,elapsedTime:0});i++},70)},30)};
  S.cancel=()=>{if(t){clearInterval(t);t=null}};S.pause=()=>{if(t){clearInterval(t);t=null}};S.resume=()=>{};
  Object.defineProperty(S,'speaking',{get:()=>!!t,configurable:true});Object.defineProperty(S,'paused',{get:()=>false,configurable:true})})()`
const PAGINA = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style><div id="raiz"></div><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/entrada.css"><script>${VOZ}</script><script src="/entrada.js"></script>`
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
const LARGO_TXT = Array.from({ length: 400 }, (_, i) => `Párrafo ${[...String(i + 1)].map(d => 'abcdefghij'[d]).join('')} de un texto muy largo. Tiene dos frases para que el motor las parta. La segunda va aquí.`).join('\n\n')

const servidor = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname)
  const json = o => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o))
  if (p === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA)
  if (p === '/api/cabina/documento') {
    const r = u.searchParams.get('ruta')
    if (r.endsWith('.html')) return json({ ruta: r, archivo: 'index.html', tipo: 'html', editable: false, url: '/crudo/' + r.replace(/^\//, ''), hash: 'h1' })
    if (r.endsWith('.txt')) return json({ ruta: r, archivo: 'largo.txt', tipo: 'txt', editable: true, texto: LARGO_TXT, hash: 'h3' })
    return json({ ruta: r, archivo: 'README.md', tipo: 'md', editable: true, texto: readFileSync(join(DOCS, r.replace(/^\/docs\/business-os\//, '')), 'utf8'), hash: 'h2' })
  }
  if (p.startsWith('/crudo/docs/business-os/')) {
    const f = join(DOCS, p.slice('/crudo/docs/business-os/'.length))
    if (!existsSync(f) || !statSync(f).isFile()) return res.writeHead(404).end()
    const cuerpo = extname(f) === '.html' ? Buffer.from(inyectarTema(readFileSync(f, 'utf8'), u.searchParams.get('tema'))) : readFileSync(f)
    return res.writeHead(200, { 'content-type': TIPOS[extname(f)] ?? 'application/octet-stream' }).end(cuerpo)
  }
  if (p.startsWith('/api/')) return json({ ok: true })
  const f = join(dist, p); if (existsSync(f)) return res.writeHead(200, { 'content-type': TIPOS[extname(f)] ?? 'text/plain' }).end(readFileSync(f))
  res.writeHead(404).end()
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`

const PUERTO = 9800 + Math.floor(Math.random() * 300)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--window-size=1100,860', 'about:blank'], { stdio: 'ignore' })
const fin = () => { try { chrome.kill('SIGKILL') } catch {} servidor.close() }
process.on('exit', fin); setTimeout(() => { console.log('TIEMPO AGOTADO'); fin(); process.exit(2) }, 240_000).unref()
async function jsonCdp(r) { for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${PUERTO}${r}`)).json() } catch { await dormir(100) } } throw new Error('sin Chrome') }
const ws = new WebSocket((await jsonCdp('/json/list')).find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let n = 0; const esp = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && esp.has(m.id)) { const [ok, mal] = esp.get(m.id); esp.delete(m.id); m.error ? mal(new Error(m.error.message)) : ok(m.result) } }
const cdp = (method, params = {}, sessionId) => new Promise((ok, mal) => { const id = ++n; esp.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
const ev = async (expr, sid) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'excepción'); return r.result.value }
const foto = async nombre => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SALIDA, nombre), Buffer.from(data, 'base64')); log('captura', nombre) }
await cdp('Page.enable'); await cdp('Runtime.enable')
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') console.log('EXC', m.params.exceptionDetails.exception?.description?.slice(0, 300)) })

const abrir = async (doc, extra = '') => {
  await cdp('Page.navigate', { url: 'about:blank' })
  await cdp('Page.navigate', { url: BASE + '/' }); await dormir(300)
  await ev(`localStorage.setItem('arbrain-hora-forzada','12'); localStorage.removeItem('arbrain-lector-doc-vel')`)
  await cdp('Page.navigate', { url: BASE + '/?doc=' + encodeURIComponent(doc) + extra }); await dormir(2500)
}
/** Sesión dentro del iframe aislado (origen opaco): solo CDP puede asomarse. */
const sesionIframe = async () => {
  const t = (await cdp('Target.getTargets')).targetInfos.find(t => t.url.includes('/crudo/'))
  assert.ok(t, 'el iframe del documento es un target')
  return (await cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId
}
const botonEscuchar = `document.querySelector('[aria-label="Escuchar documento"],[aria-label="Detener lectura"]')`
const estado = () => ev(`(()=>{const s=__motor.getState();return JSON.stringify({id:s.id,paused:s.paused,rate:s.rate,idx:s.idx,total:s.total})})()`).then(JSON.parse)
const palabra = sid => ev(`(()=>{const h=CSS.highlights.get('arbrain-lector');if(!h)return null;const r=[...h][0];return r?r.toString():null})()`, sid)
const palabraLocal = () => ev(`(()=>{const h=CSS.highlights.get('arbrain-lector');if(!h)return null;const r=[...h][0];return r?r.toString():null})()`)

// ── 0 · El botón y la barra flotando dentro del documento: ventana grande, panel a ~520 px y móvil ──
const CASOS = [['grande', 1400, 900, 'claro'], ['panel-520', 520, 860, 'claro'], ['panel-520-oscuro', 520, 860, 'oscuro'], ['movil', 390, 800, 'claro'],
  // Ventana grande en otro monitor (Daniel, 7 oct): pergamino real, sin tope de ancho del panel, también con el zoom de la app (WKWebView).
  ['ventana-1440', 1440, 900, 'claro', 'pergamino'], ['ventana-2000', 2000, 1200, 'claro', 'pergamino'], ['ventana-2000-zoom', 2000, 1200, 'claro', 'pergamino', 1.35],
  ['panel-520-pergamino', 520, 860, 'claro', 'pergamino'], ['movil-pergamino', 390, 800, 'claro', 'pergamino']]
for (const [nombre, ancho, vista, tema, cual = 'regulador', zoomApp = 1] of CASOS) {
  log('——', nombre)
  await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: vista, deviceScaleFactor: 2, mobile: nombre.startsWith('movil') })
  await abrir(`/docs/business-os/cerebro-artificial-${cual}/index.html`, nombre === 'grande' ? '&ancho=900' : nombre.startsWith('ventana') ? '&ancho=' + ancho : '')
  if (zoomApp !== 1) { await ev(`document.documentElement.style.zoom='${zoomApp}';document.documentElement.style.setProperty('--ui-zoom','${zoomApp}')`); await dormir(600) }
  if (tema === 'oscuro') await ev(`document.documentElement.classList.add('dark')`)
  const sid = await sesionIframe()
  await dormir(800)
  const R = `(s,d)=>{const e=document.querySelector(s);const r=e&&e.getBoundingClientRect();return r&&{l:r.left+d,r:r.right+d,t:r.top,b:r.bottom}}`
  const marco = JSON.parse(await ev(`JSON.stringify((${R})('iframe',0))`))
  const temaB = () => ev(`JSON.stringify((${R})('#tema-btn',0))`, sid).then(JSON.parse).then(r => ({ l: r.l + marco.l, r: r.r + marco.l, t: r.t + marco.t, b: r.b + marco.t }))
  const q = s => ev(`JSON.stringify((${R})(${JSON.stringify(s)},0))`).then(JSON.parse)
  const th = await temaB()
  const bt = await q('[aria-label="Escuchar documento"]')
  log('botón', JSON.stringify(bt), '· tema', JSON.stringify(th), '· marco', JSON.stringify(marco))
  assert.ok(bt && bt.t >= marco.t && bt.r <= th.l + 1 && th.l - bt.r < 20, 'en reposo: solo el botón, pegado a la izquierda de «tema»')
  assert.equal(await ev(`document.querySelector('[aria-label="Lectura del documento"]')`), null, 'en reposo no hay barra')
  assert.equal(await ev(`document.querySelector('header [aria-label="Escuchar documento"]')`), null, 'no está en la tira de pestañas')
  await foto(`barra-${nombre}-reposo.png`)
  await ev(`${botonEscuchar}.click()`)
  for (let i = 0; i < 80 && (await estado()).id == null; i++) await dormir(100)
  await dormir(500)
  const br = await q('[aria-label="Lectura del documento"]')
  log('barra', JSON.stringify(br))
  assert.ok(br && br.l >= marco.l - 2 && br.r <= marco.r + 2, 'la barra cabe dentro del documento')
  assert.ok(Math.abs((br.l + br.r) / 2 - (marco.l + marco.r) / 2) < 4, 'centrada')
  
  const marcoL = JSON.parse(await ev(`JSON.stringify((${R})('iframe',0))`))
  const cuerpo = await q('[data-vista]')
  assert.ok(br.t >= cuerpo.t && br.t - cuerpo.t < 20, 'franja propia, pegada bajo la tira de pestañas y sin cortarse por arriba')
  assert.ok(br.b <= marcoL.t + 1, 'la barra no tapa el documento: el marco empieza debajo de ella')
  assert.ok(marcoL.b <= cuerpo.b + 1, 'el documento no desborda el panel')
  const txt = await ev(`document.querySelector('[aria-label="Lectura del documento"]').innerText.replace(/\s+/g,' ')`)
  assert.match(txt, /^\d+\/\d+\s/, 'contador n/N'); assert.match(txt, /1x/, 'velocidad')
  for (const a of ['Velocidad', 'Párrafo anterior', 'Pausar lectura', 'Párrafo siguiente', 'Detener lectura']) assert.ok(await ev(`!!document.querySelector('[aria-label^="${a}"]')`), a)
  assert.ok(await ev(`!!document.querySelector('[aria-label="Lectura del documento"] [style*="width"]')`), 'barra de progreso')
  await ev(`document.querySelector('[aria-label="Pausar lectura"]').click()`); await dormir(300) // quieta: el índice no corre mientras se mide
  const i0 = (await estado()).idx
  await ev(`document.querySelector('[aria-label="Párrafo siguiente"]').click()`); await dormir(500)
  assert.equal((await estado()).idx, i0 + 1, 'siguiente salta de bloque')
  await ev(`document.querySelector('[aria-label="Párrafo anterior"]').click()`); await dormir(500)
  assert.equal((await estado()).idx, i0, 'anterior vuelve un bloque')
  await ev(`document.querySelector('[aria-label="Reanudar lectura"]').click()`); await dormir(300)
  await ev(`window.scrollTo(0, 900)`, sid); await dormir(300)
  const br2 = await q('[aria-label="Lectura del documento"]'); assert.equal(br2.t, br.t, 'visible al hacer scroll')
  await foto(`barra-${nombre}-leyendo.png`)
  await ev(`document.querySelector('[aria-label="Detener lectura"]').click()`); await dormir(400)
  assert.ok(await q('[aria-label="Escuchar documento"]'), 'al detener vuelve el botón')
}
await cdp('Emulation.clearDeviceMetricsOverride')
if (process.env.SOLO_BARRA) { log('solo barra: listo'); process.exit(0) }

// ── 1 · Los dos pergaminos (HTML aislado en iframe) ──
for (const [doc, etiqueta, esperaBloques] of [
  ['/docs/business-os/cerebro-artificial-pergamino/index.html', 'pergamino', 60],
  ['/docs/business-os/cerebro-artificial-regulador/index.html', 'regulador', 60],
]) {
  log('——', etiqueta)
  await abrir(doc)
  const sid = await sesionIframe()
  await ev(`window.__lt=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>__lt.push(Math.round(e.duration)))).observe({entryTypes:['longtask']})`)
  await ev(`window.__lt=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>__lt.push(Math.round(e.duration)))).observe({entryTypes:['longtask']})`, sid)
  assert.equal(await ev(`${botonEscuchar}?.getAttribute('aria-label')`), 'Escuchar documento', 'hay botón Escuchar en la pestaña')
  const t0 = Date.now()
  await ev(`${botonEscuchar}.click()`)
  for (let i = 0; i < 80 && (await estado()).id == null; i++) await dormir(100)
  const st = await estado()
  log('arrancó en', Date.now() - t0, 'ms ·', st.total, 'bloques')
  assert.equal(st.id, 'doc:f1', 'el motor lee el documento de la pestaña')
  assert.ok(st.total >= esperaBloques, `bloques leídos (${st.total})`)

  // Lo que NO se lee: nada de menús, pies de lámina, código ni títulos de figura.
  await dormir(1500)
  const lo = await ev(`JSON.stringify(__motor.blocks.map(b=>b.textContent.replace(/\\s+/g,' ').trim()))`)
  const bloques = JSON.parse(lo)
  assert.equal(bloques.some(t => /^0\d · /.test(t)), false, 'los pies de lámina (figcaption «01 · …») no se leen')
  assert.equal(bloques.some(t => /ctrl\+t|cambiar tema/i.test(t)), false, 'el botón de tema no se lee')
  writeFileSync(join(SALIDA, `${etiqueta}-bloques-leidos.txt`), bloques.map((t, i) => `${i + 1}. ${t}`).join('\n'))

  // El resaltado sigue la palabra DENTRO del documento y avanza.
  const a = await palabra(sid); await dormir(900); const b = await palabra(sid); await dormir(900); const c = await palabra(sid)
  log('resaltado:', JSON.stringify([a, b, c]))
  assert.ok(a && b && c && new Set([a, b, c]).size >= 2, 'el resaltado se mueve palabra por palabra')
  await foto(`${etiqueta}-resaltado.png`)

  // Pausa y reanudación (la palabra donde quedó se conserva).
  await ev(`document.querySelector('[aria-label="Pausar lectura"]').click()`); await dormir(400)
  assert.equal((await estado()).paused, true, 'pausa')
  const quieta = await palabra(sid); await dormir(700)
  assert.equal(await palabra(sid), quieta, 'en pausa el resaltado no avanza')
  await foto(`${etiqueta}-pausa.png`)
  await ev(`document.querySelector('[aria-label="Reanudar lectura"]').click()`); await dormir(900)
  assert.equal((await estado()).paused, false, 'reanuda')

  // Velocidad: ajustable y recordada.
  await ev(`document.querySelector('[aria-label^="Velocidad"]').click()`); await dormir(200)
  const v = (await estado()).rate
  assert.ok(v > 1, `velocidad subió a ${v}`)
  assert.equal(Number(await ev(`localStorage.getItem('arbrain-lector-doc-vel')`)), v, 'la última velocidad se guarda')

  // Tocar un párrafo salta ahí: toque REAL con el ratón sobre un párrafo del medio del documento (lejos de donde va la voz).
  const antes = (await estado()).idx
  let destino = Math.floor(bloques.length * 0.55)
  while (bloques[destino].length < 50 || bloques.filter(t => t.startsWith(bloques[destino].slice(0, 50))).length > 1) destino++ // texto largo y único: sin ambigüedad al ubicarlo
  const clave = JSON.stringify(bloques[destino].slice(0, 50))
  const caja = JSON.parse(await ev(`(()=>{const p=[...document.querySelectorAll('p,li,h2,h3,h4,blockquote')].find(p=>p.textContent.replace(/\\s+/g,' ').trim().startsWith(${clave}));if(!p)return 'null';p.scrollIntoView({block:'center',behavior:'instant'});const r=p.getBoundingClientRect();return JSON.stringify({x:r.x+Math.min(60,r.width/3),y:r.y+Math.min(14,r.height/2),t:${clave}})})()`, sid))
  assert.ok(caja, 'el párrafo de destino existe en el documento')
  await dormir(300)
  const f = JSON.parse(await ev(`(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return JSON.stringify([r.x,r.y])})()`))
  const x = f[0] + caja.x, y = f[1] + caja.y
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  await dormir(900)
  const despues = await estado()
  log('toque en «' + caja.t + '» → bloque', antes + 1, '→', despues.idx + 1, '(esperado', destino + 1 + ')')
  assert.equal(despues.idx, destino, 'tocar un párrafo salta exactamente ahí')
  assert.ok(await palabra(sid), 'tras el salto hay palabra resaltada')
  await foto(`${etiqueta}-salto.png`)

  // Hilo principal: ninguna tarea larga (>200 ms) por la extracción ni por la lectura.
  const largas = [...JSON.parse(await ev(`JSON.stringify(__lt)`)), ...JSON.parse(await ev(`JSON.stringify(__lt)`, sid))]
  log('tareas largas (ms):', JSON.stringify(largas))
  assert.ok(largas.every(d => d < 250), `sin congelar el hilo: ${largas}`)

  // Detener limpia el resaltado.
  await ev(`${botonEscuchar}.click()`); await dormir(500)
  assert.equal((await estado()).id, null, 'detener')
  assert.equal(await palabra(sid), null, 'sin resaltado al detener')
}

// ── 2 · La velocidad recordada se aplica al abrir otra vez ──
await abrir('/docs/business-os/cerebro-artificial-regulador/index.html')
await ev(`localStorage.setItem('arbrain-lector-doc-vel','1.75')`)
await ev(`${botonEscuchar}.click()`)
for (let i = 0; i < 80 && (await estado()).id == null; i++) await dormir(100)
assert.equal((await estado()).rate, 1.75, 'arranca a la última velocidad')
await ev(`${botonEscuchar}.click()`); await dormir(300)

// ── 3 · Markdown y texto largo (mismo DOM de la app, sin iframe) ──
await abrir('/docs/business-os/cerebro-artificial-pergamino/README.md')
await ev(`${botonEscuchar}.click()`)
for (let i = 0; i < 80 && (await estado()).id == null; i++) await dormir(100)
let st = await estado(); if (st.id !== 'doc:f1') console.log('DBG md', await ev(`document.querySelector('aside').innerText.slice(0,600)+' || '+document.querySelectorAll('[data-lector-dom]').length+' '+(document.querySelector('[role=status]')?.textContent||'')`))
assert.equal(st.id, 'doc:f1'); log('md:', st.total, 'bloques')
await dormir(1200)
assert.ok(await palabraLocal(), 'resalta dentro del markdown')
await foto('md-resaltado.png')
await ev(`${botonEscuchar}.click()`); await dormir(300)

await abrir('/tmp/largo.txt')
const t1 = Date.now()
await ev(`window.__lt=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>__lt.push(Math.round(e.duration)))).observe({entryTypes:['longtask']})`)
await ev(`${botonEscuchar}.click()`)
for (let i = 0; i < 80 && (await estado()).id == null; i++) await dormir(100)
st = await estado(); if (!st.id) console.log('DBG txt', await ev(`document.querySelectorAll('[data-lector-dom] p').length+' '+document.querySelector('aside').innerText.slice(0,200)+' '+(document.querySelector('[role=status]')?.textContent||'')`))
log('txt largo:', st.total, 'párrafos, listo en', Date.now() - t1, 'ms')
assert.equal(st.total, 400, 'cada párrafo del txt es un bloque')
await dormir(1000)
assert.ok(await palabraLocal(), 'resalta en el txt')
// Tocar un párrafo del txt.
await ev(`document.querySelectorAll('aside [class*=txt]')[1]?.click()`)
const largas = JSON.parse(await ev(`JSON.stringify(__lt)`)); log('tareas largas (txt de 400 párrafos):', JSON.stringify(largas))
assert.ok(largas.every(d => d < 250), 'txt largo sin congelar el hilo')
await ev(`${botonEscuchar}.click()`)

console.log('OK · capturas en', SALIDA)
fin(); process.exit(0)
