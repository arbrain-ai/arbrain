import type { LiveToolbox } from './live/tools.js'
import { getCommandCatalog } from './chat-runtime/command-catalog.js'
import { cabinaMcpConfig, manosMcpConfig } from './cabina/config.js'
import { computerUseDisponible } from './manos/politica.js'
import { chromeHooks, claveConversacion, configurarBitacora } from './cabina/chrome-guard.js'
import { conViaUnica, herramientasProhibidasChat, marcarTurno } from './cabina/una-sola-via.js'
import { conGuardia, opcionesSesionCliente, permisosCliente, sinGanchosCliente } from './guardia-agentes.js'
import { esFalloDeSandbox, marcarSandboxFallido } from './cliente/sandbox.js'
import { estadoLlaves, faltaLlaveClaude, MENSAJE_FALTA_LLAVE } from './cliente/llaves.js'
import { clasificarFalloDeCuenta, mensajeFalloDeCuenta, type FalloDeCuenta } from './cliente/sin-saldo.js'
import { MENSAJE_PAUSA, pausado, registrarEnCurso } from './cliente/pausa.js'
import { modeloParaProveedor } from './cliente/proveedor.js'
import { SeguidorMeta, EstadoMetas, estadoMetas, leerRevision, comandoMetaNativo, type VistaMeta } from './chat-runtime/meta-claude.js'
import { esEdicionCliente } from './edicion.js'
import { modoPermisosSdk } from './cliente/permisos-sdk.js'
import { esAutonomo } from './cliente/modo-permisos.js'
import { entornoClaude } from './cliente/cofre.js'
import { fuentesDeAjustes, motorSuscripcion } from './cliente/suscripcion.js'
import { readEnvFile } from './env.js'
import { configuredCronEnvironment } from './cron-account.js'
import { query, type Query, type ModelInfo, type SessionMessage, type Options } from '@anthropic-ai/claude-agent-sdk'
import { readSessionMessages } from './chat-runtime/claude-transcript.js'
import os from 'node:os'
import path from 'node:path'
import { PROJECT_ROOT, STORE_DIR, AGENT_TIMEOUT_MS, CHAT_STREAM_HARD_CAP_MS, defaultAccountConfigDir } from './config.js'
import { logger } from './logger.js'
import { opsLogger } from './ops-logger.js'
import { claudeRuntimePool, type ClaudeTurnScope } from './chat-runtime/claude-pool.js'
import { opcionesCheckpoint } from './chat-runtime/deshacer.js'
import { registrarTurno, type UsoLlamada } from './cabina/contexto.js'
import { ClaudeExecutionUncertain, ClaudeSubmissionCancelled, confirmClaudeSubscription, type ClaudeBackgroundEvent } from './chat-runtime/claude-session.js'
import { validateClaudeSelection, claudeSelectionOptions, type ClaudeSelection } from './chat-runtime/claude-selection.js'
import { CUENTA_ALTERNA_NO_DISPONIBLE, dirClaudeAlterna } from './cuentas-alternas.js'

/** Cola de aprobaciones (edición cliente): la conversación del turno, para que lo no contestado vuelva ahí. */
const colaDe = (durable?: { scope: { owner: string; account: string; conversationId: string } }) =>
  durable ? { conversacion: { owner: durable.scope.owner, account: durable.scope.account, conversationId: durable.scope.conversationId } } : {}

export type { Query, ModelInfo }

// ─── Cuenta alterna de suscripción (instalación original) ────────────────────
// El SDK spawnea el CLI `claude`, que resuelve credenciales por CLAUDE_CONFIG_DIR:
// la cuenta alterna usa su propia carpeta de configuración, aislada de la
// principal (~/.claude). El `account` viaja POR REQUEST (nunca global al daemon)
// para no contaminar otras conversaciones ni los crons.
// La carpeta es dato de la instalación (cuentas-alternas.ts); en la edición cliente la cuenta alterna no existe.
const accountConfigDirs = (): Record<string, string> => {
  const bro = dirClaudeAlterna()
  return bro ? { bro } : {}
}

/** Config dir de la cuenta alterna, o undefined = cuenta principal
 *  (~/.claude). Lo usa el daemon para
 *  listar/leer transcripts del pool correcto por cuenta. */
export function configDirForAccount(account?: string): string | undefined {
  return account ? accountConfigDirs()[account] : defaultAccountConfigDir()
}

// Modelo — piezas separadas (fix del bug "/model → default", fase 2 paso 3):
//   resolvedModelId = lo que el SDK reporta que CORRIÓ (init/result events) — la verdad
// El override explícito del user (/model) YA NO vive aquí: es POR CONVERSACIÓN
// (tabla chat_overrides en SQLite, 8 ago 2026) y llega a runAgentStream como
// parámetro `overrides`. Antes era un global de módulo y el /effort max de una
// conversación (o de la cuenta bro) pisaba TODAS las demás.
let resolvedModelId: string | null = null
// A qué id canónico resuelve el alias 'default' (fila alias de supportedModels()).
// Se resuelve lazy y se cachea de por vida del daemon.
let defaultModelId: string | null = null

// El SDK emite variantes con sufijo de contexto ('claude-opus-4-8[1m]'). Para
// comparar "pedido vs resuelto" (detección de downgrade) hay que quitarlo, o
// 'claude-opus-4-8' vs 'claude-opus-4-8[1m]' se leería como cambio de modelo.
function modelBase(id: string | null | undefined): string | null {
  return id ? id.replace(/\[[^\]]+\]$/, '') : null
}

// Overrides por conversación (/model, /effort, /fast, /ultracode). El server
// los lee de SQLite (chat_overrides) con la sessionKey del chat y los pasa aquí
// por parámetro. SOLO aplican al chat web (runAgentStream) — los crons
// (runAgent) no los reciben y corren siempre en el default del sistema.
export interface SessionOverrides {
  model: string | null
  effort: EffortLevel | null
  fast: boolean
  ultracode: boolean
}

// ── AskUserQuestion interactivo (fase 2 paso 2) ──────────────────────────────
// El modelo llama la tool AskUserQuestion → el SDK la rutea por canUseTool →
// el stream emite `ask_user_question` al chat (botones) y queda BLOQUEADO en la
// promesa hasta que la respuesta llegue por POST /chat/answer → resolvemos con
// updatedInput.answers y el turno continúa. Timeout de seguridad: si nadie
// responde, se deniega con instrucción de continuar (el stream nunca cuelga).
// 20 min (3 oct 2026): con 4 min la pregunta caducaba antes de que Daniel la viera. Queda bajo el
// vigilante de inactividad del turno (30 min). Mientras espera, el turno está en `waiting` (punto azul).
const ASK_QUESTION_TIMEOUT_MS = Number(process.env.ARBRAIN_ASK_TIMEOUT_MS ?? 20 * 60 * 1000)

type QuestionResolution =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string }

const pendingQuestions = new Map<string, {
  resolve: (result: QuestionResolution) => void
  input: Record<string, unknown>
  timer: NodeJS.Timeout
  /** Avisa al stream del turno que la pregunta se cerró (el journal vuelve de `waiting` a `running`). */
  settled?: (outcome: 'answered' | 'skipped') => void
}>()

/**
 * Resuelve una pregunta interactiva pendiente. answers = { "<pregunta>": "<label(s) elegidas>" }.
 * answers null/vacío = el usuario la saltó (el modelo continúa con su criterio).
 * Devuelve false si el requestId ya no está pendiente (expiró, se interrumpió o ya se respondió).
 */
export function hasPendingUserQuestion(requestId: string): boolean { return pendingQuestions.has(requestId) }

export function answerUserQuestion(requestId: string, answers: Record<string, string> | null): boolean {
  const pending = pendingQuestions.get(requestId)
  if (!pending) return false
  pendingQuestions.delete(requestId)
  clearTimeout(pending.timer)
  const answered = !!answers && Object.keys(answers).length > 0
  pending.settled?.(answered ? 'answered' : 'skipped')
  if (answers && Object.keys(answers).length > 0) {
    pending.resolve({ behavior: 'allow', updatedInput: { ...pending.input, answers } })
  } else {
    pending.resolve({ behavior: 'deny', message: 'El usuario saltó la pregunta. Continúa con tu mejor criterio sin volver a preguntar.' })
  }
  return true
}

// Track context window state
let contextWindowSize: number | null = null
let lastContextTokens: number | null = null

export function getModelState(): { resolved: string | null; default: string | null } {
  // El override explícito es por conversación (chat_overrides en db.ts); aquí
  // solo vive lo global: el último modelo resuelto y el default del sistema.
  return { resolved: resolvedModelId, default: defaultModelId }
}

/**
 * Resuelve el modelo default del sistema EMPÍRICAMENTE: spawnea una query sin
 * override y lee el init event (que reporta el modelo resuelto) antes de abortar.
 * NO usar la fila alias 'default' de supportedModels(): miente cuando el user
 * fijó `model` en settings (ej. "fable" → la fila decía Opus 4.8, pero los turnos
 * corrían Fable 5). El prompt '/status' es un slash command local — el abort
 * post-init evita cualquier turno de inferencia. Cache de por vida del daemon.
 */
export async function resolveDefaultModel(_sessionId?: string): Promise<string | null> {
  if (defaultModelId) return defaultModelId
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 30_000)
  try {
    const stream = query({
      prompt: '/status',
      options: {
        cwd: PROJECT_ROOT,
        settingSources: fuentesDeAjustes(['project', 'user']),
        permissionMode: 'acceptEdits',
        abortController: ac,
        // Edición cliente (red team 2 C-1): sesión de metadatos, sin ganchos del proyecto. Daniel: igual.
        ...sinGanchosCliente(),
      },
    })
    for await (const e of stream as AsyncIterable<Record<string, unknown>>) {
      if (e['type'] === 'system' && e['subtype'] === 'init') {
        defaultModelId = (e['model'] as string) ?? null
        break
      }
    }
    try { await stream.interrupt() } catch { /* ya tenemos el init */ }
    ac.abort()
  } catch (err) {
    logger.error({ err }, 'resolveDefaultModel error')
  } finally {
    clearTimeout(timeout)
  }
  return defaultModelId
}

export function getContextInfo(): { used: number | null; total: number | null } {
  return { used: lastContextTokens, total: contextWindowSize }
}

export interface AgentUsage {
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  numTurns: number
  model?: string
}

export interface AgentResult {
  text: string | null
  newSessionId?: string
  slashCommands?: string[]
  isCompact?: boolean
  tokensBefore?: number
  tokensAfter?: number
  terminalReason?: string
  usage?: AgentUsage
}

// ─── SSE Stream Events ────────────────────────────────────────────────────────

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type TodoItem = { content: string; status: TodoStatus; activeForm?: string }

// Cap del output de tool que viaja al chat: un `cat` de 500KB no puede inundar
// el SSE ni la fila de chat_messages. El transcript del SDK conserva el output
// COMPLETO en disco; esto es solo la vista del chat.
const TOOL_RESULT_MAX_CHARS = 8_000

