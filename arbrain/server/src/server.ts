import { DUENO, DUENO_M, instalacionOriginal } from './dueno.js'
import { transcribe, TranscriptionError } from './live/transcribe.js'
import { proveedoresVoz, probarLlaveVoz } from './cliente/voz.js'
import { warmSpeech, prewarmSpeech } from './live/speech.js'
import { Readable } from 'node:stream'
import { liveStore } from './live/runtime.js'
import { invokeLiveCapability } from './live/capability.js'
/**
 * Mission Control Web Server — exposes a local HTTP endpoint so Mission Control
 * dashboard can send messages to Levy (Claude Code Agent SDK) from the browser.
 *
 * Endpoints:
 *   POST /chat    { message: string } → { text: string }
 *   POST /newchat {}                  → { ok: true }
 *
 * Auth: Bearer token (OPENCLAW_GATEWAY_TOKEN)
 * Port: MC_SERVER_PORT env var, default 3099
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { handleSales } from './sales-http.js'
import { handlePlanning } from './planning-http.js'
import { existingExecutor } from './consejo/executor.js'
import { handleConsejo, consejoEngine } from './consejo/http.js'
import { ConsejoError } from './consejo/types.js'
import { timingSafeEqual, randomUUID } from 'crypto'
import { ChatJournal, JournalCancelled } from './chat-runtime/journal.js'
import { ChatInjections } from './chat-runtime/inyecciones.js'
import { inyectarEnMotor, sinLeerEnMotor } from './chat-runtime/inyeccion-motor.js'
import { ChatSupervisor } from './chat-runtime/supervisor.js'
import { CorredorRegistro, corredorEnabled, workerConfirmedDead, workerState, isCorredorWorker } from './chat-runtime/corredor-registro.js'
import { CorredorLanzador, defaultCorredorLog } from './chat-runtime/corredor-lanzador.js'
import { streamDurableTurn as observeDurableTurn } from './chat-runtime/http-stream.js'
import { instalarAdoptante } from './chat-runtime/adoptante.js'
import { Despertadores, dispararVencidos, DespertadorInvalido } from './chat-runtime/despertadores.js'
import { executeChatJob, type ChatJobInput } from './chat-runtime/chat-job.js'
import { freezeChatContext, acceptResolvedChat, durableSubmissionError } from './chat-runtime/chat-envelope.js'
import { getClaudeCatalog, findClaudeModel } from './chat-runtime/claude-capabilities.js'
import { resolveClaudeSelection } from './chat-runtime/claude-selection.js'
import { captureChatIntent, parseChatIntent, resolveChatIntent, intentOverrides, type ChatIntent } from './chat-runtime/chat-intent.js'
import { controlAccess } from './chat-runtime/scoped-controls.js'
import { forkConversation, forkClaudeEnHijo, copiarAjustes, ForkRejected } from './chat-runtime/chat-fork.js'
import { nativeAwareControlAccess } from './chat-runtime/native-control-proof.js'
import { readClaudeInventory, readCodexInventory, renderRuntimeInventory, type InventoryKind } from './chat-runtime/runtime-inventory.js'
import { claudeRuntimePool } from './chat-runtime/claude-pool.js'
import { deshacerDesde, rehacer, abrirConSdk } from './chat-runtime/deshacer.js'
import { entornoClaude } from './cliente/cofre.js'
import { changeChatControls, effortControlPatch, ultracodeControlPatch } from './chat-runtime/chat-controls.js'
import { hostname } from 'node:os'
import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync, realpathSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { readEnvFile } from './env.js'
import { PROJECT_ROOT, STORE_DIR, CLAUDECLAW_ROLE, CHAT_IDLE_LIMIT_MS, CHAT_ABSOLUTE_LIMIT_MS } from './config.js'
import { runAgent, runAgentStream, computeRewindCheckpoint, getModelState, getContextInfo, answerUserQuestion, configDirForAccount, EffortLevel, type SessionOverrides, type Query } from './agent.js'
// Tercer espacio del chat (4 sep 2026): Levy sobre OpenAI vía Codex CLI con el
// login de ChatGPT de la instalación. Ver codex-agent.ts.
import { runCodexStream, codexModelBelongs, codexModelName, isCodexAccount, isCodexModel, codexCurrentModel, codexRuntime, resolveCodexSelection, answerCodexQuestion, forkCodexThread, CODEX_MODEL_DISPLAY_NAMES } from './codex-agent.js'
import { listSessions } from '@anthropic-ai/claude-agent-sdk'
import { readSessionMessages } from './chat-runtime/claude-transcript.js'
import { buildChatStatus, rateLimitView, type StatusInput } from './chat-runtime/chat-status.js'
import { readClaudePlanLimits, readCodexPlanLimits, unavailableLimits } from './chat-runtime/plan-limits.js'
import { DEFAULT_CHAT_EFFORT, effectiveEffort, nearestEffort } from './chat-runtime/effort-control.js'
import { deliveryOutcome } from './chat-runtime/delivery-outcome.js'
import { compactDelivery } from './chat-runtime/delivery-compact.js'
import { getCommandCatalog } from './chat-runtime/command-catalog.js'
import { parseGoalCommand, goalView, formatGoal, GOAL_HELP, GOAL_NO_THREAD, interceptsGoal } from './chat-runtime/chat-goal.js'
import { comandoMetaLocal, EstadoMetas, estadoMetas, textoComandoLocal } from './chat-runtime/meta-claude.js'
import { downloadFromUrl, buildAttachmentMessage, esDocumento, validarAdjunto } from './media.js'
import { synthesizeSpeech, synthesizeLector, LECTOR_SPEED } from './voice.js'
import { getDb, getSession, setSession, clearSession, listTasks, getTask, updateTaskStatus, updateTaskAfterRun, saveQueryUsage, getUsageSummary, getCronSession, setCronSession, getChatOverrides, setChatOverrides } from './db.js'
import { computeNextRun, runDueTasks, executeCronJob, CRON_TZ } from './scheduler.js'
import { saveConversationTurn } from './memory.js'
import { logger } from './logger.js'
import { validateInput, validateUrl, redactSecrets, MAX_DOWNLOAD_SIZE } from './security.js'
import { opsLogger, type OpsEvent } from './ops-logger.js'
import { computerUseDisponible, computerUseEncendido, estadoParaManos, marcarFuenteLocal, registrarDatosPropios, registrarModoManos, registrarVoz } from './manos/politica.js'
import { datosPropios, modoPermisos } from './cliente/modo-permisos.js'
import { avisarSistema } from './cliente/aviso-sistema.js'
import { esEdicionCliente } from './edicion.js'
import { estadoLlaves, faltaLlaveClaude, faltaLlaveTrasConectar, MENSAJE_FALTA_LLAVE, CODIGO_FALTA_LLAVE } from './cliente/llaves.js'
import { hostLocalValido, rutaCanonica, rutaSoloDaniel, MENSAJE_NO_DISPONIBLE } from './cliente/rutas.js'
import { confirmacionesDelDaemon, iniciarConfirmaciones, pedidoManos } from './cliente/confirmaciones.js'
import { avisarTelefono, retomarEnConversacion } from './cliente/cola.js'
import { marcarContaminada } from './guardia-agentes.js'
import { listarReglas, resolverTarjeta, revocarRegla } from './cliente/tarjeta.js'
import { motor as motorPty } from './motor/cliente.js'
import { secretoConfirmarValido } from './cliente/secreto.js'
import { cohorteDelDaemon, iniciarCohorte } from './cliente/cohorte.js'
import { iniciarProgreso, progresoDelDaemon } from './cliente/progreso.js'
import { bitacoraDelDaemon, iniciarBitacora, redactar } from './cliente/bitacora.js'
import { alPausarTodo, estadoPausa, pausar, reanudar } from './cliente/pausa.js'
import { abrirCarpeta, carpetasAbiertas, cerrarCarpeta } from './cliente/carpetas.js'
import { contextoPolitica, motivoRutaSecreta } from './cliente/politica-agentes.js'
import { llaveVoz, paseAgenteValido, rutaSoloApp } from './cliente/cofre.js'
import { CONTRATO_DAEMON } from './cliente/contrato.js'
// v3: la web muestra si el Bash de los agentes corre en sandbox (sin él, todo comando pide confirmación).
import { sandboxActivo } from './cliente/sandbox.js'
import { motivoFsRechazo } from './fs-acceso.js'
import { extractFileMarkers, uploadToStorage, type StagedAttachment } from './file-attach.js'
import { esCuentaApi, esCuentaChat, motorApiEncendido, registroPublico } from './modelos/registro.js'
import { catalogoPublico, consultarOpenRouter, guardarHabilitado, leerHabilitados } from './modelos/catalogo.js'
import { guardarPreferencia, leerPreferencia, preferenciaVacia } from './modelos/preferencia.js'
import { dirClaudeAlterna } from './cuentas-alternas.js'

/** Proyectos de la cuenta alterna de Claude (`account: 'bro'`) si esta instalación la tiene; en cliente, ninguno. */
const proyectosAlternos = (): Record<string, string> => { const d = dirClaudeAlterna(); return d ? { bro: join(d, 'projects') } : {} }
// Alexa Skill conversacional descontinuado (Apr 30, 2026): timeout de 8s incompatible con runAgent.
// Pivote a notificaciones push: claudeclaw → Echo via Bluetooth (scripts/alexa/announce.sh).
// import { handleAlexaRequest } from './alexa-skill.js'

// Durable chat worker. Existing legacy clients remain on their old protocol until migrated.
// Con ARBRAIN_CORREDOR=1 (daemon-levy, 1 oct 2026) este proceso no ejecuta turnos: los deja en el
// journal y un corredor aparte, que sobrevive a reinicios del agent-server, los ejecuta. Aquí
// solo se acepta, se observa, se cancela y se entrega. Sin la bandera, todo sigue como antes.
let durableChat: ChatSupervisor | undefined
let despertadores: Despertadores | undefined
let corredorRegistro: CorredorRegistro | undefined
/** Inyección a mitad de turno (7 oct 2026): la tabla vive junto al journal; empuja quien ejecuta el turno. */
let chatInjections: ChatInjections | undefined
const CORREDOR = corredorEnabled({ ARBRAIN_CORREDOR: process.env.ARBRAIN_CORREDOR ?? readEnvFile(['ARBRAIN_CORREDOR']).ARBRAIN_CORREDOR })
function getDurableChat(): ChatSupervisor {
  if (durableChat) return durableChat
  const workerId = `${hostname()}:${process.pid}:${randomUUID()}`
  const journal = new ChatJournal(getDb())
  chatInjections = new ChatInjections(getDb(), journal)
  let lanzador: CorredorLanzador | undefined
  if (CORREDOR) {
    corredorRegistro = new CorredorRegistro(getDb())
    lanzador = new CorredorLanzador(journal, corredorRegistro, {
      logFile: defaultCorredorLog(dirname(STORE_DIR)), cwd: dirname(STORE_DIR),
      onLaunch: info => logger.info(info, 'corredor: lanzado para la cola de chat'),
    })
  }
  durableChat = new ChatSupervisor(journal, {
    workerId,
    run: (turn, emit, signal) => executeChatJob(journal, turn, emit, signal),
    // Entiende ambos formatos (worker interno y corredor) y el arranque del Mac:
    // un corredor vivo de otro proceso NO es un huérfano.
    workerConfirmedDead,
    deathCause: worker => workerState(worker) === 'rebooted' ? 'reboot' : isCorredorWorker(worker) ? 'runner' : 'server',
    ...(lanzador ? {
      canClaim: () => false,
      delegate: () => { try { lanzador!.ensure() } catch (error) { logger.error({ err: error }, 'corredor: no se pudo asegurar') } },
      tickMs: 250,
      reapEveryMs: 5_000,
    } : {}),
    deliver: async payload => {
      if (process.env.ARBRAIN_LIVE_CANARY === '1') return true // Isolated QA host: no uploads, callbacks or pushes.
      const data = payload as Record<string, unknown>
      const origin = data.turnId && data.ownerId && data.account && data.chatSessionId ? journal.get({ turnId:String(data.turnId),owner:String(data.ownerId),account:String(data.account),conversationId:String(data.chatSessionId) })?.input as ChatJobInput | undefined : undefined
      if (origin?.deliveryTarget === 'consejo') return true // Includes worker rejections; Consejo owns this result, no push/callback.
      const staged = Array.isArray(data.stagedAttachments) ? data.stagedAttachments as StagedAttachment[] : []
      const uploaded = []
      for (const file of staged) {
        // Edición cliente: sin almacenamiento en la nube (no hay Supabase de Daniel); el adjunto queda local y la respuesta llega igual.
        if (esEdicionCliente()) { try { uploaded.push(await uploadToStorage(file.localPath, file)) } catch (error) { logger.warn({ err: error, file: file.filename }, 'adjunto sin subir (edición cliente)') } continue }
        uploaded.push(await uploadToStorage(file.localPath, file))
      }
      const { stagedAttachments: _staged, ...completion } = data
      const runtimeSnapshot = data.runtimeSnapshot as Record<string, unknown> | undefined
      if (staged.length) {
        completion.fileAttachments = uploaded
        completion.runtimeSnapshot = { ...runtimeSnapshot, fileAttachments: uploaded }
      }
      const clientAcked = await waitForAck(String(data.turnId), 5_000)
      // Next corta el cuerpo en 10 MB: un turno con capturas en sus herramientas no se entregaba nunca
      // y trababa la conversación. Viaja una copia acotada; el journal conserva el resultado completo.
      const envelope = compactDelivery({ ...completion, clientAcked })
      if (envelope.trimmed) logger.warn({ turnId: data.turnId, originalBytes: envelope.originalBytes, bytes: envelope.bytes, stage: envelope.stage }, 'completion delivery compacted')
      const response = await fetch(`${ALLOWED_ORIGIN}/api/chat/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MC_TOKEN}` },
        body: JSON.stringify(envelope.payload), signal: AbortSignal.timeout(30_000),
      })
      await response.body?.cancel()
      const outcome = deliveryOutcome(response.status)
      if (outcome === 'gone') logger.warn({ turnId: data.turnId, status: response.status }, 'completion delivery abandoned: conversation no longer exists (result kept in journal)')
      return outcome !== 'retry'
    },
    onError: error => logger.error({ err: error }, 'durable chat worker'),
    onCede: info => logger.info(info, `chat: un aviso cedió su lugar a ${DUENO} y volvió a la fila`),
    injections: chatInjections,
    // Con corredor este proceso no ejecuta turnos (sus jobs están vacíos): empuja el corredor.
    inject: inyectarEnMotor,
    unreadInjections: sinLeerEnMotor,
  })
  // Sin corredor, las sesiones de Claude viven en este proceso: aquí se adoptan sus respuestas espontáneas.
  if (!CORREDOR) instalarAdoptante(durableChat, logger)
  durableChat.start()
  // Despertadores (chat vivo, 3 oct 2026): este proceso vive por launchd; el corredor se retira solo. Aquí se
  // revisa cada 2 s lo vencido y se acepta un turno normal en el journal; el corredor lo toma (o se lanza).
  despertadores = new Despertadores(getDb())
  const supervisor = durableChat
  const pulso = setInterval(() => {
    try { if (dispararVencidos(despertadores!, journal, logger) > 0) void supervisor.pump() }
    catch (error) { logger.error({ err: error }, 'despertadores: pulso') }
  }, Number(process.env.ARBRAIN_DESPERTADOR_TICK_MS ?? 2_000))
  pulso.unref()
  // Subagentes del motor (delegar): al terminar, despiertan a la conversación que los lanzó por el mismo
  // camino del despertador. ARBRAIN_AVISO_SUBAGENTES=0 lo apaga (reversa sin deploy).
  if (process.env.ARBRAIN_AVISO_SUBAGENTES !== '0') {
    let revisando = false
    const vigia = setInterval(() => {
      if (revisando) return
      revisando = true
      void (async () => {
        const { puertoMotor, revisarSubagentes, escalarACampana } = await import('./cabina/aviso-subagentes.js')
        const puerto = await puertoMotor((origen, texto) => {
          const aviso = despertadores!.avisar(origen, texto)
          logger.info({ aviso: aviso.id, conversationId: origen.conversationId }, 'subagente: aviso a su conversación')
        }, {
          // Preguntas al coordinador (5 oct 2026): la conversación de origen existe si el journal la conoce.
          origenExiste: o => !!journal.latest(o.owner, o.account, o.conversationId),
          escalar: async (sub, texto) => { logger.info({ agenteId: sub.id }, `subagente: pregunta sin atender, sube a ${DUENO}`); await escalarACampana(sub, texto) },
          alRescatar: l => logger.info({ rescatados: l.map(s => ({ id: s.id, nombre: s.nombre, conversationId: s.avisarA?.conversationId })) }, 'subagentes huérfanos rescatados del diario de turnos'),
        })
        if (await revisarSubagentes(puerto) > 0 && dispararVencidos(despertadores!, journal, logger) > 0) void supervisor.pump()
      })().catch(error => logger.warn({ err: error }, 'aviso de subagentes: pasada fallida')).finally(() => { revisando = false })
    }, Number(process.env.ARBRAIN_AVISO_SUBAGENTES_TICK_MS ?? 10_000))
    vigia.unref()
  }
  // Barrendero (6 oct 2026): apaga solo los huérfanos verificables que siguen huérfanos tras su gracia.
  // ARBRAIN_BARRENDERO=0 lo apaga (reversa sin deploy).
  if (process.env.ARBRAIN_BARRENDERO !== '0') {
    let barriendo = false
    const barrendero = setInterval(() => {
      if (barriendo) return
      barriendo = true
      void import('./cabina/barrendero.js').then(m => m.barrer(logger))
        .catch(error => logger.warn({ err: error }, 'barrendero: pasada fallida')).finally(() => { barriendo = false })
    }, Number(process.env.ARBRAIN_BARRENDERO_TICK_MS ?? 10 * 60_000))
    barrendero.unref()
  }
  return durableChat
}

/** La pregunta vive en este proceso (turno legado) o en un corredor: allí se releva por el journal. */
function answerChatQuestion(requestId: string, answers: Record<string, string> | null): boolean {
  if (answerCodexQuestion(requestId, answers) || answerUserQuestion(requestId, answers)) return true
  if (!CORREDOR) return false
  getDurableChat()
  return corredorRegistro!.relayAnswer(requestId, answers)
}

function streamDurableTurn(res: ServerResponse, turn: import('./chat-runtime/journal.js').TurnRecord, after = 0, restoreSnapshot = false): void {
  // Con corredor, los eventos los escribe otro proceso: el sondeo del journal ES la entrega en vivo.
  observeDurableTurn(res, getDurableChat(), turn, after, CORREDOR ? 100 : 1000, restoreSnapshot)
}

// ─── Status helpers ──────────────────────────────────────────────────────────

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-fable-5-1': 'Claude Fable 5.1',
  'claude-fable-5': 'Claude Fable 5',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-opus-5': 'Claude Opus 5',
  'claude-opus-4-8': 'Claude Opus 4.8',
  'claude-opus-4-7': 'Claude Opus 4.7',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  // Modelos de OpenAI (espacio codex): /model gpt-6-astra, etc.
  ...CODEX_MODEL_DISPLAY_NAMES,
}

// El SDK emite variantes con sufijo de contexto (ej. 'claude-opus-4-8[1m]').
// Para display y para matchear contra el catálogo curado, siempre el id base.
const modelBase = (id: string): string => id.replace(/\[[^\]]+\]$/, '')
const modelDisplay = (id: string): string => MODEL_DISPLAY_NAMES[modelBase(id)] ?? modelBase(id)

const claudeCatalog = getClaudeCatalog(PROJECT_ROOT)
const commandCatalog = getCommandCatalog()

