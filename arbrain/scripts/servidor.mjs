#!/usr/bin/env node
/**
 * Arbrain en modo servidor (21 oct 2026): tu Arbrain corre desde el código, en tu máquina, sin la app de escritorio,
 * sin Rust ni Tauri. Mac, Linux y Windows con Node 22. Informe: docs/builds/modo-servidor-2026-10-21/REPORTE.md.
 *
 *   npm run servidor                         instala si falta, compila si cambió, arranca y abre el navegador
 *   npm run servidor -- abrir                abre el navegador ya con sesión (si no corre, lo arranca)
 *   npm run servidor -- estado               ¿corre?, direcciones, arranque automático
 *   npm run servidor -- detener              apaga el servidor que esté corriendo
 *   npm run servidor -- contrasena [--nueva] muestra (o cambia) la contraseña para entrar desde otro navegador
 *   npm run servidor -- arranque-automatico activar|desactivar|estado
 *   npm run servidor -- empaquetar --salida <carpeta>   (CI) arma el programa ya compilado de esta plataforma
 *
 * Programa ya compilado (v0.2.7): si la versión publicada trae el programa de esta plataforma, se baja, se verifica con
 * la etiqueta firmada y se usa en vez de instalar dependencias y compilar (scripts/servidor/programa.mjs). Si no se puede,
 * se compila como antes.
 *
 * Opciones: --datos <carpeta> · --puerto <n> · --cerebro <carpeta> · --sin-navegador · --compilar (fuerza compilar)
 *           · --repo-original (permite correrlo en el repo de Daniel, que no trae el marcador `arbrain/EDICION`).
 *
 * Qué hace este proceso (el «supervisor»): el papel que en la app hace Tauri (`src-tauri/src/daemon.rs`, `lib.rs ›
 * ensure_local_server_cliente`). Elige puertos en 127.0.0.1, genera los secretos por arranque (solo en memoria),
 * lanza el daemon y la web en edición cliente con los secretos y las llaves por stdin (CONTRATO-DAEMON v2 §2.1), los
 * vigila y los reinicia con freno, y al salir los apaga. El acceso por navegador usa la misma cookie que la app; la
 * contraseña vive en `<datos>/daemon/config/acceso.json` (0600, carpeta negada a los agentes). Todo escucha solo en
 * 127.0.0.1. La instalación de Daniel no pasa por aquí.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as auto from './servidor/arranque-auto.mjs'
import {
  contrasenaNueva, dirDatosPorDefecto, entornoLimpio, errorDeLlave, estadoLlaves, LLAVES, limpiarLlave, lineaSecretos,
  PUERTO_WEB_POR_DEFECTO, puertoValido, RESERVADOS, rutasDe, secreto,
} from './servidor/rutas.mjs'
import { PRELUDIO_WEB } from './servidor/preludio-web.mjs'
import { armarPaquete, programaYaCompilado } from './servidor/programa.mjs'

const ARBRAIN = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SERVER = join(ARBRAIN, 'server')
const REPO = resolve(ARBRAIN, '..')
const WIN = process.platform === 'win32'
const HOST = '127.0.0.1'

// ── Argumentos ────────────────────────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const bandera = (n) => argv.includes(n)
const CON_VALOR = new Set(['--datos', '--puerto', '--cerebro', '--salida'])
const posicionales = argv.filter((a, i) => !a.startsWith('--') && !CON_VALOR.has(argv[i - 1]))
const orden = posicionales[0] ?? 'iniciar'

const DATOS = resolve(opcion('--datos') ?? dirDatosPorDefecto(process.platform, process.env, homedir()))
const R = rutasDe(DATOS, tmpdir())

// ── Utilidades ────────────────────────────────────────────────────────────────────────────────────────────────────

const ahora = () => new Date().toISOString()
function registrar(msg) {
  const linea = `[arbrain ${new Date().toLocaleTimeString()}] ${msg}`
  console.log(linea)
  try { mkdirSync(R.logs, { recursive: true }); appendFileSync(join(R.logs, 'servidor.log'), `${ahora()} ${msg}\n`) } catch { /* sin log en disco */ }
}
function fallar(msg, codigo = 1) {
  console.error(`\n[arbrain] ${msg}\n`)
  try { appendFileSync(join(R.logs, 'servidor.log'), `${ahora()} ERROR ${msg}\n`) } catch { /* */ }
  process.exit(codigo)
}
function privada(dir) {
  mkdirSync(dir, { recursive: true })
  if (!WIN) try { chmodSync(dir, 0o700) } catch { /* */ }
}
function escribirPrivado(ruta, texto) {
  privada(dirname(ruta))
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, texto, { mode: 0o600 })
  renameSync(tmp, ruta)
  if (!WIN) try { chmodSync(ruta, 0o600) } catch { /* */ }
}
const leerJson = (ruta) => { try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return null } }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y) }

/** npm sin shell (Windows: npm.cmd con shell destroza argumentos): el npm-cli.js junto a este Node. */
function npm() {
  const candidatos = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter((p) => p && /npm-cli\.js$/.test(p) && existsSync(p))
  if (candidatos[0]) return { cmd: process.execPath, pre: [candidatos[0]], shell: false }
  return { cmd: WIN ? 'npm.cmd' : 'npm', pre: [], shell: WIN }
}
function correr(cmd, args, cwd, env = process.env, shell = false) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell })
  if (r.error) fallar(`No pude ejecutar ${cmd}: ${r.error.message}`)
  return r.status ?? 1
}
function correrNpm(args, cwd, env) {
  const n = npm()
  return correr(n.cmd, [...n.pre, ...args], cwd, env, n.shell)
}

