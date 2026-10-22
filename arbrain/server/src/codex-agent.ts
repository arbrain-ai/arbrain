import type { LiveToolbox, LiveInput } from './live/tools.js'
import { ejecutarCabina, cabinaDynamicTools } from './cabina/tools.js'
// Persistent App Server transport, isolated by subscription account.
// Existing SSE consumers receive a compatibility projection plus native ordered items.
import { randomUUID } from 'node:crypto'
import { RpcConnectionError } from './chat-runtime/codex-rpc.js'
import { CodexRuntimePool, type CodexSelection } from './chat-runtime/codex-pool.js'
import { codexContextConfig } from './chat-runtime/codex-context.js'
import { executeCodexTurn } from './chat-runtime/codex-turn.js'
import { CodexSseProjection } from './chat-runtime/codex-sse.js'
import { forkNativeEdit, forkNativeThread, type NativeEdit } from './chat-runtime/codex-fork.js'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PROJECT_ROOT } from './config.js'
import { opsLogger } from './ops-logger.js'
import { motorApiEncendido, rutaDeCuenta, rutasApi } from './modelos/registro.js'
import { entornoDeRuta, homeDeRuta, prepararHome } from './modelos/codex-proveedor.js'
import type { SSEEvent, OpsSource, SessionOverrides } from './agent.js'
import { esEdicionCliente, textoMotorApiApagado } from './edicion.js'
import { CUENTA_ALTERNA_NO_DISPONIBLE, dirCodexAlterna } from './cuentas-alternas.js'

/** Edición cliente (AUDITORIA I4): Codex escribe solo en el workspace. La instalación de Daniel, acceso total como siempre. */
const sandboxCodex = () => (esEdicionCliente() ? 'workspace-write' : 'danger-full-access') as 'workspace-write' | 'danger-full-access'

/** Edición cliente: Codex no corre (no pasa por la guardia de los agentes). */
export const MENSAJE_CODEX_CLIENTE = 'Codex no está disponible en esta edición: la guardia de Arbrain (tu confirmación, secretos negados, contenido de afuera tratado como datos) solo cubre a Claude.'

/** Identificador del espacio en el chat (chat_sessions.account, body.account). */
export const CODEX_ACCOUNT = 'codex'

const DEFAULT_CODEX_HOME = process.env['CODEX_HOME'] || path.join(os.homedir(), '.codex')

// ─── Cuarto espacio: "yt" (6 sep 2026) ───────────────────────────────────────
// Mismo motor (Codex CLI), OTRA cuenta de ChatGPT (la alterna de la instalación).
// Es a Codex lo que la cuenta alterna 'bro' es a Claude: el aislamiento se logra
// inyectando CODEX_HOME en el spawn — el CLI resuelve auth.json/config.toml
// desde ahí, así el login alterno nunca toca el ~/.codex principal (que
// además comparte con la app de escritorio de ChatGPT).
export const CODEX_YT_ACCOUNT = 'yt'

/** Home (CODEX_HOME) por espacio. Default = el ~/.codex de Daniel. */
// La carpeta es dato de la instalación (cuentas-alternas.ts); en la edición cliente 'yt' no existe.
const codexAccountHomes = (): Record<string, string> => {
  const yt = dirCodexAlterna()
  return yt ? { [CODEX_YT_ACCOUNT]: yt } : {}
}

/** ¿Este `account` lo atiende el motor Codex (y no Claude)? Incluye los espacios por API del registro
 *  (motor estándar, 2 oct 2026): mismo App Server, otro proveedor. */
export function isCodexAccount(account?: string | null): boolean {
  return account === CODEX_ACCOUNT || (account === CODEX_YT_ACCOUNT && !!dirCodexAlterna()) || !!rutaDeCuenta(account)
}

/** CODEX_HOME del espacio: 'yt' → su carpeta alterna; espacio por API → ~/.codex-<espacio>;
 *  'codex'/undefined → ~/.codex (respetando un CODEX_HOME heredado del entorno). */