// Texto plano de un bloque tool_result del SDK (string directo o array de bloques).
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as { type?: string; text?: string }
        if (block?.type === 'text' && typeof block.text === 'string') return block.text
        if (block?.type === 'image') return '[imagen]'
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

export type SSEEvent =
  | { type: 'native_turn'; threadId: string; turnId: string; account: string }
  | { type: 'native_branch'; parentThreadId: string; beforeTurnId: string; threadId: string }
  | { type: 'native_update'; update: import('./chat-runtime/codex-events.js').RuntimeUpdate }
  | { type: 'init'; sessionId: string; slashCommands?: string[]; terminalSlashCommands?: string[] }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_stop' }
  | { type: 'tool_start'; toolName: string; toolId: string }
  | { type: 'tool_input_delta'; toolId: string; partial: string }
  | { type: 'tool_done'; toolId: string }
  // Output real de la tool (bloques tool_result de los mensajes type:'user' del
  // SDK), truncado a TOOL_RESULT_MAX_CHARS. El chat lo usa para expandir una
  // pill y ver qué devolvió — no solo qué se le pidió. kind = clasificación del
  // sidecar tool_result_meta (SDK 0.3.216+): tool denegada/interrumpida/cancelada
  // sin string-matching sobre la prosa del resultado. durationMs = start→result
  // (incluye la ejecución real, no solo la emisión del input; por eso se mide
  // aquí y no en tool_done, que cierra cuando el modelo TERMINÓ DE PEDIR).
  | { type: 'tool_result'; toolId: string; content: string; isError?: boolean; kind?: string; durationMs?: number }
  | { type: 'todos_update'; todos: TodoItem[] }
  | { type: 'status'; status: string }
  | { type: 'compact'; tokensBefore?: number; tokensAfter?: number }
  | { type: 'usage'; accounting?: { estimatedCostUsd: number; cumulativeEstimatedCostUsd: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; scope: string; kind: string; billing: 'subscription' }; costUsd: number; inputTokens: number; outputTokens: number; durationMs: number; numTurns: number; model?: string; contextUsed?: number; contextTotal?: number; /** Esfuerzo con que corrió el turno; ausente si el motor no lo confirma (2 oct 2026). */ effort?: string; /** Motor que corrió el turno: 'claude' o 'codex' (2 oct 2026). */ engine?: 'claude' | 'codex' }
  | { type: 'result'; text: string; terminalReason?: string }
  // La meta (`/goal`) de Claude dentro del turno (27 oct 2026): cada revisión del evaluador y el estado al cerrar.
  // El texto que llega DESPUÉS de una revisión es de su vuelta, no de la respuesta (ver chat-runtime/meta-claude.ts).
  | { type: 'goal'; meta: VistaMeta }
  | { type: 'model_changed'; model: string | null; display?: string; resolved?: string | null }
  // Downgrade de modelo detectado en el turno: el modelo que PEDISTE (ej. Fable 5)
  // no fue el que RESPONDIÓ (ej. Opus 4.8). Causa típica: refusal fallback — Fable
  // corre clasificadores de seguridad y, al declinar, reencamina a su "hermano"
  // Opus (HTTP 200 + stop_reason:'refusal' + bloque content 'fallback'). refusal=false
  // ⇒ fue un fallback de capacidad (529), no un decline. category = la categoría del
  // clasificador (cyber|bio|frontier_llm|reasoning_extraction) cuando refusal=true.
  | { type: 'model_downgraded'; from: string; to: string; refusal: boolean; category?: string | null }
  | { type: 'interrupt' }
  | { type: 'error'; message: string; uncertain?: boolean }
  // ── SDK 0.3.201: subagentes/tasks en vivo + summaries + follow-up suggestions ──
  | { type: 'task_started'; taskId: string; description: string; subagentType?: string; taskType?: string; workflowName?: string; toolUseId?: string; parentTaskId?: string }
  | { type: 'task_progress'; taskId: string; description: string; totalTokens?: number; toolUses?: number; durationMs?: number; lastToolName?: string; summary?: string }
  | { type: 'task_updated'; taskId: string; status?: string; description?: string; error?: string }
  | { type: 'task_notification'; taskId: string; status: 'completed' | 'failed' | 'stopped'; summary: string; totalTokens?: number; toolUses?: number }
  | { type: 'tool_summary'; summary: string; toolUseIds: string[] }
  | { type: 'suggestion'; suggestion: string }
  | { type: 'fast_changed'; enabled: boolean }
  | { type: 'ultracode_changed'; enabled: boolean }
  // AskUserQuestion interactivo: el modelo pregunta con opciones, el chat pinta
  // botones y responde por POST /chat/answer (resuelve la promesa de canUseTool).
  | { type: 'ask_user_question'; requestId: string; questions: unknown[] }
  | { type: 'question_resolved'; requestId: string; outcome: 'answered' | 'skipped' | 'timeout' }

/**
 * Streaming version of runAgent. Yields SSE events as the agent works.
 * Uses includePartialMessages to get real-time text + tool call visibility.
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type OpsSource = 'web' | 'cron' | 'system' | 'alexa-skill'

// ── Rewind / edición de mensajes (SDK 0.3.201) ──
// Dado el sdkSessionId y el TEXTO ORIGINAL del mensaje editado, localiza ese
// mensaje en el transcript del SDK y devuelve el UUID del punto de corte para
// reanudar ANTES de él (fork). El checkpoint es el último mensaje ASSISTANT previo
// al prompt editado (mantiene pares tool_use/tool_result intactos). Sin assistant
// previo = editas el primer prompt → sesión fresca.
//
// Por qué match por CONTENIDO y no por ordinal: el transcript del SDK mezcla los
// prompts reales de Daniel con meta-mensajes que NO están en chat_messages
// (interrupts de pausa "[Request interrupted]", /compact, continuación de sesión,
// tool_results). Contar posiciones se desalinea con el cliente. Buscar por texto
// los ignora naturalmente (no coinciden) y es auto-corrector.
export interface RewindCheckpoint {
  // undefined = no hay checkpoint (editas el 1er prompt) → sesión fresca.
  checkpointUuid?: string
  // false = no se localizó el mensaje / transcript vacío → el caller continúa normal.
  found: boolean
}

// Texto plano de un mensaje de usuario del transcript (string directo o bloques text).
function userMessageText(m: SessionMessage): string | null {
  const c = (m.message as { content?: unknown } | null)?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    const parts = c
      .filter((b) => (b as { type?: string })?.type === 'text')
      .map((b) => (b as { text?: string }).text ?? '')
    return parts.length ? parts.join('\n') : null
  }
  return null
}

// Meta-mensajes que el SDK/Claude Code inyecta como type:'user' pero NO son prompts
// de Daniel — nunca deben matchear el texto editado.
function isMetaUserText(t: string): boolean {
  const s = t.trimStart()
  return (
    s.startsWith('[Request interrupted') ||
    s.startsWith('<command-name>') ||
    s.startsWith('<command-message>') ||
    s.startsWith('<command-args>') ||
    s.startsWith('<local-command-stdout>') ||
    s.startsWith('<local-command-stderr>') ||
    s.startsWith('This session is being continued') ||
    s.startsWith('Caveat:')
  )
}

export async function computeRewindCheckpoint(
  sdkSessionId: string,
  editOriginalText: string,
  // Desempate para textos duplicados: cuántas ocurrencias EXACTAS de este texto hay
  // desde el mensaje editado (inclusive) hasta el final, en el cliente. 1 = el más
  // reciente. El server salta (occ-1) matches desde el final y toma el siguiente.
  editOccurrenceFromEnd: number,
  account?: string,
): Promise<RewindCheckpoint> {
  const orig = (editOriginalText ?? '').trim()
  if (!sdkSessionId || !orig || !Number.isInteger(editOccurrenceFromEnd) || editOccurrenceFromEnd < 1) {
    return { found: false }
  }
  // El transcript vive en <configDir de la cuenta>/projects/<munged dir>. El
  // lector propio (claude-transcript.ts) reemplaza a getSessionMessages del
  // SDK, que devolvía [] con el formato 2.1.257 y dejaba la edición muerta.
  const accountConfigDir = configDirForAccount(account)
  try {
    const messages = (await readSessionMessages(sdkSessionId, { dir: PROJECT_ROOT, configDir: accountConfigDir })) as unknown as SessionMessage[]
    if (!messages.length) return { found: false }
    // Localiza el mensaje editado escaneando desde el FINAL. Dos pasadas: match
    // exacto y luego endsWith (por si el daemon antepuso [Context:]/[image] al
    // prompt). Salta (occ-1) coincidencias para desempatar duplicados.
    const findTarget = (mode: 'exact' | 'ends'): number => {
      let skip = editOccurrenceFromEnd - 1
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.type !== 'user') continue
        const t = userMessageText(m)
        if (!t || isMetaUserText(t)) continue
        const tt = t.trim()
        const hit = mode === 'exact' ? tt === orig : tt.endsWith(orig)
        if (!hit) continue
        if (skip > 0) { skip--; continue }
        return i
      }
      return -1
    }
    let targetPos = findTarget('exact')
    if (targetPos < 0) targetPos = findTarget('ends')
    if (targetPos < 0) return { found: false } // no localizado → caller continúa normal
    // Checkpoint = último ASSISTANT antes del prompt editado.
    for (let j = targetPos - 1; j >= 0; j--) {
      if (messages[j].type === 'assistant') {
        return { found: true, checkpointUuid: messages[j].uuid }
      }
    }
    // Sin assistant previo = editas el primer prompt → sesión fresca.
    return { found: true }
  } catch (err) {
    logger.warn({ err, sdkSessionId }, 'computeRewindCheckpoint failed')
    return { found: false }
  }
}

/** Texto para el dueño cuando un turno muere. El `[ede_diagnostic]` del SDK queda en el
 *  log (ops_events); en el chat se dice qué pasó y qué hacer. */
export function mensajeDeTurnoMuerto(errText: string | undefined, subtype: string | undefined, porTecho: boolean): string {
  if (porTecho) return 'El turno llegó al techo de tiempo configurado (ARBRAIN_TECHO_TURNO_MS) y se detuvo. Lo hecho hasta aquí quedó en disco; escribe «sigue» y Levy continúa desde donde quedó.'
  if (errText && /\[ede_diagnostic\][^\n]*stop_reason=tool_use/.test(errText)) {
    return 'El turno se cortó a media herramienta (el proceso del agente se detuvo antes de recibir el resultado). Lo hecho hasta aquí quedó en disco; escribe «sigue» y Levy continúa desde donde quedó.'
  }
  return errText ? `El turno murió del lado del agente: ${errText}` : `El turno terminó sin respuesta (${subtype ?? 'error'}).`
}

configurarBitacora(path.join(STORE_DIR, 'chrome-sitios.jsonl'))
function chromeHabilitado(): boolean {
  const v = process.env.LEVY_CHROME ?? readEnvFile(['LEVY_CHROME']).LEVY_CHROME
  return v !== '0' && v !== 'false'
}

