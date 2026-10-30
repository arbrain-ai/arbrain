/**
 * Canvas v4 — ACOMODAR: el compilador aplicado a lo que dibujo la mano.
 *
 * Es la unica capacidad de la capa semantica que se puede tocar con el dedo, y
 * existe por una razon concreta: `layout/arrange.ts` (dagre) llevaba construido
 * y AFINADO desde el primer dia, y solo lo alcanzaba el compilador. Un motor de
 * layout que la mano no puede invocar es exactamente el fallo del v3 — ahi el
 * auto-layout tambien existia y los siete generadores calculaban coordenadas a
 * mano porque nadie lo conectaba.
 *
 * QUE HACE: toma las figuras seleccionadas y los conectores que las unen, se
 * los da a dagre, y devuelve las figuras COLOCADAS. No cambia su tamaño, su
 * color ni su texto: solo donde estan.
 *
 * QUE NO HACE, a proposito:
 *   · No toca elementos BLOQUEADOS. Un candado que el acomodo ignora no es un
 *     candado. Y como el resultado depende de ellos, se declara cuantos quedaron
 *     fuera en vez de moverlos en silencio.
 *   · No toca lo que no esta seleccionado. Acomodar todo el lienzo por accidente
 *     es irreversible en la practica, aunque haya deshacer.
 *   · No inventa aristas. Si dos cajas no estan conectadas, dagre las pone en
 *     columnas distintas y eso es informacion honesta, no un error.
 */

import dagre from 'dagre'
import { bounds, visualBounds, type CanvasElement, type ElementId } from './element'

export interface ResultadoAcomodo {
  elementos: CanvasElement[]
  /** Cuantas figuras se movieron. 0 significa que no habia nada que acomodar. */
  movidos: number
  /**
   * Bloqueadas que se respetaron. Se DICE: si no, un acomodo que "no hizo
   * nada" es indistinguible de uno roto.
   */
  bloqueados: number
}

/*
 * ⚠️ AQUI HUBO UN `direccion: 'LR' | 'TB'` que NADIE LEIA — un eco del
 * parametro que ya conoce quien llama. Es el patron exacto que este canvas
 * existe para no repetir (el v3 tenia `rowHeights` escrito en tres sitios y
 * leido en cero), y lo introduje yo mismo el mismo dia que escribi la regla.
 * Un campo devuelto sin consumidor no es inofensivo: parece autoritativo y
 * alguien construye encima.
 */

/** Un elemento puede ser NODO del grafo si ocupa espacio y no es una linea. */
function esNodo(el: CanvasElement): boolean {
  return el.type === 'shape' || el.type === 'image' || el.type === 'table'
      || el.type === 'code' || el.type === 'embed' || el.type === 'text'
}

/**
 * Acomoda la seleccion respetando el centro de masa.
 *
 * El resultado se DESPLAZA para que su centro caiga donde estaba el centro de
 * lo que habia antes. Sin eso, acomodar teletransporta el grupo al origen del
 * mundo y parece que se perdio — el peor resultado posible para un boton que
 * promete ordenar.
 */
export function acomodar(
  elementos: CanvasElement[], seleccion: Set<ElementId>,
  opciones: { direccion?: 'LR' | 'TB' } = {},
): ResultadoAcomodo {
  const dir = opciones.direccion ?? 'LR'
  const sel = elementos.filter(e => seleccion.has(e.id))
  const nodos = sel.filter(e => esNodo(e) && !e.locked)
  const bloqueados = sel.filter(e => esNodo(e) && e.locked).length

  if (nodos.length < 2) {
    return { elementos, movidos: 0, bloqueados }
  }
  const idsNodo = new Set(nodos.map(n => n.id))

  // Las aristas que CUENTAN son las que unen dos nodos de la seleccion. Una
  // flecha que sale hacia afuera no puede influir en un layout que no incluye
  // su destino: meterla haria que dagre reservara un rango para un fantasma.
  const aristas = elementos.filter(e =>
    e.type === 'connector' && idsNodo.has(e.fromId) && idsNodo.has(e.toId))

  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: dir, ranksep: 90, nodesep: 46, edgesep: 16, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodos) {
    // El HUELLA visual, no la caja: la descripcion de una tarjeta cuelga por
    // debajo de su borde y dagre tiene que reservar ese espacio o la fila de
    // abajo se le encima. Es la misma regla que ya rige el compilador.
    const v = visualBounds(n)
    g.setNode(n.id, { width: v.width, height: v.height })
  }
  aristas.forEach((a, i) => {
    if (a.type === 'connector') g.setEdge(a.fromId, a.toId, {}, 'e' + i)
  })
  dagre.layout(g)

  // Centro de masa ANTES, para no teletransportar el grupo.
  const antes = nodos.reduce((acc, n) => {
    const b = bounds(n)
    return { x0: Math.min(acc.x0, b.x), y0: Math.min(acc.y0, b.y),
             x1: Math.max(acc.x1, b.x + b.width), y1: Math.max(acc.y1, b.y + b.height) }
  }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
  const gr = g.graph() as unknown as { width?: number; height?: number }
  const dx = (antes.x0 + antes.x1) / 2 - (gr.width ?? 0) / 2
  const dy = (antes.y0 + antes.y1) / 2 - (gr.height ?? 0) / 2

  const ahora = Date.now()
  let movidos = 0
  const salida = elementos.map(el => {
    if (!idsNodo.has(el.id)) return el
    const d = g.node(el.id) as unknown as { x: number; y: number; width: number; height: number }
    if (!d) return el
    // dagre da el CENTRO; el lienzo trabaja con la esquina. Y el offset de la
    // huella visual se descuenta: si el nodo sobresale por arriba (nada lo hace
    // hoy, pero el modelo lo permite), colocar por la caja lo dejaria corrido.
    const v = visualBounds(el)
    const b = bounds(el)
    const x = Math.round(d.x - d.width / 2 + dx + (b.x - v.x))
    const y = Math.round(d.y - d.height / 2 + dy + (b.y - v.y))
    if (x === el.x && y === el.y) return el
    movidos++
    // Tocar un elemento compilado lo FIJA, igual que arrastrarlo con el dedo:
    // acomodar es la mano moviendolo, aunque lo mueva un algoritmo.
    const origin = el.origin && !el.origin.pinned ? { ...el.origin, pinned: true } : el.origin
    return { ...el, x, y, origin, updatedAt: ahora }
  })

  return { elementos: salida, movidos, bloqueados }
}
