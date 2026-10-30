/**
 * Masterclass del sáb 17 oct 2026 (7 oct): el modelo puro de la vista. La fuente única es
 * docs/business-os/lanzamiento-ht-15-oct/masterclass/masterclass-17-oct.json en el repo del Studio; Levy la edita
 * conversando con Daniel y la vista la pinta. Aquí se normaliza lo que llegue (nunca truena por un campo faltante),
 * se cuenta el avance y se calcula la cuenta regresiva. Nada de puntajes: solo lo que el archivo dice.
 * Pruebas: tests/masterclass/masterclass.test.ts.
 */

export type EstadoBloque = 'vacio' | 'borrador' | 'listo'
/** Estados de las piezas sueltas (dominó, epifanía, promesa): el archivo usa «por-firmar», «borrador» y «firmado». */
export type EstadoPieza = 'vacio' | 'borrador' | 'por-firmar' | 'firmado'
export type ColorParte = 'ambar' | 'morado' | 'azul' | 'oro' | 'neutro'

export interface Parte { id: string; nombre: string; color: ColorParte }
export interface Bloque { n: number; parte: string; desde: number; hasta: number; titulo: string; que: string; contenido: string; estado: EstadoBloque; falta: string }
export interface Decision { que: string; estado: 'abierta' | 'cerrada'; resuelta?: string }
export interface Masterclass {
  actualizado: string | null
  evento: { titulo: string; fecha: string | null; duracionMin: number; lugar: string }
  granDomino: { explica: string; firmado: string; propuesta: string; estado: EstadoPieza }
  epifania: { frase: string; estado: EstadoPieza }
  promesa: { texto: string; estado: EstadoPieza }
  partes: Parte[]
  bloques: Bloque[]
  decisiones: Decision[]
  rutas: { clave: string; ruta: string }[]
}

/** Lo que devuelve /api/cabina/masterclass (el agent-server lee el archivo del repo del Studio). */
export interface LecturaMasterclass { datos?: unknown; mtime?: string; ruta?: string; leidoEn?: string; error?: string }

export const URL_MASTERCLASS = '/api/cabina/masterclass'

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const COLORES: readonly ColorParte[] = ['ambar', 'morado', 'azul', 'oro']

export function estadoBloque(v: unknown): EstadoBloque {
  const s = txt(v).toLowerCase()
  return s === 'listo' || s === 'firmado' ? 'listo' : s === 'borrador' ? 'borrador' : 'vacio'
}
export function estadoPieza(v: unknown): EstadoPieza {
  const s = txt(v).toLowerCase().replace(/\s+/g, '-')
  return s === 'firmado' || s === 'firmada' || s === 'listo' ? 'firmado' : s === 'por-firmar' ? 'por-firmar' : s === 'borrador' ? 'borrador' : 'vacio'
}

/** Del JSON crudo a un modelo completo. Lo que falta queda vacío; lo que no se entiende, fuera. */
export function normalizar(crudo: unknown): Masterclass {
  const o = obj(crudo), ev = obj(o.evento), gd = obj(o.granDomino), ep = obj(o.epifania), pr = obj(o.promesa)
  const partes: Parte[] = (Array.isArray(o.partes) ? o.partes : []).map(obj).filter(p => txt(p.id))
    .map(p => ({ id: txt(p.id), nombre: txt(p.nombre) || txt(p.id), color: (COLORES as readonly string[]).includes(txt(p.color)) ? txt(p.color) as ColorParte : 'neutro' }))
  const bloques: Bloque[] = (Array.isArray(o.bloques) ? o.bloques : []).map(obj).flatMap((b, i) => {
    const desde = num(b.desde), hasta = num(b.hasta)
    if (desde == null || hasta == null || hasta <= desde) return []
    return [{ n: num(b.n) ?? i + 1, parte: txt(b.parte), desde, hasta, titulo: txt(b.titulo) || `Bloque ${i + 1}`, que: txt(b.que), contenido: typeof b.contenido === 'string' ? b.contenido.trim() : '', estado: estadoBloque(b.estado), falta: txt(b.falta) }]
  }).sort((a, b) => a.desde - b.desde)
  const decisiones: Decision[] = (Array.isArray(o.decisiones) ? o.decisiones : []).map(obj).filter(d => txt(d.que))
    .map(d => ({ que: txt(d.que), estado: txt(d.estado).toLowerCase() === 'abierta' ? 'abierta' : 'cerrada', ...(txt(d.resuelta) || txt(d.decision) ? { resuelta: txt(d.resuelta) || txt(d.decision) } : {}) }))
  const rutas = Object.entries(obj(o.rutas)).filter(([, v]) => txt(v)).map(([clave, ruta]) => ({ clave, ruta: txt(ruta) }))
  return {
    actualizado: txt(o.actualizado) || null,
    evento: { titulo: txt(ev.titulo) || 'Masterclass', fecha: txt(ev.fecha) || null, duracionMin: num(ev.duracionMin) ?? (bloques.at(-1)?.hasta ?? 120), lugar: txt(ev.lugar) },
    granDomino: { explica: txt(gd.explica), firmado: txt(gd.firmado), propuesta: txt(gd.propuesta), estado: estadoPieza(gd.estado) },
    epifania: { frase: txt(ep.frase), estado: estadoPieza(ep.estado) },
    promesa: { texto: txt(pr.texto), estado: estadoPieza(pr.estado) },
    partes, bloques, decisiones, rutas,
  }
}

