// Prueba de navegador del arrastre de pestañas (1 oct 2026; 5 oct: ventanas con su propia tira, modelo de Chrome): Chrome headless por CDP, con un build propio
// (esbuild, en un directorio temporal; NO toca arbrain/.next). Usa la lógica REAL de arrastre.ts, ventanas.ts,
// fijadas.ts y pestanas-fuera.ts; solo el pintado de las tiras es una maqueta mínima (maqueta.ts).
//   node tests/panel/e2e/ejecutar.mjs     (desde arbrain/)
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../..')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const dist = mkdtempSync(join(tmpdir(), 'arrastre-e2e-'))
const perfil = mkdtempSync(join(tmpdir(), 'arrastre-chrome-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)

// ── Build aparte ──
for (const [entrada, salida] of [['principal.ts', 'principal.js'], ['panel.ts', 'panel.js']]) {
  execFileSync(ESBUILD, [join(aqui, entrada), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, salida)}`,
    `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(aqui, 'runtime-stub.ts')}`,
    '--define:process.env.NODE_ENV="development"', '--log-level=warning'], { cwd: raiz, stdio: 'inherit' })
}
log('build en', dist)

// ── Servidor estático ──
const servidor = createServer((req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname
  const archivo = ruta === '/panel' ? join(aqui, 'panel.html') : ruta === '/' ? join(aqui, 'principal.html') : existsSync(join(dist, ruta)) ? join(dist, ruta) : join(aqui, ruta)
  if (!existsSync(archivo)) { res.writeHead(404).end(); return }
  res.writeHead(200, { 'content-type': archivo.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }).end(readFileSync(archivo))
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`

// ── Chrome ──
const PUERTO = 9400 + Math.floor(Math.random() * 400)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check',
  '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' })
const cerrarTodo = () => { try { chrome.kill('SIGKILL') } catch {} servidor.close() }
process.on('exit', cerrarTodo)
// Tope duro: si algo se cuelga, la prueba no se queda para siempre.
setTimeout(() => { console.log('TIEMPO AGOTADO'); cerrarTodo(); process.exit(2) }, 240_000).unref()

