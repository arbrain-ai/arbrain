import { createServiceClient } from '@/lib/supabase/service'
import { CLAUDECLAW_TOKEN, getSchedulerUrl } from '@/lib/claudeclaw'
import { esOrganoReal } from '@/shared/constants/cron-taxonomy'
import { leerRendimiento, type CorridaRinde, type PropuestaRinde, type TareaRinde } from '@/features/rutinas/rinde'

// Taller › Rutinas · qué rinde (servidor) (5 oct 2026): las salas Acciones y Metabolismo de la vieja sección Artificial Brain en
// una sola lectura. Une el scheduler vivo (qué existe, su horario y lo último que reportó), 30 días de corridas con sus
// tokens (conversations.usage, instrumentado desde jul 2026) y las propuestas del órgano metabolismo con su firma.
// Solo lectura: el órgano propone, Daniel firma hablando con Levy, Levy ejecuta. Aquí no hay mutación.
// Las corridas se paginan: el tope de 1,000 filas de PostgREST cortaba en silencio los 30 días (antes `limit(2000)`).

const DIAS = 30

interface UsageRow { inputTokens?: number | null; outputTokens?: number | null }
interface RunRow { prompt: string | null; status: string; created_at: string; usage: UsageRow | null }

const tokensDe = (u: UsageRow | null) => !u || (u.inputTokens == null && u.outputTokens == null) ? null : (u.inputTokens ?? 0) + (u.outputTokens ?? 0)

async function tareas(): Promise<{ tareas: TareaRinde[]; error: string | null }> {
  try {
    const res = await fetch(`${await getSchedulerUrl()}/schedule`, { headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` }, signal: AbortSignal.timeout(6_000), cache: 'no-store' })
    if (!res.ok) return { tareas: [], error: `El scheduler respondió ${res.status}.` }
    const d = await res.json() as { tasks?: TareaRinde[] }
    return { tareas: (d.tasks ?? []).filter((t) => esOrganoReal(t.id)), error: null }
  } catch { return { tareas: [], error: 'El scheduler no respondió: solo se ven las rutinas que corrieron.' } }
}

/** La lectura completa de Taller › Rutinas · qué rinde (sin autenticar: la ruta la envuelve). */
export async function leerRendimientoVivo() {
  const db = createServiceClient()
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString()
  const pagina = (o: number) => db.from('conversations').select('prompt, status, created_at, usage').eq('source', 'cron')
    .gte('created_at', desde).order('created_at', { ascending: false }).range(o, o + 999)

  const [sched, props, metab] = await Promise.all([
    tareas(),
    db.from('metabolismo_propuestas').select('id, clave, tipo, neurona, titulo, propuesta, ahorro_estimado, riesgo, estado, created_at, updated_at').order('updated_at', { ascending: false }).limit(100),
    db.from('metabolismo_lecturas').select('fecha, lectura').order('fecha', { ascending: false }).limit(1),
  ])
  const filas: RunRow[] = []
  for (let o = 0; o < 20_000; o += 1000) {
    const p = await pagina(o)
    if (p.error) throw new Error('No se pudo leer la bitácora de rutinas.')
    filas.push(...((p.data ?? []) as RunRow[]))
    if (!p.data || p.data.length < 1000) break
  }
  const corridas: CorridaRinde[] = filas.filter((r) => r.prompt && esOrganoReal(r.prompt))
    .map((r) => ({ job: r.prompt!, status: r.status, at: r.created_at, tokens: tokensDe(r.usage) }))
  const propuestas = (props.data ?? []) as PropuestaRinde[]
  const rutinas = leerRendimiento(sched.tareas, corridas, propuestas)
  const medidas = corridas.filter((c) => c.tokens != null)

  return {
    generadoEn: new Date().toISOString(),
    dias: DIAS,
    schedulerError: sched.error,
    propuestasError: props.error ? 'No se pudieron leer las propuestas del órgano.' : null,
    totales: {
      corridas: corridas.length,
      errores: corridas.filter((c) => c.status === 'error' || c.status === 'failed').length,
      medidas: medidas.length,
      tokens: medidas.length ? medidas.reduce((s, c) => s + (c.tokens ?? 0), 0) : null,
      desde: corridas.at(-1)?.at ?? null,
    },
    rutinas,
    propuestas: propuestas.filter((p) => p.estado === 'propuesta'),
    firmadas: propuestas.filter((p) => p.estado !== 'propuesta').length,
    ultimaLectura: (metab.data?.[0] as { fecha: string; lectura: string } | undefined) ?? null,
  }
}
