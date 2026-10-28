'use client'

import { leerFila, type FilaTurno } from '../lib/fila-turno'
import { settleQuestions } from '../lib/question-lifecycle'
import { confirmStopped } from '../lib/cancel-confirmation'
import { anotarEscritura } from '@/features/cabina/panel/presencia'
import { useState, useCallback, useRef, useEffect } from 'react'
import { isOnline, queueChatPrompt, syncChatQueue, acknowledgeQueuedChat, cancelQueuedChat, confirmQueuedChatSelection, listSyncQueue } from '@/lib/local-first'
import { esStatusTransitorio, reintentosVencidos, REVISION_COLA_MS } from '../lib/reintento-envios'
import { useChatSettings } from './useChatSettings'
import { isNonDefaultAccount, type ChatAccount } from '../stores/account-store'
import { restoreTurnPair, snapshotMessage, type DurableSnapshot } from '../lib/durable-recovery'
import type { MetaTurno } from '../lib/meta'
import { anotarHerramienta, anotarPensamiento, type PasoCronologia } from '../lib/rastro'
import { offlineEnvelope, type ChatIntent } from '../lib/offline-envelope'
import { effortLabel } from '../lib/effort-labels'
import { cachedSelection, refreshSelection, invalidateSelection, selectionIsStale, selectionRevision, SELECTION_CHANGED } from '../lib/selection-cache'
import { useAuth } from '@/hooks/useAuth'
import { marcarAbrirVivo, verboDe } from '@/features/cabina/model'
import { herramientaEscribe, refrescarCabina } from '@/features/cabina/datos'
import { marcarEnvioLocal } from '../lib/turnos-activos'
import { marcarStreamLocal } from '@/lib/actividad-viva'
import { useCommandStore } from '../stores/command-store'
import { leerDesenlace, notaDelHost, trasTerminar, unirNotas, type InyeccionHost, type NotaInyectada } from '../lib/inyecciones'

// Espejo local del standing mode ultracode (el daemon no expone GET del estado).

export interface CompactMeta {
  tokensBefore?: number
  tokensAfter?: number
}

export interface ToolCall {
  toolId: string
  toolName: string
  status: 'running' | 'done'
}

// Output real de una tool (evento tool_result del daemon), truncado a ~8KB del
// lado del server. kind = clasificación del SDK cuando la tool NO se ejecutó
// (denegada/interrumpida/cancelada). durationMs = start→result (ejecución real).
export interface ToolOutput {
  content: string
  isError?: boolean
  kind?: string
  durationMs?: number
}

export interface UsageMeta {
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  numTurns: number
  contextUsed?: number
  contextTotal?: number
  /** Modelo y esfuerzo que reportó el motor para ESTE turno (formato único, 2 oct 2026); ausentes si no los dijo. */
  model?: string
  effort?: string
}

// El modelo que respondió el turno NO fue el que pediste. Caso típico: refusal
// fallback — Fable 5 declinó por seguridad y su hermano Opus 4.8 contestó.
// refusal=false ⇒ fue fallback de capacidad (529). category (si refusal) = la
// categoría del clasificador: cyber | bio | frontier_llm | reasoning_extraction.
export interface ModelDowngrade {
  from: string
  to: string
  refusal: boolean
  category?: string | null
}

export interface FileAttachmentMeta {
  url: string
  filename: string
  mimeType: string
  size?: number
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export interface TodoItem {
  content: string
  status: TodoStatus
  activeForm?: string
}

// Subagente/task en background (Agent tool, workflows/ultracode, shells).
// Ciclo: task_started → task_progress* → task_updated/task_notification.
export interface AgentTask {
  taskId: string
  description: string
  subagentType?: string
  taskType?: string
  workflowName?: string
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'killed' | 'paused' | 'pending'
  totalTokens?: number
  toolUses?: number
  lastToolName?: string
  summary?: string
  error?: string
}

// ── AskUserQuestion interactivo: Levy pregunta con opciones, Daniel toca ──
export interface UserQuestionOption {
  label: string
  description?: string
}
export interface UserQuestion {
  question: string
  header?: string
  options: UserQuestionOption[]
  multiSelect?: boolean
}
export interface QuestionPrompt {
  requestId: string
  questions: UserQuestion[]
  status: 'pending' | 'answered' | 'skipped' | 'timeout'
  answers?: Record<string, string>
}

// Metadata persistida junto al mensaje en Supabase (jsonb). Los extras del
// turno (tasks, summaries, preguntas, usage, sugerencias) viajan aquí para que
// recargar la sesión reconstruya la conversación fiel — no solo el texto.
export interface MessageMetadata {
  source?: string
  // Chat vivo (3 oct 2026): turno que Daniel no escribió. `espontanea` = Levy respondió solo a un aviso de
  // subagente o comando en segundo plano; `despertador` = lo disparó un despertador que Levy programó.
  origen?: { tipo: 'espontanea' | 'despertador'; etiqueta?: string; despertadorId?: string }
  jobId?: string
  /** Reporte de la mañana entregado como vista viva «diario» (5 oct 2026): el chat no pinta su markdown. */
  /** Clave de la persona del reporte (config/instalacion.ts › personas). */
  reporteVivo?: string
  /** Desde el 10 oct 2026 el de Daniel trae un mensaje corto de Levy que SÍ se pinta bajo la vista. */
  reporteConTexto?: boolean
  jobLabel?: string
  // Identidad del turno (UUID generado por el cliente al enviar). Viaja en las
  // DOS filas del par user+assistant y en el webhook de ClaudeClaw. Un índice
  // único en BD sobre (metadata->>'turnId', role) garantiza CERO duplicados
  // sin importar quién gane la carrera de guardado (cliente vs server).
  turnId?: string
  // Cuándo EMPEZÓ el turno (ms, created_at del journal del daemon), 1 oct 2026. Las filas se insertan al
  // terminar el turno; con su created_at un turno largo se ordenaba después del siguiente. Ver lib/orden-turnos.
  startedAt?: number
  fileAttachments?: FileAttachmentMeta[]
  tasks?: AgentTask[]
  toolSummaries?: string[]
  questionPrompts?: QuestionPrompt[]
  suggestions?: string[]
  usage?: UsageMeta
  downgrade?: ModelDowngrade
  // Detalle expandible de tools (30 jul 2026): pills tocables → nombre completo
  // + input + output. Persistidos (con caps por tool) para que las sesiones
  // recargadas también puedan expandir, no solo el streaming vivo.
  toolCalls?: ToolCall[]
  toolInputs?: Record<string, string>
  toolOutputs?: Record<string, ToolOutput>
  terminalStatus?: string
  error?: string | null
  runtimeSnapshot?: DurableSnapshot
  /** Inyección a mitad de turno (7 oct 2026): esta fila de Daniel entró al turno `injectedInto` mientras corría. */
  injectedInto?: string
  /** Herramienta del turno tras la que el motor tomó el mensaje (dónde se pinta en la actividad). */
  afterToolId?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  error?: boolean
  audioUrl?: string
  imageUrl?: string
  compact?: CompactMeta
  metadata?: MessageMetadata | null
  fileAttachments?: FileAttachmentMeta[]
  toolCalls?: ToolCall[]
  toolInputs?: Record<string, string>     // toolId → JSON parcial acumulado mientras el modelo emite el input
  toolOutputs?: Record<string, ToolOutput> // toolId → output real (truncado server-side) para la card expandida
  todos?: TodoItem[]                       // lista activa de TODOs (Levy planeando por fases via TodoWrite)
  tasks?: AgentTask[]                      // subagentes/workflows en background (cards vivas tipo agent-view)
  toolSummaries?: string[]                 // resúmenes display-friendly de batches de tools (SDK 0.3.179+)
  questionPrompts?: QuestionPrompt[]       // preguntas interactivas (AskUserQuestion) del turno
  thinking?: string                        // bloque thinking acumulado durante streaming
  cronologia?: PasoCronologia[]            // pensamiento (offsets sobre `thinking`) y herramientas en el orden real
  status?: string | null                   // 'requesting' | 'compacting' | etc — null cuando termina
  fila?: FilaTurno | null                  // con status 'en_fila_turno': qué tiene delante (avisos, mensajes, pregunta)
  usage?: UsageMeta
  downgrade?: ModelDowngrade               // el modelo pedido ≠ el que respondió (ej. Fable→Opus por seguridad)
  streaming?: boolean
  terminalStatus?: string
  diagnostic?: string
  runtimeItems?: Record<string, Record<string, unknown>>
  persistenceWarnings?: string[]
  branch?: { parentThreadId: string; beforeTurnId: string; threadId: string }
  /** Lo que Daniel escribió con este turno vivo, pintado dentro de su actividad (lib/inyecciones). */
  inyectados?: NotaInyectada[]
  /** La meta (`/goal`) de Claude en este turno: revisiones y vueltas, plegadas bajo la respuesta (lib/meta). */
  meta?: MetaTurno | null
}

// SSE event types from ClaudeClaw
type SSEEvent =
  | { type: 'init'; sessionId: string; slashCommands?: string[] }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_stop' }
  | { type: 'tool_start'; toolName: string; toolId: string }
  | { type: 'tool_input_delta'; toolId: string; partial: string }
  | { type: 'tool_done'; toolId: string }
  | { type: 'tool_result'; toolId: string; content: string; isError?: boolean; kind?: string; durationMs?: number }
  | { type: 'todos_update'; todos: TodoItem[] }
  | { type: 'status'; status: string; fila?: unknown }
  | { type: 'compact'; tokensBefore?: number; tokensAfter?: number }
  | { type: 'usage'; costUsd: number; inputTokens: number; outputTokens: number; durationMs: number; numTurns: number; model?: string; contextUsed?: number; contextTotal?: number; effort?: string; engine?: 'claude' | 'codex' }
  | { type: 'result'; text: string; terminalReason?: string }
  // La meta de Claude (27 oct 2026): tras una revisión, el texto que sigue es de su vuelta (lib/meta).
  | { type: 'goal'; meta: MetaTurno }
  | { type: 'file_attachment'; url: string; filename: string; mimeType: string }
  | { type: 'model_changed'; model: string | null; display?: string; resolved?: string | null }
  | { type: 'model_downgraded'; from: string; to: string; refusal?: boolean; category?: string | null }
  | { type: 'effort_changed'; effort: string | null }
  | { type: 'interrupt' }
  | { type: 'error'; message: string }
  | { type: 'terminal'; status: string }
  | { type: 'execution_uncertain'; message: string }
  | { type: 'resume_snapshot'; cursor: number; state: DurableSnapshot; turnStatus: string }
  | { type: 'native_branch'; parentThreadId: string; beforeTurnId: string; threadId: string }
  | { type: 'task_started'; taskId: string; description: string; subagentType?: string; taskType?: string; workflowName?: string; toolUseId?: string }
  | { type: 'task_progress'; taskId: string; description: string; totalTokens?: number; toolUses?: number; durationMs?: number; lastToolName?: string; summary?: string }
  | { type: 'task_updated'; taskId: string; status?: string; description?: string; error?: string }
  | { type: 'task_notification'; taskId: string; status: 'completed' | 'failed' | 'stopped'; summary: string; totalTokens?: number; toolUses?: number }
  | { type: 'tool_summary'; summary: string; toolUseIds: string[] }
  | { type: 'suggestion'; suggestion: string }
  | { type: 'fast_changed'; enabled: boolean }
  | { type: 'ultracode_changed'; enabled: boolean }
  | { type: 'ask_user_question'; requestId: string; questions: UserQuestion[] }
  | { type: 'question_resolved'; requestId: string; outcome: 'answered' | 'skipped' | 'timeout' }
  // Primer evento de /api/chat/live: meta del turno en vuelo (resume).
  | { type: 'resume_meta'; protocol?: string; turnId: string | null; userMessage: string; audioUrl?: string | null; imageUrl?: string | null; startedAt?: number; origen?: MessageMetadata['origen']; inyectados?: InyeccionHost[] }
  // Inyección a mitad de turno (7 oct 2026): el motor tomó el mensaje / desenlace al cerrar el turno.
  | { type: 'user_injected'; injectionId: string; message: string; afterToolId?: string | null; at: number }
  | { type: 'injections_settled'; leidas: string[]; sinLeer: InyeccionHost[] }

// Cap por-tool al PERSISTIR inputs (el streaming en memoria conserva el input
// completo): un Write con un archivo de 200KB no debe engordar la fila jsonb
// del mensaje. Los outputs ya vienen truncados a ~8KB desde el daemon.
const PERSIST_TOOL_INPUT_MAX = 8_000
function capToolInputs(inputs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, v] of Object.entries(inputs)) {
    out[id] = v.length > PERSIST_TOOL_INPUT_MAX ? v.slice(0, PERSIST_TOOL_INPUT_MAX) + '… [input truncado]' : v
  }
  return out
}

