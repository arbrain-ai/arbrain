/** Saving before dispatch is normal. Recovery controls belong to interrupted
 * sends, not the optimistic message's first frame. A background send gets time
 * to receive its durable receipt before being offered for retry.
 */
export const CHAT_RECEIPT_GRACE_MS = 15_000

export function shouldShowDraftRecovery(draft: {
  status: string; createdAt: string; turnId: string; confirmed: boolean
}, sendingTurnId: string | null | undefined, online: boolean, now = Date.now()): boolean {
  if (draft.status !== 'pending') return true
  if (!online) return true
  if (draft.turnId === sendingTurnId) return false
  if (!draft.confirmed) return true
  const createdAt = Date.parse(draft.createdAt)
  return !Number.isFinite(createdAt) || now - createdAt >= CHAT_RECEIPT_GRACE_MS
}
