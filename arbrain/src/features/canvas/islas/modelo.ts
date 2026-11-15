/**
 * Mapa v16 · una isla LISTA para pintar (14 nov 2026): su receta validada, cada bloque validado por su tipo, la caja de cada
 * uno en la rejilla, las fuentes que lee y los destinos de sus botones. Lo usan igual el componente vivo y el dibujo ligero
 * del canvas: de lejos y de cerca, las mismas cajas.
 *
 * Puro (tests/canvas/islas-receta.test.ts).
 */
import { leerReceta, maquetar, type Caja, type Receta } from './receta'
import { esquemaDe, prepararBloque, type BloqueListo } from './bloques/esquemas'
import { leerDestino } from './destinos'
import { fuentesDelCartel } from './bloques/cartel'

export interface IslaLista {
  receta: Receta
  bloques: Array<BloqueListo & { caja: Caja; id?: string; variante?: Receta['variante']; animacion?: Receta['animacion']; destino?: string }>
  ancho: number
  alto: number
  fuentes: string[]
  /** Todo lo que no cumple, en palabras: la isla lo enseña (Levy lo corrige en la receta). */
  errores: string[]
}

/** `esPropia`: las URLs de esta instalación (el host la pasa); sin ella, solo se aceptan los dominios de la lista. */
export function prepararIsla(crudo: unknown, esPropia: (u: URL) => boolean = () => false): { ok: true; isla: IslaLista } | { ok: false; errores: string[] } {
  const l = leerReceta(crudo)
  if (!l.ok) return l
  const r = l.receta
  const errores = [...l.errores]
  // `destino` es del bloque entero (todo él lleva ahí) y, en un botón, también su propiedad: se le pasa al tipo.
  const listos = r.bloques.map(b => prepararBloque(b.tipo, b.destino ? { ...b.props, destino: b.destino } : b.props))
  const { cajas, ancho, alto } = maquetar(r, b => {
    const i = r.bloques.indexOf(b), x = listos[i]
    return x.ok ? esquemaDe(x.tipo)!.filas(x.p) : 2
  })
  const fuentes = new Set<string>()
  listos.forEach((x, i) => {
    const b = r.bloques[i]
    if (!x.ok) { errores.push(`Bloque ${i + 1} (${x.tipo}): ${x.motivo}`); return }
    const e = esquemaDe(x.tipo)!
    for (const f of e.fuentes(x.p)) fuentes.add(f)
    for (const d of new Set([...e.destinos(x.p), ...(b.destino ? [b.destino] : [])])) if (!leerDestino(d, esPropia)) errores.push(`Bloque ${i + 1} (${x.tipo}): el destino «${d}» no está en la lista blanca.`)
  })
  // El cartel de lejos lee además el pulso del órgano y su bandeja (y la cifra que pida `lejos`).
  for (const f of fuentesDelCartel({ receta: r, bloques: listos.map(x => x) })) fuentes.add(f)
  return { ok: true, isla: {
    receta: r, ancho, alto, fuentes: [...fuentes].sort(), errores,
    bloques: listos.map((x, i) => {
      const b = r.bloques[i]
      return { ...x, caja: cajas[i], ...(b.id ? { id: b.id } : {}), ...(b.variante ? { variante: b.variante } : {}), ...(b.animacion ? { animacion: b.animacion } : {}), ...(b.destino ? { destino: b.destino } : {}) }
    }),
  } }
}

/**
 * Una serie de números de lo que traiga la fuente: una lista de números, o de objetos con `valor`/`value`/`v`/`y` (los
 * puntos del BI traen `valor`, que puede ser null en un día sin dato: ese día se salta, no se pinta como 0).
 */
export function serieDe(x: unknown): number[] {
  if (!Array.isArray(x)) return []
  const out: number[] = []
  for (const p of x) {
    const v = typeof p === 'number' ? p : p && typeof p === 'object' ? ['valor', 'value', 'v', 'y'].map(k => (p as Record<string, unknown>)[k]).find(n => typeof n === 'number') : undefined
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v)
  }
  return out.slice(-120)
}
