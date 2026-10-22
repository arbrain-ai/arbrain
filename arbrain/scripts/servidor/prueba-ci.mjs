#!/usr/bin/env node
/**
 * Prueba de punta a punta del modo servidor (21 oct 2026), para CI en Windows, Linux y macOS.
 * La corre `.github/workflows/modo-servidor.yml` de la copia del alumno (fuente:
 * arbrain/empaquetado/ci/workflows/modo-servidor.yml). También sirve a mano:
 *
 *   node arbrain/scripts/servidor/prueba-ci.mjs [--datos <carpeta>] [--plazo-min <n>]
 *
 * Qué hace: elige un puerto libre, arranca `servidor.mjs --sin-navegador --puerto <libre> --datos <temporal>` (edición
 * cliente: instala, compila web y daemon, lanza ambos), espera a que la web responda `/api/version` 200, el daemon
 * `/health` (401 sin token = vivo y con su candado) y el supervisor `/estado` con el pid del daemon; luego corre
 * `servidor.mjs detener` y exige que el supervisor salga y que los puertos queden libres. Si algo falla imprime la cola
 * de los logs (la carpeta `<datos>/logs` queda para subirla como artefacto) y sale con 1. Nunca imprime secretos.
 *
 * v0.2.6: entre el arranque y `detener` corre el recorrido de punta a punta de los dos arreglos, con la sesión del
 * navegador (la cookie que da la contraseña de `acceso.json`, sin imprimirla) y un cerebro de prueba propio
 * (`<datos>/cerebro-prueba`, así nunca toca el calendario de nadie):
 *   - adjuntos: subir PNG, PDF y texto a `/api/storage/upload` (antes 404 en esta edición), leerlos de vuelta con
 *     sesión, 401 sin sesión, 400 a un HTML disfrazado y 404 a un path traversal; el archivo queda donde el daemon lo
 *     copia (`<datos>/web/adjuntos`).
 *   - calendario: los objetivos del día escritos a mano en `calendario.json` como los escribiría Levy (incluidos uno
 *     sin `fin` y uno de día completo con `fin` igual al inicio) salen TODOS en `/api/planning`, y `/calendar` existe en esta edición.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../servidor.mjs', import.meta.url))
const argv = process.argv.slice(2)
const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const DATOS = resolve(opcion('--datos') ?? join(tmpdir(), `arbrain-ci-${process.pid}`))
const PLAZO_MS = Number(opcion('--plazo-min') ?? 30) * 60_000
const CEREBRO = join(DATOS, 'cerebro-prueba')
const HOST = '127.0.0.1'
const t0 = Date.now()
const seg = () => `${Math.round((Date.now() - t0) / 1000)} s`
const log = (m) => console.log(`[prueba-ci ${seg()}] ${m}`)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function puertoLibre() {
  return new Promise((ok, mal) => {
    const s = net.createServer()
    s.once('error', mal)
    s.listen(0, HOST, () => { const { port } = s.address(); s.close(() => ok(port)) })
  })
}
function ocupado(port) {
  return new Promise((ok) => {
    const s = net.createServer()
    s.once('error', () => ok(true))
    s.listen(port, HOST, () => s.close(() => ok(false)))
  })
}
function pedir(port, ruta, token) {
  return new Promise((ok) => {
    const req = http.request({ host: HOST, port, path: ruta, timeout: 4000, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let b = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { b += c })
      res.on('end', () => { let j = null; try { j = JSON.parse(b) } catch { /* */ } ok({ status: res.statusCode ?? 0, json: j }) })
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => ok({ status: 0, json: null }))
    req.end()
  })
}
const proceso = () => { try { return JSON.parse(readFileSync(join(DATOS, 'daemon', 'config', 'servidor.json'), 'utf8')) } catch { return null } }

function colaDeLogs() {
  const dir = join(DATOS, 'logs')
  if (!existsSync(dir)) return log(`(no hay ${dir})`)
  for (const f of readdirSync(dir)) {
    const lineas = readFileSync(join(dir, f), 'utf8').split(/\r?\n/)
    console.log(`\n───── ${f} (últimas 80 líneas) ─────\n${lineas.slice(-80).join('\n')}`)
  }
}

