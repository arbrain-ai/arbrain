/**
 * Prueba de caos de la edición cliente (resiliencia, 12 oct 2026). La corre `arbrain/scripts/caos.sh`.
 *
 * Por dependencia: la mata (o la cuelga), mide cuándo se detecta y cuándo vuelve, registra qué le dijo la app a la
 * persona y comprueba que un mensaje enviado DURANTE la caída llegó al daemon exactamente una vez.
 *
 * Qué es real y qué no (honesto):
 *  - REAL: el daemon de la copia del alumno (`ARBRAIN_EDICION=cliente`, secretos por stdin, HOME/datos/puertos propios),
 *    su journal SQLite, el sobre y la entrega de la app (`deliverOfflineChat`), la política de reintento
 *    (`reintentosVencidos`), los textos que ve la persona (`msjMotorCaido`, `explicarEspera`) y la base local de la web
 *    (`almacenArchivos`).
 *  - EMULADO: el supervisor de Tauri (`daemon.rs › supervisar`: cada 5 s, /health con token y plazo 4 s, 3 fallos con el
 *    proceso vivo, reinicio) y la ruta `/api/chat/stream` de Next (traducción del sobre + plazo de cabeceras de 30 s).
 *    El supervisor real se prueba con `cargo test salud_cliente` y en CI con el paso de caos de `smoke-linux.sh`.
 *  - FUERA: matar el servidor web (Next) exige el build de escritorio; lo cubre el smoke de CI.
 *
 * Nunca toca servicios de Daniel: puertos libres ≠ 3000/3099/3218/3300, HOME temporal, solo mata PIDs que lanzó.
 *
 *   npx tsx scripts/caos-cliente.mts --copia /tmp/arbrain-copia [--reporte <json>]
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deliverOfflineChat, ChatDraftNoLongerPending } from '../src/features/chat/lib/offline-envelope'
import { reintentosVencidos, esFallaTransitoria, proximoReintento } from '../src/features/chat/lib/reintento-envios'
import { explicarEspera } from '../src/features/chat/lib/espera-explicada'
import { msjMotorCaido } from '../src/lib/infra-errores'
import { fetchConPlazoDeCabeceras, PLAZO_STREAM_MS } from '../src/lib/daemon-fetch'
import { almacenArchivos } from '../src/lib/base-local/archivos'
import { clienteLocal } from '../src/lib/base-local/consulta'
import type { SyncQueueItem } from '../src/lib/local-first/types'

const args = process.argv.slice(2)
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const COPIA = resolve(arg('--copia') ?? '')
const REPORTE = arg('--reporte')
if (!existsSync(join(COPIA, 'arbrain/server/src/index.ts'))) { console.error('Uso: --copia <carpeta generada con generar.mjs>'); process.exit(2) }

const AQUI = resolve(import.meta.dirname, '..')
const SERVER_MODULES = join(AQUI, 'server', 'node_modules')
const RESERVADOS = new Set([3000, 3099, 3218, 3300])
// Mismas constantes que src-tauri/src/daemon.rs (SALUD_CADA, FALLOS_PARA_REINICIAR, plazo de salud).
const SALUD_CADA_MS = 5_000, FALLOS_PARA_REINICIAR = 3, PLAZO_SALUD_MS = 4_000
const SLA_DETECCION_MS = 60_000, SLA_RECUPERACION_MS = 60_000

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
const puertoLibre = (): Promise<number> => new Promise((ok, mal) => {
  const s = createServer(); s.once('error', mal)
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => RESERVADOS.has(p) ? puertoLibre().then(ok, mal) : ok(p)) })
})

// ── Entorno aislado ────────────────────────────────────────────────────────────────────────────────────────────────
const raiz = mkdtempSync(join(tmpdir(), 'arbrain-caos-'))
const home = join(raiz, 'home'), datos = join(raiz, 'daemon'), cerebro = join(raiz, 'cerebro'), web = join(raiz, 'web')
for (const d of [home, datos, cerebro, web]) mkdirSync(d, { recursive: true })
const modulosCopia = join(COPIA, 'arbrain/server/node_modules')
// La copia no trae node_modules: se enlaza el del repo mientras dura la prueba y se quita al final (si queda, el
// escáner de fugas lo marca como «enlace que sale de la copia»).
const enlaceTemporal = !existsSync(modulosCopia)
if (enlaceTemporal) symlinkSync(SERVER_MODULES, modulosCopia, 'dir')
const quitarEnlace = () => { if (enlaceTemporal) try { unlinkSync(modulosCopia) } catch { /* ya no está */ } }
const T = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
const C = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
const P = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
const LLAVE = 'sk-ant-api03-CAOS-falsa-' + 'x'.repeat(40) // llave falsa: el turno se acepta y luego falla; no gasta nada
const OWNER = '00000000-0000-4000-8000-000000000001'
const CONV = '11111111-1111-4111-8111-111111111111'