export function codexHomeFor(account?: string | null): string {
  const ruta = rutaDeCuenta(account)
  if (ruta) return homeDeRuta(ruta)
  if (account === CODEX_YT_ACCOUNT) {
    const yt = codexAccountHomes()[CODEX_YT_ACCOUNT]
    // Edición cliente: la cuenta alterna no existe; nunca se cae al ~/.codex principal en silencio.
    if (!yt) throw new Error(CUENTA_ALTERNA_NO_DISPONIBLE)
    return yt
  }
  return DEFAULT_CODEX_HOME
}

/** `model_provider` del hilo: 'openai' en las cuentas ChatGPT; el id del registro en un espacio por API. */
export function codexModelProvider(account?: string | null): string {
  return rutaDeCuenta(account)?.codex?.providerId ?? 'openai'
}

/** Modelo que corre si Daniel no eligió otro con /model y config.toml no dice nada. */
export const CODEX_DEFAULT_MODEL = 'gpt-6-astra'

/** Catálogo curado (actualizado con OpenAI Docs, 22 sep 2026) para el header
 *  del chat y el /model. No es exhaustivo: cualquier id que empiece con gpt-/
 *  codex-/o<N> se pasa tal cual al CLI. */
export const CODEX_MODEL_DISPLAY_NAMES: Record<string, string> = {
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-sol': 'GPT-6 Sol',
  'gpt-6-luna': 'GPT-6 Luna',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-5.5': 'GPT-5.5',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5.3-codex-spark': 'GPT-5.3 Codex Spark',
}

/** Modelo que correría el próximo turno de un espacio Codex: el override de la
 *  conversación (si es de OpenAI) o el `model =` del config.toml de ESE home. */
export function codexCurrentModel(account?: string | null, override?: string | null): string {
  const ruta = rutaDeCuenta(account)
  if (ruta) return override === ruta.modelId ? override : ruta.modelId
  return isCodexModel(override) ? (override as string) : configModel(codexHomeFor(account))
}

/** Nombre visible: el del registro en un espacio por API; el curado de OpenAI si no. */
export function codexModelName(account: string | null | undefined, model: string): string {
  const ruta = rutaDeCuenta(account)
  return ruta && model === ruta.modelId ? ruta.nombre : CODEX_MODEL_DISPLAY_NAMES[model] ?? model
}

/** ¿Este modelo pertenece al espacio? En un espacio por API, solo el de su ruta. */
export function codexModelBelongs(account: string | null | undefined, model: string | null | undefined): boolean {
  const ruta = rutaDeCuenta(account)
  return ruta ? model === ruta.modelId : isCodexModel(model)
}

/** ¿Este id de modelo es de OpenAI/Codex (y no de Claude)? Lo usa el /model
 *  del chat para decidir a qué motor pertenece un override. */
export function isCodexModel(id: string | null | undefined): boolean {
  return !!id && /^(gpt-|codex-|o[1-9])/i.test(id)
}

/** Binario del CLI. launchd NO hereda el PATH del shell (el plist apunta a nvm +
 *  homebrew), así que resolvemos rutas conocidas antes de caer al PATH. */
export function resolveCodexBin(): string {
  const candidates = [
    process.env['CODEX_BIN'],
    path.join(os.homedir(), '.local', 'bin', 'codex'),
    // Edición cliente: solo CODEX_BIN, ~/.local/bin o el PATH del alumno; nada de rutas de Homebrew ni apps de Daniel.
    ...(esEdicionCliente() ? [] : ['/opt/homebrew/bin/codex', '/usr/local/bin/codex', '/Applications/ChatGPT.app/Contents/Resources/codex']),
  ].filter((p): p is string => !!p)
  for (const p of candidates) if (existsSync(p)) return p
  return 'codex'
}

/** Modelo default del CLI: `model = "..."` en ~/.codex/config.toml (el mismo
 *  que usa la app de escritorio de ChatGPT), o nuestro default. */
