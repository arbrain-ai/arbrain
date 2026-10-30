/** Separate caller intent from server-derived history. Rebuilding a cron hint
 * after a lost ACK must neither invalidate acceptance nor hide changed intent. */
export function durableSubmissionError(request: Record<string, unknown>): string | null {
  if (request.acceptOnly !== true && request.intent === undefined) return null
  const stable = (value: unknown) => typeof value === 'string' && value.length > 0 && value.trim() === value
  if (!stable(request.ownerId) || !stable(request.chatSessionId) || !stable(request.turnId)
    || typeof request.message !== 'string' || !request.message.trim() || request.message.trimStart().startsWith('/')) {
    return 'Durable acceptance requires a scoped conversation prompt and a nonempty stable turn ID.'
  }
  return null
}

export function freezeChatContext(request: Record<string, unknown>, previous?: { context?: string | null }) {
  return {
    clientContext: typeof request.clientContext === 'string' ? request.clientContext : null,
    context: previous ? previous.context : typeof request.context === 'string' ? request.context : null,
  }
}

/** Resolve outside SQLite, then re-read and accept synchronously. Concurrent
 * ACK retries share derived settings but still compare their caller intent. */
export async function acceptResolvedChat<T extends { context?: string | null; overrides: unknown; codexSelection?: unknown; claudeSelection?: unknown }, R>(
  input: T, previous: () => T | undefined,
  resolve: () => Promise<T['codexSelection'] | T['claudeSelection']>, accept: (input: T) => R,
  selectionKey: 'codexSelection' | 'claudeSelection' = 'codexSelection',
): Promise<R> {
  if (!previous()) {
    try { input = { ...input, [selectionKey]: await resolve() } }
    catch (error) { if (!previous()) throw error }
  }
  const accepted = previous()
  if (accepted) input = { ...input, context: accepted.context, overrides: accepted.overrides, codexSelection: accepted.codexSelection, claudeSelection: accepted.claudeSelection }
  return accept(input)
}