// Extras del turno que el caller persiste junto al mensaje del assistant.
export interface TurnExtras {
  /** La conversación A LA QUE PERTENECE este turno, resuelta al enviarlo.
   *
   *  Existe porque el guardado ocurre al TERMINAR y para entonces el usuario ya
   *  pudo cambiarse de conversación. Antes el guardado preguntaba "¿cuál es la
   *  conversación abierta?" (un ref global) y se llevaba la respuesta a la
   *  equivocada — o, si había saltado a una conversación nueva sin sesión aún,
   *  creaba OTRA con el mismo primer mensaje: los duplicados del historial al
   *  trabajar en paralelo. El turno viaja con su destino; el destino no se
   *  adivina al final. */
  sessionId?: string
  turnId?: string
  audioUrl?: string
  imageUrl?: string
  assistantAudioUrl?: string
  fileAttachments?: FileAttachmentMeta[]
  tasks?: AgentTask[]
  toolSummaries?: string[]
  questionPrompts?: QuestionPrompt[]
  suggestions?: string[]
  usage?: UsageMeta
  downgrade?: ModelDowngrade
  toolCalls?: ToolCall[]
  toolInputs?: Record<string, string>
  toolOutputs?: Record<string, ToolOutput>
}

interface UseChatOptions {
  liveWorkspace?: boolean
  sessionId?: string | null
  onSave?: (userMsg: string, assistantMsg: string, extras: TurnExtras) => Promise<void>
  // Callback invocado cuando ESC durante streaming hace rollback del turno: devuelve el texto
  // exacto que el user habia escrito al input bar (paridad con Claude Code CLI). Si no se pasa,
  // el rollback ocurre pero el textarea NO se restaura (caller responsable de su propio input).
  onRestoreInput?: (text: string) => void
  // Guard del resume: el caller (ChatPanel) confirma que la sesión sigue siendo
  // la ACTIVA antes de que resumeStream mute el estado visible. Sin esto, un
  // auto-resume tras un drop de red podría inyectar el turno de una sesión
  // vieja en la vista de otra.
  isSessionActive?: (sessionId: string) => boolean
  /** Stop con mensajes inyectados que Levy no alcanzó a leer: vuelven a la fila EN PAUSA (nunca se descartan). */
  onInyeccionSinLeer?: (textos: string[]) => void
  /** Espacio de la conversación abierta ('bro' | 'codex' | 'yt' | 'default').
   *  El header y el picker son POR MOTOR: sin esto, un chat corriendo en Codex
   *  mostraba "Opus 5" y ofrecía modelos de Anthropic (bug del 6 sep 2026). */
  account?: ChatAccount | null
  /** The active conversation exists only on this device so far (offline or
   *  instant new chat): per-conversation reads use the account defaults. */
  pendingCreation?: boolean
}

