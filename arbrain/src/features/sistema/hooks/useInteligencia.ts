'use client'

// Sección "Inteligencia" de /sistema: SOLO los runs de crons SENSOR (los que
// le hablan a Daniel — morning-briefing, business-council, monthly-review...)
// de los últimos ~30 días. Lee por /api/sistema/inteligencia (server-side):
// el cliente browser no tiene sesión en la desktop (Tauri) y RLS devuelve
// vacío. Realtime queda como mejora progresiva (solo web).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CronRun } from '../types'

export function useInteligencia() {
  const supabase = useMemo(() => createClient(), [])
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sistema/inteligencia', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as {
        runs: { id: string; run_id: string; prompt: string | null; response: string | null; error: string | null; status: string; created_at: string }[]
      }
      setRuns(data.runs.map((r) => ({
        id: r.id,
        run_id: r.run_id,
        jobId: r.prompt ?? 'cron',
        response: r.response,
        error: r.error,
        status: r.status,
        created_at: r.created_at,
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // refetch on focus: cubre desktop (sin realtime) y web tras estar en background
  useEffect(() => {
    const onFocus = () => { void load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(() => {
      if (!active) return
      const ch = supabase
        .channel('sistema-inteligencia-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => { void load() })
        .subscribe()
      return () => { void supabase.removeChannel(ch) }
    })
    return () => { active = false }
  }, [supabase, load])

  return { runs, loading }
}