function puertoLibreEn(host, port) {
  return new Promise((ok) => {
    const s = net.createServer()
    s.once('error', (e) => ok(host === '::1' && e.code !== 'EADDRINUSE' && e.code !== 'EACCES'))
    s.once('listening', () => s.close(() => ok(true)))
    s.listen({ host, port, exclusive: true })
  })
}
/** Libre en 127.0.0.1 y en [::1] (lo que resuelva `localhost` no debe caer en otro proceso; red team OAuth M1). */
const puertoLibre = async (p) => puertoValido(p) && (await puertoLibreEn(HOST, p)) && (await puertoLibreEn('::1', p))
async function puertoAlAzar(evitar) {
  for (let i = 0; i < 30; i++) {
    const p = await new Promise((ok) => { const s = net.createServer(); s.listen(0, HOST, () => { const { port } = s.address(); s.close(() => ok(port)) }) })
    if (!evitar.includes(p) && (await puertoLibre(p))) return p
  }
  fallar('No encontré un puerto libre en 127.0.0.1.')
}
/** Puerto recordado en `<config>/<archivo>` si sigue libre; si no, el preferido o el siguiente libre. */
async function elegirPuerto(archivo, preferido, evitar = []) {
  const ruta = join(R.config, archivo)
  const recordado = Number.parseInt((() => { try { return readFileSync(ruta, 'utf8') } catch { return '' } })().trim(), 10)
  const candidatos = [preferido, Number.isInteger(recordado) ? recordado : null].filter((p) => p != null)
  for (const p of candidatos) if (!evitar.includes(p) && (await puertoLibre(p))) { writeFileSync(ruta, String(p)); return p }
  if (preferido != null && opcion('--puerto')) fallar(`El puerto ${preferido} está ocupado o no se permite (${RESERVADOS.join(', ')} están reservados).`)
  const base = archivo === 'puerto-web' ? PUERTO_WEB_POR_DEFECTO : null
  if (base) for (let p = base; p < base + 90; p++) if (!evitar.includes(p) && (await puertoLibre(p))) { writeFileSync(ruta, String(p)); return p }
  const p = await puertoAlAzar(evitar)
  writeFileSync(ruta, String(p))
  return p
}

function pedir(port, ruta, { metodo = 'GET', token, cuerpo, plazo = 4000 } = {}) {
  return new Promise((ok) => {
    const datos = cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    const req = http.request({ host: HOST, port, path: ruta, method: metodo, timeout: plazo, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(datos ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos) } : {}),
    } }, (res) => {
      let b = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { b += c })
      res.on('end', () => { let j = null; try { j = JSON.parse(b) } catch { /* */ } ok({ status: res.statusCode ?? 0, json: j }) })
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => ok({ status: 0, json: null }))
    if (datos) req.write(datos)
    req.end()
  })
}

function abrirNavegador(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : WIN ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]]
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref() } catch { /* sin navegador: queda la dirección impresa */ }
}

// ── Acceso (contraseña) y llaves ──────────────────────────────────────────────────────────────────────────────────

function contrasena({ nueva = false } = {}) {
  const actual = leerJson(R.acceso)
  if (!nueva && typeof actual?.contrasena === 'string' && actual.contrasena.length >= 32) return actual.contrasena
  const c = contrasenaNueva()
  escribirPrivado(R.acceso, JSON.stringify({ contrasena: c, creada: ahora() }, null, 1) + '\n')
  return c
}
/** Generación de las sesiones del navegador (M2): vive en acceso.json junto a la contraseña. */
function generacionSesiones() {
  const g = Number(leerJson(R.acceso)?.generacion)
  return Number.isSafeInteger(g) && g >= 0 ? g : 0
}
function cerrarSesiones() {
  const actual = leerJson(R.acceso)
  if (typeof actual?.contrasena !== 'string' || actual.contrasena.length < 32) return null
  const generacion = generacionSesiones() + 1
  escribirPrivado(R.acceso, JSON.stringify({ ...actual, generacion, sesionesCerradas: ahora() }, null, 1) + '\n')
  return generacion
}
const llavesGuardadas = () => { const j = leerJson(R.llaves); const o = {}; for (const k of LLAVES) if (typeof j?.[k] === 'string' && j[k]) o[k] = j[k]; return o }
const guardarLlaves = (o) => escribirPrivado(R.llaves, JSON.stringify(o, null, 1) + '\n')

