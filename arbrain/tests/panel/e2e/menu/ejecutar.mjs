// Prueba de navegador del arrastre con la manija del menú «+» (6 oct 2026), a 520 px de ancho.
//   node tests/panel/e2e/menu/ejecutar.mjs     (desde arbrain/)
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const dist = mkdtempSync(join(tmpdir(), 'menu-e2e-')), perfil = mkdtempSync(join(tmpdir(), 'menu-chrome-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))

execFileSync(ESBUILD, [join(aqui, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(aqui, '../runtime-stub.ts')}`,
  '--define:process.env.NODE_ENV="development"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })

const TOKENS = `:root{--background:#faf8fc;--surface:#fff;--card:#fff;--foreground:#1d1726;--foreground-rgb:29,23,38;--muted:#7a7088;--border:#e7e1ef;--brand:#7c3aed;--brand-rgb:124,58,237}
body{margin:0;background:var(--background);color:var(--foreground);font:14px system-ui}`
const PAGINA = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style><div id="raiz"></div><link rel="stylesheet" href="/entrada.css"><script src="/entrada.js"></script>`
// El servidor de ajustes del panel (arbrain/server/src/cabina/panel-ajustes.ts) en miniatura: una sola config en memoria.
const BASE_IDS = ['calendario', 'tareas', 'lienzo', 'negocio', 'reporte', 'centro', 'equipo', 'salud', 'contenido', 'finanzas', 'taller']
const srv = { existe: false, rev: 0, orden: [...BASE_IDS], ocultas: ['equipo', 'reporte'], posts: [] }
const ajustes = () => ({ rev: srv.rev, orden: srv.orden, ocultas: srv.ocultas })
const servidor = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname
  const json = o => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o))
  if (p === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA)
  if (p === '/api/cabina/panel-ajustes') {
    if (req.method === 'GET') return json({ ajustes: ajustes(), existe: srv.existe })
    let cuerpo = ''; req.on('data', c => (cuerpo += c)); req.on('end', () => {
      const b = JSON.parse(cuerpo || '{}'); srv.posts.push(b)
      if (b.accion === 'migrar') { if (srv.existe) return json({ ajustes: ajustes(), existe: true, migrado: false }); srv.existe = true; srv.rev++; srv.orden = [...b.orden]; return json({ ajustes: ajustes(), existe: true, migrado: true }) }
      if (b.accion === 'guardar') { srv.existe = true; srv.rev++; if (b.orden) srv.orden = b.orden; if (b.ocultas) srv.ocultas = b.ocultas; return json({ ajustes: ajustes(), existe: true }) }
      if (b.accion === 'restablecer') { srv.existe = true; srv.rev++; srv.orden = [...BASE_IDS]; srv.ocultas = ['equipo', 'reporte']; return json({ ajustes: ajustes(), existe: true }) }
      res.writeHead(400).end('{}')
    })
    return
  }
  if (p.startsWith('/api/')) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ entradas: [], paginas: [], carpetas: [] }))
  const f = join(dist, p); if (existsSync(f)) return res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f))
  res.writeHead(404).end()
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`

const PUERTO = 9300 + Math.floor(Math.random() * 300)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--window-size=520,820', 'about:blank'], { stdio: 'ignore' })
const fin = () => { try { chrome.kill('SIGKILL') } catch {} servidor.close() }
process.on('exit', fin); setTimeout(() => { console.log('TIEMPO AGOTADO'); fin(); process.exit(2) }, 90_000).unref()
async function json(r) { for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${PUERTO}${r}`)).json() } catch { await dormir(100) } } throw new Error('sin Chrome') }
const ws = new WebSocket((await json('/json/list')).find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let n = 0; const esp = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && esp.has(m.id)) { const [ok, mal] = esp.get(m.id); esp.delete(m.id); m.error ? mal(new Error(m.error.message)) : ok(m.result) } }
const cdp = (method, params = {}) => new Promise((ok, mal) => { const id = ++n; esp.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params })) })
const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') console.log('EXC', m.params.exceptionDetails.exception?.description?.slice(0, 300)) })
await cdp('Page.enable'); await cdp('Runtime.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: 520, height: 820, deviceScaleFactor: 1, mobile: false })

const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra })
const centro = sel => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const orden = () => ev(`[...document.querySelectorAll('[data-opcion]')].map(f => f.dataset.opcion).join()`)
let fallos = 0
const prueba = async (nombre, f) => { try { await f(); console.log('ok  ', nombre) } catch (e) { fallos++; console.log('FALLA', nombre, '\n     ', e.message) } }

