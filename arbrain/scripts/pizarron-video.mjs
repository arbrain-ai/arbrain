#!/usr/bin/env node
/**
 * Exporta una sesión del pizarrón a video (7 oct 2026): la misma reproducción del panel, con reloj virtual.
 * Chrome headless abre /pizarron-lab?render=1, avanza el reloj cuadro a cuadro (las acotaciones caen exactas en su
 * palabra aunque la captura sea lenta) y fotografía el escenario; ffmpeg pega los cuadros y mezcla cada tramo de voz
 * en el instante en que sonó.
 *
 *   node scripts/pizarron-video.mjs <sesion> <salida.mp4> [--base http://127.0.0.1:3457] [--ancho 1280] [--alto 760] [--fps 30]
 *
 * Necesita una web de Arbrain que deje entrar sin sesión en localhost (MISSION_CONTROL_DESKTOP_EMBED=1) y que lea el
 * mismo repo (BUSINESS_OS_ROOT). Puppeteer: el de ~/Developer/labs/god-animation/motor/render (PUPPETEER_DIR).
 */
import { mkdirSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const [sesion, salida] = args
if (!sesion || !salida) { console.error('uso: node scripts/pizarron-video.mjs <sesion> <salida.mp4> [--base url] [--ancho 1280] [--alto 760] [--fps 30]'); process.exit(1) }
const base = opt('base', 'http://127.0.0.1:3457'), ancho = +opt('ancho', 1280), alto = +opt('alto', 760), fps = +opt('fps', 30), maxSeg = +opt('max', 900)
const puppeteer = createRequire(`${process.env.PUPPETEER_DIR ?? `${process.env.HOME}/Developer/labs/god-animation/motor/render`}/x.js`)('puppeteer-core')
// CERO sonido en pruebas (Daniel lo oía por sus audífonos, 7 oct): speechSynthesis sale por el audio del sistema aunque
// Chrome lleve --mute-audio. Antes de que cargue la página: la voz del sistema no habla y todo audio va en volumen 0.
const SIN_SONIDO = () => {
  try { const s = window.speechSynthesis; if (s) { s.speak = () => {}; s.cancel() } } catch {}
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return play.call(this) }
  try { localStorage.setItem('arbrain.pizarron.mudo', '1') } catch {}
}

const trabajo = mkdtempSync(path.join(tmpdir(), 'pizarron-video-'))
const cuadros = path.join(trabajo, 'cuadros'); mkdirSync(cuadros)

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'], userDataDir: path.join(trabajo, 'chrome') })
const page = await browser.newPage()
await page.setViewport({ width: ancho + 24, height: alto + 24, deviceScaleFactor: 1.5 })
page.on('pageerror', e => console.error('[página]', e.message))
await page.evaluateOnNewDocument(SIN_SONIDO)
await page.goto(`${base}/pizarron-lab?sesion=${encodeURIComponent(sesion)}&ancho=${ancho}&alto=${alto}&render=1`, { waitUntil: 'domcontentloaded' })
const esperar = async (f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(f).catch(() => false)) return true; await new Promise(r => setTimeout(r, 200)) } return false }
if (!await esperar(() => !!window.__pizarronRender?.listo(), 60_000)) { console.error('El escenario no arrancó.'); await browser.close(); process.exit(1) }
// Solo el escenario, sin la barra del panel.
const marco = await (await page.$('iframe')).boundingBox()
const clip = { x: Math.round(marco.x), y: Math.round(marco.y), width: Math.round(marco.width) & ~1, height: Math.round(marco.height) & ~1 }
const dt = 1000 / fps
let n = 0
const t0 = Date.now()
while (n < maxSeg * fps) {
  await page.evaluate(ms => window.__pizarronRender.avanzar(ms), dt)
  await page.screenshot({ path: path.join(cuadros, `${String(n).padStart(6, '0')}.jpg`), clip, type: 'jpeg', quality: 90 })
  n++
  if (n % (fps * 10) === 0) process.stdout.write(`  ${n / fps} s de video (${Math.round((Date.now() - t0) / 1000)} s reales)\n`)
  if (await page.evaluate(() => window.__pizarronRender.terminado())) break
}
// Dos segundos de respiro al final, con el mapa entero.
for (let i = 0; i < fps * 2; i++) { await page.evaluate(ms => window.__pizarronRender.avanzar(ms), dt); await page.screenshot({ path: path.join(cuadros, `${String(n++).padStart(6, '0')}.jpg`), clip, type: 'jpeg', quality: 90 }) }
const pistas = await page.evaluate(() => window.__pizarronRender.pistas())
// El audio de cada tramo, tal cual lo sirvió la app (en caché).
const audios = []
for (const [i, p] of pistas.entries()) {
  const b64 = await page.evaluate(async url => { const r = await fetch(url); const b = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }, p.url)
  const f = path.join(trabajo, `voz-${i}.mp3`); writeFileSync(f, Buffer.from(b64, 'base64')); audios.push({ f, ...p })
}
await browser.close()
const entradas = ['-y', '-framerate', String(fps), '-i', path.join(cuadros, '%06d.jpg')]
for (const a of audios) entradas.push('-i', a.f)
const filtros = audios.map((a, i) => `[${i + 1}:a]${a.velocidad !== 1 ? `atempo=${a.velocidad},` : ''}adelay=${Math.round(a.inicioMs)}|${Math.round(a.inicioMs)}[v${i}]`)
const mezcla = audios.length ? [`${filtros.join(';')};${audios.map((_, i) => `[v${i}]`).join('')}amix=inputs=${audios.length}:normalize=0:dropout_transition=0[voz]`] : []
const r = spawnSync('ffmpeg', [...entradas, ...(mezcla.length ? ['-filter_complex', mezcla[0], '-map', '0:v', '-map', '[voz]'] : []), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', ...(audios.length ? ['-c:a', 'aac', '-b:a', '160k'] : []), salida], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' })
if (r.status !== 0) { console.error(r.stderr.slice(-2000)); process.exit(1) }
console.log(`Video: ${salida} · ${(n / fps).toFixed(1)} s · ${n} cuadros · ${audios.length} tramos de voz · cuadros en ${trabajo} (${readdirSync(cuadros).length})`)