const requerir = createRequire(join(SERVER_MODULES, 'x.js'))
const tsx = pathToFileURL(requerir.resolve('tsx/esm')).href
let puerto = 0, puertoWeb = 0
let daemon: ChildProcess | null = null
let log = ''
const lanzados: number[] = []

function lanzarDaemon(): ChildProcess {
  const d = spawn(process.execPath, ['--import', tsx, join(COPIA, 'arbrain/server/src/index.ts')], {
    cwd: datos, stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, TMPDIR: process.env.TMPDIR ?? '/tmp', NODE_ENV: 'production', LOG_LEVEL: 'warn',
      ARBRAIN_EDICION: 'cliente', ARBRAIN_SECRETOS: 'stdin', ARBRAIN_VIGILAR_STDIN: '1',
      ARBRAIN_DATA_DIR: datos, ARBRAIN_HOME: cerebro, MC_SERVER_PORT: String(puerto), MISSION_CONTROL_ORIGIN: `http://127.0.0.1:${puertoWeb}`,
    },
  })
  d.stdout!.on('data', b => { log += String(b) })
  d.stderr!.on('data', b => { log += String(b) })
  d.stdin!.write(JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T, ARBRAIN_TOKEN_CONFIRMAR: C, ARBRAIN_PASE_AGENTE: P, ...(process.env.CAOS_PROVEEDOR !== 'anthropic' ? { OPENROUTER_API_KEY: 'sk-or-v1-caos-falsa-' + 'y'.repeat(40) } : { ANTHROPIC_API_KEY: LLAVE }) }) + '\n')
  lanzados.push(d.pid!)
  return d
}
const vivo = (d: ChildProcess | null) => !!d && d.exitCode === null && d.signalCode === null
async function salud(): Promise<boolean> {
  try { return (await fetch(`http://127.0.0.1:${puerto}/health`, { headers: { Authorization: `Bearer ${T}` }, signal: AbortSignal.timeout(PLAZO_SALUD_MS) })).status === 200 } catch { return false }
}
async function esperarSano(ms: number) { const fin = Date.now() + ms; while (Date.now() < fin) { if (await salud()) return true; await dormir(200) } return false }

// ── Supervisor emulado (misma política que daemon.rs) ──────────────────────────────────────────────────────────────
type Evento = { t: number; que: string }
let eventos: Evento[] = []
let supervisorActivo = false
async function supervisor() {
  let fallos = 0
  while (supervisorActivo) {
    await dormir(SALUD_CADA_MS)
    if (!supervisorActivo) return
    const v = vivo(daemon)
    const sano = v && await salud()
    if (sano) { fallos = 0; continue }
    fallos += 1
    if (v && fallos < FALLOS_PARA_REINICIAR) { eventos.push({ t: Date.now(), que: `sonda fallida ${fallos}` }); continue }
    eventos.push({ t: Date.now(), que: v ? 'detectado colgado → reinicio' : 'detectado muerto → reinicio' })
    if (v) { try { daemon!.kill('SIGCONT'); daemon!.kill('SIGKILL') } catch { /* ya salió */ } await dormir(300) }
    daemon = lanzarDaemon()
    fallos = 0
  }
}

