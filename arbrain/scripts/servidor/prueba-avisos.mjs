#!/usr/bin/env node
/**
 * Prueba de punta a punta de los avisos de Levy en el teléfono del alumno (v0.2.18, 31 oct 2026;
 * docs/builds/avisos-telefono-alumno-2026-10-31/REPORTE.md). En una copia del alumno (o en el repo con --repo-original):
 *
 *   node arbrain/scripts/servidor/prueba-avisos.mjs [--datos <carpeta>] [--repo-original] [--compilar] [--capturas <carpeta>]
 *
 * Arranca Arbrain en modo servidor con un `tailscale` falso (como prueba-telefono.mjs), enciende el teléfono y pone
 * delante un reenviador que hace lo que `tailscale serve`: Host `maquina.ejemplo.ts.net` y `X-Forwarded-Proto: https`.
 * Un Chrome real (sin ventana, con su perfil propio en /tmp) entra por esa dirección como lo haría el teléfono y:
 *   1. Las llaves VAPID nacen una vez en `daemon/config/avisos.json` (0600); la privada no sale en logs ni en el entorno
 *      de ningún proceso (`ps eww`).
 *   2. `/api/notifications/subscribe` pide sesión y da la llave pública de ESTA instalación; `/send` rechaza sin token,
 *      con la sesión y con un Bearer cualquiera.
 *   3. Ajustes › Notificaciones: «Activar notificaciones» suscribe a Chrome con el servicio de push real (FCM) y la fila
 *      queda en la base local; «Enviarme una prueba» llega como notificación al service worker.
 *   4. Una rutina que corre sola y falla (sin llave de Claude) hace que el daemon avise con SU token: llega «Tu rutina no
 *      terminó: …» por el mismo camino (daemon → web local → FCM → Chrome).
 *   5. El lector de voz del teléfono con la voz del alumno (v0.2.18, b7): el teléfono pide el tramo en Ogg Opus
 *      (`formato: 'opus'`, como voz-servidor.ts en un cliente remoto) y la edición cliente responde lo que da SU daemon
 *      con LemonFox: WAV con las marcas de cada palabra (con su llave de Groq), que el navegador decodifica igual. Con
 *      `LEMONFOX_API_KEY` y `GROQ_API_KEY` en el entorno de la prueba, quedan en `daemon/config/llaves.json` (0600) como si
 *      el alumno las hubiera guardado en Ajustes › Llaves, y se llama a LemonFox y a Groq de verdad (un tramo corto). Sin
 *      ellas, comprueba lo que pasa sin llave: 503 `sin_voz_servidor` rápido y el lector cae a la voz del sistema.
 *   6. «Desactivar» borra la suscripción de la base local.
 * Nunca imprime la contraseña, el token ni las llaves. Usa su propia carpeta de datos y su propio perfil de Chrome.
 * Chrome: `CHROME=<ruta>` o el de siempre en macOS. Requiere internet (FCM; LemonFox y Groq si hay llaves).
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../servidor.mjs', import.meta.url))
const FALSO = fileURLToPath(new URL('./tailscale-falso.mjs', import.meta.url))
const ARBRAIN = fileURLToPath(new URL('../..', import.meta.url))
const argv = process.argv.slice(2)
const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const DATOS = resolve(opcion('--datos') ?? join(tmpdir(), `arbrain-avisos-${process.pid}`))
const CAPTURAS = opcion('--capturas') ? resolve(opcion('--capturas')) : null
const EXTRA = ['--repo-original', '--compilar'].filter((f) => argv.includes(f))
const HOST = '127.0.0.1'
const TS = 'maquina.ejemplo.ts.net'
const DIR_FALSO = join(DATOS, 'tailscale-falso')
const ENV = { ...process.env, ARBRAIN_SERVIDOR_DATOS: DATOS, ARBRAIN_TAILSCALE: FALSO, ARBRAIN_TAILSCALE_FALSO_DIR: DIR_FALSO }
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const t0 = Date.now()
const log = (m) => console.log(`[prueba-avisos ${Math.round((Date.now() - t0) / 1000)} s] ${m}`)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const resultados = []
const ok = (m) => { resultados.push(`OK ${m}`); log(`OK ${m}`) }

function puertoLibre() {
  return new Promise((si, no) => { const s = net.createServer(); s.once('error', no); s.listen(0, HOST, () => { const { port } = s.address(); s.close(() => si(port)) }) })
}

/** Petición cruda con los encabezados de `tailscale serve` (o los que se pidan). */
function pedir(port, ruta, { metodo = 'GET', host = TS, proto = 'https', cookie, cuerpo, tipo, origen, auth } = {}) {
  return new Promise((listo) => {
    const datos = cuerpo === undefined ? undefined : Buffer.from(cuerpo)
    const headers = { Host: host, ...(proto ? { 'X-Forwarded-Proto': proto } : {}), ...(cookie ? { Cookie: cookie } : {}),
      ...(origen ? { Origin: origen } : {}), ...(auth ? { Authorization: auth } : {}),
      ...(datos ? { 'Content-Type': tipo ?? 'application/json', 'Content-Length': datos.length } : {}) }
    const req = http.request({ host: HOST, port, path: ruta, method: metodo, timeout: 30_000, headers }, (res) => {
      const partes = []
      res.on('data', (c) => partes.push(c))
      res.on('end', () => {
        const texto = Buffer.concat(partes).toString('utf8')
        let json = null
        try { json = JSON.parse(texto) } catch { /* */ }
        listo({ status: res.statusCode ?? 0, headers: res.headers, texto, json })
      })
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => listo({ status: 0, headers: {}, texto: '', json: null }))
    if (datos) req.write(datos)
    req.end()
  })
}

/**
 * Lo que hace `tailscale serve` para el teléfono: reenvía a la web con el Host del teléfono y `X-Forwarded-Proto: https`.
 * Chrome entra por `http://<TS>:<puerto>` (marcado como seguro con su bandera); el `Origin` que manda se traduce al
 * `https://<TS>` que vería la web detrás de Tailscale.
 */
function reenviador(destino, propio) {
  const srv = http.createServer((req, res) => {
    const headers = { ...req.headers, host: TS, 'x-forwarded-proto': 'https' }
    if (headers.origin === propio) headers.origin = `https://${TS}`
    const p = http.request({ host: HOST, port: destino, path: req.url, method: req.method, headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res) })
    p.on('error', () => { res.writeHead(502); res.end() })
    req.pipe(p)
  })
  return srv
}