function configToml(home: string): string {
  try { return readFileSync(path.join(home, 'config.toml'), 'utf8') } catch { return '' }
}
function configModel(home: string): string {
  const m = configToml(home).match(/^\s*model\s*=\s*"([^"]+)"/m)
  return m?.[1] ?? CODEX_DEFAULT_MODEL
}
function configEffort(home: string): string | null {
  const m = configToml(home).match(/^\s*model_reasoning_effort\s*=\s*"([^"]+)"/m)
  return m?.[1] ?? null
}
export function codexConfiguredEffort(account?: string | null): string | null { return configEffort(codexHomeFor(account)) }

/** Capture effective settings before accepting queued work, never at dispatch. */
export async function resolveCodexSelection(account: string, overrides: SessionOverrides, effort?: string): Promise<CodexSelection> {
  if (overrides.model && !codexModelBelongs(account, overrides.model)) throw new Error(rutaDeCuenta(account) ? 'El modelo seleccionado no pertenece a este espacio.' : 'El modelo seleccionado no pertenece a esta cuenta OpenAI.')
  if (overrides.ultracode) throw new Error('Ultracode no está anunciado por este runtime OpenAI; no se aplicará otro ajuste en su lugar.')
  return codexRuntime().resolveSelection(account, {
    model: codexCurrentModel(account, overrides.model),
    effort: effort ?? overrides.effort ?? null, // sin elección: el pool aplica el default medium (2 oct 2026)
    serviceTier: overrides.fast ? 'priority' : 'default',
  })
}

/** ¿Hay login de ChatGPT vivo? (auth.json con tokens). Sin esto el CLI
 *  intentaría abrir el navegador → en el daemon = cuelgue. */
export function codexAuthStatus(account?: string | null): { ok: boolean; mode: string | null; lastRefresh: string | null } {
  try {
    const raw = JSON.parse(readFileSync(path.join(codexHomeFor(account), 'auth.json'), 'utf8')) as Record<string, unknown>
    const tokens = raw['tokens'] as Record<string, unknown> | undefined
    const mode = typeof raw['auth_mode'] === 'string' ? raw['auth_mode'] : null
    const hasTokens = !!tokens && typeof tokens['access_token'] === 'string'
    return { ok: mode === 'chatgpt' && hasTokens, mode, lastRefresh: typeof raw['last_refresh'] === 'string' ? raw['last_refresh'] : null }
  } catch {
    return { ok: false, mode: null, lastRefresh: null }
  }
}

let runtime: CodexRuntimePool | undefined
export function codexRuntime(): CodexRuntimePool {
  const porApi = Object.fromEntries(rutasApi().map(ruta => [ruta.cuenta, {
    home: homeDeRuta(ruta),
    apiKey: {
      // Interruptor: apagado, el espacio existe pero no lanza proceso ni gasta un token.
      prepare: () => { if (!motorApiEncendido()) throw new Error(textoMotorApiApagado('El motor por API está apagado. Enciéndelo con ARBRAIN_MOTOR_API=1 en arbrain/server/.env.')); prepararHome(ruta) },
      env: () => entornoDeRuta(ruta),
    },
  }]))
  return runtime ??= new CodexRuntimePool({
    accounts: { codex: { home: codexHomeFor('codex') }, ...(dirCodexAlterna() ? { yt: { home: codexHomeFor('yt') } } : {}), ...porApi },
    cwd: PROJECT_ROOT, bin: resolveCodexBin(),
  })
}

/** Bifurca el hilo Codex de una conversación (menú «⋯ → Bifurcar», 1 oct 2026): devuelve el id del hilo nuevo,
 *  con toda la historia del original. Mismos parámetros de ejecución que un turno normal de esa cuenta. */
export async function forkCodexThread(threadId: string, account: string): Promise<string> {
  if (esEdicionCliente()) throw new Error(MENSAJE_CODEX_CLIENTE)
  const pool = codexRuntime()
  const model = codexCurrentModel(account)
  const runtimeModel = await pool.validateSelection(account, { model, effort: configEffort(codexHomeFor(account)) })
  const client = await pool.connection(account)
  const config = codexContextConfig(runtimeModel)
  const lock = `${account}:${threadId}`
  if (activeNativeThreads.has(lock)) throw new Error('Esta conversación aún tiene un turno activo. Espera su finalización.')
  return forkNativeThread(client, threadId, { cwd: PROJECT_ROOT, model, modelProvider: codexModelProvider(account), sandbox: sandboxCodex(), approvalPolicy: 'never', ...(config ? { config } : {}) })
}

