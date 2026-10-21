/**
 * QUIEN puso cada cosa en el lienzo (2 oct 2026, pedido de Daniel: que anotar en el lienzo sea
 * hablarle a Levy). Todo elemento que nace en la pizarra a mano sale firmado con `autor` y conserva
 * su `createdAt`/`updatedAt`: Levy lee las notas nuevas con
 * `.claude/skills/sfmap/scripts/notas.py notas --page <id>` sin confundirlas con lo que genero el
 * compilador (`origin`) o un generador de sfmap (`gen`).
 *
 * Se firma en el GUARDADO y no al crear: hay una docena de caminos que crean elementos (nota,
 * texto, figura, tinta, pegar, duplicar, tabla…) y una sola puerta de salida. Firmar ahi no puede
 * olvidar ninguno. Lo que ya existia al abrir, o llego de otro aparato, no se toca.
 */
import type { CanvasElement } from './element'

/** La mano de quien usa la pizarra (el dueño del espacio). Levy escribe por la API con su propio actor. */
export const AUTOR_MANO = 'humano'

export function firmarAutoria(els: CanvasElement[], conocidos: ReadonlySet<string>, autor = AUTOR_MANO): CanvasElement[] {
  let cambio = false
  const out = els.map(e => {
    const crudo = e as CanvasElement & { gen?: unknown }
    if (e.autor || e.origin || crudo.gen || conocidos.has(e.id)) return e
    cambio = true
    return { ...e, autor }
  })
  return cambio ? out : els
}