let supervisor = null
let salida = null
async function fallar(msg) {
  console.error(`\n[prueba-ci ${seg()}] FALLÓ: ${msg}\n`)
  colaDeLogs()
  if (supervisor && salida === null) {
    spawnSync(process.execPath, [SCRIPT, 'detener', '--datos', DATOS], { stdio: 'inherit', timeout: 30_000 })
    await dormir(2000)
    if (salida === null) try { supervisor.kill('SIGKILL') } catch { /* */ }
  }
  process.exit(1)
}

async function main() {
  const puerto = await puertoLibre()
  log(`Node ${process.version} · ${process.platform}/${process.arch} · datos ${DATOS} · puerto web ${puerto}`)
  sembrarCerebroDePrueba()
  supervisor = spawn(process.execPath, [SCRIPT, '--sin-navegador', '--puerto', String(puerto), '--datos', DATOS, '--cerebro', CEREBRO], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ARBRAIN_SERVIDOR_DATOS: DATOS },
  })
  supervisor.on('exit', (c, s) => { salida = c ?? s ?? 'desconocido' })

  // 1. Arranque completo: web, daemon y supervisor responden.
  const fin = Date.now() + PLAZO_MS
  let estado = null
  while (Date.now() < fin) {
    if (salida !== null) return fallar(`el supervisor salió antes de quedar listo (código ${salida}).`)
    const p = proceso()
    if (p?.puertoControl && p?.puertoDaemon) {
      const [web, daemon, est] = await Promise.all([
        pedir(puerto, '/api/version'),
        pedir(p.puertoDaemon, '/health'),
        pedir(p.puertoControl, '/estado', p.tokenCli),
      ])
      if (web.status === 200 && (daemon.status === 200 || daemon.status === 401) && est.status === 200 && est.json?.daemon?.pid) {
        estado = { p, web: web.json, daemon: daemon.status, pidDaemon: est.json.daemon.pid, pidWeb: est.json.web?.pid }
        break
      }
    }
    await dormir(2000)
  }
  if (!estado) return fallar(`no quedó listo en ${PLAZO_MS / 60_000} min.`)
  log(`LISTO: web /api/version 200 (${JSON.stringify(estado.web)?.slice(0, 160)}) · daemon /health ${estado.daemon} (pid ${estado.pidDaemon}) · web pid ${estado.pidWeb}`)

  const est = spawnSync(process.execPath, [SCRIPT, 'estado', '--datos', DATOS], { encoding: 'utf8', timeout: 30_000 })
  log(`estado → ${(est.stdout ?? '').trim().split(/\r?\n/)[0]}`)
  if (!/Corriendo/.test(est.stdout ?? '')) return fallar('`servidor estado` no lo ve corriendo.')

  // 2. Recorrido de punta a punta (v0.2.6): adjuntos y calendario con la sesión del navegador.
  const fallo = await recorrido(puerto)
  if (fallo) return fallar(fallo)

  // 3. detener: el supervisor sale y libera los puertos.
  const det = spawnSync(process.execPath, [SCRIPT, 'detener', '--datos', DATOS], { encoding: 'utf8', timeout: 60_000 })
  log(`detener → ${(det.stdout ?? '').trim()}`)
  if (det.status !== 0) return fallar(`\`servidor detener\` salió con ${det.status}.`)
  const finSalida = Date.now() + 30_000
  while (salida === null && Date.now() < finSalida) await dormir(500)
  if (salida === null) return fallar('el supervisor sigue vivo 30 s después de `detener`.')
  if (salida !== 0) return fallar(`el supervisor salió con código ${salida} al detenerse.`)
  const puertos = [puerto, estado.p.puertoDaemon, estado.p.puertoControl]
  let libres = false
  for (let i = 0; i < 20 && !libres; i++) { libres = !(await Promise.all(puertos.map(ocupado))).some(Boolean); if (!libres) await dormir(500) }
  if (!libres) return fallar(`tras detener sigue ocupado algún puerto de ${puertos.join(', ')}.`)
  if (proceso()) return fallar('quedó servidor.json tras detener.')
  log('OK: arrancó (web + daemon sanos) y se detuvo limpio.')
}

// ── Recorrido v0.2.6 ────────────────────────────────────────────────────────────────────────────────────────────────