const CRON_LABELS: Record<string, string> = {
  'gmail-cleanup': 'Gmail Cleanup',
  'morning-briefing': 'Morning Briefing v5',
  'metrics-snapshot': 'Metrics Snapshot',
  'business-council': 'Business Council v5',
  'monthly-review': 'Monthly Review',
  'system-council': 'System Council',
  'funnel-watchdog': 'Funnel Watchdog',
  'workspace-backup': 'Workspace Backup',
}

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${Math.round(n / 1_000)}K`
  : String(n)

function cronToHuman(cron: string): string {
  const parts = cron.split(/\s+/)
  if (parts.length < 5) return cron
  const [min, hour, dom, , dow] = parts
  const pad = (s: string) => s.padStart(2, '0')

  if (hour.startsWith('*/')) return `cada ${hour.slice(2)}h`
  if (min.startsWith('*/')) return `cada ${min.slice(2)}min`

  const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
  if (dow !== '*') return `${days[parseInt(dow)] ?? dow} ${pad(hour)}:${pad(min)}`
  if (dom !== '*') return `dia ${dom} del mes ${pad(hour)}:${pad(min)}`

  return `${pad(hour)}:${pad(min)} diario`
}

// ─── Slash command builders (/skills, /memory, /mcp, /todos) ────────────────

async function buildRuntimeInventoryText(kind: InventoryKind, owner: unknown, conversationId: string | null | undefined, selectedAccount: unknown): Promise<string> {
  const account = typeof selectedAccount === 'string' ? selectedAccount : 'default'
  const ownerId = typeof owner === 'string' && owner.trim() ? owner : undefined
  if (isCodexAccount(account)) {
    const nativeId = ownerId && conversationId ? getSession(`${ownerId}:${conversationId}::${account}`) : undefined
    return renderRuntimeInventory(await readCodexInventory(await codexRuntime().connection(account), PROJECT_ROOT, account, kind, nativeId))
  }
  const active = ownerId && conversationId ? claudeRuntimePool.inventoryReader({ owner: ownerId, account, conversationId }) : undefined
  return renderRuntimeInventory(await readClaudeInventory(PROJECT_ROOT, account, kind, active?.query, active?.isClosed))
}

function buildMemoryText(): string {
  const memoryFile = join(PROJECT_ROOT, '.claude', 'memory', 'MEMORY.md')
  if (!existsSync(memoryFile)) return '**Memoria:** MEMORY.md no encontrado.\n'
  try {
    const raw = readFileSync(memoryFile, 'utf-8')
    return raw.length > 4500 ? raw.slice(0, 4500) + '\n\n_…(truncado, ver `.claude/memory/MEMORY.md` completo)_' : raw
  } catch (err) {
    return `**Memoria:** error leyendo MEMORY.md (${String(err).slice(0, 80)})`
  }
}

/** `/goal …` (M7): objetivo persistente nativo del hilo OpenAI de ESTA conversación. */
async function buildGoalCommand(message: string, ownerId: unknown, chatSessionId: string | undefined, accountParam: unknown): Promise<string> {
  const account = typeof accountParam === 'string' && accountParam ? accountParam : 'default'
  const action = parseGoalCommand(message)
  if (action.action === 'help') return GOAL_HELP
  const owner = typeof ownerId === 'string' ? ownerId : null
  if (!owner || !chatSessionId) return GOAL_NO_THREAD
  const threadId = getSession(`${owner}:${chatSessionId}::${account}`) ?? getDurableChat().journal.latest(owner, account, chatSessionId)?.nativeThreadId ?? null
  if (!threadId) return GOAL_NO_THREAD
  const connection = await codexRuntime().connection(account)
  if (action.action === 'clear') { await connection.request('thread/goal/clear', { threadId }, 10_000); return '**Objetivo de esta conversación:** eliminado del hilo nativo.' }
  if (action.action === 'status') {
    const payload = await connection.request('thread/goal/get', { threadId }, 10_000).catch(() => null)
    return formatGoal(goalView(payload))
  }
  let params: Record<string, unknown>
  if (action.action === 'set') params = { threadId, objective: action.objective, status: 'active' }
  else {
    // Pause/resume keep the objective the runtime already holds; a status-only
    // update must not be mistaken for a new (empty) objective.
    const current = goalView(await connection.request('thread/goal/get', { threadId }, 10_000).catch(() => null))
    if (!current) return formatGoal(null)
    params = { threadId, objective: current.objective, status: action.action === 'pause' ? 'paused' : 'active' }
  }
  const payload = await connection.request('thread/goal/set', params, 10_000)
  return formatGoal(goalView(payload), action.action === 'set' ? 'Objetivo fijado en esta conversación' : action.action === 'pause' ? 'Objetivo en pausa' : 'Objetivo reanudado')
}

/** Niveles de esfuerzo que anuncia el modelo de la conversación (Codex: runtime; Claude: catálogo de la cuenta). */
async function effortLevelsFor(account: string, ov: { model?: string | null }): Promise<string[]> {
  if (isCodexAccount(account)) return (await codexRuntime().validateSelection(account, { model: codexCurrentModel(account, ov.model ?? null) })).supportedEfforts
  const catalog = await claudeCatalog.read(account)
  const model = findClaudeModel(catalog.models, ov.model ?? catalog.configuredModel)
  if (!model) throw new Error('Selecciona un modelo explícito antes de cambiar su esfuerzo; el default aún no está confirmado.')
  return model.supportedEffortLevels ?? []
}

/** `/status` de UNA conversación (M5): scope, último turno del journal y cuota real
 * del proveedor cuando la expone (OpenAI: `account/rateLimits/read`; Claude: no). */
async function buildConversationStatus(ownerId: unknown, chatSessionId: string | undefined, accountParam: unknown, ov: { model?: string | null; effort?: string | null; fast?: boolean | null; ultracode?: boolean | null }): Promise<string> {
  const account = typeof accountParam === 'string' && accountParam ? accountParam : 'default'
  const openai = isCodexAccount(account)
  const owner = typeof ownerId === 'string' ? ownerId : null
  const record = owner && chatSessionId ? getDurableChat().journal.latest(owner, account, chatSessionId) : null
  // The journal stores `{ cursor, state }`; the runtime usage lives in state.
  const stored = (record?.snapshot ?? null) as { state?: Record<string, unknown> } | Record<string, unknown> | null
  const snapshot = ((stored && 'state' in stored ? stored.state : stored) ?? null) as { usage?: Record<string, unknown> | null; servedModel?: string | null } | null
  const usage = snapshot?.usage ?? null
  let quota: StatusInput['quota']
  if (openai) {
    try {
      const connection = await codexRuntime().connection(account)
      const payload = await connection.request('account/rateLimits/read', {}, 8_000)
      const limits = rateLimitView(payload)
      quota = limits ? { state: 'available', limits } : { state: 'unavailable', reason: 'respuesta sin ventanas reconocibles' }
    } catch (err) {
      quota = { state: 'unavailable', reason: err instanceof Error ? err.message.slice(0, 160) : 'sin respuesta del runtime' }
    }
  } else {
    quota = { state: 'unsupported', reason: 'los límites del plan de Claude están en el panel de contexto de la barra de escribir (Límites del plan)' }
  }
  return buildChatStatus({
    account, engine: openai ? 'openai' : 'claude',
    controls: { model: ov.model ?? null, effort: ov.effort ?? null, fast: ov.fast ?? null, ultracode: ov.ultracode ?? null },
    configuredEffort: DEFAULT_CHAT_EFFORT,
    lastTurn: record ? { status: record.status, servedModel: snapshot?.servedModel ?? null, updatedAt: record.updatedAt ?? null, usage: usage ? { contextUsed: typeof usage.contextUsed === 'number' ? usage.contextUsed : null, contextTotal: typeof usage.contextTotal === 'number' ? usage.contextTotal : null, model: typeof usage.model === 'string' ? usage.model : null } : null } : null,
    quota,
    cronJobs: listTasks().filter(t => t.status === 'active' && !t.id.includes('-migrated')).map(t => `${CRON_LABELS[t.id] ?? t.id} — ${cronToHuman(t.schedule)}`),
  })
}

function buildStatusText(sessionKey: string, ov = getChatOverrides(sessionKey)): string {
  // Overrides POR CONVERSACIÓN: /status refleja el estado de ESTA conversación,
  // no un estado global del daemon (que ya no existe para model/effort/flags).
  const state = getModelState()
  const model = ov.model ?? state.default ?? state.resolved
  const modelDisplayName = model ? modelDisplay(model) : null
  const ctx = getContextInfo()
  const cronJobs = listTasks().filter(t => t.status === 'active' && !t.id.includes('-migrated'))

  let s = '**Estado de Levy**\n\n'

  // Model
  if (modelDisplayName && model) {
    s += `**Modelo:** ${modelDisplayName} (\`${model}\`)${ov.model ? ' — pick de esta conversación' : ''}\n`
  } else if (model) {
    s += `**Modelo:** \`${model}\`\n`
  } else {
    s += '**Modelo:** sin datos (envia un mensaje primero)\n'
  }

  // Reasoning effort
  s += `**Esfuerzo:** ${ov.effort ?? `${DEFAULT_CHAT_EFFORT} (por defecto)`}\n`

  // Flag settings de la conversación (SDK 0.3.201)
  s += `**Fast mode:** ${ov.fast ? 'ON (2.5x velocidad, 2x rate)' : 'off'}\n`
  s += `**Ultracode:** ${ov.ultracode ? 'ON (xhigh + workflows en cada turno)' : 'off (keyword "ultracode" activa por mensaje)'}\n`

  // Context window
  if (ctx.used != null && ctx.total != null) {
    const free = ctx.total - ctx.used
    const pctFree = Math.round((free / ctx.total) * 100)
    s += `**Contexto:** ~${fmtTokens(ctx.used)} / ${fmtTokens(ctx.total)} tokens (${pctFree}% libre)\n`
  } else if (ctx.used != null) {
    s += `**Contexto:** ~${fmtTokens(ctx.used)} tokens usados\n`
  } else {
    s += '**Contexto:** sin datos\n'
  }
  s += '\n'

  // Cron jobs
  s += `**${cronJobs.length} Cron Jobs Activos:**\n`
  cronJobs.forEach((cron, i) => {
    const label = CRON_LABELS[cron.id] ?? cron.id
    const sched = cronToHuman(cron.schedule)
    s += `${i + 1}. ${label} — ${sched}\n`
  })

  // Last completed cron
  const lastRun = listTasks()
    .filter(t => t.last_run && !t.id.includes('-migrated'))
    .sort((a, b) => (b.last_run ?? 0) - (a.last_run ?? 0))[0]
  if (lastRun) {
    const label = CRON_LABELS[lastRun.id] ?? lastRun.id
    const snippet = lastRun.last_result
      ? lastRun.last_result.slice(0, 80).replace(/\n/g, ' ')
      : 'sin resultado'
    s += `\n**Ultimo job:** ${label} → ${snippet}${(lastRun.last_result?.length ?? 0) > 80 ? '...' : ''}`
  }

  return s
}

function buildUsageText(): string {
  const fmtUsd = (n: number) => `$${n.toFixed(2)}`
  const d7 = getUsageSummary(Date.now() - 86_400_000 * 7)
  const d30 = getUsageSummary(Date.now() - 86_400_000 * 30)
  let s = '**Uso de Levy** (queries locales via ClaudeClaw)\n\n'
  s += '| Ventana | Costo | Input | Output | Queries |\n|---|---|---|---|---|\n'
  s += `| 7 dias | ${fmtUsd(d7.totalCostUsd)} | ${fmtTokens(d7.totalInputTokens)} | ${fmtTokens(d7.totalOutputTokens)} | ${d7.totalQueries} |\n`
  s += `| 30 dias | ${fmtUsd(d30.totalCostUsd)} | ${fmtTokens(d30.totalInputTokens)} | ${fmtTokens(d30.totalOutputTokens)} | ${d30.totalQueries} |\n`
  s += `\n_Duracion promedio (30d): ${(d30.avgDurationMs / 1000).toFixed(1)}s por query._`
  return s
}

// ─── Config ──────────────────────────────────────────────────────────────────

const env = readEnvFile(['OPENCLAW_GATEWAY_TOKEN', 'MC_SERVER_PORT', 'MISSION_CONTROL_ORIGIN'])
const MC_TOKEN = env['OPENCLAW_GATEWAY_TOKEN'] ?? ''
const PORT = parseInt(process.env.MC_SERVER_PORT ?? env['MC_SERVER_PORT'] ?? '3099', 10)
// Sin origen configurado, la instalación de Daniel cae a su app de Vercel. La edición cliente nunca: su app es la
// local (AUDITORIA I3); si no, las transcripciones y el token irían a un servidor de Daniel.
// Edición cliente (red team L1): el origen es obligatorio (el arranque sale con 78 si falta); jamás un puerto por defecto.
const ALLOWED_ORIGIN = env['MISSION_CONTROL_ORIGIN'] ?? (esEdicionCliente() ? '' : instalacionOriginal().origen_respaldo ?? 'http://127.0.0.1:3300')

if (!MC_TOKEN) {
  console.error('FATAL: OPENCLAW_GATEWAY_TOKEN is not set. Server will reject all requests.')
}

/** Transcripciones del CLI de la cuenta default: en la edición cliente, su carpeta aislada (CLAUDE_CONFIG_DIR). */
function proyectosClaudeDefault(): string {
  return esEdicionCliente() && process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, 'projects') : join(homedir(), '.claude', 'projects')
}

/** ¿Este turno va a Claude (y no a Codex ni a una cuenta de API por OpenRouter)? */
function esCuentaClaude(account: unknown): boolean {
  const a = typeof account === 'string' ? account : undefined
  return !isCodexAccount(a) && !esCuentaApi(a)
}

/** Apagado limpio pedido por la app (contrato §5; en Windows kill no entrega SIGTERM). Lo pone index.ts. */
let apagarDaemon: (() => void) | null = null
export function alPedirApagado(fn: () => void): void { apagarDaemon = fn }

function isTokenValid(provided: string): boolean {
  if (!MC_TOKEN) return false
  if (provided.length !== MC_TOKEN.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(MC_TOKEN))
}

// Default session key for web chat when no chatSessionId provided (legacy)
const SESSION_KEY = 'mc-web'

// Active streams indexed by sessionKey (multi-session support).
// sessionKey = chatSessionId del frontend (Mission Control Supabase UUID), o SESSION_KEY ('mc-web')
// para clientes legacy. Permite interrumpir solo la sesion target sin afectar otras en vuelo.
interface ActiveStream {
  query: Query | null
  ac: AbortController
  interrupted: boolean
  clientConnected: boolean
}
const activeStreams = new Map<string, ActiveStream>()

// ── ACK de turnos (entrega garantizada, jul 2026) ──
// Inversión del diseño viejo: NO detectamos desconexiones (imposible con
// sockets half-open de iOS + buffers de Vercel/ngrok — clientWasConnected fue
// true en 49/49 webhooks históricos). El cliente manda POST /chat/ack DESPUÉS
// de guardar el turno en Supabase; el daemon espera ese ACK ≤5s al completar.
// ACK → cliente vivo y turno guardado (no re-guardar, no push).
// Sin ACK → asumir desconexión: MC persiste server-side y pushea si es móvil.
const ackedTurns = new Map<string, number>() // turnId → ts (GC por edad)
const ackWaiters = new Map<string, () => void>()

function markTurnAcked(turnId: string): void {
  ackedTurns.set(turnId, Date.now())
  const waiter = ackWaiters.get(turnId)
  if (waiter) {
    ackWaiters.delete(turnId)
    waiter()
  }
  // GC: mantener el map chico (ACKs de más de 1h ya no le importan a nadie)
  if (ackedTurns.size > 500) {
    const cutoff = Date.now() - 3600_000
    for (const [k, ts] of ackedTurns) {
      if (ts < cutoff) ackedTurns.delete(k)
    }
  }
}

function waitForAck(turnId: string, timeoutMs: number): Promise<boolean> {
  if (ackedTurns.has(turnId)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ackWaiters.delete(turnId)
      resolve(false)
    }, timeoutMs)
    ackWaiters.set(turnId, () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

// ── Turnos vivos (resume estilo Anthropic, jul 2026) ──
// Mientras un turno streamea, CADA evento SSE se registra en un buffer por
// sessionKey. Un cliente que reabre la app a mitad del streaming pega a
// POST /chat/live: recibe un replay síncrono del buffer (reconstruye el estado
// completo: deltas, tools, thinking) y queda suscrito al tail en vivo — el
// streaming "continúa como si nada, justo donde va". Al terminar el turno el
// buffer se destruye (la verdad ya vive en Supabase/transcript).
interface LiveTurn {
  turnId: string | null
  userMessage: string
  audioUrl: string | null
  imageUrl: string | null
  startedAt: number
  lines: string[] // payloads JSON ya serializados (sin el prefijo "data: ")
  subscribers: Set<ServerResponse>
  done: boolean
}
const liveTurns = new Map<string, LiveTurn>()
const LIVE_TURN_MAX_LINES = 20_000 // ~turnos gigantes; pasado esto el resume pierde el head (solo replay parcial)

// Cache for listSessions (disk I/O is expensive, especially on mobile network).
// TEMPORAL (2026-07-08): keyed por cuenta ('default' | 'bro') — cada espacio tiene
// su propio pool de transcripts en disco (~/.claude vs la carpeta de la alterna).
const sessionsCache = new Map<string, { data: unknown[]; ts: number }>()
const SESSIONS_CACHE_TTL = 60_000 // 60 seconds
// Cuántos transcripts escanear del pool ANTES de filtrar por kind. Los crons
// nocturnos generan ~30 sesiones/día: con el limit chico del cliente, una
// conversación real de ayer quedaba enterrada fuera de la ventana (incidente
// 13 jul: la conv de las estaciones de Beer quedó en posición 62).
const SESSIONS_POOL_SCAN = 150

// ─── Enriquecimiento de sesiones: kind + lastMessageAt ────────────────────────
//
// El sidebar ordenaba por mtime del transcript, pero Claude Code CLI reescribe
// bookkeeping (queue-operation / last-prompt) en archivos VIEJOS al operar el
// pool → el mtime miente ("hace 17 minutos" en conversaciones de ayer).
// lastMessageAt = timestamp del último turno user/assistant REAL del transcript
// (tail read de 64KB, cacheado por mtime — barato incluso con 150 archivos).

type SessionKind = 'cron' | 'background' | 'chat'

// Crons del scheduler siempre abren con `🤖 [job-id]` (scheduler.ts). El resto
// de ruido: compile hook nocturno, extracción de memoria del CLI, y sesiones
// que solo corrieron un slash-command.
const CRON_PROMPT_RE = /^🤖\s*\[/
const BACKGROUND_PROMPT_RE = /^(You are a knowledge base compiler|Review this conversation excerpt|Caveat: the messages below|\/(model|compact|effort|status|context|usage|clear)\b)/

function classifySessionKind(firstPrompt: unknown): SessionKind {
  const head = typeof firstPrompt === 'string' ? firstPrompt.trimStart() : ''
  if (CRON_PROMPT_RE.test(head)) return 'cron'
  if (BACKGROUND_PROMPT_RE.test(head)) return 'background'
  return 'chat'
}

const lastMessageAtCache = new Map<string, { mtimeMs: number; ts: string | null }>()
const TAIL_READ_BYTES = 64 * 1024

function transcriptPath(sessionId: string, account?: string): string {
  const configDir = configDirForAccount(account) ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  // Claude Code munge del project dir: separadores y puntos → '-'
  const munged = PROJECT_ROOT.replace(/[/.]/g, '-')
  return join(configDir, 'projects', munged, `${sessionId}.jsonl`)
}

function readLastMessageAt(sessionId: string, account?: string): string | null {
  const file = transcriptPath(sessionId, account)
  try {
    const st = statSync(file)
    const cached = lastMessageAtCache.get(file)
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.ts
    const fd = openSync(file, 'r')
    let ts: string | null = null
    try {
      const readLen = Math.min(st.size, TAIL_READ_BYTES)
      const buf = Buffer.alloc(readLen)
      readSync(fd, buf, 0, readLen, st.size - readLen)
      const lines = buf.toString('utf-8').split('\n')
      for (let i = lines.length - 1; i >= 0 && !ts; i--) {
        const line = lines[i].trim()
        if (!line) continue
        try {
          const entry = JSON.parse(line) as { type?: string; timestamp?: string }
          if ((entry.type === 'user' || entry.type === 'assistant') && entry.timestamp) ts = entry.timestamp
        } catch { /* línea partida al inicio del tail — seguir */ }
      }
    } finally {
      closeSync(fd)
    }
    lastMessageAtCache.set(file, { mtimeMs: st.mtimeMs, ts })
    return ts
  } catch {
    return null
  }
}

// TEMPORAL (2026-07-08): correr una lectura del SDK (listSessions/getSessionMessages)
// bajo el config dir de una cuenta alterna. El SDK resuelve el pool desde
// process.env.CLAUDE_CONFIG_DIR por-llamada (verificado), así que lo seteamos
// alrededor de la lectura y lo restauramos. Es SOLO-LECTURA (no toca billing: el
// path de query() usa env explícito, nunca process.env) y va serializado por un
// mutex para que dos lecturas de cuentas distintas no se pisen el env global.
let configDirMutex: Promise<unknown> = Promise.resolve()
function withAccountConfigDir<T>(account: string | undefined, fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const dir = configDirForAccount(account)
    const prev = process.env.CLAUDE_CONFIG_DIR
    if (dir) process.env.CLAUDE_CONFIG_DIR = dir
    else delete process.env.CLAUDE_CONFIG_DIR
    try {
      return await fn()
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = prev
    }
  }
  const result = configDirMutex.then(run, run)
  configDirMutex = result.catch(() => {})
  return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setCORSHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function sendJSON(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
  })
}

// ─── /fs/* — lectura del filesystem para la Vista Chip de SFTerm ─────────────
// Read-only. Confinado a $HOME via realpath (symlinks que apuntan fuera se
// rechazan). list = un nivel (shape DirEntryInfo de SFTerm) · read = contenido
// (texto, o base64 si binario) · index = archivos del repo gitignore-aware.

const FS_TEXT_CAP = 1_500_000 // bytes servidos por /fs/read

function fsResolveSafe(raw: string | null): string | null {
  if (!raw) return null
  const expanded = raw === '~' ? homedir() : raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw
  try {
    const real = realpathSync(expanded)
    // Edición cliente (AUDITORIA I6): solo el workspace y nunca secretos. Daniel: $HOME como siempre (fs-acceso.ts).
    let workspace = PROJECT_ROOT
    try { workspace = realpathSync(PROJECT_ROOT) } catch { /* sin realpath: la ruta tal cual */ }
    return motivoFsRechazo(real, { home: homedir(), cliente: esEdicionCliente(), workspace }) ? null : real
  } catch {
    return null
  }
}

function gitLsFiles(root: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'],
      { maxBuffer: 16_000_000, timeout: 8000 },
      (err, stdout) => resolve(err ? [] : stdout.split('\n').filter(Boolean).slice(0, 25_000)),
    )
  })
}

// ─── Rutas de la edición cliente (contrato §5-§7) ─────────────────────────────