/** Chrome sin ventana por CDP (WebSocket global de Node 22), con perfil propio. */
async function abrirChrome(extra) {
  const puerto = await puertoLibre()
  const perfil = mkdtempSync(join(tmpdir(), 'avisos-chrome-'))
  const proc = spawn(CHROME, [`--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--headless=new', '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--window-size=430,932', ...extra, 'about:blank'], { stdio: 'ignore' })
  let lista = []
  for (let i = 0; i < 80 && !lista.some((t) => t.type === 'page'); i++) {
    try { lista = await (await fetch(`http://${HOST}:${puerto}/json`)).json() } catch { /* arrancando */ }
    if (!lista.some((t) => t.type === 'page')) await dormir(250)
  }
  const pagina = lista.find((t) => t.type === 'page')
  if (!pagina) throw new Error(`Chrome no arrancó (${CHROME}).`)
  const ws = new WebSocket(pagina.webSocketDebuggerUrl)
  await new Promise((si, no) => { ws.onopen = si; ws.onerror = no })
  let id = 0
  const pend = new Map()
  ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { const { si, no } = pend.get(j.id); pend.delete(j.id); j.error ? no(new Error(j.error.message)) : si(j.result) } }
  const cmd = (method, params = {}) => new Promise((si, no) => { const n = ++id; pend.set(n, { si, no }); ws.send(JSON.stringify({ id: n, method, params })) })
  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable')
  const api = {
    cmd,
    async eval(expr) {
      const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    },
    async esperar(expr, ms, que) {
      const fin = Date.now() + ms
      let ultimo
      while (Date.now() < fin) { try { ultimo = await api.eval(expr); if (ultimo) return ultimo } catch { /* aún no */ } await dormir(250) }
      throw new Error(`Se agotó la espera: ${que} (último: ${JSON.stringify(ultimo)})`)
    },
    async captura(nombre) {
      if (!CAPTURAS) return
      mkdirSync(CAPTURAS, { recursive: true })
      const r = await cmd('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(CAPTURAS, nombre), Buffer.from(r.data, 'base64'))
      log(`captura ${join(CAPTURAS, nombre)}`)
    },
    cerrar() { try { ws.close() } catch { /* */ } try { proc.kill() } catch { /* */ } },
  }
  return api
}

const proceso = () => { try { return JSON.parse(readFileSync(join(DATOS, 'daemon', 'config', 'servidor.json'), 'utf8')) } catch { return null } }
const acceso = () => JSON.parse(readFileSync(join(DATOS, 'daemon', 'config', 'acceso.json'), 'utf8'))
const orden = (...a) => spawnSync(process.execPath, [SCRIPT, ...a, '--datos', DATOS], { encoding: 'utf8', timeout: 180_000, env: ENV })
const ultima = (s) => (s ?? '').trim().split(/\r?\n/).pop() ?? ''
const tabla = (t) => { try { return JSON.parse(readFileSync(join(DATOS, 'web', 'base', `${t}.json`), 'utf8')) } catch { return [] } }

let supervisor = null
let salida = null
let chrome = null
let proxy = null
async function fallar(msg) {
  console.error(`\n[prueba-avisos] FALLÓ: ${msg}\n`)
  const dir = join(DATOS, 'logs')
  if (existsSync(dir)) for (const f of readdirSync(dir)) console.log(`\n───── ${f} (últimas 40) ─────\n${readFileSync(join(dir, f), 'utf8').split(/\r?\n/).slice(-40).join('\n')}`)
  chrome?.cerrar(); proxy?.close()
  if (supervisor && salida === null) { orden('detener'); await dormir(2000); if (salida === null) try { supervisor.kill('SIGKILL') } catch { /* */ } }
  process.exit(1)
}

async function esperarWeb(puerto, esperado, ms = 120_000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    if (salida !== null) return `el supervisor salió (código ${salida}).`
    if ((await pedir(puerto, '/api/version', { host: `${HOST}:${puerto}`, proto: null })).status === 200 && (await pedir(puerto, '/sin-sesion')).status === esperado) return null
    await dormir(1000)
  }
  return `el Host del teléfono no llegó a ${esperado}.`
}

