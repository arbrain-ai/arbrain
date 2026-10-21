import type { CronRun, CronSchedule } from '@/features/planning/types'

// Lógica pura de Rutinas: horario en una frase, último resultado sin jerga.

const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
const hora = (h: string, m: string) => `${Number(h)}:${m.padStart(2, '0')}`
const lista = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
const VECES = ['', 'Una vez', 'Dos veces', 'Tres veces', 'Cuatro veces', 'Cinco veces', 'Seis veces']

/** «15 2,8,14,20 * * *» → «Cuatro veces al día: 2:15, 8:15, 14:15 y 20:15». */
export function cuando(schedule: string) {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return schedule
  const [min, hour, dom, mon, dow] = parts
  const everyMin = min.match(/^\*\/(\d+)$/)
  if (everyMin && hour === '*') return `Cada ${everyMin[1]} minutos`
  if (!/^\d+$/.test(min) || mon !== '*') return schedule
  const everyHour = hour.match(/^\*\/(\d+)$/)
  if (everyHour && dom === '*' && dow === '*') return `Cada ${everyHour[1]} horas`
  if (!/^\d+(,\d+)*$/.test(hour)) return schedule
  const horas = hour.split(',').map(h => hora(h, min))
  const a = horas.length === 1 ? `a las ${horas[0]}` : `a las ${lista(horas)}`
  if (dom === '*' && dow === '*') return horas.length === 1 ? `Todos los días ${a}` : `${VECES[horas.length] ?? `${horas.length} veces`} al día: ${lista(horas)}`
  if (dom === '*' && /^\d$/.test(dow)) return `Los ${DIAS[Number(dow) % 7]} ${a}`
  if (/^\d+$/.test(dom) && dow === '*') return `El día ${dom} de cada mes ${a}`
  return schedule
}

export type Tono = 'ok' | 'error' | 'curso' | 'pausada' | 'sin-dato'
export interface Estado { tono: Tono; texto: string; ms: number | null }

const FALLO = (r: CronRun) => !!r.error || ['error', 'failed'].includes(r.status)
const OK = (r: CronRun) => ['success', 'completed', 'ok', 'done'].includes(r.status)

/** Último resultado de una rutina. Manda la corrida registrada más reciente; si no hay
 * ninguna en la ventana leída, el último resultado que guardó el scheduler. */
export function estado(job: CronSchedule, runs: CronRun[]): Estado {
  if (job.status === 'paused') return { tono: 'pausada', texto: 'En pausa', ms: job.last_run ? job.last_run * 1000 : null }
  const last = runs.filter(r => r.job_id === job.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (last) {
    const ms = Date.parse(last.created_at)
    if (FALLO(last)) return { tono: 'error', texto: 'Falló', ms }
    if (OK(last)) return { tono: 'ok', texto: 'Salió bien', ms }
    if (['running', 'in_progress', 'pending'].includes(last.status)) return { tono: 'curso', texto: 'Trabajando', ms }
  }
  const ms = job.last_run ? job.last_run * 1000 : null
  if (!job.last_result) return { tono: 'sin-dato', texto: ms ? 'Sin resultado guardado' : 'Todavía no corre', ms }
  return /^(error|❌|🔴)/i.test(job.last_result.trim()) ? { tono: 'error', texto: 'Falló', ms } : { tono: 'ok', texto: 'Salió bien', ms }
}

/** El texto que dejó la rutina, sin markdown, rutas ni ruido técnico, en una o dos frases. */
export function resumen(text: string | null, max = 190) {
  if (!text) return null
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^(?:error:\s*)+/i, '')
    .replace(/={2,}[^=\n]*={2,}/g, ' ')
    .replace(/(?:\/[\w.@-]+){2,}\/?/g, m => m.split('/').filter(Boolean).at(-1) ?? '')
    .replace(/[*`#>|]+|(?<!\w)_+|_+(?!\w)/g, ' ')
    .replace(/\s*\n+\s*[-•·]\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/(\.\s*){2,}/g, '. ')
    .trim()
  if (!clean) return null
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max), stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(': '))
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '')) + '…'
}

/** «hace 12 min», «hoy 08:50», «ayer 23:30», «lun 21 · 08:50». */
export function hace(ms: number | null, now: number, timeZone = 'America/Mexico_City') {
  if (!ms) return 'sin registro'
  const diff = now - ms
  if (diff >= 0 && diff < 3_600_000) return `hace ${Math.max(1, Math.round(diff / 60_000))} min`
  const day = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone })
  const time = new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
  if (day(ms) === day(now)) return `hoy ${time}`
  if (day(ms) === day(now - 86_400_000)) return `ayer ${time}`
  return `${new Date(ms).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', timeZone })} · ${time}`
}