// ── Compilar ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Huella del código: último commit de esas rutas + cambios sin confirmar en ellas. Sin git, «sin-git» (compila solo si falta). */
function huella(rutas) {
  const git = (args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8' })
  // El último commit que tocó ESAS rutas (no HEAD): un commit de otra parte del repo no obliga a recompilar.
  const head = git(['log', '-1', '--format=%H', '--', ...rutas])
  if (head.status !== 0 || !head.stdout.trim()) return 'sin-git'
  const st = git(['status', '--porcelain', '--', ...rutas])
  return createHash('sha256').update(head.stdout.trim()).update(st.stdout ?? '').digest('hex').slice(0, 16)
}

/** `npm ci` con lockfile; sin él (una copia que no lo trajo; visto en CI el 21 oct), `npm install` en vez de fallar. */
function instalarEn(dir) {
  const orden = existsSync(join(dir, 'package-lock.json')) ? 'ci' : 'install'
  if (orden === 'install') registrar(`Aviso: ${dir} no trae package-lock.json; uso npm install.`)
  return { orden, codigo: correrNpm([orden, '--include=dev', '--no-audit', '--no-fund', '--loglevel=error'], dir) }
}

function instalarDependencias() {
  // `--include=dev` siempre: compilar necesita TypeScript y las herramientas de Next aunque la terminal tenga
  // NODE_ENV=production (con ella, `npm ci` omite las dependencias de desarrollo).
  if (!existsSync(join(ARBRAIN, 'node_modules', 'next', 'package.json')) || !existsSync(join(ARBRAIN, 'node_modules', 'typescript', 'package.json'))) {
    registrar('Instalando dependencias de la web (una sola vez, unos minutos)…')
    const r = instalarEn(ARBRAIN)
    if (r.codigo !== 0) fallar(`Falló \`npm ${r.orden}\` en arbrain/. Revisa tu conexión y vuelve a correr \`npm run servidor\`.`)
  }
  if (!existsSync(join(SERVER, 'node_modules', 'typescript', 'package.json'))) {
    registrar('Instalando dependencias del daemon…')
    const r = instalarEn(SERVER)
    if (r.codigo !== 0) fallar(`Falló \`npm ${r.orden}\` en arbrain/server.`)
  }
}

const STANDALONE = join(ARBRAIN, '.next', 'standalone')
const RUTAS_WEB = ['arbrain/src', 'arbrain/public', 'arbrain/next.config.ts', 'arbrain/package-lock.json', 'arbrain/tsconfig.json']

async function compilarWeb(forzar) {
  const h = huella(RUTAS_WEB)
  const marca = join(R.programa, 'web.json')
  const hay = existsSync(join(STANDALONE, 'server.js'))
  if (hay && !forzar && leerJson(marca)?.huella === h && h !== 'sin-git') return
  if (hay && !forzar && h === 'sin-git') return
  registrar('Compilando la web (edición cliente, modo servidor). Tarda unos minutos la primera vez…')
  const env = { ...entornoLimpio(process.env), ARBRAIN_EDICION: 'cliente', ARBRAIN_MODO_SERVIDOR: '1', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }
  const next = join(ARBRAIN, 'node_modules', 'next', 'dist', 'bin', 'next')
  if (correr(process.execPath, [next, 'build', '--webpack'], ARBRAIN, env) !== 0) fallar('Falló la compilación de la web. El detalle está arriba.')
  if (!existsSync(join(STANDALONE, 'server.js'))) fallar('La compilación no dejó .next/standalone/server.js (next.config.ts debe tener output: "standalone").')
  // Lo mismo que prepare-tauri-resources: estáticos y public junto al server.js; fuera .env y bases.
  cpSync(join(ARBRAIN, '.next', 'static'), join(STANDALONE, '.next', 'static'), { recursive: true })
  if (existsSync(join(ARBRAIN, 'public'))) cpSync(join(ARBRAIN, 'public'), join(STANDALONE, 'public'), { recursive: true })
  const { limpiarSecretos } = await import('./paquete-seguro.mjs')
  const quitados = limpiarSecretos(STANDALONE)
  if (quitados.length) registrar(`Fuera del servidor web: ${quitados.length} archivo(s) con secretos (${quitados.slice(0, 3).join(', ')}…)`)
  privada(R.programa)
  writeFileSync(marca, JSON.stringify({ huella: h, compilado: ahora() }) + '\n')
}

function compilarDaemon(forzar) {
  const h = huella(['arbrain/server/src', 'arbrain/server/package-lock.json', 'arbrain/server/empaquetado.json', 'arbrain/EDICION'])
  privada(R.programa)
  const destino = join(R.programa, `daemon-${h}`)
  const listo = existsSync(join(destino, 'dist', 'index.js'))
  if (listo && !forzar) return destino
  if (listo && forzar) rmSync(destino, { recursive: true, force: true })
  registrar('Compilando el daemon para este sistema…')
  const tmp = `${destino}.tmp-${process.pid}`
  rmSync(tmp, { recursive: true, force: true })
  if (correr(process.execPath, [join(SERVER, 'scripts', 'build-cliente.mjs'), tmp], SERVER, entornoLimpio(process.env)) !== 0) {
    rmSync(tmp, { recursive: true, force: true })
    fallar('Falló la compilación del daemon. El detalle está arriba.')
  }
  renameSync(tmp, destino)
  // Las compilaciones viejas del daemon son nuestras y se regeneran: se quitan (queda la nueva).
  for (const d of readdirSync(R.programa)) if (d.startsWith('daemon-') && join(R.programa, d) !== destino) rmSync(join(R.programa, d), { recursive: true, force: true })
  return destino
}

// ── Procesos ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** PATH con el Node del programa primero (lo que el daemon lance como `node` usa el mismo) y luego el del sistema. */
function conPath(env) {
  const clave = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  const o = { ...env }
  o[clave] = [...new Set([dirname(S.node), dirname(process.execPath)])].concat(env[clave] ?? '').filter(Boolean).join(delimiter)
  return o
}

function abrirLog(nombre) {
  const ruta = join(R.logs, nombre)
  try { if (statSync(ruta).size > 5 * 1024 * 1024) renameSync(ruta, `${ruta}.1`) } catch { /* */ }
  return ruta
}

function lanzarHijo(nombre, args, cwd, env, linea) {
  const log = abrirLog(`${nombre}.log`)
  const hijo = spawn(S.node, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  const escribir = (c) => { try { appendFileSync(log, c) } catch { /* */ } }
  hijo.stdout.on('data', escribir)
  hijo.stderr.on('data', escribir)
  hijo.stdin.on('error', () => {})
  // Primera línea = secretos; después el stdin queda abierto: si este supervisor muere, el hijo se apaga solo (vigía).
  hijo.stdin.write(linea)
  return hijo
}

const S = {
  apagando: false,
  daemon: null, web: null,
  puertoWeb: 0, puertoDaemon: 0, puertoControl: 0,
  secretos: null, contrasena: '', tokenCli: '', daemonDir: '', home: '',
  // Node con el que corren daemon y web: el del programa ya compilado (su ABI) o, si se compiló aquí, este mismo.
  node: process.execPath, webDir: STANDALONE,
  reinicios: { daemon: [], web: [] },
  ultimoError: null, reiniciando: false, pausado: { daemon: false, web: false },
  tickets: new Map(),
}

function entornoComun() {
  return {
    ...conPath(entornoLimpio(process.env)),
    ARBRAIN_EDICION: 'cliente',
    ARBRAIN_CONFIG_DIR: R.config,
    ARBRAIN_HOME: S.home,
    ARBRAIN_MOTOR_SOCK: R.motorSock,
    NODE_ENV: 'production',
    ARBRAIN_SECRETOS: 'stdin',
    ARBRAIN_VIGILAR_STDIN: '1',
    // Puente con arbrain.ai (21 oct 2026): la señal opcional dice qué versión corre (el daemon compilado vive fuera del repo).
    ARBRAIN_VERSION: versionArbrain(),
  }
}

/** VERSION de la copia (la de la etiqueta vX.Y.Z); vacío si no existe. */
function versionRepo() {
  try { return readFileSync(join(REPO, 'VERSION'), 'utf8').trim() } catch { return '' }
}

function versionArbrain() {
  try { return String(JSON.parse(readFileSync(join(ARBRAIN, 'package.json'), 'utf8')).version ?? '') } catch { return '' }
}

function lanzarDaemon() {
  const env = {
    ...entornoComun(),
    ARBRAIN_DATA_DIR: R.daemon,
    // v0.2.6: adjuntos del chat que guarda la web (src/lib/adjuntos-locales.ts); el daemon los copia a sus uploads.
    ARBRAIN_ADJUNTOS_DIR: join(R.web, 'adjuntos'),
    CLAUDECLAW_STORE_DIR: R.store,
    MC_SERVER_PORT: String(S.puertoDaemon),
    MISSION_CONTROL_ORIGIN: `http://${HOST}:${S.puertoWeb}`,
    CLAUDECLAW_ROLE: 'full',
    CLAUDE_CONFIG_DIR: R.claude,
    ARBRAIN_NODE_BINARY: S.node,
  }
  const linea = lineaSecretos({
    OPENCLAW_GATEWAY_TOKEN: S.secretos.daemon,
    ARBRAIN_TOKEN_CONFIRMAR: S.secretos.confirmar,
    ARBRAIN_PASE_AGENTE: S.secretos.pase,
    ...llavesGuardadas(),
  })
  // v0.2 (capas): la capa del alumno (memoria, plan, now.md) no viaja en el repo; vive en arbrain/cerebro/semilla y el
  // daemon la siembra la primera vez, sin pisar nada y dejando la marca `.arbrain-sembrado.json` (cliente/arranque.ts).
  const semilla = join(ARBRAIN, 'cerebro', 'semilla')
  if (existsSync(semilla)) env.ARBRAIN_PLANTILLA_DIR = semilla
  S.daemon = lanzarHijo('daemon', [join(S.daemonDir, 'dist', 'index.js')], R.daemon, env, linea)
  vigilar('daemon', S.daemon)
}

function lanzarWeb() {
  const env = {
    ...entornoComun(),
    ARBRAIN_DATA_DIR: R.web,
    CLAUDECLAW_URL: `http://${HOST}:${S.puertoDaemon}`,
    CLAUDECLAW_URL_PINNED: `http://${HOST}:${S.puertoDaemon}`,
    PORT: String(S.puertoWeb),
    HOSTNAME: HOST,
    MISSION_CONTROL_DESKTOP_EMBED: '1',
    ARBRAIN_MODO_SERVIDOR: '1',
    // M2 (seguridad noche 21 oct): la cookie es un token derivado de la contraseña y de esta generación; subirla
    // (`cerrar-sesiones`) cierra todas las sesiones abiertas al reiniciar. No es secreta.
    ARBRAIN_SESION_GENERACION: String(generacionSesiones()),
    ARBRAIN_SERVIDOR_CONTROL: `http://${HOST}:${S.puertoControl}`,
    NEXT_TELEMETRY_DISABLED: '1',
  }
  const linea = lineaSecretos({
    ARBRAIN_DESKTOP_SECRET: S.contrasena,
    OPENCLAW_GATEWAY_TOKEN: S.secretos.daemon,
    ARBRAIN_TOKEN_CONFIRMAR: S.secretos.confirmar,
    ARBRAIN_PASE_AGENTE: S.secretos.pase,
    ARBRAIN_MOTOR_TOKEN: S.secretos.motor,
  })
  S.web = lanzarHijo('web', ['-e', PRELUDIO_WEB, 'server.js'], S.webDir, env, linea)
  vigilar('web', S.web)
}

/** Reinicio con freno (como la app): máximo 5 en 5 minutos; después, pausa y aviso en el log. */
function vigilar(nombre, hijo) {
  hijo.on('exit', (codigo, senal) => {
    if (S.apagando || S[nombre] !== hijo) return
    S[nombre] = null
    registrar(`${nombre} se detuvo (código ${codigo ?? senal}). Detalle en ${join(R.logs, `${nombre}.log`)}`)
    if (nombre === 'daemon' && codigo === 78) { S.ultimoError = 'El daemon no arrancó: configuración incompleta (revisa logs/daemon.log).'; return }
    const r = S.reinicios[nombre]
    while (r.length && Date.now() - r[0] > 5 * 60_000) r.shift()
    if (r.length >= 5) { S.pausado[nombre] = true; S.ultimoError = `${nombre} se cayó 5 veces en 5 minutos; dejé de reintentar. Corre \`npm run servidor -- detener\` y vuelve a arrancarlo.`; registrar(S.ultimoError); return }
    r.push(Date.now())
    setTimeout(() => { if (!S.apagando && !S[nombre]) (nombre === 'daemon' ? lanzarDaemon : lanzarWeb)() }, 2000 * r.length)
  })
}

/**
 * Un daemon de una corrida anterior que siguió vivo (supervisor matado a la fuerza) tiene el candado del store y el
 * nuevo saldría con «Another instance is already running». Igual que `daemon.rs › apagar_huerfano`: solo si el pid del
 * candado es un node que corre un daemon de ESTA carpeta de datos. Windows: sin `ps`; el candado lo resuelve el daemon.
 */
function apagarHuerfano() {
  if (WIN) return
  const pid = Number.parseInt((() => { try { return readFileSync(join(R.store, 'claudeclaw.pid'), 'utf8') } catch { return '' } })().trim(), 10)
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return
  const cmd = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout ?? ''
  if (!cmd.includes(R.programa)) return
  registrar(`Daemon huérfano de una corrida anterior (pid ${pid}): se apaga.`)
  try { process.kill(pid, 'SIGTERM') } catch { return }
  const fin = Date.now() + 6000
  while (Date.now() < fin) { try { process.kill(pid, 0) } catch { return } spawnSync('sleep', ['0.2']) }
  try { process.kill(pid, 'SIGKILL') } catch { /* ya salió */ }
}

async function esperar(prueba, ms, cada = 500) {
  const fin = Date.now() + ms
  while (Date.now() < fin) { if (await prueba()) return true; await dormir(cada) }
  return false
}
const daemonSano = async () => (await pedir(S.puertoDaemon, '/health', { token: S.secretos.daemon, plazo: 3000 })).status === 200
const webSana = async () => (await pedir(S.puertoWeb, '/api/version', { plazo: 3000 })).status === 200

async function apagarHijo(nombre) {
  const hijo = S[nombre]
  S[nombre] = null
  if (!hijo || hijo.exitCode !== null) return
  const salio = new Promise((ok) => hijo.once('exit', ok))
  if (nombre === 'daemon') await pedir(S.puertoDaemon, '/apagar', { metodo: 'POST', token: S.secretos.daemon, cuerpo: {}, plazo: 2000 })
  else if (!WIN) hijo.kill('SIGTERM')
  try { hijo.stdin.end() } catch { /* el vigía del hijo lo apaga al cerrar stdin */ }
  const a_tiempo = await Promise.race([salio.then(() => true), dormir(6000).then(() => false)])
  if (!a_tiempo) { try { hijo.kill('SIGKILL') } catch { /* */ } }
}

/**
 * Cambió una llave: el daemon las lee al arrancar (CONTRATO §4), se relanza con las nuevas. En fila: dos guardados
 * seguidos no pueden lanzar dos daemons (el segundo choca con el candado `store/claudeclaw.pid` y el primero queda
 * huérfano; visto en la prueba del 21 oct).
 */
let filaReinicio = Promise.resolve()
function reiniciarDaemon() {
  filaReinicio = filaReinicio.then(reiniciarDaemonAhora, reiniciarDaemonAhora)
  return filaReinicio
}
async function reiniciarDaemonAhora() {
  if (S.apagando) return
  S.reiniciando = true
  try {
    await apagarHijo('daemon')
    S.reinicios.daemon = []
    S.pausado.daemon = false
    S.ultimoError = null
    lanzarDaemon()
    await esperar(daemonSano, 30_000)
  } finally { S.reiniciando = false }
}

async function apagarTodo(codigo = 0) {
  if (S.apagando) return
  S.apagando = true
  registrar('Apagando Arbrain…')
  await Promise.all([apagarHijo('web'), apagarHijo('daemon')])
  try { if (leerJson(R.proceso)?.pid === process.pid) rmSync(R.proceso, { force: true }) } catch { /* */ }
  registrar('Listo, Arbrain quedó apagado.')
  process.exit(codigo)
}

// ── Control local (la web y el CLI hablan con el supervisor) ──────────────────────────────────────────────────────

const TICKET_MS = 2 * 60_000
function ticketNuevo() {
  const t = secreto()
  S.tickets.set(t, Date.now() + TICKET_MS)
  return t
}

function daemonInfo() {
  return {
    url: `http://${HOST}:${S.puertoDaemon}`, port: S.puertoDaemon, ready: false, pid: S.daemon?.pid ?? null,
    reinicios: S.reinicios.daemon.length, lastError: S.ultimoError, pausado: S.pausado.daemon,
  }
}

/**
 * 127.0.0.1:<al azar>. Dos credenciales: la web usa el token del daemon (lo recibe por stdin, nunca está en disco) y
 * el CLI el `tokenCli` de servidor.json (carpeta de configuración, 0600, negada a los agentes). Solo JSON.
 */
function servidorControl() {
  const srv = http.createServer(async (req, res) => {
    const responder = (status, j) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(j)) }
    const auth = String(req.headers.authorization ?? '')
    const dado = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    const esWeb = !!dado && iguales(dado, S.secretos.daemon)
    const esCli = !!dado && iguales(dado, S.tokenCli)
    if (!esWeb && !esCli) return responder(401, { error: 'No autorizado.' })
    if (req.headers.host && !/^127\.0\.0\.1:\d+$/.test(req.headers.host)) return responder(421, { error: 'Host no permitido.' })
    let cuerpo = {}
    if (req.method === 'POST') {
      let b = ''
      for await (const c of req) { b += c; if (b.length > 16_384) return responder(413, { error: 'Demasiado grande.' }) }
      try { cuerpo = b ? JSON.parse(b) : {} } catch { return responder(400, { error: 'JSON inválido.' }) }
    }
    const ruta = (req.url ?? '').split('?')[0]
    try {
      if (req.method === 'POST' && ruta === '/ticket' && esCli) return responder(200, { ticket: ticketNuevo(), puertoWeb: S.puertoWeb })
      if (req.method === 'POST' && ruta === '/ticket/canjear' && esWeb) {
        const t = typeof cuerpo.ticket === 'string' ? cuerpo.ticket : ''
        const vence = t && S.tickets.get(t)
        if (t) S.tickets.delete(t)
        return responder(200, { ok: !!vence && vence > Date.now() })
      }
      if (req.method === 'POST' && ruta === '/detener' && esCli) { responder(200, { ok: true }); setTimeout(() => apagarTodo(0), 50); return }
      if (req.method === 'GET' && ruta === '/estado') return responder(200, { pid: process.pid, puertoWeb: S.puertoWeb, daemon: daemonInfo(), web: { pid: S.web?.pid ?? null, pausado: S.pausado.web } })
      if (!esWeb) return responder(403, { error: 'Solo la web.' })
      if (req.method === 'GET' && ruta === '/llaves') return responder(200, estadoLlaves(llavesGuardadas()))
      if (req.method === 'POST' && ruta === '/llaves/guardar') {
        const nombre = String(cuerpo.nombre ?? '')
        const error = errorDeLlave(nombre, cuerpo.valor)
        if (error) return responder(400, { error })
        guardarLlaves({ ...llavesGuardadas(), [nombre]: limpiarLlave(cuerpo.valor) })
        registrar(`Llave guardada: ${nombre}. Reiniciando el daemon para que la tome.`)
        void reiniciarDaemon()
        return responder(200, estadoLlaves(llavesGuardadas()))
      }
      if (req.method === 'POST' && ruta === '/llaves/borrar') {
        const nombre = String(cuerpo.nombre ?? '')
        if (!LLAVES.includes(nombre)) return responder(400, { error: 'Llave no permitida.' })
        const o = llavesGuardadas(); delete o[nombre]; guardarLlaves(o)
        registrar(`Llave borrada: ${nombre}. Reiniciando el daemon.`)
        void reiniciarDaemon()
        return responder(200, estadoLlaves(o))
      }
      if (req.method === 'GET' && ruta === '/daemon') return responder(200, { ...daemonInfo(), ready: !S.reiniciando && !!S.daemon && (await daemonSano()) })
      if (req.method === 'POST' && ruta === '/daemon/reiniciar') { void reiniciarDaemon(); return responder(200, { ok: true }) }
      return responder(404, { error: 'No existe.' })
    } catch (e) {
      return responder(500, { error: e instanceof Error ? e.message : 'Error.' })
    }
  })
  return new Promise((ok, mal) => { srv.once('error', mal); srv.listen(0, HOST, () => ok(srv.address().port)) })
}

