/**
 * Canvas v4 — fabricas de elementos que pone la MANO.
 *
 * Distinto del puente compilador→elementos: eso materializa semantica, esto
 * nace de un gesto. Lo que sale de aqui NO lleva `origin`, y por eso el
 * compilador ni lo mira: es de Daniel, punto.
 *
 * Todo elemento con texto nace con sus LINEAS ya cortadas — el motor no vuelve
 * a decidir donde parte una frase. Es la misma regla que cerro el desajuste
 * modelo↔renderer que pintaba una linea donde el modelo decia dos.
 */

import type { CanvasElement, ShapeElement, ShapeKind, TextElement, ImageElement, TableElement, EmbedElement, CodeElement, FrameElement, BoundText } from './element'
import type { Role } from '../theme/tokens'
import type { MeasureContext, TextStyle } from '../text/types'
import { wrapText, fitText } from '../text/layout'

let contador = 0
const nuevoId = (prefijo: string) => `${prefijo}-${Date.now().toString(36)}-${(contador++).toString(36)}`

const base = (x: number, y: number, width: number, height: number, zIndex: number) => ({
  x, y, width, height, rotation: 0, zIndex, opacity: 1, locked: false,
  version: 1, createdAt: Date.now(), updatedAt: Date.now(),
})

export const STICKY_STYLE: TextStyle = { family: 'montserrat', weight: 500, size: 18 }
export const TEXT_STYLE: TextStyle = { family: 'montserrat', weight: 500, size: 20 }
export const SHAPE_TEXT_STYLE: TextStyle = { family: 'montserrat', weight: 700, size: 20 }

const STICKY_W = 220
const STICKY_H = 160
const PAD = 16

/** Nota adhesiva. El texto se AJUSTA a la nota; una nota no crece sola. */
export function createSticky(
  ctx: MeasureContext, world: { x: number; y: number }, texto: string, zIndex: number,
): ShapeElement {
  const inner = STICKY_W - PAD * 2
  const fit = fitText(ctx, texto, STICKY_STYLE, { maxWidth: inner, maxHeight: STICKY_H - PAD * 2 })
  const bound: BoundText = {
    kind: 'title', text: texto, lines: fit.lines.map(l => l.text),
    x: PAD, y: PAD, width: inner, height: fit.height,
    style: { ...STICKY_STYLE, size: fit.size },
  }
  return {
    id: nuevoId('sticky'), type: 'shape', shape: 'rect', role: 'sticky',
    ...base(world.x - STICKY_W / 2, world.y - STICKY_H / 2, STICKY_W, STICKY_H, zIndex),
    text: [bound],
  }
}

/**
 * Bloque de texto libre. Al reves que la nota: la caja se ajusta AL TEXTO.
 *
 * `maxWidth` es la COLUMNA que el usuario dibujo al arrastrar. La primera
 * version ignoraba el arrastre y siempre media el texto contra 520px, asi que
 * una caja dibujada de 690px de ancho nacia de 125 y partia la frase en cuatro
 * renglones de dos palabras. En un lienzo, el ancho del arrastre ES la
 * instruccion; descartarlo obliga a redimensionar a mano lo que ya se dijo.
 */
export function createText(
  ctx: MeasureContext, world: { x: number; y: number }, texto: string, zIndex: number,
  maxWidth?: number,
): TextElement {
  const columna = Math.max(40, maxWidth ?? 520)
  const laid = wrapText(ctx, texto, TEXT_STYLE, { maxWidth: columna })
  return {
    id: nuevoId('text'), type: 'text',
    // El ancho lo manda la COLUMNA pedida, no lo que midio el texto: si nace
    // con el ancho de la frase, el siguiente re-layout la vuelve a partir ahi.
    ...base(world.x, world.y,
            maxWidth ? Math.ceil(columna) : Math.max(40, Math.ceil(laid.width)),
            Math.ceil(laid.height), zIndex),
    text: texto, lines: laid.lines.map(l => l.text), style: TEXT_STYLE, align: 'left',
  }
}