/** Día de la prueba en la zona de la máquina (el calendario sin `zona` usa la del sistema). */
const HOY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
const desfase = (() => { const m = -new Date(`${HOY}T12:00:00`).getTimezoneOffset(); const a = Math.abs(m); return `${m >= 0 ? '+' : '-'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}` })()
const OBJETIVOS_DEL_DIA = ['Escribir la oferta', 'Mandar 10 mensajes', 'Grabar el video', 'Llamada con un cliente', 'Gym']

function sembrarCerebroDePrueba() {
  mkdirSync(join(CEREBRO, '.claude', 'plan'), { recursive: true })
  writeFileSync(join(CEREBRO, '.claude', 'plan', 'calendario.json'), JSON.stringify({ version: 1, eventos: [
    { id: 'obj-1', titulo: OBJETIVOS_DEL_DIA[0], inicio: `${HOY}T09:00:00${desfase}`, fin: `${HOY}T10:00:00${desfase}`, descripcion: 'Objetivo del día · [levy]' },
    { id: 'obj-2', titulo: OBJETIVOS_DEL_DIA[1], inicio: `${HOY}T10:30:00${desfase}` },
    { id: 'obj-3', titulo: OBJETIVOS_DEL_DIA[2], inicio: `${HOY}T12:00`, fin: `${HOY}T12:45` },
    { id: 'obj-4', title: OBJETIVOS_DEL_DIA[3], start: `${HOY}T17:00:00${desfase}`, end: `${HOY}T17:30:00${desfase}` },
    { id: 'obj-5', titulo: OBJETIVOS_DEL_DIA[4], inicio: HOY, fin: HOY, todoElDia: true },
  ], tareas: [], recibos: {} }, null, 2))
  // Tres objetivos del día en casillas (el reporte: «solo mostró 1 objetivo, no los 3»).
  const [a, m, d] = HOY.split('-'), mes = new Intl.DateTimeFormat('es', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(a), Number(m) - 1, 15)))
  writeFileSync(join(CEREBRO, '.claude', 'plan', 'objetivos.md'), `# Objetivos\n\n## ${mes} ${a}\n**Mes:** Tres clientes\n\n#### Hoy ${Number(d)}\n${OBJETIVOS_EN_CASILLAS.map((t) => `- [ ] ${t}`).join('\n')}\n`)
}
const OBJETIVOS_EN_CASILLAS = ['Documentar el API para un cliente', 'Montar la tienda en línea', 'Ajustar los productos publicados']

function cookieDeSesion() {
  const acceso = JSON.parse(readFileSync(join(DATOS, 'daemon', 'config', 'acceso.json'), 'utf8'))
  const g = Number.isSafeInteger(Number(acceso.generacion)) ? Number(acceso.generacion) : 0
  return `arbrain_escritorio=s1.${createHmac('sha256', acceso.contrasena).update(`arbrain-sesion-servidor:${g}`).digest('hex')}`
}

const PNG_1PX = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000301010018dd8db40000000049454e44ae426082', 'hex')

