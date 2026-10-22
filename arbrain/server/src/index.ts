// PRIMERO: la edición cliente traduce su contrato al entorno antes de que config.ts lo lea (cliente/arranque.ts).
import { DUENO, DUENO_M } from './dueno.js'
import './cliente/arranque.js'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { STORE_DIR, PROJECT_ROOT, CLAUDECLAW_ROLE } from './config.js'
import { readEnvFile } from './env.js'
import { initDatabase, getDb } from './db.js'
import { initMcOutbox } from './mc-client.js'
import { initScheduler, stopScheduler } from './scheduler.js'
import { cleanupOldUploads } from './media.js'
import { runDecaySweep } from './memory.js'
import { startMCServer, alPedirApagado } from './server.js'
import { logger } from './logger.js'
import { esEdicionCliente } from './edicion.js'
import { faltaLlaveClaude } from './cliente/llaves.js'
import { entornoClaude } from './cliente/cofre.js'

const PID_FILE = join(STORE_DIR, 'claudeclaw.pid')
const __filename = fileURLToPath(import.meta.url)

// ─── Lock ────────────────────────────────────────────────────────────────────

function acquireLock(): void {
  mkdirSync(STORE_DIR, { recursive: true })
  if (existsSync(PID_FILE)) {
    const existingPid = readFileSync(PID_FILE, 'utf8').trim()
    // Verificar si el proceso aún corre
    try {
      process.kill(parseInt(existingPid, 10), 0)
      logger.error({ pid: existingPid }, 'Another instance is already running. Exiting.')
      process.exit(1)
    } catch {
      // El proceso no existe — PID file stale
      logger.warn({ pid: existingPid }, 'Stale PID file found, removing.')
      unlinkSync(PID_FILE)
    }
  }
  writeFileSync(PID_FILE, String(process.pid))
  if (esEdicionCliente()) try { chmodSync(PID_FILE, 0o600) } catch { /* best-effort */ }
  logger.debug({ pid: process.pid, pidFile: PID_FILE }, 'lock acquired')
}

function releaseLock(): void {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE)
  } catch {
    // ignorar
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cliente = esEdicionCliente()
  if (!cliente) {
    console.log('╔═══════════════════════════════════╗')
    console.log(`║   ClaudeClaw — Levy / ${DUENO} OS   ║`)
    console.log('╚═══════════════════════════════════╝')
    console.log()
  }

  // La única interfaz es el chat de Arbrain (servidor HTTP en :3099).
  const chatOnly = CLAUDECLAW_ROLE === 'chat'

  // Adquirir lock (singleton)
  acquireLock()

  // Base de datos
  initDatabase()
  logger.info('database initialized')

  // Cola durable de reportes a Mission Control: reintenta cada minuto lo vencido.
  const outbox = initMcOutbox(getDb())
  const tickOutbox = () => { void outbox.procesar().catch(err => logger.warn({ err }, 'mc-outbox: ciclo falló')); outbox.podar() }
  tickOutbox()
  setInterval(tickOutbox, 60_000).unref()

  // Expose gog CLI config to Agent SDK subprocess (non-secrets, needed for Google Workspace). Solo Daniel.
  if (!cliente) {
    const gogVars = readEnvFile(['GOG_KEYRING_PASSWORD', 'GOG_ENABLE_COMMANDS'])
    for (const [k, v] of Object.entries(gogVars)) { if (v) process.env[k] = v }
  }

  // Pre-warm Agent SDK subprocess (~20x faster first query). Edición cliente sin llave: no (no tendría con qué).
  if (!faltaLlaveClaude()) import('@anthropic-ai/claude-agent-sdk').then((sdk) => {
    const startupFn = (sdk as Record<string, unknown>)['startup'] as
      ((opts?: { options?: { cwd?: string; env?: Record<string, string> } }) => Promise<void>) | undefined
    if (startupFn) {
      // Edición cliente: el CLI precalentado recibe sus llaves del cofre (contrato v2), nunca vía process.env.
      startupFn({ options: { cwd: PROJECT_ROOT, ...(cliente ? { env: entornoClaude(process.env) } : {}) } }).catch((err: unknown) => {
        logger.warn({ err }, 'SDK pre-warm failed (non-fatal)')
      })
    }
  }).catch(() => { /* SDK import failure is non-fatal */ })

  // Mission Control web server (localhost:3099)
  startMCServer()

  // Memory decay al arrancar + cada 24h
  runDecaySweep()
  const decayInterval = setInterval(runDecaySweep, 24 * 60 * 60 * 1000)

  // Limpiar uploads viejos al arrancar
  cleanupOldUploads()

  // Iniciar scheduler (seedea tareas default si no existen). En rol 'chat' (MacBook)
  // no: los crons corren solo en el Mini, que sigue siendo su único dueño.
  if (chatOnly) {
    logger.info('CLAUDECLAW_ROLE=chat — scheduler apagado; los crons viven en el servidor')
  } else {
    initScheduler()
    logger.info('scheduler initialized')
  }

  // SIGINT / SIGTERM — shutdown graceful
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down...')
    stopScheduler()
    clearInterval(decayInterval)
    releaseLock()
    // Un «Iniciar sesión con Claude» a medias no queda huérfano escuchando en 127.0.0.1.
    try { (await import('./cliente/suscripcion.js')).cancelarLoginClaude() } catch { /* nada que cerrar */ }

    logger.info('goodbye')
    process.exit(0)
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  // Contrato §5: POST /apagar (Windows no entrega SIGTERM) y, si la app lo pide, apagarse cuando ella muere.
  alPedirApagado(() => { void shutdown('POST /apagar') })
  if (cliente && process.env.ARBRAIN_VIGILAR_STDIN === '1') {
    process.stdin.on('end', () => { void shutdown('stdin cerrado') })
    process.stdin.on('error', () => { void shutdown('stdin con error') })
    process.stdin.resume()
  }

  // ─── El daemon NO se muere por un throw suelto (15 jul 2026) ───────────────
  // El SDK lanza errores en BACKGROUND (su readMessages corre fuera del for-await
  // que consumimos): un resume huérfano —"No conversation found with session ID"—
  // se volvía unhandledRejection y Node MATABA el proceso entero. Se llevaba el
  // chat Y los crons; launchd revivía en segundos y Daniel sólo veía "se cortó
  // del lado del server" + Levy sin el hilo. Un turno puede fallar; el organismo
  // no se suicida por eso. Se loguea fuerte (para que no falle en silencio) y se
  // sigue vivo. NO capturamos uncaughtException: un bug de estado real sí debe
  // reiniciar limpio; esto es sólo para promesas huérfanas del SDK.
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: String(reason) }, 'unhandledRejection — el daemon sigue vivo (antes moría aquí)')
  })

  if (!cliente) console.log('\n✓ ClaudeClaw corriendo. Chat de Arbrain: http://localhost:3099\n')
  // Mantener vivo el proceso (el servidor HTTP sostiene el event loop).
  await new Promise(() => { /* nunca resuelve; vive hasta SIGINT/SIGTERM */ })
}

main().catch((err) => {
  logger.error({ err }, 'fatal error')
  releaseLock()
  process.exit(1)
})