/** Figura dibujada arrastrando. Con texto opcional, ajustado a su interior. */
export function createShape(
  ctx: MeasureContext,
  shape: ShapeKind,
  box: { x: number; y: number; width: number; height: number },
  zIndex: number,
  texto = '',
  role: Role = 'drawn',
): ShapeElement {
  const el: ShapeElement = {
    id: nuevoId(shape), type: 'shape', shape,
    role, ...base(box.x, box.y, box.width, box.height, zIndex), text: [],
  }
  if (texto) el.text = [boundTextFor(ctx, el, texto)]
  return el
}

/* ────────────────────────────────────────────────────────────────────────────
 * DONDE NACE LA FIGURA QUE SALE DE UN PUERTO
 *
 * Estas dos funciones existen para que el FANTASMA que se ve mientras arrastras
 * y la figura que aparece al soltar salgan del MISMO calculo. Escribirlo dos
 * veces —una en el preview, otra en la creacion— es como el v3 acabo con la
 * geometria de las figuras en tres archivos ya divergidos: el fantasma
 * prometeria un sitio y la figura apareceria en otro, que es peor que no tener
 * fantasma.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Separacion estandar entre dos piezas encadenadas. Cabe una flecha legible. */
export const SALTO = 90

/**
 * Caja centrada en el punto donde soltaste, del tamaño del origen.
 *
 * IMANTADA a la fila y la columna del origen: si sueltas casi alineado, queda
 * EXACTAMENTE alineado. Es lo que hace que una cadena hecha a pulso salga
 * recta sin que nadie la acomode despues — y la tolerancia se mide en px de
 * MUNDO, asi que no cambia con el zoom.
 */
