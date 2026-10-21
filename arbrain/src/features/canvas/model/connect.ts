/**
 * Canvas v4 — conectores entre elementos.
 *
 * LA REGLA: un conector guarda A QUIEN une, jamas por donde pasa. La ruta se
 * RECALCULA cada vez que alguno de sus extremos se mueve.
 *
 * Guardar la ruta y no recalcularla es lo que produce flechas que quedan
 * flotando en el aire despues de mover una tarjeta — el sintoma clasico de un
 * diagrama que se degrada con el uso. Aqui el conector es una RELACION, y su
 * dibujo es una consecuencia.
 */

import type { CanvasElement, ConnectorElement } from './element'
import { bounds } from './element'
import { routeOrthogonal, anchorOn, pegarALosBordes, ladoMasCercano, type Obstacle, type Lado } from '../layout/route'

let contador = 0

export function createConnector(
  fromId: string, toId: string, zIndex = -1,
  anclaje?: { fromPort?: Lado; toPort?: Lado },
): ConnectorElement {
  return {
    id: `conn-${Date.now().toString(36)}-${(contador++).toString(36)}`,
    type: 'connector', fromId, toId, points: [], arrowEnd: true,
    ...(anclaje?.fromPort ? { fromPort: anclaje.fromPort } : {}),
    ...(anclaje?.toPort ? { toPort: anclaje.toPort } : {}),
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    // Debajo de las cajas: una flecha por encima de una tarjeta se lee como
    // error aunque la geometria sea correcta.
    zIndex, opacity: 1, locked: false,
    version: 1, createdAt: Date.now(), updatedAt: Date.now(),
  }
}

const centro = (o: Obstacle) => ({ x: o.x + o.width / 2, y: o.y + o.height / 2 })

const comoObstaculo = (el: CanvasElement): Obstacle => {
  const b = bounds(el)
  return { id: el.id, x: b.x, y: b.y, width: b.width, height: b.height }
}

/**
 * Recalcula la ruta de un conector contra el estado actual del lienzo.
 *
 * Intenta esquivar obstaculos; si no hay corredor, cae a la recta entre puertos
 * en vez de devolver nada. Un conector sin ruta desaparece, y desaparecer es
 * peor que verse cruzando algo: al menos la linea fea dice que la relacion
 * existe.
 */
export function routeConnector(
  conn: ConnectorElement, elements: CanvasElement[],
): ConnectorElement {
  const from = elements.find(e => e.id === conn.fromId)
  const to = elements.find(e => e.id === conn.toId)
  if (!from || !to) return { ...conn, points: [] }

  const a = comoObstaculo(from)
  const b = comoObstaculo(to)
  // Los conectores y la tinta no son obstaculos: rodearlos no aporta nada y
  // encarece el ruteo sin mejorar el dibujo.
  const obstaculos = elements
    .filter(e => e.type !== 'connector' && e.type !== 'ink' && e.type !== 'frame')
    .map(comoObstaculo)

  // CODOS A MANO: si la mano ya decidio por donde pasa, el router no reescribe
  // su decision. Solo re-pega los extremos a sus cajas, que es lo unico que un
  // conector promete mantener.
  // El ANCLAJE de la mano manda sobre todo lo demas, incluidos los codos.
  const ladoA = conn.fromPort as Lado | undefined
  const ladoB = conn.toPort as Lado | undefined

  if (conn.waypoints?.length) {
    const desde = anchorOn(a, conn.waypoints[0], 0, ladoA)
    const hasta = anchorOn(b, conn.waypoints[conn.waypoints.length - 1], 0, ladoB)
    return { ...conn, points: [desde, ...conn.waypoints, hasta] }
  }

  // RECTA y CURVA no necesitan router: van de puerto a puerto. La curva se
  // dibuja curva en el motor; su ruta sigue siendo los dos extremos, porque
  // guardar los puntos de una bezier haria que el hit-test tuviera que
  // reconstruirla y ahi es donde nacen las divergencias.
  if (conn.routing === 'recta' || conn.routing === 'curva') {
    return { ...conn, points: [anchorOn(a, centro(b), 0, ladoA), anchorOn(b, centro(a), 0, ladoB)] }
  }

  for (const clearance of [14, 8, 4]) {
    const ruta = routeOrthogonal(a, b, obstaculos, { clearance })
    if (ruta) return { ...conn, points: pegarALosBordes(ruta, a, b, ladoA, ladoB), updatedAt: Date.now() }
  }

  const desde = anchorOn(a, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 6, ladoA)
  const hasta = anchorOn(b, { x: a.x + a.width / 2, y: a.y + a.height / 2 }, 6, ladoB)
  return { ...conn, points: [desde, hasta], updatedAt: Date.now() }
}

/**
 * Re-rutea SOLO los conectores tocados por los elementos que se movieron.
 *
 * Recalcular todos en cada frame de arrastre es caro y no hace falta: mover una
 * tarjeta solo afecta a sus propias flechas. La excepcion es el ruteo por
 * obstaculos —una tarjeta movida puede estorbar a una flecha ajena— pero eso se
 * corrige al soltar, no en cada frame: re-rutear todo mientras se arrastra hace
 * que las flechas lejanas salten sin motivo aparente.
 */
export function reroute(
  elements: CanvasElement[], movidos: ReadonlySet<string>,
): CanvasElement[] {
  return elements.map(el => {
    if (el.type !== 'connector') return el
    if (!movidos.has(el.fromId) && !movidos.has(el.toId)) return el
    if (viajaRigido(el, movidos)) return el
    return routeConnector(el, elements)
  })
}

/**
 * Un conector que viaja CON sus dos extremos (los tres en el conjunto movido) ya fue trasladado tal cual: volver a
 * rutearlo solo lo deforma (mover todo el lienzo dejaba flechas diagonales).
 */
export function viajaRigido(el: CanvasElement, movidos: ReadonlySet<string>): boolean {
  return el.type === 'connector' && movidos.has(el.id) && movidos.has(el.fromId) && movidos.has(el.toId)
}

/** Re-rutea TODO. Se usa al soltar, cuando ya se sabe la posicion final. */
export function rerouteAll(elements: CanvasElement[], rigidos?: ReadonlySet<string>): CanvasElement[] {
  return elements.map(el => (el.type === 'connector' && !(rigidos && viajaRigido(el, rigidos)) ? routeConnector(el, elements) : el))
}

/** Conectores que apuntan a algo que ya no existe. Se borran con su extremo. */
export function connectorsHuerfanos(elements: CanvasElement[]): string[] {
  const ids = new Set(elements.map(e => e.id))
  return elements
    .filter(e => e.type === 'connector' && (!ids.has(e.fromId) || !ids.has(e.toId)))
    .map(e => e.id)
}


/**
 * De que lado de un elemento cae un punto. La usa la pagina para recordar por
 * donde se solto una flecha sobre su destino.
 */
export function ladoDeConexion(el: CanvasElement, punto: { x: number; y: number }): Lado {
  return ladoMasCercano(comoObstaculo(el), punto)
}
