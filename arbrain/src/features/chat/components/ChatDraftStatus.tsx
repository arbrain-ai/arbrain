'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelQueuedChat, confirmQueuedChatSelection, isOnline, listSyncQueue, syncChatQueue, type SyncQueueItem } from '@/lib/local-first'
import { offlineEnvelope, type ChatIntent, type OfflineChatEnvelope } from '../lib/offline-envelope'
import { cachedSelection, refreshSelection, SELECTION_CHANGED } from '../lib/selection-cache'
import { CHAT_RECEIPT_GRACE_MS, shouldShowDraftRecovery } from '../lib/draft-visibility'
import { proximoReintento } from '../lib/reintento-envios'
type Draft = { item: SyncQueueItem; envelope: OfflineChatEnvelope }
const sameChoice = (a: ChatIntent, b: ChatIntent) => a.model === b.model && a.effort === b.effort && a.fast === b.fast && a.ultracode === b.ultracode
const describe = (choice: ChatIntent) => `${choice.model} · ${choice.effort ?? 'Sin esfuerzo configurable'}${choice.fast ? ' · Fast' : ''}${choice.ultracode ? ' · Ultracode' : ''}`
/** Drafts of the current scope. A draft whose selection was unknown at the tap
 * shows the settings it would adopt and waits for an explicit confirmation;
 * it is never dispatched on Daniel's behalf. Cancelling marks the local queue
 * atomically and, when the envelope could already have reached the host,
 * plants the durable cancellation there and reports the receipt honestly. */
