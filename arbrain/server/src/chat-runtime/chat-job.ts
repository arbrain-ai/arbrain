import { DUENO, DUENO_M } from '../dueno.js'
import { etiquetaDespertador } from './despertadores.js'
import { readEnvFile } from '../env.js'
import { esEdicionCliente } from '../edicion.js'
import { registerLiveCapability } from '../live/capability.js'
import { PROJECT_ROOT, STORE_DIR } from '../config.js'
import { liveStore, liveToolbox } from '../live/runtime.js'
import { LIVE_CONTEXT } from '../live/tools.js'
import { acuseDe, capaRapidaActiva, capaRapidaEsfuerzoActiva, clasificarLive, esfuerzoParaOpus, LIVE_DOS_CAPAS_CONTEXT, type VeredictoLive } from '../live/capa-rapida.js'
import { registrarMensajeDeDaniel, claveConversacion } from '../cabina/chrome-guard.js'
import { logger } from '../logger.js'
import { mcOutbox } from '../mc-client.js'
import { runAgentStream, computeRewindCheckpoint, type SSEEvent, type EffortLevel, type SessionOverrides } from '../agent.js'
import { observarEvento, observarSDK } from '../cabina/internos.js'
import { equipoDelTurno } from '../cabina/equipo.js'

function anotarDelegado(conversacion: string, contenido: unknown) {
  const texto = typeof contenido === 'string' ? contenido : ''
  if (!texto.includes('lanzado')) return
  void import('../cabina/cuerpo.js').then(({ agenteDeResultado, anotarOrigen }) => {
    const id = agenteDeResultado(texto)
    if (id != null) return anotarOrigen(id, conversacion)
  }).catch(() => { /* el panel lo deduce del diario de turnos */ })
}
import { runCodexStream, isCodexAccount } from '../codex-agent.js'
import { saveConversationTurn } from '../memory.js'
import { getSession, setSession, saveQueryUsage } from '../db.js'
import { downloadFromUrl, buildAttachmentMessage, esDocumento, validarAdjunto } from '../media.js'
import { extractFileMarkers, stageAttachment, type StagedAttachment } from '../file-attach.js'
import { takeSpontaneous } from './spontaneous.js'
import type { ChatJournal, TurnRecord } from './journal.js'
import { JobRejected, type JobResult } from './supervisor.js'
import type { CodexSelection } from './codex-pool.js'
import type { ClaudeSelection } from './claude-selection.js'
import type { ChatIntent } from './chat-intent.js'

export interface ChatJobInput {
  /** Internal target set only by the Consejo orchestrator, never copied from HTTP input. */
  deliveryTarget?: 'consejo'
  message: string
  liveWorkspace?: boolean
  context?: string | null
  clientContext?: string | null
  audioUrl?: string | null
  imageUrl?: string | null
  source: 'mobile' | 'desktop'
  sdkSessionId?: string | null
  editOriginalText?: string | null
  editOccurrenceFromEnd?: number
  editTurnId?: string
  effort?: string
  overrides: SessionOverrides
  intent?: ChatIntent
  codexSelection?: CodexSelection
  claudeSelection?: ClaudeSelection
  /** Respuesta que Levy dio por su cuenta (aviso de subagente o Bash de fondo): turno sintético sin mensaje de Daniel. */
  spontaneous?: { kind: 'aviso'; label: string; avisos: Array<{ taskId?: string; status?: string; summary?: string }> }
  /** Turno que disparó un despertador: el mensaje lo escribió Levy para sí mismo, no Daniel. */
  despertador?: { id: string; texto: string; programadoPara: number; disparo: number; /** aviso del motor: terminó un subagente de `delegar` */ tipo?: 'subagente' }
}