export async function* runAgentStream(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
  effort?: EffortLevel,
  onQuery?: (q: Query) => void,
  source: OpsSource = 'web',
  // Modo solo-texto: deniega TODA herramienta. Lo usa el Segundo Cerebro para
  // síntesis: el material ya viene inline en el prompt, el agente no debe tocar
  // el filesystem ni ejecutar nada (respeta "NUNCA mutar .claude/memory" y cierra
  // el vector de inyección indirecta desde el contenido de la memoria).
  denyTools = false,
  // TEMPORAL: cuenta que factura este turno. undefined/'default' = la principal
  // (~/.claude), 'bro' = la alterna (su carpeta propia). Ver accountConfigDirs.
  account?: string,
  // Rewind/edición: UUID del mensaje hasta donde reanudar (resumeSessionAt). Cuando
  // se pasa, forkea a una nueva sesión (no destructivo) y reanuda ANTES del prompt
  // editado. Requiere `sessionId` (el resume). Ver computeRewindCheckpoint.
  resumeAtUuid?: string,
  // Overrides POR CONVERSACIÓN (/model, /effort, /fast, /ultracode) que el
  // server lee de chat_overrides con la sessionKey del chat. Ausente = defaults
  // del sistema (crons, síntesis, y toda conversación sin picks explícitos).
  overrides?: SessionOverrides,
  durable?: { scope: ClaudeTurnScope; onBackground: (event: ClaudeBackgroundEvent) => void; freshSession?: boolean; selection?: ClaudeSelection; live?: LiveToolbox
    /** Respuesta espontánea ya en curso en el proceso de la conversación (chat vivo, 3 oct 2026): no se
     * envía nada; solo se traducen sus mensajes al mismo flujo de eventos que un turno normal. */
    adopted?: { events: AsyncIterable<unknown>; interrupt: () => Promise<void>; bindCanUseTool: (fn: Options['canUseTool']) => void } },
): AsyncGenerator<SSEEvent> {
  // BYOK (empaquetado, 11 oct 2026; contrato §4): en la edición cliente, sin llave del alumno no se lanza el CLI.
  if (faltaLlaveClaude()) { yield { type: 'error', message: MENSAJE_FALTA_LLAVE }; return }
  // «Pausar todo» (seguridad del alumno, 12 oct 2026): en pausa no arranca ningún turno. Daniel: nunca pausado.
  if (esEdicionCliente() && pausado()) { yield { type: 'error', message: MENSAJE_PAUSA }; return }
  let turnResolvedModelId: string | null = null
  let turnContextWindowSize: number | null = null
  let turnContextTokens: number | null = null
  let releaseTurn: (() => void) | undefined
  let removeInterrupt: (() => void) | undefined
  const ac = new AbortController()
  // NO es el límite del turno de chat: ese lo pone el vigilante de server.ts (inactividad
  // 30 min / techo 2 h) con su aviso amable. Esto es solo la red final, después del techo.
  let porTecho = false
  // Sin techo por defecto (11 oct 2026): solo si se configuró uno. setTimeout con Infinity dispararía al instante.
  const timeout = CHAT_STREAM_HARD_CAP_MS > 0 ? setTimeout(() => { porTecho = true; ac.abort() }, CHAT_STREAM_HARD_CAP_MS) : undefined
  const quitarDeEnCurso = esEdicionCliente() ? registrarEnCurso(ac) : undefined

  // Credenciales por-request: si la conversación corre bajo una cuenta alterna,
  // apuntamos el CLI a su config dir (Keychain/OAuth aislados). Sin override, el
  // SDK usa el ~/.claude del daemon (Daniel). delete explícito = blindaje por si
  // el daemon heredara CLAUDE_CONFIG_DIR del entorno.
  const accountConfigDir = account ? accountConfigDirs()[account] : defaultAccountConfigDir()
  // Edición cliente: la cuenta alterna no existe; nunca se cae a otra carpeta en silencio.
  if (account === 'bro' && !accountConfigDir) throw new Error(CUENTA_ALTERNA_NO_DISPONIBLE)
  // Edición cliente (contrato v2): llaves solo para el CLI y scrub para Bash/hooks/MCP (cliente/cofre.ts). Daniel: igual.
  const queryEnv: Record<string, string> = {
    ...entornoClaude(process.env, esEdicionCliente()),
    CLAUDECLAW_DAEMON: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  }
  if (accountConfigDir) queryEnv.CLAUDE_CONFIG_DIR = accountConfigDir
  else delete queryEnv.CLAUDE_CONFIG_DIR

  // Link external signal to our abort controller
  const externalAbort = () => ac.abort()
  signal?.addEventListener('abort', externalAbort, { once: true })
  if (signal?.aborted) ac.abort()

  let resultText = ''
  let inTool = false
  let inThinking = false
  let currentToolId: string | null = null
  let currentToolName: string | null = null
  let toolStartTime = 0
  // start de CADA tool por id (varias pueden estar en vuelo en paralelo): la
  // duración real se computa cuando llega SU tool_result, no en tool_done.
  const toolStartTimes = new Map<string, number>()
  let streamSessionId: string | undefined
  let boundInput = false
  let lastTurnInputTokens: number | null = null
  const seenAssistantIds = new Set<string>()
  // Vista «Memoria y contexto» (4 oct 2026): usage MEDIDO de la primera y la última llamada del turno.
  let primeraLlamada: UsoLlamada | null = null
  let ultimaLlamada: UsoLlamada | null = null
  // Guard anti-duplicado de thinking: con display:'summarized' el SDK viejo NO
  // streameaba thinking_delta (solo el bloque final en el assistant message) y
  // por eso forwardeamos el bloque. Si el SDK nuevo SÍ streamea deltas para un
  // mensaje, forwardear también el bloque final duplicaría el texto en la UI.
  let streamedThinkingChars = 0

  // ── Detección de downgrade de modelo (Fable → Opus por refusal fallback) ──
  // turnServedModel  = lo que REALMENTE respondió el turno (message.model del
  //                    assistant final). Alimenta el label del header.
  // downgradeFrom/To = marca explícita del bloque content 'fallback' que el SDK
  //                    inyecta en el mensaje cuando Fable declina y reencamina.
  //                    Es la ÚNICA señal de disparo del sello (no comparamos
  //                    pedido-vs-servido: tras el switch la convo queda pegada a
  //                    Opus y esa comparación se cumpliría en cada turno).
  // refusalCategory  = categoría del clasificador si el stream la expone.
  let turnServedModel: string | null = null
  let downgradeFrom: string | null = null
  let downgradeTo: string | null = null
  let refusalCategory: string | null = null

  // Cola lateral de eventos generados FUERA del loop del SDK. canUseTool corre
  // en su propio contexto async mientras el for-await está suspendido esperando
  // al SDK — y el SDK no emite NADA mientras una tool está bloqueada. Sin esta
  // cola (+ el merge de abajo), el evento ask_user_question jamás llegaría al
  // cliente y la pregunta interactiva sería invisible.
  const sideEvents: SSEEvent[] = []
  let sideNotify: (() => void) | null = null
  const pushSideEvent = (ev: SSEEvent) => {
    sideEvents.push(ev)
    sideNotify?.()
  }

  // Per-message effort (magic words) wins; otherwise fall back to the
  // conversation's /effort pick. undefined = SDK/model default (high).
  const frozenSelection = durable?.selection
  const modelOverride = frozenSelection?.model ?? overrides?.model ?? null
  const effectiveEffort = frozenSelection ? frozenSelection.effort ?? undefined : effort ?? overrides?.effort ?? undefined
  const ultracodeEnabled = frozenSelection?.ultracode ?? overrides?.ultracode ?? false

  // Guard fast-mode (fix "si elijo Fable, corre Fable"): fast mode es Opus-only.
  // Si Daniel eligió un modelo NO-Opus (ej. Fable), aplicar settings.fastMode:true
  // forzaría Opus por debajo → el pick sería una mentira (label Fable, corre Opus).
  // Con override no-Opus, no mandamos fastMode: se respeta el modelo elegido de verdad.
  const fastApplies = (overrides?.fast ?? false) && (!modelOverride || /opus/i.test(modelOverride))

  let resumeId = sessionId
  // Rewind: al reanudar en un punto anterior forkeamos a nueva sesión (no
  // destructivo). Se nulifica en el retry-fresh (abajo) junto con resumeId.
  let rewindAt = resumeAtUuid
  let triedFresh = false
  // Red team 3 A-6 (edición cliente): el CLI no pudo aplicar el sandbox (`failIfUnavailable: true`). Se apaga el
  // sandbox para todo el daemon (desde ahí TODO Bash pide confirmación) y se reintenta UNA vez sin él.
  let triedSinSandbox = false
  const sandboxFallo = (texto: string): boolean => {
    if (!esEdicionCliente() || triedSinSandbox || !esFalloDeSandbox(texto)) return false
    triedSinSandbox = true
    if (marcarSandboxFallido(texto)) logger.warn({ motivo: texto.slice(0, 300) }, 'sandbox no disponible: todo Bash pedirá confirmación')
    return true
  }
  // Turno que el SDK cerró con `result` de error (is_error/subtype error_*). Se
  // marca aquí y se resuelve al salir del for-await. Ver el bloque is_error abajo.
  let errorResult: { subtype?: string; errText: string } | null = null
  // Edición cliente (humo 13 oct, hallazgo 2): llave rechazada o sin crédito. Se detecta en el primer `api_retry`
  // (o en el error del turno), se corta el turno y se responde en español en vez de esperar ~3 min de reintentos.
  let falloCuenta: { tipo: FalloDeCuenta; detalle: string } | null = null
  const errorDeCuenta = () => {
    const f = falloCuenta!
    let proveedor: string | null = null
    try { proveedor = estadoLlaves().proveedor } catch { /* sin proveedor: texto genérico */ }
    logger.warn({ tipo: f.tipo, detalle: f.detalle.slice(0, 300), account }, 'turno cortado: la cuenta de la llave falló')
    opsLogger.log('agent_error', source, { error: f.detalle.slice(0, 300), subtype: f.tipo, account }, streamSessionId)
    return { type: 'error' as const, message: mensajeFalloDeCuenta(f.tipo, proveedor, f.detalle) }
  }
  const textoFalloCuenta = (texto: string): FalloDeCuenta | null => (esEdicionCliente() ? clasificarFalloDeCuenta({ texto }) : null)
  // La meta (`/goal`) de Claude, solo en turnos del chat (27 oct 2026, chat-runtime/meta-claude.ts). Que Daniel
  // escriba devuelve a «en curso» una meta frenada por repetición; su pausa se respeta hasta que la reanude.
  const claveMeta = durable && !denyTools ? EstadoMetas.clave(durable.scope) : null
  const comandoMeta = claveMeta ? comandoMetaNativo(message) : null
  if (claveMeta && !durable?.adopted) estadoMetas.alEscribirPersona(claveMeta)
  if (claveMeta && comandoMeta) estadoMetas.poner(claveMeta, comandoMeta.accion === 'quitar' ? 'quitada' : 'en_curso', comandoMeta.accion === 'fijar' ? comandoMeta.condicion : undefined)
  const seguidorMeta = new SeguidorMeta(() => !!claveMeta && estadoMetas.pausada(claveMeta), (claveMeta && estadoMetas.get(claveMeta)?.condicion) || '')
  let metaInterrumpida = false
  let topeMetaCli = false
  try {
  while (true) {
   try {
    if (ac.signal.aborted) throw new ClaudeSubmissionCancelled('Abortado antes de enviar.')
    if (frozenSelection) {
      if (frozenSelection.account !== (account ?? 'default')) throw new Error('Claude execution account mismatch')
      if (frozenSelection.account !== durable!.scope.account) throw new Error('Claude scope account mismatch')
    }
    const cabina = cabinaMcpConfig(durable ? { owner: durable.scope.owner, account: durable.scope.account, conversationId: durable.scope.conversationId } : undefined)
    // 0.1.2: en la edición cliente (macOS y Windows) las manos van por código como la Cabina; el interruptor y el freno
    // viven en su proceso (sin el interruptor encendido no lista ninguna herramienta).
    const manos = durable && !denyTools && esEdicionCliente() && computerUseDisponible() ? manosMcpConfig() : null
    // claude-in-chrome (firmado 1 oct): solo turnos del chat (durable), nunca
    // síntesis ni crons. El guardián de sitios sensibles va como hook PreToolUse,
    // que sí corre con bypassPermissions. LEVY_CHROME=0 lo apaga sin tocar código.
    const conChrome = !!durable && !denyTools && chromeHabilitado()
    // Una sola vía (27 oct 2026): el gancho de la sesión lee si ESTE turno puede usar Workflow (mensaje con ultracode).
    const claveViaUnica = !denyTools ? (durable ? claveConversacion(durable.scope) : `${source}:${resumeId ?? 'nuevo'}`) : null
    if (claveViaUnica) marcarTurno(claveViaUnica, message, ultracodeEnabled)
    // Autónomo (0.2.15): el SDK en `default` sin clasificador; la guardia aprueba de forma explícita lo que la red mínima deja.
    const modoSdk = modoPermisosSdk({ cliente: esEdicionCliente(), denyTools: !!denyTools, live: !!durable?.live, autonomo: esEdicionCliente() && esAutonomo() })
    const queryOptions: Options = {
        cwd: PROJECT_ROOT,
        // Cabina: las manos de Levy sobre la interfaz de Arbrain (vistas vivas y
        // navegación). Solo turnos del chat web (durable) y nunca en síntesis.
        // stdio = JSON puro: no rompe la firma del pool entre turnos.
        ...((durable?.live || (durable && !denyTools && cabina)) ? { mcpServers: {
          ...(durable && !denyTools && cabina ? { cabina } : {}),
          ...(manos ? { manos } : {}),
          ...(durable?.live ? { live: durable.live.mcp() } : {}),
        } } : {}),
        resume: resumeId,
        // Editar un mensaje pasado: reanuda SOLO hasta este UUID y forkea a una
        // sesión nueva, así el contexto de Levy se rebobina de verdad (no solo
        // la UI). Requiere resume (resumeId). Ver computeRewindCheckpoint.
        ...(resumeId && rewindAt && { resumeSessionAt: rewindAt, forkSession: true }),
        // Load project CLAUDE.md + skills but NOT hooks.
        // Hooks (session-end, pre-compact, knowledge-compile) are for Claude Code IDE only.
        // ClaudeClaw is a daemon — hooks would spawn recursive agent sessions.
        settingSources: fuentesDeAjustes(['project', 'user']),
        // Edición cliente: + guardia destructiva programática (guardia-agentes.ts). Daniel: igual que siempre.
        hooks: conViaUnica(conGuardia(conChrome ? chromeHooks(claveConversacion(durable!.scope), evento => opsLogger.log('browser_site', source, evento)) : {}, ev => logger.warn(ev, 'guardia de agentes'), { clasificador: modoSdk.clasificador, ...(resumeId && rewindAt ? { heredaDe: resumeId } : {}), ...colaDe(durable) }), claveViaUnica),
        extraArgs: conChrome ? { chrome: null } : { 'no-chrome': null },
        // ClaudeClaw runs headless on Mac Mini — no UI to approve prompts.
        // Modo NORMAL: bypassPermissions skip all checks (safety net = el hook
        // guard-destructive.sh). Modo SÍNTESIS (denyTools): NO bypass — el bypass
        // se salta canUseTool, así que un allow-todo dejaría pasar Write/Bash.
        // Con permissionMode:'default' + canUseTool que deniega, cada tool se
        // rechaza programáticamente (headless, sin colgar) y además se filtran
        // por nombre las tools mutantes/ejecutoras/red (defensa en capas).
        // Live must reach canUseTool for AskUserQuestion. The SDK explicitly
        // shadows this callback in bypassPermissions; other authorized tools
        // retain the existing allow decision in the callback below.
        // Edición cliente (AUDITORIA I4): nunca bypass; la instalación de Daniel no cambia.
        // Botón Play (27 oct 2026): edición cliente en `auto` (clasificador del SDK para lo rutinario; la tarjeta del hilo
        // para lo demás). Daniel, como firmó: bypass. Ver cliente/permisos-sdk.ts.
        permissionMode: modoSdk.permissionMode,
        allowDangerouslySkipPermissions: modoSdk.allowDangerouslySkipPermissions,
        canUseTool: denyTools
          ? async (_toolName, _input) => ({
              behavior: 'deny' as const,
              message: 'Modo síntesis solo-texto: sin herramientas. Responde con el material provisto.',
            })
          // Edición cliente (red team C1): lista blanca + confirmación humana (permisosCliente). Daniel: igual que siempre.
          : permisosCliente(async (toolName, input, toolOpts) => {
              // AskUserQuestion: la única tool que requiere interacción humana.
              // Se pinta en el chat como botones; la respuesta llega por
              // POST /chat/answer → answerUserQuestion() resuelve esta promesa.
              if (toolName === 'AskUserQuestion') {
                const requestId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                return await new Promise<QuestionResolution>((resolve) => {
                  const timer = setTimeout(() => {
                    if (pendingQuestions.delete(requestId)) {
                      pushSideEvent({ type: 'question_resolved', requestId, outcome: 'timeout' })
                      resolve({ behavior: 'deny', message: 'El usuario no respondió (timeout). Continúa con tu mejor criterio sin bloquearte.' })
                    }
                  }, ASK_QUESTION_TIMEOUT_MS)
                  pendingQuestions.set(requestId, { resolve, input, timer, settled: outcome => pushSideEvent({ type: 'question_resolved', requestId, outcome }) })
                  // Interrupt/abort del turno (ESC, stream reemplazado): liberar la promesa
                  toolOpts?.signal?.addEventListener?.('abort', () => {
                    if (pendingQuestions.delete(requestId)) {
                      clearTimeout(timer)
                      resolve({ behavior: 'deny', message: 'Interrumpido por el usuario.' })
                    }
                  }, { once: true })
                  const questions = Array.isArray((input as { questions?: unknown[] }).questions)
                    ? (input as { questions: unknown[] }).questions
                    : []
                  pushSideEvent({ type: 'ask_user_question', requestId, questions })
                  logger.info({ requestId, count: questions.length }, 'ask_user_question pending')
                })
              }
              return { behavior: 'allow' as const, updatedInput: input }
            }, ev => logger.warn(ev, 'guardia de agentes (canUseTool)'), { clasificador: modoSdk.clasificador, ...colaDe(durable) }),
        disallowedTools: denyTools
          ? [
              'Bash', 'BashOutput', 'KillShell', 'KillBash',
              'Edit', 'Write', 'MultiEdit', 'NotebookEdit',
              'Read', 'Glob', 'Grep',
              'Task', 'TodoWrite', 'WebFetch', 'WebSearch',
              'Skill', 'SlashCommand', 'ExitPlanMode',
              'mcp__*',
            ]
          // Chat: crons de sesión y MCPs con popup fuera, y una sola vía para subagentes (Agent/Task fuera; Workflow
          // solo con ultracode, por el gancho de abajo). Ver cabina/una-sola-via.ts.
          : herramientasProhibidasChat({ durable: !!durable }),
        abortController: ac,
        includePartialMessages: true,
        // «Deshacer desde aquí» (27 oct 2026, chat-runtime/deshacer.ts): copia de cada archivo antes de editarlo, solo
        // en turnos del chat. ARBRAIN_CHECKPOINTS=0 lo apaga.
        ...(durable && !denyTools && opcionesCheckpoint()),
        env: queryEnv,
        // Frozen model IDs already preserve the selected context qualifier.
        // Do not globally opt every accepted model into a different variant.
        ...(!frozenSelection && { betas: ['context-1m-2025-08-07'] as Options['betas'] }),
        // Effort resolution: a per-message effort (magic words like "ultrathink")
        // overrides the persistent /effort preference for this single message.
        ...(effectiveEffort && { effort: effectiveEffort }),
        // Thinking VISIBLE en todos los mensajes (no solo max/xhigh). En Opus 4.8
        // el default es display:'omitted' → los bloques de thinking llegan con texto
        // vacío y el componente "Thinking" del chat se ve roto (aparece pero no se
        // llena). `type:'adaptive'` deja que el modelo decida la profundidad (sin
        // budget_tokens, que da 400 en Opus 4.7/4.8) y `display:'summarized'` +
        // includePartialMessages streamea los tokens de pensamiento suave a la UI.
        ...(!frozenSelection && { thinking: { type: 'adaptive', display: 'summarized' } as const }),
        ...(modelOverride && { model: modeloParaProveedor(modelOverride) }),
        // ── SDK 0.3.201 (solo chat, no síntesis) ──
        // promptSuggestions: chips de follow-up al final del turno (el CLI emite
        // prompt_suggestion → la UI los pinta como sugerencias tocables).
        // settings (flag layer): fast mode + ultracode standing, toggleados por
        // /fast y /ultracode. El keyword "ultracode" en un mensaje funciona solo
        // (trigger default del SDK nuevo) sin necesidad del standing mode.
        ...(!denyTools && { promptSuggestions: true }),
        ...((fastApplies || ultracodeEnabled) && !denyTools && {
          settings: {
            ...(fastApplies && { fastMode: true }),
            ...(ultracodeEnabled && { ultracode: true }),
          },
        }),
        // Edición cliente: sandbox del sistema para Bash y la guardia que el proyecto no puede apagar. Daniel: nada.
        // Red team 2 C-1: también en síntesis (denyTools), para que ganchos del proyecto alterados no corran.
        ...(esEdicionCliente() && opcionesSesionCliente(denyTools ? undefined : {
          ...(fastApplies && { fastMode: true }),
          ...(ultracodeEnabled && { ultracode: true }),
        }, { registrar: ev => logger.warn(ev, 'ganchos del proyecto') })),
        ...(frozenSelection && claudeSelectionOptions(frozenSelection)),
    }
    const adopted = durable?.adopted
    if (adopted) {
      // Las preguntas que Levy haga durante la respuesta espontánea llegan a ESTE turno.
      adopted.bindCanUseTool(queryOptions.canUseTool)
      const interrupt = () => { void adopted.interrupt().catch(() => {}) }
      ac.signal.addEventListener('abort', interrupt, { once: true })
      removeInterrupt = () => ac.signal.removeEventListener('abort', interrupt)
      if (ac.signal.aborted) interrupt()
    }
    if (durable?.live) claudeRuntimePool.invalidate(durable.scope)
    const pooled = durable && !durable.live && !adopted ? claudeRuntimePool.open(durable.scope, queryOptions, message, durable.onBackground, durable.freshSession) : undefined
    const stream = adopted ? undefined : pooled?.query ?? query({ prompt: message, options: queryOptions })
    releaseTurn = pooled?.release
    // Motor «Mi Claude Code»: la sesión del pool ya confirma la suscripción antes de enviar; la vía directa corta el
    // turno si el CLI no corre con la cuenta de Claude de la persona (nunca se cobra por API en silencio).
    if (stream && !pooled && motorSuscripcion()) await confirmClaudeSubscription(() => stream.accountInfo())
    if (frozenSelection && stream) {
      await validateClaudeSelection(PROJECT_ROOT, durable!.scope.account, frozenSelection, stream)
      if (ac.signal.aborted) throw new ClaudeSubmissionCancelled('Abortado antes de enviar.')
    }
    if (pooled) {
      const interrupt = () => {
        void pooled.query.interrupt().catch(() => pooled.session.close())
      }
      ac.signal.addEventListener('abort', interrupt, { once: true })
      removeInterrupt = () => ac.signal.removeEventListener('abort', interrupt)
      if (ac.signal.aborted) interrupt()
    }

    // Expose Query object to caller for interrupt/setModel/etc.
    if (stream) onQuery?.(stream)
    // Freno de la meta: corta la vuelta que el CLI acaba de abrir. No es el Stop de Daniel (no aborta `ac`): el turno
    // cierra como completado y la meta sigue viva en el CLI para su siguiente mensaje.
    const interrumpirVuelta = () => {
      const p = adopted ? adopted.interrupt() : (pooled?.query ?? stream)?.interrupt()
      void p?.catch(() => {})
    }

    // Merge del stream del SDK con la cola lateral: mientras una tool está
    // bloqueada (pregunta interactiva pendiente) el SDK no emite NADA, pero los
    // side-events (ask_user_question, timeouts) sí deben fluir al cliente.
    const sdkIterator = ((adopted?.events ?? pooled?.events ?? stream) as AsyncIterable<unknown>)[Symbol.asyncIterator]()
    let sdkNext = sdkIterator.next()
    while (true) {
      while (sideEvents.length > 0) yield sideEvents.shift()!
      const winner = await Promise.race([
        sdkNext.then((r) => ({ kind: 'sdk' as const, r })),
        new Promise<{ kind: 'side' }>((resolveRace) => {
          sideNotify = () => resolveRace({ kind: 'side' })
        }),
      ])
      sideNotify = null
      if (winner.kind === 'side') continue
      const { done, value } = winner.r
      if (done) break
      sdkNext = sdkIterator.next()
      const e = value as Record<string, unknown>
      // Ya se cortó por la cuenta: se sigue drenando (abandonar el generador del SDK tumba el daemon) sin emitir nada.
      if (falloCuenta) continue
      if (claveMeta) {
        // Revisión «no se cumple» del evaluador: abre una vuelta. Al repetirse sin acción nueva (o con la meta en
        // pausa) se frena aquí, porque el CLI no tiene pausa y su propio tope llega tarde.
        const revision = leerRevision(e)
        if (revision) {
          const frenar = seguidorMeta.revision(revision)
          yield { type: 'goal', meta: seguidorMeta.vista(frenar ? 'esperando' : 'en_curso') }
          if (frenar && !metaInterrumpida) {
            metaInterrumpida = true
            logger.info({ conversationId: durable!.scope.conversationId, por: seguidorMeta.frenadaPor }, 'meta frenada: espera a la persona')
            interrumpirVuelta()
          }
          continue
        }
        // Algunas versiones del SDK anuncian el cierre de la meta (null = cumplida o limpiada) y la pausa del CLI.
        if (e['type'] === 'active_goal' && e['value'] === null && seguidorMeta.activa) seguidorMeta.cumplida()
        if (e['type'] === 'system' && (e['subtype'] === 'informational' || e['subtype'] === 'notification') && /Goal paused|goal checks kept/i.test(JSON.stringify(e))) topeMetaCli = true
      }
      if (esEdicionCliente() && e['type'] === 'system' && e['subtype'] === 'api_retry') {
        const tipo = clasificarFalloDeCuenta({ status: e['error_status'], error: e['error'] })
        if (tipo) {
          const st = typeof e['error_status'] === 'number' ? `API Error: ${e['error_status']}` : 'API Error'
          falloCuenta = { tipo, detalle: `${st}${typeof e['error'] === 'string' ? ` (${e['error']})` : ''}` }
          ac.abort()
          continue
        }
      }
      // El aviso de error que el CLI deja como mensaje del asistente (`error` del SDK) cuando no reintenta.
      if (esEdicionCliente() && e['type'] === 'assistant' && typeof e['error'] === 'string') {
        const contenido = (e['message'] as { content?: Array<{ text?: unknown }> } | undefined)?.content
        const texto = Array.isArray(contenido) ? contenido.map(b => (typeof b?.text === 'string' ? b.text : '')).join(' ') : ''
        const tipo = clasificarFalloDeCuenta({ error: e['error'], texto })
        if (tipo) {
          falloCuenta = { tipo, detalle: texto || String(e['error']) }
          ac.abort()
          continue
        }
      }
      if (durable && !boundInput && e['user_message_uuid'] === durable.scope.turnId && typeof e['session_id'] === 'string') {
        boundInput = true
        yield { type: 'native_turn', threadId: e['session_id'], turnId: durable.scope.turnId, account: durable.scope.account }
      }

      // System init
      if (e['type'] === 'system' && e['subtype'] === 'init') {
        if (e['model']) turnResolvedModelId = e['model'] as string
        streamSessionId = e['session_id'] as string
        opsLogger.log('session_start', source, {
          model: turnResolvedModelId,
          prompt: message.slice(0, 200),
        }, streamSessionId)
        const initCommands = e['slash_commands'] as string[] | undefined
        const initTerminal = e['terminal_slash_commands'] as string[] | undefined
        // Alimenta el catálogo de la paleta "/" con lo que el SDK anunció en un turno real.
        try { getCommandCatalog().ingestInit(account ?? 'default', { slashCommands: initCommands, terminalSlashCommands: initTerminal, skills: e['skills'] as string[] | undefined, agents: e['agents'] as string[] | undefined }) } catch { /* el catálogo nunca debe romper un turno */ }
        yield {
          type: 'init',
          sessionId: streamSessionId,
          slashCommands: initCommands,
          ...(initTerminal?.length ? { terminalSlashCommands: initTerminal } : {}),
        }
      }

      // El SDK empuja la lista completa de comandos tras un cambio a mitad de sesión: reemplaza la caché.
      if (e['type'] === 'system' && e['subtype'] === 'commands_changed' && Array.isArray(e['commands'])) {
        try { getCommandCatalog().ingestChanged(account ?? 'default', e['commands'] as Parameters<ReturnType<typeof getCommandCatalog>['ingestChanged']>[1]) } catch { /* idem */ }
      }

      // Status events: 'requesting' (v0.2.108+ before each API request) and 'compacting'.
      // Cast to string because v0.2.104 only has 'compacting' but post-upgrade has 'requesting'.
      if (e['type'] === 'system' && e['subtype'] === 'status') {
        const status = e['status']
        if (status != null) {
          yield { type: 'status', status: String(status) }
        }
      }

      // Compact boundary: SDK provides pre_tokens; post-compact size comes from next assistant message
      if (e['type'] === 'system' && e['subtype'] === 'compact_boundary') {
        const meta = e['compact_metadata'] as Record<string, unknown> | undefined
        const preTokens = meta?.['pre_tokens'] as number | undefined
        // Reset tracking so the next assistant message gives us post-compact context size
        lastTurnInputTokens = null
        turnContextTokens = null  // Clear stale pre-compact value so status doesn't show old number
        seenAssistantIds.clear()
        opsLogger.log('session_compact', source, {
          tokensBefore: preTokens,
        }, streamSessionId)
        yield {
          type: 'compact',
          tokensBefore: preTokens,
        }
      }

      // ── Tasks en background (subagentes, workflows/ultracode, shells) ──
      // El SDK 0.3.201 emite el ciclo de vida completo; lo forwardeamos para que
      // el chat pinte cards vivas tipo agent-view de Claude Code. skip_transcript
      // marca tasks internas que el CLI no muestra — las respetamos.
      if (e['type'] === 'system' && e['subtype'] === 'task_started' && e['skip_transcript'] !== true) {
        yield {
          type: 'task_started',
          taskId: e['task_id'] as string,
          description: (e['description'] as string) ?? '',
          subagentType: e['subagent_type'] as string | undefined,
          taskType: e['task_type'] as string | undefined,
          workflowName: e['workflow_name'] as string | undefined,
          toolUseId: e['tool_use_id'] as string | undefined,
          // El subagente que lanzó esta tarea (SDK `parent_task_id`); ausente si la lanzó el hilo principal.
          parentTaskId: e['parent_task_id'] as string | undefined,
        }
      }
      if (e['type'] === 'system' && e['subtype'] === 'task_progress') {
        const u = e['usage'] as { total_tokens?: number; tool_uses?: number; duration_ms?: number } | undefined
        yield {
          type: 'task_progress',
          taskId: e['task_id'] as string,
          description: (e['description'] as string) ?? '',
          totalTokens: u?.total_tokens,
          toolUses: u?.tool_uses,
          durationMs: u?.duration_ms,
          lastToolName: e['last_tool_name'] as string | undefined,
          summary: e['summary'] as string | undefined,
        }
      }
      if (e['type'] === 'system' && e['subtype'] === 'task_updated') {
        const patch = e['patch'] as { status?: string; description?: string; error?: string } | undefined
        yield {
          type: 'task_updated',
          taskId: e['task_id'] as string,
          status: patch?.status,
          description: patch?.description,
          error: patch?.error,
        }
      }
      if (e['type'] === 'system' && e['subtype'] === 'task_notification' && e['skip_transcript'] !== true) {
        const u = e['usage'] as { total_tokens?: number; tool_uses?: number } | undefined
        yield {
          type: 'task_notification',
          taskId: e['task_id'] as string,
          status: e['status'] as 'completed' | 'failed' | 'stopped',
          summary: (e['summary'] as string) ?? '',
          totalTokens: u?.total_tokens,
          toolUses: u?.tool_uses,
        }
      }

      // Resumen display-friendly de un batch de tool calls (SDK 0.3.179+)
      if (e['type'] === 'tool_use_summary') {
        yield {
          type: 'tool_summary',
          summary: (e['summary'] as string) ?? '',
          toolUseIds: (e['preceding_tool_use_ids'] as string[]) ?? [],
        }
      }

      // Sugerencia de follow-up (promptSuggestions: true)
      if (e['type'] === 'prompt_suggestion' && typeof e['suggestion'] === 'string' && e['suggestion'].length > 0) {
        yield { type: 'suggestion', suggestion: e['suggestion'] }
      }

      // Assistant messages carry per-turn usage (= real context size for that turn)
      // Total context = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
      // Deduplicate by message ID (parallel tool calls share the same ID)
      //
      // ALSO extract thinking blocks from message.content here. With adaptive thinking
      // (Opus 4.6+ default), the SDK does NOT emit `thinking_delta` events during the
      // partial stream — only `content_block_start`/`stop` for type 'thinking', with
      // the full text packaged in the assistant message. So we forward it as a single
      // `thinking_delta` chunk so the UI's accumulator picks it up.
      if (e['type'] === 'assistant') {
        const msg = e['message'] as {
          id?: string
          model?: string
          usage?: Record<string, number>
          content?: Array<{
            type: string
            thinking?: string
            text?: string
            name?: string
            input?: Record<string, unknown>
          }>
        } | undefined
        const msgId = msg?.id
        // Modelo que REALMENTE firmó este mensaje (BetaMessage.model). Si un
        // refusal de Fable reencaminó a Opus, aquí llega 'claude-opus-4-8' aunque
        // se pidió Fable. El último assistant del turno gana (el que sirvió).
        if (msg?.model) turnServedModel = msg.model
        const usage = msg?.usage
        if (msgId && usage && !seenAssistantIds.has(msgId)) {
          seenAssistantIds.add(msgId)
          const totalContext = (usage['input_tokens'] ?? 0)
            + (usage['cache_creation_input_tokens'] ?? 0)
            + (usage['cache_read_input_tokens'] ?? 0)
          if (totalContext > 0) {
            lastTurnInputTokens = totalContext
            ultimaLlamada = { input: usage['input_tokens'] ?? 0, cacheCreacion: usage['cache_creation_input_tokens'] ?? 0, cacheLectura: usage['cache_read_input_tokens'] ?? 0, salida: usage['output_tokens'] ?? 0 }
            primeraLlamada ??= ultimaLlamada
          }
        }

        // Forward thinking content from finalized assistant message (one block at a time).
        // Also surface TodoWrite calls as a structured todos_update event so the UI
        // can render Levy's plan/phases as a live checklist (same UX as Claude Code CLI).
        // Guard: si este mensaje YA streameó thinking via thinking_delta (SDK nuevo),
        // el bloque final duplicaría el texto — solo forwardear cuando NO hubo stream.
        const hadStreamedThinking = streamedThinkingChars > 0
        streamedThinkingChars = 0
        if (Array.isArray(msg?.content)) {
          for (const block of msg.content) {
            if (block?.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.length > 0 && !hadStreamedThinking) {
              yield { type: 'thinking_delta', text: block.thinking }
            }
            // Refusal fallback: cuando Fable declina y reencamina a su hermano, el
            // SDK inyecta un content block 'fallback' con { from:{model}, to:{model} }
            // en el mensaje. Es la señal fiable del reroute (verificado en el
            // transcript). Solo aparece en el turno donde el switch ocurre.
            if (block?.type === 'fallback') {
              const fb = block as unknown as { from?: { model?: string }; to?: { model?: string } }
              if (fb.from?.model) downgradeFrom = fb.from.model
              if (fb.to?.model) downgradeTo = fb.to.model
            }
            if (block?.type === 'tool_use' && block.name === 'TodoWrite' && block.input) {
              const raw = block.input['todos']
              if (Array.isArray(raw)) {
                const todos: TodoItem[] = raw.flatMap((t): TodoItem[] => {
                  if (!t || typeof t !== 'object') return []
                  const item = t as Record<string, unknown>
                  const content = typeof item['content'] === 'string' ? item['content'] : null
                  const status = item['status']
                  if (!content || (status !== 'pending' && status !== 'in_progress' && status !== 'completed')) return []
                  const todo: TodoItem = { content, status: status as TodoStatus }
                  if (typeof item['activeForm'] === 'string') todo.activeForm = item['activeForm']
                  return [todo]
                })
                if (todos.length > 0) {
                  yield { type: 'todos_update', todos }
                }
              }
            }
          }
        }
      }

      // ── Outputs de tools ──
      // El SDK entrega los resultados como mensajes type:'user' con bloques
      // tool_result. Se forwardean truncados para que el chat pueda expandir la
      // pill de una tool y ver input Y output. Se saltan los mensajes de
      // subagentes (parent_tool_use_id): sus tools no tienen pill en el chat.
      if (e['type'] === 'user' && !e['parent_tool_use_id']) {
        const msg = e['message'] as { content?: unknown } | undefined
        const meta = e['tool_result_meta'] as { non_execution_kind?: string } | undefined
        if (Array.isArray(msg?.content)) {
          for (const rawBlock of msg.content) {
            const b = rawBlock as { type?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }
            if (b?.type !== 'tool_result' || !b.tool_use_id) continue
            let text = toolResultText(b.content)
            if (text.length > TOOL_RESULT_MAX_CHARS) {
              text = text.slice(0, TOOL_RESULT_MAX_CHARS) + '\n… [output truncado]'
            }
            const startedAt = toolStartTimes.get(b.tool_use_id)
            toolStartTimes.delete(b.tool_use_id)
            yield {
              type: 'tool_result',
              toolId: b.tool_use_id,
              content: text,
              ...(b.is_error === true && { isError: true }),
              ...(meta?.non_execution_kind && { kind: meta.non_execution_kind }),
              ...(startedAt != null && { durationMs: Date.now() - startedAt }),
            }
          }
        }
      }

      // Stream events (partial messages)
      if (e['type'] === 'stream_event') {
        const ev = e['event'] as Record<string, unknown>
        const evType = ev['type'] as string

        if (evType === 'content_block_start') {
          const block = ev['content_block'] as Record<string, unknown>
          if (block?.['type'] === 'tool_use') {
            const toolName = block['name'] as string
            const toolId = block['id'] as string
            inTool = true
            currentToolId = toolId
            currentToolName = toolName
            toolStartTime = Date.now()
            toolStartTimes.set(toolId, toolStartTime)
            opsLogger.log('tool_start', source, { toolName, toolId }, streamSessionId)
            seguidorMeta.herramienta()
            yield { type: 'tool_start', toolName, toolId }
          }
          if (block?.['type'] === 'thinking') {
            inThinking = true
            yield { type: 'thinking_start' }
          }
          // Refusal fallback: cuando Fable declina y reencamina a su hermano, el
          // stream trae un content block 'fallback' con { from:{model}, to:{model} }.
          // Es la marca EXACTA del reroute — más fiable que comparar ids sueltos.
          if (block?.['type'] === 'fallback') {
            const from = (block['from'] as { model?: string } | undefined)?.model
            const to = (block['to'] as { model?: string } | undefined)?.model
            if (from) downgradeFrom = from
            if (to) downgradeTo = to
          }
        }

        // message_delta: si el stream expone el stop_reason 'refusal', capturamos
        // la categoría del clasificador (cyber|bio|frontier_llm|...) para el tooltip.
        // El DISPARO del sello es el bloque 'fallback' (arriba), no esto — la
        // categoría es enriquecimiento opcional.
        if (evType === 'message_delta') {
          const delta = ev['delta'] as Record<string, unknown> | undefined
          if (delta?.['stop_reason'] === 'refusal') {
            const details = delta['stop_details'] as { category?: string } | undefined
            if (details?.category) refusalCategory = details.category
          }
        }

        if (evType === 'content_block_delta') {
          const delta = ev['delta'] as Record<string, unknown>
          const deltaType = delta?.['type']

          if (deltaType === 'text_delta' && !inTool && !inThinking) {
            const text = delta['text'] as string
            resultText += text
            seguidorMeta.texto(text)
            yield { type: 'text_delta', text }
          }

          if (deltaType === 'thinking_delta') {
            const text = delta['thinking'] as string | undefined
            if (text) {
              streamedThinkingChars += text.length
              yield { type: 'thinking_delta', text }
            }
          }

          if (deltaType === 'input_json_delta' && currentToolId) {
            const partial = delta['partial_json'] as string | undefined
            if (partial) yield { type: 'tool_input_delta', toolId: currentToolId, partial }
          }
        }

        if (evType === 'content_block_stop') {
          if (inThinking) {
            yield { type: 'thinking_stop' }
            inThinking = false
          }
          if (inTool && currentToolId) {
            const elapsed = Date.now() - toolStartTime
            opsLogger.log('tool_done', source, {
              toolName: currentToolName,
              toolId: currentToolId,
              durationMs: elapsed,
            }, streamSessionId)
            yield { type: 'tool_done', toolId: currentToolId }
            inTool = false
            currentToolId = null
            currentToolName = null
          }
        }
      }

      // Result message with usage data
      if (e['type'] === 'result') {
        const raw = e['result']
        if (typeof raw === 'string') {
          resultText = raw
        } else if (raw && typeof raw === 'object' && 'result' in raw) {
          resultText = (raw as { result: string }).result
        }

        // ── Turno muerto que NO lanza excepción (fix 15 jul 2026) ──────────────
        // El SDK no siempre THROWEA cuando el turno falla: cierra limpio con un
        // `result` de subtype 'error_*', is_error:true, `result` VACÍO, usage en
        // ceros y sin modelUsage — y el motivo real escondido en el array `errors`.
        // Como aquí sólo mirábamos `result`, emitíamos texto vacío como si fuera
        // la respuesta: burbuja en blanco, sin error y sin botón de reintentar. Eso
        // es lo que Daniel vivía como "ya no me respondiste wey" (2 turnos largos
        // perdidos el 15 jul). Un turno que muere en silencio es peor que uno que
        // falla: el que falla se ve.
        const subtype = e['subtype'] as string | undefined
        const isErrorResult = e['is_error'] === true
        const sdkErrors = Array.isArray(e['errors']) ? (e['errors'] as unknown[]).map(String) : []

        // La vuelta que cortó el freno de la meta no es un turno muerto.
        if ((isErrorResult || (subtype && subtype !== 'success')) && !(metaInterrumpida && subtype === 'error_during_execution')) {
          // Sólo MARCAMOS y salimos de este `if`: ni emitimos el result vacío (que
          // el cliente pinta como burbuja en blanco y da el turno por bueno) ni
          // rompemos el for-await. Abandonar el generador del SDK es fatal: el SDK
          // lanza el error de forma asíncrona justo después de este mensaje y, sin
          // nadie consumiendo, se vuelve unhandled rejection y TUMBA el daemon
          // (probado en carne propia el 15 jul).
          // Al seguir drenando, ese throw cae en el catch de abajo → el retry-fresh
          // que YA existía se ejecuta y el turno se recupera solo. Si el SDK no
          // llegara a lanzar, el bloque post-loop emite el error explícito.
          // Edición cliente (A/B ronda 2): un 402 o «Credit balance is too low» puede llegar solo en `result`, con
          // `errors` vacío; sin él, el chat no podía reconocer «sin crédito» y ofrecer recargar. Daniel: sin cambio.
          const textoResult = esEdicionCliente() && !sdkErrors.length && typeof e['result'] === 'string' ? String(e['result']).slice(0, 2000) : ''
          errorResult = { subtype, errText: sdkErrors.length ? sdkErrors.join(' | ') : textoResult }
          logger.warn({ subtype, errors: sdkErrors, account }, 'result con is_error — no se emite como respuesta')
          continue
        }

        // Extract model + context window from modelUsage (authoritative source)
        const modelUsage = e['modelUsage'] as Record<string, Record<string, unknown>> | undefined
        if (modelUsage) {
          const models = Object.keys(modelUsage)
          if (models.length > 0) {
            turnResolvedModelId = models[0]
            const info = modelUsage[models[0]]
            if (typeof info?.['contextWindow'] === 'number') {
              turnContextWindowSize = info['contextWindow'] as number
            }
          }
        }
        // Unknown context stays unknown; enabling a beta is not a measurement.

        // Extract usage data from result message
        const accounting = e['arbrainUsage'] as { estimatedCostUsd: number; cumulativeEstimatedCostUsd: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; scope: string; kind: string } | undefined
        const costUsd = accounting?.estimatedCostUsd ?? (e['total_cost_usd'] as number) ?? 0
        const usage = (e['usage'] as Record<string, number>) ?? {}
        const durationMs = (e['duration_ms'] as number) ?? 0
        const numTurns = (e['num_turns'] as number) ?? 0

        // Use last assistant message's total context as real context size
        if (lastTurnInputTokens != null) {
          turnContextTokens = lastTurnInputTokens
        }

        opsLogger.log('agent_result', source, {
          costUsd,
          inputTokens: accounting?.inputTokens ?? usage['input_tokens'] ?? 0,
          outputTokens: accounting?.outputTokens ?? usage['output_tokens'] ?? 0,
          durationMs,
          numTurns,
          model: turnResolvedModelId,
          resultLength: resultText.length,
        }, streamSessionId)

        // ── Downgrade por refusal fallback (Fable → Opus) ──
        // DISPARO = SOLO el bloque 'fallback' que el SDK inyecta en el turno del
        // reroute. NO comparamos pedido-vs-servido: tras el switch la conversación
        // queda pegada a Opus y esa comparación se cumpliría en CADA turno (el
        // cliente ya lo dedup para mostrar el sello una vez, pero el disparador
        // debe ser la señal real). fallbackModel NO está configurado en este
        // daemon, así que un fable→opus SIEMPRE es un decline de seguridad (no un
        // fallback de capacidad por 529) → refusal:true.
        const dFrom = modelBase(downgradeFrom)
        const dTo = modelBase(downgradeTo)
        if (dFrom && dTo && dFrom !== dTo) {
          opsLogger.log('model_downgraded', source, {
            from: dFrom, to: dTo, refusal: true, category: refusalCategory,
          }, streamSessionId)
          yield {
            type: 'model_downgraded',
            from: dFrom,
            to: dTo,
            refusal: true,
            category: refusalCategory ?? undefined,
          }
        }

        yield {
          type: 'usage',
          costUsd,
          ...(accounting ? { accounting: { ...accounting, billing: 'subscription' as const } } : {}),
          inputTokens: accounting?.inputTokens ?? usage['input_tokens'] ?? 0,
          outputTokens: accounting?.outputTokens ?? usage['output_tokens'] ?? 0,
          durationMs,
          numTurns,
          // El header refleja el modelo que REALMENTE respondió el turno
          // (message.model del assistant final), no solo el pick. Si Fable
          // reencaminó a Opus, el header muestra Opus 4.8 — la verdad de quién
          // contestó. A salvo del bug del 8 jul: los crons ya NO tocan este estado
          // (usan runAgent con vars locales) y turnServedModel es de ESTE turno de
          // chat. Fallback a override/resolved si el turno no dejó message.model.
          model: turnServedModel ?? modelOverride ?? turnResolvedModelId ?? undefined,
          contextUsed: turnContextTokens ?? undefined,
          contextTotal: turnContextWindowSize ?? undefined,
          ...(effectiveEffort ? { effort: effectiveEffort } : {}),
          engine: 'claude' as const,
        }

        // Solo turnos del chat (durable): guarda el usage y, cada 10 min por conversación, el desglose del SDK.
        if (durable && !denyTools && !durable.live) registrarTurno({
          conversacion: durable.scope.conversationId, cuenta: durable.scope.account, turno: durable.scope.turnId, sesion: streamSessionId,
          modelo: turnServedModel ?? turnResolvedModelId, ventana: turnContextWindowSize, llamadas: seenAssistantIds.size,
          primera: primeraLlamada, ultima: ultimaLlamada,
        }, stream as unknown as Parameters<typeof registrarTurno>[1])

        let terminalReason = e['terminal_reason'] as string | undefined
        if (claveMeta && (seguidorMeta.activa || comandoMeta)) {
          // Cierre de la meta en este turno. Terminó solo, sin freno ni tope del CLI, tras revisiones = la última pasó.
          let estado: VistaMeta['estado']
          if (comandoMeta?.accion === 'quitar' && !seguidorMeta.activa) estado = 'quitada'
          else {
            if (!metaInterrumpida && !topeMetaCli && (!terminalReason || terminalReason === 'completed')) seguidorMeta.cumplida()
            estado = seguidorMeta.estadoFinal()
          }
          const vista = seguidorMeta.vista(estado, true)
          estadoMetas.poner(claveMeta, estado, vista.condicion)
          yield { type: 'goal', meta: vista }
          // La respuesta del turno es la principal; las vueltas viajan plegadas en `goal`.
          if (seguidorMeta.activa) resultText = seguidorMeta.respuesta() || resultText
          if (metaInterrumpida && (terminalReason === 'aborted_streaming' || terminalReason === 'interrupted')) terminalReason = 'completed'
        }
        yield { type: 'result', text: resultText, terminalReason }
      }
    }
    // El stream terminó SIN lanzar pero el turno murió (result con is_error). El
    // camino normal es que el SDK lance y lo agarre el catch (ahí vive el
    // retry-fresh); esto es la red por si un subtype de error no lanza: mismo
    // remedio si es un resume huérfano, si no, error explícito. Nunca silencio.
    if (falloCuenta) { yield errorDeCuenta(); break }
    if (errorResult) {
      const { subtype, errText } = errorResult
      errorResult = null
      const tipoCuenta = textoFalloCuenta(errText)
      if (tipoCuenta) { falloCuenta = { tipo: tipoCuenta, detalle: errText }; yield errorDeCuenta(); break }
      if (sandboxFallo(errText) && !durable) continue  // durable: el siguiente turno ya abre sin sandbox
      if (!durable && resumeId && !triedFresh && /No conversation found with session ID/i.test(errText)) {
        triedFresh = true
        resumeId = undefined
        rewindAt = undefined
        logger.warn({ sessionId, account }, 'resume huérfano (result sin throw) — reintento con sesión fresca')
        continue
      }
      logger.error({ subtype, errText, account, porTecho }, 'turno terminó en error sin throw')
      opsLogger.log('agent_error', source, { error: errText || subtype, subtype, account, porTecho }, streamSessionId)
      yield {
        type: 'error',
        message: mensajeDeTurnoMuerto(errText, subtype, porTecho),
      }
      break
    }
    // Drenar side-events que hayan quedado encolados al cerrar el stream
    while (sideEvents.length > 0) yield sideEvents.shift()!
    break
   } catch (err) {
    const msg = String(err)
    if (falloCuenta) { yield errorDeCuenta(); break }
    if (!ac.signal.aborted) {
      const tipoCuenta = textoFalloCuenta(msg)
      if (tipoCuenta) { falloCuenta = { tipo: tipoCuenta, detalle: msg }; yield errorDeCuenta(); break }
    }
    if (sandboxFallo(msg) && !durable) continue  // durable: el siguiente turno ya abre sin sandbox
    // El resume apunta a una sesion que Claude Code no tiene (ej. la sesion
    // "Automatizaciones" la creo el webhook del cron directo en Supabase, nunca
    // corrio por aqui). En vez de tronar, reintenta UNA vez arrancando sesion
    // nueva — el init emitira el nuevo session_id y el server lo re-mapea.
    if (!durable && resumeId && !triedFresh && /No conversation found with session ID/i.test(msg)) {
      triedFresh = true
      resumeId = undefined
      rewindAt = undefined // sin resume no hay a dónde rebobinar
      logger.warn({ sessionId }, 'resume session not found — retrying fresh')
      continue
    }
    logger.error({ err }, 'runAgentStream error')
    opsLogger.log('agent_error', source, { error: msg }, streamSessionId)
    if (err instanceof ClaudeSubmissionCancelled) {
      yield { type: 'interrupt' }
    } else if (err instanceof ClaudeExecutionUncertain) {
      yield { type: 'error', message: msg, uncertain: true }
    } else if (ac.signal.aborted && porTecho) {
      yield { type: 'error', message: mensajeDeTurnoMuerto(msg, undefined, true) }
    } else if (ac.signal.aborted) {
      yield { type: 'interrupt' }
    } else if (msg.includes('abort')) {
      yield { type: 'error', message: 'Abortado.' }
    } else if (/usage policy|unable to respond to this request/i.test(msg)) {
      // Bloqueo duro de política de uso (ej. el clasificador de Fable no pudo
      // reencaminar y devolvió error en vez de delegar). Mensaje limpio en vez
      // del stack de API + Request ID (que igual queda en ops_events para debug).
      yield { type: 'error', message: 'No puedo responder a eso: la petición viola la política de uso de Anthropic. Reformúlala o cambia de modelo.' }
    } else {
      yield { type: 'error', message: msg }
    }
    break
   }
  }
  } finally {
    clearTimeout(timeout)
    quitarDeEnCurso?.()
    signal?.removeEventListener('abort', externalAbort)
    removeInterrupt?.()
    releaseTurn?.()
  }
}