// ── Órdenes ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Servidor que ya corre con esta carpeta de datos (o null). */
async function vivo() {
  const p = leerJson(R.proceso)
  if (!p?.puertoControl || !p?.tokenCli) return null
  const r = await pedir(p.puertoControl, '/estado', { token: p.tokenCli, plazo: 2000 })
  return r.status === 200 ? { ...p, estado: r.json } : null
}

async function abrirConSesion(p) {
  const r = await pedir(p.puertoControl, '/ticket', { metodo: 'POST', token: p.tokenCli, cuerpo: {} })
  if (r.status !== 200 || !r.json?.ticket) return fallar('El servidor está corriendo pero no me dio un pase. Prueba `npm run servidor -- detener` y arráncalo otra vez.')
  // Pase de un solo uso y 2 minutos: aunque quede en el historial del navegador o en `ps`, ya no sirve.
  abrirNavegador(`http://${HOST}:${r.json.puertoWeb}/api/desktop/entrar?pase=${r.json.ticket}`)
  console.log(`[arbrain] Abrí tu Arbrain en el navegador: http://${HOST}:${r.json.puertoWeb}`)
}

function resolverCerebro() {
  const elegido = opcion('--cerebro') ?? process.env.ARBRAIN_SERVIDOR_CEREBRO
  if (elegido) return resolve(elegido)
  // La copia del alumno (repositorio) ES su cerebro: CLAUDE.md, .claude/ y arbrain/cerebro/ en la raíz.
  if (existsSync(join(ARBRAIN, 'EDICION')) && existsSync(join(REPO, 'CLAUDE.md'))) return REPO
  return R.cerebro
}