export function useChat({ sessionId, onSave, onRestoreInput, isSessionActive, account, pendingCreation = false, liveWorkspace = false, onInyeccionSinLeer }: UseChatOptions = {}) {
  const { profile } = useAuth()
  const sinLeerRef = useRef(onInyeccionSinLeer)
  sinLeerRef.current = onInyeccionSinLeer
  /** Notas de inyección de un mensaje (sin tocar el resto): la única puerta para cambiarlas. */
  const notasDe = useCallback((assistantId: string, cambiar: (notas: NotaInyectada[]) => NotaInyectada[]) => {
    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, inyectados: cambiar(m.inyectados ?? []) } : m))
  }, [])
  /** Sesiones donde, al cerrar un turno, el host dejó inyecciones como turnos normales: hay que reengancharse. */
  const reengancheTrasTurnoRef = useRef<{ sessionId: string; account: string | null } | null>(null)
  useEffect(() => {
    if (!profile?.id) return
    let running = false
    const replay = () => {
      if (running || !isOnline() || document.visibilityState === 'hidden') return
      running = true
      void syncChatQueue(profile.id).catch(() => {}).finally(() => { running = false })
    }
    window.addEventListener('online', replay)
    document.addEventListener('visibilitychange', replay)
    replay()
    return () => { window.removeEventListener('online', replay); document.removeEventListener('visibilitychange', replay) }
  }, [profile?.id])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  /** Estado de la CONEXIÓN del teléfono, separado de la actividad del agente:
   *  el host sigue trabajando sin este stream. 'reconnecting' = volvió la red y
   *  hay un turno sin resolver que el reenganche (/chat/live) aún no adoptó. */
  const [connection, setConnection] = useState<'online' | 'offline' | 'reconnecting'>(() => (typeof navigator === 'undefined' || navigator.onLine) ? 'online' : 'offline')
  useEffect(() => {
    const offline = () => setConnection('offline')
    const online = () => setConnection(loadingRef.current || resumingRef.current ? 'reconnecting' : 'online')
    window.addEventListener('offline', offline); window.addEventListener('online', online)
    return () => { window.removeEventListener('offline', offline); window.removeEventListener('online', online) }
  }, [])
  // Espejo síncrono de messages para decisiones fuera del ciclo de render (ej.
  // dedup del sello de downgrade: "¿ya avisamos en esta conversación?"). Los
  // turnos previos ya están commiteados aquí; el efecto sincroniza tras cada render.
  const messagesRef = useRef<ChatMessage[]>([])
  /** Último cursor durable aplicado por turno: dos streams solapados no duplican. */
  const appliedCursorRef = useRef(new Map<string, number>())
  useEffect(() => { messagesRef.current = messages }, [messages])
  const [loading, setLoadingState] = useState(false)
  // loading TAMBIÉN en ref: los guards de resumeStream corren desde closures
  // viejos (setTimeout post-turno, listeners de foreground) donde el state
  // capturado puede estar stale — el ref siempre dice la verdad.
  const loadingRef = useRef(false)
  const setLoading = useCallback((v: boolean) => {
    if (v !== loadingRef.current) marcarStreamLocal(v)
    loadingRef.current = v
    setLoadingState(v)
  }, [])
  // Borradores que salen por la cola (conversación por crear o sin red) hasta que el reenganche los adopta o se
  // rinde: `loading` ya se soltó, pero la conversación sigue ocupada con ese turno.
  const despachosRef = useRef(0)
  const [despachando, setDespachando] = useState(false)
  const marcarDespacho = useCallback((delta: 1 | -1) => {
    despachosRef.current = Math.max(0, despachosRef.current + delta)
    setDespachando(despachosRef.current > 0)
  }, [])
  /** Un turno aceptado que esta pantalla no pudo seguir en vivo no se queda como burbuja vacía ni colgada. */
  const avisarSinSeguimiento = useCallback((assistantId: string) => {
    setMessages(prev => prev.map(m => m.id === assistantId && !m.streaming && !m.error && !m.diagnostic?.startsWith('Turno')
      ? { ...m, status: null, diagnostic: m.content.trim()
        ? 'Se cortó la conexión con este turno antes de su final. La respuesta completa queda guardada y aparece aquí al terminar.'
        : 'No pude seguir este turno en vivo. Levy sigue en el servidor: su respuesta aparece aquí al terminar; si no llega, recarga la conversación.' }
      : m))
  }, [])
  const { currentModel, currentEffort, ultracode, setCurrentEffort, setUltracode: setUltracodeView, bindStreamSettings } = useChatSettings({ owner: profile?.id, sessionId, account, pending: pendingCreation })
  useEffect(() => {
    if (!profile?.id) return
    const scope = { localOwner: profile.id, account: account ?? 'default', conversationId: pendingCreation ? null : sessionId ?? null }
    const defaults = { ...scope, conversationId: null }
    const refresh = (force = true) => {
      if (!isOnline()) return
      if (force || selectionIsStale(cachedSelection(scope))) void refreshSelection(scope).catch(() => {})
      if (sessionId && (force ? !cachedSelection(defaults) : selectionIsStale(cachedSelection(defaults)))) void refreshSelection(defaults).catch(() => {})
    }
    // Another tab or device may have changed the effective settings while this
    // one was idle: revalidate on return, not only on scope changes.
    const onOnline = () => refresh(true)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(false) }
    const onChanged = () => { if (!cachedSelection(scope)) refresh(true) }
    refresh(true)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(SELECTION_CHANGED, onChanged)
    return () => { window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener(SELECTION_CHANGED, onChanged) }
  }, [profile?.id, account, sessionId, pendingCreation])

  // Follow-up suggestions del último turno (promptSuggestions del SDK).
  // Se limpian al enviar el siguiente mensaje o al cambiar de sesión.
  const [suggestions, setSuggestions] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const activeSubmissionRef = useRef<{ turnId: string; cancelled: boolean; controller: AbortController } | null>(null)
  const pendingSubmissionRef = useRef<{ queueId?: string; turnId: string; sessionId: string } | null>(null)
  // Reintento automático (12 oct 2026): un envío CONFIRMADO que falló por algo pasajero (sin red, 5xx, plazo) sale
  // solo, con espera creciente, sin el toque de «Reintentar este envío». Mismo turnId = un solo turno en el servidor.
  useEffect(() => {
    if (!profile?.id) return
    const owner = profile.id
    let corriendo = false
    const revisar = async () => {
      if (corriendo || !isOnline()) return
      corriendo = true
      try {
        const vencidos = reintentosVencidos(await listSyncQueue(), owner, pendingSubmissionRef.current?.turnId)
        if (vencidos.length) await syncChatQueue(owner, vencidos)
      } catch { /* la próxima revisión lo intenta de nuevo */ } finally { corriendo = false }
    }
    const iv = setInterval(() => { void revisar() }, REVISION_COLA_MS)
    return () => clearInterval(iv)
  }, [profile?.id])
  const intentionalStopRef = useRef(false)
  // Track which session the current stream belongs to — when user switches
  // sessions, we detach the stream (let it continue in background) and free the UI
  const streamSessionRef = useRef<string | null>(null)
  // Identidad del turno en vuelo para detener y restaurar una copia: capturamos rawText sincronicamente
  // en sendMessage (NO depender de `messages` state que es asincronico por React batching).
  const pendingTurnRef = useRef<{ userId: string; assistantId: string; rawText: string; turnId?: string } | null>(null)
  // Overrides de estado de preguntas interactivas respondidas por answerQuestion.
  // El stream loop tiene su copia local (closure) de questionPrompts — sin este
  // ref, el evento `result` pisaría el estado 'answered' con el 'pending' viejo.
  const questionStatusRef = useRef<Map<string, { status: QuestionPrompt['status']; answers?: Record<string, string> }>>(new Map())

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (loadingRef.current) { loadingRef.current = false; marcarStreamLocal(false) }
    }
  }, [])

  // Detach stream when user switches to a different session.
  // ClaudeClaw keeps processing in background and saves via /api/chat/complete.
  const detachStream = useCallback(() => {
    if (!loading) return
    intentionalStopRef.current = false // not intentional stop, it's a session switch
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false) // free the UI immediately so user can send in new session
  }, [loading])

  // Stopping is not undo: preserve history and partial output, and distinguish
  // a local request, a host receipt and a confirmed terminal state.
  const cancelCurrent = useCallback(async (restoreInput: boolean) => {
    const submission = activeSubmissionRef.current
    const turn = pendingTurnRef.current
    const pending = pendingSubmissionRef.current
    const targetSession = streamSessionRef.current
    const targetTurn = turn?.turnId ?? pending?.turnId ?? submission?.turnId
    const assistantId = turn?.assistantId ?? (targetTurn ? `a-${targetTurn}` : null)
    intentionalStopRef.current = true
    if (submission) submission.cancelled = true
    if (restoreInput && turn) onRestoreInput?.(turn.rawText)
    const show = (diagnostic: string, terminalStatus?: string) => {
      if (!assistantId) return
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, streaming: false, status: null, diagnostic, ...(terminalStatus ? { terminalStatus, questionPrompts: settleQuestions(m.questionPrompts) } : {}) }
        : m))
    }
    show('Solicitando detener…')
    submission?.controller.abort()
    if (activeSubmissionRef.current === submission) {
      abortRef.current = null
      setLoading(false)
    }
    try {
      if (pending?.queueId) await cancelQueuedChat(pending.queueId)
    } catch {
      show('No se pudo confirmar la cancelación local. El envío podría seguir pendiente.')
      // Still ask the host: a local storage failure must not suppress a stop.
    }
    if (!targetSession || !targetTurn) {
      show('Envío cancelado antes de salir del dispositivo.', 'interrupted')
      return
    }
    try {
      const response = await fetch('/api/chat/interrupt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: targetSession, turnId: targetTurn, account }),
        signal: AbortSignal.timeout(10_000),
      })
      const receipt = await response.json()
      if (!response.ok || receipt.ok !== true || receipt.turnId !== targetTurn) throw new Error('Unconfirmed cancellation')
      if (receipt.status === 'cancelled_before_acceptance') show('Envío cancelado antes de iniciar.', 'interrupted')
      else if (receipt.status === 'interrupted') show('Turno detenido. Lo ya ejecutado se conserva.', 'interrupted')
      else if (receipt.status === 'completed' || receipt.status === 'failed') show('El turno ya había terminado. Recupera la conversación para ver su resultado.', receipt.status)
      else {
        show('El servidor recibió la solicitud de detener. Falta confirmar que terminó.')
        const status = await confirmStopped({ chatSessionId: targetSession, turnId: targetTurn, account: account ?? 'default' })
        if (status === 'interrupted') show('Turno detenido. Lo ya ejecutado se conserva.', 'interrupted')
        else if (status) show('El turno ya había terminado. Lo ejecutado se conserva.', status)
      }
    } catch {
      show('No se pudo confirmar que el servidor se detuvo. El trabajo podría continuar; recupera la conversación antes de repetirlo.')
    }
  }, [account, onRestoreInput, setLoading])

  // Escape can restore a copy for editing, but never deletes accepted history.
  const stopStreaming = useCallback(() => cancelCurrent(true), [cancelCurrent])
  const pauseStreaming = useCallback(() => cancelCurrent(false), [cancelCurrent])

  // ── Núcleo compartido de consumo SSE ──
  // Lo usan sendMessage (stream nuevo) y resumeStream (reenganche a un turno
  // en vuelo via /api/chat/live). Procesa TODOS los eventos con flush batched
  // por rAF, finaliza el mensaje, y persiste+ACK SOLO si llegó `result`: un
  // stream que muere a la mitad JAMÁS guarda el parcial — el server es el
  // dueño del turno y persiste la versión completa (bug 7 jul: el cliente
  // guardaba+ackeaba el parcial y el dedupe por turnId descartaba la completa).
  const consumeStream = useCallback(async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    ctx: {
      assistantId: string
      turnId: string | null
      userText: string
      /** Conversación dueña de este turno, fijada al enviarlo. Viaja hasta el
       *  guardado para que cambiar de conversación a media respuesta no mande el
       *  turno a la equivocada ni cree una duplicada (ver TurnExtras.sessionId). */
      sessionId?: string | null
      account?: string | null
      audioUrl?: string
      imageUrl?: string
      // Solo en resume: el primer evento del replay trae la meta del turno.
      onResumeMeta?: (meta: Extract<SSEEvent, { type: 'resume_meta' }>) => void
      isCurrent?: () => boolean
    },
  ): Promise<{ sawResult: boolean; sawError: boolean }> => {
    const { assistantId } = ctx
    const { setCurrentModel, setCurrentEffort, setUltracode } = bindStreamSettings({ owner: profile?.id, account: ctx.account ?? account, sessionId: ctx.sessionId }, ctx.isCurrent ?? (() => true))
    const decoder = new TextDecoder()
    let buffer = ''
    let accumulatedText = ''
    let accumulatedThinking = ''
    let thinkingVisible = false
    // Razonamiento y herramientas en el orden en que llegan (lib/rastro · lineaDeTiempo).
    let cronologia: PasoCronologia[] = []
    const toolInputs: Record<string, string> = {}
    const toolOutputs: Record<string, ToolOutput> = {}
    let latestTodos: TodoItem[] | undefined
    let compactMeta: CompactMeta | undefined
    let usageMeta: UsageMeta | undefined
    let downgradeMeta: ModelDowngrade | undefined
    let toolCalls: ToolCall[] = []
    let agentTasks: AgentTask[] = []
    let toolSummaries: string[] = []
    let questionPrompts: QuestionPrompt[] = []
    let turnSuggestions: string[] = []
    let assistantAudioUrl: string | undefined
    let fileAttachments: FileAttachmentMeta[] = []
    let sawResult = false
    let sawError = false
    let durable = false
    let metaTurno: MetaTurno | null = null

    // Merge del estado local de preguntas con las respuestas registradas por
    // answerQuestion (ver questionStatusRef arriba).
    const withQuestionOverrides = (prompts: QuestionPrompt[]): QuestionPrompt[] =>
      prompts.map((q) => {
        const o = questionStatusRef.current.get(q.requestId)
        return o ? { ...q, status: o.status, ...(o.answers ? { answers: o.answers } : {}) } : q
      })
    let pendingFlush = false
    let rafId = 0
    let frameCursor: number | null = null

    const flushText = () => {
      pendingFlush = false
      const text = accumulatedText
      const thinking = thinkingVisible ? accumulatedThinking : undefined
      const inputs = Object.keys(toolInputs).length ? { ...toolInputs } : undefined
      const meta = metaTurno ? { ...metaTurno, vueltas: metaTurno.vueltas.map(v => ({ ...v })) } : undefined
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: text, thinking, toolInputs: inputs, cronologia: cronologia.slice(), ...(meta ? { meta } : {}) } : m
        )
      )
    }

    while (true) {
      const { done, value } = await reader.read()
      if (ctx.isCurrent && !ctx.isCurrent()) { void reader.cancel().catch(() => {}); cancelAnimationFrame(rafId); return { sawResult, sawError } }
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        // Durable frames carry `id: <cursor>`; a cursor already applied to this
        // turn (two overlapping reattachments, a replayed tail) must not be
        // applied twice. Frames without id (legacy/meta) pass through.
        if (line.startsWith('id: ')) { const parsed = Number(line.slice(4)); frameCursor = Number.isFinite(parsed) ? parsed : null; continue }
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        const cursorOfFrame = frameCursor; frameCursor = null
        if (data === '[DONE]') continue

        let event: SSEEvent
        try {
          event = JSON.parse(data) as SSEEvent
        } catch {
          continue
        }
        if (cursorOfFrame !== null && ctx.turnId) {
          const applied = appliedCursorRef.current.get(ctx.turnId) ?? 0
          if (cursorOfFrame <= applied) continue
          appliedCursorRef.current.set(ctx.turnId, cursorOfFrame)
        }

        if (['model_changed', 'effort_changed', 'fast_changed', 'ultracode_changed'].includes(event.type) && profile?.id) {
          const scope = { localOwner: profile.id, account: ctx.account ?? account ?? 'default', conversationId: ctx.sessionId ?? null }
          invalidateSelection(scope)
          if (isOnline()) void refreshSelection(scope).catch(() => {})
        }
        if (String(event.type).startsWith('live_')) {
          window.dispatchEvent(new CustomEvent('arbrain:live', { detail: { owner: profile?.id, account: ctx.account ?? account, sessionId: ctx.sessionId, turnId: ctx.turnId, event } }))
          continue
        }
        switch (event.type) {
          case 'resume_meta':
            durable = event.protocol === 'durable-v1'
            if (!ctx.turnId && typeof event.turnId === 'string') ctx.turnId = event.turnId
            ctx.onResumeMeta?.(event)
            if (event.inyectados?.length) {
              const notas = event.inyectados.map(notaDelHost).filter((n): n is NotaInyectada => !!n)
              if (notas.length) notasDe(assistantId, actuales => unirNotas(actuales, notas))
            }
            break

          case 'user_injected':
            notasDe(assistantId, actuales => unirNotas(actuales, [{ id: event.injectionId, texto: event.message, estado: 'leido', afterToolId: event.afterToolId ?? null, at: event.at }]))
            break

          case 'injections_settled': {
            const fuera = new Set(event.sinLeer.map(i => i.injectionId))
            notasDe(assistantId, actuales => actuales.filter(n => !fuera.has(n.id)).map(n => event.leidas.includes(n.id) ? { ...n, estado: 'leido' as const } : n))
            const textos = event.sinLeer.map(i => i.message).filter(t => t.trim())
            // Solo la pantalla que sigue el turno en vivo los devuelve a su fila (un replay viejo no los repite).
            if (textos.length && cursorOfFrame !== null && (ctx.isCurrent?.() ?? true)) sinLeerRef.current?.(textos)
            break
          }

          case 'native_branch':
            setMessages(prev => prev.map(message => message.id === assistantId ? { ...message, branch: { parentThreadId: event.parentThreadId, beforeTurnId: event.beforeTurnId, threadId: event.threadId } } : message))
            break

          case 'goal':
            metaTurno = { ...event.meta, vueltas: event.meta.vueltas.map(v => ({ ...v })) }
            if (!pendingFlush) { pendingFlush = true; rafId = requestAnimationFrame(flushText) }
            break

          case 'resume_snapshot': {
            // The snapshot state already contains every event up to its cursor.
            if (ctx.turnId && typeof event.cursor === 'number') appliedCursorRef.current.set(ctx.turnId, Math.max(appliedCursorRef.current.get(ctx.turnId) ?? 0, event.cursor))
            const restored = snapshotMessage(event.state)
            accumulatedText = restored.content ?? ''
            accumulatedThinking = restored.thinking ?? ''
            thinkingVisible = !!restored.thinking
            cronologia = restored.cronologia ? restored.cronologia.map(p => ({ ...p })) : []
            Object.assign(toolInputs, restored.toolInputs)
            Object.assign(toolOutputs, restored.toolOutputs)
            toolCalls = restored.toolCalls ?? []
            agentTasks = restored.tasks ?? []
            questionPrompts = restored.questionPrompts ?? []
            toolSummaries = restored.toolSummaries ?? []
            fileAttachments = restored.fileAttachments ?? []
            usageMeta = restored.usage
            metaTurno = restored.meta ? { ...restored.meta, vueltas: restored.meta.vueltas.map(v => ({ ...v })) } : null
            turnSuggestions = event.state.suggestions ?? []
            setSuggestions(turnSuggestions)
            const finished = ['completed', 'failed', 'interrupted'].includes(event.turnStatus)
            sawResult = finished
            sawError = event.turnStatus === 'uncertain' || event.turnStatus === 'failed'
            if (finished || sawError) questionPrompts = settleQuestions(questionPrompts)
            setMessages(prev => prev.map(message => message.id === assistantId
              ? { ...message, ...restored, questionPrompts, streaming: !finished && !sawError, terminalStatus: event.turnStatus } : message))
            break
          }

          case 'terminal':
            questionPrompts = settleQuestions(withQuestionOverrides(questionPrompts))
            sawResult = true
            sawError ||= event.status === 'failed'
            {
              // Lo que el motor no tomó lo dejó el host como turno normal: sale de este turno y se reengancha.
              // Detenido: el host lo dejó `unread` (no sale solo); si su aviso no llegó, va a la fila en pausa.
              // Efectos fuera del updater de React (StrictMode lo llama dos veces).
              const { aSuTurno } = trasTerminar(messagesRef.current.find(m => m.id === assistantId)?.inyectados)
              if (aSuTurno.length && ctx.sessionId && event.status !== 'interrupted') reengancheTrasTurnoRef.current = { sessionId: ctx.sessionId, account: ctx.account ?? null }
              if (aSuTurno.length && event.status === 'interrupted' && cursorOfFrame !== null) sinLeerRef.current?.(aSuTurno.map(n => n.texto))
            }
            setMessages(prev => prev.map(message => message.id === assistantId
              ? { ...message, questionPrompts, streaming: false, terminalStatus: event.status, error: event.status === 'failed', ...(message.inyectados ? { inyectados: trasTerminar(message.inyectados).quedan } : {}) }
              : message))
            // "Lo estoy viendo": el host entrega el resultado sin esperar 5 s y no
            // manda push. La persistencia sigue siendo del host (el route dedupea
            // por turnId), así que el ACK nunca la omite. Fire-and-forget.
            if (durable && ctx.turnId && (ctx.isCurrent?.() ?? true) && typeof document !== 'undefined' && document.visibilityState === 'visible') {
              void fetch('/api/chat/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId: ctx.turnId }) }).catch(() => {})
            }
            break

          case 'execution_uncertain':
            questionPrompts = settleQuestions(withQuestionOverrides(questionPrompts))
            sawError = true
            setMessages(prev => prev.map(message => message.id === assistantId
              ? { ...message, questionPrompts, streaming: false, terminalStatus: 'uncertain', diagnostic: event.message, status: 'uncertain' } : message))
            break

          case 'text_delta': {
            // Tras una revisión de la meta, el texto es de su vuelta: la respuesta principal queda arriba, intacta.
            const vuelta = metaTurno?.vueltas.at(-1)
            if (vuelta) vuelta.texto += event.text
            else accumulatedText += event.text
            if (!pendingFlush) {
              pendingFlush = true
              rafId = requestAnimationFrame(flushText)
            }
            break
          }

          case 'thinking_start':
            thinkingVisible = true
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, thinking: m.thinking ?? '' } : m)),
            )
            break

          case 'thinking_delta':
            thinkingVisible = true
            anotarPensamiento(cronologia, accumulatedThinking.length, event.text.length)
            accumulatedThinking += event.text
            if (!pendingFlush) {
              pendingFlush = true
              rafId = requestAnimationFrame(flushText)
            }
            break

          case 'thinking_stop':
            break

          case 'tool_start':
            if (verboDe(event.toolName) === 'abrir') marcarAbrirVivo(event.toolId)
            toolCalls = [...toolCalls, { toolId: event.toolId, toolName: event.toolName, status: 'running' }]
            anotarHerramienta(cronologia, event.toolId)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolCalls: [...toolCalls], cronologia: cronologia.slice() } : m
              )
            )
            break

          case 'tool_input_delta':
            toolInputs[event.toolId] = (toolInputs[event.toolId] ?? '') + event.partial
            if (!pendingFlush) {
              pendingFlush = true
              rafId = requestAnimationFrame(flushText)
            }
            break

          case 'tool_done':
            toolCalls = toolCalls.map((t) =>
              t.toolId === event.toolId ? { ...t, status: 'done' as const } : t
            )
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
              )
            )
            break

          case 'tool_result':
            // Output real de la tool (ya truncado server-side): alimenta la card
            // expandida. Evento poco frecuente — update directo sin batching raf.
            // La Cabina: si Levy escribió algo (pluma, archivo, comando), las
            // vistas montadas releen su fuente. Lecturas puras no disparan nada.
            if (herramientaEscribe(toolCalls.find(t => t.toolId === event.toolId)?.toolName)) refrescarCabina()
            toolOutputs[event.toolId] = {
              content: event.content,
              ...(event.isError && { isError: true }),
              ...(event.kind && { kind: event.kind }),
              ...(event.durationMs != null && { durationMs: event.durationMs }),
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolOutputs: { ...toolOutputs } } : m
              )
            )
            break

          case 'todos_update':
            latestTodos = event.todos
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, todos: event.todos } : m
              )
            )
            break

          case 'task_started':
            agentTasks = [
              ...agentTasks.filter((t) => t.taskId !== event.taskId),
              {
                taskId: event.taskId,
                description: event.description,
                subagentType: event.subagentType,
                taskType: event.taskType,
                workflowName: event.workflowName,
                status: 'running',
              },
            ]
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, tasks: [...agentTasks] } : m))
            )
            break

          case 'task_progress':
            agentTasks = agentTasks.map((t) =>
              t.taskId === event.taskId
                ? {
                    ...t,
                    description: event.description || t.description,
                    totalTokens: event.totalTokens ?? t.totalTokens,
                    toolUses: event.toolUses ?? t.toolUses,
                    lastToolName: event.lastToolName ?? t.lastToolName,
                    summary: event.summary ?? t.summary,
                  }
                : t
            )
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, tasks: [...agentTasks] } : m))
            )
            break

          case 'task_updated':
            agentTasks = agentTasks.map((t) =>
              t.taskId === event.taskId
                ? {
                    ...t,
                    ...(event.status && { status: event.status as AgentTask['status'] }),
                    ...(event.description && { description: event.description }),
                    ...(event.error && { error: event.error }),
                  }
                : t
            )
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, tasks: [...agentTasks] } : m))
            )
            break

          case 'task_notification':
            agentTasks = agentTasks.map((t) =>
              t.taskId === event.taskId
                ? {
                    ...t,
                    status: event.status,
                    summary: event.summary || t.summary,
                    totalTokens: event.totalTokens ?? t.totalTokens,
                    toolUses: event.toolUses ?? t.toolUses,
                  }
                : t
            )
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, tasks: [...agentTasks] } : m))
            )
            break

          case 'tool_summary':
            if (event.summary) {
              toolSummaries = [...toolSummaries, event.summary]
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, toolSummaries: [...toolSummaries] } : m))
              )
            }
            break

          case 'suggestion':
            if (!turnSuggestions.includes(event.suggestion)) turnSuggestions = [...turnSuggestions, event.suggestion]
            setSuggestions((prev) =>
              prev.includes(event.suggestion) ? prev : [...prev, event.suggestion]
            )
            break

          case 'ask_user_question':
            questionPrompts = [
              ...questionPrompts.filter((q) => q.requestId !== event.requestId),
              { requestId: event.requestId, questions: Array.isArray(event.questions) ? event.questions : [], status: 'pending' },
            ]
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, questionPrompts: withQuestionOverrides(questionPrompts) } : m))
            )
            break

          case 'question_resolved':
            if (!questionStatusRef.current.has(event.requestId)) {
              questionStatusRef.current.set(event.requestId, {
                status: event.outcome === 'answered' ? 'answered' : event.outcome === 'skipped' ? 'skipped' : 'timeout',
              })
            }
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, questionPrompts: withQuestionOverrides(questionPrompts) } : m))
            )
            break

          case 'status':
            if (event.status === 'requesting' && !thinkingVisible) {
              thinkingVisible = true
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, status: event.status, thinking: '' } : m,
                ),
              )
            } else {
              const fila = event.status === 'en_fila_turno' ? leerFila(event.fila) : null
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, status: event.status, fila } : m)),
              )
            }
            break

          case 'compact':
            compactMeta = { tokensBefore: event.tokensBefore, tokensAfter: event.tokensAfter }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, compact: compactMeta } : m
              )
            )
            break

          case 'usage':
            usageMeta = {
              costUsd: event.costUsd,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              durationMs: event.durationMs,
              numTurns: event.numTurns,
              contextUsed: event.contextUsed,
              contextTotal: event.contextTotal,
              ...(event.model ? { model: event.model } : {}),
              ...(event.effort ? { effort: event.effort } : {}),
            }
            if (event.model) setCurrentModel(event.model)
            break

          case 'file_attachment': {
            const attachment: FileAttachmentMeta = { url: event.url, filename: event.filename, mimeType: event.mimeType }
            fileAttachments = [...fileAttachments, attachment]
            const isAudio = event.mimeType.startsWith('audio/')
            if (isAudio) assistantAudioUrl = event.url
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, ...(isAudio ? { audioUrl: event.url } : {}), fileAttachments: [...fileAttachments] }
                  : m
              )
            )
            break
          }

          case 'result': {
            sawResult = true
            if (toolCalls.some(t => herramientaEscribe(t.toolName))) refrescarCabina()
            cancelAnimationFrame(rafId)
            pendingFlush = false
            const finalText = (event.text || accumulatedText).trim()
            accumulatedText = finalText
            const finalThinking =
              thinkingVisible && accumulatedThinking ? accumulatedThinking : undefined
            const finalInputs = Object.keys(toolInputs).length ? { ...toolInputs } : undefined
            const finalOutputs = Object.keys(toolOutputs).length ? { ...toolOutputs } : undefined
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: finalText,
                      streaming: false,
                      usage: usageMeta,
                      downgrade: downgradeMeta,
                      compact: compactMeta,
                      toolCalls: [...toolCalls],
                      thinking: finalThinking,
                      cronologia: cronologia.length ? cronologia.slice() : m.cronologia,
                      toolInputs: finalInputs,
                      toolOutputs: finalOutputs,
                      todos: latestTodos,
                      tasks: agentTasks.length ? [...agentTasks] : undefined,
                      toolSummaries: toolSummaries.length ? [...toolSummaries] : undefined,
                      questionPrompts: questionPrompts.length ? withQuestionOverrides(questionPrompts) : undefined,
                      ...(metaTurno ? { meta: metaTurno } : {}),
                      status: null,
                    }
                  : m
              )
            )
            break
          }

          case 'model_changed':
            setCurrentModel(event.model ?? event.resolved ?? null)
            break

          case 'model_downgraded': {
            // El modelo pedido no fue el que respondió (Fable declinó por
            // seguridad → Opus contestó). refusal viene true del daemon (no hay
            // fallback de capacidad configurado); default true por robustez.
            const incoming: ModelDowngrade = {
              from: event.from,
              to: event.to,
              refusal: event.refusal ?? true,
              category: event.category ?? null,
            }
            // SOLO el primer downgrade de la conversación lleva sello: tras el
            // reroute la convo queda pegada a Opus y el daemon lo re-emite cada
            // turno, pero avisar una vez basta (feedback de Daniel). messagesRef =
            // fuente síncrona fiable (los turnos previos ya están commiteados), así
            // que la decisión y el downgradeMeta a persistir se fijan aquí mismo.
            const already = messagesRef.current.some(
              (m) => m.role === 'assistant' && m.id !== assistantId && m.downgrade?.to === incoming.to,
            )
            if (!already) {
              downgradeMeta = incoming
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, downgrade: incoming } : m)),
              )
            }
            break
          }

          case 'effort_changed':
            setCurrentEffort(event.effort)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: event.effort
                        ? `Esfuerzo cambiado a **${effortLabel(event.effort)}**`
                        : 'Este modelo no ofrece niveles de esfuerzo',
                      streaming: false,
                    }
                  : m
              )
            )
            break

          case 'init':
            // Lista real de comandos del SDK: alimenta la paleta «/» (nombres, sin descripción).
            if (Array.isArray(event.slashCommands)) useCommandStore.getState().setInitNames(ctx.account ?? account ?? 'default', event.slashCommands)
            break

          case 'ultracode_changed':
            setUltracode(event.enabled)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: event.enabled
                        ? 'Ultracode **ON** — xhigh + orquestación multi-agente cada turno'
                        : 'Ultracode **off**',
                      streaming: false,
                    }
                  : m
              )
            )
            break

          case 'interrupt':
            questionPrompts = settleQuestions(withQuestionOverrides(questionPrompts))
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, questionPrompts, status: null, diagnostic: 'Turno interrumpido.' } : m))
            break

          case 'error':
            questionPrompts = settleQuestions(withQuestionOverrides(questionPrompts))
            sawError = true
            cancelAnimationFrame(rafId)
            pendingFlush = false
            if (ctx.isCurrent?.() ?? true) pendingTurnRef.current = null
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, questionPrompts, content: accumulatedText || event.message || 'Error del agente', diagnostic: event.message, error: true, streaming: false }
                  : m
              )
            )
            break
        }
      }
    }

    // Flush any pending text before marking stream done
    cancelAnimationFrame(rafId)
    if (pendingFlush) flushText()

    // Mark streaming done (in case we didn't get a result event)
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId && m.streaming
          ? { ...m, streaming: false, usage: usageMeta }
          : m
      )
    )

    // Persistir + ACK — SOLO con turno completo (result). Sin result no se
    // guarda nada: el server persiste la versión completa y el cliente la
    // reconcilia (o se reengancha al vivo).
    if (!durable && sawResult && accumulatedText.trim() && onSave) {
      const finalPrompts = withQuestionOverrides(questionPrompts)
        .map((q) => (q.status === 'pending' ? { ...q, status: 'timeout' as const } : q))
      const ackTurnId = ctx.turnId
      onSave(ctx.userText, accumulatedText.trim(), {
        sessionId: ctx.sessionId ?? undefined,
        turnId: ackTurnId ?? undefined,
        audioUrl: ctx.audioUrl,
        imageUrl: ctx.imageUrl,
        assistantAudioUrl,
        fileAttachments: fileAttachments.length > 0 ? fileAttachments : undefined,
        tasks: agentTasks.length > 0 ? agentTasks : undefined,
        toolSummaries: toolSummaries.length > 0 ? toolSummaries : undefined,
        questionPrompts: finalPrompts.length > 0 ? finalPrompts : undefined,
        suggestions: turnSuggestions.length > 0 ? turnSuggestions : undefined,
        usage: usageMeta,
        downgrade: downgradeMeta,
        // Detalle expandible de tools: el turno terminó, nada sigue 'running'.
        toolCalls: toolCalls.length > 0 ? toolCalls.map((t) => (t.status === 'running' ? { ...t, status: 'done' as const } : t)) : undefined,
        toolInputs: Object.keys(toolInputs).length > 0 ? capToolInputs(toolInputs) : undefined,
        toolOutputs: Object.keys(toolOutputs).length > 0 ? { ...toolOutputs } : undefined,
      }).then(() => {
        // ACK post-guardado: "este turno YA está guardado y lo estoy viendo" →
        // el daemon no re-guarda ni manda push. Fire-and-forget: si se pierde,
        // el índice único absorbe el doble guardado y el push extra es inocuo.
        if (!ackTurnId) return
        fetch('/api/chat/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnId: ackTurnId }),
        }).catch(() => { /* daemon decide solo por timeout */ })
      }).catch((e) => {
        console.error('[useChat] Failed to persist:', e)
      })
    }

    return { sawResult, sawError }
  }, [onSave, bindStreamSettings, profile?.id, account, notasDe])

  // ── Resume de un turno EN VUELO (estilo Anthropic) ──
  // Reabrir la app / volver a la sesión a mitad del streaming: pega a
  // /api/chat/live; si el daemon tiene el turno vivo, replay del buffer +
  // tail en vivo con el MISMO pipeline del stream normal. Si no hay turno
  // vivo devuelve false y el caller reconcilia desde la BD/transcript.
  const resumingRef = useRef(false)
  const resumeStream = useCallback(async (targetSessionId: string, targetAccount: string | null = account ?? null): Promise<boolean> => {
    if (!targetSessionId) return false
    if (loadingRef.current) return false // ya hay un stream vivo en esta UI
    if (resumingRef.current) return false // reenganche en progreso (multi-unlock)
    if (isSessionActive && !isSessionActive(targetSessionId)) return false
    resumingRef.current = true
    const ac = new AbortController()
    const resumedSubmission = { turnId: '', cancelled: false, controller: ac }
    let attached = false
    try {
      const res = await fetch('/api/chat/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatSessionId: targetSessionId, account: targetAccount ?? 'default', recover: true, snapshot: true }),
        signal: ac.signal,
      })
      const contentType = res.headers.get('Content-Type') ?? ''
      if (!res.ok || !res.body || !contentType.includes('text/event-stream')) {
        return false // {live:false} — nada que reenganchar
      }
      // Doble-check post-fetch: la sesión pudo cambiar mientras esperábamos.
      if (loadingRef.current || (isSessionActive && !isSessionActive(targetSessionId))) {
        ac.abort()
        return false
      }

      activeSubmissionRef.current = resumedSubmission
      const now = Date.now()
      const userId = `u-${now}`
      const assistantId = `a-${now}`
      const ctx: {
        assistantId: string
        isCurrent: () => boolean
        turnId: string | null
        userText: string
        sessionId?: string | null
        account?: string | null
        audioUrl?: string
        imageUrl?: string
        onResumeMeta?: (meta: Extract<SSEEvent, { type: 'resume_meta' }>) => void
      } = {
        assistantId,
        isCurrent: () => activeSubmissionRef.current === resumedSubmission,
        turnId: null,
        userText: '',
        // El reenganche también sabe de quién es el turno: es la sesión que se
        // pidió resumir, no "la que esté abierta cuando termine".
        sessionId: targetSessionId,
        account: targetAccount,
        onResumeMeta: (meta) => {
          attached = true
          setConnection('online')
          ctx.turnId = meta.turnId ?? null
          resumedSubmission.turnId = meta.turnId ?? ''
          pendingSubmissionRef.current = meta.turnId ? {
            queueId: pendingSubmissionRef.current?.turnId === meta.turnId ? pendingSubmissionRef.current.queueId : undefined,
            turnId: meta.turnId, sessionId: targetSessionId,
          } : null
          ctx.userText = meta.userMessage
          ctx.audioUrl = meta.audioUrl ?? undefined
          ctx.imageUrl = meta.imageUrl ?? undefined
          intentionalStopRef.current = false
          abortRef.current = ac
          streamSessionRef.current = targetSessionId
          questionStatusRef.current.clear()
          // El id del mensaje del user de ESTE turno: si ya está en pantalla se
          // conserva el suyo (para que ESC siga sabiendo qué retirar).
          let userIdDelTurno = messagesRef.current.find(message => message.role === 'user' && !!meta.turnId && message.metadata?.turnId === meta.turnId)?.id ?? userId
          setLoading(true)
          setSuggestions([])
          setMessages((prev) => {
            if (meta.protocol === 'durable-v1') return restoreTurnPair(prev, meta, assistantId, userId)
            const cleaned = [...prev]
            // 1) Fuera los assistant parciales temporales del final: el replay
            //    reconstruye la respuesta COMPLETA desde el principio.
            while (
              cleaned.length > 0 &&
              cleaned[cleaned.length - 1].role === 'assistant' &&
              cleaned[cleaned.length - 1].id.startsWith('a-')
            ) {
              cleaned.pop()
            }
            // 2) ¿El mensaje del user de este turno YA está en pantalla? Puede
            //    venir con id temporal (restaurado del caché en memoria) o con su
            //    UUID real (si la revalidación contra la BD ya lo trajo). Antes
            //    esto se decidía por la FORMA del id (`u-`), así que el caso del
            //    UUID no se reconocía y el turno se insertaba OTRA VEZ: el mismo
            //    mensaje duplicado, con la hora del reenganche en vez de la hora
            //    en que lo mandaste. Se compara por CONTENIDO, que es lo que de
            //    verdad identifica al turno, y se CONSERVA el original: su hora
            //    es la buena.
            const ultimo = cleaned[cleaned.length - 1]
            const usuarioYaVisible = ultimo?.role === 'user' && ultimo.content === meta.userMessage
            if (usuarioYaVisible) userIdDelTurno = ultimo.id

            const assistantPlaceholder = {
              id: assistantId,
              role: 'assistant' as const,
              content: '',
              timestamp: new Date(),
              streaming: true,
              toolCalls: [],
              // Con identidad de turno el orden del hilo los mantiene juntos y el bloque vivo al final (1 oct 2026).
              ...(meta.turnId ? { metadata: { turnId: meta.turnId, ...(meta.startedAt ? { startedAt: meta.startedAt } : {}) } } : {}),
            }
            if (usuarioYaVisible) return [...cleaned, assistantPlaceholder]
            return [
              ...cleaned,
              {
                id: userId,
                role: 'user' as const,
                content: meta.userMessage,
                timestamp: new Date(),
                audioUrl: meta.audioUrl ?? undefined,
                imageUrl: meta.imageUrl ?? undefined,
                ...(meta.turnId ? { metadata: { turnId: meta.turnId } } : {}),
              },
              assistantPlaceholder,
            ]
          })
          pendingTurnRef.current = { userId: userIdDelTurno, assistantId, rawText: meta.userMessage, turnId: meta.turnId ?? undefined }
        },
      }

      const reader = res.body.getReader()
      const outcome = await consumeStream(reader, ctx)
      if (!attached && isOnline()) setConnection('online') // nada vivo que reenganchar: la red está bien
      // A finished latest turn is not a substitute for the whole history:
      // the caller must still fetch intermediate turns completed while away.
      return attached && !outcome.sawResult
    } catch {
      // Abort o red caída durante el reenganche: dejar el placeholder como
      // done; el próximo foreground/reconcile lo levanta desde la BD.
      if (attached && activeSubmissionRef.current === resumedSubmission) {
        setMessages((prev) =>
          prev.map((m) => (m.role === 'assistant' && m.streaming ? { ...m, streaming: false } : m))
        )
      }
      return attached
    } finally {
      resumingRef.current = false
      if (abortRef.current === ac) abortRef.current = null
      if (attached && activeSubmissionRef.current === resumedSubmission) {
        setLoading(false)
        pendingTurnRef.current = null
      }
    }
  }, [isSessionActive, consumeStream, setLoading, account])

  const sendMessage = useCallback(async (text: string, opts?: { audioUrl?: string; imageUrl?: string; effort?: string; chatSessionId?: string; createConversation?: boolean; sessionPromise?: Promise<{ id: string; sdkSessionId?: string | null; pendingCreation?: boolean } | null>; sdkSessionId?: string; context?: string; account?: string; editOriginalText?: string; editTurnId?: string; editOccurrenceFromEnd?: number }) => {
    const trimmed = text.trim()
    if (!trimmed || loadingRef.current) return
    const targetAccount = opts?.account ?? account ?? 'default'
    // Capture BEFORE any await, including creation of the new conversation.
    const tapConversation = opts?.chatSessionId ?? (opts?.sessionPromise ? null : sessionId ?? null)
    // A conversation not yet created in the cloud has no overrides: its selection is the account default.
    const scopeAtTap = profile?.id ? { localOwner: profile.id, account: targetAccount, conversationId: (opts?.createConversation || (tapConversation === sessionId && pendingCreation)) ? null : tapConversation } : null
    const atSend = scopeAtTap ? cachedSelection(scopeAtTap) : undefined
    const revisionAtTap = scopeAtTap ? selectionRevision(scopeAtTap) : 0
    intentionalStopRef.current = false

    const turnId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const submission = { turnId, cancelled: false, controller: new AbortController() }
    activeSubmissionRef.current = submission
    pendingSubmissionRef.current = null
    const isCurrent = () => activeSubmissionRef.current === submission

    const userMsg: ChatMessage = {
      id: `u-${turnId}`,
      metadata: { turnId },
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
      audioUrl: opts?.audioUrl,
      imageUrl: opts?.imageUrl,
    }
    const assistantId = `a-${turnId}`
    const assistantMsg: ChatMessage = {
      id: assistantId,
      metadata: { turnId },
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
      toolCalls: [],
    }

    // Identidad sincrónica del turno para ESC. El rawText es exactamente lo que el user
    // escribio (post-trim) — si presionan ESC, este es el texto que vuelve al input.
    pendingTurnRef.current = { userId: userMsg.id, assistantId, rawText: trimmed, turnId }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setSuggestions([])
    setLoading(true)
    // Si la sesión viene en promise (creación en background), streamSessionRef
    // se fija más abajo cuando resuelva — antes del fetch, siempre.
    streamSessionRef.current = opts?.chatSessionId ?? null
    questionStatusRef.current.clear()

    const submissionController = submission.controller
    abortRef.current = submissionController

    // La sesión pudo venir como PROMISE (creación en background para que el
    // paint del turno sea instantáneo). Se resuelve AQUÍ, antes del fetch —
    // el invariante se mantiene: el stream SIEMPRE sale con chatSessionId
    // (sin id, ClaudeClaw caería a la sesión global 'mc-web').
    let chatSessionId = opts?.chatSessionId ?? (opts?.sessionPromise ? null : sessionId ?? null)
    let createConversation = opts?.createConversation ?? false
    if (!chatSessionId && opts?.sessionPromise) {
      const session = await opts.sessionPromise.catch(() => null)
      // Cancelación durante creación: aún no se ha enviado el prompt.
      // (el fetch nunca salió, así que su catch no corre: liberar loading aquí)
      if (submission.cancelled) {
        if (isCurrent()) setLoading(false)
        if (isCurrent()) pendingTurnRef.current = null
        return
      }
      if (!session) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: 'No se pudo crear la sesión. Intenta de nuevo.', error: true, streaming: false }
              : m
          )
        )
        if (isCurrent()) setLoading(false)
        if (isCurrent()) pendingTurnRef.current = null
        return
      }
      chatSessionId = session.id
      createConversation = session.pendingCreation ?? false
      if (isCurrent()) streamSessionRef.current = session.id
    }
    // Punto amarillo en el sidebar en el mismo clic, sin esperar al journal ni al primer token.
    if (chatSessionId) marcarEnvioLocal(chatSessionId)

    // Detect device type so the backend only pushes notifications for mobile
    // clients that disconnect (app closed/backgrounded). Desktop never gets a
    // phone push, even if the browser tab dies.
    const source = typeof window !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
      ? 'mobile'
      : 'desktop'

    if (createConversation && trimmed.startsWith('/') && isOnline()) {
      // A locally allocated conversation can remain selected after cloud
      // acceptance. Preserve existing command controls on that same ID rather
      // than dropping them into a prompt queue that intentionally rejects slash.
      try {
        const response = await fetch('/api/chat/sessions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chatSessionId, expectedOwnerId: profile?.id, title: trimmed.slice(0, 55), account: opts?.account ?? account ?? 'default' }),
        })
        if (!response.ok) throw new Error('No se pudo confirmar la conversación del comando.')
        createConversation = false
      } catch {
        setMessages(previous => previous.map(message => message.id === assistantId ? { ...message, content: 'No se pudo confirmar la conversación del comando. El ajuste no se aplicó.', error: true, streaming: false } : message))
        if (isCurrent()) setLoading(false)
        return
      }
      if (submissionController.signal.aborted) { if (isCurrent()) setLoading(false); return }
    }

    let queuedSubmission: { id: string } | undefined
    let submittedIntent: ChatIntent | undefined = atSend && !trimmed.startsWith('/') ? { ...atSend, conversationId: atSend.conversationId === null ? chatSessionId : atSend.conversationId, ...(opts?.effort ? { effort: opts.effort } : {}) } : undefined
    if (!trimmed.startsWith('/') || !isOnline()) {
      try {
        const chatEnvelope = offlineEnvelope({
          version: 2, expectedOwnerId: profile?.id, chatSessionId, turnId, ...(submittedIntent ? { intent: submittedIntent } : {}),
          account: opts?.account ?? account ?? 'default', message: trimmed, source,
          liveWorkspace, effort: opts?.effort, context: opts?.context, audioUrl: opts?.audioUrl, imageUrl: opts?.imageUrl,
          editOriginalText: opts?.editOriginalText, editTurnId: opts?.editTurnId, editOccurrenceFromEnd: opts?.editOccurrenceFromEnd,
          createConversation,
        })
        queuedSubmission = await queueChatPrompt({
          prompt: trimmed, route: typeof window !== 'undefined' ? window.location.pathname : '/chat',
          contextPackId: null, localContext: { chatEnvelope },
        })
        if (isCurrent()) pendingSubmissionRef.current = { queueId: queuedSubmission.id, turnId, sessionId: chatSessionId! }
        if (submissionController.signal.aborted) {
          if (submission.cancelled) await cancelQueuedChat(queuedSubmission.id)
          else if (isOnline() && profile?.id) void syncChatQueue(profile.id).catch(() => {})
          if (isCurrent()) setLoading(false)
          return
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : typeof error === 'string' ? error : 'motivo desconocido'
        setMessages(previous => previous.map(message => message.id === assistantId ? {
          ...message, content: `No se pudo guardar el envío en este dispositivo (${reason}). Tu texto se conserva aquí; no se envió al motor.`, error: true, streaming: false,
        } : message))
        if (isCurrent()) setLoading(false)
        return
      }
    }

    if (queuedSubmission && !submittedIntent && !trimmed.startsWith('/') && scopeAtTap && isOnline()) {
      // The selection was unknown at the tap (cold open, discovery still in
      // flight). The draft is already saved. The host is consulted for the
      // settings this scope would use; they are adopted ONLY if nothing
      // observable changed since the tap (own SSE command, another tab): the
      // scope revision is the fence. Any drift, failure or cancellation leaves
      // the draft for explicit confirmation in the draft view.
      try {
        const selected = await refreshSelection(scopeAtTap)
        if (selectionRevision(scopeAtTap) !== revisionAtTap) throw new Error('changed after tap')
        if (submissionController.signal.aborted) { if (isCurrent()) setLoading(false); return }
        submittedIntent = { ...selected, conversationId: chatSessionId, ...(opts?.effort ? { effort: opts.effort } : {}) }
        const updated = await confirmQueuedChatSelection(queuedSubmission.id, profile!.id, submittedIntent)
        if (updated.status === 'cancelled' || submissionController.signal.aborted) { if (isCurrent()) setLoading(false); return }
      } catch (error) {
        submittedIntent = undefined
        // Prueba en Windows del 22 oct 2026 (punto 11): sin llave ni sesión no hay ajustes que confirmar. No queda un
        // borrador trabado con «No se pudo confirmar el modelo»: el turno dice cómo conectarse (Ajustes › Llaves) y el
        // mensaje se puede reintentar al conectar.
        if ((error as { code?: unknown } | null)?.code === 'falta_llave') {
          await cancelQueuedChat(queuedSubmission.id).catch(() => {})
          if (isCurrent()) pendingSubmissionRef.current = null
          const aviso = error instanceof Error ? error.message : ''
          setMessages(previous => previous.map(message => message.id === assistantId ? { ...message, content: '', diagnostic: aviso, error: true, streaming: false, status: null } : message))
          if (isCurrent()) setLoading(false)
          if (isCurrent()) pendingTurnRef.current = null
          return
        }
      }
    }

    if (queuedSubmission && !submittedIntent && !trimmed.startsWith('/')) {
      // A saved draft is a STATE, not an answer. Its single representation is
      // the draft card (ChatDraftStatus); the assistant placeholder stays empty
      // so the same fact is not told three times.
      setMessages(previous => previous.map(message => message.id === assistantId ? { ...message, streaming: false, status: null, content: '', diagnostic: undefined } : message))
      if (isCurrent()) setLoading(false)
      if (isCurrent()) pendingTurnRef.current = null
      return
    }

    if (!isOnline() || createConversation) {
      try {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: '',
                  // Online: the durable dispatch attaches within a second and the
                  // activity row takes over. Offline: the draft card is the single
                  // representation (no duplicate status prose).
                  diagnostic: isOnline() ? 'Enviando el mensaje guardado…' : undefined,
                  streaming: false,
                  status: null,
                }
              : m
          )
        )
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: 'No se pudo guardar el mensaje localmente.', error: true, streaming: false }
              : m
          )
        )
      } finally {
        if (isCurrent()) setLoading(false)
        if (isCurrent()) pendingTurnRef.current = null
      }
      if (isOnline() && profile?.id) {
        // Mientras el borrador sale y el reenganche lo adopta, la conversación está ocupada: otro Enter va a la
        // fila, no a un turno paralelo que el servidor formaría detrás de este (duplicado del 2 oct 2026).
        marcarDespacho(+1)
        void syncChatQueue(profile.id)
          .then(() => chatSessionId ? resumeStream(chatSessionId, opts?.account ?? account ?? null) : false)
          .then(enganchado => { if (!enganchado) avisarSinSeguimiento(assistantId) })
          .catch(() => avisarSinSeguimiento(assistantId))
          .finally(() => marcarDespacho(-1))
      }
      return
    }


    // Identidad del turno: viaja al daemon (que la ecoa en su webhook de
    // completion) y se estampa en metadata de ambas filas al persistir. El ACK
    // post-guardado usa este id — es la base de "entrega garantizada": el server
    // asume desconexión SIEMPRE y solo se abstiene de guardar/pushear si el
    // cliente confirmó (ACK) que ya guardó el turno.

    // Guardado EAGER del mensaje del user: la fila se persiste al ENVIAR, no al
    // completar el turno. Incidente 17-18 jul 2026: el daemon estuvo caído 38h y
    // los mensajes enviados en ese lapso se PERDIERON (el guardado solo corría
    // al final del turno, que nunca llegó) — quedaron 3 sesiones fantasma sin
    // una sola fila. Fire-and-forget: no bloquea el stream. El índice único
    // (turnId, role) + inserts por-fila en el route hacen esto idempotente
    // contra el guardado rico del cliente y el webhook del daemon. Las sesiones
    // sdk: no persisten en MC (su verdad es el transcript del daemon).
    // Dónde escribe Daniel (8 oct 2026): lo que Levy abra en esta conversación va a este cliente (panel-bus: presencia.ts).
    anotarEscritura(chatSessionId)
    if (chatSessionId && !chatSessionId.startsWith('sdk:')) {
      void fetch(`/api/chat/sessions/${encodeURIComponent(chatSessionId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: trimmed,
            audioUrl: opts?.audioUrl,
            imageUrl: opts?.imageUrl,
            metadata: { turnId },
          }],
        }),
      }).catch(() => { /* sin red/500: el guardado de completion sigue siendo el respaldo */ })
    }

    // Reenganche: el stream terminó SIN result (cierre "limpio" del proxy a
    // mitad del turno — iOS/Vercel/ngrok lo hacen sin error) o se cayó la red.
    // El turno sigue vivo en el daemon: NO persistimos el parcial y nos
    // re-enganchamos al vivo via /api/chat/live.
    let shouldAttemptResume = false

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          liveWorkspace,
          source,
          turnId,
          expectedOwnerId: profile?.id,
          // TEMPORAL (2026-07-08): cuenta que factura el turno. La pasa la
          // superficie (ChatPanel), NUNCA un global, para no filtrar 'bro'
          // fuera de /chat. 'bro' → la segunda cuenta de Claude vía CLAUDE_CONFIG_DIR en
          // el daemon.
          account: targetAccount,
          ...(submittedIntent ? { intent: submittedIntent } : {}),
          ...(opts?.effort && { effort: opts.effort }),
          ...(chatSessionId && { chatSessionId }),
          ...(opts?.sdkSessionId && { sdkSessionId: opts.sdkSessionId }),
          // Edición de un mensaje pasado: rebobina el contexto del SDK (fork).
          ...(opts?.editOriginalText != null && { editOriginalText: opts.editOriginalText }),
          ...(opts?.editTurnId && { editTurnId: opts.editTurnId }),
          ...(opts?.editOccurrenceFromEnd != null && { editOccurrenceFromEnd: opts.editOccurrenceFromEnd }),
          ...(opts?.audioUrl && { audioUrl: opts.audioUrl }),
          ...(opts?.imageUrl && { imageUrl: opts.imageUrl }),
          ...(opts?.context && { context: opts.context }),
        }),
        signal: submissionController.signal,
      })

      if (res.status === 401) {
        window.location.href = '/login'
        return
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'Error desconocido' }))
        // Falla pasajera con el mensaje ya guardado: se dice que sale solo (reintento-envios.ts), no «envíalo de nuevo».
        const saleSolo = !!queuedSubmission && !!submittedIntent && esStatusTransitorio(res.status)
        const causa = data.error || 'Error de conexion'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: saleSolo && !/guardado/i.test(causa) ? `${causa} Tu mensaje está guardado y se envía solo en cuanto Arbrain responda.` : causa, error: true, streaming: false }
              : m
          )
        )
        return
      }

      // Consumo compartido con resumeStream: procesa eventos, finaliza el
      // mensaje y persiste+ACK SOLO si llegó `result`.
      const reader = res.body.getReader()
      const { sawResult, sawError } = await consumeStream(reader, {
        assistantId,
        turnId,
        isCurrent,
        userText: trimmed,
        onResumeMeta: meta => {
          if (queuedSubmission && meta.protocol === 'durable-v1' && meta.turnId === turnId) {
            void acknowledgeQueuedChat(queuedSubmission.id).catch(() => {})
          }
        },
        // Destino FIJADO aquí: ya se resolvió arriba (venga del opts o de la
        // creación en background). Si me cambio de conversación mientras Levy
        // responde, el guardado sigue sabiendo a dónde va este turno.
        sessionId: chatSessionId,
        account: opts?.account ?? account,
        audioUrl: opts?.audioUrl,
        imageUrl: opts?.imageUrl,
      })
      if (!sawResult && !sawError && !submission.cancelled) {
        shouldAttemptResume = true
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      // Network errors (screen lock, app backgrounded, WiFi drop) are NOT user errors —
      // ClaudeClaw continues processing in background and saves via /api/chat/complete.
      const isNetworkDrop = err instanceof TypeError && /network|fetch|failed/i.test(err.message)

      if (isAbort || isNetworkDrop) {
        if (submission.cancelled) {
          // Cancelación explícita: conservar historial y diagnóstico; el host confirma el estado.
          if (isCurrent()) intentionalStopRef.current = false
          if (isCurrent()) pendingTurnRef.current = null
          return
        }
        // Drop no intencional: placeholder marcado como done. Si fue RED (no
        // un abort deliberado de detach/ESC), intentar reengancharse al vivo.
        // Red caída: el parcial NO se presenta como respuesta terminada. El
        // diagnóstico dice que el host sigue y que el reenganche la completa.
        const dropDiagnostic = isNetworkDrop
          ? (isOnline() ? 'Conexión interrumpida. Levy sigue trabajando en el servidor; reconectando…' : 'Sin conexión. Levy sigue trabajando en el servidor; la respuesta se completa al reconectar.')
          : undefined
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.streaming ? { ...m, streaming: false, ...(dropDiagnostic ? { diagnostic: dropDiagnostic } : {}) } : m
          )
        )
        if (isNetworkDrop) { shouldAttemptResume = true; if (isCurrent()) setConnection(isOnline() ? 'reconnecting' : 'offline') }
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: 'La conexion se interrumpio. Envia el mensaje de nuevo.', error: true, streaming: false }
              : m
          )
        )
      }
    } finally {
      if (isCurrent()) setLoading(false)
      if (isCurrent()) abortRef.current = null
      // Happy path / error path / network drop: limpiar el snapshot del turno.
      // (El branch de ESC intencional ya lo limpio antes en el catch).
      if (isCurrent()) pendingTurnRef.current = null
      if (pendingSubmissionRef.current?.turnId === turnId) pendingSubmissionRef.current = null
    }

    // Reenganche fuera del try (el finally ya liberó loading). Delay corto:
    // que la red del dispositivo despierte de verdad antes de pegar al live.
    if (shouldAttemptResume) {
      const sid = isCurrent() ? chatSessionId : null
      if (sid) {
        setTimeout(() => {
          void resumeStream(sid, opts?.account ?? account ?? null)
            .then(enganchado => { if (!enganchado) avisarSinSeguimiento(assistantId) })
        }, 600)
      }
    }
  }, [loading, onSave, setLoading, consumeStream, resumeStream, marcarDespacho, avisarSinSeguimiento, profile?.id, account, sessionId, liveWorkspace])

  // Reconstruye un ChatMessage desde la fila persistida, incluyendo los extras
  // del turno guardados en metadata (tasks, summaries, preguntas, usage).
  const fromPersisted = (m: { id: string; role: 'user' | 'assistant'; content: string; created_at: string; audio_url?: string | null; image_url?: string | null; metadata?: MessageMetadata | null }): ChatMessage => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.created_at),
    audioUrl: m.audio_url ?? undefined,
    imageUrl: m.image_url ?? undefined,
    metadata: m.metadata ?? undefined,
    fileAttachments: m.metadata?.fileAttachments ?? undefined,
    tasks: m.metadata?.tasks ?? undefined,
    toolSummaries: m.metadata?.toolSummaries ?? undefined,
    questionPrompts: m.metadata?.questionPrompts ?? undefined,
    usage: m.metadata?.usage ?? undefined,
    downgrade: m.metadata?.downgrade ?? undefined,
    // Tools expandibles en sesiones recargadas (turnos post-30 jul 2026; los
    // viejos no guardaron toolCalls/inputs/outputs y simplemente no traen pills).
    toolCalls: m.metadata?.toolCalls ?? undefined,
    toolInputs: m.metadata?.toolInputs ?? undefined,
    toolOutputs: m.metadata?.toolOutputs ?? undefined,
    ...(m.metadata?.runtimeSnapshot ? snapshotMessage({ ...m.metadata.runtimeSnapshot, text: m.content }) : {}),
    terminalStatus: m.metadata?.terminalStatus,
    diagnostic: m.metadata?.error ?? undefined,
  })

  const loadMessages = useCallback((
    persisted: Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string; audio_url?: string | null; image_url?: string | null; metadata?: MessageMetadata | null }>,
  ) => {
    setMessages(persisted.map(fromPersisted))
    // Restaurar las sugerencias del último turno guardado — al reabrir la
    // sesión los chips reaparecen como en Claude (antes eran efímeras).
    const last = persisted[persisted.length - 1]
    setSuggestions(last?.role === 'assistant' && last.metadata?.suggestions?.length ? last.metadata.suggestions : [])
  }, [])

  // loadMessages reemplaza el estado al cambiar de sesión — las sugerencias del
  // turno anterior ya no aplican a la nueva vista.
  // Prepend de historial viejo (paginación hacia atrás). Dedup por id por si
  // el cursor trae un mensaje que ya está en pantalla.
  const prependMessages = useCallback((
    persisted: Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string; audio_url?: string | null; image_url?: string | null; metadata?: MessageMetadata | null }>,
  ) => {
    setMessages((prev) => {
      const existing = new Set(prev.map((m) => m.id))
      const older = persisted.filter((m) => !existing.has(m.id)).map(fromPersisted)
      return older.length ? [...older, ...prev] : prev
    })
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSuggestions([])
  }, [])

  // Restaura un view completo desde el caché en memoria (chat-view-cache):
  // los ChatMessage van tal cual (ya deserializados, con toolCalls/thinking/
  // usage/tasks vivos — más rico que re-mapear desde Supabase). Percepción de
  // latencia cero al volver a /chat; la verdad del server se reconcilia después.
  const restoreMessages = useCallback((msgs: ChatMessage[], restoredSuggestions?: string[]) => {
    setMessages(msgs)
    setSuggestions(restoredSuggestions ?? [])
  }, [])

  // Responde (o salta, con answers=null) una pregunta interactiva de Levy.
  // Optimistic UI primero — el POST resuelve la promesa de canUseTool en el
  // daemon y el mismo stream SSE que está abierto continúa con la respuesta.
  const answerQuestion = useCallback(async (requestId: string, answers: Record<string, string> | null): Promise<boolean> => {
    const status: QuestionPrompt['status'] = answers && Object.keys(answers).length > 0 ? 'answered' : 'skipped'
    questionStatusRef.current.set(requestId, { status, ...(answers ? { answers } : {}) })
    const patch = (to: QuestionPrompt['status'], withAnswers: boolean) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.questionPrompts?.some((q) => q.requestId === requestId)
            ? {
                ...m,
                questionPrompts: m.questionPrompts.map((q) =>
                  q.requestId === requestId
                    ? { ...q, status: to, ...(withAnswers && answers ? { answers } : {}) }
                    : q,
                ),
              }
            : m,
        ),
      )
    }
    patch(status, true)
    try {
      const res = await fetch('/api/chat/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, ...(answers ? { answers } : {}) }),
      })
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean }
      if (!data.ok) {
        // La pregunta ya no está pendiente en el daemon (expiró/interrumpida)
        questionStatusRef.current.set(requestId, { status: 'timeout' })
        patch('timeout', false)
        return false
      }
      return true
    } catch {
      questionStatusRef.current.set(requestId, { status: 'timeout' })
      patch('timeout', false)
      return false
    }
  }, [])

  // Remueve mensajes por id del state local. Usado por ESC ESC (rewind del ultimo turn) en
  // ChatPanel para borrar user msg + assistant msg sin exponer setMessages directamente.
  const removeMessages = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    setMessages((prev) => prev.filter((m) => !idSet.has(m.id)))
  }, [])

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const turnId = msg.metadata?.turnId
      const byIdentity = prev.findIndex(message => message.role === msg.role && (message.id === msg.id || (!!turnId && message.metadata?.turnId === turnId)))
      if (byIdentity >= 0) {
        return prev.map((existing, index) => index === byIdentity ? {
          ...existing, ...msg,
          ...(msg.metadata?.runtimeSnapshot ? snapshotMessage({ ...msg.metadata.runtimeSnapshot, text: msg.content }) : {}),
          // The stream closure still addresses this ID. Changing it to a DB
          // UUID mid-stream would detach all subsequent deltas from the row.
          id: existing.id, timestamp: existing.timestamp,
          streaming: existing.streaming && loadingRef.current,
          audioUrl: msg.audioUrl ?? existing.audioUrl, imageUrl: msg.imageUrl ?? existing.imageUrl,
          fileAttachments: msg.fileAttachments ?? msg.metadata?.fileAttachments
            ?? (msg.metadata?.runtimeSnapshot?.fileAttachments?.length ? msg.metadata.runtimeSnapshot.fileAttachments : existing.fileAttachments),
          metadata: { ...existing.metadata, ...msg.metadata },
        } : existing)
      }
      if (turnId) return [...prev, msg]
      // Deduplicate by ID (exact match)
      if (prev.some((m) => m.id === msg.id)) {
        return prev
      }

      // If a real assistant message is arriving (from realtime/db), any local empty
      // streaming placeholder is now stale (the SSE conn died but server completed
      // and saved the response). Drop the placeholder so we don't show a ghost.
      let working = prev
      if (msg.role === 'assistant' && msg.content.trim()) {
        working = prev.filter(
          (m) => !(m.streaming && m.role === 'assistant' && !m.content.trim()),
        )
      }

      // Deduplicate by role + content (handles temp ID vs Supabase UUID mismatch)
      // When SSE stream creates a message with id "a-123" and Supabase saves it with a UUID,
      // the realtime subscription fires with the UUID — this check catches that duplicate.
      // Use .trim() because local state may have trailing whitespace while Supabase stores trimmed content.
      const existingIdx = working.findIndex((m) =>
        m.role === msg.role &&
        !m.metadata?.turnId &&
        m.content.trim() === msg.content.trim()
      )

      if (existingIdx !== -1) {
        // MERGE: If a matching message exists, merge Supabase fields (imageUrl, audioUrl, metadata)
        // into the local message. This handles the case where realtime returns message with image_url
        // that wasn't in the local temp message yet.
        const existing = working[existingIdx]
        const merged = {
          ...existing,
          // Update ID to Supabase ID if not already a Supabase ID
          id: existing.id.startsWith('u-') || existing.id.startsWith('a-') ? msg.id : existing.id,
          // Merge attachments from realtime (prefer local if exists)
          audioUrl: existing.audioUrl ?? msg.audioUrl,
          imageUrl: existing.imageUrl ?? msg.imageUrl,
          // Update metadata if coming from Supabase
          metadata: existing.metadata ?? msg.metadata,
        }
        return working.map((m, i) => i === existingIdx ? merged : m)
      }

      return [...working, msg]
    })
  }, [])

  /** Al cerrar un turno con inyecciones que el host dejó como turnos normales, la pantalla los sigue en vivo. */
  useEffect(() => {
    if (loading) return
    const pendiente = reengancheTrasTurnoRef.current
    if (!pendiente) return
    reengancheTrasTurnoRef.current = null
    window.setTimeout(() => { void resumeStream(pendiente.sessionId, pendiente.account) }, 400)
  }, [loading, resumeStream])

  /** ¿Hay un turno de Claude transmitiendo en esta pantalla al que se le puede inyectar? (lib/inyecciones) */
  const turnoInyectable = useCallback((): boolean => {
    const turno = pendingTurnRef.current
    const cuenta = account ?? 'default'
    return loadingRef.current && !!turno?.assistantId && !!streamSessionRef.current && (cuenta === 'default' || cuenta === 'bro')
  }, [account])

  /** Enter con Levy trabajando (7 oct 2026): el mensaje entra al turno EN CURSO, como en Claude Code. La nota
   *  aparece al instante dentro de la actividad («enviando…»), pasa a «entrando…» cuando el host la registra y
   *  a «leído» cuando el motor la toma. false = no aplicó (sin turno vivo, red, rechazo): quien llama la deja
   *  en la fila del dispositivo, como antes. Nunca se pierde ni se duplica: el turnId de la nota es su identidad. */
  const inyectar = useCallback(async (texto: string): Promise<boolean> => {
    const limpio = texto.trim()
    const turno = pendingTurnRef.current
    const sesion = streamSessionRef.current
    if (!limpio || !turnoInyectable() || !turno || !sesion || !profile?.id || !isOnline()) return false
    const id = crypto.randomUUID()
    const ultimaHerramienta = messagesRef.current.find(m => m.id === turno.assistantId)?.toolCalls?.at(-1)?.toolId ?? null
    const at = Date.now()
    notasDe(turno.assistantId, notas => unirNotas(notas, [{ id, texto: limpio, estado: 'enviando', afterToolId: ultimaHerramienta, at }]))
    const quitar = () => notasDe(turno.assistantId, notas => notas.filter(n => n.id !== id))
    const source = /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent) ? 'mobile' : 'desktop'
    let desenlace
    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: limpio, chatSessionId: sesion, account: account ?? 'default', turnId: id, inyectar: true, source, expectedOwnerId: profile.id }),
        signal: AbortSignal.timeout(35_000),
      })
      desenlace = leerDesenlace(res.status, await res.json().catch(() => null))
    } catch { quitar(); return false }
    if (desenlace.tipo === 'rechazado') { quitar(); return false }
    const estado = desenlace.tipo === 'inyectado' ? 'entrando' as const : 'en_fila' as const
    notasDe(turno.assistantId, notas => unirNotas(notas, [{ id, texto: limpio, estado, afterToolId: ultimaHerramienta, at }]))
    return true
  }, [account, profile?.id, notasDe, turnoInyectable])

  /** Verdad síncrona de «hay un turno en esta UI»: `loading` pinta un render después;
   *  quien decide si un envío va a la fila lee esto para no perderlo en ese hueco. */
  const ocupado = useCallback(() => loadingRef.current || despachosRef.current > 0, [])

  /** Cambia el esfuerzo (o Ultracode) de una conversación YA creada directo en el daemon, sin pasar por
   *  /chat/stream (2 oct 2026): por el stream, `sendMessage` descartaba el cambio en silencio si había un
   *  turno en curso y Daniel veía volver el dial a su nivel anterior. Lanza Error si el daemon lo rechaza. */
  const changeEffort = useCallback(async (change: { effort: string } | { ultracode: boolean }, targetSession: string) => {
    const response = await fetch('/api/chat/efforts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: targetSession, account: account ?? 'default', ...change }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'No se pudo cambiar el esfuerzo.')
    if (data && Object.hasOwn(data, 'current') && (data.current === null || typeof data.current === 'string')) setCurrentEffort(data.current)
    if (typeof data?.ultracode === 'boolean') setUltracodeView(data.ultracode)
    // La selección cacheada llevaría el nivel viejo al próximo turno: se descarta y se relee.
    if (profile?.id) {
      const scope = { localOwner: profile.id, account: account ?? 'default', conversationId: targetSession }
      invalidateSelection(scope)
      if (isOnline()) void refreshSelection(scope).catch(() => {})
    }
  }, [account, profile?.id, setCurrentEffort, setUltracodeView])
  return { changeEffort, connection, messages, loading, despachando, ocupado, inyectar, turnoInyectable, sendMessage, resumeStream, loadMessages, prependMessages, clearMessages, restoreMessages, appendMessage, stopStreaming, pauseStreaming, detachStream, currentModel, currentEffort, ultracode, setCurrentEffort, removeMessages, suggestions, answerQuestion }
}