export const parteDe = (m: Masterclass, id: string): Parte => m.partes.find(p => p.id === id) ?? { id, nombre: id || 'Sin parte', color: 'neutro' }

/** Bloques por estado. `total` es cuántos hay en el archivo (10 hoy), no una meta inventada. */
export function avance(bloques: Bloque[]) {
  const c = { listo: 0, borrador: 0, vacio: 0 }
  for (const b of bloques) c[b.estado]++
  return { ...c, total: bloques.length }
}

/** Minutos por parte, en el orden en que aparecen las partes. */
export function minutosPorParte(m: Masterclass) {
  return m.partes.map(p => ({ ...p, minutos: m.bloques.filter(b => b.parte === p.id).reduce((a, b) => a + (b.hasta - b.desde), 0) }))
}

export type Momento =
  | { fase: 'antes'; ms: number; dias: number; horas: number; minutos: number }
  | { fase: 'en-vivo'; minuto: number; bloque: Bloque | null }
  | { fase: 'despues' }
  | { fase: 'sin-fecha' }

/** Dónde estamos respecto al evento: cuánto falta, qué minuto va o si ya pasó. */
export function momento(m: Masterclass, ahora: number): Momento {
  const t0 = m.evento.fecha ? Date.parse(m.evento.fecha) : NaN
  if (!Number.isFinite(t0)) return { fase: 'sin-fecha' }
  const ms = t0 - ahora
  if (ms > 0) {
    const min = Math.floor(ms / 60_000)
    return { fase: 'antes', ms, dias: Math.floor(min / 1440), horas: Math.floor((min % 1440) / 60), minutos: min % 60 }
  }
  const minuto = (ahora - t0) / 60_000
  if (minuto < m.evento.duracionMin) return { fase: 'en-vivo', minuto, bloque: m.bloques.find(b => minuto >= b.desde && minuto < b.hasta) ?? null }
  return { fase: 'despues' }
}

/** «12:25» a partir del inicio del evento y un minuto relativo. */
export function horaDe(fechaIso: string | null, minuto: number) {
  const t0 = fechaIso ? Date.parse(fechaIso) : NaN
  if (!Number.isFinite(t0)) return `min ${minuto}`
  return new Date(t0 + minuto * 60_000).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false })
}

/** «sábado 17 de octubre», en la hora de Daniel. */
export function diaDe(fechaIso: string | null, opciones: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const t = fechaIso ? Date.parse(fechaIso) : NaN
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', ...opciones }) : null
}

/** Lo que se ve con la vista colapsada en el hilo y lo que Levy recibe como resumen. */
export function resumenMasterclass(l: LecturaMasterclass | undefined, ahora = Date.now()): string | null {
  if (!l?.datos) return null
  const m = normalizar(l.datos), a = avance(m.bloques), t = momento(m, ahora)
  const cuando = t.fase === 'antes' ? (t.dias ? `faltan ${t.dias} d ${t.horas} h` : `faltan ${t.horas} h ${t.minutos} min`) : t.fase === 'en-vivo' ? `en vivo, min ${Math.floor(t.minuto)}` : t.fase === 'despues' ? 'ya pasó' : 'sin fecha'
  const abiertas = m.decisiones.filter(d => d.estado === 'abierta').length
  return `Masterclass · ${cuando} · ${a.listo} de ${a.total} bloques listos${abiertas ? ` · ${abiertas} ${abiertas === 1 ? 'decisión abierta' : 'decisiones abiertas'}` : ''}`
}
