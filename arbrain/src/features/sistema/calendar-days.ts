import { zonaDueno } from '@/shared/lib/zona-dueno'

/**
 * Civil dates stay independent of DST-length days. The zone is the owner's (shared/lib/zona-dueno.ts): the original install's
 * install keeps America/Mexico_City; a student's install uses their own (29 oct 2026, T7). Stored habit keys are civil
 * dates (AAAA-MM-DD) and never carry a zone, so existing records keep their meaning.
 */
export function civilToday(timeZone = zonaDueno(), now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function shiftDay(date: string, days: number): string {
  if (!isCivilDate(date) || !Number.isInteger(days)) throw new Error('Fecha inválida.')
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function civilMidnight(date: string, timeZone = zonaDueno()): Date {
  if (!isCivilDate(date)) throw new Error('Fecha inválida.')
  const target = Date.parse(`${date}T00:00:00Z`)
  let value = target
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' })
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(value))
    const part = (type: string) => parts.find(p => p.type === type)!.value
    const displayed = Date.parse(`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`)
    const delta = target - displayed
    if (!delta) return new Date(value)
    value += delta
  }
  throw new Error('No se pudo resolver el inicio del día en esta zona.')
}

export function habitRange(params: URLSearchParams, now = new Date()) {
  const timeZone = params.get('timeZone') ?? zonaDueno()
  const today = civilToday(timeZone, now) // Intl validates IANA timezone.
  const date = params.get('date') ?? today
  const days = Number(params.get('days') ?? '1')
  if (!isCivilDate(date) || !Number.isInteger(days) || days < 0 || days > 366) throw new Error('Rango inválido (máximo 366 días).')
  const from = params.get('from') ?? shiftDay(date, -Math.max(0, days - 1))
  const to = params.get('to') ?? date
  if (!isCivilDate(from) || !isCivilDate(to) || from > to || shiftDay(from, 365) < to) throw new Error('Rango inválido (máximo 366 días).')
  return { date, from, to, today, timeZone }
}