const sel = id => `[data-opcion="${id}"]`
const abrirMenu = async () => { await ev(`document.querySelector('button[aria-haspopup="menu"]').click()`); await dormir(350) }
const recargar = async (legado) => {
  await cdp('Page.navigate', { url: 'about:blank' })
  await cdp('Page.navigate', { url: BASE + '/' }); await dormir(500)
  await ev(`localStorage.clear(); ${legado ? `localStorage.setItem('arbrain.panelDerecho.menuOrden', ${JSON.stringify(JSON.stringify(legado))})` : ''}`)
  await cdp('Page.navigate', { url: BASE + '/' }); await dormir(700)
  await abrirMenu()
}
const manija = id => `${sel(id)} [data-manija]`
/** Aprieta la manija de `id`, la lleva a `hastaY` y devuelve lo que se ve en pleno vuelo; suelta si `soltar`. */
async function arrastrarManija(id, hastaY, { soltar = true } = {}) {
  const fila = await centro(sel(id)); await mouse('mouseMoved', fila.x, fila.y); await dormir(100)
  const m = await centro(manija(id)); await mouse('mouseMoved', m.x, m.y); await dormir(80)
  await mouse('mousePressed', m.x, m.y)
  for (let i = 1; i <= 16; i++) { await mouse('mouseMoved', m.x, m.y + (hastaY - m.y) * i / 16); await dormir(20) }
  const vuelo = await ev(`[...document.querySelectorAll('[data-opcion]')].map(f => ({ id: f.dataset.opcion, t: f.style.transform, arr: f.hasAttribute('data-arrastrada'), top: Math.round(f.getBoundingClientRect().top) }))`)
  if (soltar) { await mouse('mouseReleased', m.x, hastaY); await dormir(700) }
  return { vuelo, m }
}

await recargar()
console.log('· orden inicial', await orden())

await prueba('Equipo y «Lo que llegó» ya no salen en el «+» por defecto; Contenido sí', async () => {
  assert.equal(await ev(`document.querySelector('[data-opcion="equipo"]') === null && document.querySelector('[data-opcion="reporte"]') === null`), true)
  assert.equal(await ev(`document.querySelector('[data-opcion="contenido"]') !== null`), true)
  assert.equal((await orden()).split(',').length, 9)
})

await prueba('arrastrar con la manija hacia ARRIBA: Lienzo sube a la primera posición, con hueco y resorte', async () => {
  const primera = await centro(sel('calendario'))
  const { vuelo } = await arrastrarManija('lienzo', primera.y - 14, { soltar: false })
  const lienzo = vuelo.find(f => f.id === 'lienzo'), cal = vuelo.find(f => f.id === 'calendario')
  assert.ok(lienzo.arr && lienzo.t.includes('translateY'), 'la fila tomada debía seguir al cursor: ' + JSON.stringify(lienzo))
  assert.ok(cal.t.includes('translateY'), 'las vecinas debían apartarse (hueco): ' + JSON.stringify(cal))
  assert.equal(await orden(), 'calendario,tareas,lienzo,negocio,centro,salud,contenido,finanzas,taller', 'el orden del DOM no cambia durante el gesto')
  const m = await centro(manija('lienzo'))
  await mouse('mouseReleased', m.x, primera.y - 14); await dormir(700)
  assert.equal((await orden()).split(',')[0], 'lienzo')
  assert.equal(await ev(`[...document.querySelectorAll('[data-opcion]')].every(f => !f.style.transform && !f.hasAttribute('data-arrastrada'))`), true, 'sin transforms residuales')
})

await prueba('arrastrar hacia ABAJO (el caso que fallaba): Calendario baja detrás de Negocio', async () => {
  const neg = await centro(sel('negocio'))
  const antes = await orden()
  assert.equal(antes.split(',')[1], 'calendario')
  await arrastrarManija('calendario', neg.y + 8)
  const despues = (await orden()).split(',')
  assert.equal(despues.indexOf('calendario'), despues.indexOf('negocio') + 1, 'Calendario debía quedar justo detrás de Negocio: ' + despues.join())
})

await prueba('arrastrar hasta el final: Lienzo baja hasta el último lugar', async () => {
  const ultima = await centro(sel('taller'))
  await arrastrarManija('lienzo', ultima.y + 60)
  assert.equal((await orden()).split(',').at(-1), 'lienzo')
})

