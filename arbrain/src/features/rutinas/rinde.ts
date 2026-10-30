// Qué rinde y qué no (5 oct 2026, Taller › Rutinas ← las salas Acciones y Metabolismo de la vieja sección Artificial
// Brain). Lógica pura, sin red: la API /api/arbrain/rendimiento junta los datos y esto los lee.
//
// Contrato sagrado (desde jul 2026): el órgano metabolismo PROPONE, Daniel firma hablando con Levy y Levy ejecuta.
// Aquí nada pausa, borra ni edita: un veredicto «no rinde» es una lectura, no un botón.
//
// Moneda: TOKENS, no dólares (con suscripción es tarifa plana; el costUsd del SDK es nocional, ver metabolismo/route.ts).
// Una corrida sin `usage` es «sin dato», nunca cero. Las corridas sin modelo (scripts directos) tampoco tienen tokens.

export interface CorridaRinde { job: string; status: string; at: string; tokens: number | null }
export interface TareaRinde { id: string; schedule: string; status: 'active' | 'paused'; last_run: number | null; last_result: string | null }
export interface PropuestaRinde {
  id: string; clave: string; tipo: string; neurona: string; titulo: string; propuesta: string
  ahorro_estimado: string | null; riesgo: string | null; estado: string; created_at: string; updated_at: string
}

export type TonoRinde = 'rinde' | 'no-rinde' | 'pausada' | 'sin-dato'
export interface Rendimiento {
  id: string
  status: 'active' | 'paused'
  schedule: string | null
  lastRun: number | null
  lastResult: string | null
  corridas: number
  errores: number
  /** Corridas con tokens medidos. */
  medidas: number
  /** Suma de tokens de las corridas medidas; null si ninguna se midió. */
  tokens: number | null
  tokensPorCorrida: number | null
  /** Parte (0..1) de todos los tokens medidos del periodo. */
  parte: number | null
  esperadas: number | null
  tono: TonoRinde
  motivo: string
  propuestas: PropuestaRinde[]
}

/** Cuántas veces dispara un cron de 5 campos en 30 días (aproximado; null si no se entiende). */
export function disparosEn30(schedule: string | null | undefined): number | null {
  const p = (schedule ?? '').trim().split(/\s+/)
  if (p.length !== 5) return null
  const [min, hora, dom, mes, dow] = p
  const cuantos = (campo: string, total: number): number | null => {
    if (campo === '*') return total
    const cada = /^\*\/(\d+)$/.exec(campo)
    if (cada) return Math.ceil(total / Number(cada[1]))
    let n = 0
    for (const parte of campo.split(',')) {
      const r = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(parte)
      if (r) n += Math.floor((Number(r[2]) - Number(r[1])) / Number(r[3] ?? 1)) + 1
      else if (/^\d+$/.test(parte)) n++
      else return null
    }
    return n
  }
  const m = cuantos(min, 60), h = cuantos(hora, 24)
  if (m == null || h == null) return null
  let dias: number | null
  if (dom === '*' && dow === '*') dias = 30
  else if (dom === '*') { const d = cuantos(dow, 7); dias = d == null ? null : (d * 30) / 7 }
  else if (dow === '*') { const d = cuantos(dom, 31); dias = d }
  else dias = null
  if (dias == null) return null
  if (mes !== '*') { const ms = cuantos(mes, 12); if (ms == null) return null; dias = (dias * ms) / 12 }
  return Math.round(m * h * dias * 10) / 10
}

const FALLA = (s: string) => s === 'error' || s === 'failed'
const pct = (x: number) => `${Math.round(x * 100)} %`
const DIA = 86_400_000

