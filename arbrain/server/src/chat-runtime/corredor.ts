/**
 * Corredor de turnos de Levy (daemon-levy, 1 oct 2026).
 *
 * Proceso aparte, lanzado por el agent-server con `detached` (sesión y grupo de procesos
 * propios): un `launchctl kickstart -k` del agent-server, un deploy o una caída no lo
 * alcanzan. Reclama turnos del journal SQLite como un worker más, ejecuta el mismo
 * `executeChatJob` y escribe cada evento en el journal; el agent-server (el de antes o
 * el nuevo) solo observa y entrega. Así un turno en vuelo sobrevive al reinicio del
 * servidor, como una PTY de SFTerm sobrevive al de la app porque vive en `ptyd`.
 *
 * Se retira solo: con build nuevo (deja de tomar turnos, termina los suyos y sale; el
 * agent-server lanza uno con el código nuevo) o tras un rato sin trabajo.
 */
import { createServer } from 'node:http'
import { initDatabase, getDb } from '../db.js'
import { initMcOutbox } from '../mc-client.js'
import { invokeLiveCapability } from '../live/capability.js'
import { answerUserQuestion, hasPendingUserQuestion } from '../agent.js'
import { answerCodexQuestion, hasPendingCodexQuestion } from '../codex-agent.js'
import { logger } from '../logger.js'
import { ChatJournal } from './journal.js'
import { ChatSupervisor } from './supervisor.js'
import { executeChatJob } from './chat-job.js'
import { ChatInjections } from './inyecciones.js'
import { inyectarEnMotor, sinLeerEnMotor } from './inyeccion-motor.js'
import { claudeRuntimePool } from './claude-pool.js'
import { instalarAdoptante } from './adoptante.js'
import { CorredorRegistro, codeStamp, corredorWorkerId, workerConfirmedDead, workerState, isCorredorWorker } from './corredor-registro.js'

const IDLE_MS = Number(process.env.ARBRAIN_CORREDOR_IDLE_MS ?? 30 * 60_000)
/** Un build a medio escribir no cuenta como versión nueva hasta que dist/ se asienta. */
const SETTLE_MS = Number(process.env.ARBRAIN_CORREDOR_SETTLE_MS ?? 10_000)

async function main(): Promise<void> {
  // El corredor hereda el entorno del agent-server; CLAUDE_CONFIG_DIR lo resuelve la sesión por cuenta.
  initDatabase()
  const db = getDb()
  initMcOutbox(db) // solo lectura de pendientes para la apertura del primer turno; el envío lo hace el agent-server
  const journal = new ChatJournal(db)
  const registro = new CorredorRegistro(db)
  const workerId = corredorWorkerId()
  const stamp = codeStamp()
  let draining = false
  let lastWork = Date.now()

  // Herramientas live del turno: el script del modelo llama a ESTE proceso, dueño de la capacidad.
  const liveServer = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/live/tool') { res.writeHead(404).end(); return }
    let body = ''
    req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) req.destroy() })
    req.on('end', () => {
      void (async () => {
        try {
          const result = await invokeLiveCapability((req.headers.authorization ?? '').replace(/^Bearer /, ''), JSON.parse(body))
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
        } catch { res.writeHead(403, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'La herramienta no pertenece a un turno activo.' })) }
      })()
    })
  })
  await new Promise<void>(resolve => liveServer.listen(0, '127.0.0.1', resolve))
  const address = liveServer.address()
  if (address && typeof address === 'object') process.env.ARBRAIN_LIVE_TOOL_PORT = String(address.port)
  liveServer.unref()

  const supervisor = new ChatSupervisor(journal, {
    workerId,
    run: (turn, emit, signal) => executeChatJob(journal, turn, emit, signal),
    deliver: async () => false,
    deliveries: false,
    canClaim: () => !draining,
    workerConfirmedDead,
    deathCause: worker => workerState(worker) === 'rebooted' ? 'reboot' : isCorredorWorker(worker) ? 'runner' : 'server',
    tickMs: 250,
    onError: error => logger.error({ err: error }, 'corredor: turno'),
    // Lo que Daniel escribe con un turno vivo lo registra el agent-server; aquí, dueño del proceso Claude, se empuja.
    injections: new ChatInjections(db, journal),
    inject: inyectarEnMotor,
    unreadInjections: sinLeerEnMotor,
  })
  registro.register(workerId, process.pid, stamp)
  // Chat vivo: lo que Levy responde por su cuenta en las sesiones de ESTE proceso se vuelve turno visible.
  instalarAdoptante(supervisor, logger)
  supervisor.start()
  logger.info({ workerId, stamp }, 'corredor: listo')

  // Síncrono de punta a punta: entre revisar `activeJobs` y salir no puede colarse un reclamo.
  const leave = (reason: string) => {
    draining = true
    if (supervisor.activeJobs > 0 || claudeRuntimePool.busy) return
    logger.info({ workerId, reason }, 'corredor: se retira')
    try { registro.unregister(workerId) } catch { /* el registro se limpia solo al verlo muerto */ }
    claudeRuntimePool.close()
    process.exit(0)
  }

  const relayAnswers = () => {
    try {
      for (const pending of registro.pendingAnswers()) {
        if (!hasPendingCodexQuestion(pending.requestId) && !hasPendingUserQuestion(pending.requestId)) continue
        if (!registro.claimAnswer(pending.requestId, workerId)) continue
        const ok = answerCodexQuestion(pending.requestId, pending.answers) || answerUserQuestion(pending.requestId, pending.answers)
        logger.info({ requestId: pending.requestId, ok }, 'corredor: respuesta relevada')
      }
    } catch (error) { logger.error({ err: error }, 'corredor: relevo de respuestas') }
  }
  setInterval(relayAnswers, 250)

  let tick = 0
  setInterval(() => {
    const now = Date.now()
    const current = codeStamp()
    if (!draining && current !== stamp && now - Number(current) >= SETTLE_MS) {
      draining = true
      logger.info({ workerId, stamp, current }, 'corredor: hay build nuevo; termino lo mío y no tomo más')
    }
    const busy = supervisor.activeJobs > 0 || claudeRuntimePool.busy
    if (busy) lastWork = now
    try { registro.heartbeat(workerId, draining) } catch (error) { logger.warn({ err: error }, 'corredor: latido') }
    if (++tick % 3600 === 0) { try { registro.pruneAnswers() } catch { /* poda opcional */ } }
    if (!busy && (draining || now - lastWork >= IDLE_MS)) leave(draining ? 'build nuevo' : 'sin trabajo')
  }, 1000)

  // Apagado del Mac o señal explícita: dejar de tomar turnos; lo que no alcance a terminar
  // queda incierto y el siguiente arranque lo cierra con lo que alcanzó a escribir.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => leave(signal))
  }
  // Igual que el agent-server: una promesa huérfana del SDK no tumba el proceso.
  process.on('unhandledRejection', reason => logger.error({ reason: String(reason) }, 'corredor: unhandledRejection (sigue vivo)'))
}

main().catch(error => {
  logger.error({ err: error }, 'corredor: no pudo arrancar')
  process.exit(1)
})