export function cajaFantasma(
  origen: { x: number; y: number; width: number; height: number },
  punto: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  const w = Math.max(80, origen.width)
  const h = Math.max(56, origen.height)
  const cxOrigen = origen.x + origen.width / 2
  const cyOrigen = origen.y + origen.height / 2
  const IMAN = 28
  const cx = Math.abs(punto.x - cxOrigen) < IMAN ? cxOrigen : punto.x
  const cy = Math.abs(punto.y - cyOrigen) < IMAN ? cyOrigen : punto.y
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

/**
 * Caja a un salto estandar en la direccion de un puerto.
 *
 * Es el gesto de CLIC (sin arrastrar). Sale perfectamente alineada por
 * construccion, que es justo lo que se quiere cuando no apuntaste a ningun
 * sitio: si no dijiste donde, el sistema pone el sitio correcto.
 */
export function cajaEnDireccion(
  origen: { x: number; y: number; width: number; height: number },
  puerto: 'n' | 'e' | 's' | 'w' | null,
): { x: number; y: number; width: number; height: number } {
  const w = Math.max(80, origen.width)
  const h = Math.max(56, origen.height)
  const cx = origen.x + origen.width / 2
  const cy = origen.y + origen.height / 2
  // Sin puerto (el gesto vino de la herramienta de conector, no de un lado) el
  // default es a la derecha: es la direccion en la que se lee.
  switch (puerto ?? 'e') {
    case 'n': return { x: cx - w / 2, y: origen.y - SALTO - h, width: w, height: h }
    case 's': return { x: cx - w / 2, y: origen.y + origen.height + SALTO, width: w, height: h }
    case 'w': return { x: origen.x - SALTO - w, y: cy - h / 2, width: w, height: h }
    default:  return { x: origen.x + origen.width + SALTO, y: cy - h / 2, width: w, height: h }
  }
}

/**
 * Seccion: un territorio con titulo que agrupa lo que cae dentro.
 *
 * Va al FONDO (z negativo) siempre. Una seccion que se pinta encima de su
 * contenido lo tapa, y una que compite en z con el contenido se lleva los
 * clicks que iban a las tarjetas de adentro.
 */
export function createSection(
  box: { x: number; y: number; width: number; height: number },
  titulo = 'Sección',
): FrameElement {
  return {
    id: nuevoId('section'), type: 'frame', title: titulo, role: 'tray',
    ...base(box.x, box.y, Math.max(160, box.width), Math.max(120, box.height), -100),
  }
}

/**
 * Que elementos caen DENTRO de una seccion, por contencion geometrica.
 *
 * Se calcula, no se mantiene a mano: una lista de hijos que hay que sincronizar
 * con la realidad se desincroniza siempre. Al mover la seccion se recalcula y
 * se arrastra lo que este adentro en ese momento.
 */
export function hijosDeSeccion(seccion: FrameElement, elementos: CanvasElement[]): string[] {
  const dentro = (e: CanvasElement) => {
    if (e.id === seccion.id || e.type === 'frame') return false
    const cx = e.x + e.width / 2, cy = e.y + e.height / 2
    // Por el CENTRO, no por contencion total: si se exigiera que quepa entero,
    // una tarjeta que asoma un pixel dejaria de pertenecer a su seccion.
    return cx >= seccion.x && cx <= seccion.x + seccion.width
        && cy >= seccion.y && cy <= seccion.y + seccion.height
  }
  return elementos.filter(dentro).map(e => e.id)
}

/**
 * Texto centrado dentro de una figura, ajustado a su interior.
 *
 * `fitText` devuelve `overflows` cuando ni al tamaño minimo cupo, y ese dato
 * NO se traga: el juez lo reporta. El v3 recortaba en silencio con ctx.clip() y
 * el contenido desaparecia sin que nadie se enterara.
 */
export function boundTextFor(ctx: MeasureContext, el: ShapeElement, texto: string): BoundText {
  const inner = Math.max(20, el.width - PAD * 2)
  const fit = fitText(ctx, texto, SHAPE_TEXT_STYLE, {
    maxWidth: inner, maxHeight: Math.max(20, el.height - PAD * 2), minSize: 11,
  })
  return {
    kind: 'title', text: texto, lines: fit.lines.map(l => l.text),
    x: PAD, y: Math.max(PAD, (el.height - fit.height) / 2),
    width: inner, height: fit.height,
    style: { ...SHAPE_TEXT_STYLE, size: fit.size },
  }
}

/**
 * Re-ajusta el texto ligado tras un cambio de tamaño, de fuente o de contenido.
 *
 * ⚠️ LA VERSION ANTERIOR DESTRUIA DATOS. Hacia esto:
 *
 *     const texto = el.text[0].text
 *     return { ...el, text: [boundTextFor(ctx, el, texto)] }
 *
 * Es decir: tomaba la PRIMERA parte y tiraba TODAS las demas. Una tarjeta
 * compilada tiene titulo, renglones, pie y etiquetas; redimensionarla la
 * dejaba con el titulo y nada mas, sin aviso y sin vuelta atras. Medido el
 * 19 ago 2026: `demo:lt` perdio sus dos renglones, su pie y su etiqueta al
 * primer cambio de tipografia — y el mismo camino corre al redimensionar.
 *
 * Ahora cada parte se re-maqueta CONSERVANDO su clase, y la pila se recompone
 * en el mismo orden que la construyo el compositor. Una sola parte de titulo
 * (el caso de una figura dibujada a mano y rotulada) sigue centrandose.
 */
export function relayoutBoundText(ctx: MeasureContext, el: CanvasElement): CanvasElement {
  if (el.type === 'shape' && el.text?.length) {
    const partes = el.text
    // Caso simple: figura de la mano con un solo rotulo. Se centra en la caja.
    if (partes.length === 1 && partes[0].kind === 'title') {
      const solo = partes[0]
      const ajustado = boundTextFor(ctx, el, solo.text)
      // Se respeta el estilo que la mano eligio; boundTextFor solo decide el
      // tamaño que CABE, no la familia ni el peso.
      return { ...el, updatedAt: Date.now(), text: [{
        ...ajustado, style: { ...solo.style, size: ajustado.style.size },
      }] }
    }
    return { ...el, updatedAt: Date.now(), text: recomponerPartes(ctx, el, partes) }
  }
  if (el.type === 'text') {
    const laid = wrapText(ctx, el.text, el.style, { maxWidth: Math.max(40, el.width) })
    return { ...el, lines: laid.lines.map(l => l.text), height: Math.ceil(laid.height), updatedAt: Date.now() }
  }
  return el
}

/**
 * Re-apila las partes de una tarjeta compuesta dentro (y debajo) de su caja.
 *
 * El orden es el del compositor: titulo y renglones DENTRO, con el mismo
 * relleno; las etiquetas ancladas abajo a la derecha; el pie FUERA, colgando.
 * No se inventa layout: se conserva el que ya existia y solo se recalcula lo
 * que el cambio de ancho o de fuente pudo mover.
 */
function recomponerPartes(ctx: MeasureContext, el: ShapeElement, partes: BoundText[]): BoundText[] {
  const inner = Math.max(20, el.width - PAD * 2)
  const out: BoundText[] = []
  let y = PAD

  for (const parte of partes.filter(p => p.kind === 'title' || p.kind === 'item')) {
    const laid = wrapText(ctx, parte.text, parte.style, { maxWidth: inner })
    out.push({ ...parte, x: PAD, y, width: inner, height: Math.ceil(laid.height),
               lines: laid.lines.map(l => l.text) })
    y += Math.ceil(laid.height) + (parte.kind === 'title' ? 8 : 4)
  }

  for (const chip of partes.filter(p => p.kind === 'chip')) {
    // La etiqueta no envuelve: es corta por definicion. Se ancla abajo a la
    // derecha, que es donde el estandar visual la pone.
    const w = Math.ceil(ctx.measure(chip.text, chip.style)) + 16
    const h = Math.ceil(ctx.vertical(chip.style).naturalLineHeight) + 4
    out.push({ ...chip, x: Math.max(PAD, el.width - PAD - w), y: el.height - PAD - h,
               width: w, height: h, lines: [chip.text] })
  }

  for (const pie of partes.filter(p => p.kind === 'caption')) {
    // El pie envuelve al ancho de SU tarjeta, con el mismo piso que usa el
    // compilador: mas angosto que eso produce una palabra por renglon.
    const ancho = Math.max(220, el.width)
    const laid = wrapText(ctx, pie.text, pie.style, { maxWidth: ancho })
    out.push({ ...pie, x: 0, y: el.height + 10, width: ancho,
               height: Math.ceil(laid.height), lines: laid.lines.map(l => l.text) })
  }
  return out
}

const IMG_MAX = 520

/**
 * Imagen. Su caja nace con la PROPORCION real del archivo, acotada a un maximo.
 *
 * Sin esto una captura de 3400px entra ocupando media pantalla del mundo y hay
 * que redimensionarla a mano cada vez — friccion pura para algo que el sistema
 * puede decidir solo.
 */
export function createImage(
  world: { x: number; y: number },
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  zIndex: number,
  alt?: string,
): ImageElement {
  const escala = Math.min(1, IMG_MAX / Math.max(naturalWidth, naturalHeight))
  const w = Math.round(naturalWidth * escala)
  const h = Math.round(naturalHeight * escala)
  return {
    id: nuevoId('img'), type: 'image',
    ...base(world.x - w / 2, world.y - h / 2, w, h, zIndex),
    src, naturalWidth, naturalHeight, alt,
  }
}

/** Lee un archivo a data URL y mide su tamaño natural antes de crear nada. */
export function readImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onerror = () => reject(new Error('no se pudo leer el archivo'))
    lector.onload = () => {
      const src = String(lector.result)
      const img = new Image()
      img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('el archivo no es una imagen valida'))
      img.src = src
    }
    lector.readAsDataURL(file)
  })
}

