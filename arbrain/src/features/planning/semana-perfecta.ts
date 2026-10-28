import { esCuadrante, inferirDrip, type Cuadrante } from './drip'

/**
 * La Semana Perfecta (25 oct 2026, Daniel firmó: «una plantilla de semana ideal guardada… que se pinta como bloques fantasma tenues
 * detrás de la semana real, con interruptor en el engrane; editable por CLI para que Levy la llene con Daniel en la revisión»).
 * *Buy Back Your Time*, cap. 8 (Perfect Week, p. 173–179): el ritmo ideal se diseña una vez y la semana real se mide contra él. Aviso
 * honesto del libro: no sale perfecta a la primera; se ajusta en 2–3 semanas.
 *
 * Lógica pura, sin React ni node:* (la usan la rejilla de la Semana, la ruta /api/planning/drip, el CLI de Levy y las pruebas,
 * tests/planning/semana-perfecta.test.ts). Vive dentro del documento DRIP (`DocDrip.semana`): el mismo almacén por instalación
 * (Supabase `app_config` `planning:drip` para Daniel; `.claude/plan/drip.json` para el alumno). CLI: `semana-perfecta-cli.ts`.
 */

/** Un bloque de la plantilla. `dia`: 1 = lunes … 7 = domingo (ISO). Horas en minutos desde medianoche, fin exclusivo. */
export interface BloquePerfecto { dia: number; desde: number; hasta: number; titulo: string; cuadrante: Cuadrante }
export interface SemanaPerfecta { actualizado: string; bloques: BloquePerfecto[] }

export const BLOQUES_MAX = 120
export const DIAS_CORTOS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const

const texto = (s: unknown, max = 80) => typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const entero = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/** Valida un bloque. Devuelve el bloque limpio o null (lo inválido se descarta, nunca rompe la rejilla). */
export function leerBloque(crudo: unknown): BloquePerfecto | null {
  const b = crudo && typeof crudo === 'object' && !Array.isArray(crudo) ? crudo as Record<string, unknown> : null
  if (!b || !entero(b.dia, 1, 7) || !entero(b.desde, 0, 1439) || !entero(b.hasta, 1, 1440) || (b.hasta as number) <= (b.desde as number)) return null
  const titulo = texto(b.titulo)
  if (!titulo) return null
  const cuadrante = esCuadrante(b.cuadrante) ? b.cuadrante : inferirDrip({ id: 'perfecta', title: titulo, start: '', end: '' }).cuadrante
  return { dia: b.dia as number, desde: b.desde as number, hasta: b.hasta as number, titulo, cuadrante }
}

const orden = (a: BloquePerfecto, b: BloquePerfecto) => a.dia - b.dia || a.desde - b.desde || a.hasta - b.hasta

/** La plantilla sin confiar en ella: bloques válidos, en orden, con tope. null o vacía = sin semana perfecta. */
export function normalizarSemana(crudo: unknown): SemanaPerfecta | null {
  const s = crudo && typeof crudo === 'object' && !Array.isArray(crudo) ? crudo as Record<string, unknown> : null
  if (!s || !Array.isArray(s.bloques)) return null
  const bloques = s.bloques.slice(0, BLOQUES_MAX).map(leerBloque).filter((b): b is BloquePerfecto => !!b).sort(orden)
  if (!bloques.length) return null
  const actualizado = typeof s.actualizado === 'string' && Number.isFinite(Date.parse(s.actualizado)) ? s.actualizado : '1970-01-01T00:00:00.000Z'
  return { actualizado, bloques }
}

/* ── Lo que escribe Levy por el CLI ─────────────────────────────────────────────────────────────────────────────────── */

/** «lun-vie», «lun,mie,vie», «sab», «todos», «laborables», «finde» → días ISO (1–7). Devuelve el error en palabras si no se entiende. */
export function leerDias(spec: string): number[] | string {
  const norm = spec.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '')
  if (norm === 'todos' || norm === 'diario') return [1, 2, 3, 4, 5, 6, 7]
  if (norm === 'laborables' || norm === 'entresemana') return [1, 2, 3, 4, 5]
  if (norm === 'finde' || norm === 'findesemana') return [6, 7]
  const idx = (x: string) => { const i = DIAS_CORTOS.findIndex(d => x.startsWith(d)); return i >= 0 ? i + 1 : 0 }
  const dias = new Set<number>()
  for (const parte of norm.split(',')) {
    const [a, b] = parte.split('-')
    const x = idx(a), y = b === undefined ? x : idx(b)
    if (!x || !y) return `No entiendo el día «${parte}»: usa lun, mar, mie, jue, vie, sab, dom, rangos como lun-vie o «todos».`
    for (let d = x; ; d = d % 7 + 1) { dias.add(d); if (d === y) break }
  }
  return [...dias].sort((p, q) => p - q)
}