// ── Ruta /api/chat/stream emulada (lo que hace Next con el sobre) ──────────────────────────────────────────────────
let reciboPerdido = 0 // >0: el daemon acepta pero la respuesta «se pierde» (504) esas veces
const llamadasAlDaemon: string[] = []
const rutaWeb = (async (url: string, init?: RequestInit) => {
  if (url !== '/api/chat/stream') return Response.json({ error: 'ruta no emulada' }, { status: 404 })
  const sobre = JSON.parse(String(init?.body)) as Record<string, unknown>
  try {
    const r = await fetchConPlazoDeCabeceras(`http://127.0.0.1:${puerto}/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` },
      body: JSON.stringify({ message: sobre.message, ownerId: OWNER, account: sobre.account, verifiedConversation: true, chatSessionId: sobre.chatSessionId, turnId: sobre.turnId, acceptOnly: true, source: 'desktop', clientContext: null, intent: sobre.intent }),
    }, PLAZO_STREAM_MS)
    llamadasAlDaemon.push(`${r.status}`)
    if (reciboPerdido > 0 && r.ok) { reciboPerdido -= 1; return new Response('', { status: 504 }) }
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    llamadasAlDaemon.push('sin respuesta')
    return Response.json({ error: msjMotorCaido(true), code: 'DAEMON_UNREACHABLE' }, { status: (e as Error).name === 'TimeoutError' ? 504 : 503 })
  }
}) as unknown as typeof fetch

// ── Cola local emulada con la forma de SyncQueueItem (la de Tauri/IndexedDB) ───────────────────────────────────────
let intentConfirmado: unknown = null
/** La selección que la persona confirmó, como la obtiene la app (`/api/chat/selection` → daemon `/selection`). */
async function consultarSeleccion() {
  const r = await fetch(`http://127.0.0.1:${puerto}/selection?session=${CONV}&account=default&ownerId=${OWNER}`, { headers: { Authorization: `Bearer ${T}` } })
  const j = await r.json().catch(() => null) as { intent?: unknown; error?: string } | null
  if (!r.ok || !j?.intent) throw new Error(`sin selección del daemon (${r.status}): ${j?.error ?? ''}`)
  intentConfirmado = j.intent
}
function nuevoEnvio(turnId: string): SyncQueueItem {
  const ahora = new Date().toISOString()
  const intent = intentConfirmado
  const chatEnvelope = { version: 2, expectedOwnerId: OWNER, chatSessionId: CONV, turnId, account: 'default', message: `mensaje de caos ${turnId}`, source: 'desktop', intent }
  return { id: `q-${turnId}`, entityType: 'chat_prompt', entityId: turnId, operation: 'create', payloadJson: JSON.stringify({ localContext: { chatEnvelope } }), status: 'pending', attempts: 0, lastError: null, createdAt: ahora, updatedAt: ahora }
}
/** Lo que hace useChat + syncQueue: revisar cada 2.5 s, reintentar lo vencido, marcar el resultado. */
async function entregarConReintentos(item: SyncQueueItem, plazoMs: number, vio: string[]): Promise<{ ok: boolean; intentos: number; ms: number }> {
  const t0 = Date.now()
  // Primer intento directo (el Enter de la persona).
  let intentos = 0
  const intentar = async () => {
    intentos += 1
    try {
      await deliverOfflineChat(JSON.parse(item.payloadJson).localContext.chatEnvelope, rutaWeb, async () => true)
      item.status = 'synced'; item.lastError = null
    } catch (e) {
      if (e instanceof ChatDraftNoLongerPending) return
      item.status = 'failed'; item.lastError = (e as Error).message
      if (!vio.includes(item.lastError)) vio.push(item.lastError)
    }
    item.attempts += 1; item.updatedAt = new Date().toISOString()
  }
  await intentar()
  while (item.status !== 'synced' && Date.now() - t0 < plazoMs) {
    if (item.status === 'failed' && !esFallaTransitoria(item.lastError)) break
    await dormir(2_500)
    if (reintentosVencidos([item], OWNER, null).length) await intentar()
  }
  return { ok: item.status === 'synced', intentos, ms: Date.now() - t0 }
}