/** Atiende /apagar, /confirmaciones/*, /manos/interruptor y /cohorte/*. Devuelve true si respondió. Ya pasó el Bearer. */
async function rutasCliente(req: IncomingMessage, res: ServerResponse, ruta: string, cuerpo: Record<string, unknown>): Promise<boolean> {
  const secretoApp = () => secretoConfirmarValido(req.headers['x-arbrain-confirmar'])
  // Rutinas del alumno (T8, 29 oct 2026): la pestaña Rutinas del Taller y Levy con su pase (cliente/rutinas.ts).
  if (ruta === '/schedule' || ruta.startsWith('/schedule/')) {
    const { atenderRutinas } = await import('./cliente/rutinas.js')
    const conPase = !isTokenValid((req.headers['authorization'] ?? '').replace('Bearer ', ''))
    const r = atenderRutinas(req.method, ruta, cuerpo, { conPase })
    if (r) { sendJSON(res, r.status, r.cuerpo); return true }
  }
  // Taller › Computadora (T16, 29 oct 2026): memoria, disco, procesador, reposo y cerrar apps (cliente/computadora.ts).
  // Solo la app: el pase no abre `/computadora*` (cofre.ts) y cerrar o forzar exigen además su secreto.
  if (ruta === '/computadora' || ruta.startsWith('/computadora/')) {
    const { atenderComputadora, depsReales } = await import('./cliente/computadora.js')
    const deps = depsReales(
      () => { try { return listTasks().some(t => t.status === 'active' && !t.id.endsWith('-migrated')) } catch { return false } },
      (que, motivo) => bitacoraDelDaemon()?.anotar({ herramienta: 'Computadora', que, decision: 'confirmado', motivo }),
    )
    const r = await atenderComputadora(req.method, ruta, cuerpo, { secretoApp: secretoApp(), deps })
    if (r) { sendJSON(res, r.status, r.cuerpo); return true }
  }
  if (req.method === 'POST' && ruta === '/apagar') {
    sendJSON(res, 200, { ok: true })
    setTimeout(() => { if (apagarDaemon) apagarDaemon(); else process.exit(0) }, 50)
    return true
  }
  if (req.method === 'POST' && ruta === '/llaves/probar') {
    // «Probar conexión» (contrato §4): un turno mínimo, sin herramientas ni sesión, con la llave que tiene el daemon.
    const { probarLlave } = await import('./cliente/probar-llave.js')
    sendJSON(res, 200, await probarLlave({ cwd: process.env.ARBRAIN_DATA_DIR || PROJECT_ROOT }))
    return true
  }
  if (req.method === 'GET' && ruta === '/llaves/suscripcion') {
    // Motor «Mi Claude Code» (cliente/suscripcion.ts): ¿hay `claude` con sesión de suscripción? Solo método y plan;
    // ni correo ni token. `?fresco=1` = «Revisar de nuevo» o el regreso del inicio de sesión. 22 oct 2026 (prueba en
    // Windows, «sácame del medio»): sin llave y con sesión, se conecta solo aquí mismo, sin preguntar ni reiniciar.
    const { activarSuscripcionEnCaliente, detectarCodex, detectarSuscripcion, estadoLogin, leerMotorElegido } = await import('./cliente/suscripcion.js')
    const fresco = /[?&]fresco=1\b/.test(req.url ?? '')
    const configDir = process.env.ARBRAIN_CONFIG_DIR
    const d = await detectarSuscripcion({ fresco })
    let elegido = leerMotorElegido(configDir)
    if (d.sesion && !d.activo && elegido !== 'llave' && activarSuscripcionEnCaliente(configDir, faltaLlaveClaude())) { d.activo = true; elegido = 'suscripcion' }
    const codex = d.sesion ? undefined : await detectarCodex({ fresco }).catch(() => undefined)
    sendJSON(res, 200, { ...d, elegido, login: estadoLogin(), ...(codex ? { codex } : {}) })
    return true
  }
  if (req.method === 'POST' && ruta === '/llaves/suscripcion/login') {
    // Botón «Iniciar sesión con Claude»: el login OFICIAL del CLI (instala Claude Code antes si falta). Arbrain no ve
    // la página, el código ni el token; al terminar, si no hay llave, se conecta solo.
    if (!secretoApp()) { sendJSON(res, 403, { error: 'Solo la app puede iniciar sesión.' }); return true }
    const { conectarSuscripcionSiHay, iniciarSesionClaude } = await import('./cliente/suscripcion.js')
    const configDir = process.env.ARBRAIN_CONFIG_DIR
    const login = iniciarSesionClaude({ alTerminar: () => { void conectarSuscripcionSiHay({ sinLlave: faltaLlaveClaude(), configDir, fresco: true }).catch(() => {}) } })
    sendJSON(res, login.estado === 'fallo' ? 409 : 202, { login })
    return true
  }
  if (req.method === 'POST' && ruta === '/llaves/motor') {
    // Elegir el motor del chat. Se aplica al reiniciar el daemon (la app lo reinicia al recibir `reiniciar: true`).
    const { detectarSuscripcion, guardarMotorElegido } = await import('./cliente/suscripcion.js')
    const motor = cuerpo.motor
    if (motor !== 'suscripcion' && motor !== 'llave') { sendJSON(res, 400, { error: 'motor debe ser «suscripcion» o «llave»' }); return true }
    if (motor === 'suscripcion') {
      const d = await detectarSuscripcion({ fresco: true })
      if (!d.sesion) { sendJSON(res, 409, { error: d.mensaje ?? 'Tu Claude Code no tiene sesión iniciada.', code: d.code ?? 'sin_sesion', estado: d }); return true }
    }
    const dir = process.env.ARBRAIN_CONFIG_DIR
    if (!dir) { sendJSON(res, 500, { error: 'Falta la carpeta de configuración del daemon.' }); return true }
    // Sin llave no hay vía de API que quitar: se aplica en caliente y la pantalla no reinicia el daemon.
    const { activarSuscripcionEnCaliente } = await import('./cliente/suscripcion.js')
    if (motor === 'suscripcion' && activarSuscripcionEnCaliente(dir, faltaLlaveClaude())) { sendJSON(res, 200, { ok: true, motor, reiniciar: false }); return true }
    guardarMotorElegido(dir, motor)
    sendJSON(res, 200, { ok: true, motor, reiniciar: true })
    return true
  }
  if (req.method === 'POST' && ruta === '/voz/probar') {
    // Ajustes › Voz (21 oct 2026): ¿la llave de Groq que entregó la app funciona? Solo la app (el pase no abre esta ruta).
    sendJSON(res, 200, await probarLlaveVoz(llaveVoz()))
    return true
  }
  if (ruta === '/permisos/reglas' || ruta === '/permisos/reglas/quitar') {
    // «Siempre este patrón»: visibles y revocables en Ajustes › Permisos. Solo la app (un agente no se quita ni se pone reglas).
    if (!secretoApp()) { sendJSON(res, 403, { error: 'Solo la app puede ver o quitar reglas.' }); return true }
    if (req.method === 'GET' && ruta === '/permisos/reglas') { sendJSON(res, 200, listarReglas()); return true }
    if (req.method === 'POST' && ruta === '/permisos/reglas/quitar') { const r = revocarRegla(cuerpo.id); sendJSON(res, r.status, r.ok ? { ok: true, ...listarReglas() } : { error: r.error }); return true }
    sendJSON(res, 404, { error: 'Ruta desconocida.' })
    return true
  }
  if (ruta === '/confirmaciones' || ruta.startsWith('/confirmaciones/')) {
    const store = confirmacionesDelDaemon()
    if (!store) { sendJSON(res, 503, { error: 'Confirmaciones no iniciadas.' }); return true }
    if (req.method === 'GET' && ruta === '/confirmaciones') { sendJSON(res, 200, { pendientes: store.pendientes(), terminadas: store.terminadas(), sandbox: sandboxActivo() }); return true }
    if (req.method === 'POST' && ruta === '/confirmaciones/resolver') {
      if (!secretoApp()) { sendJSON(res, 403, { error: 'Solo la app puede resolver una confirmación.' }); return true }
      // Botón Play: comentario, «Siempre este patrón» y «Córrelo tú» (cliente/tarjeta.ts).
      const r = await resolverTarjeta(store, cuerpo, () => ({ motor: motorPty, cwd: process.env.ARBRAIN_HOME || PROJECT_ROOT, registrar: e => logger.info(e, 'córrelo tú') }))
      sendJSON(res, r.ok ? 200 : r.status, r.ok ? { ...r.confirmacion, ...(r.regla ? { regla: r.regla } : {}) } : { error: r.error })
      return true
    }
    if (req.method === 'POST' && (ruta === '/confirmaciones/pedir' || ruta === '/confirmaciones/consumir') && (!computerUseDisponible() || (esEdicionCliente() && !computerUseEncendido()))) {
      // El único que pide es el MCP de manos. Sin computer use (Linux) o con el interruptor apagado, nadie fabrica
      // diálogos «Levy usando tu computadora» (un agente con el pase podía llenar la pantalla de pendientes falsos).
      sendJSON(res, 403, { error: computerUseDisponible() ? 'Computer use está apagado.' : 'Computer use no está disponible en este sistema.', code: computerUseDisponible() ? 'apagado' : 'no_disponible' })
      return true
    }
    if (req.method === 'POST' && ruta === '/confirmaciones/encolar') {
      // A3 (0.2.15): el proceso de manos dejó de esperar su pendiente; pasa a la cola de la persona («Mientras no
      // estabas») en vez de vencer. Solo la propia pendiente de manos; con el pase basta (no aprueba nada).
      const id = typeof cuerpo.id === 'string' && /^cf_[0-9a-f]{12}$/.test(cuerpo.id) ? cuerpo.id : null
      const c = id ? store.get(id) : null
      if (!c || c.origen !== 'manos') { sendJSON(res, 404, { error: 'No existe esa confirmación de manos.' }); return true }
      sendJSON(res, 200, store.encolar(id!) ?? c)
      return true
    }
    if (req.method === 'POST' && (ruta === '/confirmaciones/pedir' || ruta === '/confirmaciones/consumir')) {
      // Contrato v3 (red team C2): por HTTP solo llega la acción estructurada de manos; el daemon calcula el literal
      // que ve la persona y la huella (espacio `manos:`). Un resumen, detalle, origen o huella del que pide se ignora.
      const p = pedidoManos(cuerpo)
      if ('error' in p) { sendJSON(res, p.status, { error: p.error }); return true }
      if (ruta === '/confirmaciones/consumir') { sendJSON(res, 200, { ok: store.consumir(p.huella) }); return true }
      sendJSON(res, 200, store.pedir({ origen: 'manos', categoria: p.categoria, resumen: p.resumen, detalle: p.detalle, literal: p.literal, herramienta: p.herramienta, huella: p.huella, creadaPor: 'peticion' }))
      return true
    }
    const m = ruta.match(/^\/confirmaciones\/(cf_[0-9a-f]{12})$/)
    if (req.method === 'GET' && m) { const c = store.get(m[1]); sendJSON(res, c ? 200 : 404, c ?? { error: 'No existe esa confirmación.' }); return true }
    sendJSON(res, 404, { error: 'Ruta desconocida.' })
    return true
  }
  if (req.method === 'GET' && ruta === '/manos/estado') {
    // M1: lo que el proceso de manos necesita saber (interruptor y voz de la persona). Con el pase: es solo lectura.
    // Linux cliente: sin computer use, siempre apagado y sin voz.
    sendJSON(res, 200, computerUseDisponible() ? estadoParaManos() : { encendido: false, voz: [], disponible: false })
    return true
  }
  if (ruta === '/manos/interruptor' && !computerUseDisponible()) {
    // Linux cliente: no hay interruptor. Leer dice «apagado, no disponible»; cualquier POST, 403.
    if (req.method === 'GET') { sendJSON(res, 200, { encendido: false, disponible: false, decision: null }); return true }
    sendJSON(res, 403, { error: 'Computer use no está disponible en este sistema.', code: 'no_disponible' })
    return true
  }
  if (ruta === '/manos/interruptor') {
    // M1: computer use se enciende solo desde la app (Bearer del daemon + secreto de confirmar); el pase recibe 403
    // antes de llegar aquí (rutaSoloApp). Leer el estado es libre.
    const { leerInterruptor, fijarInterruptor } = await import('./manos/politica.js')
    if (req.method === 'GET') { sendJSON(res, 200, { encendido: computerUseEncendido(), disponible: true, decision: leerInterruptor() }); return true }
    if (req.method === 'POST') {
      if (typeof cuerpo.encendido !== 'boolean') { sendJSON(res, 400, { error: 'encendido (boolean) requerido.' }); return true }
      if (cuerpo.encendido && !secretoApp()) { sendJSON(res, 403, { error: 'Solo la persona, desde la app, puede encender computer use.' }); return true }
      sendJSON(res, 200, { encendido: fijarInterruptor(cuerpo.encendido, 'app').encendido })
      return true
    }
  }
  // «Lo que hizo Levy» y «Pausar todo» (seguridad del alumno, 12 oct 2026). Solo la app (el pase recibe 403 antes).
  if (req.method === 'GET' && ruta === '/bitacora') {
    const b = bitacoraDelDaemon()
    if (!b) { sendJSON(res, 503, { error: 'Bitácora no iniciada.' }); return true }
    const limite = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('limite') ?? 200)
    sendJSON(res, 200, { acciones: b.ultimas(limite), pausa: estadoPausa() })
    return true
  }
  // Modo de permisos (grupal 23 oct 2026; Autónomo con consentimiento, 0.2.15, 29 oct 2026): solo la persona, desde la
  // app. Volver a «preguntar» o retirar el consentimiento (más estricto) no exige el secreto; aflojar sí (el agente nunca
  // se da permisos a sí mismo). «autonomo» exige además la aceptación del texto empaquetado (`acepto: { version, sha256 }`
  // con la versión y la huella que la app recibió en el GET) o un consentimiento vigente ya guardado. Cada aceptación,
  // retiro y cambio queda con fecha en `permisos.json` (historialModo, sin poda) y en «Lo que hizo Levy».
  if (ruta === '/permisos') {
    const { cambiarModoPermisos, cerrarMigracion, esModo, estadoPermisos, guardarMisDatos, MODOS, NOMBRE_MODO, retirarConsentimiento } = await import('./cliente/modo-permisos.js')
    const { textoAutonomia } = await import('./cliente/consentimiento-autonomia.js')
    const { avisosPermisos } = await import('./cliente/avisos-permisos.js')
    const respuesta = () => {
      const e = estadoPermisos()
      return { modo: e.modo, modos: MODOS, sandbox: sandboxActivo(), consentimiento: e.consentimiento, reaceptar: e.reaceptar, migracion: e.migracion, historialModo: e.historialModo.slice(-20), texto: textoAutonomia(), avisos: avisosPermisos(), misDatos: e.misDatos }
    }
    const anotar = (que: string, motivo?: string) => bitacoraDelDaemon()?.anotar({ herramienta: 'Arbrain', decision: 'confirmado', que, ...(motivo ? { motivo } : {}) })
    if (req.method === 'GET') { sendJSON(res, 200, respuesta()); return true }
    if (req.method === 'POST' && cuerpo.retirar === true) {
      const antes = estadoPermisos()
      const r = retirarConsentimiento({ via: cuerpo.via })
      if (r.ok && r.cambio) anotar(`Consentimiento del modo «${NOMBRE_MODO.autonomo}» retirado (${antes.consentimiento ? `texto ${antes.consentimiento.version}` : 'sin texto guardado'}): Levy queda en «${NOMBRE_MODO.carpeta}»`)
      sendJSON(res, r.ok ? 200 : r.status, r.ok ? respuesta() : { error: r.error })
      return true
    }
    if (req.method === 'POST' && cuerpo.misDatos !== undefined) {
      // A13: un destino «propio» deja pasar envíos sin tarjeta R6; solo la persona desde la app lo guarda, nunca un agente.
      if (!secretoApp()) { sendJSON(res, 403, { error: 'Solo la persona, desde la app, puede guardar sus datos.' }); return true }
      const r = guardarMisDatos(cuerpo.misDatos)
      if (!r.ok) { sendJSON(res, 400, { error: r.error }); return true }
      anotar(`Tus datos para mandarte mensajes: ${r.estado.misDatos.telefono ? 'teléfono guardado' : 'sin teléfono'}, ${r.estado.misDatos.correo ? 'correo guardado' : 'sin correo'}`)
      sendJSON(res, 200, respuesta())
      return true
    }
    if (req.method === 'POST' && cuerpo.decidirDespues === true) {
      cerrarMigracion()
      sendJSON(res, 200, respuesta())
      return true
    }
    if (req.method === 'POST') {
      if (!esModo(cuerpo.modo)) { sendJSON(res, 400, { error: 'modo: «preguntar», «carpeta» o «autonomo».' }); return true }
      if (cuerpo.modo !== 'preguntar' && !secretoApp()) { sendJSON(res, 403, { error: 'Solo la persona, desde la app, puede cambiar los permisos de Levy.' }); return true }
      const antes = estadoPermisos()
      const acepto = cuerpo.acepto && typeof cuerpo.acepto === 'object' ? cuerpo.acepto as Record<string, unknown> : null
      const r = cambiarModoPermisos(cuerpo.modo, { via: cuerpo.via, ...(acepto ? { acepto: { version: acepto.version, sha256: acepto.sha256, app: cuerpo.app, so: process.platform } } : {}) })
      if (!r.ok) { sendJSON(res, r.status, { error: r.error, code: r.code, texto: textoAutonomia() }); return true }
      const e = r.estado
      if (acepto && e.consentimiento && e.modo === 'autonomo') anotar(`Modo «${NOMBRE_MODO.autonomo}» aceptado (texto ${e.consentimiento.version}, huella ${e.consentimiento.sha256.slice(0, 12)}…, Arbrain ${e.consentimiento.app || '?'}, ${e.consentimiento.so}, por ${e.consentimiento.via}): Levy actúa sin pedir clic salvo la red mínima (dinero, secretos, su gobierno, borrados masivos, envíos masivos y destinos no pedidos tras leer afuera)`)
      else if (antes.modo !== e.modo) anotar(`Permisos de Levy: «${NOMBRE_MODO[antes.modo]}» → «${NOMBRE_MODO[e.modo]}»${typeof cuerpo.via === 'string' ? ` (desde ${cuerpo.via})` : ''}`)
      sendJSON(res, 200, respuesta())
      return true
    }
  }
  // Carpetas abiertas (punto 1): la persona abre carpetas extra una por una (con el secreto de la app); cerrar es libre.
  if (ruta === '/carpetas') {
    if (req.method === 'GET') { sendJSON(res, 200, { carpetas: carpetasAbiertas() }); return true }
    if (req.method === 'POST' && cuerpo.accion === 'abrir') {
      if (!secretoApp()) { sendJSON(res, 403, { error: 'Solo la persona, desde la app, puede abrir una carpeta.' }); return true }
      const ctx = contextoPolitica()
      const r = abrirCarpeta(cuerpo.ruta, { usuario: ctx.usuario, home: ctx.home, protegidas: ctx.protegidas, motivoSecreto: real => motivoRutaSecreta(real, { ...ctx, lecturaExtra: [] }) })
      if (r.ok) bitacoraDelDaemon()?.anotar({ herramienta: 'Arbrain', que: `Abrir carpeta para Levy: ${String(cuerpo.ruta)}`, decision: 'confirmado' })
      sendJSON(res, r.ok ? 200 : 400, r.ok ? { carpetas: r.carpetas } : { error: r.error })
      return true
    }
    if (req.method === 'POST' && cuerpo.accion === 'cerrar') {
      const carpetas = cerrarCarpeta(cuerpo.ruta)
      bitacoraDelDaemon()?.anotar({ herramienta: 'Arbrain', que: `Cerrar carpeta: ${String(cuerpo.ruta)}`, decision: 'hecho' })
      sendJSON(res, 200, { carpetas })
      return true
    }
    sendJSON(res, 400, { error: 'accion: «abrir» o «cerrar».' })
    return true
  }
  // Tope de gasto (punto 3): lo que el proveedor deja ver con la llave del alumno (OpenRouter /api/v1/key).
  if (req.method === 'GET' && ruta === '/gasto') {
    const { consultarGasto } = await import('./cliente/gasto.js')
    sendJSON(res, 200, await consultarGasto())
    return true
  }
  if (ruta === '/pausa') {
    if (req.method === 'GET') { sendJSON(res, 200, estadoPausa()); return true }
    if (req.method === 'POST') {
      if (typeof cuerpo.pausado !== 'boolean') { sendJSON(res, 400, { error: 'pausado (boolean) requerido.' }); return true }
      if (cuerpo.pausado) {
        const detenidos = pausar()
        bitacoraDelDaemon()?.anotar({ herramienta: 'Arbrain', que: `Pausar todo (${detenidos} en curso detenidos)`, decision: 'pausado' })
        sendJSON(res, 200, { ...estadoPausa(), detenidos })
        return true
      }
      // Reanudar es de la persona (secreto de la app), nunca de un agente.
      if (!secretoApp()) { sendJSON(res, 403, { error: 'Solo la persona, desde la app, puede reanudar.' }); return true }
      reanudar()
      bitacoraDelDaemon()?.anotar({ herramienta: 'Arbrain', que: 'Reanudar', decision: 'hecho' })
      sendJSON(res, 200, estadoPausa())
      return true
    }
  }
  // Conectar con arbrain.ai (puente de seguimiento, 21 oct 2026). Solo la app (el pase recibe 403 antes). Conectar y
  // ajustar exigen el secreto de la app (el modelo no puede activarlo); desconectar, cualquiera.
  if (ruta === '/progreso' || ruta.startsWith('/progreso/')) {
    const p = progresoDelDaemon()
    if (!p) { sendJSON(res, 503, { error: 'Conexión con arbrain.ai no iniciada.' }); return true }
    if (req.method === 'GET' && ruta === '/progreso') { sendJSON(res, 200, p.resumen()); return true }
    if (req.method === 'POST' && ruta === '/progreso/desconectar') { p.desconectar(); sendJSON(res, 200, p.resumen()); return true }
    if (req.method === 'POST' && (ruta === '/progreso/conectar' || ruta === '/progreso/ajustes' || ruta === '/progreso/enviar')) {
      if (!secretoApp()) { sendJSON(res, 403, { error: 'Solo la persona, desde la app, puede conectar o enviar.' }); return true }
      // «Enviar ahora» también trae el expediente (en paralelo: los dos plazos caben en el de la ruta).
      if (ruta === '/progreso/enviar') { const [r, e, k] = await Promise.all([p.enviar(true), p.traerExpediente(true), p.traerCamino(true)]); sendJSON(res, 200, { ...r, expediente_ahora: e.resultado, camino_ahora: k.resultado, ...p.resumen() }); return true }
      const r = ruta === '/progreso/conectar' ? p.conectar(cuerpo.token, cuerpo.url, cuerpo.compartir_texto) : p.ajustes(cuerpo)
      // Al conectar, su Levy trae su expediente en segundo plano (expediente.ts).
      if (r.ok && ruta === '/progreso/conectar') {
        void p.traerExpediente(true).then(e => logger.info({ resultado: e.resultado }, 'progreso: expediente al conectar'))
        // Y dónde va en su camino del programa (camino.ts).
        void p.traerCamino(true).then(k => logger.info({ resultado: k.resultado }, 'progreso: camino al conectar'))
      }
      sendJSON(res, r.ok ? 200 : 400, r.ok ? p.resumen() : { error: r.error })
      return true
    }
    sendJSON(res, 404, { error: 'Ruta desconocida.' })
    return true
  }
  if (ruta === '/cohorte' || ruta.startsWith('/cohorte/')) {
    const c = cohorteDelDaemon()
    if (!c) { sendJSON(res, 503, { error: 'Cohorte no iniciada.' }); return true }
    if (req.method === 'GET' && ruta === '/cohorte') { sendJSON(res, 200, c.resumen()); return true }
    if (req.method === 'POST' && ruta === '/cohorte/consentimiento') {
      const acepto = cuerpo.acepto === true
      // Dar el consentimiento es de la persona (secreto de la app); quitarlo, de cualquiera.
      if (acepto && !secretoApp()) { sendJSON(res, 403, { error: 'Solo la persona, desde la app, puede dar su consentimiento.' }); return true }
      c.fijarConsentimiento(acepto)
      if (acepto) void c.enviar().then(r => logger.info({ resultado: r }, 'cohorte: envío tras consentimiento'))
      sendJSON(res, 200, c.resumen())
      return true
    }
    if (req.method === 'POST' && ruta === '/cohorte/venta') {
      const r = c.registrarVenta(cuerpo.tipo, cuerpo.monto, cuerpo.moneda)
      sendJSON(res, r.ok ? 200 : 400, r.ok ? r : { error: r.error })
      return true
    }
    sendJSON(res, 404, { error: 'Ruta desconocida.' })
    return true
  }
  return false
}

