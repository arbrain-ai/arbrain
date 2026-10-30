/**
 * Canvas v4 — el modelo de elementos.
 *
 * DOS CAPAS SOBRE UN SOLO DOCUMENTO:
 *
 *   SEMANTICA (opcional, por region)  ← el agente escribe aqui
 *        ↓ el compilador
 *   GEOMETRIA (siempre)               ← la mano de Daniel escribe aqui
 *
 * Un elemento con `origin` fue producido por el compilador a partir de un nodo
 * del spec. Sin `origin`, es libre: lo puso una mano.
 *
 * La procedencia es POR ELEMENTO, no una particion geometrica del lienzo.
 * Modelar regiones como rectangulos seria fragil: Daniel dibuja encima, cruza
 * limites, y las regiones no son rectangulares.
 */

import type { Role, EdgeKind } from '../theme/tokens'
import type { TextStyle } from '../text/types'
import type { Nervio } from './nervio'

export type ElementId = string

/** De donde salio un elemento compilado, y si la mano ya lo toco. */
export interface Origin {
  regionId: string
  /** Que nodo del spec lo materializa. Es la llave de la reconciliacion:
   *  al recompilar, el elemento con el mismo nodeId se ACTUALIZA, no se
   *  destruye y recrea. Sin esto, recompilar tirarìa el trabajo humano. */
  nodeId?: string
  /**
   * FIJADO. Cuando Daniel mueve, redimensiona o edita un elemento compilado,
   * este flag se enciende SOLO y el compilador deja de mandarlo — pero lo sigue
   * tratando como obstaculo vivo para todo lo demas.
   *
   * Ni rechazar la edicion (violaria la manipulacion directa de un whiteboard)
   * ni desprenderlo del modelo (el compilador lo perderia de vista y repintaria
   * encima). Fijar es la tercera via.
   */
  pinned?: boolean
}

interface Base {
  id: ElementId
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  opacity: number
  locked: boolean
  /**
   * ENLACE. Cualquier elemento puede apuntar a algo fuera del lienzo.
   *
   * Vive en `Base` y no solo en las figuras porque el gesto es el mismo para
   * una imagen, una tabla o un titulo: el lienzo es un mapa y sus piezas
   * llevan a sitios. El motor pinta una marca discreta cuando existe, para que
   * un enlace no sea invisible hasta que alguien lo descubra por accidente.
   */
  link?: string
  /**
   * NERVIO (14 oct 2026, model/nervio.ts). El nodo conectado a la cosa real: un medio que se reproduce en el lienzo,
   * la vista previa de su enlace y un estado vivo (cron, contador) que el lienzo consulta con costo bajo. Lo declara
   * el agente; la mano no lo edita. Llega de la nube sin validar: leerlo SIEMPRE con `leerNervio`.
   */
  nervio?: Nervio
  /** Ausente = elemento libre, puesto por una mano. */
  origin?: Origin
  /**
   * A que GRUPO pertenece, si a alguno.
   *
   * Un campo en los miembros, no un elemento contenedor aparte. El v3 modelo el
   * grupo como un elemento con `childIds`, y eso obliga a mantener DOS verdades
   * sincronizadas (la lista del padre y la pertenencia del hijo) — que es
   * exactamente el patron que ya rompio su `frame`: el contenedor decia tener
   * hijos que no se movian con el. Con la pertenencia en el miembro solo hay
   * una verdad y no puede desincronizarse.
   */
  groupId?: string
  /**
   * QUIEN lo puso, si lo puso una mano en la pizarra (`'humano'`, ver model/autoria.ts). Ausente en lo
   * compilado, en lo generado y en lo que existia antes del 2 oct 2026. sfmap lo conserva (guarda el
   * crudo de cada elemento).
   */
  autor?: string
  /** Version por elemento, para concurrencia optimista. */
  version: number
  createdAt: number
  updatedAt: number
}

/**
 * Color elegido A MANO. Es la UNICA forma de que un literal gane sobre el rol.
 * `explicit` no es decorativo: sin esa marca, el proximo cambio de tema no
 * sabria distinguir "lo eligio Daniel" de "quedo horneado por accidente" — que
 * es exactamente como el v3 rompio su propio soporte de temas.
 */