await prueba('Escape cancela: nada cambia y las filas regresan', async () => {
  const antes = await orden(), neg = await centro(sel('negocio'))
  const { m } = await arrastrarManija('tareas', neg.y, { soltar: false })
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await mouse('mouseReleased', m.x, neg.y); await dormir(600)
  assert.equal(await orden(), antes)
  assert.equal(await ev(`[...document.querySelectorAll('[data-opcion]')].every(f => !f.style.transform)`), true)
})

await prueba('el orden quedó en el servidor (una sola fuente) y sobrevive a recargar', async () => {
  const antes = await orden()
  assert.equal(srv.orden.filter(x => !srv.ocultas.includes(x)).join(), antes, 'servidor y pantalla deben coincidir')
  assert.ok(srv.posts.some(b => b.accion === 'guardar' && Array.isArray(b.orden)))
  await recargar()
  assert.equal(await orden(), antes)
})

await prueba('ocultar una sección (como Ajustes o Levy): deja de salir en el «+»; mostrarla la devuelve', async () => {
  await ev(`window.__ajustes.getState().guardar({ ocultas: ['equipo', 'reporte', 'tareas'] })`); await dormir(400)
  assert.equal(await ev(`document.querySelector('[data-opcion="tareas"]') === null`), true)
  assert.equal(srv.ocultas.join(), 'equipo,reporte,tareas')
  await ev(`window.__ajustes.getState().guardar({ ocultas: ['equipo', 'reporte'] })`); await dormir(400)
  assert.equal(await ev(`document.querySelector('[data-opcion="tareas"]') !== null`), true)
})

await prueba('un cambio de Levy (llega por el latido) se pinta sin recargar', async () => {
  srv.rev++; srv.ocultas = ['equipo', 'reporte', 'salud']
  await ev(`window.__ajustes.getState().recibir(${JSON.stringify(ajustes())}, false)`); await dormir(300)
  assert.equal(await ev(`document.querySelector('[data-opcion="salud"]') === null`), true)
})

await prueba('arrastrar con una sección oculta en medio: las visibles se acomodan y la oculta queda donde estaba', async () => {
  const antes = srv.orden.join()
  const neg = await centro(sel('negocio'))
  await arrastrarManija('calendario', neg.y + 8)
  const nuevo = srv.orden
  assert.equal(nuevo.indexOf('salud'), antes.split(',').indexOf('salud'), 'salud (oculta) no debía moverse de su lugar')
  assert.equal((await orden()).split(',').indexOf('calendario'), 2)
})

await prueba('migración: el orden que el dueño tenía en localStorage sube al servidor una vez y se borra', async () => {
  srv.existe = false; srv.rev = 0; srv.orden = [...BASE_IDS]; srv.ocultas = ['equipo', 'reporte']; srv.posts.length = 0
  await recargar(['taller', 'lienzo', 'calendario'])
  assert.equal((await orden()).split(',')[0], 'taller')
  assert.ok(srv.posts.some(b => b.accion === 'migrar' && b.orden[0] === 'taller'))
  assert.equal(await ev(`localStorage.getItem('arbrain.panelDerecho.menuOrden')`), null, 'el legado se borra tras migrar')
})

await prueba('con el menú abierto en una ventana, Restablecer devuelve el orden de siempre y Equipo fuera', async () => {
  await ev(`window.__ajustes.getState().restablecer()`); await dormir(400)
  assert.equal(await orden(), 'calendario,tareas,lienzo,negocio,centro,salud,contenido,finanzas,taller')
})

await prueba('ocultar Tareas o Taller cierra su pestaña (y solo la de lo que pasó a oculto)', async () => {
  await ev(`window.__ajustes.getState().restablecer()`); await dormir(300)
  await ev(`window.__fijadas.getState().abrirCasa('tareas'); window.__fijadas.getState().abrirCasa('taller'); window.__fijadas.getState().fijar('v-eq', { vista: 'equipo' }, false)`)
  assert.equal(await ev(`window.__fijadas.getState().orden.includes('tareas') && window.__fijadas.getState().taller`), true)
  await ev(`window.__ajustes.getState().guardar({ ocultas: ['equipo', 'reporte', 'tareas'] })`); await dormir(400)
  assert.equal(await ev(`window.__fijadas.getState().orden.includes('tareas')`), false, 'Tareas debía cerrarse')
  assert.equal(await ev(`window.__fijadas.getState().taller`), true, 'el Taller sigue abierto')
  assert.equal(await ev(`window.__fijadas.getState().fijadas.some(f => f.id === 'v-eq')`), true, 'Equipo ya estaba oculto: una pestaña que alguien abrió después no se cierra por otro cambio')
  await ev(`window.__ajustes.getState().guardar({ ocultas: ['equipo', 'reporte', 'tareas', 'taller'] })`); await dormir(400)
  assert.equal(await ev(`window.__fijadas.getState().taller`), false, 'el Taller debía cerrarse')
  await ev(`window.__ajustes.getState().restablecer()`); await dormir(300)
})

