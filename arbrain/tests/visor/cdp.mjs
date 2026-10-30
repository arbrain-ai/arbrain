// Chrome headless por CDP, sin dependencias (WebSocket global de Node 22). Lo usan las capturas y las pruebas del visor único.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const dormir = ms => new Promise(r => setTimeout(r, ms))

export async function abrirChrome({ ancho = 1000, alto = 900, puerto = 9400 + Math.floor(Math.random() * 400) } = {}) {
  const perfil = mkdtempSync(join(tmpdir(), 'visor-chrome-'))
  const proc = spawn(CHROME, [`--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    `--window-size=${ancho},${alto}`, 'about:blank'], { stdio: 'ignore' })
  let lista
  for (let i = 0; i < 60; i++) { try { lista = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json(); if (lista.some(t => t.type === 'page')) break } catch { /* arrancando */ } await dormir(250) }
  const pagina = lista.find(t => t.type === 'page')
  const ws = new WebSocket(pagina.webSocketDebuggerUrl)
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal })
  let id = 0; const pend = new Map(); const eventos = []
  ws.onmessage = m => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { const { ok, mal } = pend.get(j.id); pend.delete(j.id); j.error ? mal(new Error(j.error.message)) : ok(j.result) } else if (j.method) eventos.push(j) }
  const cmd = (method, params = {}) => new Promise((ok, mal) => { const n = ++id; pend.set(n, { ok, mal }); ws.send(JSON.stringify({ id: n, method, params })) })
  await cmd('Page.enable'); await cmd('Runtime.enable')
  await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: false })
  const api = {
    cmd, eventos,
    async ir(url) { await cmd('Page.navigate', { url }); await dormir(600) },
    async eval(expr) { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value },
    async esperar(expr, ms = 20000, que = expr) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await api.eval(expr)) return true } catch { /* aún no */ } await dormir(150) } throw new Error(`Se agotó la espera: ${que}`) },
    async captura(archivo, { selector, margen = 0 } = {}) {
      let clip
      if (selector) { const r = await api.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`); if (r) clip = { x: Math.max(0, r.x - margen), y: Math.max(0, r.y - margen), width: r.width + 2 * margen, height: r.height + 2 * margen, scale: 1 } }
      const r = await cmd('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) })
      writeFileSync(archivo, Buffer.from(r.data, 'base64')); return archivo
    },
    async teclear(texto) { for (const c of texto) { await cmd('Input.dispatchKeyEvent', { type: 'keyDown', text: c, key: c }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: c }) } },
    async tecla(key, { code = key, vk = 0, modificadores = 0 } = {}) { await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers: modificadores, ...(key === 'Enter' ? { text: '\r' } : {}) }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: modificadores }) },
    async clic(x, y) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 }) },
    async arrastrar(x1, y1, x2, y2) { await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 }); await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1, buttons: 1 }); for (let i = 1; i <= 8; i++) await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / 8, y: y1 + (y2 - y1) * i / 8, button: 'left', buttons: 1 }); await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 }) },
    async cerrar() { try { ws.close() } catch { /* ya cerrado */ } proc.kill() },
  }
  return api
}