export interface ColorOverride {
  fill?: string
  stroke?: string
  text?: string
  /**
   * RESALTADO del texto: una banda de color detras de los renglones.
   *
   * No es `fill`. El relleno es de la FIGURA; esto es del texto, y en una
   * figura sin relleno (una llamada, un titulo suelto) es lo unico que puede
   * destacar una frase. Miro los tiene como dos botones distintos por la misma
   * razon: pintan cosas distintas.
   */
  highlight?: string
  explicit: true
}

/** Estilo de linea. El mismo vocabulario que ya hablan los roles y los bordes. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

/**
 * TRAZO elegido A MANO.
 *
 * Hermano de `ColorOverride`, y por el mismo motivo: el ROL decide el grosor,
 * el estilo y el redondeo de cada figura, y esto es la unica puerta para que la
 * mano gane. Cada campo AUSENTE sigue mandandolo el rol — asi un cambio de tema
 * o de rol repinta lo que nadie toco, y respeta lo que si.
 *
 * Sin la marca `explicit` no se podria distinguir "lo eligio Daniel" de "quedo
 * horneado por accidente", que es exactamente como el v3 rompio sus temas.
 */
export interface TrazoOverride {
  style?: StrokeStyle
  /** Grosor en px de MUNDO (escala con el zoom, como el resto del dibujo). */
  width?: number
  /** Radio de esquina en px. 0 = esquinas vivas. Solo lo usan las figuras que
   *  tienen esquinas: un ovalo o una estrella lo ignoran. */
  radius?: number
  explicit: true
}

export type ShapeKind =
  | 'rect' | 'ellipse' | 'diamond' | 'triangle'
  | 'star' | 'pill' | 'hexagon' | 'arrow'

export interface ShapeElement extends Base {
  type: 'shape'
  shape: ShapeKind
  /** El ROL manda sobre el color. */
  role: Role
  color?: ColorOverride
  /** El ROL manda sobre el trazo. */
  trazo?: TrazoOverride
  /** Texto ligado, ya compuesto: el motor NO vuelve a decidir donde va. */
  text?: BoundText[]
  /**
   * ALINEACION HORIZONTAL del texto ligado.
   *
   * Ausente = centrado, que es lo que una figura rotulada quiere el 90% de las
   * veces. Vive aqui y no en `BoundText` porque es una decision de la FIGURA:
   * alinear a la izquierda el titulo y al centro el pie seria un accidente, no
   * una intencion.
   */
  textAlign?: 'left' | 'center' | 'right'
}

/** Un pedazo de texto ya posicionado por el compilador, relativo al elemento. */
export interface BoundText {
  kind: 'title' | 'item' | 'caption' | 'chip'
  text: string
  /** Lineas ya cortadas por el compilador. El motor NO vuelve a cortar. */
  lines: string[]
  x: number
  y: number
  width: number
  height: number
  style: TextStyle
}

export interface TextElement extends Base {
  type: 'text'
  text: string
  /** Lineas ya cortadas. Si falta, se pinta en una sola. */
  lines?: string[]
  style: TextStyle
  align: 'left' | 'center' | 'right'
  color?: ColorOverride
}

export interface StrokePoint { x: number; y: number; pressure: number }

export interface InkElement extends Base {
  type: 'ink'
  /** Puntos RELATIVOS al origen del elemento. El ingest normaliza los
   *  absolutos: el v3 aceptaba ambos y dejaba bounding boxes gigantes. */
  points: StrokePoint[]
  /**
   * Color ELEGIDO A MANO. Ausente = la tinta del tema.
   *
   * Fue literal y obligatorio hasta el 19 ago 2026, y produjo exactamente el
   * fallo que la doctrina "el color es un ROL" existe para impedir: se guardaba
   * el color del tema ACTIVO al dibujar, asi que un trazo hecho en claro
   * quedaba casi negro y al pasar a oscuro DESAPARECIA. Se vio en una captura;
   * ninguna metrica geometrica podia verlo, porque el modelo estaba bien y lo
   * que fallaba era el significado del dato.
   */
  color?: string
  size: number
  /** El marcador pinta translucido y por debajo del resto de la tinta. */
  highlighter: boolean
}

