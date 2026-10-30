/**
 * Canvas v4 — los puertos de conexion.
 *
 * Lo que Daniel pidio textual: *"una flecha al poner el mouse en los nodos
 * laterales, unos milimetros afuera justo como Notion lo hace"*.
 *
 * Es la diferencia entre un lienzo que se siente vivo y uno que se siente un
 * formulario. Sin puertos, conectar dos cajas obliga a: cambiar de herramienta,
 * apuntar, arrastrar, y volver a cambiar de herramienta. Con puertos, el propio
 * elemento OFRECE el gesto cuando la mano se acerca — cero cambios de modo.
 *
 * Los cuatro puertos van FUERA del borde, no encima. Encima competirian con las
 * manijas de redimension y con el clic de seleccion; y ese margen de aire es
 * justo lo que hace que la mano entienda que el gesto sale del elemento en vez
 * de editarlo.
 */

import { bounds, type CanvasElement } from '../model/element'

export type PortId = 'n' | 'e' | 's' | 'w'
export const PORTS: PortId[] = ['n', 'e', 's', 'w']

/** Separacion del borde, en px de PANTALLA. Los "milimetros afuera". */
export const PORT_GAP_PX = 12
/** Radio del boton, en px de PANTALLA: fijo a cualquier zoom y discreto, fuera del borde para no tapar texto. */
export const PORT_R_PX = 5
/** Radio de agarre. Mas generoso que el dibujo: apuntar a 6px es un castigo. */
const GRAB_PX = 13
const GRAB_PX_TOUCH = 26

export interface PortPoint { id: PortId; x: number; y: number }

/**
 * Donde caen los cuatro puertos de un elemento, en coordenadas de MUNDO.
 *
 * El desplazamiento se divide entre el zoom porque se mide en pantalla: un
 * puerto que se aleja del borde al acercarse el lienzo se despega de su
 * elemento, y uno que se pega al alejarse se vuelve inagarrable. La distancia
 * que ve el ojo es constante.
 */
export function portsOf(el: CanvasElement, zoom: number): PortPoint[] {
  const b = bounds(el)
  const g = PORT_GAP_PX / zoom
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  return [
    { id: 'n', x: cx, y: b.y - g },
    { id: 'e', x: b.x + b.width + g, y: cy },
    { id: 's', x: cx, y: b.y + b.height + g },
    { id: 'w', x: b.x - g, y: cy },
  ]
}

/** Que puerto hay bajo el punto, si alguno. */
export function portAt(
  el: CanvasElement, p: { x: number; y: number }, zoom: number, coarse = false,
): PortPoint | null {
  const r = (coarse ? GRAB_PX_TOUCH : GRAB_PX) / zoom
  for (const port of portsOf(el, zoom)) {
    if (Math.hypot(p.x - port.x, p.y - port.y) <= r) return port
  }
  return null
}

/**
 * Que elementos ACEPTAN puertos.
 *
 * Un conector no se conecta a otro conector, y la tinta no tiene lados: pintar
 * puertos sobre un garabato promete algo que el modelo no puede cumplir.
 */
export function aceptaPuertos(el: CanvasElement): boolean {
  return el.type === 'shape' || el.type === 'frame' || el.type === 'image'
      || el.type === 'table' || el.type === 'code' || el.type === 'text'
}

/**
 * ¿Esta el puntero en la zona viva del elemento? (contorno de hover y puerto vivo)
 *
 * Desde el 5 oct 2026 los puertos solo los ofrece el elemento seleccionado. Pintarlos siempre llenaria el lienzo de puntos
 * flotantes; pintarlos solo con el cursor EXACTAMENTE encima los haria
 * parpadear al cruzar el borde. La zona viva es el elemento mas el aire donde
 * viven los puertos.
 */
export function cercaDe(el: CanvasElement, p: { x: number; y: number }, zoom: number): boolean {
  const b = bounds(el)
  const m = (PORT_GAP_PX + PORT_R_PX * 2) / zoom
  return p.x >= b.x - m && p.x <= b.x + b.width + m
      && p.y >= b.y - m && p.y <= b.y + b.height + m
}