async function json(ruta) { for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${PUERTO}${ruta}`)).json() } catch { await dormir(100) } } throw new Error('Chrome no contesta') }
function conectar(url) {
  return new Promise((ok, mal) => {
    const ws = new WebSocket(url); let n = 0; const esperas = new Map()
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && esperas.has(m.id)) { const [res, rej] = esperas.get(m.id); esperas.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result) } }
    ws.onerror = mal
    ws.onopen = () => ok({ ws, send: (method, params = {}) => new Promise((res, rej) => { const id = ++n; esperas.set(id, [res, rej]); ws.send(JSON.stringify({ id, method, params })) }) })
  })
}
const version = await json('/json/version')
const navegador = await conectar(version.webSocketDebuggerUrl)
const paginas = async () => (await json('/json/list')).filter(t => t.type === 'page')
const ventanasPanel = async () => (await paginas()).filter(t => t.url.includes('/panel'))
const pagina = async (filtro) => { for (let i = 0; i < 60; i++) { const t = (await paginas()).find(filtro); if (t) return t; await dormir(100) } return null }
const evaluar = async (cdp, expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? '')); return r.result.value }
const esperar = async (cdp, expr, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evaluar(cdp, expr).catch(() => false)) return true; await dormir(80) } return false }

async function arrastrar(cdp, de, a, { pasos = 12, soltar = true } = {}) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: de.x, y: de.y })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: de.x, y: de.y, button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= pasos; i++) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: de.x + (a.x - de.x) * i / pasos, y: de.y + (a.y - de.y) * i / pasos, button: 'left', buttons: 1 })
    await dormir(15)
  }
  if (soltar) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: a.y, button: 'left', buttons: 0, clickCount: 1 })
}
const centro = async (cdp, selector) => evaluar(cdp, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)

let fallos = 0
const prueba = async (nombre, f) => { try { await f(); console.log('ok  ', nombre) } catch (e) { fallos++; console.log('FALLA', nombre, '\n     ', e.message) } }

/** Punto de cliente de la ventana `de` que, en pantalla, cae en el punto de cliente `p` de la ventana `en`. */
async function traducir(de, en, p) {
  const g = await evaluar(en, 'window.__estado().ventana'), h = await evaluar(de, 'window.__estado().ventana')
  const k = g.outerWidth / g.innerWidth, kh = h.outerWidth / h.innerWidth
  const sx = g.screenX + (g.outerWidth - g.innerWidth * k) / 2 + p.x * k, sy = g.screenY + (g.outerHeight - g.innerHeight * k) + p.y * k
  return { x: (sx - h.screenX - (h.outerWidth - h.innerWidth * kh) / 2) / kh, y: (sy - h.screenY - (h.outerHeight - h.innerHeight * kh)) / kh }
}
const cerrada = async (filtro) => { for (let i = 0; i < 50; i++) { if (!(await paginas()).some(filtro)) return true; await dormir(100) } return false }

try {
  const { targetId } = await navegador.send('Target.createTarget', { url: `${BASE}/`, newWindow: true, width: 1400, height: 900 })
  const principal = await pagina(t => t.id === targetId)
  const main = await conectar(principal.webSocketDebuggerUrl)
  await main.send('Runtime.enable')
  assert.ok(await esperar(main, 'window.__listo === true'), 'la principal no arrancó')
  const g0 = await evaluar(main, 'window.__estado().ventana')
  log('geometría de la principal', JSON.stringify(g0))
  assert.deepEqual(await evaluar(main, 'window.__estado().tabs'), ['tareas', 'vista-1', 'vista-2', 'taller'])
  await evaluar(main, 'const o = window.open; window.open = (...a) => { (window.__opens ??= []).push(a); return o.apply(window, a) }')

  await prueba('un clic sigue siendo clic (no arrastra)', async () => {
    const p = await centro(main, '[data-clave="taller"] button')
    await arrastrar(main, p, { x: p.x + 2, y: p.y + 1 }, { pasos: 2 })
    await dormir(200)
    assert.deepEqual(await evaluar(main, 'window.__clics'), ['taller'])
    assert.equal(await evaluar(main, 'document.querySelector(".fantasma") === null'), true)
    assert.equal((await ventanasPanel()).length, 0)
  })

  await prueba('reordenar dentro de la tira: Agenda a la primera posición (y se recuerda)', async () => {
    const p = await centro(main, '[data-clave="vista-1"] button'), q = await centro(main, '[data-clave="tareas"] button')
    await arrastrar(main, p, { x: q.x - 30, y: q.y + 4 })
    await dormir(300)
    assert.deepEqual(await evaluar(main, 'window.__estado().tabs'), ['vista-1', 'tareas', 'vista-2', 'taller'])
    assert.equal(await evaluar(main, 'JSON.parse(localStorage.getItem("arbrain.panelDerecho.acomodo")).orden.join()'), 'vista-1,tareas,vista-2')
    assert.deepEqual(await evaluar(main, 'window.__clics'), ['taller'], 'el clic posterior al arrastre debía taparse')
  })

  await prueba('Escape cancela el arrastre y no abre ventana', async () => {
    const p = await centro(main, '[data-clave="taller"] button')
    await arrastrar(main, p, { x: 300, y: 300 }, { soltar: false })
    assert.equal(await evaluar(main, 'document.querySelector(".fantasma[data-fuera]") !== null'), true, 'sobre el chat el fantasma debía anunciar ventana nueva')
    await main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 300, button: 'left', buttons: 0, clickCount: 1 })
    // La pestaña regresa a su origen con el vuelo del resorte (~240 ms): se espera a que el fantasma se retire.
    assert.ok(await esperar(main, 'document.querySelector(".fantasma") === null', 2000), 'el fantasma debía retirarse tras el vuelo de regreso')
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), {})
    assert.equal((await ventanasPanel()).length, 0, 'ventanas')
  })

  let v1
  await prueba('sacar Documento sobre el chat abre una ventana de TAMAÑO COMPLETO con su propia tira', async () => {
    const p = await centro(main, '[data-clave="vista-2"] button')
    await arrastrar(main, p, { x: 300, y: 300 })
    v1 = await pagina(t => t.url.includes('/panel?ventana=1'))
    assert.ok(v1, 'no se abrió la ventana 1')
    await esperar(main, '!window.__estado().tabs.includes("vista-2")')
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), { 'vista-2': 'ventana-1' })
    const [, nombre, rasgos] = (await evaluar(main, 'window.__opens'))[0]
    assert.match(nombre, /vista-ventana-1/)
    // Del tamaño de la ventana de origen (mínimo 960 de ancho), sin pasarse de la pantalla (la de headless mide 800×600).
    const ancho = Number(rasgos.match(/width=(\d+)/)[1]), pantalla = await evaluar(main, '({ w: screen.availWidth })')
    assert.equal(ancho, Math.min(pantalla.w, Math.max(960, g0.innerWidth)), `nació de ${ancho} px de ancho`)
    const marco = g0.outerHeight - g0.innerHeight
    const [, izq, arriba] = rasgos.match(/left=(-?\d+),top=(-?\d+)/)
    assert.equal(Number(izq), g0.screenX + 300 - 90)
    assert.equal(Number(arriba), g0.screenY + marco + 300 - 52)
  })
  if (!v1) throw new Error('sin ventana no hay más que probar')
  const w1 = await conectar(v1.webSocketDebuggerUrl)
  await w1.send('Runtime.enable')
  assert.ok(await esperar(w1, 'window.__listo === true'))
  // Headless apila las emergentes en (0,0): se lleva la ventana 1 a la derecha de la principal, como un segundo monitor.
  const { windowId } = await navegador.send('Browser.getWindowForTarget', { targetId: v1.id })
  await navegador.send('Browser.setWindowBounds', { windowId, bounds: { left: 1450, top: 0, width: 900, height: 700 } })
  await esperar(w1, 'window.screenX >= 1400', 3000)
  log('geometría de la ventana 1', JSON.stringify(await evaluar(w1, 'window.__estado().ventana')))

  await prueba('la ventana 1 pinta su tira (Documento) y la principal no la reclama sola', async () => {
    assert.ok(await esperar(w1, 'window.__estado().tabs.join() === "vista-2"'), 'tira de la ventana: ' + JSON.stringify(await evaluar(w1, 'window.__estado()')))
    await dormir(1500)
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), { 'vista-2': 'ventana-1' })
  })

  await prueba('dos ventanas (7 oct 2026): «izquierda» y «derecha» salen de la posición real; lo que abre Levy cae en la elegida y la otra no recibe pestañas', async () => {
    const izq = await evaluar(main, 'window.__destino("izquierda")'), der = await evaluar(main, 'window.__destino("derecha")')
    log('medidas', JSON.stringify(izq.medidas))
    assert.equal(izq.medidas.length, 2, 'la principal debía medir las dos ventanas')
    assert.equal(izq.ventana, 'principal', 'la principal está en x=0, a la izquierda de la ventana 1')
    assert.equal(der.ventana, 'ventana-1')
    assert.equal(await evaluar(main, 'window.__destino("principal").then(d => d.ventana)'), 'principal')
    // Levy abre algo con el destino «izquierda»: cae en la principal; la ventana 1 (Documento) queda como estaba.
    await evaluar(main, `window.__fijarLevy("levy-izq", ${JSON.stringify(izq.ventana)})`)
    assert.ok(await esperar(main, 'window.__estado().tabs.includes("levy-izq")', 2000), 'la principal debía recibir la pestaña')
    await dormir(300)
    assert.deepEqual(await evaluar(w1, 'window.__estado().tabs'), ['vista-2'], 'la ventana de la derecha no debía recibir nada')
    // Con «derecha» cae en la ventana 1, directo, sin pasar por la principal.
    await evaluar(main, `window.__fijarLevy("levy-der", ${JSON.stringify(der.ventana)})`)
    assert.ok(await esperar(w1, 'window.__estado().tabs.includes("levy-der")', 3000), 'la ventana 1 debía recibir la pestaña: ' + JSON.stringify(await evaluar(w1, 'window.__estado()')))
    assert.equal(await evaluar(main, 'window.__estado().tabs.includes("levy-der")'), false)
    assert.equal(await evaluar(main, 'window.__estado().enVentana["levy-der"]'), 'ventana-1')
    assert.equal((await ventanasPanel()).length, 1, 'no debía abrirse ninguna ventana nueva')
    // Se intercambian los lados (Daniel arrastra las ventanas): la ventana 1 pasa a la izquierda y la principal a la derecha.
    const idP = (await navegador.send('Browser.getWindowForTarget', { targetId: principal.id })).windowId
    await navegador.send('Browser.setWindowBounds', { windowId: idP, bounds: { left: 1450, top: 0, width: 900, height: 700 } })
    await navegador.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: 900, height: 700 } })
    assert.ok(await esperar(w1, 'window.__geomReal().screenX < 100', 3000), 'la ventana 1 no llegó a la izquierda')
    assert.ok(await esperar(main, 'window.__geomReal().screenX >= 1400', 3000), 'la principal no llegó a la derecha')
    assert.equal(await evaluar(main, 'window.__destino("izquierda").then(d => d.ventana)'), 'ventana-1', 'ahora la izquierda es la ventana 1')
    assert.equal(await evaluar(main, 'window.__destino("derecha").then(d => d.ventana)'), 'principal')
    // Todo vuelve a su lugar para las pruebas que siguen.
    await navegador.send('Browser.setWindowBounds', { windowId: idP, bounds: { left: 0, top: 0, width: 1400, height: 900 } })
    await navegador.send('Browser.setWindowBounds', { windowId, bounds: { left: 1450, top: 0, width: 900, height: 700 } })
    await esperar(w1, 'window.__geomReal().screenX >= 1400', 3000)
    await evaluar(main, 'window.__store.getState().cerrar("levy-izq"); window.__store.getState().cerrar("levy-der")')
    assert.ok(await esperar(w1, 'window.__estado().tabs.join() === "vista-2"', 3000))
  })

  // Todas las páginas de esta prueba ven la geometría de ventana de WKWebView (wkwebview.ts): soltar sobre la tira de otra ventana
  // debe estamparse ahí, no abrir una ventana nueva (7 oct 2026, «Ventana 1» en el otro monitor).
  await prueba('arrastrar Tareas desde la principal SOBRE LA TIRA de la ventana 1 la inserta antes de Documento (con hueco mientras pasa) y no abre otra ventana', async () => {
    const destino = await centro(w1, '[data-clave="vista-2"] button')
    const cliente = await traducir(main, w1, { x: destino.x - 25, y: destino.y })
    const p = await centro(main, '[data-clave="tareas"] button')
    await arrastrar(main, p, cliente, { soltar: false })
    assert.ok(await esperar(w1, 'window.__estado().hueco === 0', 2000), 'la ventana 1 debía abrir hueco en 0: ' + JSON.stringify(await evaluar(w1, 'window.__estado()')))
    await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cliente.x, y: cliente.y, button: 'left', buttons: 0, clickCount: 1 })
    assert.ok(await esperar(w1, 'window.__estado().tabs.join() === "tareas,vista-2"', 3000), 'tira: ' + JSON.stringify(await evaluar(w1, 'window.__estado()')))
    assert.equal(await evaluar(w1, 'window.__estado().activa'), 'tareas', 'lo soltado queda a la vista')
    assert.equal(await evaluar(w1, 'window.__estado().hueco'), null)
    assert.deepEqual(await evaluar(main, 'window.__estado().tabs'), ['vista-1', 'taller'])
    assert.equal((await ventanasPanel()).length, 1, 'soltar sobre la tira de otra ventana no debía abrir una ventana nueva')
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), { tareas: 'ventana-1', 'vista-2': 'ventana-1' })
  })

  await prueba('reordenar dentro de la ventana 1', async () => {
    const p = await centro(w1, '[data-clave="tareas"] button'), q = await centro(w1, '[data-clave="vista-2"] button')
    await arrastrar(w1, p, { x: q.x + 40, y: q.y })
    assert.ok(await esperar(w1, 'window.__estado().tabs.join() === "vista-2,tareas"', 2000))
    const orden = (await evaluar(w1, 'window.__estado().orden')).join()
    assert.ok(await esperar(main, `window.__estado().orden.join() === ${JSON.stringify(orden)}`, 2000), 'la principal debía ver el mismo orden que la ventana')
    assert.deepEqual(await evaluar(main, 'window.__estado().tabs'), ['vista-1', 'taller'])
  })

  await prueba('Documento de la ventana 1 al panel principal, en el primer lugar', async () => {
    const t = await centro(main, '[data-clave="vista-1"] button')
    const cliente = await traducir(w1, main, { x: t.x - 20, y: t.y })
    const p = await centro(w1, '[data-clave="vista-2"] button')
    await arrastrar(w1, p, cliente)
    assert.ok(await esperar(main, 'window.__estado().tabs.join() === "vista-2,vista-1,taller"', 3000), 'principal: ' + JSON.stringify(await evaluar(main, 'window.__estado()')))
    assert.deepEqual(await evaluar(w1, 'window.__estado().tabs'), ['tareas'])
  })

  await prueba('la última pestaña de la ventana 1, de vuelta al panel: la ventana se cierra sola', async () => {
    const cliente = await traducir(w1, main, { x: 200, y: 400 }) // sobre el chat de la principal: toda la ventana recibe (al final)
    const p = await centro(w1, '[data-clave="tareas"] button')
    await arrastrar(w1, p, cliente)
    assert.ok(await esperar(main, 'window.__estado().tabs.join() === "vista-2,vista-1,tareas,taller"', 3000), 'principal: ' + JSON.stringify(await evaluar(main, 'window.__estado()')))
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), {})
    assert.ok(await cerrada(t => t.url.includes('ventana=1')), 'la ventana 1 debía cerrarse')
  })

  await prueba('dos ventanas: cada una con su tira; cerrar una con la X devuelve sus pestañas al panel', async () => {
    for (const c of ['vista-1', 'taller']) {
      const p = await centro(main, `[data-clave="${c}"] button`)
      await arrastrar(main, p, { x: 300 + (c === 'taller' ? 200 : 0), y: 300 })
      await esperar(main, `!!window.__estado().enVentana["${c}"]`)
    }
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), { 'vista-1': 'ventana-1', taller: 'ventana-2' })
    assert.equal((await ventanasPanel()).length, 2)
    const v2 = await pagina(t => t.url.includes('ventana=2'))
    await dormir(800)
    await navegador.send('Target.closeTarget', { targetId: v2.id })
    assert.ok(await esperar(main, 'window.__estado().tabs.includes("taller")', 6000), 'el Taller debía volver al panel')
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), { 'vista-1': 'ventana-1' })
  })

  await prueba('recargar la principal con una ventana abierta: la ventana sigue y sus pestañas también', async () => {
    await main.send('Page.reload')
    await dormir(400)
    assert.ok(await esperar(main, 'window.__listo === true'))
    await dormir(3200)
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), { 'vista-1': 'ventana-1' })
    assert.ok((await ventanasPanel()).some(t => t.url.includes('ventana=1')))
  })

  await prueba('al reabrir sin su ventana (el navegador no la reabre sin un clic) sus pestañas vuelven a la columna', async () => {
    const v = await pagina(t => t.url.includes('ventana=1'))
    await navegador.send('Target.closeTarget', { targetId: v.id })
    await cerrada(t => t.url.includes('ventana=1'))
    await dormir(2200)
    await evaluar(main, 'localStorage.setItem("arbrain.panelDerecho.acomodo", JSON.stringify({ ...JSON.parse(localStorage.getItem("arbrain.panelDerecho.acomodo")), enVentana: { "vista-1": "ventana-1" } }))')
    await main.send('Page.reload')
    await dormir(400)
    assert.ok(await esperar(main, 'window.__listo === true'))
    assert.ok(await esperar(main, 'window.__estado().tabs.includes("vista-1")', 6000), JSON.stringify(await evaluar(main, 'window.__estado()')))
    assert.deepEqual(await evaluar(main, 'window.__estado().enVentana'), {})
  })
} catch (e) { fallos++; console.log('ERROR', e.message) }
finally { cerrarTodo() }
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo en orden')
process.exit(fallos ? 1 : 0)
