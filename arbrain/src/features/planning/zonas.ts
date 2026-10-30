import type { CampoFondo, CategoriaCampo } from '@/config/tipos'
import { minutos } from './campos-fondo'
/**
 * Zonas de mi vida (28 oct 2026, 08:09, Daniel: «en algún panel en la config activar y desactivar ciertas zonas de mi vida; por
 * ahora habilita todas, pero que el color de fondo dicte la zona; quizá sea el mismo color que las categorías de calendario»).
 * Lógica pura, sin React ni servidor (tests/planning/zonas.test.ts).
 *
 * Las zonas de fábrica salen de `instalacion().camposFondo`. Lo que la persona cambia en el engrane (encender o apagar, sus horas,
 * su color) se guarda como AJUSTES por clave en un documento suyo (`lib/planning/zonas-store.ts`), nunca como copia de la zona:
 * si la fábrica cambia algo que la persona no tocó, le llega. Todas nacen encendidas.
 */

export const CATEGORIAS_ZONA: readonly CategoriaCampo[] = ['crear', 'vender', 'ensenar', 'construir', 'vida']
const esCategoriaZona = (x: unknown): x is CategoriaCampo => typeof x === 'string' && (CATEGORIAS_ZONA as readonly string[]).includes(x)

/** Lo que la persona cambió de una zona. Lo ausente es lo de fábrica. */
export interface AjusteZona {
  activa?: boolean
  categoria?: CategoriaCampo
  franjas?: [string, string][]
}
export interface DocZonas { version: 1; actualizado: string; zonas: Record<string, AjusteZona> }
export const DOC_ZONAS_VACIO: DocZonas = { version: 1, actualizado: '1970-01-01T00:00:00.000Z', zonas: {} }

/** Una zona como la ve la app: la de fábrica con lo que la persona cambió encima. */
export interface Zona extends CampoFondo { activa: boolean; tocada: boolean }

const CLAVE = /^[a-z0-9-]{1,40}$/
const MAX_FRANJAS = 6

/** «6:00» → «06:00»; lo inválido es null. */
function hhmm(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = minutos(v)
  return m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Franjas válidas (inicio distinto del fin; si el fin es menor, cruza la medianoche) o null. */
function franjasValidas(v: unknown): [string, string][] | null {
  if (!Array.isArray(v) || !v.length || v.length > MAX_FRANJAS) return null
  const out: [string, string][] = []
  for (const f of v) {
    if (!Array.isArray(f) || f.length !== 2) return null
    const a = hhmm(f[0]), b = hhmm(f[1])
    if (!a || !b || a === b) return null
    out.push([a, b])
  }
  return out
}

function ajusteValido(v: unknown): AjusteZona | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>, a: AjusteZona = {}
  if (typeof o.activa === 'boolean') a.activa = o.activa
  if (esCategoriaZona(o.categoria)) a.categoria = o.categoria
  const f = franjasValidas(o.franjas)
  if (f) a.franjas = f
  return Object.keys(a).length ? a : null
}

/** Lee lo guardado sin confiar en ello: cada ajuste inválido se descarta. */
export function normalizarZonas(crudo: unknown): DocZonas {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return DOC_ZONAS_VACIO
  const o = crudo as Record<string, unknown>, zonas: Record<string, AjusteZona> = {}
  if (o.zonas && typeof o.zonas === 'object' && !Array.isArray(o.zonas))
    for (const [k, v] of Object.entries(o.zonas as Record<string, unknown>)) { const a = CLAVE.test(k) ? ajusteValido(v) : null; if (a) zonas[k] = a }
  return { version: 1, actualizado: typeof o.actualizado === 'string' ? o.actualizado : DOC_ZONAS_VACIO.actualizado, zonas }
}

/** Las zonas de fábrica con los ajustes de la persona encima, en el orden de fábrica. */
export function zonasEfectivas(fabrica: readonly CampoFondo[], doc: DocZonas | null | undefined): Zona[] {
  return fabrica.map(c => {
    const a = doc?.zonas[c.clave]
    return { ...c, categoria: a?.categoria ?? c.categoria, franjas: a?.franjas ?? c.franjas, activa: a?.activa ?? true, tocada: Boolean(a) }
  })
}

/** Las que se pintan. */
export const zonasEncendidas = (zonas: readonly Zona[]): CampoFondo[] => zonas.filter(z => z.activa)

export type CambioZonas =
  | { accion: 'zona'; clave: string; activa?: boolean; categoria?: CategoriaCampo; franjas?: [string, string][] }
  | { accion: 'restablecer'; clave?: string }

/**
 * Aplica UN cambio del engrane (la misma validación en la app y en el servidor). Devuelve el documento nuevo o el error en texto.
 * Un ajuste igual a lo de fábrica no se guarda: la zona vuelve a seguir a la fábrica.
 */
export function aplicarCambioZonas(doc: DocZonas, cambio: unknown, fabrica: readonly CampoFondo[], ahora = new Date().toISOString()): DocZonas | string {
  if (!cambio || typeof cambio !== 'object') return 'Cambio inválido.'
  const c = cambio as Record<string, unknown>
  const zonas = { ...doc.zonas }
  if (c.accion === 'restablecer') {
    if (c.clave === undefined) return { version: 1, actualizado: ahora, zonas: {} }
    if (typeof c.clave !== 'string' || !zonas[c.clave]) return 'Esa zona no tiene ajustes.'
    delete zonas[c.clave]
    return { version: 1, actualizado: ahora, zonas }
  }
  if (c.accion !== 'zona') return 'Acción inválida: zona o restablecer.'
  const base = typeof c.clave === 'string' ? fabrica.find(z => z.clave === c.clave) : undefined
  if (!base) return 'Esa zona no existe.'
  const a: AjusteZona = { ...zonas[base.clave] }
  if ('activa' in c) { if (typeof c.activa !== 'boolean') return 'activa debe ser sí o no.'; a.activa = c.activa }
  if ('categoria' in c) { if (!esCategoriaZona(c.categoria)) return 'Color inválido: crear, vender, ensenar, construir o vida.'; a.categoria = c.categoria }
  if ('franjas' in c) { const f = franjasValidas(c.franjas); if (!f) return 'Horas inválidas: «HH:MM» de inicio y fin, distintas.'; a.franjas = f }
  // Lo que coincide con fábrica no se guarda.
  if (a.activa === true) delete a.activa
  if (a.categoria === base.categoria) delete a.categoria
  if (a.franjas && JSON.stringify(a.franjas) === JSON.stringify(base.franjas.map(f => [hhmm(f[0]), hhmm(f[1])]))) delete a.franjas
  if (Object.keys(a).length) zonas[base.clave] = a
  else delete zonas[base.clave]
  return { version: 1, actualizado: ahora, zonas }
}