async function iniciar() {
  const [mayor, menor] = process.versions.node.split('.').map(Number)
  if (mayor < 20 || (mayor === 20 && menor < 9)) fallar(`Necesitas Node 22 (tienes ${process.version}). Instálalo desde https://nodejs.org y vuelve a correr \`npm run servidor\`.`)
  if (mayor < 22) registrar(`Aviso: probado con Node 22; tienes ${process.version}.`)
  if (!existsSync(join(ARBRAIN, 'EDICION')) && !bandera('--repo-original')) {
    fallar('Esta carpeta no es la copia del alumno (falta arbrain/EDICION). En el repo original el modo servidor compilaría encima de su .next; si de verdad quieres, agrega --repo-original.')
  }
  privada(DATOS); privada(R.daemon); privada(R.config); privada(R.store); privada(R.claude); privada(R.web); privada(R.logs)

  const ya = await vivo()
  if (ya) {
    console.log(`[arbrain] Tu Arbrain ya está corriendo (pid ${ya.pid}).`)
    if (!bandera('--sin-navegador')) await abrirConSesion(ya)
    return
  }

  const listo = bandera('--compilar') ? null : await programaYaCompilado({ repo: REPO, dirProgramas: R.programa, version: versionRepo(), avisar: registrar })
  if (listo) {
    S.webDir = listo.web
    S.daemonDir = listo.daemon
    S.node = listo.node
  } else {
    instalarDependencias()
    await compilarWeb(bandera('--compilar'))
    S.daemonDir = compilarDaemon(bandera('--compilar'))
  }
  S.home = resolverCerebro()
  privada(S.home)
  // Igual que la app (`desktop_env::mark_client_edition`): la marca de edición vive en SU configuración, nunca en ~/.config/arbrain.
  writeFileSync(join(R.config, 'edicion'), 'cliente\n')

  const preferido = opcion('--puerto') ?? process.env.ARBRAIN_PUERTO
  S.puertoWeb = await elegirPuerto('puerto-web', preferido ? Number.parseInt(preferido, 10) : null)
  S.puertoDaemon = await elegirPuerto('puerto-daemon', null, [S.puertoWeb])
  S.secretos = { daemon: secreto(), confirmar: secreto(), pase: secreto(), motor: secreto() }
  const primeraVez = !existsSync(R.acceso)
  S.contrasena = contrasena()
  // Solo en la terminal (nunca en el log): la primera vez, para guardarla en su gestor de contraseñas.
  if (primeraVez && process.stdout.isTTY) console.log(`\n  Tu contraseña de Arbrain (para entrar desde otro navegador): ${S.contrasena}\n  Guárdala; la vuelves a ver con: npm run servidor -- contrasena\n`)
  S.tokenCli = secreto()
  S.puertoControl = await servidorControl()
  escribirPrivado(R.proceso, JSON.stringify({ pid: process.pid, puertoWeb: S.puertoWeb, puertoDaemon: S.puertoDaemon, puertoControl: S.puertoControl, tokenCli: S.tokenCli, inicio: ahora(), datos: DATOS }, null, 1) + '\n')

  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => void apagarTodo(0))
  process.on('uncaughtException', (e) => { registrar(`Error inesperado del supervisor: ${e?.stack ?? e}`); void apagarTodo(1) })

  registrar(`Datos: ${DATOS}`)
  registrar(`Cerebro: ${S.home}`)
  apagarHuerfano()
  lanzarDaemon()
  if (!(await esperar(daemonSano, 60_000))) {
    registrar(`El daemon no respondió en 60 s. Revisa ${join(R.logs, 'daemon.log')}.`)
    return apagarTodo(1)
  }
  lanzarWeb()
  if (!(await esperar(webSana, 90_000))) {
    registrar(`La web no respondió en 90 s. Revisa ${join(R.logs, 'web.log')}.`)
    return apagarTodo(1)
  }
  try { await sembrarLienzos() } catch (e) { registrar(`Lienzos de inicio: ${e?.message ?? e}`) }
  const url = `http://${HOST}:${S.puertoWeb}`
  console.log(`
  Arbrain está corriendo en ${url}  (solo en esta computadora)
  · Para entrar desde otro navegador: npm run servidor -- contrasena
  · Registros: ${R.logs}
  · Para apagarlo: Ctrl+C aquí, o npm run servidor -- detener
`)
  if (!bandera('--sin-navegador')) {
    abrirNavegador(`${url}/api/desktop/entrar?pase=${ticketNuevo()}`)
  }
}