/**
 * Spawna el CLI `claude` real como subprocess via Agent SDK.
 *
 * Clave: bypassPermissions = sin prompts de aprobación → el bot no cuelga.
 * settingSources ['project','user'] = carga CLAUDE.md de este dir + skills globales de ~/.claude/
 * resume = continúa la sesión anterior (memoria de conversación nativa de Claude Code)
 */
export async function runAgent(
  message: string,
  sessionId?: string,
  onTyping?: () => void,
  source: OpsSource = 'web',
  timeoutMs?: number,
): Promise<AgentResult> {
  let resultText: string | null = null
  let newSessionId: string | undefined
  let slashCommands: string[] | undefined
  let isCompact = false
  let tokensBefore: number | undefined
  let tokensAfter: number | undefined
  let terminalReason: string | undefined
  let resultUsage: AgentUsage | undefined
  // Piso de telemetría para el catch: si el run muere por abort/timeout ANTES
  // del evento `result` (81% de los errores cron históricos), estos contadores
  // permiten reportar volumen real (tokens/turnos) aunque no haya costo exacto.
  let partialOutputTokens = 0
  let partialTurns = 0

  // AISLAMIENTO CRON↔CHAT (fix bug "el modelo revierte a Opus"): runAgent (crons)
  // corre con variables de modelo/contexto LOCALES y NUNCA toca las
  // globales, que son del CHAT (runAgentStream). Antes compartían estado global de
  // módulo: un cron (corren cada pocos minutos) heredaba el /model que Daniel eligió
  // en el chat, y su resolvedModelId pisaba el que el label del chat leía por el eco
  // `usage`. Con esto los crons usan el default del sistema y no contaminan el chat.
  let cronResolvedModel: string | null = null
  let cronContextWindow: number | null = null
  let cronLastContext: number | null = null

  const effectiveTimeout = timeoutMs ?? AGENT_TIMEOUT_MS
  const typingInterval = onTyping ? setInterval(onTyping, 4000) : null
  if (esEdicionCliente() && pausado()) throw new Error(MENSAJE_PAUSA)
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), effectiveTimeout)
  const quitarDeEnCurso = esEdicionCliente() ? registrarEnCurso(ac) : undefined

  // Cron jobs run non-interactively. Auto-allow every tool so MCP/Bash/Skill
  // calls don't dead-end waiting for an approval that will never come.
  // OAuth Max blocks `bypassPermissions`, so we use canUseTool instead.
  const isCron = source === 'cron'

  try {
    const stream = query({
      prompt: message,
      options: {
        cwd: PROJECT_ROOT,
        resume: sessionId,
        // Cron skips user settings — ~/.claude/settings.json has
        // `permissions.allow: ["Bash(file:*)"]` which gates curl/python/gog/etc
        // behind manual approval, dead-ending non-interactive jobs. Skills
        // still load through the project's symlinked .claude/skills.
        settingSources: isCron ? ['project'] : fuentesDeAjustes(['project', 'user']),
        // Edición cliente: la guardia también corre en crons (AUDITORIA riesgo 2). Daniel: sin hooks, como siempre.
        hooks: conGuardia({}, ev => logger.warn(ev, 'guardia de agentes (cron)'), { origen: 'cron' }),
        // ClaudeClaw daemon runs headless on Mac Mini — no UI for approvals.
        // Both cron AND web chat use bypassPermissions because there's no
        // human at a terminal to approve. The PreToolUse hook
        // `~/.claude/hooks/guard-destructive.sh` still blocks `rm -rf`,
        // force-pushes to main, etc — that's the real safety net.
        permissionMode: esEdicionCliente() ? 'default' : 'bypassPermissions',
        allowDangerouslySkipPermissions: !esEdicionCliente(),
        canUseTool: permisosCliente(async (toolName, input) => {
          // Crons corren headless sin UI: una pregunta interactiva colgaría el
          // job hasta el timeout. Denegar al instante con instrucción de decidir.
          if (toolName === 'AskUserQuestion') {
            return { behavior: 'deny' as const, message: 'Contexto headless (cron): no hay usuario para preguntar. Decide tú con tu mejor criterio.' }
          }
          return { behavior: 'allow' as const, updatedInput: input }
        }, ev => logger.warn(ev, 'guardia de agentes (cron, canUseTool)'), { origen: 'cron' }),
        ...(esEdicionCliente() && opcionesSesionCliente(undefined, { registrar: ev => logger.warn(ev, 'ganchos del proyecto (cron)') })),
        abortController: ac,
        env: (isCron ? configuredCronEnvironment() : { ...entornoClaude(process.env, esEdicionCliente()), CLAUDECLAW_DAEMON: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }) as Record<string, string>,
        betas: ['context-1m-2025-08-07'],
        // Block claude.ai web MCPs that require interactive OAuth popups —
        // ClaudeClaw runs headless, so the popup never shows. Use `gog` CLI
        // (Bash) instead for Gmail/Calendar/Drive — already authenticated via
        // GOG_KEYRING_PASSWORD on the host.
        disallowedTools: [
          'mcp__claude_ai_Google_Calendar__*',
          'mcp__claude_ai_Gmail__*',
          'mcp__claude_ai_Google_Drive__*',
        ],
        // Sin `model`: los crons corren SIEMPRE en el default del sistema, NO en el
        // override que Daniel eligió en el chat (aislamiento cron↔chat, ver arriba).
      },
    })

    for await (const event of stream) {
      const e = event as Record<string, unknown>

      if (e['type'] === 'system' && e['subtype'] === 'init') {
        newSessionId = e['session_id'] as string | undefined
        slashCommands = e['slash_commands'] as string[] | undefined
        if (e['model']) cronResolvedModel = e['model'] as string
        opsLogger.log('session_start', source, {
          model: cronResolvedModel,
          prompt: message.slice(0, 200),
        }, newSessionId)
      }

      if (e['type'] === 'system' && e['subtype'] === 'compact_boundary') {
        isCompact = true
        const meta = e['compact_metadata'] as Record<string, unknown> | undefined
        if (meta) {
          tokensBefore = meta['pre_tokens'] as number | undefined
        }
        opsLogger.log('session_compact', source, { tokensBefore }, newSessionId)
      }

      // Track last assistant message's total context (input + cache tokens)
      if (e['type'] === 'assistant') {
        const msg = e['message'] as { usage?: Record<string, number> } | undefined
        const usage = msg?.usage
        if (usage) {
          const totalContext = (usage['input_tokens'] ?? 0)
            + (usage['cache_creation_input_tokens'] ?? 0)
            + (usage['cache_read_input_tokens'] ?? 0)
          if (totalContext > 0) cronLastContext = totalContext
          partialOutputTokens += usage['output_tokens'] ?? 0
          partialTurns += 1
        }
      }

      if (e['type'] === 'result') {
        const mu = e['modelUsage'] as Record<string, Record<string, unknown>> | undefined
        if (mu) {
          const models = Object.keys(mu)
          if (models.length > 0) {
            cronResolvedModel = models[0]
            const info = mu[models[0]]
            if (typeof info?.['contextWindow'] === 'number') cronContextWindow = info['contextWindow'] as number
          }
        }
        if (cronContextWindow == null) cronContextWindow = 1_000_000

        const raw = e['result']
        if (typeof raw === 'string') {
          resultText = raw
        } else if (raw && typeof raw === 'object' && 'result' in raw) {
          resultText = (raw as { result: string }).result
        }

        const costUsd = (e['total_cost_usd'] as number) ?? 0
        const usage = (e['usage'] as Record<string, number>) ?? {}
        const durationMs = (e['duration_ms'] as number) ?? 0
        const numTurns = (e['num_turns'] as number) ?? 0

        terminalReason = e['terminal_reason'] as string | undefined

        // Usage del run completo — el caller (scheduler) lo une al jobId del cron
        resultUsage = {
          costUsd,
          inputTokens: usage['input_tokens'] ?? 0,
          outputTokens: usage['output_tokens'] ?? 0,
          durationMs,
          numTurns,
          model: cronResolvedModel ?? undefined,
        }

        opsLogger.log('agent_result', source, {
          costUsd,
          inputTokens: usage['input_tokens'] ?? 0,
          outputTokens: usage['output_tokens'] ?? 0,
          durationMs,
          numTurns,
          model: cronResolvedModel,
          resultLength: resultText?.length ?? 0,
          terminalReason,
        }, newSessionId)
      }
    }
  } catch (err) {
    logger.error({ err }, 'runAgent error')
    const msg = String(err)
    // Red team 3 A-6: la rutina falló porque el CLI no pudo aplicar el sandbox; la próxima corre sin él (todo Bash
    // confirmado, que en una rutina sin persona delante equivale a negado).
    if (esEdicionCliente() && esFalloDeSandbox(msg) && marcarSandboxFallido(msg)) logger.warn({ motivo: msg.slice(0, 300) }, 'sandbox no disponible (rutina): todo Bash pedirá confirmación')
    // No descartar telemetría ya calculada: si el SDK alcanzó a emitir `result`
    // (caso session/weekly limit) resultUsage está completo; si murió por abort
    // antes (el caso dominante), construir un piso honesto con los tokens/turnos
    // observados y costUsd 0 (volumen real, sin inventar dólares).
    const partialUsage: AgentUsage | undefined = resultUsage
      ?? (partialTurns > 0
        ? { costUsd: 0, inputTokens: 0, outputTokens: partialOutputTokens, durationMs: 0, numTurns: partialTurns, model: cronResolvedModel ?? undefined }
        : undefined)
    opsLogger.log('agent_error', source, {
      error: msg,
      ...(partialUsage && {
        costUsd: partialUsage.costUsd,
        inputTokens: partialUsage.inputTokens,
        outputTokens: partialUsage.outputTokens,
        numTurns: partialUsage.numTurns,
      }),
    }, newSessionId)
    let wrapped: Error
    if (ac.signal.aborted || msg.includes('abort')) {
      wrapped = new Error('Me tardé demasiado pensando. Intenta de nuevo con un mensaje más corto o haz /newchat.')
    } else if (msg.includes('timeout') || msg.includes('Timeout')) {
      wrapped = new Error('Se agotó el tiempo de respuesta. Intenta de nuevo.')
    } else {
      wrapped = err instanceof Error ? err : new Error(msg)
    }
    ;(wrapped as Error & { partialUsage?: AgentUsage }).partialUsage = partialUsage
    throw wrapped
  } finally {
    clearTimeout(timeout)
    quitarDeEnCurso?.()
    if (typingInterval) clearInterval(typingInterval)
  }

  logger.debug({ sessionId, newSessionId, length: resultText?.length, isCompact }, 'runAgent complete')
  return { text: resultText, newSessionId, slashCommands, isCompact, tokensBefore, tokensAfter, terminalReason, usage: resultUsage }
}

/**
 * Get available models from the SDK. Creates a temporary query to call supportedModels(),
 * then immediately interrupts to avoid executing any prompt.
 */
export async function getAvailableModels(sessionId?: string): Promise<ModelInfo[]> {
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 30_000)

  try {
    const stream = query({
      prompt: '/status',
      options: {
        cwd: PROJECT_ROOT,
        ...(sessionId && { resume: sessionId }),
        settingSources: fuentesDeAjustes(['project', 'user']),
        permissionMode: 'acceptEdits',
        abortController: ac,
        // Edición cliente (red team 2 C-1): sesión de metadatos, sin ganchos del proyecto. Daniel: igual.
        ...sinGanchosCliente(),
      },
    })

    const models = await stream.supportedModels()
    await stream.interrupt()
    return models
  } catch (err) {
    logger.error({ err }, 'getAvailableModels error')
    return []
  } finally {
    clearTimeout(timeout)
  }
}
