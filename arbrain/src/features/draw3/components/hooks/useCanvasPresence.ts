/**
 * Presence en vivo del canvas (fase 5 del overhaul):
 *
 * 1. Cursores remotos multi-superficie: canal Supabase Realtime broadcast
 *    `draw3-presence-${pageId}`. Cada cliente emite su cursor (world coords)
 *    throttled; los demás lo renderizan via PresenceOverlay. Stale > 30s se
 *    poda. Llena el presence-store que existía vacío desde el diseño v3.
 *
 * 2. Agent activity flash: cuando el canal realtime de elementos mergea
 *    cambios remotos, los elementos afectados se resaltan ~2.5s con glow +
 *    badge "Levy" (el único otro escritor del canvas es el agente).
 */
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePresenceStore, type RemoteUser } from '../../stores/presence-store'
import type { CanvasElement, ElementId } from '../../elements/types'
import { capital, NOMBRE_DUENO } from '@/config'

const CURSOR_THROTTLE_MS = 80
const STALE_AFTER_MS = 30_000
const FLASH_DURATION_MS = 2_500

const PRESENCE_COLORS = ['#a78bfa', '#34d399', '#f59e0b', '#f472b6', '#38bdf8', '#fb7185']

function presenceColorFor(clientId: string): string {
  let h = 0
  for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) >>> 0
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length]
}

export interface AgentFlash {
  ids: Set<ElementId>
  at: number
}

export function useCanvasPresence({
  loaded,
  pageId,
  displayName,
}: {
  loaded: boolean
  pageId: string
  displayName?: string
}) {
  const upsert = usePresenceStore(s => s.upsert)
  const remove = usePresenceStore(s => s.remove)
  const clear = usePresenceStore(s => s.clear)
  const setSelf = usePresenceStore(s => s.setSelf)
  const clientIdRef = useRef<string>('')
  if (!clientIdRef.current) {
    clientIdRef.current = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  }
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const lastSentAtRef = useRef(0)

  useEffect(() => {
    if (!loaded) return
    const supabase = createClient()
    const clientId = clientIdRef.current
    setSelf(clientId)
    const channel = supabase
      .channel(`draw3-presence-${pageId}`)
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const p = payload as { clientId?: string; name?: string; x?: number; y?: number; gone?: boolean }
        if (!p?.clientId || p.clientId === clientId) return
        if (p.gone) {
          remove(p.clientId)
          return
        }
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return
        const user: RemoteUser = {
          clientId: p.clientId,
          user: { id: p.clientId, name: p.name || 'Alguien', color: presenceColorFor(p.clientId) },
          cursor: { x: p.x as number, y: p.y as number },
          selection: [],
          tool: 'select',
          editingId: null,
          lastSeen: Date.now(),
        }
        upsert(user)
      })
      .subscribe()
    channelRef.current = channel

    const prune = window.setInterval(() => {
      const now = Date.now()
      for (const [id, user] of usePresenceStore.getState().users) {
        if (now - user.lastSeen > STALE_AFTER_MS) remove(id)
      }
    }, 10_000)

    const goodbye = () => {
      void channel.send({ type: 'broadcast', event: 'cursor', payload: { clientId, gone: true } })
    }
    window.addEventListener('pagehide', goodbye)

    return () => {
      goodbye()
      window.removeEventListener('pagehide', goodbye)
      window.clearInterval(prune)
      channelRef.current = null
      clear()
      void supabase.removeChannel(channel)
    }
  }, [loaded, pageId, upsert, remove, clear, setSelf])

  const broadcastCursor = useCallback((world: { x: number; y: number } | null) => {
    const channel = channelRef.current
    if (!channel) return
    const now = Date.now()
    if (now - lastSentAtRef.current < CURSOR_THROTTLE_MS) return
    lastSentAtRef.current = now
    void channel.send({
      type: 'broadcast',
      event: 'cursor',
      payload: world
        ? { clientId: clientIdRef.current, name: displayName || capital(NOMBRE_DUENO()), x: world.x, y: world.y }
        : { clientId: clientIdRef.current, gone: true },
    })
  }, [displayName])

  return { broadcastCursor }
}

/**
 * Detecta que elementos cambiaron en un merge remoto (para el flash de
 * actividad del agente). Compara identidad/updatedAt contra el estado local
 * PREVIO al merge.
 */
function diffRemoteChanges(local: CanvasElement[], incoming: CanvasElement[]): ElementId[] {
  const localById = new Map(local.map(el => [el.id, el]))
  const changed: ElementId[] = []
  for (const el of incoming) {
    const prev = localById.get(el.id)
    if (!prev || (el.updatedAt ?? 0) > (prev.updatedAt ?? 0)) changed.push(el.id)
  }
  return changed
}

export function useAgentFlash() {
  const [flash, setFlash] = useState<AgentFlash | null>(null)
  const timerRef = useRef<number | null>(null)

  const triggerFlash = useCallback((ids: ElementId[]) => {
    if (ids.length === 0) return
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    setFlash({ ids: new Set(ids), at: Date.now() })
    timerRef.current = window.setTimeout(() => {
      setFlash(null)
      timerRef.current = null
    }, FLASH_DURATION_MS)
  }, [])

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  return { flash, triggerFlash }
}
