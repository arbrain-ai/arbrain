import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole } from '@/lib/auth-utils'
import { anatomiaDeCron, esOrganoReal, type CronAnatomia } from '@/shared/constants/cron-taxonomy'

// Sala "Metabolismo" del Artificial Brain — agregador server-side.
// Contesta: ¿qué CUOTA me come y qué me rinde? ¿qué se está muriendo?
//
// ── TOKENS, NO DÓLARES (15 jul 2026) ────────────────────────────────────────
// Con suscripción de Claude Code (tarifa plana; verificado: `Claude Code-credentials`
// en el keychain, sin ANTHROPIC_API_KEY) el `costUsd` que emite el SDK es el precio
// NOCIONAL de la API: dinero que NO sale de la cuenta. Esta sala llegó a mostrar ese
// costo como fracción de los ingresos: una cifra inventada dividida por una real. Peor que no medir, porque hace decidir con ficción.
//
// Bajo Max lo ESCASO es la CUOTA de rate limit (ventanas de 5h + tope semanal),
// y eso se mide en TOKENS. Un cron "barato" en dólares puede comerse la ventana.
// Por eso: tokens = la moneda, y la SALUD (tasa de error) sube a primera clase —
// un órgano que falla quema cuota sin producir nada.
//
// El dólar NO se muestra ni se calcula. Si algún día vuelve el pago por API, se
// revive; mientras tanto una cifra falsa es peor que ninguna.
//
// Une TRES fuentes: la lectura metabólica + libro de rentas (escritos cada noche
// por el órgano `metabolismo`, puente local→Supabase), las propuestas con su
// estado de firma, y la tasa VIVA (conversations.usage, instrumentado jul 2026).
// Data del owner → service client auth-gated (lección RLS desktop).
// El órgano/la sala JAMÁS ejecutan podas: propone el órgano, firma Daniel
// hablando con Levy, ejecuta Levy.

interface RunUsage {
  costUsd?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
}
interface RunRow {
  prompt: string
  status: string
  created_at: string
  usage: RunUsage | null
}

interface LecturaRow {
  fecha: string
  lectura: string
  tasa: unknown
  libro: unknown
  muriendo: unknown
  created_at: string
}