// ─── Request handler ─────────────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCORSHeaders(res)
  // Seguridad del alumno (12 oct 2026): contra DNS rebinding, el daemon cliente solo atiende su propio Host de loopback.
  if (esEdicionCliente() && !hostLocalValido(req.headers.host, PORT)) { sendJSON(res, 403, { error: 'Host no permitido.' }); return }

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/live/tool') {
    try {
      const input = JSON.parse(await readBody(req))
      sendJSON(res, 200, await invokeLiveCapability((req.headers.authorization ?? '').replace(/^Bearer /, ''), input))
    } catch { sendJSON(res, 403, { error: 'La herramienta no pertenece a un turno activo.' }) }
    return
  }
  // Edición cliente (contrato v2 §3): prueba de vida sin credencial, para el humo de CI. No dice nada más que «vivo»:
  // los tokens ya no se escriben en disco, así que el humo no puede leerlos.
  if (req.method === 'GET' && req.url === '/vivo' && esEdicionCliente()) {
    sendJSON(res, 200, { ok: true, edicion: 'cliente', contrato: CONTRATO_DAEMON })
    return
  }

  // Auth
  const token = (req.headers['authorization'] ?? '').replace('Bearer ', '')
  // Edición cliente (contrato v2 §2.1): además del Bearer de la app, el pase de agente (lo que tienen los agentes en
  // su entorno). El pase nunca abre las rutas de la app: resolver, consentimiento, apagar, probar llave.
  const conPase = !isTokenValid(token) && esEdicionCliente() && paseAgenteValido(token)
  if (!isTokenValid(token) && !conPase) {
    sendJSON(res, 401, { error: 'Unauthorized' })
    return
  }
  if (esEdicionCliente()) {
    // Red team 3 A-4: autorizar y despachar sobre la MISMA ruta. Una ruta no canónica (`..`, `//`, `%2e`, `#`…) no
    // la manda nadie legítimo: 403 para todos, antes de la lista del pase y del router.
    const ruta = rutaCanonica(req.url)
    if (ruta === null) { sendJSON(res, 403, { error: 'Ruta no canónica.' }); return }
    if (conPase && rutaSoloApp(req.method, ruta)) {
      sendJSON(res, 403, { error: 'Solo la app puede usar esta ruta.' })
      return
    }
  }

  // GET /health — sonda barata para que Arbrain elija servidor (MacBook primero,
  // Mini de respaldo). Reporta rol y máquina para no confundir quién contestó.
  if (req.method === 'GET' && req.url === '/health') {
    // Edición cliente (contrato §3): sin nombre de la máquina; con el estado de las llaves y del workspace.
    if (esEdicionCliente()) {
      let workspace = false
      try { workspace = statSync(PROJECT_ROOT).isDirectory() } catch { /* no existe */ }
      sendJSON(res, 200, { ok: true, role: CLAUDECLAW_ROLE, pid: process.pid, edicion: 'cliente', contrato: CONTRATO_DAEMON, proveedor: estadoLlaves().proveedor, motor: estadoLlaves().proveedor === 'suscripcion' ? 'suscripcion' : 'llave', llaves: estadoLlaves(), voz: { groq: !!llaveVoz() }, workspace, sandbox: sandboxActivo() })
      return
    }
    sendJSON(res, 200, { ok: true, role: CLAUDECLAW_ROLE, host: hostname(), pid: process.pid })
    return
  }

  if (req.method === 'POST' && req.url === '/live/transcribe') {
    const ac = new AbortController(); res.on('close', () => ac.abort())
    try {
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 26 * 1024 * 1024) throw new TranscriptionError('audio_too_large', 'La grabación supera el límite.', 413); chunks.push(bytes) }
      const form = await new Request('http://localhost/live/transcribe', { method: 'POST', headers: { 'Content-Type': req.headers['content-type'] ?? '' }, body: new Uint8Array(Buffer.concat(chunks)) }).formData()
      const audio = form.get('audio'); if (!(audio instanceof Blob)) throw new TranscriptionError('missing_audio', 'Falta la grabación.', 400)
      sendJSON(res, 200, await transcribe(audio, proveedoresVoz(esEdicionCliente(), readEnvFile), ac.signal))
    } catch (error) {
      if (!res.destroyed) sendJSON(res, error instanceof TranscriptionError ? error.status : 400, { error: error instanceof TranscriptionError ? error.message : 'No se pudo leer la grabación.', code: error instanceof TranscriptionError ? error.code : 'invalid_audio' })
    }
    return
  }
  const body = await readBody(req)
  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(body) } catch { /* ignore */ }

  // Los GET de estado de conversación aceptan ?session=<chatSessionId> — los
  // overrides de /model//effort//fast//ultracode son POR CONVERSACIÓN. Sin el
  // param se responde el espacio default (SESSION_KEY: clientes sin sesión).
  const reqUrl = new URL(req.url ?? '', `http://localhost:${PORT}`)
  const reqPath = reqUrl.pathname
  if (esEdicionCliente()) {
    // Contrato §8: lo que solo existe en la instalación de Daniel no se importa ni se ejecuta.
    if (rutaSoloDaniel(req.method, reqPath, parsed)) { sendJSON(res, 404, { error: MENSAJE_NO_DISPONIBLE }); return }
    if (await rutasCliente(req, res, reqPath, parsed)) return
  }
  if (req.method === 'POST' && reqPath === '/live/speech') {
    if (typeof parsed.text !== 'string' || !parsed.text.trim() || parsed.text.length > 1200 || typeof parsed.speed !== 'number' || parsed.speed < 0.5 || parsed.speed > 3) { sendJSON(res, 400, { error: 'Frase de voz inválida.' }); return }
    const ac = new AbortController(); res.on('close', () => ac.abort())
    try {
      const audio = await warmSpeech().stream(parsed.text, parsed.speed, ac.signal)
      if (ac.signal.aborted) return
      res.writeHead(200, { 'Content-Type': 'audio/pcm', 'X-Sample-Rate': String(audio.sampleRate), 'X-Voice-Provider': 'apple-juan', 'Cache-Control': 'no-store, no-transform' })
      const output = Readable.fromWeb(audio.body as import('node:stream/web').ReadableStream<Uint8Array>)
      output.on('error', () => res.destroy()); output.pipe(res)
    } catch { if (!res.headersSent && !res.destroyed) sendJSON(res, 503, { error: 'La voz del host no está disponible.' }) }
    return
  }
  if (req.method === 'POST' && reqPath === '/live/workspace') {
    try {
      const { ownerId, account, conversationId } = parsed
      if (typeof ownerId !== 'string' || typeof account !== 'string' || typeof conversationId !== 'string' || !esCuentaChat(account)) throw new Error('Identidad incompleta.')
      const scope = { owner: ownerId, account, conversationId }
      if (parsed.action === 'select') {
        if (!Array.isArray(parsed.ids) || parsed.ids.some(id => typeof id !== 'string')) throw new Error('Selección inválida.')
        liveStore().select(scope, parsed.ids)
      } else if (parsed.action === 'rendered') {
        if (typeof parsed.revision !== 'number' || typeof parsed.id !== 'string') throw new Error('Recibo inválido.')
        liveStore().rendered(scope, parsed.revision, parsed.id, parsed.receipt)
      } else if (parsed.action !== 'snapshot') throw new Error('Acción inválida.')
      const w = liveStore().read(scope)
      sendJSON(res, 200, { scene: w.scene, activeTurn: w.activeTurn, receipts: w.receipts.map(({data,...r}) => r), renders: w.renders, canUndo: !!w.past.length, canRedo: !!w.future.length })
    } catch (error) { sendJSON(res, 400, { error: error instanceof Error ? error.message : 'No se pudo leer el espacio.' }) }
    return
  }
  if (req.method === 'GET' && reqPath === '/analytics/sales') {
    const result = await handleSales(reqUrl.searchParams)
    sendJSON(res, result.status, result.body)
    return
  }
  if (req.method === 'POST' && reqPath === '/cabina') {
    // Datos de las vistas del Studio (negocio, trabajos) para Arbrain en cualquier
    // dispositivo. Tras la misma autenticación bearer del daemon.
    try {
      if (parsed.que === 'negocio') { const { libroDelNegocio } = await import('./cabina/negocio.js'); sendJSON(res, 200, await libroDelNegocio({ conTexto: parsed.conTexto === true })); return }
      if (parsed.que === 'salida' && typeof parsed.tarea === 'string') { const { salidaDe } = await import('./cabina/internos.js'); const { tachar } = await import('./cabina/cuerpo.js'); try { sendJSON(res, 200, await salidaDe(parsed.tarea, typeof parsed.lineas === 'number' ? Math.min(Math.max(parsed.lineas, 5), 200) : 80, tachar)) } catch (e) { sendJSON(res, 404, { error: e instanceof Error ? e.message : 'Sin salida.' }) } return }
      if (parsed.que === 'panel') { const { sincronizar } = await import('./cabina/panel-bus.js'); try { sendJSON(res, 200, sincronizar(parsed as unknown as import('./cabina/panel-bus.js').Sincronizacion)) } catch (e) { sendJSON(res, 400, { error: e instanceof Error ? e.message : 'Sincronización inválida.' }) } return }
      if (parsed.que === 'panel-ajustes') { const { accionPanelAjustes } = await import('./cabina/panel-ajustes.js'); const r = accionPanelAjustes(parsed); sendJSON(res, 'error' in r ? r.status : 200, 'error' in r ? { error: r.error } : r); return }
      if (parsed.que === 'archivero') { const { accionArchivero } = await import('./cabina/archivero.js'); const r = accionArchivero(parsed); sendJSON(res, 'error' in r ? r.status : 200, 'error' in r ? { error: r.error } : r); return }
      // Memoria y contexto (4 oct 2026): A = la memoria de Levy sobre Daniel; B = la anatomía medida de la ventana.
      if (parsed.que === 'memoria') {
        const m = await import('./cabina/contexto.js')
        if (typeof parsed.leer === 'string') { const r = m.leerMemoria(parsed.leer); sendJSON(res, 'error' in r ? r.status : 200, 'error' in r ? { error: r.error } : r); return }
        sendJSON(res, 200, await m.memoria()); return
      }
      if (parsed.que === 'contexto') {
        const m = await import('./cabina/contexto.js')
        const { configDirForAccount } = await import('./agent.js')
        const { transcriptPath } = await import('./chat-runtime/claude-transcript.js')
        sendJSON(res, 200, await m.anatomia({
          conversacion: typeof parsed.conversacion === 'string' ? parsed.conversacion.slice(0, 80) : undefined, medir: parsed.medir === true,
          journalDb: getDb(), transcriptDe: (sesion, cuenta) => transcriptPath(sesion, PROJECT_ROOT, configDirForAccount(cuenta === 'default' ? undefined : cuenta)),
        }))
        return
      }
      // Reporte de la mañana como vista viva (5 oct 2026): uno por persona de la instalación (dueno.ts › PERSONAS).
      if (parsed.que === 'diario') {
        const { pedidoDe, leerDiario } = await import('./cabina/diario.js')
        const pedido = pedidoDe(parsed); if (!pedido) { sendJSON(res, 400, { error: 'Pedido de reporte inválido.' }); return }
        sendJSON(res, 200, await leerDiario(pedido, parsed.fresco === true)); return
      }
      // Vista «salud» (5 oct 2026): el cuerpo de Daniel desde su ruta propia (CSV del receptor del Studio), sin tocarla.
      if (parsed.que === 'salud') { const { salud } = await import('./cabina/salud.js'); sendJSON(res, 200, await salud(parsed.fresco === true)); return }
      // Vista «masterclass» (7 oct 2026): la fuente única de la masterclass del 17 oct, leída del repo del Studio.
      if (parsed.que === 'masterclass') { const { masterclass } = await import('./cabina/masterclass.js'); const r = await masterclass(); sendJSON(res, r.datos ? 200 : 503, r); return }
      if (parsed.que === 'servidores') { const { servidores } = await import('./cabina/servidores.js'); sendJSON(res, 200, await servidores({ ahora: parsed.ahora === true })); return }
      // Apagar un huérfano desde el Taller (5 oct 2026): el servidor re-verifica pid, arranque y que siga huérfano.
      if (parsed.que === 'apagar') { const { apagarHuerfano } = await import('./cabina/cuerpo.js'); const r = await apagarHuerfano(String(parsed.firma ?? '').slice(0, 40)); sendJSON(res, r.ok ? 200 : r.status, r.ok ? r : { error: r.error }); return }
      // Actividad viva de un subagente sin pantalla (7 oct 2026): sus comandos, archivos y texto desde un offset.
      if (parsed.que === 'actividad') {
        const id = Number(parsed.agente), desde = typeof parsed.desde === 'number' && parsed.desde >= 0 ? Math.floor(parsed.desde) : null
        if (!Number.isInteger(id) || id <= 0) { sendJSON(res, 400, { error: 'Falta el agente.' }); return }
        const { actividadSinPantalla } = await import('./cabina/sin-pantalla.js')
        const r = await actividadSinPantalla(id, desde, typeof parsed.turno === 'number' ? Math.max(0, Math.floor(parsed.turno)) : 0)
        sendJSON(res, r ? 200 : 404, r ?? { error: 'Ese agente no corre sin pantalla.' }); return
      }
      // Tablero de agentes (27 oct 2026): Detener y Responder desde el Taller, por la misma vía que usa Levy.
      if (parsed.que === 'detener' || parsed.que === 'responder' || parsed.que === 'comentarios' || parsed.que === 'correr-plan' || parsed.que === 'descartar-plan') {
        const { pedidoTablero, accionTablero } = await import('./cabina/acciones-tablero.js')
        const pedido = pedidoTablero(parsed)
        if ('error' in pedido) { sendJSON(res, 400, { error: pedido.error }); return }
        const r = await accionTablero(pedido)
        sendJSON(res, r.ok ? 200 : r.status, r.ok ? r : { error: r.error }); return
      }
      // Guardián de disco del VPS (29 oct 2026): el vigía de seguridad pide un subagente de limpieza al ≥ 90 %.
      if (parsed.que === 'guardian-disco') {
        const { pedidoGuardian, lanzarGuardian } = await import('./cabina/guardian-disco.js')
        const pedido = pedidoGuardian(parsed)
        if ('error' in pedido) { sendJSON(res, 400, { error: pedido.error }); return }
        const r = await lanzarGuardian(pedido)
        sendJSON(res, r.ok ? 200 : r.status, r.ok ? r : { error: r.error }); return
      }
      // Edición cliente (29 oct 2026): solo SUS subagentes del SDK y comandos de fondo (cabina/trabajos-cliente.ts).
      if (parsed.que === 'trabajos' && esEdicionCliente()) { const { trabajosCliente } = await import('./cabina/trabajos-cliente.js'); sendJSON(res, 200, await trabajosCliente()); return }
      if (parsed.que === 'trabajos') { const { trabajos } = await import('./cabina/cuerpo.js'); sendJSON(res, 200, await trabajos(typeof parsed.lineas === 'number' ? Math.min(Math.max(parsed.lineas, 2), 30) : 6)); return }
      sendJSON(res, 400, { error: 'Vista desconocida.' })
    } catch (error) { sendJSON(res, 503, { error: error instanceof Error ? error.message : 'No se pudo leer la vista.' }) }
    return
  }
  if (req.method === 'POST' && reqPath === '/planning') {
    const result = await handlePlanning(parsed)
    sendJSON(res, result.status, result.body)
    return
  }
  if (req.method === 'POST' && reqPath === '/consejo') {
    try { sendJSON(res, 200, await handleConsejo(parsed, consejoEngine(existingExecutor(getDurableChat, answerChatQuestion)))) }
    catch (error) { sendJSON(res, error instanceof ConsejoError ? error.status : 503, { error: error instanceof ConsejoError ? error.message : 'No se pudo guardar o recuperar Consejo.' }) }
    return
  }
  const querySessionKey = reqUrl.searchParams.get('session')?.trim() || SESSION_KEY
  let readQueryControls = () => getChatOverrides(querySessionKey)
  if (req.method === 'GET' && ['/models', '/model', '/efforts', '/selection'].includes(reqPath) && reqUrl.searchParams.has('ownerId')) {
    try {
      const access = nativeAwareControlAccess(getDb(), { owner: reqUrl.searchParams.get('ownerId')!, account: reqUrl.searchParams.get('account') ?? 'default', conversationId: reqUrl.searchParams.get('session')?.trim() || null },
        { key: querySessionKey, verifiedConversation: reqUrl.searchParams.get('verifiedConversation') === '1' }, reqUrl.searchParams.get('verifiedNativeOwner') === '1',
        { default: join(homedir(), '.claude', 'projects'), ...proyectosAlternos() })
      access.read()
      readQueryControls = access.read
    } catch (error) { sendJSON(res, 409, { error: error instanceof Error ? error.message : 'No se pudieron resolver los ajustes.' }); return }
  }

  // GET /modelos/registro — registro de modelos y proveedores (motor estándar, 2 oct 2026). Solo nombres de
  // variables y si existen; nunca valores de llaves.
  if (req.method === 'GET' && reqPath === '/modelos/registro') {
    sendJSON(res, 200, registroPublico())
    return
  }

  // GET/POST /modelos/catalogo — catálogo del selector del chat (Configuración → Modelos, 2 oct 2026): qué modelos
  // existen, si están verificados (Claude: catálogo vivo del SDK; el resto: OpenRouter), su precio por millón y
  // cuáles están encendidos. POST { id, habilitado } guarda un interruptor; no se enciende lo no disponible.
  if (reqPath === '/modelos/catalogo' && (req.method === 'GET' || req.method === 'POST')) {
    try {
      let errorClaude: string | null = null
      const claude = await claudeCatalog.read('default').catch((e: unknown) => { errorClaude = e instanceof Error ? e.message : 'sin respuesta'; return null })
      const entorno = {
        openrouter: await consultarOpenRouter(), habilitados: leerHabilitados(getDb()), errorClaude,
        resolverClaude: (candidatos: string[]) => {
          if (!claude) return null
          for (const c of candidatos) { const fila = findClaudeModel(claude.models, c); if (fila) return fila.value }
          return null
        },
      }
      if (req.method === 'POST') {
        const id = typeof parsed.id === 'string' ? parsed.id : ''
        const habilitado = parsed.habilitado === true
        const actual = catalogoPublico(entorno).modelos.find(m => m.id === id)
        if (!actual) throw new Error('Ese modelo no está en el catálogo.')
        if (habilitado && !actual.disponible) throw new Error(actual.motivo ?? 'Ese modelo no está disponible.')
        entorno.habilitados = guardarHabilitado(getDb(), id, habilitado)
      }
      sendJSON(res, 200, catalogoPublico(entorno))
    } catch (error) { sendJSON(res, 409, { error: error instanceof Error ? error.message : 'No se pudo leer el catálogo de modelos.' }) }
    return
  }

  // GET/POST /preferencias/motor — motor, modelo y esfuerzo de las conversaciones nuevas (Configuración →
  // Modelo, 2 oct 2026). Vacía = todo como estaba. El modelo y el esfuerzo se validan contra el catálogo
  // vivo del motor; nunca se guarda una elección que el motor no confirma.
  if (reqPath === '/preferencias/motor' && (req.method === 'GET' || req.method === 'POST')) {
    try {
      if (req.method === 'GET') { sendJSON(res, 200, { preferencia: leerPreferencia(getDb()) }); return }
      const motor = parsed.motor == null ? null : String(parsed.motor)
      const modelo = typeof parsed.modelo === 'string' && parsed.modelo && parsed.modelo !== 'default' ? parsed.modelo : null
      const esfuerzo = typeof parsed.esfuerzo === 'string' && parsed.esfuerzo && parsed.esfuerzo !== 'default' ? parsed.esfuerzo : null
      if (motor === null) { sendJSON(res, 200, { preferencia: guardarPreferencia(getDb(), preferenciaVacia()) }); return }
      if (!esCuentaChat(motor)) throw new Error('Ese motor no existe.')
      if (esCuentaApi(motor) && !motorApiEncendido()) throw new Error('El motor por API está apagado (ARBRAIN_MOTOR_API).')
      let niveles: string[]
      if (isCodexAccount(motor)) {
        const modelos = await codexRuntime().models(motor)
        const elegido = modelos.find(m => m.value === (modelo ?? codexCurrentModel(motor, null)))
        if (!elegido) throw new Error('Ese modelo no está disponible en este motor.')
        niveles = elegido.supportedEfforts
      } else {
        const catalog = await claudeCatalog.read(motor)
        const elegido = findClaudeModel(catalog.models, modelo ?? catalog.configuredModel)
        if (!elegido || (modelo && elegido.value === 'default')) throw new Error('Ese modelo no está disponible en esta cuenta.')
        niveles = elegido.supportedEffortLevels ?? []
      }
      if (esfuerzo && !niveles.includes(esfuerzo)) throw new Error('Ese esfuerzo no lo anuncia el modelo elegido.')
      sendJSON(res, 200, { preferencia: guardarPreferencia(getDb(), { motor, modelo, esfuerzo }) })
    } catch (error) { sendJSON(res, 409, { error: error instanceof Error ? error.message : 'No se pudo guardar la preferencia.' }) }
    return
  }

  if (req.method === 'GET' && reqPath === '/selection') {
    const owner = reqUrl.searchParams.get('ownerId')
    const account = reqUrl.searchParams.get('account') ?? 'default'
    const conversationId = reqUrl.searchParams.get('session')?.trim() || null
    if (!owner?.trim() || !esCuentaChat(account)) { sendJSON(res, 400, { error: 'Selection requires an explicit owner and known account.' }); return }
    // Prueba en Windows del 22 oct 2026 (punto 11): sin llave ni sesión, el catálogo de Claude no existe y esto decía
    // «No se pudo confirmar el modelo Claude». Se dice lo que de verdad falta, con su código, y la web lo muestra.
    if (esCuentaClaude(account) && await faltaLlaveTrasConectar()) { sendJSON(res, 409, { error: MENSAJE_FALTA_LLAVE, code: CODIGO_FALTA_LLAVE }); return }
    try {
      const intent = await captureChatIntent({ owner, account, conversationId }, readQueryControls,
        overrides => isCodexAccount(account) ? resolveCodexSelection(account, overrides as SessionOverrides) : resolveClaudeSelection(PROJECT_ROOT, account, overrides as SessionOverrides))
      sendJSON(res, 200, { intent })
    } catch (error) { sendJSON(res, 409, { error: error instanceof Error ? error.message : 'No se pudo confirmar la selección.' }) }
    return
  }

  // GET /models — catálogo CURADO (determinista, en español) + entrada "default".
  // NUNCA pasar la lista cruda del SDK al picker: incluye filas alias ('default',
  // 'opus', 'sonnet') que causaron el bug "/model → default" (el user tocaba una
  // fila alias, el daemon guardaba el literal y el modelo real nunca cambiaba).
  if (req.method === 'GET' && reqPath === '/models') {
    // El picker es por MOTOR (6 sep 2026): en un espacio Codex ('codex', 'yt')
    // listar modelos de Claude era mentir — el turno lo corre el CLI de OpenAI y
    // el override se ignoraba por no pasar isCodexModel(). El front manda
    // ?account= con el espacio de la conversación abierta.
    const modelsAccount = reqUrl.searchParams.get('account')
    if (isCodexAccount(modelsAccount)) {
      const ov = readQueryControls().model
      const configured = codexCurrentModel(modelsAccount, null)
      const models = [
        ...await codexRuntime().models(modelsAccount!),
        {
          value: 'default',
          displayName: 'Default del sistema',
          description: `Vuelve al modelo del config.toml de este espacio (${codexModelName(modelsAccount, configured)})`,
          supportsEffort: true,
        },
      ]
      sendJSON(res, 200, { models, current: codexCurrentModel(modelsAccount, ov) })
      return
    }

    try {
      const catalog = await claudeCatalog.read(modelsAccount ?? 'default')
      const override = readQueryControls().model
      const selected = findClaudeModel(catalog.models, override ?? catalog.configuredModel)
      const models = catalog.models.filter(model => model.value !== 'default').map(model => ({ ...model, supportedEfforts: model.supportedEffortLevels ?? [], contextWindow: null, contextSource: 'unavailable' }))
      models.push({ value: 'default', displayName: 'Default de esta cuenta', description: 'Respeta la configuración de Claude. El modelo aplicado se confirma al ejecutar.', supportedEfforts: [], contextWindow: null, contextSource: 'unavailable' })
      sendJSON(res, 200, { models, current: override ? selected?.value ?? override : 'default', source: 'runtime', observedAt: catalog.observedAt })
    } catch (error) { sendJSON(res, 503, { error: error instanceof Error ? error.message : 'No se pudo consultar Claude.' }) }
    return
  }

  // GET /model — la verdad del modelo activo (para el header al montar).
  // Orden = lo que corre el PRÓXIMO mensaje de la conversación (?session=):
  // override de la convo > default del sistema (probe cacheado) > último
  // resuelto. NO preferir resolved: tras un "/model default" el último run
  // puede ser de un modelo que ya no aplica.
  if (req.method === 'GET' && reqPath === '/model') {
    const override = readQueryControls().model
    // Espacios Codex: la verdad la manda el CLI de OpenAI, no el SDK de Claude.
    const modelAccount = reqUrl.searchParams.get('account')
    if (isCodexAccount(modelAccount)) {
      const active = codexCurrentModel(modelAccount, override)
      const configured = codexCurrentModel(modelAccount, null)
      sendJSON(res, 200, {
        model: active,
        override: codexModelBelongs(modelAccount, override) ? override : null,
        displayName: codexModelName(modelAccount, active),
        default: configured,
        defaultDisplayName: codexModelName(modelAccount, configured),
      })
      return
    }
    try {
      const catalog = await claudeCatalog.read(modelAccount ?? 'default')
      const selected = findClaudeModel(catalog.models, override ?? catalog.configuredModel)
      sendJSON(res, 200, { model: selected?.resolvedModel ?? override ?? null, override, displayName: selected?.displayName ?? (override ? modelDisplay(override) : null), default: findClaudeModel(catalog.models, catalog.configuredModel)?.resolvedModel ?? null, defaultDisplayName: null, source: 'runtime-settings', defaultPending: !selected })
    } catch (error) { sendJSON(res, 503, { error: error instanceof Error ? error.message : 'No se pudo consultar Claude.' }) }
    return
  }

  // POST /efforts — cambia el esfuerzo (o Ultracode) de UNA conversación SIN
  // pasar por /chat/stream (2 oct 2026). Por el stream el cambio se perdía en
  // silencio si había un turno en curso; este camino no depende de turnos.
  // Body: { session, account, ownerId, verifiedConversation, effort? | ultracode? }.
  // La meta de Claude desde el chip del chat (27 oct 2026): pausar/reanudar/quitar sin teclear comandos. El freno lee
  // este estado en vivo, así que pausar corta las vueltas aun con el turno en curso. Quitar pausa ya y el chat manda
  // `/goal clear` al CLI cuando el turno termina (meta-claude.ts). La Next route ya verificó la conversación.
  if ((req.method === 'POST' || req.method === 'GET') && reqPath === '/chat/meta') {
    const fuente = req.method === 'GET' ? Object.fromEntries(reqUrl.searchParams) as Record<string, unknown> : parsed
    const session = typeof fuente.session === 'string' ? fuente.session.trim() : ''
    const owner = typeof fuente.ownerId === 'string' ? fuente.ownerId.trim() : ''
    if (!session || !owner) { sendJSON(res, 400, { error: 'Falta la conversación.' }); return }
    const clave = EstadoMetas.clave({ owner, account: typeof fuente.account === 'string' && fuente.account ? fuente.account : 'default', conversationId: session })
    if (req.method === 'GET') { sendJSON(res, 200, { meta: estadoMetas.get(clave) }); return }
    const accion = parsed.accion
    if (accion !== 'pausar' && accion !== 'reanudar' && accion !== 'quitar') { sendJSON(res, 400, { error: 'accion debe ser pausar, reanudar o quitar.' }); return }
    sendJSON(res, 200, { meta: estadoMetas.poner(clave, accion === 'reanudar' ? 'en_curso' : 'pausada') })
    return
  }
  if (req.method === 'POST' && reqPath === '/efforts') {
    const session = typeof parsed.session === 'string' ? parsed.session.trim() : ''
    const account = typeof parsed.account === 'string' && parsed.account ? parsed.account : 'default'
    const raw = typeof parsed.effort === 'string' ? parsed.effort.trim().toLowerCase() : ''
    const ultracode = typeof parsed.ultracode === 'boolean' ? parsed.ultracode : null
    if (!session || (!raw && ultracode === null)) { sendJSON(res, 400, { error: 'Falta la conversación o el esfuerzo a aplicar.' }); return }
    try {
      const controls = typeof parsed.ownerId === 'string' && parsed.ownerId.trim()
        ? nativeAwareControlAccess(getDb(), { owner: parsed.ownerId, account, conversationId: session }, { key: session, verifiedConversation: parsed.verifiedConversation === true }, parsed.verifiedNativeOwner === true,
          { default: proyectosClaudeDefault(), ...proyectosAlternos() })
        : { read: () => getChatOverrides(session), patch: (patch: Parameters<typeof setChatOverrides>[1]) => setChatOverrides(session, patch) }
      const updated = ultracode !== null
        ? await changeChatControls(controls.read, current => ultracodeControlPatch(current, ultracode, proposed => resolveClaudeSelection(PROJECT_ROOT, account, proposed as SessionOverrides)), controls.patch)
        : await changeChatControls(controls.read, async current => effortControlPatch(current, raw, ['default', 'auto', 'reset'].includes(raw) ? [] : await effortLevelsFor(account, current)), controls.patch)
      const levels = await effortLevelsFor(account, updated).catch(() => null)
      sendJSON(res, 200, { current: effectiveEffort(updated.effort, levels), ultracode: updated.ultracode })
    } catch (error) {
      logger.error({ err: error }, 'POST /efforts error')
      sendJSON(res, 409, { error: error instanceof Error ? error.message : 'No se pudo cambiar el esfuerzo.' })
    }
    return
  }

  // GET /limits?account= — límites de uso del plan de UNA cuenta (panel de contexto de la barra
  // de escribir, 2 oct 2026). Solo datos del proveedor; sin dato = available:false + motivo.
  if (req.method === 'GET' && reqPath === '/limits') {
    const account = reqUrl.searchParams.get('account') ?? 'default'
    if (!['default', 'bro', 'codex', 'yt'].includes(account)) { sendJSON(res, 400, { error: 'Cuenta sin límites de plan (las cuentas por API no tienen suscripción).' }); return }
    const codex = isCodexAccount(account)
    try {
      sendJSON(res, 200, codex
        ? await readCodexPlanLimits(account, async () => (await codexRuntime().connection(account)).request('account/rateLimits/read', {}, 8_000))
        : await readClaudePlanLimits(PROJECT_ROOT, account))
    } catch (error) {
      sendJSON(res, 200, unavailableLimits(account, codex ? 'codex' : 'claude', error instanceof Error ? error.message.slice(0, 200) : 'No se pudo consultar al proveedor.'))
    }
    return
  }

  // GET /efforts — modos disponibles + estado de la conversación (?session=):
  // effort activo + flags fast/ultracode, para que la UI seedee sus chips con
  // la verdad de ESA conversación (no un global que ya no existe).
  if (req.method === 'GET' && reqPath === '/efforts') {
    const ov = readQueryControls()
    const account = reqUrl.searchParams.get('account')
    if (isCodexAccount(account)) {
      const modelId = codexCurrentModel(account, ov.model)
      const model = (await codexRuntime().models(account!)).find(m => m.value === modelId)
      if (!model) { sendJSON(res, 409, { error: 'El modelo seleccionado no está disponible en esta cuenta.' }); return }
      // 2 oct 2026: `current` es el nivel que correrá el próximo turno (elección o default medium), nunca null.
      sendJSON(res, 200, { efforts: model.supportedEfforts.map(value => ({ value, displayName: value })), current: effectiveEffort(ov.effort, model.supportedEfforts), defaultEffort: nearestEffort(model.supportedEfforts), defaultAvailable: true, defaultSource: 'app', model: modelId, fast: ov.fast, ultracode: ov.ultracode, supportsUltracode: false, source: 'runtime' })
      return
    }
    try {
      const catalog = await claudeCatalog.read(account ?? 'default')
      const model = findClaudeModel(catalog.models, ov.model ?? catalog.configuredModel)
      const levels = model ? (model.supportedEffortLevels ?? []) : null
      sendJSON(res, 200, { efforts: (model?.supportedEffortLevels ?? []).map(value => ({ value, displayName: value })), current: effectiveEffort(ov.effort, levels), fast: ov.fast, ultracode: ov.ultracode, supportsUltracode: true, ultracodeSource: 'legacy', needsModelSelection: !model, defaultEffort: levels ? nearestEffort(levels) : DEFAULT_CHAT_EFFORT, defaultSource: 'app', defaultAvailable: true, source: 'runtime', observedAt: catalog.observedAt })
    } catch (error) { sendJSON(res, 503, { error: error instanceof Error ? error.message : 'No se pudo consultar Claude.' }) }
    return
  }

  // POST /chat/answer — respuesta a una pregunta interactiva (AskUserQuestion).
  // Body: { requestId, answers?: Record<string,string> }. answers vacío/ausente = skip.
  // Resuelve la promesa de canUseTool en agent.ts → el turno bloqueado continúa.
  if (req.method === 'POST' && req.url === '/chat/answer') {
    const requestId = typeof parsed['requestId'] === 'string' ? parsed['requestId'] : ''
    if (!requestId) {
      sendJSON(res, 400, { error: 'requestId required' })
      return
    }
    const rawAnswers = parsed['answers']
    const answers = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)
      ? Object.fromEntries(Object.entries(rawAnswers as Record<string, unknown>)
          .filter(([, v]) => typeof v === 'string')
          .map(([k, v]) => [k, v as string]))
      : null
    const ok = answerChatQuestion(requestId, answers)
    logger.info({ requestId, ok, answered: !!answers }, 'chat/answer')
    sendJSON(res, ok ? 200 : 404, { ok })
    return
  }

  // POST /chat/interrupt — gracefully interrupt active query.
  // Modo multi-session: { sessionId } en body → solo aborta esa sesion.
  // Modo legacy (sin body): aborta TODAS las sesiones activas (compat clientes viejos).
  if (req.method === 'POST' && req.url === '/chat/interrupt') {
    if (parsed.ownerId !== undefined && (typeof parsed.sessionId !== 'string' || typeof parsed.account !== 'string')) { sendJSON(res, 400, { error: 'Scoped cancellation requires sessionId and account.' }); return }
    if (typeof parsed.ownerId === 'string' && typeof parsed.sessionId === 'string' && typeof parsed.account === 'string') {
      const worker = getDurableChat()
      const turn = typeof parsed.turnId === 'string'
        ? { owner: parsed.ownerId, account: parsed.account, conversationId: parsed.sessionId, turnId: parsed.turnId.trim() }
        : worker.journal.latest(parsed.ownerId, parsed.account, parsed.sessionId)
      if (!turn) { sendJSON(res, 404, { error: 'Turn not found' }); return }
      try {
        const ok = worker.interrupt(turn)
        const status = worker.journal.get(turn)?.status ?? 'cancelled_before_acceptance'
        sendJSON(res, 200, { ok, cancellationRequested: true, turnId: turn.turnId, status,
          terminal: ['completed', 'failed', 'interrupted', 'cancelled_before_acceptance'].includes(status) })
      } catch (error) { sendJSON(res, 409, { ok: false, error: error instanceof Error ? error.message : 'Cancellation conflict' }) }
      return
    }

    const targetSessionId = typeof parsed['sessionId'] === 'string' && parsed['sessionId'].length > 0
      ? parsed['sessionId']
      : null

    if (targetSessionId) {
      const stream = activeStreams.get(targetSessionId)
      if (!stream) {
        // Silent OK: el stream ya termino o nunca existio (carrera benigna).
        sendJSON(res, 200, { ok: true, message: 'No active query for session' })
        return
      }
      stream.interrupted = true
      if (stream.query) {
        try {
          await stream.query.interrupt()
          sendJSON(res, 200, { ok: true })
        } catch (err) {
          logger.error({ err, sessionId: targetSessionId }, 'interrupt error')
          sendJSON(res, 200, { ok: true, message: 'Interrupt attempted' })
        } finally {
          stream.ac.abort()
          activeStreams.delete(targetSessionId)
        }
      } else {
        stream.ac.abort()
        activeStreams.delete(targetSessionId)
        sendJSON(res, 200, { ok: true, message: 'Aborted before query started' })
      }
      return
    }

    // Legacy mode: interrumpir todas las sesiones activas
    if (activeStreams.size === 0) {
      sendJSON(res, 200, { ok: true, message: 'No active query' })
      return
    }
    const all = Array.from(activeStreams.entries())
    for (const [, stream] of all) {
      stream.interrupted = true
      if (stream.query) {
        try { await stream.query.interrupt() } catch (err) { logger.error({ err }, 'interrupt error (legacy)') }
      }
      stream.ac.abort()
    }
    activeStreams.clear()
    sendJSON(res, 200, { ok: true, message: `Interrupted ${all.length} streams` })
    return
  }

  // GET /commands?account=<cuenta> — catálogo completo de "/" (modos, locales, nativos del SDK,
  // skills, agentes). Caché por cuenta, ver chat-runtime/command-catalog.ts.
  if (req.method === 'GET' && reqPath === '/commands') {
    const account = reqUrl.searchParams.get('account')?.trim() || 'default'
    if (!esCuentaChat(account)) { sendJSON(res, 400, { error: 'Unknown chat account' }); return }
    try { sendJSON(res, 200, await commandCatalog.get(account)) }
    catch (err) { logger.error({ err, account }, 'command catalog error'); sendJSON(res, 500, { error: 'No se pudo armar el catálogo de comandos.' }) }
    return
  }

  // POST /newchat — reset Claude Code session (specific or global)
  if (req.method === 'POST' && req.url === '/newchat') {
    const targetSession = typeof parsed['chatSessionId'] === 'string' ? parsed['chatSessionId'] : null
    clearSession(targetSession ?? SESSION_KEY)
    sendJSON(res, 200, { ok: true })
    return
  }

  // POST /tts — sintetiza voz (Kokoro local) y devuelve MP3. Lo usa Mission
  // Control (web + desktop) a traves del tunel, reusando el mismo CLAUDECLAW_URL.
  if (req.method === 'POST' && req.url === '/tts') {
    const text = typeof parsed['text'] === 'string' ? parsed['text'] : ''
    if (!text.trim()) { sendJSON(res, 400, { error: 'text required' }); return }
    // voice: levy | sensei | trinity (voz-agentes). Lo usa SaaS Factory (/api/tts/generate) via el funnel.
    const voice = typeof parsed['voice'] === 'string' && parsed['voice'].trim() ? parsed['voice'].trim() : 'levy'
    const speed = typeof parsed['speed'] === 'number' ? parsed['speed'] : 1.0
    // tempo: el lector del chat pide el audio ya acelerado (23 oct 2026); X-Tempo dice cuánto se aplicó de verdad.
    const tempo = typeof parsed['tempo'] === 'number' && Number.isFinite(parsed['tempo']) ? parsed['tempo'] : undefined
    // Edición cliente (v0.2.10): no hay voz-agentes. Con la llave de LemonFox del alumno, su voz; sin ella, 503 rápido y
    // la web lee con la mejor voz del sistema.
    if (esEdicionCliente()) {
      // Desde el 29 oct, el lector (`marcas: true`) recibe también las marcas exactas de cada palabra si el alumno tiene
      // su llave de Groq (cliente/marcas-groq.ts); `X-Marcas-Falta` dice por qué no vinieron.
      const { hablarLemonfox } = await import('./cliente/voz.js')
      const { llaveLemonfox } = await import('./cliente/cofre.js')
      const leido = text.slice(0, 5000)
      const r = await hablarLemonfox(leido, tempo, llaveLemonfox(), fetch, { marcas: parsed['marcas'] === true, llaveGroq: llaveVoz() })
      if (!r) { sendJSON(res, 503, { error: 'Sin voz de servidor: la app lee con la voz del sistema.', code: 'sin_voz_servidor' }); return }
      if (!r.ok) { sendJSON(res, r.status, { error: r.error, code: 'voz_proveedor' }); return }
      const tabla = r.marcas ? JSON.stringify({ v: 1, n: leido.length, m: r.marcas }) : ''
      res.writeHead(200, {
        'Content-Type': r.tipo, 'Cache-Control': 'no-store', 'X-Tempo': String(r.tempo), 'X-Voice-Provider': 'lemonfox',
        ...(tabla && tabla.length <= 8_000 ? { 'X-Marcas': tabla } : {}),
        ...(r.sinMarcas ? { 'X-Marcas-Falta': r.sinMarcas } : {}),
      })
      res.end(r.audio)
      return
    }
    // Lector del chat (24 oct 2026): el sintetizador caliente arranca en ~0.2 s en vez de los ~1.2 s de un `say` nuevo.
    // Desde el 29 oct trae las marcas exactas de cada palabra (X-Marcas, ver synthesizeLector). Si falla, voz-agentes
    // como antes, sin marcas (X-Voice-Engine dice cuál sonó).
    if (tempo != null && voice === 'levy' && Math.abs(speed - LECTOR_SPEED) < 0.01 && process.platform === 'darwin') {
      try {
        const leido = text.slice(0, 5000)
        const { audio, tipo, tempo: aplicado, marcas } = await synthesizeLector(leido, tempo)
        // Un tramo del lector (≤ 320 caracteres) da ~1 KB; un texto enorme se queda sin marcas antes que pasar el límite
        // de cabeceras (16 KB) del proxy.
        const tabla = JSON.stringify({ v: 1, n: leido.length, m: marcas })
        res.writeHead(200, {
          'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Tempo': String(aplicado), 'X-Voice-Engine': 'sayd',
          ...(tabla.length <= 8_000 ? { 'X-Marcas': tabla } : {}),
        })
        res.end(audio)
        return
      } catch (err) {
        logger.warn({ reason: String(err).slice(0, 200) }, 'lector: sayd falló, voz-agentes')
      }
    }
    try {
      const { audio, tempo: aplicado } = await synthesizeSpeech(text, voice, speed, tempo)
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Tempo': String(aplicado), 'X-Voice-Engine': 'voz-agentes' })
      res.end(audio)
    } catch (err) {
      sendJSON(res, 502, { error: `TTS failed: ${String(err)}` })
    }
    return
  }

  // POST /chat/ack — el cliente confirma que recibió Y guardó un turno.
  // Resuelve el waitForAck del stream correspondiente (si sigue esperando).
  if (req.method === 'POST' && req.url === '/chat/ack') {
    const turnId = typeof parsed['turnId'] === 'string' ? parsed['turnId'].trim() : ''
    if (!turnId) {
      sendJSON(res, 400, { error: 'turnId required' })
      return
    }
    markTurnAcked(turnId)
    sendJSON(res, 200, { ok: true })
    return
  }

  // Turnos EN CURSO del dueño (1 oct 2026): alimenta el semáforo del sidebar de Arbrain con una
  // sola consulta al journal. Antes el estado «trabajando» se inferia de la fila `user` en
  // chat_sessions, que solo llega al terminar el turno: un turno largo se veia gris.
  if (req.method === 'POST' && req.url === '/chat/active') {
    if (typeof parsed.ownerId !== 'string' || !parsed.ownerId.trim()) { sendJSON(res, 400, { error: 'ownerId required' }); return }
    sendJSON(res, 200, { turns: getDurableChat().journal.activeTurns(parsed.ownerId) })
    return
  }

  // Despertadores de una conversación (chat vivo, 3 oct 2026): la web muestra los pendientes y deja cancelarlos.
  if (req.method === 'POST' && (req.url === '/chat/despertadores' || req.url === '/chat/despertadores/cancelar')) {
    const { ownerId, account, chatSessionId, id } = parsed as Record<string, unknown>
    if ([ownerId, account, chatSessionId].some(v => typeof v !== 'string' || !v)) { sendJSON(res, 400, { error: 'ownerId, account y chatSessionId son obligatorios' }); return }
    getDurableChat()
    const scope = { owner: ownerId as string, account: account as string, conversationId: chatSessionId as string }
    try {
      if (req.url === '/chat/despertadores/cancelar') {
        if (typeof id !== 'string' || !id) { sendJSON(res, 400, { error: 'id requerido' }); return }
        sendJSON(res, 200, { ok: despertadores!.cancelar(scope, id) })
      } else sendJSON(res, 200, { despertadores: despertadores!.listar(scope) })
    } catch (error) { sendJSON(res, error instanceof DespertadorInvalido ? 400 : 500, { error: error instanceof Error ? error.message : 'No se pudo leer los despertadores.' }) }
    return
  }

  // Conversaciones solo-SDK que Arbrain conduce (1 oct 2026): las que tienen turnos en el journal. El
  // proxy web las mezcla en «Recientes»/«Ver todas»; sin esto, el commit 98d1a061 las había sacado junto
  // con las de Claude Desktop y los crons (el pool ~/.claude no distingue quién las abrió).
  if (req.method === 'POST' && req.url === '/chat/sdk-sessions') {
    if (typeof parsed.ownerId !== 'string' || !parsed.ownerId.trim()) { sendJSON(res, 400, { error: 'ownerId required' }); return }
    sendJSON(res, 200, { sessions: getDurableChat().journal.sdkConversations(parsed.ownerId) })
    return
  }

  // Bifurcar una conversación (1 oct 2026, menú «⋯» de Recientes): crea la sesión NATIVA de la copia (Claude
  // forkSession / Codex thread/fork) y la liga a su id, con los ajustes de la original. La web ya verificó
  // dueño y cuenta y copia la fila y los mensajes; aquí solo vive lo del motor. La original no se toca.
  if (req.method === 'POST' && req.url === '/chat/fork') {
    const { ownerId, account, sourceId, forkId, title } = parsed as Record<string, unknown>
    if ([ownerId, account, sourceId, forkId, title].some(v => typeof v !== 'string')) { sendJSON(res, 400, { error: 'ownerId, account, sourceId, forkId y title son obligatorios' }); return }
    try {
      const result = await forkConversation(
        { owner: ownerId as string, account: account as string, sourceId: sourceId as string, forkId: forkId as string, title: title as string },
        {
          getSession,
          setSession,
          latestStatus: s => getDurableChat().journal.latest(s.owner, s.account, s.conversationId)?.status ?? null,
          forkClaude: (nativeId, acct, name) => forkClaudeEnHijo(nativeId, name, configDirForAccount(acct === 'default' ? undefined : acct)),
          forkCodex: (nativeId, acct) => forkCodexThread(nativeId, acct),
          copyControls: (from, to) => copiarAjustes(getDb(), from, to),
        },
      )
      sendJSON(res, 200, result)
    } catch (error) {
      if (error instanceof ForkRejected) sendJSON(res, error.status, { error: error.message })
      else sendJSON(res, 500, { error: error instanceof Error ? error.message : 'No se pudo bifurcar la conversación' })
    }
    return
  }

  // «Deshacer desde aquí» (27 oct 2026, chat-runtime/deshacer.ts): vista previa (dryRun) o restauración de los archivos
  // a como estaban antes del turno, y «Rehacer» desde el respaldo que se tomó al deshacer. La web ya verificó dueño.
  if (req.method === 'POST' && (req.url === '/chat/deshacer' || req.url === '/chat/rehacer')) {
    const { ownerId, account, chatSessionId, turnId, respaldoId, dryRun } = parsed as Record<string, unknown>
    if ([ownerId, account, chatSessionId].some(v => typeof v !== 'string' || !v)) { sendJSON(res, 400, { error: 'ownerId, account y chatSessionId son obligatorios' }); return }
    const scope = { owner: ownerId as string, account: account as string, conversationId: chatSessionId as string }
    const dirRespaldos = join(STORE_DIR, 'deshacer')
    if (req.url === '/chat/rehacer') {
      if (typeof respaldoId !== 'string') { sendJSON(res, 400, { error: 'respaldoId es obligatorio' }); return }
      try { sendJSON(res, 200, rehacer(dirRespaldos, respaldoId, scope)) } catch (error) { sendJSON(res, 500, { ok: false, error: error instanceof Error ? error.message : 'No se pudo rehacer' }) }
      return
    }
    if (typeof turnId !== 'string' || !turnId) { sendJSON(res, 400, { error: 'turnId es obligatorio' }); return }
    const journal = getDurableChat().journal
    try {
      const vista = await deshacerDesde({
        turno: id => journal.get(id),
        ocupada: s => ['queued', 'dispatching', 'running', 'waiting', 'uncertain'].includes(journal.latest(s.owner, s.account, s.conversationId)?.status ?? ''),
        vivo: (s, sesion) => claudeRuntimePool.rebobinador(s, sesion),
        abrir: (sesion, acct) => {
          const envRebobinar = entornoClaude(process.env, esEdicionCliente())
          const dir = configDirForAccount(acct === 'default' ? undefined : acct)
          if (dir) envRebobinar.CLAUDE_CONFIG_DIR = dir
          else delete envRebobinar.CLAUDE_CONFIG_DIR
          return abrirConSdk(sesion, { cwd: PROJECT_ROOT, env: envRebobinar })
        },
        dirRespaldos,
      }, { ...scope, turnId }, { dryRun: dryRun !== false })
      if (dryRun === false && vista.ok) logger.info({ turnId, archivos: vista.archivos.length, respaldoId: vista.respaldoId }, 'deshacer: archivos restaurados')
      sendJSON(res, 200, vista)
    } catch (error) {
      logger.warn({ err: error, turnId }, 'deshacer: falló')
      sendJSON(res, 500, { ok: false, archivos: [], inserciones: 0, borrados: 0, motivo: 'sdk', error: error instanceof Error ? error.message : 'No se pudo deshacer' })
    }
    return
  }

  // Bounded recovery for the new client: one snapshot plus a paginated event tail.
  if (req.method === 'POST' && req.url === '/chat/turn') {
    if (typeof parsed.ownerId !== 'string' || typeof parsed.account !== 'string' || typeof parsed.chatSessionId !== 'string') { sendJSON(res, 400, { error: 'Turn scope required' }); return }
    const journal = getDurableChat().journal
    const scope = { owner: parsed.ownerId, account: parsed.account, conversationId: parsed.chatSessionId }
    const turn = typeof parsed.turnId === 'string' ? journal.get({ ...scope, turnId: parsed.turnId }) : journal.latest(scope.owner, scope.account, scope.conversationId)
    if (!turn) { sendJSON(res, 404, { error: 'Turn not found' }); return }
    const snapshot = turn.snapshot as { cursor?: number; state?: unknown } | null
    const after = parsed.cursor ?? snapshot?.cursor ?? 0
    if (typeof after !== 'number' || !Number.isSafeInteger(after) || after < 0) { sendJSON(res, 400, { error: 'Invalid cursor' }); return }
    const events = journal.events(turn, after)
    sendJSON(res, 200, { turn: { turnId: turn.turnId, status: turn.status, nativeThreadId: turn.nativeThreadId, nativeTurnId: turn.nativeTurnId, updatedAt: turn.updatedAt }, snapshot, events, nextCursor: events.at(-1)?.cursor ?? after, hasMore: events.length === 500 })
    return
  }

  // POST /chat/live — resume de un turno EN VUELO (estilo Anthropic).
  // Si hay un stream activo para la sesión: SSE con `resume_meta` + replay
  // síncrono del buffer + suscripción al tail en vivo. Si no: {live:false}.
  if (req.method === 'POST' && req.url === '/chat/live') {
    if (typeof parsed.ownerId === 'string' && typeof parsed.chatSessionId === 'string' && typeof parsed.account === 'string') {
      const journal = getDurableChat().journal
      const explicitTurn = typeof parsed.turnId === 'string' && parsed.turnId.length > 0 ? parsed.turnId : null
      const turn = explicitTurn
        ? journal.get({ owner: parsed.ownerId, account: parsed.account, conversationId: parsed.chatSessionId, turnId: explicitTurn })
        : journal.latest(parsed.ownerId, parsed.account, parsed.chatSessionId)
      // Legacy UI appends a new placeholder when this endpoint returns SSE.
      // Completed turns belong to history or explicit /chat/turn recovery;
      // replaying them here would duplicate an already persisted answer.
      if (turn && (explicitTurn || parsed.recover === true || !['completed', 'failed', 'interrupted'].includes(turn.status))) {
        streamDurableTurn(res, turn, typeof parsed.cursor === 'number' ? parsed.cursor : 0, parsed.snapshot === true)
      } else sendJSON(res, 200, { live: false })
      return // Never fall back from an authorized owner scope into a global RAM key.
    }

    const chatSessionId = typeof parsed['chatSessionId'] === 'string' && parsed['chatSessionId'].trim()
      ? parsed['chatSessionId'].trim()
      : null
    const sessionKey = chatSessionId ?? SESSION_KEY
    const live = liveTurns.get(sessionKey)
    if (!live || live.done) {
      sendJSON(res, 200, { live: false })
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })

    // Meta del turno primero (el cliente reconstruye el par user+assistant),
    // luego replay síncrono (Node single-thread: ningún evento nuevo puede
    // intercalarse hasta que este loop termina), luego suscripción al vivo.
    res.write(`data: ${JSON.stringify({
      type: 'resume_meta',
      turnId: live.turnId,
      userMessage: live.userMessage,
      audioUrl: live.audioUrl,
      imageUrl: live.imageUrl,
      startedAt: live.startedAt,
    })}\n\n`)
    for (const line of live.lines) {
      res.write(`data: ${line}\n\n`)
    }
    live.subscribers.add(res)
    logger.info({ sessionKey, turnId: live.turnId, replayed: live.lines.length }, 'live resume attached')
    const detach = () => { live.subscribers.delete(res) }
    req.on('close', detach)
    res.on('error', detach)
    return
  }

  // POST /chat/stream — SSE streaming endpoint for real-time chat
  if (req.method === 'POST' && req.url === '/chat/stream') {
    let message = typeof parsed['message'] === 'string' ? parsed['message'].trim() : ''
    if (!message) {
      sendJSON(res, 400, { error: 'message required' })
      return
    }
    // BYOK (contrato §4): en la edición cliente, sin llave de Claude no se lanza el agente; error claro y se cierra.
    if (esCuentaClaude(parsed['account']) && await faltaLlaveTrasConectar()) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' })
      res.write(`data: ${JSON.stringify({ type: 'error', code: CODIGO_FALTA_LLAVE, message: MENSAJE_FALTA_LLAVE })}\n\n`)
      res.end()
      return
    }
    // Edición cliente: lo que la persona escribió de verdad es lo único que vale como «cita» del freno de manos
    // (manos/politica.ts). En la instalación de Daniel no se guarda nada.
    registrarVoz(message)

    // Identidad de la conversación, ANTES de los interceptores: /model, /effort,
    // /fast y /ultracode son overrides POR CONVERSACIÓN (chat_overrides), así que
    // necesitan la sessionKey aunque el mensaje nunca llegue al agente.
    const chatSessionId = typeof parsed['chatSessionId'] === 'string' ? parsed['chatSessionId'] : null
    const sessionKey = chatSessionId ?? SESSION_KEY

    // Intercept /model <name> — change model without sending to agent
    const envelopeError = durableSubmissionError(parsed)
    if (envelopeError) {
      sendJSON(res, 400, { error: envelopeError })
      return
    }
    let controls: ReturnType<typeof controlAccess>
    try {
      controls = typeof parsed.ownerId === 'string' && parsed.ownerId.trim()
        ? nativeAwareControlAccess(getDb(), { owner: parsed.ownerId, account: typeof parsed.account === 'string' ? parsed.account : 'default', conversationId: chatSessionId },
          { key: sessionKey, verifiedConversation: parsed.verifiedConversation === true }, parsed.verifiedNativeOwner === true,
          { default: proyectosClaudeDefault(), ...proyectosAlternos() })
        : { read: () => getChatOverrides(sessionKey), patch: (patch: Parameters<typeof setChatOverrides>[1]) => setChatOverrides(sessionKey, patch) }
    } catch (error) { sendJSON(res, 409, { error: error instanceof Error ? error.message : 'No se pudieron verificar los ajustes.' }); return }
    const modelMatch = message.match(/^\/model\s+(.+)$/i)
    if (modelMatch) {
      const modelName = modelMatch[1].trim()
      // El modelo tiene que ser del MOTOR de este espacio (6 sep 2026). Antes se
      // guardaba cualquier id: un "/model gpt-6-astra" en una conversación de
      // Claude se aceptaba y el turno siguiente le pasaba ese id al Agent SDK;
      // al revés, un modelo de Anthropic en un espacio Codex se ignoraba en
      // silencio y seguía corriendo el del config.toml. Ahora se rechaza aquí.
      const modelSpace = typeof parsed['account'] === 'string' ? (parsed['account'] as string) : undefined
      const spaceIsCodex = isCodexAccount(modelSpace)
      const isReset = /^(default|reset)$/i.test(modelName)
      if (!isReset && (spaceIsCodex ? !codexModelBelongs(modelSpace, modelName) : isCodexModel(modelName))) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
        const engine = spaceIsCodex ? 'OpenAI (Codex)' : 'Anthropic (Claude)'
        const other = spaceIsCodex ? 'Anthropic' : 'OpenAI'
        const text = `**${modelName}** es un modelo de ${other} y esta conversación corre en ${engine}. El modelo no cambió. Para usarlo, abre una conversación en el espacio del otro motor.`
        res.write(`data: ${JSON.stringify({ type: 'text_delta', text })}\n\n`)
        res.write(`data: ${JSON.stringify({ type: 'result', text })}\n\n`)
        res.end()
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      })

      try {
        await changeChatControls(controls.read, async current => {
          const proposed = { ...current, model: isReset ? null : modelName } as SessionOverrides
          // Clearing a plain model preference remains possible without discovery.
          // Explicit picks and active controls must form a valid combination.
          if (!isReset || current.fast || current.ultracode || current.effort) {
            if (spaceIsCodex) await resolveCodexSelection(modelSpace!, proposed)
            else await resolveClaudeSelection(PROJECT_ROOT, modelSpace ?? 'default', proposed, undefined, isReset ? 'fallback' : 'reject')
          }
          return { model: proposed.model }
        }, controls.patch)
        // El override es POR CONVERSACIÓN (chat_overrides, keyed por sessionKey):
        // aplica desde el próximo mensaje de ESTA conversación sin reiniciarla
        // (el SDK soporta cambiar de modelo en un resume) y no toca las demás.
        if (isReset) {
          let def: string | null = null
          if (spaceIsCodex) {
            def = codexCurrentModel(modelSpace, null)
          } else {
            // Do not substitute the catalog default for effective account settings.
            def = null
          }
          const defDisplay = def ? modelDisplay(def) : null
          const text = defDisplay
            ? `Modelo reseteado al **default del sistema** (${defDisplay}) en esta conversación. Aplica desde tu próximo mensaje.`
            : 'Modelo reseteado al **default del sistema** en esta conversación. El próximo mensaje lo resuelve y el header lo refleja.'
          res.write(`data: ${JSON.stringify({ type: 'model_changed', model: null, resolved: def, display: defDisplay })}\n\n`)
          res.write(`data: ${JSON.stringify({ type: 'text_delta', text })}\n\n`)
          res.write(`data: ${JSON.stringify({ type: 'result', text })}\n\n`)
        } else {
          const display = modelDisplay(modelName)
          const known = modelBase(modelName) in MODEL_DISPLAY_NAMES
          const text = known
            ? `Modelo cambiado a **${display}** para esta conversación. Aplica desde tu próximo mensaje. Las demás conversaciones no cambian.`
            : `Modelo cambiado a **${display}** para esta conversación. La selección fue validada con el runtime de esta cuenta.`
          res.write(`data: ${JSON.stringify({ type: 'model_changed', model: modelName, display })}\n\n`)
          res.write(`data: ${JSON.stringify({ type: 'text_delta', text })}\n\n`)
          res.write(`data: ${JSON.stringify({ type: 'result', text })}\n\n`)
        }
      } catch (err) {
        logger.error({ err }, 'setModel error')
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Failed to switch model: ${String(err)}` })}\n\n`)
      } finally {
        res.write('data: [DONE]\n\n')
        res.end()
      }
      return
    }

    // Intercept /effort <level> — change reasoning effort without sending to agent.
    // Bare "/effort" (no arg) is handled by the frontend (opens the picker), so by
    // the time it reaches here it always carries a level.
    const effortMatch = message.match(/^\/effort\s+(\S+)$/i)
    if (effortMatch) {
      const raw = effortMatch[1].trim().toLowerCase()
      let valid: string[] = ['low', 'medium', 'high', 'xhigh', 'max']
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      })
      try {
        const chatAccount = typeof parsed.account === 'string' && parsed.account ? parsed.account : 'default'
        const updated = await changeChatControls(controls.read, async ov => {
          if (isCodexAccount(chatAccount) || !['default', 'auto', 'reset'].includes(raw)) valid = await effortLevelsFor(chatAccount, ov)
          return effortControlPatch(ov, raw, valid)
        }, controls.patch)
        // 2 oct 2026: el chip nunca queda en «default»; el reset muestra el nivel que correrá (medium o el más cercano).
        const shown = updated.effort ?? effectiveEffort(null, await effortLevelsFor(chatAccount, updated).catch(() => null))
        res.write(`data: ${JSON.stringify({ type: 'effort_changed', effort: shown })}\n\n`)
        const text = updated.effort
          ? `Esfuerzo cambiado a **${updated.effort}** para esta conversación. Aplica desde el próximo mensaje.`
          : `Esfuerzo vuelto al valor por defecto (**${shown ?? DEFAULT_CHAT_EFFORT}**) en esta conversación.`
        res.write(`data: ${JSON.stringify({ type: 'text_delta', text })}\n\n`)
        res.write(`data: ${JSON.stringify({ type: 'result', text })}\n\n`)
      } catch (err) {
        logger.error({ err }, 'setEffort error')
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Failed to switch effort: ${String(err)}` })}\n\n`)
      } finally {
        res.write('data: [DONE]\n\n')
        res.end()
      }
      return
    }

    // Intercept /fast y /ultracode — toggles de flag settings (SDK 0.3.201).
    // Mismo patron que /effort: override por conversación + confirmacion SSE
    // instantanea. "/fast" pelado togglea; "/fast on|off" es explicito.
    const flagMatch = message.match(/^\/(fast|ultracode)(?:\s+(on|off))?$/i)
    if (flagMatch) {
      const flag = flagMatch[1].toLowerCase() as 'fast' | 'ultracode'
      const explicit = flagMatch[2]?.toLowerCase()
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      })
      try {
        const ov = controls.read()
        const current = flag === 'fast' ? ov.fast : ov.ultracode
        const next = explicit ? explicit === 'on' : !current
        if (flag === 'ultracode' && next && isCodexAccount(String(parsed.account))) throw new Error('Ultracode no está disponible en OpenAI. Puedes desactivarlo; ultra es un nivel de esfuerzo distinto.')
        if (flag === 'fast') {
          await changeChatControls(controls.read, async current => {
            const enabled = explicit ? explicit === 'on' : !current.fast
            if (enabled) {
              const proposed = { ...current, fast: true } as SessionOverrides
              if (isCodexAccount(String(parsed.account))) await resolveCodexSelection(String(parsed.account), proposed)
              else await resolveClaudeSelection(PROJECT_ROOT, typeof parsed.account === 'string' ? parsed.account : 'default', proposed)
            }
            return { fast: enabled }
          }, controls.patch)
          res.write(`data: ${JSON.stringify({ type: 'fast_changed', enabled: next })}\n\n`)
          const text = next
            ? 'Fast **ON** para los próximos mensajes de esta conversación. La disponibilidad y el consumo dependen del modelo y la cuenta; no se garantiza una velocidad fija.'
            : 'Fast mode **off** en esta conversación. Velocidad estandar.'
          res.write(`data: ${JSON.stringify({ type: 'text_delta', text })}\n\n`)
          res.write(`data: ${JSON.stringify({ type: 'result', text })}\n\n`)
        } else {
          const updated = await changeChatControls(controls.read, async current =>
            ultracodeControlPatch(current, explicit ? explicit === 'on' : !current.ultracode, proposed =>
              resolveClaudeSelection(PROJECT_ROOT, typeof parsed.account === 'string' ? parsed.account : 'default', proposed as SessionOverrides)),
          controls.patch)
          if (updated.ultracode) res.write(`data: ${JSON.stringify({ type: 'effort_changed', effort: updated.effort })}\n\n`)
          res.write(`data: ${JSON.stringify({ type: 'ultracode_changed', enabled: next })}\n\n`)
          const text = next
            ? 'Ultracode **ON** para esta conversación — esfuerzo xhigh + orquestacion dynamic-workflow en cada turno (requiere modelo xhigh: Opus/Fable). Ojo: consume muchos mas tokens. `/ultracode` de nuevo para apagarlo.\n\nTip: sin standing mode, escribir la palabra **ultracode** dentro de un mensaje activa workflows solo para ese turno.'
            : 'Ultracode **off** en esta conversación. La palabra **ultracode** en un mensaje sigue activando workflows por turno.'
          res.write(`data: ${JSON.stringify({ type: 'text_delta', text })}\n\n`)
          res.write(`data: ${JSON.stringify({ type: 'result', text })}\n\n`)
        }
      } catch (err) {
        logger.error({ err, flag }, 'flag toggle error')
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Failed to toggle ${flag}: ${String(err)}` })}\n\n`)
      } finally {
        res.write('data: [DONE]\n\n')
        res.end()
      }
      return
    }

    // Intercept local-data slash commands. Each builds markdown from filesystem
    // / hardcoded data, no agent call needed (instant response).
    const localCommandBuilders: Record<string, () => string | Promise<string>> = {
      '/status': () => buildConversationStatus(parsed.ownerId, chatSessionId ?? undefined, parsed.account, controls.read()),
      '/skills': () => buildRuntimeInventoryText('skills', parsed.ownerId, chatSessionId, parsed.account),
      '/memory': buildMemoryText,
      '/mcp': () => buildRuntimeInventoryText('mcp', parsed.ownerId, chatSessionId, parsed.account),
      '/usage': buildUsageText,
    }
    const codexChat = isCodexAccount(typeof parsed.account === 'string' ? parsed.account : undefined)
    // `/goal pausar|reanudar` en Claude (27 oct 2026): el CLI no los tiene; los resuelve el freno de Arbrain (meta-claude.ts).
    const metaLocal = !codexChat ? comandoMetaLocal(message) : null
    const localBuilder = localCommandBuilders[message]
      ?? (interceptsGoal(message, codexChat) ? () => buildGoalCommand(message, parsed.ownerId, chatSessionId ?? undefined, parsed.account) : undefined)
      ?? (metaLocal ? () => {
        if (typeof parsed.ownerId !== 'string' || !chatSessionId) return GOAL_NO_THREAD
        const clave = EstadoMetas.clave({ owner: parsed.ownerId, account: typeof parsed.account === 'string' ? parsed.account : 'default', conversationId: chatSessionId })
        return textoComandoLocal(metaLocal, estadoMetas.poner(clave, metaLocal === 'pausar' ? 'pausada' : 'en_curso'))
      } : undefined)
    if (localBuilder) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      })

      try {
        const text = await localBuilder()
        res.write(`data: ${JSON.stringify({ type: 'text_delta', text })}\n\n`)
        res.write(`data: ${JSON.stringify({ type: 'result', text })}\n\n`)
      } catch (err) {
        logger.error({ err, command: message }, 'local command build error')
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Error generando ${message}` })}\n\n`)
      } finally {
        res.write('data: [DONE]\n\n')
        res.end()
      }
      return
    }

    if (typeof parsed.ownerId === 'string' && parsed.ownerId.trim() && chatSessionId) {
      const account = parsed.account ?? 'default'
      if (!esCuentaChat(String(account))) { sendJSON(res, 400, { error: 'Unknown chat account' }); return }
      const turnId = typeof parsed.turnId === 'string' && parsed.turnId.trim() ? parsed.turnId.trim() : randomUUID()
      const effort = parsed.effort
      if (effort != null && (typeof effort !== 'string' || !effort.trim() || (!isCodexAccount(String(account)) && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)))) { sendJSON(res, 400, { error: 'Unsupported effort' }); return }
      const identity = { owner: parsed.ownerId, account: String(account), conversationId: chatSessionId, turnId }
      const previouslyAccepted = getDurableChat().journal.get(identity)
      let intent: ChatIntent | undefined
      try { if (parsed.intent !== undefined) intent = parseChatIntent(parsed.intent, identity) }
      catch (error) { sendJSON(res, 409, { error: error instanceof Error ? error.message : 'Invalid saved selection' }); return }
      try {
      const input: ChatJobInput = {
        message,
        ...(parsed.liveWorkspace === true ? { liveWorkspace: true } : {}),
        // Caller context remains part of the immutable envelope. Server-derived
        // history hints are captured once; mutable history cannot break an ACK retry.
        ...freezeChatContext(parsed, previouslyAccepted?.input as ChatJobInput | undefined),
        audioUrl: typeof parsed.audioUrl === 'string' ? parsed.audioUrl : null,
        imageUrl: typeof parsed.imageUrl === 'string' ? parsed.imageUrl : null,
        source: parsed.source === 'mobile' ? 'mobile' : 'desktop',
        sdkSessionId: chatSessionId.startsWith('sdk:') ? chatSessionId.slice(4) : null,
        editOriginalText: typeof parsed.editOriginalText === 'string' ? parsed.editOriginalText : null,
        editTurnId: typeof parsed.editTurnId === 'string' ? parsed.editTurnId : undefined,
        editOccurrenceFromEnd: typeof parsed.editOccurrenceFromEnd === 'number' ? parsed.editOccurrenceFromEnd : 1,
        effort: effort as string | undefined,
        ...(intent ? { intent } : {}),
        overrides: previouslyAccepted ? (previouslyAccepted.input as ChatJobInput).overrides : (intent ? intentOverrides(intent) : controls.read()) as SessionOverrides,
      }
        // Lost-ACK retries keep the original resolved settings, even if CLI
        // defaults or the live catalog changed while the job was queued.
        const durable = getDurableChat()
        let inyectado: import('./chat-runtime/inyecciones.js').Injected | undefined
        const accepted = await acceptResolvedChat(input,
          () => durable.journal.get(identity)?.input as ChatJobInput | undefined,
          async () => intent
            ? resolveChatIntent(intent, input.effort, overrides => isCodexAccount(String(account)) ? resolveCodexSelection(String(account), overrides as SessionOverrides) : resolveClaudeSelection(PROJECT_ROOT, String(account), overrides as SessionOverrides))
            : isCodexAccount(String(account)) ? resolveCodexSelection(String(account), input.overrides, input.effort) : resolveClaudeSelection(PROJECT_ROOT, String(account), input.overrides, input.effort),
          frozen => {
            // «Inyectar si hay turno vivo» (7 oct 2026): el cliente lo pide cuando Daniel escribe con Levy trabajando.
            const r = parsed.inyectar === true ? chatInjections?.tryInject(identity, frozen) : null
            if (!r) return durable.accept(identity, frozen)
            inyectado = r; void durable.pump()
            return { created: false, turn: r.into }
          }, isCodexAccount(String(account)) ? 'codexSelection' : 'claudeSelection')
        if (inyectado) sendJSON(res, 202, { accepted: true, injected: true, turnId, into: inyectado.into.turnId, status: inyectado.injection.status })
        else if (parsed.acceptOnly === true) sendJSON(res, 202, { accepted: true, turnId: accepted.turn.turnId, status: accepted.turn.status })
        else streamDurableTurn(res, accepted.turn)
      } catch (error) { sendJSON(res, 409, { error: error instanceof Error ? error.message : 'Turn conflict', ...(error instanceof JournalCancelled ? { code: 'turn_cancelled' } : {}) }) }
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })

    // Input validation (logs suspicious patterns, truncates if too long)
    message = validateInput(message, 'web-chat')

    // Parse session-related fields up-front (chatSessionId/sessionKey ya
    // parseados arriba, antes de los interceptores de slash commands)
    const sdkSessionIdOverride = typeof parsed['sdkSessionId'] === 'string' ? parsed['sdkSessionId'] : null
    const audioUrl = typeof parsed['audioUrl'] === 'string' ? parsed['audioUrl'] : null
    const imageUrl = typeof parsed['imageUrl'] === 'string' ? parsed['imageUrl'] : null
    const context = typeof parsed['context'] === 'string' ? parsed['context'] : null
    // TEMPORAL (2026-07-08): cuenta que factura este turno. 'bro' → la carpeta de la alterna
    // (cuenta alterna); ausente/'default' → la principal. Viaja por-request.
    // 'codex' (4 sep 2026) → Codex CLI con el login de ChatGPT principal (codex-agent.ts).
    // 'yt' (6 sep 2026) → mismo Codex CLI, cuenta ChatGPT alterna (su CODEX_HOME propio).
    const rawAccount = typeof parsed['account'] === 'string' ? (parsed['account'] as string) : undefined
    // Edición cliente: 'bro' y 'yt' no existen (cuentas-alternas.ts); el turno corre en la cuenta del alumno.
    const account = rawAccount === 'bro' && dirClaudeAlterna() ? 'bro' : isCodexAccount(rawAccount) ? rawAccount : undefined
    const isCodex = isCodexAccount(account)
    const source = parsed['source'] === 'mobile' ? 'mobile' : 'desktop'
    // turnId: identidad del turno para el protocolo ACK (cliente nuevo). null =
    // cliente legacy (PWA con shell viejo cacheado) → flujo webhook legacy.
    const turnId = typeof parsed['turnId'] === 'string' && parsed['turnId'].trim() ? parsed['turnId'].trim() : null
    // Edición de un mensaje pasado: texto ORIGINAL del mensaje editado (para
    // localizarlo por contenido en el transcript) + su ocurrencia desde el final
    // (desempate de duplicados). Rebobina el contexto del SDK a ese punto (fork).
    const editOriginalText = typeof parsed['editOriginalText'] === 'string' && parsed['editOriginalText'].trim()
      ? parsed['editOriginalText'] as string
      : null
    const editOccurrenceFromEnd = typeof parsed['editOccurrenceFromEnd'] === 'number' && Number.isInteger(parsed['editOccurrenceFromEnd']) && parsed['editOccurrenceFromEnd'] >= 1
      ? parsed['editOccurrenceFromEnd'] as number
      : 1

    // Race condition: si llega nuevo stream para la MISMA sessionKey mientras hay uno corriendo,
    // abortamos el viejo (last-write-wins). El UI ya rendero un nuevo turno; continuar el viejo
    // desperdicia tokens y emite eventos a un cliente que ya no escucha.
    const existing = activeStreams.get(sessionKey)
    if (existing) {
      logger.warn({ sessionKey }, 'replacing active stream for same session')
      existing.interrupted = true
      if (existing.query) {
        try { await existing.query.interrupt() } catch { /* ignore */ }
      }
      existing.ac.abort()
      activeStreams.delete(sessionKey)
    }

    const ac = new AbortController()
    const stream: ActiveStream = { query: null, ac, interrupted: false, clientConnected: true }
    activeStreams.set(sessionKey, stream)

    // Buffer del turno vivo: registra cada evento para que POST /chat/live
    // pueda hacer replay + tail a clientes que reabren a mitad del streaming.
    const liveTurn: LiveTurn = {
      turnId,
      userMessage: message,
      audioUrl,
      imageUrl,
      startedAt: Date.now(),
      lines: [],
      subscribers: new Set(),
      done: false,
    }
    liveTurns.set(sessionKey, liveTurn)

    // Único punto de emisión: cliente primario (si sigue vivo) + buffer +
    // suscriptores de resume. La desconexión de CUALQUIER destino no afecta
    // a los demás — el turno es del servidor, los clientes van y vienen.
    const emit = (event: unknown): void => {
      const payload = JSON.stringify(event)
      if (stream.clientConnected) {
        try { res.write(`data: ${payload}\n\n`) } catch { stream.clientConnected = false }
      }
      liveTurn.lines.push(payload)
      if (liveTurn.lines.length > LIVE_TURN_MAX_LINES) {
        liveTurn.lines.splice(0, liveTurn.lines.length - LIVE_TURN_MAX_LINES)
      }
      for (const sub of liveTurn.subscribers) {
        try { sub.write(`data: ${payload}\n\n`) } catch { liveTurn.subscribers.delete(sub) }
      }
    }

    // Safety watchdog — por INACTIVIDAD, no por tiempo total (7 jul 2026).
    // El límite viejo de 600s absolutos guillotinaba turnos de deep work a
    // media tool call: el SDK lo reportaba como "[ede_diagnostic] ...
    // stop_reason=tool_use" (error críptico, trabajo interrumpido). Un turno
    // que sigue emitiendo eventos está VIVO y no se toca; solo se interrumpe
    // si el agente lleva IDLE_LIMIT sin emitir NADA (colgado de verdad) o pasa
    // el techo absoluto de 2h (runaway).
    //
    // Tres candados aprendidos en la revisión adversarial (7 jul 2026):
    //  · IDLE alto (30 min): lastEventAt solo se refresca con eventos SSE, y
    //    una sola tool larga y silenciosa (build, test suite, migración, git
    //    clone grande) no emite NADA mientras corre. 10 min la mataría injusta-
    //    mente — el mismo tipo de interrupción que este watchdog vino a evitar.
    //    30 min cubre tools reales; el techo de 2h acota cualquier runaway.
    //  · Al disparar: SIEMPRE ac.abort() (patrón de /chat/interrupt), no solo
    //    interrupt(). Sin el abort, cuando interrupt() RESUELVE (camino feliz)
    //    el signal nunca queda aborted → agent.ts no reconoce la cancelación y
    //    re-emite el string crudo [ede_diagnostic] del SDK ENCIMA del aviso
    //    amable (doble mensaje). Con ac.abort(), agent.ts cae al branch
    //    'Abortado.' y el for-await de abajo rompe (ac.signal.aborted) sin
    //    emitirlo → el usuario ve solo este aviso, limpio.
    //  · Guardia de disparo único (watchdogFired + clearInterval): si el
    //    teardown del SDK tarda >30s, el interval no vuelve a re-emitir el aviso
    //    ni a re-interrumpir en cada tick.
    let lastEventAt = Date.now()
    const turnStartedAt = Date.now()
    let watchdogFired = false
    const IDLE_LIMIT_MS = CHAT_IDLE_LIMIT_MS         // 30 min sin NINGÚN evento = colgado
    const ABSOLUTE_LIMIT_MS = CHAT_ABSOLUTE_LIMIT_MS // 0 = sin techo (11 oct 2026); solo corta la inactividad
    const safetyTimeout = setInterval(() => {
      if (watchdogFired) return
      const idle = Date.now() - lastEventAt
      const total = Date.now() - turnStartedAt
      if (idle < IDLE_LIMIT_MS && (ABSOLUTE_LIMIT_MS <= 0 || total < ABSOLUTE_LIMIT_MS)) return
      watchdogFired = true
      clearInterval(safetyTimeout)
      logger.warn({ sessionKey, idleMs: idle, totalMs: total }, 'safety watchdog interrupting stuck/runaway turn')
      emit({ type: 'error', message: idle >= IDLE_LIMIT_MS
        ? 'El agente llevaba 30 minutos sin actividad y fue interrumpido.'
        : 'El turno excedió el techo de tiempo configurado (ARBRAIN_TECHO_TURNO_MS) y fue interrumpido.' })
      // interrupt() detiene el subproceso CLI; ac.abort() SIEMPRE marca la
      // cancelación como intencional para agent.ts (mensaje limpio, sin crudo).
      if (stream.query) {
        stream.query.interrupt().catch(() => { /* ac.abort de abajo cubre el fallo */ })
      }
      ac.abort()
    }, 30_000)
    // Track client disconnect — don't abort agent, let it finish in background
    req.on('close', () => { stream.clientConnected = false })
    res.on('error', () => { stream.clientConnected = false })

    // Keepalive: mientras una tool está bloqueada (pregunta interactiva) o un
    // comando largo corre sin emitir deltas, no fluyen bytes y los proxies
    // intermedios (Vercel) matan la conexión idle. Un comentario SSE cada 25s
    // la mantiene viva; el parser del cliente ignora líneas sin "data: ".
    const keepalive = setInterval(() => {
      if (stream.clientConnected) {
        try { res.write(': ping\n\n') } catch { stream.clientConnected = false }
      }
      for (const sub of liveTurn.subscribers) {
        try { sub.write(': ping\n\n') } catch { liveTurn.subscribers.delete(sub) }
      }
    }, 25_000)

    try {
      // Each MC chat session maps to its own SDK session for isolated context.
      // sdkSessionIdOverride: direct resume of a CLI session (bypasses SQLite lookup).
      // sessionKey ya calculado arriba (chatSessionId ?? SESSION_KEY).
      // Las sesiones del SDK viven en <CLAUDE_CONFIG_DIR>/projects, o sea son POR
      // CUENTA: un sessionId creado bajo ~/.claude NO existe bajo la carpeta de la alterna.
      // Guardar/buscar con la sessionKey pelada hacía que un turno bajo 'bro'
      // resumiera una sesión de Daniel → "No conversation found" → el SDK lanzaba
      // en background → unhandledRejection → EL DAEMON SE MORÍA (3 crashes el 15
      // jul; launchd lo revivía y Daniel veía "se cortó del lado del server" y
      // "no tengo el hilo"). Namespaceando, cada cuenta conserva su propio hilo.
      const sdkSessionKey = account ? `${sessionKey}::${account}` : sessionKey
      const sessionId = sdkSessionIdOverride ?? getSession(sdkSessionKey)

      // Rewind por edición: forkea la sesión SDK al punto ANTES del prompt editado
      // así el contexto de Levy se rebobina de verdad (no solo la UI de Supabase).
      // Si el editado es el 1er prompt (sin assistant previo) → sesión fresca.
      // Si no se encuentra (transcript desalineado) → fallback: continúa normal.
      let resumeSessionId = sessionId
      let rewindUuid: string | undefined
      // Codex no tiene rewind por UUID (sus threads no son transcripts del SDK de
      // Claude): una edición continúa el hilo normal, la UI ya rebobinó Supabase.
      if (editOriginalText && sessionId && !isCodex) {
        const cp = await computeRewindCheckpoint(sessionId, editOriginalText, editOccurrenceFromEnd, account)
        if (cp.found) {
          if (cp.checkpointUuid) rewindUuid = cp.checkpointUuid
          else resumeSessionId = undefined
          logger.info({ sessionKey, forkAt: cp.checkpointUuid ?? 'fresh' }, 'edit rewind')
        } else {
          logger.warn({ sessionKey, editPreview: editOriginalText.slice(0, 40) }, 'edit rewind: checkpoint not found, continuing normally')
        }
      }

      // If user sent images, download to local filesystem so Claude Code can Read them
      // imageUrl can contain multiple URLs separated by newline
      let imagePrefix = ''
      // Rutas locales de las imágenes: Codex las recibe nativas (-i) además del texto.
      const imagePaths: string[] = []
      if (imageUrl) {
        const urls = imageUrl.split('\n').filter((u: string) => u.startsWith('http'))
        for (const url of urls) {
          const urlError = validarAdjunto(url)
          if (urlError) {
            logger.warn({ url: url.slice(0, 100), reason: urlError }, 'blocked image download')
            continue
          }
          try {
            const localPath = await downloadFromUrl(url)
            // Codex recibe imágenes nativas (-i); los documentos van por ruta en el texto para ambos motores.
            if (!esDocumento(localPath)) imagePaths.push(localPath)
            imagePrefix += buildAttachmentMessage(localPath) + '\n\n'
          } catch (err) {
            logger.error({ err, url }, 'failed to download user image')
          }
        }
      }

      const isCompactCmd = message === '/compact'

      // No memory injection. With multi-session SDK, each session maintains its own
      // context via resume. CLAUDE.md provides business context. Injecting FTS memories
      // into the user message polluted session summaries with "[Memory context — EXTERNAL DATA...]".
      const contextPrefix = context && !isCompactCmd ? `[Context: ${context}]\n\n` : ''
      const fullMessage = isCompactCmd ? message : contextPrefix + imagePrefix + message

      const effort = typeof parsed['effort'] === 'string'
        ? (['low', 'medium', 'high', 'xhigh', 'max'].includes(parsed['effort']) ? parsed['effort'] as EffortLevel : undefined)
        : undefined

      let newSessionId: string | undefined
      let resultText = ''
      // Metadata del turno para el guardado de RESPALDO server-side: si el
      // cliente muere (iPhone bloqueado), el webhook lleva la mejor
      // reconstrucción posible — no solo texto plano.
      let turnUsage: Record<string, unknown> | null = null
      let turnDowngrade: Record<string, unknown> | null = null
      const turnToolSummaries: string[] = []
      const turnSuggestions: string[] = []

      // Overrides de ESTA conversación (/model, /effort, /fast, /ultracode),
      // leídos de chat_overrides. El effort del body (magic words) le gana al
      // pick persistente dentro de runAgentStream.
      const sessionOverrides = controls.read() as SessionOverrides

      // Motor del turno: Claude (Agent SDK, cuentas default/bro) o Codex (CLI de
      // OpenAI, cuenta codex). Mismo contrato de eventos SSE hacia el chat.
      const turnStream = isCodex
        ? runCodexStream(fullMessage, resumeSessionId, ac.signal, effort, 'web', imagePaths, sessionOverrides, account)
        : runAgentStream(fullMessage, resumeSessionId, ac.signal, effort, (q) => {
          stream.query = q
        }, 'web', false, account, rewindUuid, sessionOverrides)
      const { observarEvento } = await import('./cabina/internos.js')
      for await (const event of turnStream) {
        // Native interruption has a terminal event with partial output. Drain it.
        if (ac.signal.aborted && !isCodex) break
        lastEventAt = Date.now() // el turno está vivo — el watchdog no lo toca
        if (event.type.startsWith('task_') || event.type === 'tool_result') observarEvento({ conversationId: sessionKey, turnId: turnId ?? '' }, event as unknown as Record<string, unknown>)

        // Capture session ID for persistence
        if (event.type === 'init') {
          newSessionId = event.sessionId
          // Persist before tools execute, so a lost connection does not orphan the native thread.
          setSession(sdkSessionKey, event.sessionId)
        }
        if (event.type === 'interrupt') stream.interrupted = true
        if (event.type === 'result') {
          if (event.terminalReason === 'interrupted') stream.interrupted = true
          if (event.terminalReason !== 'failed') resultText = event.text
        }
        if (event.type === 'tool_summary') {
          turnToolSummaries.push(event.summary)
        }
        if (event.type === 'suggestion') {
          turnSuggestions.push(event.suggestion)
        }
        if (event.type === 'model_downgraded') {
          turnDowngrade = { from: event.from, to: event.to, refusal: event.refusal, category: event.category ?? null }
        }

        // Save usage data to SQLite
        if (event.type === 'usage') {
          turnUsage = {
            costUsd: event.costUsd,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            durationMs: event.durationMs,
            numTurns: event.numTurns,
            ...(event.model ? { model: event.model } : {}),
            ...(event.contextUsed != null ? { contextUsed: event.contextUsed } : {}),
            ...(event.contextTotal != null ? { contextTotal: event.contextTotal } : {}),
          }
        }

        emit(event)
      }

      // Native usage can update many times within one turn. Persist its final
      // report once; writing each update would multiply query counts and usage.
      if (turnUsage) {
        saveQueryUsage({
          sessionKey,
          costUsd: Number(turnUsage.costUsd),
          inputTokens: Number(turnUsage.inputTokens),
          outputTokens: Number(turnUsage.outputTokens),
          durationMs: Number(turnUsage.durationMs),
          numTurns: Number(turnUsage.numTurns),
        })
      }

      // Process file attachments ({{FILE_ATTACH:/path/to/file}} markers in agent output)
      let assistantAudioUrl: string | undefined
      const fileAttachments: Array<{ url: string; filename: string; mimeType: string; size: number }> = []
      if (resultText) {
        const { cleanText, paths } = extractFileMarkers(resultText)
        if (paths.length > 0) {
          for (const filePath of paths) {
            try {
              const attachment = await uploadToStorage(filePath)
              fileAttachments.push(attachment)
              emit({ type: 'file_attachment', ...attachment })
              // Track first audio attachment for persistence
              if (!assistantAudioUrl && attachment.mimeType.startsWith('audio/')) {
                assistantAudioUrl = attachment.url
              }
            } catch (err) {
              logger.error({ err, filePath }, 'file attachment upload failed')
            }
          }
          // Update result text (strip markers) and re-emit cleaned result
          resultText = cleanText
          emit({ type: 'result', text: cleanText })
        }
      }

      // After /compact, append status with post-compact context info
      if (isCompactCmd) {
        try {
          const statusText = buildStatusText(sessionKey, controls.read())
          const ctx = getContextInfo()
          // If context is null (cleared during compact but no post-compact assistant message arrived),
          // tell user compaction ran but we don't have the new size yet — next message will show it
          const compactNote = ctx.used == null
            ? '**Compactacion:** ejecutada. El nuevo tamano de contexto se mostrara en el siguiente mensaje.\n\n'
            : ''
          const combined = resultText.trim()
            ? resultText.trim() + '\n\n---\n\n' + compactNote + statusText
            : compactNote + statusText
          resultText = combined
          emit({ type: 'result', text: combined })
        } catch { /* status append is best-effort */ }
      }

      // Persist session (per chat session Y por cuenta — ver sdkSessionKey arriba)
      // y memoria (global para conocimiento cross-session).
      if (newSessionId) setSession(sdkSessionKey, newSessionId)
      if (resultText.trim()) {
        await saveConversationTurn(SESSION_KEY, message, resultText.trim())
      }

      // Server-owned turn (entrega garantizada): el daemon postea el completion
      // webhook por CADA turno terminado — como los crons, que nunca pierden
      // entregas. MC persiste el turno si el cliente no lo guardó y pushea si
      // el origen fue móvil sin ACK. El finalize corre DESACOPLADO (void async)
      // para no retrasar el [DONE]/res.end() del finally: el cliente necesita
      // recibir el fin del stream para poder guardar y ack-ear dentro de los 5s.
      if (!stream.interrupted && resultText.trim()) {
        const assistantMessage = resultText.trim()
        const webhookPayload = {
          chatSessionId,
          userMessage: message,
          assistantMessage,
          audioUrl,
          imageUrl,
          assistantAudioUrl,
          ...(fileAttachments.length > 0 ? { fileAttachments } : {}),
          turnId,
          ...(turnUsage ? { usage: turnUsage } : {}),
          ...(turnDowngrade ? { downgrade: turnDowngrade } : {}),
          ...(turnToolSummaries.length > 0 ? { toolSummaries: turnToolSummaries } : {}),
          ...(turnSuggestions.length > 0 ? { suggestions: turnSuggestions } : {}),
          // Legacy (daemon↔route con versiones cruzadas durante deploy): el
          // route viejo decide por clientWasConnected; el nuevo lo ignora.
          clientWasConnected: stream.clientConnected,
          source,
        }
        void (async () => {
          // Esperar el ACK del cliente (≤5s). Cliente legacy sin turnId: no hay
          // ACK posible — el route usa el flujo legacy con clientWasConnected.
          const clientAcked = turnId ? await waitForAck(turnId, 5_000) : false
          const completionUrl = `${ALLOWED_ORIGIN}/api/chat/complete`
          logger.info(
            { url: completionUrl, chatSessionId, turnId, clientAcked, source, msgLen: assistantMessage.length },
            'posting completion webhook',
          )
          try {
            const r = await fetch(completionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${MC_TOKEN}`,
              },
              body: JSON.stringify({ ...webhookPayload, clientAcked }),
            })
            // El body trae la decisión completa de MC (saved/dedupe/pushResults
            // con statusCode de web.push.apple.com) — la evidencia E2E queda en
            // los logs del daemon, no hay que adivinar si el push salió.
            const responseBody = await r.json().catch(() => null)
            logger.info({ status: r.status, ok: r.ok, response: responseBody }, 'completion webhook responded')
          } catch (err) {
            logger.error({ err, turnId }, 'completion webhook failed')
          }
        })()
      }
    } catch (err) {
      logger.error({ err }, 'server /chat/stream error')
      emit({ type: 'error', message: String(err) })
    } finally {
      clearInterval(safetyTimeout)
      clearInterval(keepalive)
      // Solo borrar del map si este stream sigue siendo el "active" para esta sessionKey.
      // Si otro stream lo reemplazo (race condition arriba), no queremos borrarlo
      // (el reemplazo ya tomo el slot legitimamente).
      if (activeStreams.get(sessionKey) === stream) {
        activeStreams.delete(sessionKey)
      }
      // Cerrar el turno vivo: [DONE] a todos los suscriptores del resume y
      // destruir el buffer (guardado por instancia: un stream de reemplazo ya
      // pudo haber tomado el slot en liveTurns).
      liveTurn.done = true
      if (liveTurns.get(sessionKey) === liveTurn) {
        liveTurns.delete(sessionKey)
      }
      for (const sub of liveTurn.subscribers) {
        try {
          sub.write('data: [DONE]\n\n')
          sub.end()
        } catch { /* subscriber already gone */ }
      }
      liveTurn.subscribers.clear()
      if (stream.clientConnected) {
        try {
          res.write('data: [DONE]\n\n')
          res.end()
        } catch { /* client already gone */ }
      }
    }
    return
  }

  // POST /synthesize — one-shot para el Segundo Cerebro de Mission Control.
  // Corre el agente en una sesion NUEVA que no se persiste: sin setSession,
  // sin saveConversationTurn, sin webhook a /api/chat/complete. El prompt llega
  // ya aterrizado (contenido de nodos inline) desde /api/cerebro/synthesize.
  if (req.method === 'POST' && req.url === '/synthesize') {
    let prompt = typeof parsed['prompt'] === 'string' ? parsed['prompt'].trim() : ''
    if (!prompt) {
      sendJSON(res, 400, { error: 'prompt required' })
      return
    }
    prompt = validateInput(prompt, 'cerebro-synthesize')

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })

    const ac = new AbortController()
    const safetyTimeout = setTimeout(() => ac.abort(), 300_000) // 5 min
    req.on('close', () => ac.abort())

    try {
      // denyTools=true: síntesis solo-texto. El material ya viene inline; el
      // agente NO debe tocar filesystem/bash (cierra la inyección indirecta desde
      // el contenido de la memoria y honra "NUNCA mutar .claude/memory").
      for await (const event of runAgentStream(prompt, undefined, ac.signal, undefined, undefined, 'web', true)) {
        if (ac.signal.aborted) break
        if (event.type === 'text_delta' || event.type === 'result' || event.type === 'error') {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        } else if (event.type === 'tool_start') {
          res.write(`data: ${JSON.stringify({ type: 'status', status: `Usando ${event.toolName}…` })}\n\n`)
        } else if (event.type === 'status') {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        }
      }
    } catch (err) {
      logger.error({ err }, 'server /synthesize error')
      try { res.write(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`) } catch { /* */ }
    } finally {
      clearTimeout(safetyTimeout)
      try {
        res.write('data: [DONE]\n\n')
        res.end()
      } catch { /* client gone */ }
    }
    return
  }

  // POST /chat — run agent and return response (legacy)
  if (req.method === 'POST' && req.url === '/chat') {
    let message = typeof parsed['message'] === 'string' ? parsed['message'].trim() : ''
    if (!message) {
      sendJSON(res, 400, { error: 'message required' })
      return
    }
    message = validateInput(message, 'web-chat-legacy')
    if (await faltaLlaveTrasConectar()) { sendJSON(res, 412, { error: MENSAJE_FALTA_LLAVE, code: CODIGO_FALTA_LLAVE }); return }
    registrarVoz(message)

    try {
      const sessionId = getSession(SESSION_KEY)
      const result = await runAgent(message, sessionId)

      if (result.newSessionId) {
        setSession(SESSION_KEY, result.newSessionId)
      }

      const responseText = result.text?.trim() ?? ''
      if (responseText) {
        await saveConversationTurn(SESSION_KEY, message, responseText)
      }

      sendJSON(res, 200, {
        text: responseText,
        ...(result.slashCommands && { slashCommands: result.slashCommands }),
        ...(result.isCompact && {
          compact: {
            tokensBefore: result.tokensBefore,
            tokensAfter: result.tokensAfter,
          },
        }),
      })
    } catch (err) {
      logger.error({ err }, 'server /chat error')
      sendJSON(res, 500, { error: String(err) })
    }
    return
  }

  // GET /chat/backstage?session=<mc-uuid>&tailKb=N — el detras-de-camaras de
  // una conversacion del chat: transcript crudo (jsonl) de la sesion SDK
  // ligada. Consumidor: espejo ✦ de SFTerm en vista chip (solo lectura).
  if (req.method === 'GET' && req.url?.startsWith('/chat/backstage')) {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      const chatId = url.searchParams.get('session') ?? ''
      const sdkId = chatId ? getSession(chatId) : undefined
      if (!sdkId) {
        sendJSON(res, 404, { error: 'sin sesion SDK ligada a ese chat (aun no hay turnos)' })
        return
      }
      const tailKb = Math.min(Math.max(parseInt(url.searchParams.get('tailKb') ?? '256', 10) || 256, 16), 1024)
      const file = transcriptPath(sdkId)
      let raw = ''
      try {
        const st = statSync(file)
        const readLen = Math.min(st.size, tailKb * 1024)
        const fd = openSync(file, 'r')
        try {
          const buf = Buffer.alloc(readLen)
          readSync(fd, buf, 0, readLen, st.size - readLen)
          raw = buf.toString('utf-8')
          // tail a mitad de archivo: tirar la primera linea partida
          if (readLen < st.size) raw = raw.slice(raw.indexOf('\n') + 1)
        } finally {
          closeSync(fd)
        }
      } catch {
        /* transcript aun no escrito: raw vacio es respuesta valida */
      }
      sendJSON(res, 200, { sdkSessionId: sdkId, raw })
    } catch (err) {
      logger.error({ err }, 'backstage error')
      sendJSON(res, 500, { error: String(err) })
    }
    return
  }

  // GET /sessions — list all SDK sessions (shared pool with Claude Code CLI)
  // Includes mapping info so MC can deduplicate sessions it already knows about.
  if (req.method === 'GET' && req.url?.startsWith('/sessions') && !req.url.includes('/messages')) {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10), 100)
      // TEMPORAL: pool de transcripts por cuenta ('bro' → la carpeta de la alterna).
      const accountParam = url.searchParams.get('account')
      // Codex no comparte pool con Claude Code: sus threads viven en ~/.codex y el
      // historial del espacio ya está en Supabase (chat_sessions.account='codex').
      // Devolver el pool de Daniel aquí mezclaría conversaciones de otra cuenta.
      if (isCodexAccount(accountParam)) {
        sendJSON(res, 200, { sessions: [] })
        return
      }
      const account = accountParam === 'bro' && dirClaudeAlterna() ? 'bro' : undefined
      // Filtro por tipo: 'chat' = solo conversaciones reales, 'cron' = crons +
      // ruido de fondo. Sin el param = todo (compat con clientes legacy).
      const kindFilter = url.searchParams.get('kind')
      const cacheKey = account ?? 'default'

      // Use cache if fresh (avoids disk I/O on every sidebar load).
      // El cache guarda el pool CRUDO completo; filtro y slice van por request.
      let sdkSessions: unknown[]
      const cached = sessionsCache.get(cacheKey)
      if (cached && Date.now() - cached.ts < SESSIONS_CACHE_TTL) {
        sdkSessions = cached.data
      } else {
        sdkSessions = await withAccountConfigDir(account, () => listSessions({ dir: PROJECT_ROOT, limit: SESSIONS_POOL_SCAN }))
        sessionsCache.set(cacheKey, { data: sdkSessions, ts: Date.now() })
      }

      // Build reverse map: sdk_session_id → chat_session_id (MC Supabase UUID)
      // So the frontend can tell which SDK sessions are already linked to MC sessions.
      const allDbSessions = getDb()
        .prepare('SELECT chat_id, session_id FROM sessions')
        .all() as Array<{ chat_id: string; session_id: string }>
      const sdkToMc = new Map(allDbSessions.map((r) => [r.session_id, r.chat_id]))

      const enriched = (sdkSessions as Record<string, unknown>[]).map((s) => ({
        ...s,
        linkedChatSessionId: sdkToMc.get(s['sessionId'] as string) ?? null,
        kind: classifySessionKind(s['firstPrompt'] ?? s['summary']),
        lastMessageAt: readLastMessageAt(s['sessionId'] as string, account),
      }))

      const filtered = kindFilter === 'chat'
        ? enriched.filter((s) => s.kind === 'chat')
        : kindFilter === 'cron'
          ? enriched.filter((s) => s.kind !== 'chat')
          : enriched

      // Orden por actividad REAL (último mensaje), no por mtime del archivo.
      const activityOf = (s: { lastMessageAt: string | null; lastModified?: unknown }): string =>
        s.lastMessageAt ?? new Date(s.lastModified as string | number | Date).toISOString()
      filtered.sort((a, b) => activityOf(b).localeCompare(activityOf(a)))

      sendJSON(res, 200, { sessions: filtered.slice(0, limit) })
    } catch (err) {
      logger.error({ err }, 'listSessions error')
      sendJSON(res, 500, { error: 'Failed to list sessions' })
    }
    return
  }

  // GET /sessions/:id/messages — read messages from an SDK session
  const sessionsMatch = req.url?.match(/^\/sessions\/([^/?]+)\/messages/)
  if (req.method === 'GET' && sessionsMatch) {
    try {
      const sessionId = sessionsMatch[1]
      // TEMPORAL: leer del pool de la cuenta correcta ('bro' → la carpeta de la alterna).
      const accountParam = new URL(req.url ?? '', `http://localhost:${PORT}`).searchParams.get('account')
      if (isCodexAccount(accountParam)) {
        sendJSON(res, 200, { messages: [] }) // sin pool de transcripts: la thread vive en Supabase
        return
      }
      const account = accountParam === 'bro' && dirClaudeAlterna() ? 'bro' : undefined
      const messages = await readSessionMessages(sessionId, { dir: PROJECT_ROOT, configDir: configDirForAccount(account) })
      sendJSON(res, 200, { messages })
    } catch (err) {
      logger.error({ err }, 'getSessionMessages error')
      sendJSON(res, 500, { error: 'Failed to get session messages' })
    }
    return
  }

  // GET /fs/{list,read,index} — filesystem read-only para la Vista Chip de SFTerm
  if (req.method === 'GET' && req.url?.startsWith('/fs/')) {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const target = fsResolveSafe(url.searchParams.get('path') ?? url.searchParams.get('root'))
    if (!target) {
      sendJSON(res, 400, { error: esEdicionCliente() ? 'path requerido, dentro del workspace, existente y sin secretos' : 'path requerido, dentro de $HOME y existente' })
      return
    }
    try {
      if (url.pathname === '/fs/list') {
        const entries = readdirSync(target, { withFileTypes: true })
          .slice(0, 3000)
          .map((d) => {
            const p = join(target, d.name)
            const is_symlink = d.isSymbolicLink()
            let is_dir = d.isDirectory()
            if (is_symlink) {
              try { is_dir = statSync(p).isDirectory() } catch { is_dir = false }
            }
            return { name: d.name, path: p, is_dir, is_symlink }
          })
        entries.sort((a, b) =>
          a.is_dir === b.is_dir
            ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            : a.is_dir ? -1 : 1,
        )
        sendJSON(res, 200, { entries })
        return
      }
      if (url.pathname === '/fs/read') {
        const st = statSync(target)
        if (!st.isFile()) {
          sendJSON(res, 400, { error: 'no es un archivo' })
          return
        }
        const buf = readFileSync(target)
        const truncated = buf.length > FS_TEXT_CAP
        const slice = truncated ? buf.subarray(0, FS_TEXT_CAP) : buf
        const binary = slice.subarray(0, 8000).includes(0)
        if (binary) sendJSON(res, 200, { binary, b64: slice.toString('base64'), size: st.size, truncated })
        else sendJSON(res, 200, { binary, text: slice.toString('utf8'), size: st.size, truncated })
        return
      }
      if (url.pathname === '/fs/index') {
        sendJSON(res, 200, { files: await gitLsFiles(target) })
        return
      }
      sendJSON(res, 404, { error: 'op /fs desconocida (list|read|index)' })
    } catch (err) {
      sendJSON(res, 500, { error: String(err) })
    }
    return
  }

  // GET /usage — usage summary (tokens, cost, queries)
  if (req.method === 'GET' && req.url?.startsWith('/usage')) {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const days = parseInt(url.searchParams.get('days') ?? '30', 10)
    const sinceMs = Date.now() - 86_400_000 * days
    sendJSON(res, 200, getUsageSummary(sinceMs))
    return
  }

  // GET /schedule — list all cron jobs
  if (req.method === 'GET' && req.url === '/schedule') {
    sendJSON(res, 200, { tasks: listTasks(), tz: CRON_TZ })
    return
  }

  // POST /schedule/:id/:action — run/pause/resume a cron job
  const scheduleMatch = req.url?.match(/^\/schedule\/([^/]+)\/(run|pause|resume)$/)
  if (req.method === 'POST' && scheduleMatch) {
    const [, taskId, action] = scheduleMatch
    const task = getTask(taskId)
    if (!task) {
      sendJSON(res, 404, { error: `Task "${taskId}" not found` })
      return
    }

    if (action === 'pause') {
      updateTaskStatus(taskId, 'paused')
      sendJSON(res, 200, { ok: true })
      return
    }

    if (action === 'resume') {
      const nextRun = computeNextRun(task.schedule)
      updateTaskStatus(taskId, 'active')
      updateTaskAfterRun(taskId, task.last_result ?? '', nextRun)
      sendJSON(res, 200, { ok: true, nextRun })
      return
    }

    // action === 'run' — execute async, return 202 immediately.
    // Pasa por el MISMO pipeline instrumentado que las corridas programadas
    // (executeCronJob): conversations + usage (jobId + costo unidos), query_usage
    // local, ops_events con costo. Antes el run manual era un runAgent pelón
    // (source 'web', sin rastro en MC ni costo unible).
    sendJSON(res, 202, { ok: true, message: `Task "${taskId}" queued for execution` })
    executeCronJob(task, { manual: true })
      .then(() => logger.info({ taskId }, 'manual run completed'))
      .catch((err) => logger.error({ err, taskId }, 'manual run error'))
    return
  }

  // GET /ops/stream — SSE stream of real-time agent activity
  if (req.method === 'GET' && req.url === '/ops/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })

    // Send recent events as initial burst
    const recent = opsLogger.getRecent(50)
    for (const event of recent.reverse()) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    // Stream new events as they arrive
    let connected = true
    const onEvent = (event: OpsEvent) => {
      if (!connected) return
      try { res.write(`data: ${JSON.stringify(event)}\n\n`) } catch { connected = false }
    }

    opsLogger.on('ops', onEvent)

    // Keep-alive ping every 30s
    const keepAlive = setInterval(() => {
      if (!connected) return
      try { res.write(': ping\n\n') } catch { connected = false }
    }, 30_000)

    req.on('close', () => {
      connected = false
      opsLogger.off('ops', onEvent)
      clearInterval(keepAlive)
    })
    return
  }

  // GET /ops/recent — snapshot of recent events (JSON)
  if (req.method === 'GET' && req.url?.startsWith('/ops/recent')) {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)
    sendJSON(res, 200, { events: opsLogger.getRecent(limit) })
    return
  }

  sendJSON(res, 404, { error: 'Not found' })
}