/**
 * Lienzos de inicio (21 oct 2026): la primera vez que la web responde, crea en el lienzo local «Mi plan · mes, semana y
 * día» y «Calendario de 12 semanas» (specs en scripts/servidor/lienzos/, las mismas de docs/builds/calendario-cliente-
 * 2026-10-21). Una sola vez por carpeta de datos: la marca `<datos>/web/lienzos-sembrados.json` anota lo creado, y lo
 * que la persona borre no vuelve. Si ya existe un lienzo con ese nombre no lo duplica. Un fallo solo va al log.
 */
async function sembrarLienzos() {
  const marca = join(R.web, 'lienzos-sembrados.json')
  let hechos = []
  try { hechos = JSON.parse(readFileSync(marca, 'utf8')).lienzos ?? [] } catch { /* primera vez */ }
  const dir = join(ARBRAIN, 'scripts', 'servidor', 'lienzos')
  if (!existsSync(dir)) return
  const token = S.secretos.daemon
  const lista = await pedir(S.puertoWeb, '/api/canvas/pages', { token, plazo: 15_000 })
  if (lista.status !== 200) { registrar(`Lienzos de inicio: el lienzo no respondió (${lista.status}); se intenta en el próximo arranque.`); return }
  const paginas = lista.json?.paginas ?? lista.json?.pages ?? []
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    let p
    try { p = JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch { continue }
    if (hechos.includes(p.regionId)) continue
    if (!paginas.some((x) => (x.nombre ?? x.name) === p.nombre)) {
      const nueva = await pedir(S.puertoWeb, '/api/canvas/pages', { metodo: 'POST', token, cuerpo: { nombre: p.nombre }, plazo: 15_000 })
      const id = nueva.json?.pagina?.id
      if (!id) { registrar(`Lienzos de inicio: no se pudo crear «${p.nombre}» (${nueva.status}).`); continue }
      const r = await pedir(S.puertoWeb, `/api/canvas/pages/${encodeURIComponent(id)}/region`, { metodo: 'POST', token, plazo: 60_000,
        cuerpo: { regionId: p.regionId, theme: p.theme, targetAspect: p.targetAspect, spec: p.spec } })
      if (r.status !== 200 || r.json?.ok === false) { registrar(`Lienzos de inicio: «${p.nombre}» quedó sin dibujar (${r.status}).`); continue }
      registrar(`Lienzos de inicio: creé «${p.nombre}».`)
    }
    hechos.push(p.regionId)
  }
  escribirPrivado(marca, JSON.stringify({ lienzos: hechos, actualizado: ahora() }, null, 1) + '\n')
}