const pendingNativeQuestions = new Map<string, { answer: (answers: Record<string, string> | null) => boolean }>()
export function hasPendingCodexQuestion(requestId: string): boolean { return pendingNativeQuestions.has(requestId) }
/** Opaque one-use request IDs are returned only in the authenticated turn stream. */
export function answerCodexQuestion(requestId: string, answers: Record<string, string> | null): boolean {
  const pending = pendingNativeQuestions.get(requestId)
  if (!pending) return false
  const answered = pending.answer(answers)
  if (answered) pendingNativeQuestions.delete(requestId)
  return answered
}

const activeNativeThreads = new Set<string>()

export async function* runCodexStream(
  message: string,
  threadId?: string,
  signal?: AbortSignal,
  effort?: string,
  source: OpsSource = 'web',
  imagePaths: string[] = [],
  overrides?: SessionOverrides,
  account: string = CODEX_ACCOUNT,
  edit?: NativeEdit,
  selection?: CodexSelection,
  live?: LiveToolbox,
): AsyncGenerator<SSEEvent> {
  // Seguridad noche 21 oct (carril 2): en la edición cliente Codex correría con `approvalPolicy: 'never'` y sin la guardia
  // de Arbrain (confirmación humana, secretos negados, contenido de afuera = datos). Hasta que tenga su propia guardia, no corre.
  if (esEdicionCliente()) { yield { type: 'error', message: MENSAJE_CODEX_CLIENTE }; return }
  const pool = codexRuntime()
  const home = codexHomeFor(account)
  const model = selection ? selection.model : codexCurrentModel(account, overrides?.model)
  const effortLevel = selection ? selection.effort : effort ?? overrides?.effort ?? configEffort(home)
  const startedAt = Date.now()
  let lock = threadId ? `${account}:${threadId}` : undefined
  if (lock && activeNativeThreads.has(lock)) {
    yield { type: 'error', message: 'Esta conversación aún tiene un turno activo. Espera su finalización o interrúmpelo.' }
    return
  }
  if (lock) activeNativeThreads.add(lock)
  const unanswered = new Map<string, () => void>()
  let mutationPending = false
  try {
    if (signal?.aborted) throw new Error('Interrumpido antes de enviar.')
    const runtimeModel = await pool.validateSelection(account, { model, effort: effortLevel, ...(selection ? { serviceTier: selection.serviceTier } : {}) })
    const client = await pool.connection(account)
    if (signal?.aborted) throw new Error('Interrumpido antes de enviar.')
    // Preserve the existing daemon's explicit execution policy. Permissions UI is
    // a separate contract; no hidden approval or account fallback is introduced here.
    const config = codexContextConfig(runtimeModel)
    const params = { ...(!threadId ? { dynamicTools: [...cabinaDynamicTools(), ...(live ? live.dynamicTools() : [])] } : {}), cwd: PROJECT_ROOT, model, modelProvider: codexModelProvider(account), sandbox: sandboxCodex(), approvalPolicy: 'never', ...(config ? { config } : {}) }
    let session: { thread: { id: string; status?: { type: string } }; model: string }
    if (edit) {
      if (!threadId) throw new Error('No existe una conversación nativa para esta edición.')
      const fork = await forkNativeEdit(client, threadId, edit, params, signal, () => { mutationPending = true })
      mutationPending = false
      // Persist branch provenance before rebinding the conversation or dispatch.
      yield { type: 'native_branch', ...fork.branch }
      threadId = fork.branch.threadId
      session = { thread: { id: threadId }, model: fork.model }
    } else {
      mutationPending = true
      session = await client.request(threadId ? 'thread/resume' : 'thread/start', {
        ...params, ...(threadId ? { threadId, excludeTurns: true } : {}),
      })
      mutationPending = false
    }
    if (!session.thread?.id || (threadId && session.thread.id !== threadId)) throw new Error('El motor no confirmó la identidad de la conversación.')
    if (session.thread.status?.type === 'active') throw new Error('El motor sigue trabajando en esta conversación. Hay que recuperar ese turno antes de enviar otro.')
    threadId = session.thread.id
    if (!lock) { lock = `${account}:${threadId}`; activeNativeThreads.add(lock) }
    yield { type: 'init', sessionId: threadId }
    yield { type: 'model_changed', model: session.model, resolved: session.model }
    yield { type: 'status', status: 'requesting' }
    if (signal?.aborted) throw new Error('Interrumpido antes de enviar.')
    opsLogger.log('session_start', source, { model: session.model, engine: 'codex-app-server' }, threadId)
    const projection = new CodexSseProjection(session.model, startedAt, effortLevel ?? null)
    const input: unknown[] = [{ type: 'text', text: message }]
    for (const imagePath of imagePaths) {
      if (!existsSync(imagePath)) throw new Error('Una imagen adjunta ya no está disponible en el servidor.')
      input.push({ type: 'localImage', path: imagePath })
    }
    mutationPending = true
    for await (const event of executeCodexTurn(client, { threadId, input, model, effort: effortLevel ?? undefined, ...(selection ? { serviceTier: selection.serviceTier } : {}), signal })) {
      if (event.type === 'started') {
        yield { type: 'native_turn', threadId: event.threadId, turnId: event.turnId, account }
      } else if (event.type === 'update') {
        for (const projected of projection.apply(event.update)) yield projected
      } else {
        const request = event.request
        if (request.method === 'item/tool/call' && typeof request.params.tool === 'string' && request.params.tool.startsWith('cabina_')) {
          const result = await ejecutarCabina(request.params.tool.slice('cabina_'.length), request.params.arguments)
          if (!signal?.aborted) client.respond(request.id, { contentItems: [{ type: 'inputText', text: result.text }], success: !result.error })
        } else if (request.method === 'item/tool/call' && request.params.tool === 'live_workspace' && live) {
          const result = await live.call(request.params.arguments as LiveInput)
          if (!signal?.aborted) client.respond(request.id, { contentItems: [{ type: 'inputText', text: result.text }], success: !result.error })
        } else if (request.method === 'item/tool/requestUserInput' && Array.isArray(request.params.questions)) {
          const questions = request.params.questions as Array<{ id: string; question: string; header: string; options?: unknown[] }>
          const requestId = randomUUID()
          const cancel = () => {
            pendingNativeQuestions.delete(requestId)
            try { client.reject(request.id, 'El turno terminó antes de recibir respuesta') } catch { /* connection may be closed */ }
          }
          unanswered.set(requestId, cancel)
          pendingNativeQuestions.set(requestId, { answer: answers => {
            const nativeAnswers = Object.fromEntries(questions.map(question => {
              const answer = answers?.[question.id] ?? answers?.[question.question]
              return [question.id, { answers: typeof answer === 'string' ? [answer] : [] }]
            }))
            const sent = client.respond(request.id, { answers: nativeAnswers })
            if (sent) unanswered.delete(requestId)
            return sent
          } })
          yield { type: 'ask_user_question', requestId, questions }
        } else {
          // Unknown RPCs cannot be implicitly approved or left hanging forever.
          client.reject(request.id, `Arbrain no tiene un controlador para ${request.method}`)
          yield { type: 'native_update', update: { type: 'warning', message: `El motor solicitó ${request.method}; falta su controlador en Arbrain.` } }
        }
      }
    }
  } catch (error) {
    yield { type: 'error', ...(error instanceof RpcConnectionError && mutationPending ? { uncertain: true } : {}), message: error instanceof Error ? error.message : 'Se perdió la conexión con el motor. El trabajo puede seguir activo; no se reenvió.' }
  } finally {
    if (lock) activeNativeThreads.delete(lock)
    for (const cancel of unanswered.values()) cancel()
  }
}