export function ChatDraftStatus({ owner, account, conversationId, sendingTurnId, onAccepted }: { owner?: string; account: string; conversationId?: string | null; sendingTurnId?: string | null; onAccepted: (session: string, account: string) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [now, setNow] = useState(Date.now)
  const [choices, setChoices] = useState<Record<string, ChatIntent>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const seen = useRef(new Set<string>())
  const previewing = useRef(new Set<string>())
  const shownRef = useRef(choices)
  useEffect(() => { shownRef.current = choices }, [choices])
  useEffect(() => {
    let active = true
    const read = async () => {
      const rows = await listSyncQueue()
      if (!active) return
      const matching: Draft[] = []
      for (const item of rows) {
        if (item.entityType !== 'chat_prompt') continue
        try {
          const envelope = offlineEnvelope(JSON.parse(item.payloadJson).localContext?.chatEnvelope)
          if (envelope.expectedOwnerId !== owner || envelope.account !== account || envelope.chatSessionId !== conversationId || envelope.message.trimStart().startsWith('/')) continue
          if (item.status === 'synced' && seen.current.delete(item.id)) onAccepted(envelope.chatSessionId, envelope.account)
          if (['pending', 'failed'].includes(item.status)) { matching.push({ item, envelope }); seen.current.add(item.id) }
        } catch { /* Legacy unscoped data is handled in the general drafts view. */ }
      }
      setDrafts(matching)
      setNow(Date.now())
    }
    void read(); window.addEventListener('mission-control-local-first:changed', read)
    window.addEventListener('online', read); window.addEventListener('offline', read)
    return () => { active = false; window.removeEventListener('mission-control-local-first:changed', read); window.removeEventListener('online', read); window.removeEventListener('offline', read) }
  }, [owner, account, conversationId, onAccepted])
  useEffect(() => {
    const deadlines = drafts.filter(draft => draft.item.status === 'pending' && draft.envelope.intent)
      .map(draft => Date.parse(draft.item.createdAt) + CHAT_RECEIPT_GRACE_MS)
      .filter(deadline => Number.isFinite(deadline) && deadline > now)
    if (!deadlines.length) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(...deadlines) - Date.now()))
    return () => clearTimeout(timer)
  }, [drafts, now])
  const scopeFor = useCallback((envelope: OfflineChatEnvelope) => ({ localOwner: owner ?? '', account, conversationId: envelope.createConversation ? null : envelope.chatSessionId }), [owner, account])
  const preview = useCallback(async ({ item, envelope }: Draft, announce: boolean) => {
    if (!owner || previewing.current.has(item.id)) return
    previewing.current.add(item.id)
    if (announce) { setBusy(item.id); setError(null) }
    try {
      if (!isOnline()) throw new Error('Conéctate para consultar los ajustes. El mensaje sigue guardado.')
      // A new conversation has no overrides yet: its account defaults are the
      // settings it would adopt. The cloud row is only created on confirmation.
      const selected = await refreshSelection(scopeFor(envelope))
      shownRef.current = { ...shownRef.current, [item.id]: { ...selected, conversationId: envelope.chatSessionId, ...(envelope.effort ? { effort: envelope.effort } : {}) } }
      setChoices(shownRef.current)
    } catch (e) {
      // Sin llave ni sesión (22 oct 2026): el turno ya lo dice con su atajo a Ajustes › Llaves; aquí no se repite.
      if ((e as { code?: unknown } | null)?.code === 'falta_llave') return
      setError(e instanceof Error ? e.message : 'No se pudieron consultar los ajustes.')
    }
    finally { previewing.current.delete(item.id); if (announce) setBusy(null) }
  }, [owner, scopeFor])
  useEffect(() => {
    // Show, without dispatching, what an unconfirmed draft would adopt. When
    // the host confirms a change (this tab or another one), the shown
    // selection follows it; a confirmed envelope keeps its own intent.
    const revise = () => {
      // An invalidation keeps the last shown value until the host answers
      // again; confirmation re-checks the host before adopting it.
      let changed = false, moved = false
      const next = { ...shownRef.current }
      for (const draft of drafts) {
        if (draft.envelope.intent) continue
        const shown = shownRef.current[draft.item.id]
        const current = cachedSelection(scopeFor(draft.envelope))
        if (!current) continue
        const revised = { ...current, conversationId: draft.envelope.chatSessionId, ...(draft.envelope.effort ? { effort: draft.envelope.effort } : {}) }
        if (!shown) { next[draft.item.id] = revised; changed = true }
        else if (!sameChoice(shown, revised)) { next[draft.item.id] = revised; changed = true; moved = true }
      }
      if (changed) { shownRef.current = next; setChoices(next) }
      if (moved) setNotice('Los ajustes cambiaron desde otra pestaña o dispositivo. Revisa la selección actualizada antes de enviar.')
    }
    const consult = () => { revise(); for (const draft of drafts) if (!draft.envelope.intent && !cachedSelection(scopeFor(draft.envelope)) && isOnline()) void preview(draft, false) }
    consult()
    window.addEventListener(SELECTION_CHANGED, revise)
    window.addEventListener('online', consult)
    return () => { window.removeEventListener(SELECTION_CHANGED, revise); window.removeEventListener('online', consult) }
  }, [drafts, scopeFor, preview])
  const send = async ({ item, envelope }: Draft, shown: ChatIntent) => {
    if (!owner) return
    setBusy(item.id); setError(null); setNotice(null)
    try {
      if (!envelope.intent) {
        if (!isOnline()) throw new Error('Conéctate para confirmar el envío. El mensaje sigue guardado.')
        if (envelope.createConversation) {
          const response = await fetch('/api/chat/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: envelope.chatSessionId, expectedOwnerId: owner, account, title: envelope.message.slice(0, 55) }) })
          if (!response.ok) throw new Error('No se pudo confirmar la conversación.')
        }
        // What Daniel confirms is what he saw. The host is consulted once more
        // for this exact scope; a difference is shown and needs another tap.
        const scope = { localOwner: owner, account, conversationId: envelope.chatSessionId }
        const current = (envelope.createConversation ? undefined : cachedSelection(scope)) ?? await refreshSelection(scope)
        const intent = { ...current, ...(envelope.effort ? { effort: envelope.effort } : {}) }
        if (!sameChoice(intent, shown)) {
          shownRef.current = { ...shownRef.current, [item.id]: intent }; setChoices(shownRef.current)
          throw new Error('La conversación tiene otros ajustes de los mostrados. Revisa la selección actualizada y confirma de nuevo.')
        }
        const updated = await confirmQueuedChatSelection(item.id, owner, intent)
        if (updated.status === 'cancelled') return
      }
      await syncChatQueue(owner)
      const updated = (await listSyncQueue()).find(row => row.id === item.id)
      if (updated?.status === 'synced') onAccepted(envelope.chatSessionId, envelope.account)
      else if (updated?.lastError) setError(updated.lastError)
    } catch (e) { setError(e instanceof Error ? e.message : 'El envío sigue guardado.') }
    finally { setBusy(null) }
  }
  const cancel = async ({ item, envelope }: Draft) => {
    setBusy(item.id); setError(null); setNotice(null)
    try {
      const updated = await cancelQueuedChat(item.id)
      if (updated.status !== 'cancelled') { setError('El envío ya fue aceptado por el servidor. Detenlo desde la conversación.'); return }
      // Without a confirmed selection the envelope was rejected before any
      // network call: local cancellation is final. With one, an attempt may
      // have reached the host and lost its receipt; plant the durable
      // cancellation there so a late acceptance cannot start the turn.
      const mayHaveReachedHost = !!envelope.intent || envelope.version === 1
      if (!mayHaveReachedHost) { setNotice('Envío cancelado. Nunca salió de este dispositivo.'); return }
      if (!isOnline()) { setNotice('Envío cancelado en este dispositivo. Si ya había llegado al servidor, detén el turno desde la conversación al reconectar.'); return }
      try {
        const response = await fetch('/api/chat/interrupt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: envelope.chatSessionId, turnId: envelope.turnId, account }), signal: AbortSignal.timeout(10_000) })
        const receipt = await response.json().catch(() => null)
        if (response.status === 404 && envelope.createConversation) { setNotice('Envío cancelado. La conversación nunca llegó al servidor.'); return }
        if (!response.ok || receipt?.ok !== true || receipt.turnId !== envelope.turnId) throw new Error('unconfirmed')
        if (receipt.status === 'cancelled_before_acceptance') setNotice('Envío cancelado. El servidor no lo ejecutará.')
        else if (receipt.status === 'interrupted') setNotice('El envío ya había llegado; el turno se detuvo. Lo ejecutado se conserva en la conversación.')
        else if (receipt.status === 'completed' || receipt.status === 'failed') setNotice('El envío ya había terminado en el servidor. Recupera la conversación para ver su resultado.')
        else setNotice('Cancelado aquí. El servidor recibió la solicitud de detener; falta confirmar que terminó.')
      } catch {
        setNotice('Cancelado en este dispositivo. No se pudo confirmar con el servidor; si el turno aparece en la conversación, detenlo desde ahí.')
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cancelar el borrador.') }
    finally { setBusy(null) }
  }
  // Envíos confirmados que se reintentan solos (useChat): la tarjeta cuenta cuándo es el próximo intento.
  const autos = drafts.some(d => owner && proximoReintento(d.item, owner, sendingTurnId) !== null)
  useEffect(() => {
    if (!autos) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [autos])
  const recoverable = drafts.filter(({ item, envelope }) => shouldShowDraftRecovery({
    status: item.status, createdAt: item.createdAt, turnId: envelope.turnId, confirmed: !!envelope.intent,
  }, sendingTurnId, isOnline(), now))
  if (!recoverable.length && !notice && !error) return null
  return <section aria-label="Mensajes guardados" className="chat-prose px-3 py-2 text-sm">
    {recoverable.map(draft => {
      const choice = draft.envelope.intent ?? choices[draft.item.id]
      const confirmed = !!draft.envelope.intent
      const working = busy === draft.item.id
      const proximo = owner ? proximoReintento(draft.item, owner, sendingTurnId) : null
      const enSegundos = proximo === null ? null : Math.max(0, Math.ceil((proximo - now) / 1000))
      return <div key={draft.item.id} data-draft-status={draft.item.status} data-draft-confirmed={String(confirmed)} data-draft-auto={proximo !== null || undefined} className="my-2 rounded-xl border border-border-subtle bg-[var(--glass-bg)] p-3">
        <p className="font-medium">{proximo !== null ? 'Mensaje guardado · se envía solo' : draft.item.status === 'failed' ? 'Envío pendiente' : confirmed ? 'Mensaje guardado' : 'Mensaje guardado sin enviar'}</p>
        <p className="line-clamp-2 text-muted">{draft.envelope.message}</p>
        {draft.item.status === 'failed' && draft.item.lastError && <p className="mt-1 text-muted">{draft.item.lastError}</p>}
        {enSegundos !== null && <p className="mt-1 text-muted" data-draft-proximo>{enSegundos > 0 ? `Próximo intento en ${enSegundos} s.` : 'Intentando ahora…'} No hace falta que hagas nada.</p>}
        {choice
          ? <p className="mt-2" data-draft-choice>{confirmed ? 'Se enviará con ' : 'Se enviaría con '}{describe(choice)}</p>
          : <p className="mt-2 text-muted">{error ? 'No se pudieron consultar los ajustes. El mensaje sigue guardado.' : isOnline() ? 'Consultando los ajustes que adoptaría…' : 'Sus ajustes se consultan al reconectar.'}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {choice
            ? <button type="button" disabled={busy !== null} className="min-h-11 rounded-lg border border-border-subtle px-4 disabled:opacity-50" onClick={() => void send(draft, choice)}>{working ? 'Enviando…' : proximo !== null ? 'Intentar ahora' : confirmed ? 'Reintentar este envío' : 'Confirmar ajustes y enviar'}</button>
            : <button type="button" disabled={busy !== null} className="min-h-11 rounded-lg border border-border-subtle px-4 disabled:opacity-50" onClick={() => void preview(draft, true)}>{working ? 'Consultando…' : 'Revisar ajustes del envío'}</button>}
          <button type="button" disabled={busy !== null} className="min-h-11 rounded-lg border border-border-subtle px-4 text-muted disabled:opacity-50" onClick={() => void cancel(draft)}>Cancelar envío</button>
        </div>
      </div>
    })}
    {notice && <p role="status" className="py-2 text-muted">{notice}</p>}
    {error && <p role="alert" className="py-2 text-red-400">{error}</p>}
  </section>
}
