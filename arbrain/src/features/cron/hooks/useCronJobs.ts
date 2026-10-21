'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cacheSnapshot, getCachedSnapshot } from '@/lib/local-first'

export interface CronJob {
  id: string
  chat_id: string
  thread_id: number | null
  prompt: string
  schedule: string
  next_run: number
  last_run: number | null
  last_result: string | null
  status: 'active' | 'paused'
  created_at: number
}

interface CronState {
  jobs: CronJob[]
  loading: boolean
  error: string | null
  offline: boolean
  offlineReason: string | null
  configuredUrl: string | null
  upstreamStatus: number | null
  detail: string | null
  tz: string | null
}

interface CronResponse {
  tasks?: CronJob[]
  offline?: boolean
  offlineReason?: string
  configuredUrl?: string
  upstreamStatus?: number
  detail?: string
  error?: string
  // TZ en la que el daemon interpreta las expresiones cron (CRON_TZ del scheduler).
  tz?: string
}

export function useCronJobs() {
  const [state, setState] = useState<CronState>({
    jobs: [],
    loading: true,
    error: null,
    offline: false,
    offlineReason: null,
    configuredUrl: null,
    upstreamStatus: null,
    detail: null,
    tz: null,
  })

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/cron')
      const data = await res.json() as CronResponse
      if (res.ok) cacheSnapshot('ops', 'cron:jobs', data).catch(() => {})
      setState({
        jobs: data.tasks ?? [],
        loading: false,
        error: res.ok ? null : (data.error ?? `HTTP ${res.status}`),
        offline: !!data.offline,
        offlineReason: data.offlineReason ?? null,
        configuredUrl: data.configuredUrl ?? null,
        upstreamStatus: data.upstreamStatus ?? null,
        detail: data.detail ?? null,
        tz: data.tz ?? null,
      })
    } catch (err) {
      const cached = await getCachedSnapshot<CronResponse>('cron:jobs').catch(() => null)
      if (cached) {
        setState({
          jobs: cached.tasks ?? [],
          loading: false,
          error: null,
          offline: !!cached.offline,
          offlineReason: cached.offlineReason ?? null,
          configuredUrl: cached.configuredUrl ?? null,
          upstreamStatus: cached.upstreamStatus ?? null,
          detail: cached.detail ?? null,
          tz: cached.tz ?? null,
        })
        return
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: String(err),
        offline: false,
      }))
    }
  }, [])

  useEffect(() => {
    let active = true
    // Stale-while-revalidate: pinta los jobs cacheados al instante, refresca en background.
    getCachedSnapshot<CronResponse>('cron:jobs')
      .then((cached) => {
        if (active && cached) {
          setState((prev) => ({
            ...prev,
            jobs: cached.tasks ?? [],
            loading: false,
            offline: !!cached.offline,
            offlineReason: cached.offlineReason ?? null,
            configuredUrl: cached.configuredUrl ?? null,
            upstreamStatus: cached.upstreamStatus ?? null,
            detail: cached.detail ?? null,
            tz: cached.tz ?? null,
          }))
        }
      })
      .catch(() => {})
      .finally(() => { if (active) fetchJobs() })
    return () => { active = false }
  }, [fetchJobs])

  const runAction = useCallback(
    async (id: string, action: 'run' | 'pause' | 'resume') => {
      const res = await fetch(`/api/cron/${id}/${action}`, { method: 'POST' })
      const data = await res.json().catch(() => null) as CronResponse | null
      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          error: data?.error ?? `HTTP ${res.status}`,
          offline: !!data?.offline,
          offlineReason: data?.offlineReason ?? null,
          configuredUrl: data?.configuredUrl ?? null,
          upstreamStatus: data?.upstreamStatus ?? null,
          detail: data?.detail ?? null,
        }))
        return
      }
      // Optimistic update for pause/resume
      if (action === 'pause' || action === 'resume') {
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.id === id ? { ...j, status: action === 'pause' ? 'paused' : 'active' } : j,
          ),
        }))
      }
      // Refetch after a short delay to get updated state
      setTimeout(fetchJobs, 1000)
    },
    [fetchJobs],
  )

  return { ...state, refetch: fetchJobs, runAction }
}

// ---------------------------------------------------------------------------
// Cron execution history from Supabase (conversations with source='cron')
// ---------------------------------------------------------------------------

