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
  return await recorridoSesion(base, cookie)
}

/**
 * v0.2.7 (prueba en Windows del 22 oct 2026, puntos 10 y 11). Sin llave ni sesión:
 *   - `/api/llaves/suscripcion` encuentra el Claude Code recién instalado aunque el PATH de este proceso sea viejo (el
 *     workflow lo instala en un paso anterior y no toca el PATH: `ARBRAIN_CI_CLAUDE=instalado`), responde a tiempo y
 *     dice qué falta en UNA línea.
 *   - el chat no da un error crudo: la selección responde `falta_llave` con el aviso de cómo conectarse, y el turno
 *     también. Nunca «No se pudo confirmar el modelo».
 */
async function recorridoSesion(base, cookie) {
  // A mano en una computadora con Claude Code ya con sesión (la del autor), lo «sin sesión» no aplica: se salta y se dice.
  if (process.env.ARBRAIN_PRUEBA_CON_SESION === '1') { log('sesión: se salta lo «sin sesión» (ARBRAIN_PRUEBA_CON_SESION=1, esta computadora tiene sesión)'); return await recorridoExpediente(base, cookie) }
  // v0.2.7 (encargo de Daniel, 22 oct): Claude Code instalado DESPUÉS de arrancar Arbrain. El workflow pasa el comando
  // que lo instala (en Windows, `claude.cmd` de npm en una carpeta con espacios y solo en el PATH del registro).
  const despues = process.env.ARBRAIN_CI_INSTALAR_DESPUES
  if (despues) {
    log('instalando Claude Code con Arbrain ya corriendo…')
    const inst = spawnSync(despues, { shell: true, stdio: 'inherit' })
    if (inst.status !== 0) return `falló instalar Claude Code con Arbrain corriendo (código ${inst.status})`
  }
  const t = Date.now()
  const r = await fetch(`${base}/api/llaves/suscripcion?fresco=1`, { headers: { cookie }, signal: AbortSignal.timeout(90_000) })
  const s = await r.json().catch(() => ({}))
  if (r.status !== 200) return `/api/llaves/suscripcion respondió ${r.status}: ${JSON.stringify(s).slice(0, 200)}`
  const instalado = process.env.ARBRAIN_CI_CLAUDE === 'instalado' || !!despues
  if (s.sesion !== false || s.activo !== false) return `sin sesión, /api/llaves/suscripcion dijo sesion=${s.sesion} activo=${s.activo}`
  if (instalado && (s.instalado !== true || s.code !== 'sin_sesion')) return `Claude Code recién instalado (PATH sin refrescar) no se detectó: ${JSON.stringify({ instalado: s.instalado, code: s.code, mensaje: s.mensaje })}`
  if (!['sin_claude', 'sin_sesion'].includes(s.code)) return `código inesperado de la sesión: ${s.code} (${s.mensaje})`
  if (typeof s.mensaje !== 'string' || !s.mensaje || /\n/.test(s.mensaje) || s.mensaje.length > 220 || /`/.test(s.mensaje)) return `el aviso de la sesión no es una línea clara sin comandos: ${JSON.stringify(s.mensaje)}`
  log(`sesión: ${s.instalado ? 'Claude Code encontrado' : 'sin Claude Code'} en ${Date.now() - t} ms (${s.code}): «${s.mensaje}»`)

  const sel = await fetch(`${base}/api/chat/selection?account=default`, { headers: { cookie } })
  const j = await sel.json().catch(() => ({}))
  if (sel.status !== 409 || j.code !== 'falta_llave' || !/^Levy todavía no está conectado a un modelo\./.test(j.error ?? '')) return `sin llave, la selección respondió ${sel.status} ${JSON.stringify(j).slice(0, 240)} (se esperaba 409 falta_llave)`
  const turno = await fetch(`${base}/api/chat/stream`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ message: '¿Quién eres?' }) })
  const cuerpo = await turno.text()
  if (!/falta_llave/.test(cuerpo) || /No se pudo confirmar el modelo/.test(cuerpo)) return `sin llave, «¿Quién eres?» respondió ${turno.status}: ${cuerpo.slice(0, 240)}`
  log('chat sin llave: la selección y el turno dicen cómo conectarse (falta_llave), sin error crudo')
  return await recorridoExpediente(base, cookie)
}

// ── Recorrido v0.2.9: el expediente en la memoria de su Levy y el ritual «bajar a tierra» ──────────────────────────────

/**
 * Daniel, 22 oct 18:31: «deberemos asegurarnos que su propio Levy lo tenga… que empiecen a bajar a tierra el mes, luego
 * la semana y luego el día». Con un servidor FALSO del puente en 127.0.0.1 y un expediente inventado (nunca datos de un alumno):
 *   - la semilla deja `project/meta-90-dias.md` pendiente; conectar el puente desde Ajustes trae el expediente y lo
 *     siembra en `user/expediente.md` y `project/meta-90-dias.md` (meta, escalera y nicho) con su línea en el índice;
 *     lo editado a mano no se reescribe.
 *   - `plan.py` de la skill `bajar-a-tierra` lee la meta, respeta el mes escrito a mano (alto sin `--reemplazar`),
 *     escribe mes, semana (3 resultados) y día (objetivo y 3 tareas), y la vista los recibe: objetivos en
 *     `/api/planning/objectives` y el objetivo con sus 3 casillas como tarea `objetivo` en `/api/planning`.
 *   - mi camino (día N de 90, etapa, casillas y siguiente paso) llega a `project/mi-camino.md` al conectar, lo editado a
 *     mano no se reescribe y, si el puente no tiene la ruta (404), queda lo último guardado; `plan.py estado` lo lee.
 *   - `plan.py lienzos` redibuja «Mi plan» y «Calendario de 12 semanas» por la API del lienzo (aquí con la sesión del
 *     navegador a través de un puente local que pone la cookie; dentro de la app, con el pase del agente).
 */
const TOKEN_FALSO = `arb_${'e2eprueba'.repeat(5)}`
const EXPEDIENTE_FALSO = {
  v: 1, nombre: 'Prueba', actualizado: '2026-10-20T15:00:00Z', completo: true, porcentaje: 100,
  respuestas: { quiero: 'Tiempo con mi familia', meta_monto: 900, moneda: 'USD', meta_fecha: '2027-01-20', suficiente: 600, libre: 800, absoluta: 990, horas: 10, activos: 'Quince años en mantenimiento de flotillas de reparto' },
  markdown: '# Expediente de Prueba\n\n## Acto I · Tu vida\n\n### 1. ¿Qué quieres en tu vida?\nTiempo con mi familia\n',
}
// Mi camino (contrato v1 de camino.ts), inventado: nunca de un alumno real.
const CAMINO_FALSO = {
  v: 1, actualizado: '2026-10-28T13:00:00Z', nombre: 'Prueba', inicio: '2026-10-26', dia: 3, dias_total: 90, semana: 1, semanas_total: 12,
  etapa: { n: 1, total: 5, nombre: 'Tu cerebro', semanas: 'Semanas 1 y 2' },
  paso: { id: 'semana1', n: 9, total: 9, nombre: 'Tu Semana 1' },
  casillas: [1, 2, 3].map((numero) => ({ numero, titulo: `Casilla ${numero}`, marcada: true }))
    .concat([{ numero: 4, titulo: 'Tu ritual de la mañana y tres encargos reales hechos con tu Levy', marcada: false }, { numero: 5, titulo: 'Te presentaste en la comunidad', marcada: false }]),
  siguiente_paso: { clave: 'casillas', texto: 'marca tu casilla 4', detalle: 'Tu ritual de la mañana y tres encargos reales.', href: '/programa/semana-1#casilla-4' },
  siguiente_hito: { titulo: 'Diagnóstico uno a uno', fecha: '2026-10-31' },
  leccion_actual: { curso: '1 · Instala tu cerebro artificial y primeros pasos', titulo: 'Tu primer hábito', n: 7, total: 7 },
  meta: { monto: 900, moneda: 'USD', fecha: '2027-01-20' },
}
const RAIZ_COPIA = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const PY = process.platform === 'win32' ? 'python' : 'python3'

function escuchar(manejar) {
  return new Promise((ok) => { const s = http.createServer(manejar); s.listen(0, HOST, () => ok(s)) })
}

async function recorridoExpediente(base, cookie) {
  const norte = join(CEREBRO, '.claude', 'memory', 'project', 'meta-90-dias.md')
  const expediente = join(CEREBRO, '.claude', 'memory', 'user', 'expediente.md')
  if (!existsSync(norte) || !readFileSync(norte, 'utf8').startsWith('<!-- arbrain:expediente pendiente -->')) return 'la semilla no dejó project/meta-90-dias.md pendiente'
  const camino = join(CEREBRO, '.claude', 'memory', 'project', 'mi-camino.md')
  if (!existsSync(camino) || !readFileSync(camino, 'utf8').startsWith('<!-- arbrain:camino pendiente -->')) return 'la semilla no dejó project/mi-camino.md pendiente'
  if (!readFileSync(join(RAIZ_COPIA, 'CLAUDE.md'), 'utf8').includes('@.claude/memory/project/mi-camino.md')) return 'CLAUDE.md no importa project/mi-camino.md'
  let pedidos = 0, pedidosCamino = 0, caminoCaido = false
  const falso = await escuchar((req, res) => {
    const j = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) }
    if (req.method === 'GET' && req.url === '/api/progreso/expediente') { pedidos++; return req.headers.authorization === `Bearer ${TOKEN_FALSO}` ? j(200, EXPEDIENTE_FALSO) : j(401, { error: 'token' }) }
    if (req.method === 'GET' && req.url === '/api/progreso/camino') {
      pedidosCamino++
      if (caminoCaido) return j(404, { error: 'no' })
      return req.headers.authorization === `Bearer ${TOKEN_FALSO}` ? j(200, CAMINO_FALSO) : j(401, { error: 'token' })
    }
    if (req.method === 'POST' && req.url === '/api/progreso') { req.resume(); return j(200, { ok: true }) }
    j(404, { error: 'no' })
  })
  try {
    const urlPuente = `http://${HOST}:${falso.address().port}/api/progreso`
    const progreso = (cuerpo) => fetch(`${base}/api/progreso`, cuerpo ? { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(cuerpo) } : { headers: { cookie } })
    const c = await progreso({ accion: 'conectar', token: TOKEN_FALSO, url: urlPuente })
    if (c.status !== 200) return `conectar el puente respondió ${c.status}: ${(await c.text()).slice(0, 200)}`
    const fin = Date.now() + 20_000
    while (Date.now() < fin && !(existsSync(norte) && readFileSync(norte, 'utf8').includes('900 USD al mes'))) await dormir(500)
    const n = existsSync(norte) ? readFileSync(norte, 'utf8') : ''
    if (!n.includes('900 USD al mes para el 2027-01-20')) return `al conectar, el expediente no llegó a meta-90-dias.md (pedidos al falso: ${pedidos}): ${n.slice(0, 200)}`
    if (!n.includes('mantenimiento de flotillas') || !/nicho natural/i.test(n)) return 'meta-90-dias.md no trae el nicho natural (su industria)'
    if (!existsSync(expediente) || !readFileSync(expediente, 'utf8').includes('# Expediente de Prueba')) return 'user/expediente.md no quedó con el expediente literal'
    const indice = readFileSync(join(CEREBRO, '.claude', 'memory', 'MEMORY-indice.md'), 'utf8')
    if (!indice.includes('`project/meta-90-dias.md`') || !indice.includes('`user/expediente.md`')) return 'el índice de memoria no anotó el expediente'
    const r = await (await progreso()).json().catch(() => ({}))
    if (!String(r.expediente?.resultado ?? '').startsWith('sembrado')) return `Ajustes no ve el expediente sembrado: ${JSON.stringify(r.expediente)}`
    log(`expediente: al conectar llegó a la memoria (meta, escalera y nicho) con su línea en el índice (${pedidos} pedido(s))`)
    // Lo editado a mano no se reescribe, ni con «Enviar ahora» (que también lo trae).
    const editado = n.replace('900 USD', '700 USD')
    writeFileSync(norte, editado)
    const e = await progreso({ accion: 'enviar' })
    const ej = await e.json().catch(() => ({}))
    if (e.status !== 200 || ej.expediente_ahora !== 'sembrado') return `«Enviar ahora» no trajo el expediente: ${e.status} ${JSON.stringify(ej).slice(0, 200)}`
    if (readFileSync(norte, 'utf8') !== editado) return 'el puente reescribió meta-90-dias.md editado a mano'
    writeFileSync(norte, n)
    log('expediente: lo editado a mano se respeta')

    // Mi camino: llegó al conectar; lo editado a mano no se reescribe; si el puente no lo tiene, queda lo último.
    const finC = Date.now() + 20_000
    while (Date.now() < finC && !(existsSync(camino) && readFileSync(camino, 'utf8').includes('día 3 de 90'))) await dormir(500)
    const k = existsSync(camino) ? readFileSync(camino, 'utf8') : ''
    if (!k.includes('- **Dónde voy:** día 3 de 90 · semana 1 de 12 · etapa 1 de 5 «Tu cerebro»')) return `al conectar, el camino no llegó a mi-camino.md (pedidos al falso: ${pedidosCamino}): ${k.slice(0, 300)}`
    if (!k.includes('Falta la 4: Tu ritual de la mañana') || !k.includes('**Mi siguiente paso:** marca tu casilla 4.') || !k.includes(`http://${HOST}:${falso.address().port}/programa/semana-1#casilla-4`)) return `mi-camino.md no trae la casilla que falta ni el siguiente paso: ${k.slice(0, 400)}`
    if (!readFileSync(join(CEREBRO, '.claude', 'memory', 'MEMORY-indice.md'), 'utf8').includes('`project/mi-camino.md`')) return 'el índice de memoria no anotó mi camino'
    const kEditado = k.replace('día 3 de 90', 'día 3 de 90 (voy atrasado)')
    writeFileSync(camino, kEditado)
    const e2 = await (await progreso({ accion: 'enviar' })).json().catch(() => ({}))
    if (e2.camino_ahora !== 'escrito' || readFileSync(camino, 'utf8') !== kEditado) return `«Enviar ahora» reescribió mi-camino.md editado a mano (${e2.camino_ahora})`
    writeFileSync(camino, k)
    caminoCaido = true
    const e3 = await (await progreso({ accion: 'enviar' })).json().catch(() => ({}))
    if (e3.camino_ahora !== 'sin_camino' || readFileSync(camino, 'utf8') !== k) return `sin la ruta en el puente, mi-camino.md no quedó como estaba (${e3.camino_ahora})`
    if (e3.camino?.resultado !== 'sin_camino') return `Ajustes no ve el resultado del camino: ${JSON.stringify(e3.camino)}`
    log(`camino: al conectar llegó a la memoria (día, etapa, casillas y siguiente paso); lo editado a mano se respeta y sin la ruta queda lo último (${pedidosCamino} pedido(s))`)
  } finally { falso.close() }

  // El ritual: mes → semana → día con la pluma de la skill.
  const plan = join(RAIZ_COPIA, '.claude', 'skills', 'bajar-a-tierra', 'scripts', 'plan.py')
  const correr = (...args) => {
    const r = spawnSync(PY, [plan, ...args], { encoding: 'utf8', timeout: 90_000, env: { ...process.env, ARBRAIN_PLAN_RAIZ: CEREBRO } })
    let j = null; try { j = JSON.parse(r.stdout) } catch { /* */ }
    return { codigo: r.status, j, err: (r.stderr ?? '').slice(-300) }
  }
  let x = correr('estado')
  if (x.codigo !== 0 || !x.j?.meta_90?.presente || x.j.meta_90.fecha !== '2027-01-20' || !/flotillas/.test(x.j.meta_90.nicho ?? '')) return `plan.py estado no leyó la meta del expediente: ${JSON.stringify(x.j ?? x.err).slice(0, 300)}`
  if (!x.j.camino?.presente || x.j.camino.inicio !== '2026-10-26' || JSON.stringify(x.j.camino.casillas_faltan) !== '[4,5]' || !/casilla 4/.test(x.j.camino.siguiente_paso ?? '')) return `plan.py estado no leyó mi camino: ${JSON.stringify(x.j.camino).slice(0, 300)}`
  if (x.j.mes !== 'Tres clientes' || x.j.falta !== 'semana') return `plan.py estado: mes ${x.j.mes}, falta ${x.j.falta} (se esperaba el mes escrito a mano y que falte la semana)`
  x = correr('mes', '--texto', '300 USD cobrados de mi primer cliente')
  if (x.codigo !== 3 || !/Tres clientes/.test(x.j?.alto ?? '')) return `plan.py mes pisó el mes escrito a mano: ${JSON.stringify(x)}`
  x = correr('mes', '--texto', '300 USD cobrados de mi primer cliente', '--reemplazar')
  if (x.codigo !== 0) return `plan.py mes --reemplazar: ${JSON.stringify(x).slice(0, 300)}`
  const RES = ['Oferta de diagnóstico escrita', '10 conversaciones con gerentes de flotilla', '2 diagnósticos agendados']
  x = correr('semana', ...RES.flatMap((t) => ['--resultado', t]))
  if (x.codigo !== 0) return `plan.py semana: ${JSON.stringify(x).slice(0, 300)}`
  const TAREAS = ['Lista de 10 gerentes', 'Borrador de la oferta', 'Mensaje para 3 de ellos']
  x = correr('dia', '--objetivo', 'Terminar la oferta de diagnóstico', ...TAREAS.flatMap((t) => ['--tarea', t]), '--hora', '09:00')
  if (x.codigo !== 0 || x.j?.estado?.falta !== null) return `plan.py dia: ${JSON.stringify(x).slice(0, 300)}`
  log('ritual: plan.py leyó la meta y el nicho, respetó el mes a mano y escribió mes, semana (3 resultados) y día (objetivo y 3 tareas)')

  // La vista los recibe.
  const obj = await (await fetch(`${base}/api/planning/objectives`, { headers: { cookie } })).json().catch(() => ({}))
  const ctx = obj.context ?? []
  const lunesHoy = (() => { const d = new Date(`${HOY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10) })()
  if (!ctx.some((c) => c.scope === 'month' && c.text === '300 USD cobrados de mi primer cliente')) return `la vista no recibe el mes: ${JSON.stringify(ctx).slice(0, 300)}`
  if (!ctx.some((c) => c.scope === 'week' && c.text === RES.join(' · ') && (c.start === lunesHoy || c.start.slice(0, 7) !== lunesHoy.slice(0, 7)))) return `la vista no recibe la semana: ${JSON.stringify(ctx).slice(0, 400)}`
  if (!ctx.some((c) => c.scope === 'day' && c.start === HOY && c.text === 'Terminar la oferta de diagnóstico')) return 'la vista no recibe el objetivo del día'
  const desde = new Date(`${HOY}T00:00:00`).toISOString(), hasta = new Date(new Date(`${HOY}T00:00:00`).getTime() + 86_400_000).toISOString()
  const snap = await (await fetch(`${base}/api/planning?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`, { headers: { cookie } })).json().catch(() => ({}))
  const tareas = [...(snap.tasks ?? []), ...(snap.completedTasks ?? [])]
  const t = tareas.find((k) => k.title === 'Terminar la oferta de diagnóstico')
  if (!t || !(t.labels ?? []).includes('objetivo') || TAREAS.some((k) => !String(t.description ?? '').includes(`- [ ] ${k}`))) return `el calendario no trae el objetivo con sus 3 casillas: ${JSON.stringify(t ?? Object.keys(snap)).slice(0, 300)}`
  if (!(snap.events ?? []).some((e) => e.title === 'Terminar la oferta de diagnóstico')) return 'el bloque de las 09:00 no se pinta'
  log('vista: mes, semana y día llegan a /api/planning/objectives; el objetivo con sus 3 casillas y su bloque a /api/planning')

  // Los lienzos, por la API del lienzo (puente local que pone la sesión; dentro de la app va el pase del agente).
  const puente = await escuchar(async (req, res) => {
    let cuerpo = ''
    for await (const c of req) cuerpo += c
    const r = await fetch(`${base}${req.url}`, { method: req.method, headers: { cookie, Origin: base, 'Content-Type': 'application/json' }, body: req.method === 'GET' ? undefined : cuerpo })
    res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(await r.text())
  })
  try {
    // Asíncrono: el puente vive en este mismo proceso y un spawnSync lo dejaría sin responder.
    const r = await new Promise((ok) => {
      const h = spawn(PY, [plan, 'lienzos'], { env: { ...process.env, ARBRAIN_PLAN_RAIZ: CEREBRO, MISSION_CONTROL_ORIGIN: `http://${HOST}:${puente.address().port}`, ARBRAIN_PASE_AGENTE: 'puente-de-prueba' } })
      let stdout = '', stderr = ''
      h.stdout.on('data', (c) => { stdout += c }); h.stderr.on('data', (c) => { stderr += c })
      const t = setTimeout(() => h.kill(), 180_000)
      h.on('close', () => { clearTimeout(t); ok({ stdout, stderr }) })
    })
    let j = null; try { j = JSON.parse(r.stdout) } catch { /* */ }
    const l = j?.lienzos ?? {}
    for (const nombre of ['Mi plan · mes, semana y día', 'Calendario de 12 semanas']) {
      if (l[nombre]?.status !== 200 || l[nombre]?.ok === false) return `plan.py lienzos no redibujó «${nombre}»: ${JSON.stringify(j ?? r.stderr).slice(0, 400)}`
      const pag = await (await fetch(`${base}/api/canvas/pages/${encodeURIComponent(l[nombre].paginaId)}`, { headers: { cookie } })).text()
      const esperado = nombre.startsWith('Mi plan') ? '300 USD cobrados de mi primer cliente' : '900 USD al mes para el 2027-01-20'
      if (!pag.includes(esperado)) return `el lienzo «${nombre}» no muestra «${esperado}»`
    }
    log('lienzos: «Mi plan» y «Calendario de 12 semanas» muestran el mes y la meta del expediente')
  } finally { puente.close() }
  return await recorridoPermisos(base, cookie)
}

