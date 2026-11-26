/**
 * Lienzo v17 · el RECORRIDO (15 nov 2026): el lienzo como clase. Contrato: `docs/builds/lienzo-v17/MOTOR.md`.
 *
 * Los capítulos siguen siendo los marcos (`layout/capitulos.ts`). En recorrido, `→` primero gasta los pasos internos de
 * las piezas del capítulo (cada una revela lo suyo) y luego vuela al siguiente capítulo, donde las piezas empiezan en su
 * paso 0; `←` deshace igual y, al volver a un capítulo anterior, lo deja completo. Lo que declara `aparece` no se ve hasta
 * que el recorrido llega a su capítulo.
 *
 * PARADAS INTERIORES (17 nov 2026, `layout/paradas.ts`): si el capítulo las declara, después de su entrada `→` va de
 * parada en parada, en su orden, y solo entonces vuela al siguiente capítulo. Las piezas con pasos se revelan donde se
 * ven: las ancladas a una parada, en esa parada; las demás, en la entrada. `←` deshace igual y, al volver a un capítulo
 * anterior, aterriza en su última parada con todo completo. Sin paradas, exactamente lo de antes.
 *
 * Puro (tests/canvas/piezas-formato.test.ts y tests/canvas/paradas.test.ts).
 */
import { buscarCapitulo } from '../islas/destinos'

export interface Caja { x: number; y: number; width: number; height: number }
export interface PiezaRecorrido { elId: string; caja: Caja; pasos: number }

export type Movida =
  | { tipo: 'paso'; elId: string; paso: number }
  | { tipo: 'capitulo'; i: number; /** pasos de las piezas del capítulo nuevo */ pasos: Array<{ elId: string; paso: number }>;
      /** Con paradas interiores, al volver con ←: la parada donde aterriza (la última). Ausente = la entrada. */ parada?: number }
  /** Otra parada interior del mismo capítulo; `k` = -1 es volver a su entrada. */
  | { tipo: 'parada'; i: number; k: number }
  | { tipo: 'nada' }

/** Una pieza pertenece al capítulo cuyo marco contiene su centro. */
export function piezasDelCapitulo<T extends PiezaRecorrido>(piezas: readonly T[], cap: Caja): T[] {
  return piezas
    .filter(p => {
      const cx = p.caja.x + p.caja.width / 2, cy = p.caja.y + p.caja.height / 2
      return cx >= cap.x && cx <= cap.x + cap.width && cy >= cap.y && cy <= cap.y + cap.height
    })
    // Orden de lectura: de arriba abajo, de izquierda a derecha.
    .sort((a, b) => (Math.abs(a.caja.y - b.caja.y) > 40 ? a.caja.y - b.caja.y : a.caja.x - b.caja.x))
}

/**
 * El siguiente movimiento del recorrido. `actual` null = aún en la vista completa. `paradas[i]` = las paradas interiores
 * del capítulo `i` (solo importa a qué elemento se anclan) y `parada` = en cuál está (-1 o null = en la entrada).
 */
export function moverRecorrido(dir: 1 | -1, actual: number | null, caps: ReadonlyArray<{ caja: Caja }>,
  piezas: readonly PiezaRecorrido[], pasoDe: (elId: string) => number,
  paradas?: ReadonlyArray<ReadonlyArray<{ elId: string }>>, parada: number | null = null): Movida {
  if (!caps.length) return { tipo: 'nada' }
  const de = (i: number) => paradas?.[i] ?? []
  const conPasos = (i: number) => piezasDelCapitulo(piezas, caps[i].caja).filter(p => p.pasos > 0)
  // Las piezas que revelan en la parada k (-1 = la entrada): las ancladas a ella (en su primera parada); las demás, en
  // la entrada. Sin paradas, todas en la entrada (lo de antes).
  const piezasEn = (i: number, k: number) => {
    const todas = conPasos(i), ps = de(i)
    if (!ps.length) return todas
    if (k < 0) { const anc = new Set(ps.map(p => p.elId)); return todas.filter(p => !anc.has(p.elId)) }
    const id = ps[k].elId
    return ps.findIndex(p => p.elId === id) === k ? todas.filter(p => p.elId === id) : []
  }
  const entrar = (i: number, alInicio: boolean): Movida => {
    const mv: Movida = { tipo: 'capitulo', i, pasos: conPasos(i).map(p => ({ elId: p.elId, paso: alInicio ? 0 : p.pasos })) }
    const n = de(i).length
    return !alInicio && n ? { ...mv, parada: n - 1 } : mv
  }
  if (actual == null || actual < 0 || actual >= caps.length) return entrar(dir > 0 ? 0 : caps.length - 1, dir > 0)
  const ps = de(actual)
  const k = ps.length && parada != null && parada >= 0 && parada < ps.length ? parada : -1
  const aqui = piezasEn(actual, k)
  if (dir > 0) {
    const pendiente = aqui.find(p => pasoDe(p.elId) < p.pasos)
    if (pendiente) return { tipo: 'paso', elId: pendiente.elId, paso: pasoDe(pendiente.elId) + 1 }
    if (k + 1 < ps.length) return { tipo: 'parada', i: actual, k: k + 1 }
    return actual < caps.length - 1 ? entrar(actual + 1, true) : { tipo: 'nada' }
  }
  const conPaso = [...aqui].reverse().find(p => pasoDe(p.elId) > 0)
  if (conPaso) return { tipo: 'paso', elId: conPaso.elId, paso: pasoDe(conPaso.elId) - 1 }
  if (k >= 0) return { tipo: 'parada', i: actual, k: k - 1 }
  return actual > 0 ? entrar(actual - 1, false) : { tipo: 'nada' }
}

/** Los elementos que el recorrido aún no revela (su `aparece` es un capítulo posterior al actual). */
export function ocultosEnRecorrido(elements: ReadonlyArray<{ id: string; aparece?: unknown }>,
  caps: ReadonlyArray<{ id: string; titulo: string }>, actual: number | null): Set<string> {
  const s = new Set<string>()
  for (const e of elements) {
    if (typeof e.aparece !== 'string' || !e.aparece.trim()) continue
    const k = buscarCapitulo(caps, e.aparece.trim())
    if (k >= 0 && (actual == null || actual < k)) s.add(e.id)
  }
  return s
}
