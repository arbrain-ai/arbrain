import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole } from '@/lib/auth-utils'

// Sala "Plasticidad" del Artificial Brain — agregador server-side.
// Contesta: ¿qué patrón ve mi cerebro en mí que yo no veo? ¿qué decidí y no
// ejecuté? Une CUATRO fuentes: la lectura de patrones (escrita cada noche por
// el órgano plasticidad-lectura), el cruce objetivo-declarado vs cumplido,
// rachas/consistencia por hábito (server-side, NO en el browser) y el timeline
// de reflexiones nocturnas. Data del owner → service client auth-gated
// (lección RLS desktop).
//
// Semántica del objetivo (torcida por diseño, se maneja AQUÍ, no en la BD):
// sistema_reflexion.respuesta_am de la fecha X = lo que Daniel declaró esa
// NOCHE como objetivo del día X+1; su cumplimiento = check `objetivo_dia` en
// X+1. Las fechas se escriben en UTC (hook del chat) — "hoy" se computa igual.

interface CheckRow { fecha: string; habito_clave: string; hecho: boolean }
interface ReflexionRow {
  fecha: string
  prioridad_am: string | null
  respuesta_am: string | null
  respuesta_pm: string | null
}
interface HabitoRow { clave: string; nombre: string; icono: string | null; seccion: string; orden: number }
interface PatronRow { fecha: string; lectura: string; evidencia: unknown; created_at: string }

async function authorized(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const role = await getUserRole(user.id)
  return role === 'owner' || role === 'admin'
}

/** Suma días a una fecha 'YYYY-MM-DD' sin tocar TZ (aritmética pura de calendario). */
function addDays(fecha: string, days: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const SECCION_ORDEN = ['ancla', 'cuerpo', 'mente', 'nutricion'] as const

export async function GET() {
  if (!(await authorized())) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const service = createServiceClient()
  const hoy = new Date().toISOString().slice(0, 10) // UTC, misma semántica que los escritores

  const [patronesRes, habitosRes, checksRes, reflexionesRes] = await Promise.all([
    service
      .from('sistema_patrones')
      .select('fecha, lectura, evidencia, created_at')
      .order('fecha', { ascending: false })
      .limit(14),
    service
      .from('sistema_habitos')
      .select('clave, nombre, icono, seccion, orden')
      .eq('activo', true)
      .order('orden', { ascending: true }),
    service
      .from('sistema_checks')
      .select('fecha, habito_clave, hecho')
      .not('hecho', 'is', null) // Cleared marks retain revision, not an observation.
      .gte('fecha', addDays(hoy, -90))
      .order('fecha', { ascending: true }),
    service
      .from('sistema_reflexion')
      .select('fecha, prioridad_am, respuesta_am, respuesta_pm')
      .gte('fecha', addDays(hoy, -90))
      .order('fecha', { ascending: false }),
  ])

  const firstError = patronesRes.error ?? habitosRes.error ?? checksRes.error ?? reflexionesRes.error
  if (firstError) {
    return new Response(JSON.stringify({ error: firstError.message }), { status: 500 })
  }

  const patrones = (patronesRes.data ?? []) as PatronRow[]
  const habitos = (habitosRes.data ?? []) as HabitoRow[]
  const checks = (checksRes.data ?? []) as CheckRow[]
  const reflexiones = (reflexionesRes.data ?? []) as ReflexionRow[]

  // ── Índice de checks: habito → (fecha → hecho) ───────────────────────────
  const checksPorHabito = new Map<string, Map<string, boolean>>()
  for (const c of checks) {
    const porFecha = checksPorHabito.get(c.habito_clave) ?? new Map<string, boolean>()
    porFecha.set(c.fecha, c.hecho)
    checksPorHabito.set(c.habito_clave, porFecha)
  }

  // ── Decidido vs ejecutado (desfase X → X+1) ──────────────────────────────
  const objetivoChecks = checksPorHabito.get('objetivo_dia') ?? new Map<string, boolean>()
  const decididoVsEjecutado = reflexiones
    .filter((r) => (r.respuesta_am ?? '').trim().length > 0)
    .map((r) => {
      const paraElDia = addDays(r.fecha, 1)
      const check = objetivoChecks.get(paraElDia)
      let estado: 'cumplido' | 'no_cumplido' | 'sin_registro' | 'pendiente'
      if (check === true) estado = 'cumplido'
      else if (check === false) estado = 'no_cumplido'
      else if (paraElDia >= hoy) estado = 'pendiente' // el día aún no cierra
      else estado = 'sin_registro'
      return { declaradaEl: r.fecha, paraElDia, objetivo: (r.respuesta_am ?? '').trim(), estado }
    })

  // ── Consistencia por hábito: rachas server-side ──────────────────────────
  // Regla honesta: un día SIN registro rompe la racha (no se cuenta como
  // cumplido ni se salta). Racha actual camina hacia atrás desde hoy; si hoy
  // no tiene registro aún, arranca desde ayer.
  const consistencia = SECCION_ORDEN
    .map((seccion) => ({
      seccion,
      habitos: habitos
        .filter((h) => h.seccion === seccion)
        .map((h) => {
          const porFecha = checksPorHabito.get(h.clave) ?? new Map<string, boolean>()

          let rachaActual = 0
          let cursor = porFecha.has(hoy) ? hoy : addDays(hoy, -1)
          while (porFecha.get(cursor) === true) {
            rachaActual++
            cursor = addDays(cursor, -1)
          }

          let mejorRacha = 0
          let corriendo = 0
          const fechas = [...porFecha.keys()].sort()
          let prev: string | null = null
          for (const f of fechas) {
            const consecutivo = prev !== null && addDays(prev, 1) === f
            corriendo = porFecha.get(f) === true ? (consecutivo ? corriendo + 1 : 1) : 0
            if (corriendo > mejorRacha) mejorRacha = corriendo
            prev = f
          }

          const ultimos14 = Array.from({ length: 14 }, (_, i) => {
            const fecha = addDays(hoy, i - 13)
            const hecho = porFecha.get(fecha)
            return { fecha, estado: hecho === true ? 'hecho' : hecho === false ? 'fallo' : 'sin_registro' }
          })

          return {
            clave: h.clave,
            nombre: h.nombre,
            icono: h.icono,
            registros: porFecha.size,
            hechos: [...porFecha.values()].filter(Boolean).length,
            rachaActual,
            mejorRacha,
            ultimos14,
          }
        }),
    }))
    .filter((s) => s.habitos.length > 0)

  // ── Meta: qué tan larga es la historia (para honestidad en la UI) ────────
  const fechasConRegistro = new Set<string>()
  for (const c of checks) fechasConRegistro.add(c.fecha)
  for (const r of reflexiones) {
    if ((r.respuesta_am ?? '').trim() || (r.respuesta_pm ?? '').trim() || (r.prioridad_am ?? '').trim()) {
      fechasConRegistro.add(r.fecha)
    }
  }
  const fechasOrdenadas = [...fechasConRegistro].sort()

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    lectura: patrones[0] ?? null,
    lecturasPrevias: patrones.slice(1),
    decididoVsEjecutado,
    consistencia,
    reflexiones,
    meta: {
      hoy,
      desde: fechasOrdenadas[0] ?? null,
      diasConRegistro: fechasConRegistro.size,
      historiaCorta: fechasConRegistro.size < 14,
    },
  })
}