// ── Recorrido v0.2.10: modo de permisos y voz de las respuestas (grupal del 23 oct) ─────────────────────────────────────

/**
 * Por la web real, con la sesión: el modo nace «carpeta»; la persona lo cambia desde Ajustes (la web pone el secreto) a
 * «libre» y de vuelta a «preguntar»; un modo inventado se rechaza; el cambio queda en «Lo que hizo Levy». Y «Escuchar»
 * sin llave de LemonFox no se cuelga: `/api/chat/tts` responde rápido con error y la app cae a la voz del sistema.
 */
async function recorridoPermisos(base, cookie) {
  const json = { cookie, 'Content-Type': 'application/json', Origin: base }
  const leer = async () => { const r = await fetch(`${base}/api/seguridad/permisos`, { headers: { cookie } }); return { st: r.status, j: await r.json().catch(() => ({})) } }
  const fijar = async (modo) => { const r = await fetch(`${base}/api/seguridad/permisos`, { method: 'POST', headers: json, body: JSON.stringify({ modo }) }); return { st: r.status, j: await r.json().catch(() => ({})) } }
  let r = await leer()
  if (r.st !== 200 || r.j.modo !== 'carpeta') return `permisos: el modo de fábrica respondió ${r.st} ${JSON.stringify(r.j).slice(0, 200)} (se esperaba «carpeta»)`
  r = await fijar('libre')
  if (r.st !== 200 || r.j.modo !== 'libre') return `permisos: cambiar a «Sin preguntar» respondió ${r.st} ${JSON.stringify(r.j).slice(0, 200)}`
  if ((await leer()).j.modo !== 'libre') return 'permisos: el modo no quedó guardado'
  if ((await fijar('todo')).st !== 400) return 'permisos: un modo inventado no se rechazó'
  if ((await fijar('preguntar')).j.modo !== 'preguntar') return 'permisos: no se pudo volver a «Preguntar siempre»'
  const bit = await (await fetch(`${base}/api/seguridad/bitacora?limite=20`, { headers: { cookie } })).json().catch(() => ({}))
  if (!(bit.acciones ?? []).some((a) => /Permisos de Levy/.test(a.que ?? ''))) return 'permisos: el cambio no quedó en «Lo que hizo Levy»'
  log('permisos: nace «Automático en mi carpeta», se cambia desde Ajustes y queda en «Lo que hizo Levy»')
  const t0 = Date.now()
  const tts = await fetch(`${base}/api/chat/tts`, { method: 'POST', headers: json, body: JSON.stringify({ text: 'Hola', lector: true, velocidad: 1 }) })
  const jt = await tts.json().catch(() => ({}))
  // 503 «sin_voz_servidor» lo dice SU daemon (la ruta existe en cliente y llega hasta él); 404 sería la ruta bloqueada.
  if (tts.status !== 503 || jt.code !== 'sin_voz_servidor' || Date.now() - t0 > 15_000) return `voz: sin llave de LemonFox, /api/chat/tts respondió ${tts.status} ${JSON.stringify(jt).slice(0, 160)} en ${Date.now() - t0} ms (se esperaba 503 sin_voz_servidor, rápido)`
  log(`voz: sin llave de LemonFox, el daemon responde «sin_voz_servidor» en ${Date.now() - t0} ms y «Escuchar» usa la voz del sistema`)
  return null
}

main().catch((e) => fallar(e?.stack ?? String(e)))
