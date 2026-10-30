import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole } from '@/lib/auth-utils'
import {
  anatomiaDeCron,
  funcionDeCron,
  superficieDeCron,
  esSensor,
  esOrganoReal,
  type CronAnatomia,
} from '@/shared/constants/cron-taxonomy'

// Sala "Acciones" del Artificial Brain — agregador server-side.
// Une TRES fuentes en una respuesta: los órganos (jobs del daemon claudeclaw),
// su actividad (conversations source='cron') y su costo (conversations.usage,
// escrito por la instrumentación de claudeclaw executeCronJob desde jul 2026).
// Data del owner → SIEMPRE service client auth-gated (lección RLS desktop).

const CLAUDECLAW_URL = process.env.CLAUDECLAW_URL ?? 'http://localhost:3099'
const CLAUDECLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? ''

interface DaemonTask {
  id: string
  schedule: string
  next_run: number
  last_run: number | null
  last_result: string | null
  status: 'active' | 'paused'
}

interface RunUsage {
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  numTurns: number
  model?: string
}

interface RunRow {
  run_id: string
  prompt: string
  response: string | null
  error: string | null
  status: string
  created_at: string
  usage: RunUsage | null
}

async function authorized(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const role = await getUserRole(user.id)
  return role === 'owner' || role === 'admin'
}

/** Offset (ms) de la TZ respecto a UTC en un instante dado. Independiente de
 *  la TZ del server (Vercel=UTC, desktop=la del Mac) — no usar new Date(string). */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    p.hour === '24' ? 0 : Number(p.hour), Number(p.minute), Number(p.second),
  )
  return asUtc - at.getTime()
}

/** Medianoche de hoy en la TZ del daemon, como Date UTC. */
function startOfDayInTz(tz: string): Date {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const [y, m, d] = fmt.format(now).split('-').map(Number)
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0)
  return new Date(utcGuess - tzOffsetMs(tz, new Date(utcGuess)))
}

/** Output destilado: texto plano compacto, sin ruido markdown. */
function destilar(text: string | null, max = 260): string | null {
  if (!text) return null
  const plain = text
    .replace(/```[\s\S]*?```/g, ' [código] ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>|]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return null
  return plain.length > max ? plain.slice(0, max - 1).trimEnd() + '…' : plain
}

async function fetchDaemonTasks(): Promise<{ tasks: DaemonTask[]; tz: string; offline: boolean }> {
  const fallback = { tasks: [] as DaemonTask[], tz: 'America/Mexico_City', offline: true }
  if (!CLAUDECLAW_TOKEN) return fallback
  try {
    const res = await fetch(`${CLAUDECLAW_URL}/schedule`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return fallback
    const data = await res.json() as { tasks?: DaemonTask[]; tz?: string }
    return { tasks: data.tasks ?? [], tz: data.tz ?? fallback.tz, offline: false }
  } catch {
    return fallback
  }
}

export async function GET(request: Request) {
  if (!(await authorized())) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const url = new URL(request.url)
  const range = url.searchParams.get('range') === '7d' ? '7d' : 'today'

  const { tasks, tz, offline } = await fetchDaemonTasks()

  const startOfDay = startOfDayInTz(tz)
  const from = range === 'today'
    ? startOfDay
    : new Date(startOfDay.getTime() - 6 * 86_400_000)

  const service = createServiceClient()
  const { data: runRows, error: runsError } = await service
    .from('conversations')
    .select('run_id, prompt, response, error, status, created_at, usage')
    .eq('source', 'cron')
    .gte('created_at', from.toISOString())
    .order('created_at', { ascending: false })
    .limit(800)

  if (runsError) {
    return new Response(JSON.stringify({ error: runsError.message }), { status: 500 })
  }

  const runs = (runRows ?? []) as RunRow[]

  // ── Agrupar corridas por órgano ──────────────────────────────────────────
  interface OrganRun {
    runId: string
    at: string
    status: string
    error: string | null
    snippet: string | null
    costUsd: number | null
    durationMs: number | null
    model: string | null
  }
  const runsByJob = new Map<string, OrganRun[]>()
  for (const r of runs) {
    const jobId = r.prompt
    if (!jobId || !esOrganoReal(jobId)) continue
    const list = runsByJob.get(jobId) ?? []
    list.push({
      runId: r.run_id,
      at: r.created_at,
      status: r.status,
      error: r.error,
      snippet: r.error ? destilar(r.error) : destilar(r.response),
      costUsd: r.usage?.costUsd ?? null,
      durationMs: r.usage?.durationMs ?? null,
      model: r.usage?.model ?? null,
    })
    runsByJob.set(jobId, list)
  }

  // ── Órganos: unión de jobs del daemon + jobs con corridas en el rango ────
  const organIds = new Set<string>()
  for (const t of tasks) if (esOrganoReal(t.id)) organIds.add(t.id)
  for (const id of runsByJob.keys()) organIds.add(id)

  const taskById = new Map(tasks.map((t) => [t.id, t]))

  const organs = [...organIds].map((id) => {
    const task = taskById.get(id)
    const organRuns = runsByJob.get(id) ?? []
    const errors = organRuns.filter((r) => r.status === 'error').length
    const measured = organRuns.filter((r) => r.costUsd != null)
    const costUsd = measured.length > 0
      ? measured.reduce((s, r) => s + (r.costUsd ?? 0), 0)
      : null
    return {
      id,
      anatomia: anatomiaDeCron(id),
      funcion: funcionDeCron(id),
      superficie: superficieDeCron(id),
      sensor: esSensor(id),
      schedule: task?.schedule ?? null,
      status: task?.status ?? (organRuns.length > 0 ? 'active' : 'unknown'),
      nextRun: task?.next_run ?? null,
      lastRun: task?.last_run ?? null,
      stats: {
        runs: organRuns.length,
        errors,
        costUsd,
        runsWithCost: measured.length,
      },
      recentRuns: organRuns.slice(0, 8),
    }
  })

  // Orden dentro de sala: los que corrieron primero, luego por próxima corrida
  organs.sort((a, b) => (b.stats.runs - a.stats.runs) || ((a.nextRun ?? Infinity) - (b.nextRun ?? Infinity)))

  // ── Totales para la "lectura del día" ────────────────────────────────────
  const ranOrgans = organs.filter((o) => o.stats.runs > 0)
  const allRuns = runs.filter((r) => r.prompt && esOrganoReal(r.prompt))
  const runsWithCost = allRuns.filter((r) => r.usage?.costUsd != null)
  const totals = {
    organsTotal: organs.filter((o) => o.status === 'active').length,
    organsRan: ranOrgans.length,
    runs: allRuns.length,
    errors: allRuns.filter((r) => r.status === 'error').length,
    costUsd: runsWithCost.reduce((s, r) => s + (r.usage?.costUsd ?? 0), 0),
    runsWithCost: runsWithCost.length,
  }

  // Costo agregado por sala anatómica
  const costPorAnatomia: Partial<Record<CronAnatomia, { costUsd: number; runsWithCost: number; runs: number }>> = {}
  for (const o of organs) {
    const bucket = costPorAnatomia[o.anatomia] ?? { costUsd: 0, runsWithCost: 0, runs: 0 }
    bucket.costUsd += o.stats.costUsd ?? 0
    bucket.runsWithCost += o.stats.runsWithCost
    bucket.runs += o.stats.runs
    costPorAnatomia[o.anatomia] = bucket
  }

  return Response.json({
    ok: true,
    range,
    tz,
    daemonOffline: offline,
    from: from.toISOString(),
    generatedAt: new Date().toISOString(),
    organs,
    totals,
    costPorAnatomia,
  })
}
