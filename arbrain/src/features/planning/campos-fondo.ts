import type { CampoFondo } from '@/config/tipos'
/**
 * Campos de fondo del calendario (28 oct 2026). Lógica pura, sin React (tests/planning/campos-fondo.test.ts).
 *
 * Daniel, 28 oct: la rutina «se volvió un campo de fondo» detrás de los eventos (la Semana Perfecta en fantasma y las ventanas de
 * disponibilidad), y pidió dos más sin crear eventos:
 *   · La ventana de comida del ayuno 16:8, de 9:00 a 17:00 todos los días (memoria user/habitos-noche-diario-ayuno-2026-10-28.md).
 *   · El trabajo profundo, mínimo 8 horas diarias de lunes a viernes, «no negociables», con el calendario como «un espejo y no
 *     una meta incumplida»: franjas 06:00–09:00, 13:00–15:00 y 15:30–18:30.
 * Un campo nunca tapa: va detrás de todo. Si una llamada cae encima, la llamada gana y el campo lo dice («7 h · 1 h con
 * llamadas»), sin rojo ni alarma: describe el día, no lo juzga. Las franjas viven en `config/instalacion.ts` (`camposFondo`).
 */

export interface FranjaFondo { clave: string; titulo: string; tipo: CampoFondo['tipo']; desde: number; hasta: number }

/** «06:00» → 360. Lo inválido es null. */
export function minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  return h <= 24 && mi < 60 && h * 60 + mi <= 1440 ? h * 60 + mi : null
}

/** Día ISO (1 = lunes … 7 = domingo) de un `YYYY-MM-DD`, sin zona. */
export const diaIso = (dia: string) => { const d = new Date(`${dia}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d }

/** Las franjas de fondo de un día (`YYYY-MM-DD`), en orden. Lo mal escrito en la configuración se ignora, no truena. */
export function franjasDelDia(campos: readonly CampoFondo[] | null | undefined, dia: string): FranjaFondo[] {
  if (!campos?.length) return []
  const d = diaIso(dia)
  const out: FranjaFondo[] = []
  for (const c of campos) {
    if (c.dias?.length && !c.dias.includes(d)) continue
    for (const [a, b] of c.franjas) {
      const desde = minutos(a), hasta = minutos(b)
      if (desde == null || hasta == null || hasta <= desde) continue
      out.push({ clave: c.clave, titulo: c.titulo, tipo: c.tipo, desde, hasta })
    }
  }
  return out.sort((x, y) => x.desde - y.desde || x.hasta - y.hasta)
}

/** Minutos de [desde, hasta) que quedan bajo algún intervalo ocupado (sin contar dos veces lo encimado). */
export function minutosTapados(desde: number, hasta: number, ocupados: readonly { desde: number; hasta: number }[]): number {
  const cortes = ocupados.map(o => [Math.max(desde, o.desde), Math.min(hasta, o.hasta)] as const).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  let total = 0, fin = desde
  for (const [a, b] of cortes) { const ini = Math.max(a, fin); if (b > ini) { total += b - ini; fin = b } }
  return total
}

/** «8 h», «7 h 30», «45 min». */
export function horas(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  if (!h) return `${m} min`
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/**
 * Lo que dice un campo de trabajo en un día, con las llamadas de ese día (minutos desde medianoche): sus horas y, si algo se
 * encimó, cuánto. Un espejo: «Trabajo profundo · 8 h» o «Trabajo profundo · 7 h · 1 h con llamadas».
 */
export function resumenCampo(franjas: readonly FranjaFondo[], clave: string, llamadas: readonly { desde: number; hasta: number }[]): { total: number; tapado: number; texto: string } | null {
  const mias = franjas.filter(f => f.clave === clave)
  if (!mias.length) return null
  const total = mias.reduce((s, f) => s + f.hasta - f.desde, 0)
  const tapado = mias.reduce((s, f) => s + minutosTapados(f.desde, f.hasta, llamadas), 0)
  const titulo = mias[0].titulo
  return { total, tapado, texto: tapado ? `${titulo} · ${horas(total - tapado)} · ${horas(tapado)} con llamadas` : `${titulo} · ${horas(total)}` }
}

/** «9:00–17:00». */
export const rango = (f: Pick<FranjaFondo, 'desde' | 'hasta'>) => {
  const t = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  return `${t(f.desde)}–${t(f.hasta)}`
}