/** Une tareas del scheduler, corridas de 30 días y propuestas, y lee cada rutina. Orden: lo que no rinde primero. */
export function leerRendimiento(tareas: TareaRinde[], corridas: CorridaRinde[], propuestas: PropuestaRinde[], ahora = Date.now()): Rendimiento[] {
  const porJob = new Map<string, CorridaRinde[]>()
  for (const c of corridas) porJob.set(c.job, [...(porJob.get(c.job) ?? []), c])
  const totalMedido = corridas.reduce((s, c) => s + (c.tokens ?? 0), 0)
  const pendientes = propuestas.filter((p) => p.estado === 'propuesta')
  // La propuesta nombra su rutina en `neurona` («hipocampo + plasticidad-lectura») o en su clave («dieta:workspace-backup»).
  const deJob = (id: string) => pendientes.filter((p) => p.neurona.split(/[\s/+,]+/).some((n) => n.trim() === id) || (p.clave.split(':')[1] ?? '').startsWith(id))

  const ids = new Set([...tareas.map((t) => t.id), ...porJob.keys()])
  const tareaDe = new Map(tareas.map((t) => [t.id, t]))
  const out: Rendimiento[] = []
  for (const id of ids) {
    const t = tareaDe.get(id)
    const cs = porJob.get(id) ?? []
    const errores = cs.filter((c) => FALLA(c.status)).length
    const medidas = cs.filter((c) => c.tokens != null)
    const tokens = medidas.length ? medidas.reduce((s, c) => s + (c.tokens ?? 0), 0) : null
    const status = t?.status ?? 'active'
    const esperadas = disparosEn30(t?.schedule)
    const ultima = Math.max(t?.last_run ? t.last_run * 1000 : 0, ...cs.map((c) => Date.parse(c.at)))
    const r: Rendimiento = {
      id, status, schedule: t?.schedule ?? null, lastRun: t?.last_run ?? null, lastResult: t?.last_result ?? null,
      corridas: cs.length, errores, medidas: medidas.length, tokens,
      tokensPorCorrida: tokens != null ? Math.round(tokens / medidas.length) : null,
      parte: tokens != null && totalMedido > 0 ? tokens / totalMedido : null,
      esperadas, tono: 'sin-dato', motivo: '', propuestas: deJob(id),
    }
    if (status === 'paused') { r.tono = 'pausada'; r.motivo = ultima ? `En pausa; corrió por última vez hace ${Math.round((ahora - ultima) / DIA)} días.` : 'En pausa.' }
    else if (cs.length >= 3 && errores / cs.length >= 0.6) {
      r.tono = 'no-rinde'
      const ultimaBien = [...cs].sort((x, y) => y.at.localeCompare(x.at))[0]
      r.motivo = `Falló ${errores} de ${cs.length} veces en 30 días: gasta turnos sin entregar.${FALLA(ultimaBien.status) ? '' : ' La última salió bien: quizá ya se arregló.'}`
    }
    else if (cs.length === 0 && esperadas != null && esperadas >= 2 && (!ultima || ahora - ultima > 2 * (30 * DIA / esperadas))) {
      r.tono = 'no-rinde'; r.motivo = ultima ? `Está activa pero no corre desde hace ${Math.round((ahora - ultima) / DIA)} días.` : 'Está activa pero no ha corrido en 30 días.'
    }
    else if (cs.length === 0) { r.tono = 'sin-dato'; r.motivo = ultima ? 'Corre, pero sus corridas no quedan en la bitácora.' : 'Todavía no le toca correr en esta ventana.' }
    else {
      r.tono = 'rinde'
      r.motivo = errores ? `Entregó ${cs.length - errores} de ${cs.length} veces (${pct(errores / cs.length)} de fallos).` : `Entregó las ${cs.length} veces.`
    }
    out.push(r)
  }
  const orden: Record<TonoRinde, number> = { 'no-rinde': 0, rinde: 1, 'sin-dato': 2, pausada: 3 }
  return out.sort((a, b) => orden[a.tono] - orden[b.tono] || (b.tokens ?? -1) - (a.tokens ?? -1) || b.corridas - a.corridas)
}

/** «152.6 M», «58 K», «549». null = «sin dato». */
export function fmtTokens(n: number | null | undefined): string {
  if (n == null) return 'sin dato'
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} M`
  if (n >= 1e3) return `${Math.round(n / 1e3)} K`
  return String(Math.round(n))
}

/** ¿La propuesta apunta a una rutina que todavía existe? Las de rutinas ya retiradas no se firman: ya no aplican. */
export function propuestaVigente(p: PropuestaRinde, ids: Set<string>): boolean {
  const nombres = [...p.neurona.split(/[\s/+,]+/), p.clave.split(':')[1] ?? ''].map((n) => n.trim()).filter(Boolean)
  return nombres.some((n) => ids.has(n) || [...ids].some((id) => n.startsWith(id)))
}
