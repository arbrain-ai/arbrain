import type { Bloque } from './dia-vivo'

/**
 * La agenda del Día en semana de llamadas (18 oct 2026, Daniel con capturas de «Lun 19 oct»: la rejilla ilegible).
 * Cada llamada de venta trae su gemelo «📋 Brief · Nombre» a la misma hora y las ventanas de disponibilidad
 * («📞 Llamadas con aplicantes», 10:00–14:30 y 15:15–19:45) se comían una columna: todo quedaba en chips «📞 Llama…».
 * Puro y sin React:
 *   - una ventana de disponibilidad es una BANDA de fondo, no una columna;
 *   - un brief que se encima con la llamada de la misma persona se pliega en la tarjeta de la llamada (se sigue abriendo);
 *   - la tarjeta de una llamada dice primero el nombre («Persona Uno»); el título completo queda en el detalle.
 */
export interface BloqueAgenda extends Bloque {
  /** El brief de la misma persona, plegado en esta tarjeta. */
  brief?: Bloque
  /** Lo que dice la tarjeta (el nombre en una llamada); sin esto, `titulo`. */
  corto?: string
}

const sinMarcas = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const clave = (nombre: string) => sinMarcas(nombre).replace(/\s+/g, ' ').trim().toLowerCase()
/** Quita emojis y signos del arranque («📞 », «📋 ») para leer el título. */
const cuerpo = (titulo: string) => titulo.replace(/^[^\p{L}\p{N}]+/u, '').trim()

/** «📞 Llamadas con aplicantes», «Ventana de venta HT…»: el fondo, no un compromiso. */
export function esVentana(titulo: string): boolean {
  const t = sinMarcas(cuerpo(titulo)).toLowerCase()
  return /^llamadas con aplicantes\b/.test(t) || /^ventana de venta\b/.test(t)
}

/** «📞 Llamada · Persona Uno · Cerebro Artificial» → «Persona Uno». Solo el formato de llamada con persona. */
export function nombreDeLlamada(titulo: string): string | null {
  const m = /^llamada\s*[·:|-]\s*(.+)$/i.exec(cuerpo(titulo))
  const nombre = m?.[1].split(/\s+[·|]\s+/)[0].replace(/\s+/g, ' ').trim()
  return nombre || null
}

/** «📋 Brief · Persona Uno» → «Persona Uno». */
export function nombreDeBrief(titulo: string): string | null {
  const m = /^brief\s*[·:|-]\s*(.+)$/i.exec(cuerpo(titulo))
  const nombre = m?.[1].split(/\s+[·|]\s+/)[0].replace(/\s+/g, ' ').trim()
  return nombre || null
}

const seEnciman = (a: { inicio: number; fin: number }, b: { inicio: number; fin: number }) => a.inicio < b.fin && b.inicio < a.fin

/** Lo mínimo que necesita el reparto: la Semana (`semana-horas.ts`) y el Día (`dia-vivo.ts`) traen cada uno su bloque. */
type Base = { id: string; titulo: string; inicio: number; fin: number }

/**
 * Reparte los bloques en tarjetas (llamadas con su brief) y bandas de fondo (ventanas de disponibilidad). Sirve al Día y, desde el
 * 19 oct 2026, también a la Semana en horas (Daniel: «¿por qué se ve tan amontonado mi día de hoy en la vista semanal??»).
 */
export function ordenarAgenda<B extends Base>(bloques: B[]): { bloques: (B & { brief?: B; corto?: string })[]; bandas: B[] } {
  const bandas = bloques.filter(b => esVentana(b.titulo))
  const resto = bloques.filter(b => !esVentana(b.titulo))
  const llamadas = resto.map(b => ({ b, nombre: nombreDeLlamada(b.titulo) })).filter(x => x.nombre)
  const plegados = new Set<string>()
  const briefDe = new Map<string, B>()
  for (const b of resto) {
    const nombre = nombreDeBrief(b.titulo)
    if (!nombre) continue
    const llamada = llamadas.find(l => !briefDe.has(l.b.id) && clave(l.nombre!) === clave(nombre) && seEnciman(l.b, b))
    if (!llamada) continue
    briefDe.set(llamada.b.id, b); plegados.add(b.id)
  }
  const tarjetas = resto.filter(b => !plegados.has(b.id)).map(b => {
    const nombre = nombreDeLlamada(b.titulo), brief = briefDe.get(b.id)
    return { ...b, ...(nombre ? { corto: nombre } : {}), ...(brief ? { brief } : {}) }
  })
  return { bloques: tarjetas, bandas }
}
