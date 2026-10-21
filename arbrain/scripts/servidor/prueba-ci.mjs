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
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
  supervisor = spawn(process.execPath, [SCRIPT, '--sin-navegador', '--puerto', String(puerto), '--datos', DATOS], {
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

  // 2. detener: el supervisor sale y libera los puertos.
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

main().catch((e) => fallar(e?.stack ?? String(e)))