/** Notificaciones que mostró el service worker (lo que el teléfono enseñaría en pantalla). */
const NOTIS = `navigator.serviceWorker.ready.then(r => r.getNotifications()).then(l => l.map(n => ({ title: n.title, body: n.body, tag: n.tag, url: n.data && n.data.url })))`
const boton = (texto) => `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(texto)}) && !x.disabled); if (!b) return false; b.click(); return true })()`

// Llaves de voz del alumno para el paso del lector: del entorno de la prueba al archivo que escribe Ajustes › Llaves.
const LLAVES_VOZ = Object.fromEntries(['LEMONFOX_API_KEY', 'GROQ_API_KEY'].filter((k) => process.env[k]?.trim()).map((k) => [k, process.env[k].trim()]))
const CON_VOZ = !!LLAVES_VOZ.LEMONFOX_API_KEY
const TEXTO_LECTOR = 'Hola, soy tu Levy. Esto suena en tu teléfono con tu propia voz.'

async function main() {
  const puerto = await puertoLibre()
  if (CON_VOZ) {
    mkdirSync(join(DATOS, 'daemon', 'config'), { recursive: true })
    writeFileSync(join(DATOS, 'daemon', 'config', 'llaves.json'), JSON.stringify(LLAVES_VOZ, null, 1) + '\n', { mode: 0o600 })
  }
  log(`Node ${process.version} · ${process.platform}/${process.arch} · datos ${DATOS} · web ${puerto}`)
  supervisor = spawn(process.execPath, [SCRIPT, '--sin-navegador', '--puerto', String(puerto), '--datos', DATOS, ...EXTRA], { stdio: ['ignore', 'inherit', 'inherit'], env: ENV })
  supervisor.on('exit', (c, s) => { salida = c ?? s ?? '?' })
  const fin = Date.now() + 40 * 60_000
  while (true) {
    if (salida !== null) return fallar(`el supervisor salió antes de quedar listo (${salida}).`)
    if (Date.now() > fin) return fallar('no quedó listo en 40 min.')
    if (proceso()?.puertoControl && (await pedir(puerto, '/api/version', { host: `${HOST}:${puerto}`, proto: null })).status === 200) break
    await dormir(2000)
  }

  // 1. Llaves por instalación, en la config privada, sin salir en logs ni en el entorno de ningún proceso.
  const rutaAvisos = join(DATOS, 'daemon', 'config', 'avisos.json')
  if (!existsSync(rutaAvisos)) return fallar('no se creó daemon/config/avisos.json.')
  const llaves = JSON.parse(readFileSync(rutaAvisos, 'utf8'))
  if (Buffer.from(llaves.publica ?? '', 'base64url').length !== 65 || Buffer.from(llaves.privada ?? '', 'base64url').length !== 32) return fallar('avisos.json no trae un par P-256.')
  if (process.platform !== 'win32' && (statSync(rutaAvisos).mode & 0o777) !== 0o600) return fallar(`avisos.json no es 0600 (${(statSync(rutaAvisos).mode & 0o777).toString(8)}).`)
  for (const f of readdirSync(join(DATOS, 'logs'))) if (readFileSync(join(DATOS, 'logs', f), 'utf8').includes(llaves.privada)) return fallar(`la llave privada salió en logs/${f}.`)
  if (process.platform !== 'win32') {
    const ps = spawnSync('ps', ['eww', '-ax', '-o', 'command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (ps.status === 0 && ps.stdout.includes(llaves.privada)) return fallar('la llave privada aparece en el entorno de un proceso (ps eww).')
  }
  ok('llaves: daemon/config/avisos.json (0600, P-256) creado una vez; la privada no sale en logs ni en `ps eww`')

  // Sesión de la persona (la misma cookie que da la contraseña) y la bienvenida ya terminada (la prueba no la recorre).
  const a = acceso()
  const g = Number.isSafeInteger(Number(a.generacion)) ? Number(a.generacion) : 0
  const valorSesion = `s1.${createHmac('sha256', a.contrasena).update(`arbrain-sesion-servidor:${g}`).digest('hex')}`
  const cookie = `arbrain_escritorio=${valorSesion}`
  const legales = readFileSync(join(ARBRAIN, 'src', 'features', 'primer-arranque', 'textos', 'legales.ts'), 'utf8')
  const versionTextos = legales.match(/export const VERSION_TEXTOS = '([^']+)'/)?.[1]
  if (!versionTextos) return fallar('no encontré VERSION_TEXTOS.')
  const fecha = new Date().toISOString()
  writeFileSync(join(DATOS, 'web', 'primer-arranque.json'), JSON.stringify({ version: 1, aceptado: { version: versionTextos, fecha }, nombre: 'Fulana', completado: fecha, sesionBienvenida: null }), { mode: 0o600 })

  // 2. Teléfono encendido y las rutas.
  const en = orden('telefono', 'encender')
  if (ultima(en.stdout) !== `TELEFONO_ENCENDIDO https://${TS}`) return fallar(`telefono encender: ${en.stdout}${en.stderr}`)
  const esp = await esperarWeb(puerto, 200)
  if (esp) return fallar(`tras encender: ${esp}`)
  const sinSesion = await pedir(puerto, '/api/notifications/subscribe?endpoint=')
  if (sinSesion.status !== 401) return fallar(`subscribe sin sesión dio ${sinSesion.status}`)
  const conSesion = await pedir(puerto, '/api/notifications/subscribe?endpoint=', { cookie })
  if (conSesion.status !== 200 || conSesion.json?.clave !== llaves.publica) return fallar(`subscribe con sesión: ${conSesion.status}; la clave ${conSesion.json?.clave === llaves.publica ? 'coincide' : 'NO coincide'} con avisos.json`)
  const cuerpo = JSON.stringify({ title: 'x', body: 'y', url: '/chat', tag: 'falso-1', kind: 'otro' })
  for (const [que, op] of [['sin token', {}], ['con la sesión', { cookie }], ['con un Bearer cualquiera', { auth: `Bearer ${'f'.repeat(64)}` }], ['con la contraseña como Bearer', { auth: `Bearer ${a.contrasena}` }]]) {
    const r = await pedir(puerto, '/api/notifications/send', { metodo: 'POST', cuerpo, origen: `https://${TS}`, ...op })
    if (r.status !== 401) return fallar(`send ${que} dio ${r.status}, no 401.`)
  }
  ok('rutas: subscribe pide sesión y da la llave pública de esta instalación; send da 401 sin token, con la sesión, con un Bearer cualquiera y con la contraseña')

  // 3. Chrome entra por la dirección del teléfono, activa y se manda la prueba.
  const pProxy = await puertoLibre()
  const ORIGEN = `http://${TS}:${pProxy}`
  proxy = reenviador(puerto, ORIGEN)
  await new Promise((si) => proxy.listen(pProxy, HOST, si))
  chrome = await abrirChrome([`--host-resolver-rules=MAP ${TS} ${HOST}`, `--unsafely-treat-insecure-origin-as-secure=${ORIGEN}`])
  await chrome.cmd('Network.setCookie', { name: 'arbrain_escritorio', value: valorSesion, url: ORIGEN, httpOnly: true, sameSite: 'Lax' })
  await chrome.cmd('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true })
  await chrome.cmd('Page.navigate', { url: `${ORIGEN}/settings?seccion=notificaciones` })
  const estado0 = await chrome.esperar(`(() => { const e = document.querySelector('[data-estado-push]'); const s = e && e.getAttribute('data-estado-push'); return s && s !== 'cargando' ? s : null })()`, 90_000, 'la sección Notificaciones')
  if (estado0 !== 'listo') return fallar(`la sección abrió en «${estado0}», no «listo».`)
  const textoSeccion = await chrome.eval('document.body.innerText')
  for (const f of ['Levy espera tu decisión', 'Una rutina terminó', 'Levy terminó tu respuesta', 'iOS 16.4 o más', 'dirección de Tailscale']) if (!textoSeccion.includes(f)) return fallar(`la sección no dice «${f}».`)
  await chrome.captura('ajustes-notificaciones-listo.png')
  await chrome.esperar('navigator.serviceWorker.getRegistration("/").then(r => !!(r && r.active))', 60_000, 'service worker activo')
  // El permiso se concede en el toque, como en el teléfono (antes del toque, la guardia de PWARegister no hace nada).
  await chrome.cmd('Browser.grantPermissions', { origin: ORIGEN, permissions: ['notifications'] })
  if (!await chrome.eval(boton('Activar notificaciones'))) return fallar('no encontré «Activar notificaciones».')
  const estado1 = await chrome.esperar(`(() => { const s = document.querySelector('[data-estado-push]')?.getAttribute('data-estado-push'); const err = document.querySelector('[role=alert]')?.textContent; return s === 'activo' ? 'activo' : err ? 'error: ' + err : null })()`, 180_000, 'activar (Chrome tarda de 10 a 45 s en registrarse con FCM)')
  if (estado1 !== 'activo') return fallar(`activar: ${estado1}`)
  // Volver a la app (foco) corre la guardia de re-suscripción: con la misma llave no debe crear otra suscripción.
  const endpointDe = `navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription()).then(s => s && s.endpoint)`
  const delNavegador = await chrome.eval(endpointDe)
  if (process.env.PRUEBA_AVISOS_DEPURAR) {
    const k = await chrome.eval(`navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription()).then(s => { const b = new Uint8Array(s.options.applicationServerKey); let t = ''; for (const x of b) t += String.fromCharCode(x); return btoa(t).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '') })`)
    log(`depurar: llave de la suscripción ${k === llaves.publica ? 'IGUAL' : 'DISTINTA'} a avisos.json; endpoint …${String(delNavegador).slice(-10)}; base ${tabla('push_subscriptions').map((f) => '…' + f.endpoint.slice(-10)).join(',')}`)
  }
  await chrome.eval(`(window.dispatchEvent(new Event('focus')), true)`)
  await dormir(process.env.PRUEBA_AVISOS_DEPURAR ? 45_000 : 10_000)
  const subs = tabla('push_subscriptions')
  if (process.env.PRUEBA_AVISOS_DEPURAR) log(`depurar tras foco: endpoint …${String(await chrome.eval(endpointDe)).slice(-10)}; base ${subs.map((f) => '…' + f.endpoint.slice(-10)).join(',')}`)
  if (await chrome.eval(endpointDe) !== delNavegador) return fallar('volver a la app re-suscribió el navegador (otra suscripción con la misma llave).')
  if (subs.length !== 1 || subs[0].endpoint !== delNavegador || !/^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.(googleapis|mozilla)\.com)\//.test(subs[0].endpoint)) return fallar(`push_subscriptions local: ${subs.length} fila(s) ${subs[0]?.endpoint?.slice(0, 40) ?? ''}`)
  ok(`activar: Chrome suscrito al servicio de push real (${new URL(subs[0].endpoint).host}) y su fila en la base local (web/base/push_subscriptions.json)`)
  await chrome.captura('ajustes-notificaciones-activo.png')

  if (!await chrome.eval(boton('Enviarme una prueba'))) return fallar('no encontré «Enviarme una prueba».')
  const prueba = await chrome.esperar(`${NOTIS}.then(l => l.find(n => n.title === 'Tu Arbrain') || null)`, 60_000, 'la notificación de prueba')
  if (prueba.body !== 'Fulana, así te van a llegar los avisos de Levy.' || prueba.url !== '/settings?seccion=notificaciones') return fallar(`prueba: ${JSON.stringify(prueba)}`)
  const logPrueba = tabla('push_log').filter((f) => f.job_id === 'prueba-ajustes' && f.status === 'accepted')
  if (logPrueba.length !== 1) return fallar(`push_log: ${logPrueba.length} acuses de prueba aceptados`)
  ok(`prueba: llegó «${prueba.title} · ${prueba.body}» al service worker (abre ${prueba.url}); acuse accepted en push_log`)
  await chrome.captura('ajustes-notificaciones-prueba.png')

  // 4. Una rutina que corre sola y falla (sin llave): el daemon avisa con SU token por el mismo camino.
  const crear = await pedir(puerto, '/api/rutinas', { metodo: 'POST', cookie, origen: `https://${TS}`, cuerpo: JSON.stringify({ prompt: 'Resúmeme mi día', schedule: '0 7 * * *' }) })
  const idRutina = crear.json?.tarea?.id
  if (crear.status !== 201 || !idRutina) return fallar(`crear rutina: ${crear.status} ${crear.texto.slice(0, 200)}`)
  const db = join(DATOS, 'daemon', 'store', 'claudeclaw.db')
  const vence = spawnSync('sqlite3', [db, `UPDATE scheduled_tasks SET next_run = ${Math.floor(Date.now() / 1000) - 60} WHERE id = '${idRutina.replace(/'/g, '')}';`], { encoding: 'utf8' })
  if (vence.status !== 0) return fallar(`no pude adelantar la rutina (sqlite3): ${vence.stderr}`)
  log('rutina creada y vencida; el scheduler la corre en su siguiente vuelta (≤ 60 s)…')
  const rutina = await chrome.esperar(`${NOTIS}.then(l => l.find(n => n.title.startsWith('Tu rutina')) || null)`, 150_000, 'el aviso de la rutina')
  if (rutina.title !== 'Tu rutina no terminó: Resúmeme mi día' || rutina.url !== '/chat?panel=taller&taller=rutinas' || !rutina.tag.startsWith(`rutina-${idRutina}-`)) return fallar(`rutina: ${JSON.stringify(rutina)}`)
  if (!tabla('push_log').some((f) => f.job_id === 'aviso:rutina' && f.status === 'accepted')) return fallar('push_log sin acuse aviso:rutina')
  ok(`rutina: el daemon avisó «${rutina.title} · ${rutina.body}» (abre ${rutina.url}); acuse aviso:rutina en push_log`)

  // 5. El lector en el teléfono con la voz del alumno: pide Opus y su daemon (LemonFox) responde WAV.
  const tramo = await chrome.eval(`fetch('/api/chat/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ${JSON.stringify(TEXTO_LECTOR)}, lector: true, velocidad: 1, formato: 'opus' }) })
    .then(async (r) => {
      const b = await r.arrayBuffer()
      const o = { status: r.status, tipo: r.headers.get('content-type'), marcas: r.headers.get('x-marcas'), falta: r.headers.get('x-marcas-falta'), bytes: b.byteLength }
      if (!r.ok) { try { o.code = JSON.parse(new TextDecoder().decode(b)).code } catch { /* */ } return o }
      o.cabeza = String.fromCharCode(...new Uint8Array(b, 0, 4))
      try { const a = await new OfflineAudioContext(1, 1, 24000).decodeAudioData(b.slice(0)); o.duracion = a.duration } catch (e) { o.error = String(e) }
      return o
    })`)
  if (CON_VOZ) {
    if (tramo.status !== 200) return fallar(`lector: /api/chat/tts dio ${tramo.status} ${tramo.code ?? ''} con la llave de LemonFox del alumno`)
    if (tramo.tipo !== 'audio/wav' || tramo.cabeza !== 'RIFF') return fallar(`lector: con formato opus el daemon del alumno respondió ${tramo.tipo} (${tramo.cabeza}), no WAV`)
    if (!(tramo.duracion > 1)) return fallar(`lector: el navegador no decodificó el WAV (${tramo.error ?? tramo.duracion})`)
    let palabras = 0
    if (LLAVES_VOZ.GROQ_API_KEY) {
      try { const t = JSON.parse(tramo.marcas); palabras = Array.isArray(t.m) ? t.m.length : 0; if (t.n !== TEXTO_LECTOR.length) palabras = -1 } catch { palabras = 0 }
      if (palabras <= 0) return fallar(`lector: sin marcas exactas con la llave de Groq (X-Marcas ${tramo.marcas ? 'ilegible' : 'ausente'}, falta ${tramo.falta ?? '—'})`)
    } else if (tramo.falta !== 'sin_llave_groq') return fallar(`lector: sin llave de Groq esperaba X-Marcas-Falta sin_llave_groq, llegó ${tramo.falta}`)
    for (const f of readdirSync(join(DATOS, 'logs'))) {
      const t = readFileSync(join(DATOS, 'logs', f), 'utf8')
      if (Object.values(LLAVES_VOZ).some((k) => t.includes(k))) return fallar(`lector: una llave de voz salió en logs/${f}.`)
    }
    ok(`lector: el teléfono pidió Opus y la voz del alumno (LemonFox) llegó en WAV de ${(tramo.bytes / 1024).toFixed(0)} KB, ${tramo.duracion.toFixed(1)} s, decodificado en el navegador${palabras ? ` con ${palabras} marcas de palabra (Groq)` : ', sin marcas (sin llave de Groq)'}`)
  } else {
    if (tramo.status !== 503 || tramo.code !== 'sin_voz_servidor') return fallar(`lector sin llave: esperaba 503 sin_voz_servidor, llegó ${tramo.status} ${tramo.code ?? ''}`)
    ok('lector: sin llave de LemonFox, 503 sin_voz_servidor (el lector usa la voz del sistema). Con LEMONFOX_API_KEY en el entorno se prueba la voz del alumno')
  }

  // 6. Desactivar.
  if (!await chrome.eval(boton('Desactivar'))) return fallar('no encontré «Desactivar».')
  await chrome.esperar(`document.querySelector('[data-estado-push]')?.getAttribute('data-estado-push') === 'listo'`, 30_000, 'desactivar')
  if (tabla('push_subscriptions').length !== 0) return fallar('desactivar no borró la suscripción local.')
  ok('desactivar: el estado vuelve a «listo» y la base local queda sin suscripciones')

  chrome.cerrar(); chrome = null
  proxy.close(); proxy = null
  const det = orden('detener')
  if (det.status !== 0) return fallar(`detener: ${det.stdout}`)
  const finSalida = Date.now() + 30_000
  while (salida === null && Date.now() < finSalida) await dormir(500)
  if (salida === null) return fallar('el supervisor sigue vivo tras detener.')
  for (const f of readdirSync(join(DATOS, 'logs'))) if (readFileSync(join(DATOS, 'logs', f), 'utf8').includes(llaves.privada)) return fallar(`al final, la llave privada salió en logs/${f}.`)
  console.log(`\n${resultados.join('\n')}\nPRUEBA_AVISOS_OK`)
}

main().catch((e) => fallar(e?.stack ?? String(e)))
