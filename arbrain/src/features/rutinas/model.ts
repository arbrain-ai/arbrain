import type { CronRun, CronSchedule } from '@/features/planning/types'
import { localeIntl, tr, trMarcas } from '@/shared/i18n'

// Lógica pura de Rutinas: horario en una frase, último resultado sin jerga.

// La frase entera por día (13 nov 2026, inglés): «Los lunes {a}» → «Mondays {a}»; mismo texto en español que antes.
const DIAS = trMarcas(['Los domingos {a}', 'Los lunes {a}', 'Los martes {a}', 'Los miércoles {a}', 'Los jueves {a}', 'Los viernes {a}', 'Los sábados {a}'])
const hora = (h: string, m: string) => `${Number(h)}:${m.padStart(2, '0')}`
const lista = (items: string[]) => items.length < 2 ? items.join('') : tr('{inicio} y {ultimo}', { inicio: items.slice(0, -1).join(', '), ultimo: items.at(-1) })
const VECES = ['', ...trMarcas(['Una vez', 'Dos veces', 'Tres veces', 'Cuatro veces', 'Cinco veces', 'Seis veces'])]

/** «15 2,8,14,20 * * *» → «Cuatro veces al día: 2:15, 8:15, 14:15 y 20:15». */
export function cuando(schedule: string) {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return schedule
  const [min, hour, dom, mon, dow] = parts
  const everyMin = min.match(/^\*\/(\d+)$/)
  if (everyMin && hour === '*') return tr('Cada {n} minutos', { n: everyMin[1] })
  if (!/^\d+$/.test(min) || mon !== '*') return schedule
  const everyHour = hour.match(/^\*\/(\d+)$/)
  if (everyHour && dom === '*' && dow === '*') return tr('Cada {n} horas', { n: everyHour[1] })
  if (!/^\d+(,\d+)*$/.test(hour)) return schedule
  const horas = hour.split(',').map(h => hora(h, min))
  const a = tr('a las {horas}', { horas: horas.length === 1 ? horas[0] : lista(horas) })
  if (dom === '*' && dow === '*') return horas.length === 1 ? tr('Todos los días {a}', { a }) : tr('{veces} al día: {horas}', { veces: VECES[horas.length] ? tr(VECES[horas.length]) : tr('{n} veces', { n: horas.length }), horas: lista(horas) })
  if (dom === '*' && /^\d$/.test(dow)) return tr(DIAS[Number(dow) % 7], { a })
  if (/^\d+$/.test(dom) && dow === '*') return tr('El día {dia} de cada mes {a}', { dia: dom, a })
  return schedule
}

export type Tono = 'ok' | 'error' | 'curso' | 'pausada' | 'sin-dato'
export interface Estado { tono: Tono; texto: string; ms: number | null }

const FALLO = (r: CronRun) => !!r.error || ['error', 'failed'].includes(r.status)
const OK = (r: CronRun) => ['success', 'completed', 'ok', 'done'].includes(r.status)

/** Último resultado de una rutina. Manda la corrida registrada más reciente; si no hay
 * ninguna en la ventana leída, el último resultado que guardó el scheduler. */
export function estado(job: CronSchedule, runs: CronRun[]): Estado {
  if (job.status === 'paused') return { tono: 'pausada', texto: tr('En pausa'), ms: job.last_run ? job.last_run * 1000 : null }
  const last = runs.filter(r => r.job_id === job.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (last) {
    const ms = Date.parse(last.created_at)
    if (FALLO(last)) return { tono: 'error', texto: tr('Falló'), ms }
    if (OK(last)) return { tono: 'ok', texto: tr('Salió bien'), ms }
    if (['running', 'in_progress', 'pending'].includes(last.status)) return { tono: 'curso', texto: tr('Trabajando'), ms }
  }
  const ms = job.last_run ? job.last_run * 1000 : null
  if (!job.last_result) return { tono: 'sin-dato', texto: ms ? tr('Sin resultado guardado') : tr('Todavía no corre'), ms }
  return /^(error|❌|🔴)/i.test(job.last_result.trim()) ? { tono: 'error', texto: tr('Falló'), ms } : { tono: 'ok', texto: tr('Salió bien'), ms }
}

/** El texto que dejó la rutina, sin markdown, rutas ni ruido técnico, en una o dos frases. */
export function resumen(text: string | null, max = 190) {
  if (!text) return null
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^(?:error:\s*)+/i, '')
    .replace(/={2,}[^=\n]*={2,}/g, ' ')
    // Una ruta se acorta a su último tramo; también la relativa (`.claude/reportes/x.md` → `x.md`): antes el primer
    // tramo quedaba pegado al nombre («.claude2026-11-01-manana.md», captura del 1 nov).
    .replace(/(?:[\w.@-]+)?(?:\/[\w.@-]+){2,}\/?/g, m => m.split('/').filter(Boolean).at(-1) ?? '')
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
  if (!ms) return tr('sin registro')
  const diff = now - ms
  if (diff >= 0 && diff < 3_600_000) return tr('hace {n} min', { n: Math.max(1, Math.round(diff / 60_000)) })
  const day = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone })
  const time = new Date(ms).toLocaleTimeString(localeIntl(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
  if (day(ms) === day(now)) return tr('hoy {hora}', { hora: time })
  if (day(ms) === day(now - 86_400_000)) return tr('ayer {hora}', { hora: time })
  return `${new Date(ms).toLocaleDateString(localeIntl(), { weekday: 'short', day: 'numeric', timeZone })} · ${time}`
}