/** CI: compila aquí y arma el paquete del programa ya compilado de esta plataforma (programa.yml). */
async function empaquetar() {
  const salida = resolve(opcion('--salida') ?? 'salida-programa')
  const version = versionRepo()
  if (!/^\d+\.\d+\.\d+$/.test(version)) fallar(`VERSION no es X.Y.Z: «${version}»`)
  privada(DATOS); privada(R.logs)
  instalarDependencias()
  await compilarWeb(true)
  const daemon = compilarDaemon(true)
  mkdirSync(salida, { recursive: true })
  await armarPaquete({ salida, version, web: STANDALONE, daemon, arbrain: ARBRAIN, registrar })
}

async function main() {
  if (orden === 'iniciar') return iniciar()
  if (orden === 'empaquetar') return empaquetar()
  if (orden === 'abrir') {
    const ya = await vivo()
    if (ya) return abrirConSesion(ya)
    return iniciar()
  }
  if (orden === 'detener') {
    const ya = await vivo()
    if (!ya) { console.log('[arbrain] No hay un Arbrain corriendo con esta carpeta de datos.'); return }
    await pedir(ya.puertoControl, '/detener', { metodo: 'POST', token: ya.tokenCli, cuerpo: {} })
    const fuera = await esperar(async () => !(await vivo()), 15_000)
    console.log(fuera ? '[arbrain] Arbrain quedó apagado.' : '[arbrain] Pedí apagarlo pero sigue respondiendo; revisa logs/servidor.log.')
    return
  }
  if (orden === 'estado') {
    const ya = await vivo()
    const a = auto.estado({ plataforma: process.platform, home: homedir(), env: process.env })
    console.log(ya
      ? `[arbrain] Corriendo (pid ${ya.pid}) en http://${HOST}:${ya.puertoWeb} · daemon ${ya.estado?.daemon?.pid ? 'vivo' : 'detenido'}`
      : '[arbrain] No está corriendo.')
    console.log(`[arbrain] Datos: ${DATOS}`)
    console.log(`[arbrain] Arranque automático: ${a.activo ? `activado (${a.ruta})` : 'desactivado'}`)
    return
  }
  if (orden === 'contrasena') {
    privada(R.config)
    const nueva = bandera('--nueva')
    const c = contrasena({ nueva })
    console.log(`\n  Tu contraseña de Arbrain: ${c}\n  Guárdala en tu gestor de contraseñas. Vive en ${R.acceso}.`)
    if (nueva) console.log('  Es nueva: las sesiones abiertas se cierran cuando reinicies el servidor.')
    console.log('')
    return
  }
  if (orden === 'cerrar-sesiones') {
    privada(R.config)
    const g = cerrarSesiones()
    if (g === null) { console.log('[arbrain] Todavía no hay contraseña: no hay sesiones que cerrar.'); return }
    const ya = await vivo()
    console.log(`[arbrain] Listo: todas las sesiones del navegador quedan cerradas (generación ${g}).`)
    console.log(ya ? '[arbrain] Reinicia para aplicarlo: npm run servidor -- detener && npm run servidor' : '[arbrain] Se aplica la próxima vez que arranques.')
    return
  }
  if (orden === 'arranque-automatico') {
    const sub = posicionales[1] ?? 'estado'
    const base = { plataforma: process.platform, home: homedir(), env: process.env }
    if (sub === 'activar' || sub === 'simular') {
      const comando = auto.comandoArranque({ node: process.execPath, script: fileURLToPath(import.meta.url), datos: DATOS })
      const path = [dirname(process.execPath), ...(process.platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : []), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(WIN ? ';' : ':')
      privada(R.logs)
      const r = auto.activar({ ...base, comando, path, log: join(R.logs, 'servidor.log'), simular: sub === 'simular' })
      if (sub === 'simular') { console.log(`# ${r.ruta}\n${r.texto}`); return }
      console.log(`[arbrain] Arranque automático activado: ${r.ruta}`)
      for (const n of r.notas) console.log(`[arbrain] ${n}`)
      return
    }
    if (sub === 'desactivar') {
      const r = auto.desactivar(base)
      console.log(r.habia ? `[arbrain] Arranque automático desactivado (quité ${r.ruta}).` : '[arbrain] El arranque automático ya estaba desactivado.')
      for (const n of r.notas) console.log(`[arbrain] ${n}`)
      return
    }
    const a = auto.estado(base)
    console.log(`[arbrain] Arranque automático: ${a.activo ? `activado (${a.ruta})` : 'desactivado'}`)
    return
  }
  fallar(`Orden desconocida: ${orden}. Usa: iniciar, abrir, estado, detener, contrasena, cerrar-sesiones, arranque-automatico, empaquetar.`)
}

main().catch((e) => fallar(e?.stack ?? String(e)))