/**
 * Que se dibuja en la punta de un conector.
 *
 * Seis, no dos, porque una flecha no siempre significa "va hacia alla": un
 * rombo dice composicion, un circulo dice contacto, una barra dice tope. En un
 * diagrama de sistemas esa diferencia es la mitad del significado.
 */
export type Arrowhead = 'ninguna' | 'flecha' | 'triangulo' | 'rombo' | 'circulo' | 'barra'

/** Como viaja la linea entre sus dos extremos. */
export type Routing = 'ortogonal' | 'recta' | 'curva'

export interface ConnectorElement extends Base {
  type: 'connector'
  fromId: ElementId
  toId: ElementId
  /** Ruta en coordenadas de MUNDO, ya calculada por el router. */
  points: Array<{ x: number; y: number }>
  label?: string
  arrowEnd: boolean
  /** Punta del extremo final. Ausente = `flecha`, por compatibilidad. */
  headEnd?: Arrowhead
  /** Punta del extremo inicial. Ausente = ninguna. */
  headStart?: Arrowhead
  /** Ausente = `ortogonal`. */
  routing?: Routing
  /**
   * Codos puestos A MANO.
   *
   * Cuando existen, el router los RESPETA en vez de recalcular la ruta entera:
   * si la mano decidio por donde pasa una linea, recalcularla en el siguiente
   * movimiento seria borrar esa decision. Los extremos si se siguen pegando a
   * sus cajas — eso es lo que un conector promete.
   */
  waypoints?: Array<{ x: number; y: number }>
  /** Clase de relacion. Ausente = `flujo`. Solo la ponen los compilados: lo que
   *  dibuja la mano se pinta con el trazo de la mano, no con un codigo. */
  kind?: EdgeKind
  /**
   * ANCLAJE FIJO: por que lado sale y por que lado entra.
   *
   * Lo pone la MANO al conectar, nunca el compilador. Petición de Daniel:
   *
   *   *"la flecha, si la conecté del lado izquierdo, por más que mueva el
   *   componente al que se conectó, no se cambia de lugar. Siempre se va a
   *   quedar en el lugar donde se conectó."*
   *
   * Ausente = el router elige el lado dominante en cada movimiento, que es lo
   * correcto para un diagrama generado (ahi nadie eligio un lado). Presente =
   * ese lado manda, porque cambiar una decision de la mano es borrarla.
   */
  fromPort?: 'n' | 'e' | 's' | 'w'
  toPort?: 'n' | 'e' | 's' | 'w'
}

/**
 * El TINTE de una seccion. Es un NOMBRE, no un color.
 *
 * Misma regla que los roles y que la tinta a mano: un literal guardado es un
 * literal que el cambio de tema no puede repintar. `neutro` es el default y no
 * afirma nada; los demas sirven para que el ojo separe territorios de un
 * vistazo sin tener que leer sus titulos.
 */
export type SectionTint = 'neutro' | 'morado' | 'ambar' | 'verde' | 'azul' | 'rosa' | 'rojo'

export interface FrameElement extends Base {
  type: 'frame'
  title: string
  role: 'tray'
  /** Ausente = `neutro`. */
  tint?: SectionTint
  /** El TINTE manda sobre el trazo, salvo que la mano lo pise. */
  trazo?: TrazoOverride
  /**
   * Recortar lo que sobresale de la seccion.
   *
   * Apagado por default: una seccion es un TERRITORIO, y recortar por sorpresa
   * lo que la mano puso a medio salir se lee como que el lienzo se comio algo.
   */
  clip?: boolean
  /**
   * ⚠️ NO HAY `childIds`, y es a proposito.
   *
   * Lo hubo: un array que nacia vacio, nadie leia nunca, y aun asi PARECIA
   * autoritativo. Quien lo viera en el tipo construiria encima de el.
   *
   * Que hay dentro de una seccion se calcula por CONTENCION geometrica en el
   * momento (`hijosDeSeccion`). Una lista que hay que mantener sincronizada
   * con la realidad se desincroniza siempre — es exactamente lo que le paso al
   * `frame` del v3: decia tener hijos que no se movian con el.
   */
}