/** Filas del journal del daemon con ese turnId (solo lectura, con el better-sqlite3 del propio daemon). */
function turnosEnJournal(turnId: string): number {
  const Database = requerir('better-sqlite3') as new (ruta: string, op: { readonly: boolean }) => { prepare(sql: string): { get(...a: unknown[]): { n: number } }; close(): void }
  const db = new Database(join(datos, 'store', 'claudeclaw.db'), { readonly: true })
  try { return db.prepare('select count(*) as n from chat_runtime_turns where turn_id = ?').get(turnId).n } finally { db.close() }
}

type Resultado = {
  dependencia: string; deteccionMs: number | null; recuperacionMs: number | null; entregaMs: number | null
  intentos: number; turnosEnServidor: number; vioLaPersona: string[]; explicacionEspera: string | null; ok: boolean; nota?: string
}
const resultados: Resultado[] = []

async function escenarioDaemon(modo: 'muerto' | 'colgado', recibo = false): Promise<void> {
  eventos = []
  const turnId = crypto.randomUUID()
  const item = nuevoEnvio(turnId)
  const vio: string[] = []
  const pid = daemon!.pid!
  const tCaida = Date.now()
  if (modo === 'muerto') daemon!.kill('SIGKILL'); else process.kill(pid, 'SIGSTOP')
  if (recibo) reciboPerdido = 1
  // Lo que la persona leería bajo «Preparando respuesta» a los 25 s (la sonda vería el daemon caído).
  const explicacion = explicarEspera({ ok: true, etapas: { daemon: { ok: false }, supabase: { ok: true } } }, 25)
  // Reloj de recuperación: primera sonda /health sana después de la caída (cada 250 ms, en paralelo).
  let tSano: number | null = null
  const reloj = (async () => { await dormir(1_000); while (tSano === null && Date.now() - tCaida < 180_000) { if (await salud()) tSano = Date.now(); else await dormir(250) } })()
  await dormir(500) // la persona escribe justo después de la caída
  const entrega = await entregarConReintentos(item, 150_000, vio)
  await reloj
  const deteccion = eventos.find(e => e.que.startsWith('detectado'))
  const turnos = turnosEnJournal(turnId)
  const r: Resultado = {
    dependencia: `daemon ${modo}${recibo ? ' + recibo perdido' : ''}`,
    deteccionMs: deteccion ? deteccion.t - tCaida : null,
    recuperacionMs: tSano ? tSano - tCaida : null,
    entregaMs: entrega.ok ? entrega.ms + 500 : null,
    intentos: entrega.intentos, turnosEnServidor: turnos, vioLaPersona: vio, explicacionEspera: explicacion,
    ok: false,
  }
  r.ok = entrega.ok && turnos === 1 && r.deteccionMs !== null && r.deteccionMs < SLA_DETECCION_MS && (r.recuperacionMs ?? Infinity) < SLA_RECUPERACION_MS
    && vio.every(t => esFallaTransitoria(t) && !/Studio|ngrok|t[uú]nel/i.test(t))
  resultados.push(r)
}

