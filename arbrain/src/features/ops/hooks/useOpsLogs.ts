'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cacheSnapshot, getCachedSnapshot } from '@/lib/local-first'

export type OpsEventType =
  | 'session_start'
  | 'session_compact'
  | 'tool_start'
  | 'tool_done'
  | 'tool_error'
  | 'agent_text'
  | 'agent_result'
  | 'agent_error'
  | 'cron_start'
  | 'cron_done'
  | 'cron_error'
  | 'stderr'
  | 'rate_limit'

export interface OpsEvent {
  id: string
  type: OpsEventType
  timestamp: number
  source: 'web' | 'cron' | 'system'
  sessionId?: string
  data: Record<string, unknown>
}

interface DbRow {
  id: string
  event_id: string
  type: string
  source: string
  session_id: string | null
  data: Record<string, unknown>
  created_at: string
}

function rowToEvent(row: DbRow): OpsEvent {
  return {
    id: row.event_id,
    type: row.type as OpsEventType,
    timestamp: new Date(row.created_at).getTime(),
    source: row.source as OpsEvent['source'],
    sessionId: row.session_id ?? undefined,
    data: row.data,
  }
}

const MAX_EVENTS = 200

export function useOpsLogs() {
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    const supabase = createClient()

    setError(null)

    // Stale-while-revalidate: pinta los eventos cacheados al instante mientras llega el query.
    getCachedSnapshot<OpsEvent[]>('ops:events')
      .then((cached) => { if (cached) setEvents((prev) => (prev.length ? prev : cached)) })
      .catch(() => {})

    supabase
      .from('ops_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_EVENTS)
      .then(async ({ data, error: err }) => {
        if (err) {
          const cached = await getCachedSnapshot<OpsEvent[]>('ops:events').catch(() => null)
          if (cached) {
            setEvents(cached)
            setError('Showing cached ops events')
          } else {
            setError(err.message)
          }
          return
        }
        if (data) {
          const next = (data as DbRow[]).map(rowToEvent)
          setEvents(next)
          cacheSnapshot('ops', 'ops:events', next).catch(() => {})
        }
      })

    const channel = supabase
      .channel('ops-events-feed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ops_events' },
        (payload) => {
          const row = payload.new as DbRow
          const event = rowToEvent(row)
          setEvents((prev) => {
            const next = [event, ...prev]
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
          })
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
        if (status === 'CHANNEL_ERROR') {
          setError('Realtime connection failed')
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    return load()
  }, [load])

  return { events, connected, error, reconnect: load }
}
