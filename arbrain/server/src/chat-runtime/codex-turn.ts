import type { Connection } from './codex-pool.js'
import { CodexTurnReducer, type RuntimeUpdate } from './codex-events.js'
import { RpcConnectionError, type RpcNotification, type RpcServerRequest } from './codex-rpc.js'

export type NativeTurnEvent =
  | { type: 'started'; threadId: string; turnId: string }
  | { type: 'update'; update: RuntimeUpdate }
  | { type: 'request'; request: RpcServerRequest }

/** Observe one explicit turn on an existing thread. The daemon, not the HTTP socket, owns this iterator.
 * A client timeout never restarts turn/start. Losing the transport requires native-state reconciliation.
 */
export async function* executeCodexTurn(client: Connection, options: {
  threadId: string
  input: unknown[]
  model?: string
  effort?: string
  serviceTier?: string
  signal?: AbortSignal
  maxBufferedEvents?: number
}): AsyncGenerator<NativeTurnEvent> {
  if (options.signal?.aborted) throw new Error('Turn interrupted before submission')
  let nativeTurnId: string | undefined
  let failure: Error | undefined
  let wake: (() => void) | undefined
  let interruptSent = false
  const events: Array<{ notification: RpcNotification } | { request: RpcServerRequest }> = []
  const push = (event: typeof events[number]) => {
    if (events.length >= (options.maxBufferedEvents ?? 10_000)) {
      failure = new RpcConnectionError('Turn observer capacity exceeded; native work may still be running')
    } else events.push(event)
    wake?.()
  }
  const offNotification = client.onNotification(notification => {
    if (notification.params.threadId === options.threadId) push({ notification })
  })
  const offRequest = client.onServerRequest(request => {
    if (request.params.threadId === options.threadId) push({ request })
  })
  const offDisconnect = client.onDisconnect(error => { failure = error; wake?.() })
  const interrupt = () => {
    if (!nativeTurnId || interruptSent) return
    interruptSent = true
    void client.request('turn/interrupt', { threadId: options.threadId, turnId: nativeTurnId }).catch(error => {
      failure = error instanceof Error ? error : new Error('Could not confirm interruption')
      wake?.()
    })
  }
  options.signal?.addEventListener('abort', interrupt, { once: true })
  try {
    const result = await client.request<{ turn: { id: string; status: string; items?: unknown[]; error?: unknown } }>('turn/start', {
      threadId: options.threadId, input: options.input,
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      // Astra defaults to no visible summary even while reasoning is enabled.
      // Request the provider's display summary on each turn, including warm resumes.
      summary: 'auto',
      // Native per-turn override: do not change the tier of later native work.
      ...(options.serviceTier ? { serviceTierForTurn: options.serviceTier } : {}),
    })
    if (!result.turn?.id) throw new RpcConnectionError('Turn started without a usable identity; reconcile native state')
    nativeTurnId = result.turn.id
    const reducer = new CodexTurnReducer(options.threadId, nativeTurnId)
    if (options.signal?.aborted) interrupt()
    yield { type: 'started', threadId: options.threadId, turnId: nativeTurnId }
    if (['completed', 'failed', 'interrupted'].includes(result.turn.status)) {
      push({ notification: { method: 'turn/completed', params: { threadId: options.threadId, turn: result.turn } } })
    }
    while (true) {
      while (events.length) {
        const event = events.shift()!
        if ('request' in event) {
          // MCP elicitation can be scoped to a thread without a turn ID.
          if (event.request.params.turnId == null || event.request.params.turnId === nativeTurnId) yield { type: 'request', request: event.request }
          else client.reject(event.request.id, 'La solicitud pertenece a otro turno')
          continue
        }
        for (const update of reducer.apply(event.notification)) {
          yield { type: 'update', update }
          if (update.type === 'terminal') return
        }
      }
      if (failure) throw failure
      await new Promise<void>(resolve => { wake = resolve })
      wake = undefined
    }
  } finally {
    offNotification(); offRequest(); offDisconnect()
    options.signal?.removeEventListener('abort', interrupt)
    // Unsubscribing is not cancellation. Never kill a shared process or another native turn.
  }
}