export interface CronRun {
  id: string
  run_id: string
  job_id: string // prompt field = job ID
  response: string | null
  error: string | null
  status: 'done' | 'error' | 'pending'
  created_at: string
}

export function useCronHistory() {
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select('id, run_id, prompt, response, error, status, created_at')
      .eq('source', 'cron')
      .order('created_at', { ascending: false })
      .limit(100)

    if (data) {
      const nextRuns = data.map((row) => ({
          id: row.id,
          run_id: row.run_id,
          job_id: row.prompt,
          response: row.response,
          error: row.error,
          status: row.status as CronRun['status'],
          created_at: row.created_at,
        }))
      setRuns(nextRuns)
      cacheSnapshot('ops', 'cron:history', nextRuns).catch(() => {})
    } else {
      const cached = await getCachedSnapshot<CronRun[]>('cron:history').catch(() => null)
      if (cached) setRuns(cached)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    let active = true
    getCachedSnapshot<CronRun[]>('cron:history')
      .then((cached) => { if (active && cached) { setRuns(cached); setLoading(false) } })
      .catch(() => {})
      .finally(() => { if (active) fetchHistory() })
    return () => { active = false }
  }, [fetchHistory])

  // Group runs by job_id for easy lookup
  const historyByJob = useMemo(() => {
    const map: Record<string, CronRun[]> = {}
    for (const run of runs) {
      if (!map[run.job_id]) map[run.job_id] = []
      map[run.job_id].push(run)
    }
    return map
  }, [runs])

  return { runs, historyByJob, loading, refetch: fetchHistory }
}

// Runs historicos dentro de un rango de fechas, filtrados por jobs visibles.
// Usado por el Cron Lens del calendario. Consulta Supabase directo (funciona
// en Vercel aunque ClaudeClaw este offline). jobIds vacio => no consulta.
// Stale-while-revalidate: hidrata del snapshot local al instante (los eventos
// no "desaparecen" en reload/cambio de vista) y refresca en background.
export function useCronRunsRange(from: string, to: string, jobIds: string[]) {
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(false)
  const jobIdsKey = useMemo(() => [...jobIds].sort().join(','), [jobIds])

  useEffect(() => {
    let active = true
    getCachedSnapshot<CronRun[]>('cron:runs-range')
      .then((cached) => {
        if (active && cached?.length) setRuns((prev) => (prev.length > 0 ? prev : cached))
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const fetchRuns = useCallback(async () => {
    if (!jobIdsKey) {
      // Conservar identidad si ya esta vacio: cada cambio de rango re-crea fetchRuns
      // y un [] nuevo aqui propagaba re-renders al calendario con el lente cerrado.
      setRuns((prev) => (prev.length === 0 ? prev : []))
      return
    }
    setLoading(true)
    // Via API server-side (service client): el browser de Supabase no tiene
    // sesion en la app de escritorio y RLS bloqueaba conversations.
    try {
      const params = new URLSearchParams({ jobIds: jobIdsKey, from, to })
      const res = await fetch(`/api/cron/runs?${params.toString()}`)
      if (res.ok) {
        const { runs: next } = (await res.json()) as { runs: CronRun[] }
        setRuns(next ?? [])
        cacheSnapshot('ops', 'cron:runs-range', next ?? []).catch(() => {})
      }
    } catch { /* offline: conservar cache */ }
    setLoading(false)
  }, [from, to, jobIdsKey])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  return { runs, loading, refetch: fetchRuns }
}

// Historial COMPLETO de un job (sin acotar al rango visible del calendario):
// alimenta el panel "ver historial por fecha" del Cron Lens. jobId null =>
// no consulta. Cap defensivo de 300 runs (mas que suficiente para cualquier
// cadencia real; jobs cada 15 min llevarian ~3 dias de historial).
export function useCronRunsForJob(jobId: string | null, limit = 300) {
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(false)

  const fetchRuns = useCallback(async () => {
    if (!jobId) {
      setRuns((prev) => (prev.length === 0 ? prev : []))
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ jobId, limit: String(limit) })
      const res = await fetch(`/api/cron/runs?${params.toString()}`)
      if (res.ok) {
        const { runs: next } = (await res.json()) as { runs: CronRun[] }
        setRuns(next ?? [])
      }
    } catch { /* offline */ }
    setLoading(false)
  }, [jobId, limit])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  return { runs, loading, refetch: fetchRuns }
}