async function escenarioBaseLocal(): Promise<void> {
  const dir = join(web, 'base')
  const db = clienteLocal(almacenArchivos(dir))
  await db.from('chat_messages').insert({ id: 'm1', session_id: CONV, role: 'user', content: 'antes' })
  await db.from('chat_messages').insert({ id: 'm2', session_id: CONV, role: 'assistant', content: 'respuesta' })
  const t0 = Date.now()
  writeFileSync(join(dir, 'chat_messages.json'), '{"medio escrito": ')
  const otra = clienteLocal(almacenArchivos(dir))
  const leidas = await otra.from('chat_messages').select('id')
  const recuperadas = (leidas.data as { id: string }[] | null)?.map(f => f.id) ?? []
  // Sin copia útil: 503 y nada se pisa.
  writeFileSync(join(dir, 'chat_messages.json.bak'), 'basura'); writeFileSync(join(dir, 'chat_messages.json'), 'basura')
  const tercera = clienteLocal(almacenArchivos(dir))
  const sinCopia = await tercera.from('chat_messages').insert({ session_id: CONV, role: 'user', content: 'durante la caída' })
  const intacto = readFileSync(join(dir, 'chat_messages.json'), 'utf8') === 'basura'
  resultados.push({
    dependencia: 'base local de la web (archivo dañado)', deteccionMs: 0, recuperacionMs: Date.now() - t0, entregaMs: null, intentos: 1,
    turnosEnServidor: 0, vioLaPersona: [sinCopia.error?.message ?? '(sin error)'], explicacionEspera: null,
    ok: recuperadas.join(',') === 'm1' && sinCopia.status === 503 && intacto,
    nota: `con copia: se leyeron [${recuperadas.join(', ')}] de la copia anterior; sin copia: ${sinCopia.status} y el archivo quedó intacto=${intacto}. El mensaje no se pierde: sigue en la cola local y se reintenta.`,
  })
}

async function main() {
  puerto = await puertoLibre(); puertoWeb = await puertoLibre()
  console.log(`[caos] copia ${COPIA} · HOME ${home} · daemon :${puerto}`)
  daemon = lanzarDaemon()
  if (!await esperarSano(60_000)) throw new Error(`el daemon no arrancó:\n${log.slice(-3000)}`)
  await consultarSeleccion()
  console.log(`[caos] selección confirmada: ${JSON.stringify(intentConfirmado)}`)
  supervisorActivo = true
  const sup = supervisor()
  try {
    await escenarioDaemon('muerto')
    await esperarSano(60_000)
    await escenarioDaemon('colgado')
    await esperarSano(60_000)
    await escenarioDaemon('muerto', true)
    await escenarioBaseLocal()
  } finally {
    supervisorActivo = false
    await sup.catch(() => {})
    for (const pid of lanzados) { try { process.kill(pid, 'SIGCONT'); process.kill(pid, 'SIGTERM') } catch { /* ya salió */ } }
    await dormir(1_000)
    quitarEnlace()
  }
  console.log('\n| Dependencia | Detección | Recuperación | Entrega del mensaje | Intentos | Turnos en el servidor | OK |')
  console.log('|---|---|---|---|---|---|---|')
  const s = (ms: number | null) => ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`
  for (const r of resultados) console.log(`| ${r.dependencia} | ${s(r.deteccionMs)} | ${s(r.recuperacionMs)} | ${s(r.entregaMs)} | ${r.intentos} | ${r.turnosEnServidor} | ${r.ok ? 'sí' : 'NO'} |`)
  for (const r of resultados) console.log(`\n${r.dependencia}: la persona vio → ${r.vioLaPersona.map(t => `«${t}»`).join(' · ') || '(nada: entregado al primer intento)'}${r.explicacionEspera ? `\n  bajo «Preparando respuesta» (25 s): «${r.explicacionEspera}»` : ''}${r.nota ? `\n  ${r.nota}` : ''}`)
  console.log(`\nllamadas al daemon (estado): ${llamadasAlDaemon.join(', ')}`)
  if (REPORTE) writeFileSync(REPORTE, JSON.stringify({ fecha: new Date().toISOString(), copia: COPIA, resultados, llamadasAlDaemon }, null, 2) + '\n')
  const ok = resultados.every(r => r.ok)
  console.log(ok ? '\nCAOS OK' : '\nCAOS FALLO')
  process.exit(ok ? 0 : 1)
}

void proximoReintento
main().catch(e => { console.error('[caos] error:', e); for (const pid of lanzados) { try { process.kill(pid, 'SIGCONT'); process.kill(pid, 'SIGKILL') } catch { /* */ } } quitarEnlace(); process.exit(2) })