// ─── Start server ─────────────────────────────────────────────────────────────

export function startMCServer(): void {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      logger.error({ err }, 'server unhandled error')
      try {
        sendJSON(res, 500, { error: 'Internal server error' })
      } catch { /* headers already sent */ }
    })
  })

  const cliente = esEdicionCliente()
  if (cliente) {
    // I8 y cohorte (contrato §6-§7): viven en la base del daemon. La UI se entera por /ops/stream además del sondeo.
    // M1: el daemon es la fuente del interruptor de computer use y de la voz (manos le pregunta por /manos/estado).
    marcarFuenteLocal()
    // 0.2.15: y del modo de permisos que rige a las manos (Autónomo = solo la red mínima; la cita sale del chat).
    registrarModoManos(() => modoPermisos())
    // A13: y del teléfono y el correo que la persona guardó como suyos (mandarse algo a sí misma no frena).
    registrarDatosPropios(() => datosPropios())
    // Seguridad del alumno (12 oct 2026): el registro de actividad no guarda llaves; el literal completo vive solo en la
    // tabla de confirmaciones (la persona tiene que verlo entero para aprobarlo).
    iniciarConfirmaciones(getDb(), (tipo, c) => {
      opsLogger.log(tipo === 'resuelta' ? 'confirmacion_resuelta' : 'confirmacion_pendiente', 'system', {
        ...c, resumen: redactar(c.resumen), ...(c.detalle ? { detalle: redactar(c.detalle) } : {}), ...(c.literal ? { literal: redactar(c.literal) } : {}),
      })
      // A6 (0.2.15): una pendiente nueva avisa con una notificación del sistema (llega aunque Arbrain esté tapada).
      if (tipo === 'pendiente') {
        const r = avisarSistema(c.id, 'Levy espera tu clic', `${(c.frase || c.resumen).replace(/\s+/g, ' ').slice(0, 160)}. Si no decides, queda en tu cola.`)
        if (r === 'enviado') logger.info({ confirmacion: c.id }, 'pendiente: aviso del sistema')
      }
      // Cola de aprobaciones (ronda 2): lo que entra a la cola avisa al teléfono si la instalación tiene avisos.
      if (tipo === 'cola') {
        // La app local de la persona (su origen), con el token del daemon: el mismo camino que la campana.
        void avisarTelefono(c, { token: MC_TOKEN, url: ALLOWED_ORIGIN })
          .then(r => { if (r !== 'repetido') logger.info({ confirmacion: c.id, resultado: r }, 'cola: aviso al teléfono') })
      }
    }).alRetomar(retomarEnConversacion({
      // Al decidir algo de la cola, el agente se entera en SU conversación: aviso que vence ya (mismo camino que un
      // despertador; el pulso de 2 s lo dispara y retoma la sesión).
      avisar: (scope, texto) => {
        if (!despertadores) throw new Error('despertadores sin iniciar')
        despertadores.avisar(scope, texto, 'confirmacion')
      },
      marcarContaminada,
      registrar: e => logger.info(e, 'cola de aprobaciones'),
    }))
    iniciarBitacora(getDb())
    // «Pausar todo»: además de abortar los turnos vivos, cierra las sesiones del pool (nada sigue en segundo plano).
    alPausarTodo(() => claudeRuntimePool.close())
    const cohorte = iniciarCohorte(getDb())
    const tic = () => { void cohorte.enviar().then(r => { if (r === 'enviado' || r === 'fallo') logger.info({ resultado: r }, 'cohorte: envío diario') }) }
    setTimeout(tic, 60_000).unref()
    setInterval(tic, 6 * 60 * 60_000).unref()
    // Puente con arbrain.ai: el mismo reloj del daemon (sin crons). Sin token no sale nada; con token, una vez al día.
    const progreso = iniciarProgreso(getDb())
    const ticProgreso = () => { void progreso.enviar().then(r => { if (r.resultado !== 'sin_conexion' && r.resultado !== 'pronto') logger.info({ resultado: r.resultado }, 'progreso: envío diario') }) }
    // El expediente del alumno en su memoria: adopta lo sembrado a mano y, con token, lo trae al arrancar (cada
    // actualización reinicia el daemon) y una vez al día.
    const adoptados = progreso.adoptar()
    if (adoptados.length) logger.info({ adoptados }, 'progreso: expediente adoptado de la siembra manual')
    let primeraVez = true
    const ticExpediente = () => { const f = primeraVez; primeraVez = false; void progreso.traerExpediente(f).then(r => { if (!['no_cliente', 'sin_conexion', 'sin_cerebro', 'pronto'].includes(r.resultado)) logger.info({ resultado: r.resultado }, 'progreso: expediente') }) }
    setTimeout(ticExpediente, 45_000).unref()
    setInterval(ticExpediente, 60 * 60_000).unref()
    // Mi camino en el programa (camino.ts): al arrancar y cada mañana; si arbrain.ai no responde, queda lo último guardado.
    let primerCamino = true
    const ticCamino = () => { const f = primerCamino; primerCamino = false; void progreso.traerCamino(f).then(r => { if (!['no_cliente', 'sin_conexion', 'sin_cerebro', 'pronto'].includes(r.resultado)) logger.info({ resultado: r.resultado }, 'progreso: camino') }) }
    setTimeout(ticCamino, 50_000).unref()
    setInterval(ticCamino, 60 * 60_000).unref()
    setTimeout(ticProgreso, 90_000).unref()
    setInterval(ticProgreso, 60 * 60_000).unref()
  }
  server.listen(PORT, '127.0.0.1', () => {
    getDurableChat()
    // Vista «Servidores» (4 oct 2026): el sensor corre en el servidor aunque nadie mire; el respaldo de chat no vigila.
    // Edición cliente: no (lee launchctl y los servidores de Daniel).
    if (CLAUDECLAW_ROLE === 'full' && !cliente) void import('./cabina/servidores.js').then(m => m.arrancarVigia(), error => logger.warn({ err: error }, 'servidores: vigía no arrancó'))
    if (process.platform === 'darwin' && !cliente) void prewarmSpeech().catch(error => logger.warn({ reason: error instanceof Error ? error.message : 'unavailable' }, 'Live voice prewarm unavailable'))
    logger.info({ port: PORT }, 'MC web server listening on localhost')
    console.log(`✓ MC server on http://localhost:${PORT}`)
    // Contrato §1: la app sabe que el daemon está listo por esta línea.
    if (cliente) console.log(`ARBRAIN_DAEMON_LISTO ${JSON.stringify({ puerto: PORT, pid: process.pid, edicion: 'cliente', contrato: CONTRATO_DAEMON })}`)
  })
}