/** Complete chat work with no req/res dependency; the stored envelope can dispatch after restart. */
export async function executeChatJob(journal: ChatJournal, turn: TurnRecord, emit: (event: unknown, snapshot?: unknown) => void, signal: AbortSignal): Promise<JobResult> {
  const input = turn.input as ChatJobInput
  const account = turn.account === 'default' ? undefined : turn.account
  const native = isCodexAccount(account)
  // El flujo vivo de una respuesta espontánea solo existe en el proceso que la vio nacer.
  const spontaneous = input.spontaneous ? takeSpontaneous(turn.turnId) : undefined
  if (input.spontaneous && !spontaneous) throw new JobRejected('La respuesta espontánea ya no está disponible en este proceso.')
  if (!native && input.effort && !['low', 'medium', 'high', 'xhigh', 'max'].includes(input.effort)) throw new JobRejected('El esfuerzo seleccionado no está admitido por el adaptador Claude.')
  const sessionKey = `${turn.owner}:${turn.conversationId}::${turn.account}`
  const legacyKey = account ? `${turn.conversationId}::${account}` : turn.conversationId
  let sessionId = getSession(sessionKey) ?? input.sdkSessionId ?? getSession(legacyKey)
  let rewindUuid: string | undefined
  let freshClaudeSession = false
  let nativeEditTurnId: string | undefined
  if (native && input.editTurnId) {
    const original = journal.get({ ...turn, turnId: input.editTurnId })
    if (!original) throw new JobRejected('No se encontró la identidad del turno editado. No se elegirá otro mensaje por su texto.')
    if ((original.input as ChatJobInput).message !== input.editOriginalText || !original.nativeThreadId || !original.nativeTurnId) throw new JobRejected('No se pudo confirmar el turno original de la edición.')
    sessionId = original.nativeThreadId
    nativeEditTurnId = original.nativeTurnId
  }
  if (input.editOriginalText && sessionId) {
    if (!native) {
      const checkpoint = await computeRewindCheckpoint(sessionId, input.editOriginalText, input.editOccurrenceFromEnd ?? 1, account)
      if (!checkpoint.found) throw new JobRejected('No se encontró el punto de edición; no se enviará con el contexto posterior.')
      rewindUuid = checkpoint.checkpointUuid
      if (!rewindUuid) { sessionId = undefined; freshClaudeSession = true }
    }
  }

  const imagePaths: string[] = []
  for (const url of input.imageUrl?.split('\n').filter(Boolean) ?? []) {
    const error = validarAdjunto(url)
    if (error) throw new JobRejected(`Adjunto rechazado: ${error}`)
    try { imagePaths.push(await downloadFromUrl(url)) }
    catch { throw new JobRejected('No se pudo descargar un adjunto; el turno no se envió al motor.') }
  }
  // Imágenes: Claude las lee por ruta; Codex las recibe nativas (-i). Documentos (PDF, Word…): ambos por ruta en el texto.
  const documentPaths = imagePaths.filter(esDocumento)
  const nativeImagePaths = imagePaths.filter(file => !esDocumento(file))
  const attachmentText = (native ? documentPaths : imagePaths).map(buildAttachmentMessage).join('\n\n')
  const prompt = (input.context ? `[Context: ${input.context}]\n\n` : '') + (attachmentText ? attachmentText + '\n\n' : '') + input.message
  const snapshot = {
    text: '', thinking: '', status: 'running', error: null as string | null,
    tools: {} as Record<string, Record<string, unknown>>, items: {} as Record<string, Record<string, unknown>>,
    usage: null as Record<string, unknown> | null,
    questions: {} as Record<string, unknown>, tasks: {} as Record<string, unknown>,
    toolSummaries: [] as string[], suggestions: [] as string[], fileAttachments: [] as unknown[], artifactErrors: [] as string[],
    persistenceWarnings: [] as string[],
    branch: null as { parentThreadId: string; beforeTurnId: string; threadId: string } | null,
  }
  let events = 0, sawResult = false, confirmedFailure = false, confirmedInterrupt = false, uncertain = false
  const tareaCtx = { conversationId: turn.conversationId, turnId: turn.turnId }
  const setWaiting = (waiting: boolean) => {
    try { journal.transition(turn, waiting ? 'waiting' : 'running') } catch (error) { logger.warn({ err: error, turnId: turn.turnId, waiting }, 'chat: no se pudo marcar la espera de respuesta') }
  }
  const consume = (event: SSEEvent) => {
    // Subagentes internos y comandos en segundo plano al panel (una sola lista de lo que trabaja).
    if (event.type.startsWith('task_') || event.type === 'tool_result') observarEvento(tareaCtx, event as unknown as Record<string, unknown>)
    // Un subagente lanzado con `delegar` queda anotado con la conversación de la que salió (3 oct 2026).
    if (event.type === 'tool_result') anotarDelegado(turn.conversationId, (event as { content?: unknown }).content)
    if (event.type === 'native_branch') {
      snapshot.branch = { parentThreadId: event.parentThreadId, beforeTurnId: event.beforeTurnId, threadId: event.threadId }
      journal.bindNative(turn, event.threadId)
    } else if (event.type === 'init') {
      journal.bindNative(turn, event.sessionId)
    } else if (event.type === 'native_turn') {
      journal.bindNative(turn, event.threadId, event.turnId)
      // A fork exists before replacement acceptance. Do not silently switch
      // subsequent messages to a truncated child if that submission fails.
      setSession(sessionKey, event.threadId)
    }
    else if (event.type === 'text_delta') snapshot.text += event.text
    else if (event.type === 'thinking_delta') snapshot.thinking += event.text
    else if (event.type === 'tool_start') snapshot.tools[event.toolId] = { name: event.toolName, input: '', status: 'running' }
    else if (event.type === 'tool_input_delta') {
      const tool = snapshot.tools[event.toolId] ??= { input: '' }; tool.input = String(tool.input ?? '') + event.partial
    } else if (event.type === 'tool_result') Object.assign(snapshot.tools[event.toolId] ??= {}, { result: event.content, error: event.isError, durationMs: event.durationMs })
    else if (event.type === 'tool_done') Object.assign(snapshot.tools[event.toolId] ??= {}, { status: 'completed' })
    else if (event.type === 'usage') snapshot.usage = { ...event }
    else if (event.type === 'ask_user_question') {
      snapshot.questions[event.requestId] = event
      // Estado real (3 oct 2026): mientras Levy espera tu respuesta el turno está en `waiting`;
      // /chat/active lo reporta y el punto de la conversación se pinta azul («te toca a ti»).
      setWaiting(true)
    }
    else if (event.type === 'question_resolved') {
      delete snapshot.questions[event.requestId]
      if (!Object.keys(snapshot.questions).length) setWaiting(false)
    }
    else if (event.type.startsWith('task_') && 'taskId' in event) {
      const previous = snapshot.tasks[event.taskId] as Record<string, unknown> | undefined
      snapshot.tasks[event.taskId] = { ...previous, ...event, status: 'status' in event ? event.status : previous?.status ?? 'running' }
    }
    else if (event.type === 'tool_summary') snapshot.toolSummaries.push(event.summary)
    else if (event.type === 'suggestion') snapshot.suggestions.push(event.suggestion)
    else if (event.type === 'error') { snapshot.error = event.message; uncertain ||= event.uncertain === true }
    else if (event.type === 'interrupt') confirmedInterrupt = true
    else if (event.type === 'result') { sawResult = true; snapshot.text = event.text; confirmedInterrupt ||= event.terminalReason === 'interrupted'; confirmedFailure ||= event.terminalReason === 'failed' }
    else if (event.type === 'native_update') {
      const update = event.update
      if (update.type === 'item') snapshot.items[update.item.id] = structuredClone(update.item) as unknown as Record<string, unknown>
      if (update.type === 'delta') {
        const item = snapshot.items[update.itemId]
        if (item && update.field === 'text') item.text = String(item.text ?? '') + update.delta
        if (item && update.field === 'output') {
          const data = item.data as Record<string, unknown>; data.output = String(data.output ?? '') + update.delta
        }
      }
      if (update.type === 'terminal') { confirmedFailure ||= update.status === 'failed'; confirmedInterrupt ||= update.status === 'interrupted' }
    }
    emit(event, ++events % 25 === 0 || event.type === 'native_branch' ? structuredClone(snapshot) : undefined)
  }
    const liveScope = { owner: turn.owner, account: turn.account, conversationId: turn.conversationId }
    const live = input.liveWorkspace ? liveToolbox(liveScope, turn.turnId, signal, event => emit(event)) : undefined
    if (live) liveStore().begin(liveScope, turn.turnId)
    const capability = live ? registerLiveCapability(live, parseInt(process.env.ARBRAIN_LIVE_TOOL_PORT ?? process.env.MC_SERVER_PORT ?? readEnvFile()['MC_SERVER_PORT'] ?? '3099', 10)) : undefined
    // Lo que llegó (goal 2): en el PRIMER turno de una conversación, Levy recibe
    // avisos sin leer, reportes recientes y entregas atrasadas, y abre con eso.
    let apertura = ''
    // Quién te escribe (16 oct 2026): otra persona del equipo (perfiles_equipo de instalacion.json) recibe su identidad y
    // su contexto, nunca la campana del dueño. Ver cabina/equipo.ts.
    let equipo: ReturnType<typeof equipoDelTurno> = null
    if (!input.editOriginalText && input.deliveryTarget !== 'consejo' && !spontaneous && !input.despertador) {
      try { equipo = equipoDelTurno(turn.owner, PROJECT_ROOT, STORE_DIR, !sessionId) } catch { /* ayuda, nunca bloquea el turno */ }
      if (equipo?.bloque) apertura = '\n\n' + equipo.bloque.texto
    }
    // Edición cliente: no hay campana ni crons de la instalación original; nada que abrir (ni errores que citar).
    if (!equipo && !sessionId && !input.editOriginalText && input.deliveryTarget !== 'consejo' && !input.liveWorkspace && !spontaneous && !esEdicionCliente()) {
      try {
        const { loQueLlego, bloqueApertura } = await import('../cabina/llegado.js')
        const bloque = bloqueApertura(await loQueLlego(mcOutbox()?.pendientes() ?? []))
        if (bloque) apertura = '\n\n' + bloque
        // Cierre del día (v67): sustituyó al aviso de las 20:00. APAGADO el 1 oct 14:50 por Daniel
        // («quitémoslo, nunca lo lleno y solo añade ruido»). Volver a encender: CIERRE_CONVERSACIONAL=1 en .env.
        if ((process.env.CIERRE_CONVERSACIONAL ?? readEnvFile()['CIERRE_CONVERSACIONAL']) === '1') {
          const { cierreDelDia } = await import('../cabina/cierre.js')
          const cierre = await cierreDelDia()
          if (cierre) apertura += '\n\n' + cierre
        }
      } catch { /* la apertura es ayuda, nunca bloquea el turno */ }
    }
    const conApertura = prompt + apertura
    // Dos capas (4 oct 2026, solo Live): Jev clasifica en ~200 ms mientras Opus arranca; ver docs/builds/live-dos-capas-jev-2026-10-04.md.
    const dosCapas = !!live && !native && !spontaneous && !input.despertador && capaRapidaActiva()
    const veredicto: Promise<VeredictoLive | null> | undefined = dosCapas ? clasificarLive(input.message, { signal }) : undefined
    veredicto?.then(v => {
      const acuse = acuseDe(v)
      logger.info({ conversationId: turn.conversationId, turnId: turn.turnId, ruta: v?.ruta, confianza: v?.confianza, esfuerzo: v?.esfuerzo, ms: v?.ms, acuse: !!acuse && !snapshot.text }, 'live: capa rápida')
      // Si Opus ya habló, el acuse llegaría tarde y se duplicaría: se descarta.
      if (!acuse || snapshot.text || signal.aborted) return
      emit({ type: 'live_status', text: acuse.status })
      emit({ type: 'live_ack', text: acuse.text, ruta: v?.ruta ?? null, ms: v?.ms ?? null })
    }).catch(() => { /* la capa rápida es ayuda, nunca bloquea el turno */ })
    let claudeSelection = input.claudeSelection
    if (veredicto && claudeSelection && capaRapidaEsfuerzoActiva()) {
      const nuevo = esfuerzoParaOpus(await veredicto, claudeSelection.effort)
      if (nuevo) { logger.info({ turnId: turn.turnId, de: claudeSelection.effort, a: nuevo }, 'live: esfuerzo bajado por la capa rápida'); claudeSelection = { ...claudeSelection, effort: nuevo } }
    }
    const livePrompt = live ? conApertura + '\n\n' + LIVE_CONTEXT + (dosCapas ? ' ' + LIVE_DOS_CAPAS_CONTEXT : '') + `\nSi workspace no aparece como herramienta nativa, usa tu herramienta de shell: python3 ${JSON.stringify(PROJECT_ROOT + '/arbrain/server/scripts/live/workspace.py')} ${JSON.stringify(capability!.file)} '<JSON de la operación>'. La capacidad es privada y solo dura este turno; no muestres su archivo ni su contenido a ${DUENO} ni a los artefactos. Si lo usas, empieza con {"action":"read"}.` : conApertura
    // claude-in-chrome: un «sí» de Daniel convierte la acción detenida en permiso
    // corto para ese sitio. Lo registra el servidor con su mensaje, nunca Levy.
    if (!native && !spontaneous && !input.despertador) {
      const concedidos = registrarMensajeDeDaniel(claveConversacion(liveScope), input.message)
      if (concedidos.length) logger.info({ conversationId: turn.conversationId, concedidos }, `chrome: permiso concedido por ${DUENO}`)
    }
    const iterator = native
      ? runCodexStream(livePrompt, sessionId, signal, input.effort, 'web', nativeImagePaths, input.overrides, account, input.editOriginalText ? { originalText: input.editOriginalText, occurrenceFromEnd: input.editOccurrenceFromEnd ?? 1, ...(nativeEditTurnId ? { nativeTurnId: nativeEditTurnId } : {}) } : undefined, input.codexSelection, live)
      : runAgentStream(livePrompt, sessionId, signal, input.effort as EffortLevel | undefined, undefined, 'web', false, account, rewindUuid, input.overrides, {
        scope: { owner: turn.owner, account: turn.account, conversationId: turn.conversationId, turnId: turn.turnId },
        freshSession: freshClaudeSession,
        selection: claudeSelection,
        live,
        ...(spontaneous ? { adopted: { events: spontaneous.reply.events, interrupt: spontaneous.reply.interrupt, bindCanUseTool: spontaneous.bindCanUseTool } } : {}),
        onBackground: event => {
          // Native scheduled messages can have an ID this app never submitted.
          // Preserve them scoped to the conversation without fabricating a turn.
          const knownTurn = event.turnId && journal.get({ ...turn, turnId: event.turnId }) ? event.turnId : undefined
          if (event.type === 'message') observarSDK({ conversationId: turn.conversationId, turnId: event.turnId ?? turn.turnId }, event.message as unknown as Record<string, unknown>)
          journal.observeProvider(turn, event, knownTurn)
        },
      })
    try { for await (const event of iterator) consume(event) }
    finally { capability?.close(); if (live) liveStore().end(liveScope, turn.turnId) }
  if (uncertain) throw new Error('El resultado de la ejecución nativa es incierto.')
  const status = confirmedInterrupt || (signal.aborted && !sawResult) ? 'interrupted' : confirmedFailure || snapshot.error || !sawResult ? 'failed' : 'completed'
  snapshot.status = status
  if (status === 'completed' && snapshot.text) { try { equipo?.marcar() } catch { /* se reintenta en el siguiente turno */ } }
  const stagedAttachments: StagedAttachment[] = []
  if (status === 'completed' && snapshot.text) {
    const { cleanText, paths } = extractFileMarkers(snapshot.text)
    for (const file of paths) {
      try { stagedAttachments.push(await stageAttachment(file, turn.turnId)) }
      catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo preparar un adjunto.'
        snapshot.artifactErrors.push(message)
        emit({ type: 'artifact_error', message })
      }
    }
    if (paths.length) { snapshot.text = cleanText + (snapshot.artifactErrors.length ? '\n\nNo se pudo preparar uno de los adjuntos. El texto del resultado se conservó.' : ''); emit({ type: 'result', text: snapshot.text, terminalReason: status }) }
  }
  // Auxiliary indexes must not turn a confirmed model result into uncertain
  // execution. Preserve the result and expose the missing side effect durably.
  try {
    if (snapshot.usage) {
      const u = snapshot.usage
      saveQueryUsage({ sessionKey, costUsd: Number(u.costUsd), inputTokens: Number(u.inputTokens), outputTokens: Number(u.outputTokens), durationMs: Number(u.durationMs), numTurns: Number(u.numTurns) })
    }
  } catch { snapshot.persistenceWarnings.push('No se pudo actualizar el índice de uso; el consumo del turno se conserva en su resultado.') }
  try {
    if (process.env.ARBRAIN_LIVE_CANARY !== '1' && input.deliveryTarget !== 'consejo' && !spontaneous && !input.despertador && status === 'completed' && snapshot.text) await saveConversationTurn(`${turn.owner}::${turn.account}`, input.message, snapshot.text)
  } catch { snapshot.persistenceWarnings.push('No se pudo actualizar la memoria semántica; la conversación se conserva en su resultado.') }
  return {
    status, snapshot,
    payload: {
      ...(input.deliveryTarget === 'consejo' ? {deliveryTarget:'consejo'} : {}),
      chatSessionId: turn.conversationId, turnId: turn.turnId, ownerId: turn.owner, account: turn.account,
      userMessage: input.message, assistantMessage: snapshot.text, audioUrl: input.audioUrl, imageUrl: input.imageUrl,
      source: input.source, clientWasConnected: false, usage: snapshot.usage,
      toolSummaries: snapshot.toolSummaries, suggestions: snapshot.suggestions, fileAttachments: snapshot.fileAttachments,
      terminalStatus: status, error: snapshot.error, runtimeSnapshot: snapshot, stagedAttachments,
      // Origen del turno (chat vivo): la web no pinta burbuja de Daniel para un despertar y marca el del despertador.
      ...(input.spontaneous ? { origen: { tipo: 'espontanea', etiqueta: input.spontaneous.label } } : {}),
      ...(input.despertador ? { origen: { tipo: 'despertador', etiqueta: etiquetaDespertador(input.despertador), despertadorId: input.despertador.id } } : {}),
    },
  }
}