async function recorrido(puerto) {
  const base = `http://${HOST}:${puerto}`
  const cookie = cookieDeSesion()
  const subir = (nombre, tipo, cuerpo, conSesion = true) => {
    const form = new FormData()
    form.append('file', new Blob([cuerpo], { type: tipo }), nombre)
    return fetch(`${base}/api/storage/upload`, { method: 'POST', body: form, headers: conSesion ? { cookie } : {} })
  }
  // Adjuntos.
  const casos = [['captura.png', 'image/png', PNG_1PX, 'image/png'], ['Estado de cuenta.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n%prueba\n'), 'application/pdf'], ['notas.md', 'text/markdown', Buffer.from('# Notas\nhola'), 'text/markdown']]
  for (const [nombre, tipo, cuerpo, esperado] of casos) {
    const r = await subir(nombre, tipo, cuerpo)
    const j = await r.json().catch(() => ({}))
    if (r.status !== 200 || typeof j.url !== 'string' || !j.url.includes('/api/storage/adjunto/')) return `subir ${nombre}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`
    const ruta = new URL(j.url).pathname
    const archivo = decodeURIComponent(ruta.split('/').pop())
    if (!existsSync(join(DATOS, 'web', 'adjuntos', archivo))) return `el adjunto ${nombre} no quedó en <datos>/web/adjuntos (donde lo copia el daemon)`
    const leido = await fetch(`${base}${ruta}`, { headers: { cookie } })
    const bytes = Buffer.from(await leido.arrayBuffer())
    if (leido.status !== 200 || !bytes.equals(cuerpo) || !(leido.headers.get('content-type') ?? '').startsWith(esperado) || leido.headers.get('x-content-type-options') !== 'nosniff') {
      return `leer ${nombre}: ${leido.status} ${leido.headers.get('content-type')} (${bytes.length} bytes)`
    }
    const sinSesion = await fetch(`${base}${ruta}`)
    if (sinSesion.status !== 401) return `leer ${nombre} sin sesión respondió ${sinSesion.status}, se esperaba 401`
    log(`adjunto ${nombre}: subió, se lee con sesión (${esperado}) y sin sesión da 401`)
  }
  const html = await subir('pagina.pdf', 'application/pdf', Buffer.from('<html><script>alert(1)</script></html>'))
  if (html.status !== 400) return `un HTML disfrazado de PDF respondió ${html.status}, se esperaba 400`
  const anonimo = await subir('captura.png', 'image/png', PNG_1PX, false)
  if (anonimo.status !== 401) return `subir sin sesión respondió ${anonimo.status}, se esperaba 401`
  for (const malo of ['..%2F..%2Fdaemon%2Fconfig%2Facceso.json', '..%2Fbase%2Fchat.json', 'acceso.json']) {
    const r = await fetch(`${base}/api/storage/adjunto/${malo}`, { headers: { cookie } })
    if (r.status === 200) return `path traversal ${malo} respondió 200`
  }
  log('adjuntos: HTML disfrazado 400, sin sesión 401, traversal rechazado')

  // Calendario: todos los objetivos del día escritos a mano se pintan.
  const desde = new Date(`${HOY}T00:00:00`).toISOString(), hasta = new Date(new Date(`${HOY}T00:00:00`).getTime() + 86_400_000).toISOString()
  const snap = await fetch(`${base}/api/planning?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`, { headers: { cookie } })
  const s = await snap.json().catch(() => ({}))
  if (snap.status !== 200) return `/api/planning respondió ${snap.status}: ${JSON.stringify(s).slice(0, 200)}`
  const titulos = new Set((s.events ?? []).map((e) => e.title))
  const faltan = OBJETIVOS_DEL_DIA.filter((t) => !titulos.has(t))
  if (faltan.length) return `el calendario no pinta ${faltan.join(', ')} (pinta: ${[...titulos].join(', ')})`
  const calendario = await fetch(`${base}/calendar`, { headers: { cookie }, redirect: 'manual' })
  // En una instalación nueva toda página pasa antes por /bienvenida (primer arranque); lo que no debe pasar es que la
  // edición la mande a /chat (página que no existe en cliente).
  const destino = calendario.headers.get('location') ?? ''
  if (calendario.status !== 200 && !(calendario.status >= 300 && calendario.status < 400 && destino.startsWith('/bienvenida'))) return `/calendar respondió ${calendario.status}${destino ? ` → ${destino}` : ''}`
  const obj = await fetch(`${base}/api/planning/objectives`, { headers: { cookie } })
  const o = await obj.json().catch(() => ({}))
  const delDia = (o.context ?? []).filter((c) => c.scope === 'day' && c.start === HOY).map((c) => c.text)
  if (obj.status !== 200 || OBJETIVOS_EN_CASILLAS.some((t) => !delDia.includes(t))) return `objetivos del día: ${obj.status}, llegan ${JSON.stringify(delDia)} (se esperaban los 3)`
  log(`calendario: los ${OBJETIVOS_EN_CASILLAS.length} objetivos del día de objetivos.md llegan a la vista`)
  log(`calendario: los ${OBJETIVOS_DEL_DIA.length} objetivos del día escritos a mano se pintan y /calendar existe${calendario.status === 200 ? '' : ' (tras la bienvenida)'}`)
  return null
}

main().catch((e) => fallar(e?.stack ?? String(e)))