export const TABLE_STYLE: TextStyle = { family: 'montserrat', weight: 500, size: 15 }
const CELL_PAD = 12
const ROW_H = 38

/**
 * Tabla con anchos de columna MEDIDOS, no repartidos en partes iguales.
 *
 * Una columna de "Sí/No" no necesita el mismo ancho que una de descripciones.
 * Repartir parejo es lo que hace que las tablas generadas se vean amateur.
 */
export function createTable(
  ctx: MeasureContext, world: { x: number; y: number }, cells: string[][], zIndex: number,
): TableElement {
  const cols = Math.max(...cells.map(f => f.length))
  const colWidths: number[] = []
  for (let c = 0; c < cols; c++) {
    let max = 0
    for (const fila of cells) {
      const texto = fila[c] ?? ''
      max = Math.max(max, ctx.measure(texto, TABLE_STYLE))
    }
    // Piso y techo: una columna vacia no colapsa, y una con un parrafo no se
    // come la tabla entera.
    colWidths.push(Math.min(320, Math.max(80, Math.ceil(max) + CELL_PAD * 2)))
  }
  const width = colWidths.reduce((a, b) => a + b, 0)
  const height = cells.length * ROW_H
  return {
    id: nuevoId('table'), type: 'table',
    ...base(world.x - width / 2, world.y - height / 2, width, height, zIndex),
    cells, headerRow: true, colWidths, rowHeight: ROW_H, style: TABLE_STYLE,
  }
}