/** «06:00-08:30» o «6-8:30» → minutos. Fin «24:00» vale. */
export function leerTramo(spec: string): { desde: number; hasta: number } | string {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/.exec(spec.trim())
  if (!m) return `No entiendo el horario «${spec}»: usa HH:MM-HH:MM, por ejemplo 06:00-08:30.`
  const desde = Number(m[1]) * 60 + Number(m[2] ?? 0), hasta = Number(m[3]) * 60 + Number(m[4] ?? 0)
  if (desde > 1439 || hasta > 1440 || Number(m[2] ?? 0) > 59 || Number(m[4] ?? 0) > 59) return `Hora inválida en «${spec}».`
  if (hasta <= desde) return `El bloque «${spec}» termina antes de empezar (un bloque no cruza la medianoche: pártelo en dos).`
  return { desde, hasta }
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Un cambio a la plantilla (lo que manda el CLI o la app a `aplicarCambioDrip` con `accion: 'semana'`). */
export type CambioSemana =
  | { op: 'agregar'; dias: number[]; desde: number; hasta: number; titulo: string; cuadrante?: Cuadrante | null }
  | { op: 'quitar'; indices: number[] }
  | { op: 'reemplazar'; bloques: unknown[] }
  | { op: 'vaciar' }

/** Aplica un cambio a la plantilla. Puro. Devuelve la plantilla nueva (null = vacía) o el error en palabras. */
export function aplicarCambioSemana(antes: SemanaPerfecta | null, cambio: unknown, ahora = new Date().toISOString()): SemanaPerfecta | null | string {
  const c = cambio && typeof cambio === 'object' ? cambio as Record<string, unknown> : {}
  const actuales = antes?.bloques ?? []
  let bloques: BloquePerfecto[]
  switch (c.op) {
    case 'vaciar': return null
    case 'reemplazar': {
      if (!Array.isArray(c.bloques)) return 'Faltan los bloques de la semana.'
      bloques = c.bloques.slice(0, BLOQUES_MAX).map(leerBloque).filter((b): b is BloquePerfecto => !!b)
      if (c.bloques.length && !bloques.length) return 'Ningún bloque es válido (dia 1–7, desde/hasta en minutos, título).'
      break
    }
    case 'agregar': {
      const dias = Array.isArray(c.dias) ? c.dias.filter(d => entero(d, 1, 7)) as number[] : []
      if (!dias.length) return 'Falta en qué días va el bloque.'
      const nuevos = dias.map(dia => leerBloque({ dia, desde: c.desde, hasta: c.hasta, titulo: c.titulo, cuadrante: c.cuadrante ?? undefined }))
      if (nuevos.some(b => !b)) return 'Bloque inválido: revisa horario y título.'
      bloques = [...actuales, ...nuevos as BloquePerfecto[]]
      if (bloques.length > BLOQUES_MAX) return `La semana perfecta cabe en ${BLOQUES_MAX} bloques como mucho.`
      break
    }
    case 'quitar': {
      const quitar = new Set(Array.isArray(c.indices) ? c.indices.filter(i => entero(i, 1, actuales.length)) as number[] : [])
      if (!quitar.size) return `No hay bloque con ese número (la plantilla tiene ${actuales.length}).`
      bloques = actuales.filter((_, i) => !quitar.has(i + 1))
      break
    }
    default: return 'Operación inválida: agregar, quitar, reemplazar o vaciar.'
  }
  return bloques.length ? { actualizado: ahora, bloques: bloques.sort(orden) } : null
}

/* ── Lo que pinta la rejilla ─────────────────────────────────────────────────────────────────────────────────────────── */

/** Día ISO (1 = lunes) de una fecha `YYYY-MM-DD`, sin zona (mediodía UTC: el día civil no se corre). */
export const diaIso = (dia: string) => { const d = new Date(`${dia}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d }

/** Los bloques fantasma de un día: lo que la plantilla dice para ese día de la semana. */
export function fantasmasDelDia(semana: SemanaPerfecta | null | undefined, dia: string): BloquePerfecto[] {
  if (!semana) return []
  const d = diaIso(dia)
  return semana.bloques.filter(b => b.dia === d)
}

/**
 * Los fantasmas que ya empezaron (26 oct 2026, Daniel: «no quiero ver mi rutina a futuro»): con `corte` (epoch ms, normalmente
 * «ahora»), solo los bloques cuyo inicio, en la hora local de ese día, es anterior al corte. `corte` null = todos.
 */
export function fantasmasAntesDe(semana: SemanaPerfecta | null | undefined, dia: string, corte: number | null): BloquePerfecto[] {
  const todos = fantasmasDelDia(semana, dia)
  if (corte === null) return todos
  const [y, m, d] = dia.split('-').map(Number), cero = new Date(y, m - 1, d).getTime()
  return todos.filter(b => cero + b.desde * 60_000 < corte)
}

/** Horas por cuadrante de la plantilla entera (para el CLI y la revisión: «tu semana perfecta tiene 22 h de Producir»). */
export function horasDePlantilla(semana: SemanaPerfecta | null): Record<Cuadrante, number> {
  const r: Record<Cuadrante, number> = { producir: 0, invertir: 0, reemplazar: 0, delegar: 0 }
  for (const b of semana?.bloques ?? []) r[b.cuadrante] += (b.hasta - b.desde) / 60
  return r
}
