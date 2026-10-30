'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isNonDefaultAccount, type ChatAccount } from '../stores/account-store'

type Values = { currentModel: string | null; currentEffort: string | null; ultracode: boolean }
const empty: Values = { currentModel: null, currentEffort: null, ultracode: false }
/** View state belongs to one mounted conversation, not a browser-global store.
 * Request revisions prevent a late initial GET from overwriting a live event. */
export function useChatSettings({ owner, sessionId, account, pending = false }: { owner?: string; sessionId?: string | null; account?: ChatAccount | null; pending?: boolean }) {
  const scope = JSON.stringify([owner ?? null, account ?? 'default', sessionId ?? null])
  const identity = useMemo(() => ({ scope, revisions: { currentModel: 0, currentEffort: 0, ultracode: 0 } }), [scope])
  const active = useRef<typeof identity | null>(identity)
  // Only committed navigation can retire callbacks from the visible view.
  // An abandoned concurrent render must not change this ownership fence.
  useLayoutEffect(() => {
    active.current = identity
    return () => { if (active.current === identity) active.current = null }
  }, [identity])
  const [state, setState] = useState<{ identity: typeof identity; values: Values }>({ identity, values: empty })
  const values = state.identity === identity ? state.values : empty
  const update = useCallback(<K extends keyof Values>(key: K, value: Values[K]) => {
    if (active.current !== identity) return
    identity.revisions[key]++
    setState(previous => active.current !== identity ? previous : { identity, values: { ...(previous.identity === identity ? previous.values : empty), [key]: value } })
  }, [identity])
  const setCurrentModel = useCallback((value: string | null) => update('currentModel', value), [update])
  const setCurrentEffort = useCallback((value: string | null) => update('currentEffort', value), [update])
  const setUltracode = useCallback((value: boolean) => update('ultracode', value), [update])
  // Async navigation may call consumeStream from an older render. Bind once
  // to its explicit destination, never to that render's previous session.
  const bindStreamSettings = useCallback((target: { owner?: string; account?: string | null; sessionId?: string | null }, isCurrent: () => boolean) => {
    const targetScope = JSON.stringify([target.owner ?? null, target.account ?? 'default', target.sessionId ?? null])
    let bound: typeof identity | null = null
    const apply = <K extends keyof Values>(key: K, value: Values[K]) => {
      const current = active.current
      if (!isCurrent() || !current || current.scope !== targetScope || (bound && bound !== current)) return
      bound = current
      current.revisions[key]++
      setState(previous => active.current !== current || !isCurrent() ? previous : { identity: current, values: { ...(previous.identity === current ? previous.values : empty), [key]: value } })
    }
    return {
      setCurrentModel: (value: string | null) => apply('currentModel', value),
      setCurrentEffort: (value: string | null) => apply('currentEffort', value),
      setUltracode: (value: boolean) => apply('ultracode', value),
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const revisions = { ...identity.revisions }
    const params = new URLSearchParams()
    // A conversation that only exists on this device has no overrides yet: its
    // effective settings are the account defaults. Asking the host for its id
    // would only produce 404s until the cloud row exists.
    if (sessionId && !pending) params.set('session', sessionId)
    if (isNonDefaultAccount(account)) params.set('account', account)
    const qs = params.size ? `?${params}` : ''
    const apply = <K extends keyof Values>(key: K, value: Values[K]) => {
      if (!cancelled && active.current === identity && identity.revisions[key] === revisions[key]) update(key, value)
    }
    const read = async (path: string) => {
      const response = await fetch(`/api/chat/${path}${qs}`, { signal: controller.signal })
      return response.ok ? response.json() : null
    }
    void read('model').then(data => {
      if (data && Object.hasOwn(data, 'model') && (data.model === null || typeof data.model === 'string')) apply('currentModel', data.model)
    }).catch(() => {})
    void read('efforts').then(data => {
      if (!data) return
      if (Object.hasOwn(data, 'current') && (data.current === null || typeof data.current === 'string')) apply('currentEffort', data.current)
      if (typeof data.ultracode === 'boolean') apply('ultracode', data.ultracode)
    }).catch(() => {})
    return () => { cancelled = true; controller.abort() }
  }, [identity, account, sessionId, pending, update])
  return { ...values, setCurrentModel, setCurrentEffort, setUltracode, bindStreamSettings }
}