export function createEmbed(
  world: { x: number; y: number }, url: string, zIndex: number,
): EmbedElement {
  const w = 640, h = 400
  return {
    id: nuevoId('embed'), type: 'embed',
    ...base(world.x - w / 2, world.y - h / 2, w, h, zIndex),
    url, interactive: false,
  }
}

export const CODE_STYLE: TextStyle = { family: 'montserrat', weight: 500, size: 14 }

/**
 * Bloque de codigo. Su caja se dimensiona por la linea MAS LARGA y el numero de
 * lineas: el codigo no se re-envuelve, asi que la caja tiene que caber tal cual
 * o la linea se recorta y dice otra cosa.
 */
export function createCode(
  world: { x: number; y: number }, codigo: string, language: string, zIndex: number,
): CodeElement {
  const lineas = codigo.split('\n')
  const masLarga = Math.max(...lineas.map(l => l.length))
  // Aproximacion monoespaciada: en una fuente mono el ancho por caracter es
  // constante por definicion, asi que contar caracteres SI mide bien aqui.
  const w = Math.min(680, Math.max(240, masLarga * CODE_STYLE.size * 0.6 + 28))
  const h = Math.max(70, lineas.length * CODE_STYLE.size * 1.5 + 28)
  return {
    id: nuevoId('code'), type: 'code',
    ...base(world.x - w / 2, world.y - h / 2, w, h, zIndex),
    code: codigo, language, style: CODE_STYLE,
  }
}


/**
 * ESCRIBIR TEXTO EN UN ELEMENTO. Un solo camino.
 *
 * ⚠️ EXISTE POR UN BUG MEDIDO EL 20 AGO 2026. La logica vivia suelta dentro del
 * callback del editor y decia:
 *
 *     text: el.text?.length ? [{ ...el.text[0], text: texto }] : []
 *
 * Dos perdidas silenciosas en una linea:
 *   1. Si la figura NO tenia parte de texto, lo escrito se DESCARTABA. Crear un
 *      rectangulo, escribir "Videos YT" y dar Enter dejaba la figura vacia, sin
 *      error. Estuvo escondido mientras crear no abria el cursor.
 *   2. Si tenia VARIAS partes (una tarjeta compilada: titulo, renglones, pie,
 *      etiquetas), se quedaba SOLO con la primera. Corregir un titulo borraba
 *      el resto — el mismo fallo que `relayoutBoundText` ya habia tenido.
 *
 * Ahora hay una funcion, la usan todos los que escriben, y esta medida.
 */
export function escribirTexto(
  ctx: MeasureContext, el: CanvasElement, texto: string,
): CanvasElement {
  if (el.type === 'text') return relayoutBoundText(ctx, { ...el, text: texto })
  if (el.type === 'frame') return { ...el, title: texto, updatedAt: Date.now() }
  if (el.type !== 'shape') return el

  // La PRIMERA parte es el titulo: es la que el editor muestra y la que la mano
  // corrige. Las demas se conservan intactas.
  const partes = el.text?.length
    ? [{ ...el.text[0], text: texto }, ...el.text.slice(1)]
    : texto ? [boundTextFor(ctx, el, texto)] : []
  return relayoutBoundText(ctx, { ...el, text: partes, updatedAt: Date.now() })
}
