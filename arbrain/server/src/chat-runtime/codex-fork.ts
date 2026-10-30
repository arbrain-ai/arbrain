import type { CodexRpcClient } from './codex-rpc.js'

export interface NativeEdit { originalText: string; occurrenceFromEnd: number; nativeTurnId?: string }
export interface NativeBranch { parentThreadId: string; beforeTurnId: string; threadId: string }
type HistoryTurn = { id: string; items: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> }

/** Legacy messages may include the proxy's context prefix. Match the whole
 * user input, never an assistant/tool result or a substring of another prompt.
 */
function matches(text: string, original: string): boolean {
  return text === original || (text.startsWith('[Context: ') && text.endsWith(`]\n\n${original}`))
}

/** Locate the edited user turn with bounded pages, newest first. No mutation
 * occurs until the exact occurrence is present in authoritative native history.
 */
export async function locateNativeEdit(client: Pick<CodexRpcClient, 'request'>, threadId: string, edit: NativeEdit, signal?: AbortSignal): Promise<string> {
  if (!edit.originalText.trim() || !Number.isSafeInteger(edit.occurrenceFromEnd) || edit.occurrenceFromEnd < 1) throw new Error('Punto de edición inválido.')
  let cursor: string | undefined, remaining = edit.occurrenceFromEnd
  const seen = new Set<string>()
  for (let page = 0; page < 1000; page++) {
    if (signal?.aborted) throw new Error('Edición cancelada antes de crear la rama.')
    const history = await client.request<{ data: HistoryTurn[]; nextCursor?: string | null }>('thread/turns/list', { threadId, itemsView: 'full', sortDirection: 'desc', limit: 50, ...(cursor ? { cursor } : {}) })
    if (!Array.isArray(history.data)) throw new Error('El motor no devolvió el historial necesario para editar.')
    for (const turn of history.data) {
      if (!Array.isArray(turn.items)) throw new Error('Historial incompleto; no se editará con contexto incierto.')
      const user = turn.items.filter(item => item.type === 'userMessage')
      const textMatches = user.some(item => matches((item.content ?? []).filter(part => part.type === 'text').map(part => part.text ?? '').join(''), edit.originalText))
      if (edit.nativeTurnId) {
        if (turn.id !== edit.nativeTurnId) continue
        if (!textMatches) throw new Error('El contenido del turno original no coincide con la edición.')
        return turn.id
      }
      if (textMatches && --remaining === 0) return turn.id
    }
    if (!history.nextCursor) break
    if (seen.has(history.nextCursor)) throw new Error('El cursor del historial no avanzó; edición detenida.')
    seen.add(history.nextCursor); cursor = history.nextCursor
  }
  throw new Error('No se encontró el mensaje original en la historia nativa; no se envió la edición.')
}

export async function forkNativeEdit(client: Pick<CodexRpcClient, 'request'>, parentThreadId: string, edit: NativeEdit, params: Record<string, unknown>, signal?: AbortSignal, onForkDispatch?: () => void): Promise<{ branch: NativeBranch; model: string }> {
  const parent = await client.request<{ thread: { id: string; status?: { type: string } } }>('thread/read', { threadId: parentThreadId, includeTurns: false })
  if (parent.thread?.id !== parentThreadId) throw new Error('El motor no confirmó la conversación original.')
  if (parent.thread.status?.type === 'active') throw new Error('Espera a que termine el turno activo antes de editar su historia.')
  const beforeTurnId = await locateNativeEdit(client, parentThreadId, edit, signal)
  if (signal?.aborted) throw new Error('Edición cancelada antes de crear la rama.')
  onForkDispatch?.()
  const fork = await client.request<{ thread: { id: string }; model: string }>('thread/fork', { ...params, threadId: parentThreadId, beforeTurnId, deferGoalContinuation: true })
  if (!fork.thread?.id || fork.thread.id === parentThreadId) throw new Error('El motor no confirmó una rama independiente.')
  return { branch: { parentThreadId, beforeTurnId, threadId: fork.thread.id }, model: fork.model }
}

/** Bifurcar una conversación Codex completa (1 oct 2026, menú «⋯ → Bifurcar»): la rama conserva TODA la historia
 * y la original no se toca. Rechaza una conversación con turno activo: la rama no sería una foto coherente.
 */
export async function forkNativeThread(client: Pick<CodexRpcClient, 'request'>, parentThreadId: string, params: Record<string, unknown>): Promise<string> {
  const parent = await client.request<{ thread: { id: string; status?: { type: string } } }>('thread/read', { threadId: parentThreadId, includeTurns: false })
  if (parent.thread?.id !== parentThreadId) throw new Error('El motor no confirmó la conversación original.')
  if (parent.thread.status?.type === 'active') throw new Error('Espera a que termine el turno activo antes de bifurcar.')
  const fork = await client.request<{ thread: { id: string } }>('thread/fork', { ...params, threadId: parentThreadId, deferGoalContinuation: true })
  if (!fork.thread?.id || fork.thread.id === parentThreadId) throw new Error('El motor no confirmó una rama independiente.')
  return fork.thread.id
}