// ── Ajustes › Panel: la misma config, con su propia lista ──
await cdp('Page.navigate', { url: BASE + '/?pagina=ajustes' }); await dormir(700)
const filas = () => ev(`[...document.querySelectorAll('[data-fila]')].map(f => f.dataset.fila).join()`)

await prueba('Ajustes › Panel lista TODAS las secciones (Equipo apagado) y trae el enlace «Equipo y organigrama»', async () => {
  assert.equal((await filas()).split(',').length, 11)
  assert.equal(await ev(`document.querySelector('[data-fila="equipo"] [role="switch"]').getAttribute('aria-checked')`), 'false')
  assert.equal(await ev(`document.querySelector('[data-fila="reporte"] [role="switch"]').getAttribute('aria-checked')`), 'false')
  assert.equal(await ev(`document.querySelector('[data-fila="tareas"] [role="switch"]').getAttribute('aria-checked')`), 'true')
  assert.equal(await ev(`document.querySelector('a[href="/equipo"]')?.textContent.includes('Equipo y organigrama')`), true)
})

await prueba('Ajustes: arrastrar con la manija, hacia abajo y hacia arriba', async () => {
  const f = id => `[data-fila="${id}"]`
  // El centro de la FILA tomada (no el de la manija) es lo que cae sobre la vecina: se apunta a 2 px del borde de arriba o de abajo de la destino.
  const mover = async (id, haciaId, abajo) => {
    const m = await centro(`${f(id)} [data-manija]`), propia = await centro(f(id))
    const r = await ev(`(() => { const r = document.querySelector('[data-fila="${haciaId}"]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })()`)
    const y = m.y + ((abajo ? r.bottom - 2 : r.top + 2) - propia.y)
    await mouse('mouseMoved', m.x, m.y); await dormir(60); await mouse('mousePressed', m.x, m.y)
    for (let i = 1; i <= 16; i++) { await mouse('mouseMoved', m.x, m.y + (y - m.y) * i / 16); await dormir(20) }
    await mouse('mouseReleased', m.x, y); await dormir(700)
  }
  await mover('calendario', 'negocio', true)
  let o = (await filas()).split(',')
  assert.equal(o.indexOf('calendario'), o.indexOf('negocio') + 1, 'hacia abajo: ' + o.join())
  await mover('taller', 'calendario', false)
  o = (await filas()).split(',')
  assert.equal(o.indexOf('taller'), o.indexOf('calendario') - 1, 'hacia arriba: ' + o.join())
  assert.equal(srv.orden.join(), o.join(), 'lo que se ve es lo que hay en el servidor')
})

await prueba('Ajustes: el interruptor oculta y muestra (y se escribe en el servidor); Restablecer lo devuelve todo', async () => {
  await ev(`document.querySelector('[data-fila="tareas"] [role="switch"]').click()`); await dormir(400)
  assert.deepEqual([...srv.ocultas].sort(), ['equipo', 'reporte', 'tareas'])
  assert.equal(await ev(`document.querySelector('[data-fila="tareas"] [role="switch"]').getAttribute('aria-checked')`), 'false')
  await ev(`document.querySelector('[data-fila="equipo"] [role="switch"]').click()`); await dormir(400)
  await ev(`document.querySelector('[data-fila="reporte"] [role="switch"]').click()`); await dormir(400)
  assert.deepEqual(srv.ocultas, ['tareas'], 'Equipo y Lo que llegó se vuelven a mostrar desde Ajustes')
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Restablecer')).click()`); await dormir(400)
  assert.deepEqual(srv.ocultas, ['equipo', 'reporte'])
  assert.equal((await filas()), 'calendario,tareas,lienzo,negocio,reporte,centro,equipo,salud,contenido,finanzas,taller')
})

fin(); console.log(fallos ? `${fallos} fallo(s)` : 'todo bien'); process.exit(fallos ? 1 : 0)