export interface ImageElement extends Base {
  type: 'image'
  src: string
  naturalWidth: number
  naturalHeight: number
  alt?: string
}

export interface TableElement extends Base {
  type: 'table'
  /** Filas de celdas. La primera es encabezado si `headerRow`. */
  cells: string[][]
  headerRow: boolean
  /**
   * Anchos de columna en px, YA calculados por el compositor midiendo el
   * contenido real.
   *
   * En el v3 estos arrays se escribian en tres sitios distintos y el renderer
   * los IGNORABA por completo, repartiendo el ancho en partes iguales. Datos
   * calculados con esfuerzo que nadie leia. Aqui el motor los usa o no hay
   * ancho que usar.
   */
  colWidths: number[]
  rowHeight: number
  style: TextStyle
}

export interface CodeElement extends Base {
  type: 'code'
  code: string
  language: string
  style: TextStyle
}

export interface EmbedElement extends Base {
  type: 'embed'
  url: string
  /** true mientras el usuario esta interactuando con el contenido de adentro. */
  interactive: boolean
}

export type CanvasElement =
  | ShapeElement | TextElement | InkElement
  | ConnectorElement | FrameElement | ImageElement
  | TableElement | EmbedElement | CodeElement

export interface Camera { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 20

export interface CanvasDocument {
  id: string
  name: string
  elements: CanvasElement[]
  camera: Camera
  /**
   * Los SPECS de las regiones gobernadas viven CON el documento.
   *
   * Sin esto, un agente puede generar un diagrama una vez y NUNCA volver a
   * actualizarlo: la semantica se pierde en cuanto termina la peticion, y lo
   * unico que queda son cajas con coordenadas. La segunda pasada seria
   * "borra todo y vuelve a poner", que es justo lo que hacian los generadores
   * del v3 y por lo que cada iteracion tiraba los ajustes hechos a mano.
   *
   * Con el spec guardado, recompilar es un DIFF contra lo que ya existe.
   */
  regions?: Array<{ id: string; spec: unknown; version: number }>
  version: number
}

/** Caja de un elemento. Para tinta se deriva de los puntos, no se confia en w/h. */
export function bounds(el: CanvasElement): { x: number; y: number; width: number; height: number } {
  if (el.type === 'ink' && el.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of el.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const pad = el.size
    return { x: el.x + minX - pad, y: el.y + minY - pad,
             width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }
  }
  if (el.type === 'connector' && el.points.length > 0) {
    const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y)
    const minX = Math.min(...xs), minY = Math.min(...ys)
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height }
}

/**
 * La caja VISIBLE de un elemento: la suya mas lo que le cuelga por fuera.
 *
 * El pie de una tarjeta vive FUERA de ella (colgando debajo) y las etiquetas
 * pueden desbordarla. `bounds()` devuelve la caja del OBJETO, que es lo correcto
 * para arrastrar y para el hit-test; esto devuelve lo que el OJO ve, que es lo
 * correcto para encuadrar y para exportar.
 *
 * Nacio de un defecto medido el 19 ago: el PNG exportado cortaba el pie de la
 * ultima tarjeta a media frase, porque los limites se calculaban con `bounds()`
 * y el pie no estaba ahi. La imagen exportada es la que se comparte — cortar
 * texto ahi es el peor sitio donde puede pasar.
 */
export function visualBounds(el: CanvasElement): { x: number; y: number; width: number; height: number } {
  const b = bounds(el)
  if (el.type !== 'shape' || !el.text?.length) return b
  let x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height
  for (const t of el.text) {
    x0 = Math.min(x0, el.x + t.x); y0 = Math.min(y0, el.y + t.y)
    x1 = Math.max(x1, el.x + t.x + t.width); y1 = Math.max(y1, el.y + t.y + t.height)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** ¿La mano ya tomo posesion de este elemento compilado? */
export const isPinned = (el: CanvasElement): boolean => el.origin?.pinned === true

/** ¿Lo puso el compilador? */
export const isCompiled = (el: CanvasElement): boolean => el.origin != null