export interface PropuestaRow {
  id: string
  clave: string
  tipo: string
  clase: string
  neurona: string
  titulo: string
  propuesta: string
  evidencia: unknown
  ahorro_estimado: string | null
  riesgo: string | null
  estado: 'propuesta' | 'firmada' | 'rechazada' | 'ejecutada'
  decision_nota: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

async function authorized(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const role = await getUserRole(user.id)
  return role === 'owner' || role === 'admin'
}

/** Tokens de una corrida: input + output. null si no hay instrumentación. */
function tokensDe(u: RunUsage | null): number | null {
  if (!u) return null
  const i = u.inputTokens
  const o = u.outputTokens
  if (i == null && o == null) return null
  return (i ?? 0) + (o ?? 0)
}

export async function GET() {
  if (!(await authorized())) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const service = createServiceClient()
  const from30 = new Date(Date.now() - 30 * 86_400_000)

  const [lecturasRes, propuestasRes, runsRes] = await Promise.all([
    service
      .from('metabolismo_lecturas')
      .select('fecha, lectura, tasa, libro, muriendo, created_at')
      .order('fecha', { ascending: false })
      .limit(2),
    service
      .from('metabolismo_propuestas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    service
      .from('conversations')
      .select('prompt, status, created_at, usage')
      .eq('source', 'cron')
      .gte('created_at', from30.toISOString())
      .order('created_at', { ascending: false })
      .limit(2000),
  ])

  const firstError = lecturasRes.error ?? propuestasRes.error ?? runsRes.error
  if (firstError) {
    return new Response(JSON.stringify({ error: firstError.message }), { status: 500 })
  }

  const lecturas = (lecturasRes.data ?? []) as LecturaRow[]
  const propuestas = (propuestasRes.data ?? []) as PropuestaRow[]
  const runs = ((runsRes.data ?? []) as RunRow[]).filter((r) => r.prompt && esOrganoReal(r.prompt))

  // ── Tasa metabólica VIVA, en TOKENS (solo corridas MEDIDAS — usage existe
  //    desde 6 jul 2026; lo anterior es "sin dato" honesto, no 0) ────────────
  const medidos = runs.filter((r) => tokensDe(r.usage) != null)
  const hoyUtc = new Date().toISOString().slice(0, 10)
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const serie14d = Array.from({ length: 14 }, (_, i) => {
    const fecha = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10)
    return { fecha, tokens: 0, runs: 0, errores: 0 }
  })
  const serieByFecha = new Map(serie14d.map((d) => [d.fecha, d]))

  const porAnatomia: Partial<Record<CronAnatomia, { tokens: number; runs: number; errores: number }>> = {}
  let tok7d = 0
  let tok30d = 0
  let runs7d = 0
  let primeraMedicion: string | null = null

  for (const r of medidos) {
    const tok = tokensDe(r.usage) ?? 0
    tok30d += tok
    if (r.created_at >= hace7) { tok7d += tok; runs7d++ }
    const fecha = r.created_at.slice(0, 10)
    const bucket = serieByFecha.get(fecha)
    if (bucket) { bucket.tokens += tok; bucket.runs++ }
    const anatomia = anatomiaDeCron(r.prompt)
    const a = porAnatomia[anatomia] ?? { tokens: 0, runs: 0, errores: 0 }
    a.tokens += tok
    a.runs++
    porAnatomia[anatomia] = a
    if (!primeraMedicion || r.created_at < primeraMedicion) primeraMedicion = r.created_at
  }

  // Los errores se cuentan sobre TODAS las corridas, no solo las medidas: una
  // corrida que revienta puede no registrar usage, y es justo la que interesa.
  for (const r of runs) {
    if (r.status !== 'error') continue
    const bucket = serieByFecha.get(r.created_at.slice(0, 10))
    if (bucket) bucket.errores++
    const anatomia = anatomiaDeCron(r.prompt)
    const a = porAnatomia[anatomia] ?? { tokens: 0, runs: 0, errores: 0 }
    a.errores++
    porAnatomia[anatomia] = a
  }

  // Proyección honesta: promedio diario SOLO de los días desde la primera
  // medición (no diluir con días sin instrumentación) — y NO proyectar con
  // menos de 3 días medidos: una proyección de día 1 es ruido vestido de dato.
  const diasMedidos = primeraMedicion
    ? Math.max(1, Math.ceil((Date.now() - new Date(primeraMedicion).getTime()) / 86_400_000))
    : 0
  const promedioDiario = diasMedidos > 0 ? tok30d / diasMedidos : null
  const proyeccionMes = promedioDiario != null && diasMedidos >= 3 ? promedioDiario * 30 : null

  // ── SALUD: primera clase, no una nota al pie ──────────────────────────────
  // Un órgano que falla quema cuota sin producir. Bajo tarifa plana esto ES el
  // problema (el rename del 15 jul dejó 26 crons apuntando a rutas muertas y la
  // señal de "costo" no lo veía).
  const corridas7d = runs.filter((r) => r.created_at >= hace7).length
  const errores7d = runs.filter((r) => r.status === 'error' && r.created_at >= hace7).length

  const porOrgano = new Map<string, { runs: number; errores: number; tokens: number }>()
  for (const r of runs) {
    if (r.created_at < hace7) continue
    const o = porOrgano.get(r.prompt) ?? { runs: 0, errores: 0, tokens: 0 }
    o.runs++
    if (r.status === 'error') o.errores++
    o.tokens += tokensDe(r.usage) ?? 0
    porOrgano.set(r.prompt, o)
  }
  // Enfermo = >=60% de fallos con >=3 corridas (mismo umbral que el centinela
  // de salud, para que ambos digan lo mismo y no se contradigan).
  const enfermos = [...porOrgano.entries()]
    .filter(([, o]) => o.runs >= 3 && o.errores / o.runs >= 0.6)
    .map(([id, o]) => ({ id, runs: o.runs, errores: o.errores, tokens: o.tokens, tasaError: o.errores / o.runs }))
    .sort((a, b) => b.tasaError - a.tasaError)

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    lectura: lecturas[0] ?? null,
    lecturaPrevia: lecturas[1] ?? null,
    propuestas,
    tasaViva: {
      hoyTokens: serieByFecha.get(hoyUtc)?.tokens ?? 0,
      ultimos7dTokens: tok7d,
      ultimos30dTokens: tok30d,
      promedioDiarioTokens: promedioDiario,
      proyeccionMesTokens: proyeccionMes,
      runsMedidos7d: runs7d,
      runsMedidos30d: medidos.length,
      runsSinMedir30d: runs.length - medidos.length,
      primeraMedicion,
      diasMedidos,
      serie14d,
      porAnatomia,
    },
    salud: {
      corridas7d,
      errores7d,
      tasaErrorPct: corridas7d > 0 ? (errores7d / corridas7d) * 100 : null,
      enfermos,
    },
  })
}
