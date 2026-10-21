/**
 * Canvas v4 — rotacion.
 *
 * El campo `rotation` existia en el modelo desde el primer dia y NADIE lo leia:
 * ni el motor lo aplicaba, ni el hit-test lo deshacia, ni habia manija. Una
 * capacidad declarada que no existe es peor que una ausente, porque el proximo
 * que lea el tipo va a construir encima de ella.
 *
 * Aqui vive la matematica, en un solo lugar, y la consumen los tres: el que
 * pinta, el que clickea y el que exporta. Es la misma regla que ya rige la
 * geometria de las figuras — si algun dia divergen, divergen juntos.
 */

import { bounds, type CanvasElement } from './element'

/** El centro sobre el que gira un elemento. Siempre el de su caja. */
export function centroDe(el: CanvasElement): { x: number; y: number } {
  const b = bounds(el)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** ¿Este elemento esta girado lo suficiente como para que importe? */
export function estaGirado(el: CanvasElement): boolean {
  return Math.abs(el.rotation ?? 0) > 1e-4
}

/** Lleva un punto del MUNDO al marco propio del elemento (deshace el giro). */
export function aLocal(el: CanvasElement, p: { x: number; y: number }): { x: number; y: number } {
  if (!estaGirado(el)) return p
  const c = centroDe(el)
  const a = -el.rotation
  const cos = Math.cos(a), sin = Math.sin(a)
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

/** Y de vuelta al mundo. */
export function aMundo(el: CanvasElement, p: { x: number; y: number }): { x: number; y: number } {
  if (!estaGirado(el)) return p
  const c = centroDe(el)
  const cos = Math.cos(el.rotation), sin = Math.sin(el.rotation)
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

/** Las cuatro esquinas de un elemento girado, en el mundo. */
export function esquinas(el: CanvasElement): Array<{ x: number; y: number }> {
  const b = bounds(el)
  return [
    { x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height },
  ].map(p => aMundo(el, p))
}

const GRADO = Math.PI / 180

/**
 * Ajusta el angulo a un valor "limpio".
 *
 * Dos reglas, heredadas del v3 porque son las correctas:
 *   · SIEMPRE se imanta a los multiplos de 90° dentro de 5°. Sin esto, volver
 *     a dejar algo derecho a mano es imposible: el ojo no distingue 0.4° pero
 *     el archivo lo guarda para siempre.
 *   · Con Shift, escalones de 15°, que es como se dibuja a proposito.
 */
export function ajustarAngulo(rad: number, shift: boolean): number {
  if (shift) return Math.round(rad / (15 * GRADO)) * (15 * GRADO)
  const cuarto = Math.PI / 2
  const cerca = Math.round(rad / cuarto) * cuarto
  return Math.abs(rad - cerca) <= 5 * GRADO ? cerca : rad
}

/** El angulo del puntero respecto al centro de la seleccion. */
export function anguloHacia(centro: { x: number; y: number }, p: { x: number; y: number }): number {
  // +PI/2 porque el cero de la manija esta ARRIBA, no a la derecha: el usuario
  // agarra un tirador que sale del borde superior y espera que ese sea el 0.
  return Math.atan2(p.y - centro.y, p.x - centro.x) + Math.PI / 2
}

/** Normaliza a (-PI, PI]. Un angulo que crece sin limite es imposible de leer. */
export function normalizar(rad: number): number {
  const dosPi = Math.PI * 2
  let r = rad % dosPi
  if (r > Math.PI) r -= dosPi
  if (r <= -Math.PI) r += dosPi
  return r
}

/** Grados enteros, para enseñarlos. */
export const enGrados = (rad: number): number => Math.round(normalizar(rad) / GRADO)
