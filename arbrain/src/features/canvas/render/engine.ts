/**
 * Canvas v4 — el motor de dibujo.
 *
 * Canvas 2D. Una sola pasada, culling por viewport, y CERO decisiones de
 * layout: todo lo que pinta ya viene posicionado. El motor no decide donde va
 * un texto — eso ya lo hizo el compilador o la mano de Daniel.
 *
 * Esa separacion es deliberada. En el v3 el renderer media texto, decidia si
 * cabia, y lo recortaba con ctx.clip() cuando no. El resultado era contenido
 * que desaparecia sin aviso. Aqui el motor no puede recortar en silencio porque
 * no le toca decidir: solo pinta lo que le dan.
 */

import type { CanvasElement, Camera, ShapeElement, InkElement, ConnectorElement, TextElement, FrameElement, ImageElement, TableElement, EmbedElement, CodeElement, BoundText, Arrowhead, ShapeKind } from '../model/element'
import { bounds } from '../model/element'
import type { Theme } from '../theme/tokens'
import { estiloDeRol, resolveFill, resolveStroke, resolveRadius } from '../theme/tokens'
import { cssFont } from '../text/metrics-browser'
import { FAMILIAS_CON_CURSIVA, OBLICUA, type TextStyle } from '../text/types'
import { visibleWorldBounds, type Viewport } from './viewport'
import { drawBackground, type BackgroundKind } from './background'
import { trazarFigura } from './shapes'
import { tokenizar, COLORES } from './code'
import { gruposCompletos } from '../model/group'
import { HANDLES, HANDLE_PX, handleCenter, selectionBounds, rotateCenter } from '../input/handles'
import { portsOf, PORT_R_PX, type PortId } from '../input/ports'
import { centroDe, estaGirado } from '../model/rotate'
import { imagenParaPintar, imageState } from './images'
import { GREEKING_PX, anchoGreeking, enGreeking } from './greeking'
import { ordenPorZ } from '../model/orden'
import { cartuchoDeMarco } from './titulo-marco'
import { pastillasDe, FUENTE_PASTILLA, PASTILLA, type Pastilla } from '../model/enlace'
import { COLOR_SEMAFORO, type VivoNervio } from '../model/nervio'

/**
 * CACHE DE MEDIDAS. `measureText` por renglon en cada cuadro (subrayados, resaltados, las barras del nivel de
 * detalle, las celdas de una tabla) es trabajo que no cambia mientras no cambie el texto ni su fuente. Tope para
 * que un documento enorme no la vuelva una fuga.
 */
const medidas = new Map<string, number>()
function anchoDe(ctx: CanvasRenderingContext2D, texto: string): number {
  const k = ctx.font + '\u0000' + texto
  let w = medidas.get(k)
  if (w === undefined) {
    if (medidas.size > 20000) medidas.clear()
    w = ctx.measureText(texto).width
    medidas.set(k, w)
  }
  return w
}

/** Renglones como líneas grises suaves: el greeking de un texto que ya no se lee (ver greeking.ts). Sin medir glifos. */
function barrasDeTexto(
  ctx: CanvasRenderingContext2D, lineas: readonly string[], ancla: number, yPrimera: number, lineH: number,
  size: number, anchoCaja: number,
): void {
  const alto = Math.max(size * 0.42, 0.5)
  const alinea = ctx.textAlign
  ctx.save()
  ctx.globalAlpha *= 0.3
  ctx.beginPath()
  lineas.forEach((linea, i) => {
    if (!linea.trim()) return
    const w = anchoGreeking(linea, size, anchoCaja)
    const x0 = alinea === 'center' ? ancla - w / 2 : alinea === 'right' ? ancla - w : ancla
    // Centrada en el cuerpo de la x: la base menos medio cuerpo.
    ctx.rect(x0, yPrimera + i * lineH - size * 0.5, w, alto)
  })
  ctx.fill()
  ctx.restore()
}

export interface RenderState {
  elements: CanvasElement[]
  camera: Camera
  theme: Theme
  viewport: Viewport
  selectedIds?: Set<string>
  /** Grupo abierto con doble clic: no se pinta como grupo. */
  grupoAbierto?: string | null
  /** Trazo en curso: se pinta con la MISMA funcion que el ya guardado, o el
   *  preview "salta" al soltar (hecho C2). */
  draft?: InkElement | null
  /** Rectangulo elastico mientras se arrastra una figura nueva. */
  rubber?: { x: number; y: number; width: number; height: number } | null
  /** Fondo del lienzo: liso, puntos o cuadricula. */
  background?: BackgroundKind
  /** Rectangulo de seleccion multiple en curso. */
  marquee?: { x: number; y: number; width: number; height: number } | null
  /** false mientras se dibuja o se crea: las manijas estorban ahi. */
  conManijas?: boolean
  /**
   * Conector en curso: de donde sale, hasta donde va el puntero, y si va a
   * agarrar algo.
   *
   * `fantasma` es la caja de la figura que NACERIA al soltar en el vacio. Es la
   * mitad que faltaba del gesto: sin ella, arrastrar hacia la nada parece un
   * error que se va a descartar, y nadie descubre que ahi se crea algo. Con
   * ella, el gesto se explica solo mientras lo haces.
   */
  conectando?: {
    desde: { x: number; y: number }; hasta: { x: number; y: number }; sobre: boolean
    fantasma?: { x: number; y: number; width: number; height: number; shape: ShapeKind; radius: number } | null
  } | null
  /** Guias de alineacion mientras se arrastra. */
  guias?: Array<{ eje: 'x' | 'y'; valor: number; desde: number; hasta: number }>
  /** Elemento cuyos puertos de conexion se estan ofreciendo, y cual esta bajo
   *  el puntero. El elemento OFRECE el gesto cuando la mano se acerca. */
  puertos?: { elementId: string; activo?: PortId | null } | null
  /** Elemento bajo el puntero, sin seleccionar: solo un contorno sutil. Los puertos esperan al clic. */
  hover?: string | null
  /** Pastillas de enlace ya calculadas a este zoom (model/enlace.ts); sin ellas, el motor las calcula. */
  pastillas?: Pastilla[]
  /** La pastilla bajo el puntero: se pinta en su estado vivo. */
  enlaceVivo?: string | null
  /** Estados y medios de los nodos con nervio (ui/useNervio.ts), para calcular las pastillas si no vienen dadas. */
  vivo?: VivoNervio
}

function applyStroke(ctx: CanvasRenderingContext2D, s: { color: string; width: number; style: string }, zoom: number): void {
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.width
  const u = s.width * 2
  ctx.setLineDash(s.style === 'dashed' ? [u * 2.2, u * 1.4] : s.style === 'dotted' ? [1, u * 1.6] : [])
  ctx.lineCap = s.style === 'dotted' ? 'round' : 'butt'
  void zoom
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, rr)
  else {
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }
}


/**
 * UN renglon, con toda la decoracion que la fuente no trae.
 *
 * Existe porque tres cosas que el ojo llama "tipografia" no viven en el archivo
 * de fuente: la cursiva de las familias sin cara propia (se inclina), el
 * subrayado y el tachado (se dibujan). Si cada sitio que pinta texto las
 * resolviera por su cuenta, divergirian — que es exactamente como el v3 acabo
 * con la geometria escrita tres veces.
 *
 * `x` es el punto de anclaje segun `ctx.textAlign`, `y` la LINEA BASE.
 */
function pintarRenglon(
  ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, style: TextStyle,
): void {
  const inclina = style.italic === true && !FAMILIAS_CON_CURSIVA.has(style.family)
  if (inclina) {
    // Se inclina alrededor de la LINEA BASE, no del origen del lienzo: pivotar
    // en otro punto desplaza el renglon ademas de inclinarlo.
    ctx.save()
    ctx.translate(x, y)
    ctx.transform(1, 0, -OBLICUA, 1, 0, 0)
    ctx.fillText(texto, 0, 0)
    ctx.restore()
  } else {
    ctx.fillText(texto, x, y)
  }

  if (!style.underline && !style.strike) return
  // El ancho se mide con el mismo contexto que acaba de pintar: preguntarle a
  // otro medidor daria una raya que no coincide con su texto.
  const w = anchoDe(ctx, texto)
  const x0 = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' ? x - w : x
  const grosor = Math.max(1, style.size * 0.055)
  ctx.save()
  ctx.fillStyle = ctx.fillStyle
  if (style.underline) ctx.fillRect(x0, y + style.size * 0.14, w, grosor)
  if (style.strike) ctx.fillRect(x0, y - style.size * 0.28, w, grosor)
  ctx.restore()
}

function drawBoundText(ctx: CanvasRenderingContext2D, el: ShapeElement, t: BoundText, theme: Theme, zoom: number): void {
  ctx.save()
  ctx.font = cssFont(t.style)
  ctx.textBaseline = 'alphabetic'
  // 'item' es una CLASE de contenido (un renglon de lista), no un rol de color:
  // visualmente es cuerpo de texto. El mapeo vive aqui y no en el tema, para
  // que la paleta no tenga que conocer las clases de contenido del compositor.
  const textRole = t.kind === 'item' ? 'body' : t.kind
  ctx.fillStyle = el.color?.explicit && el.color.text ? el.color.text : theme.text[textRole]
  if (t.kind === 'chip') {
    ctx.fillStyle = theme.roles.sticky.fill
    roundRect(ctx, el.x + t.x, el.y + t.y, t.width, t.height, 5)
    ctx.fill()
    ctx.fillStyle = theme.text.chip
  }
  // El texto ya viene CORTADO EN LINEAS por el compilador. El motor las pinta,
  // no vuelve a decidir donde parte una frase.
  //
  // Pintar `t.text` de un tiron era un bug real y medido: una caption de 434px
  // declarados salia en una sola linea de 616px y se metia 183px debajo de la
  // tarjeta vecina. La caja media una cosa y el texto otra.
  const lineH = t.height / Math.max(1, t.lines.length)

  /**
   * ALINEACION. El default depende de QUIEN puso el texto:
   *
   *   · compilado (`origin`) → izquierda: el compositor coloca cada parte a
   *     proposito y el estandar visual pide titulos alineados a la izquierda.
   *   · de la mano          → centro: una figura que alguien rotulo quiere su
   *     etiqueta en medio. Es lo que hace Miro y lo que la mano espera.
   *
   * La regla se escribe aqui, en una linea legible, en vez de repartirse entre
   * el compositor y el editor: dos sitios decidiendo lo mismo divergen.
   */
  const alinea = el.textAlign ?? (el.origin ? 'left' : 'center')
  const izq = el.x + t.x + (t.kind === 'chip' ? 8 : 0)
  const ancho = t.width - (t.kind === 'chip' ? 16 : 0)
  const ancla = alinea === 'center' ? izq + ancho / 2 : alinea === 'right' ? izq + ancho : izq
  ctx.textAlign = alinea === 'center' ? 'center' : alinea === 'right' ? 'right' : 'left'

  // RESALTADO: una banda detras de cada renglon, del ancho REAL del renglon.
  // Del ancho de la caja se veria como un segundo relleno; del ancho del texto
  // se lee como un marcador pasado por encima, que es lo que es.
  const resalta = el.color?.explicit ? el.color.highlight : undefined
  if (resalta) {
    ctx.save()
    ctx.fillStyle = resalta
    t.lines.forEach((linea, i) => {
      const w = anchoDe(ctx, linea)
      const x0 = alinea === 'center' ? ancla - w / 2 : alinea === 'right' ? ancla - w : ancla
      const yBase = el.y + t.y + i * lineH + t.style.size * 0.82
      ctx.fillRect(x0 - 3, yBase - t.style.size * 0.86, w + 6, t.style.size * 1.16)
    })
    ctx.restore()
  }

  if (enGreeking(t.style.size, zoom)) barrasDeTexto(ctx, t.lines, ancla, el.y + t.y + t.style.size * 0.82, lineH, t.style.size, ancho)
  else t.lines.forEach((linea, i) => {
    pintarRenglon(ctx, linea, ancla, el.y + t.y + i * lineH + t.style.size * 0.82, t.style)
  })
  ctx.restore()
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement, theme: Theme, zoom: number): void {
  const fill = resolveFill(theme, el.role, el.color)
  const stroke = resolveStroke(theme, el.role, el.color, el.trazo)
  const radio = resolveRadius(theme, el.role, el.trazo)
  const style = estiloDeRol(theme, el.role)

  ctx.save()
  if (style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 3
  }
  ctx.fillStyle = fill
  // UNA sola funcion traza todas las figuras — la misma que usa el hit-test.
  trazarFigura(ctx, el.shape, el, radio)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  // Un grosor 0 es una eleccion valida: figura sin contorno. `ctx.stroke()` con
  // lineWidth 0 no pinta nada en algunos motores y una linea de 1px en otros,
  // asi que se decide aqui en vez de dejarlo al navegador.
  if (stroke.width > 0) {
    applyStroke(ctx, stroke, zoom)
    ctx.stroke()
  }
  ctx.restore()

  for (const t of el.text ?? []) drawBoundText(ctx, el, t, theme, zoom)
}

/**
 * LA PASTILLA DEL ENLACE (8 oct 2026, model/enlace.ts). Reemplaza al círculo morado de tamaño fijo, que al alejar se
 * comía las tarjetas y no decía a dónde llevaba. Tamaño de pantalla como el chrome, dentro de la esquina de su tarjeta
 * y solo si cabe; el estilo es el de las pastillas de la vista Salud: borde fino, texto tenue y, al pasar, el morado.
 */
function drawPastilla(ctx: CanvasRenderingContext2D, p: Pastilla, theme: Theme, zoom: number, viva: boolean): void {
  const k = 1 / zoom
  const oscuro = theme.name === 'oscuro'
  ctx.save()
  ctx.globalAlpha = 1
  roundRect(ctx, p.x, p.y, p.width, p.height, p.height / 2)
  ctx.shadowColor = oscuro ? 'rgba(0,0,0,0.45)' : 'rgba(39,18,62,0.12)'
  ctx.shadowBlur = (viva ? 10 : 6) * k
  ctx.shadowOffsetY = 1 * k
  ctx.fillStyle = oscuro ? 'rgba(22,20,32,0.92)' : 'rgba(255,255,255,0.94)'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  if (viva) { ctx.fillStyle = 'rgba(140,39,241,0.12)'; ctx.fill() }
  ctx.lineWidth = 1 * k
  ctx.strokeStyle = viva ? 'rgba(140,39,241,0.55)' : oscuro ? 'rgba(255,255,255,0.14)' : 'rgba(39,18,62,0.14)'
  ctx.setLineDash([])
  ctx.stroke()
  ctx.font = FUENTE_PASTILLA.replace(`${PASTILLA.tam}px`, `${PASTILLA.tam * k}px`)
  ctx.textBaseline = 'middle'
  const tinta = viva ? (oscuro ? '#C9A2FF' : theme.accent) : oscuro ? 'rgba(255,255,255,0.72)' : 'rgba(39,18,62,0.66)'
  const cy = p.y + p.height / 2
  if (!p.accion) {
    ctx.textAlign = 'center'
    ctx.fillStyle = tinta
    ctx.fillText(p.etiqueta, p.x + p.width / 2, cy + 0.5 * k)
    ctx.restore()
    return
  }
  // NERVIO (model/nervio.ts): punto del semáforo · glifo · rótulo, de izquierda a derecha.
  let x = p.x + PASTILLA.padX * k
  if (p.semaforo) {
    const r = (PASTILLA.punto / 2) * k
    ctx.beginPath(); ctx.arc(x + r, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = COLOR_SEMAFORO[p.semaforo]; ctx.fill()
    // Un halo del mismo color: el punto se lee como señal, no como viñeta.
    ctx.beginPath(); ctx.arc(x + r, cy, r + 2.2 * k, 0, Math.PI * 2)
    ctx.strokeStyle = COLOR_SEMAFORO[p.semaforo]; ctx.globalAlpha = 0.28; ctx.lineWidth = 1.4 * k; ctx.stroke(); ctx.globalAlpha = 1
    x += (PASTILLA.punto + PASTILLA.hueco) * k
  }
  if (p.glifo) {
    const g = PASTILLA.glifo * k
    ctx.fillStyle = viva ? tinta : (oscuro ? '#C9A2FF' : theme.accent)
    ctx.strokeStyle = ctx.fillStyle
    if (p.glifo === 'play') {
      ctx.beginPath(); ctx.moveTo(x + g * 0.12, cy - g / 2); ctx.lineTo(x + g, cy); ctx.lineTo(x + g * 0.12, cy + g / 2); ctx.closePath(); ctx.fill()
    } else {
      // vista previa: una ventanita con su barra
      ctx.lineWidth = 1.3 * k
      roundRect(ctx, x, cy - g * 0.42, g, g * 0.84, 1.5 * k); ctx.stroke()
      ctx.fillRect(x, cy - g * 0.42, g, g * 0.22)
    }
    x += (PASTILLA.glifo + PASTILLA.hueco) * k
  }
  if (p.etiqueta) {
    ctx.textAlign = 'left'
    ctx.fillStyle = tinta
    ctx.fillText(p.etiqueta, x, cy + 0.5 * k)
  }
  ctx.restore()
}

/**
 * HECHO C1 — una linea de tinta de ancho variable dibujada como N trazos por
 * segmento produce "cuentas" visibles en cada junta. Se pinta como UN solo
 * poligono de contorno relleno.
 *
 * HECHO B1 — un mouse, y un dedo en iOS, reportan presion constante. Alimentar
 * esa presion "real" da un trazo muerto; hay que medir su VARIANZA.
 */
export function hasRealPressure(points: Array<{ pressure: number }>): boolean {
  if (points.length < 4) return false
  let min = Infinity, max = -Infinity
  for (const p of points) { if (p.pressure < min) min = p.pressure; if (p.pressure > max) max = p.pressure }
  return max - min > 0.03
}

export function inkOutline(el: InkElement): Array<{ x: number; y: number }> {
  const pts = el.points
  if (pts.length < 2) return []
  const real = hasRealPressure(pts)
  const left: Array<{ x: number; y: number }> = []
  const right: Array<{ x: number; y: number }> = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)]
    let dx = next.x - prev.x, dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    dx /= len; dy /= len
    // Sin presion real, el grosor se simula con la velocidad: rapido = fino.
    const speed = Math.hypot(next.x - prev.x, next.y - prev.y)
    const factor = real ? 0.35 + p.pressure * 0.9 : Math.max(0.45, 1.15 - speed / 55)
    const w = (el.size * factor) / 2
    left.push({ x: el.x + p.x - dy * w, y: el.y + p.y + dx * w })
    right.push({ x: el.x + p.x + dy * w, y: el.y + p.y - dx * w })
  }
  return [...left, ...right.reverse()]
}

/**
 * La tinta a mano.
 *
 * El color SIN elegir sale del TEMA, no del archivo. Un trazo hecho en claro
 * guardaba un negro casi puro y al pasar a oscuro se volvia invisible — medido
 * en una captura el 19 ago. El literal solo gana cuando Daniel eligio uno.
 */
function drawInk(ctx: CanvasRenderingContext2D, el: InkElement, theme: Theme): void {
  const outline = inkOutline(el)
  if (outline.length < 3) return
  ctx.save()
  ctx.globalAlpha = el.highlighter ? 0.35 : el.opacity
  ctx.fillStyle = el.color ?? (el.highlighter ? theme.ink.marcador : theme.ink.lapiz)
  ctx.beginPath()
  ctx.moveTo(outline[0].x, outline[0].y)
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawConnector(ctx: CanvasRenderingContext2D, el: ConnectorElement, theme: Theme): void {
  if (el.points.length < 2) return
  // Un conector COMPILADO susurra: es una consecuencia de la estructura y no
  // debe competir con las cajas. Uno que trazo la MANO es una afirmacion, y con
  // el gris del diagrama queda mas tenue que la reticula del fondo — el mismo
  // defecto que tenian las figuras a mano. La procedencia ya distingue los dos
  // casos, asi que no hace falta inventar un campo: `origin` ausente = la mano.
  const deLaMano = el.origin == null
  // Lo compilado se pinta segun la CLASE de relacion que declaro el agente: no
  // es lo mismo un flujo que ya corre, uno fragil, uno que ejecuta un agente y
  // uno declarado-pero-hueco. Sin eso todas las aristas dicen lo mismo — solo
  // por donde va la flecha — y el diagrama pierde la mitad de lo que sabe.
  const trazo = deLaMano
    ? theme.roles.drawn.stroke
    : theme.edges[el.kind ?? 'flujo']
  ctx.save()
  ctx.strokeStyle = trazo.color
  ctx.lineWidth = trazo.width
  // El patron es el SEGUNDO canal de separacion: solo el color no sobrevive al
  // zoom alejado ni a una pantalla mala (la misma vara que rige los roles).
  const u = trazo.width * 2
  ctx.setLineDash(trazo.style === 'dashed' ? [u * 2.2, u * 1.4]
                : trazo.style === 'dotted' ? [1, u * 1.6] : [])
  ctx.lineCap = trazo.style === 'dotted' ? 'round' : 'butt'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (el.routing === 'curva' && el.points.length === 2) {
    // Una curva entre dos puntos con los tiradores desplazados en el eje
    // dominante: asi sale un arco que SALE del borde y no una diagonal
    // abombada que parece un error de calculo.
    const [a, b] = el.points
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
    const t = Math.max(40, (horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)) * 0.45)
    ctx.moveTo(a.x, a.y)
    if (horizontal) ctx.bezierCurveTo(a.x + Math.sign(b.x - a.x) * t, a.y, b.x - Math.sign(b.x - a.x) * t, b.y, b.x, b.y)
    else ctx.bezierCurveTo(a.x, a.y + Math.sign(b.y - a.y) * t, b.x, b.y - Math.sign(b.y - a.y) * t, b.x, b.y)
  } else {
    ctx.moveTo(el.points[0].x, el.points[0].y)
    for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y)
  }
  ctx.stroke()
  ctx.setLineDash([])

  const n = el.points.length
  // `arrowEnd` es el campo viejo; `headEnd` lo refina sin romperlo.
  const fin = el.headEnd ?? (el.arrowEnd ? 'flecha' : 'ninguna')
  if (fin !== 'ninguna' && n >= 2) {
    const a = el.points[n - 2], b = el.points[n - 1]
    punta(ctx, b, Math.atan2(b.y - a.y, b.x - a.x), fin, trazo.color)
  }
  const ini = el.headStart ?? 'ninguna'
  if (ini !== 'ninguna' && n >= 2) {
    const a = el.points[1], b = el.points[0]
    punta(ctx, b, Math.atan2(b.y - a.y, b.x - a.x), ini, trazo.color)
  }

  // LA ETIQUETA. El campo `label` existia en el modelo y nadie lo pintaba: una
  // relacion con nombre que el dibujo no dice es una relacion sin nombre.
  if (el.label && n >= 2) {
    const medio = puntoMedio(el.points)
    ctx.font = cssFont({ family: 'montserrat', weight: 600, size: 13 })
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = anchoDe(ctx, el.label)
    // Con fondo del lienzo detras: una etiqueta sobre su propia linea se lee
    // tachada.
    ctx.fillStyle = theme.canvas
    roundRect(ctx, medio.x - w / 2 - 6, medio.y - 10, w + 12, 20, 6)
    ctx.fill()
    ctx.fillStyle = theme.text.caption
    ctx.fillText(el.label, medio.x, medio.y)
  }
  ctx.restore()
}

/** El punto medio de una polilinea, medido por LONGITUD y no por indice. */
function puntoMedio(pts: Array<{ x: number; y: number }>): { x: number; y: number } {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let queda = total / 2
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (queda <= d) {
      const t = d === 0 ? 0 : queda / d
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
    }
    queda -= d
  }
  return pts[pts.length - 1]
}

/** Las seis puntas. Cada una dice algo distinto sobre la relacion. */
function punta(
  ctx: CanvasRenderingContext2D, p: { x: number; y: number }, ang: number,
  tipo: Arrowhead, color: string,
): void {
  const s = 9
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([])
  ctx.translate(p.x, p.y)
  ctx.rotate(ang)
  ctx.beginPath()
  switch (tipo) {
    case 'flecha':
      // Abierta: dos trazos, sin relleno. Es la mas ligera y por eso el default.
      ctx.moveTo(-s * 0.92, -s * 0.5); ctx.lineTo(0, 0); ctx.lineTo(-s * 0.92, s * 0.5)
      ctx.stroke(); ctx.restore(); return
    case 'triangulo':
      ctx.moveTo(0, 0); ctx.lineTo(-s, -s * 0.46); ctx.lineTo(-s, s * 0.46); ctx.closePath(); break
    case 'rombo':
      ctx.moveTo(0, 0); ctx.lineTo(-s * 0.6, -s * 0.42); ctx.lineTo(-s * 1.2, 0); ctx.lineTo(-s * 0.6, s * 0.42); ctx.closePath(); break
    case 'circulo':
      ctx.arc(-s * 0.45, 0, s * 0.45, 0, Math.PI * 2); break
    case 'barra':
      ctx.moveTo(0, -s * 0.55); ctx.lineTo(0, s * 0.55); ctx.lineWidth = 2.4; ctx.stroke(); ctx.restore(); return
    default: ctx.restore(); return
  }
  ctx.fill()
  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement, theme: Theme, zoom = 1): void {
  ctx.save()
  ctx.fillStyle = el.color?.explicit && el.color.text ? el.color.text : theme.text.body
  const lineas = el.lines ?? [el.text]
  const lineH = el.height / Math.max(1, lineas.length)
  // GREEKING (ver greeking.ts): bajo el umbral no se pone fuente ni se rasteriza un glifo. El texto nunca se agranda.
  if (enGreeking(el.style.size, zoom)) {
    ctx.globalAlpha *= 0.3
    lineas.forEach((linea, i) => {
      if (!linea.trim()) return
      const w = anchoGreeking(linea, el.style.size, el.width)
      const x0 = el.align === 'center' ? el.x + (el.width - w) / 2 : el.align === 'right' ? el.x + el.width - w : el.x
      ctx.fillRect(x0, el.y + i * lineH + lineH * 0.3, w, lineH * 0.4)
    })
    ctx.restore()
    return
  }
  ctx.font = cssFont(el.style)
  ctx.textAlign = el.align === 'center' ? 'center' : el.align === 'right' ? 'right' : 'left'
  ctx.textBaseline = 'alphabetic'
  const x = el.align === 'center' ? el.x + el.width / 2 : el.align === 'right' ? el.x + el.width : el.x
  lineas.forEach((linea, i) => {
    pintarRenglon(ctx, linea, x, el.y + i * lineH + el.style.size * 0.82, el.style)
  })
  ctx.restore()
}

/** Mide un titulo de seccion con la fuente real, para el hit-test (que no tiene contexto de dibujo). */
let ctxMedida: CanvasRenderingContext2D | null | undefined
export function medirTituloMarco(texto: string): number {
  if (ctxMedida === undefined) {
    ctxMedida = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  }
  if (!ctxMedida) return texto.length * 8
  ctxMedida.font = cssFont({ family: 'montserrat', weight: 800, size: 13, letterSpacing: 0.6 })
  return anchoDe(ctxMedida, texto)
}

function drawFrame(ctx: CanvasRenderingContext2D, el: FrameElement, theme: Theme, zoom: number): void {
  const tinte = theme.tints[el.tint ?? 'neutro']
  // El TINTE manda; el trazo de la mano lo pisa campo por campo, igual que en
  // las figuras. Sin esto una seccion seria el unico elemento del lienzo cuyo
  // borde no se puede tocar.
  const tr = el.trazo?.explicit ? el.trazo : undefined
  const radio = typeof tr?.radius === 'number' ? Math.max(0, tr.radius) : theme.roles.tray.radius
  const ancho = typeof tr?.width === 'number' ? tr.width : 1.5
  ctx.save()
  ctx.fillStyle = tinte.fill
  roundRect(ctx, el.x, el.y, el.width, el.height, radio)
  ctx.fill()
  if (ancho > 0) {
    applyStroke(ctx, { color: tinte.stroke, width: ancho, style: tr?.style ?? 'solid' }, zoom)
    ctx.stroke()
  }
  if (el.title) {
    // El titulo va FUERA, encima del borde superior: adentro compite con el
    // contenido y en una seccion llena no se lee.
    ctx.font = cssFont({ family: 'montserrat', weight: 800, size: 13, letterSpacing: 0.6 })
    ctx.textBaseline = 'alphabetic'
    const cart = cartuchoDeMarco(el, zoom, anchoDe.bind(null, ctx))!
    const t = cart.texto, w = cart.ancho
    // Cartucho detras del texto: sin el, el titulo se pierde sobre contenido.
    ctx.fillStyle = tinte.stroke
    roundRect(ctx, el.x + 10, el.y - 22, w + 16, 18, 5)
    ctx.fill()
    // Bajo el umbral de greeking el cartucho queda liso: el texto no se lee y no se rasteriza.
    if (13 * zoom >= GREEKING_PX) {
      ctx.fillStyle = theme.canvas
      ctx.save()
      ctx.letterSpacing = '0.6px'
      ctx.fillText(t, el.x + 18, el.y - 9)
      ctx.restore()
    }
  }
  ctx.restore()
}

function drawImage(ctx: CanvasRenderingContext2D, el: ImageElement, theme: Theme, anchoPx: number): void {
  // `anchoPx`: lo que mide en pantalla. Decide que copia se pinta (ver NIVELES en images.ts).
  const img = imagenParaPintar(el.src, anchoPx)
  if (img) {
    ctx.save()
    // La proporcion se CONSERVA dentro de la caja: estirar una foto es el tipo
    // de detalle que se ve amateur al instante.
    const escala = Math.min(el.width / img.ancho, el.height / img.alto)
    const w = img.ancho * escala, h = img.alto * escala
    ctx.drawImage(img.fuente, el.x + (el.width - w) / 2, el.y + (el.height - h) / 2, w, h)
    ctx.restore()
    return
  }
  // Marco de estado: cargando o rota. Nunca un hueco mudo — un elemento que no
  // pinta nada es indistinguible de uno que no existe.
  const roto = imageState(el.src) === 'error'
  ctx.save()
  ctx.fillStyle = theme.roles.sticky.fill
  roundRect(ctx, el.x, el.y, el.width, el.height, 8)
  ctx.fill()
  ctx.strokeStyle = roto ? theme.roles.risk.stroke.color : theme.roles.card.stroke.color
  ctx.lineWidth = 1.5
  ctx.setLineDash(roto ? [] : [5, 4])
  ctx.stroke()
  ctx.fillStyle = theme.text.caption
  ctx.font = cssFont({ family: 'montserrat', weight: 600, size: 13 })
  ctx.textAlign = 'center'
  ctx.fillText(roto ? 'imagen no disponible' : 'cargando…', el.x + el.width / 2, el.y + el.height / 2)
  ctx.textAlign = 'left'
  ctx.restore()
}

/**
 * Tabla. Usa los anchos de columna MEDIDOS que trae el elemento.
 *
 * El v3 los calculaba en tres sitios y el renderer los ignoraba, repartiendo el
 * ancho en partes iguales — datos calculados con esfuerzo que nadie leia. Aqui
 * el motor los usa, y si el texto de una celda no cabe se RECORTA CON PUNTOS
 * SUSPENSIVOS, que avisa; recortar sin marca deja al lector creyendo que ese es
 * el contenido completo.
 */
function drawTable(ctx: CanvasRenderingContext2D, el: TableElement, theme: Theme): void {
  ctx.save()
  ctx.fillStyle = theme.roles.card.fill
  roundRect(ctx, el.x, el.y, el.width, el.height, 8)
  ctx.fill()

  ctx.font = cssFont(el.style)
  ctx.textBaseline = 'alphabetic'
  const linea = theme.roles.card.stroke.color

  el.cells.forEach((fila, r) => {
    const y = el.y + r * el.rowHeight
    if (r === 0 && el.headerRow) {
      ctx.fillStyle = theme.roles.sticky.fill
      ctx.fillRect(el.x, y, el.width, el.rowHeight)
    }
    let x = el.x
    fila.forEach((celda, c) => {
      const w = el.colWidths[c] ?? 100
      ctx.fillStyle = r === 0 && el.headerRow ? theme.text.title : theme.text.body
      ctx.font = cssFont({ ...el.style, weight: r === 0 && el.headerRow ? 700 : el.style.weight })
      // Recorte CON marca: el lector ve que hay mas.
      let texto = celda
      const disponible = w - 24
      if (anchoDe(ctx, texto) > disponible) {
        while (texto.length > 1 && anchoDe(ctx, texto + '…') > disponible) texto = texto.slice(0, -1)
        texto += '…'
      }
      ctx.fillText(texto, x + 12, y + el.rowHeight * 0.65)
      x += w
    })
  })

  // Rejilla al final, encima de los rellenos.
  ctx.strokeStyle = linea
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath()
  for (let r = 1; r < el.cells.length; r++) {
    const y = el.y + r * el.rowHeight
    ctx.moveTo(el.x, y); ctx.lineTo(el.x + el.width, y)
  }
  let cx = el.x
  for (let c = 0; c < el.colWidths.length - 1; c++) {
    cx += el.colWidths[c]
    ctx.moveTo(cx, el.y); ctx.lineTo(cx, el.y + el.height)
  }
  ctx.stroke()
  roundRect(ctx, el.x, el.y, el.width, el.height, 8)
  ctx.stroke()
  ctx.restore()
}

/**
 * Embed. El motor NO pinta el contenido: perfora una ventana transparente y el
 * iframe REAL vive debajo del canvas.
 *
 * Es el patron que el v3 valido y funciona: asi el lapiz, el texto y las notas
 * con z mayor pintan ENCIMA de contenido vivo — un video o un mapa anotable a
 * mano. Dibujar el contenido en el canvas seria imposible (es otro documento).
 */
function drawEmbed(ctx: CanvasRenderingContext2D, el: EmbedElement, theme: Theme): void {
  ctx.save()
  // clearRect abre el agujero por donde se ve el iframe de abajo.
  ctx.clearRect(el.x, el.y, el.width, el.height)
  ctx.strokeStyle = el.interactive ? theme.accent : theme.roles.card.stroke.color
  ctx.lineWidth = el.interactive ? 2.5 : 1.5
  ctx.setLineDash([])
  roundRect(ctx, el.x, el.y, el.width, el.height, 8)
  ctx.stroke()
  ctx.restore()
}

/**
 * Rectangulo de seleccion con sus ocho manijas.
 *
 * Todo se dimensiona en pixeles de PANTALLA (dividiendo por el zoom): un borde
 * o una manija que engordan al acercarse tapan el elemento que intentan editar,
 * y que encogen al alejarse se vuelven imposibles de agarrar.
 */
/**
 * Widget de codigo con resaltado REAL.
 *
 * El v3 declaraba `insertCode` con resaltado en su contrato y pintaba texto
 * monocromo recortado a mano — una capacidad prometida que no existia. Aqui se
 * tokeniza y cada parte se pinta con su color.
 */
function drawCode(ctx: CanvasRenderingContext2D, el: CodeElement, theme: Theme): void {
  const pad = 14
  ctx.save()
  // Fondo propio, mas oscuro que el lienzo en claro y mas claro en oscuro: un
  // bloque de codigo se reconoce por su superficie antes que por su letra.
  ctx.fillStyle = theme.name === 'claro' ? '#f6f8fa' : '#0d1117'
  roundRect(ctx, el.x, el.y, el.width, el.height, 10)
  ctx.fill()
  ctx.strokeStyle = theme.roles.card.stroke.color
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.stroke()

  ctx.save()
  // Recorte: el codigo no se re-envuelve, se recorta. Una linea de codigo
  // partida a la mitad dice algo distinto a lo que dice entera.
  ctx.beginPath()
  ctx.rect(el.x + 2, el.y + 2, el.width - 4, el.height - 4)
  ctx.clip()

  const paleta = COLORES[theme.name]
  const lineH = el.style.size * 1.5
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${el.style.weight} ${el.style.size}px ui-monospace, "SF Mono", Menlo, monospace`

  el.code.split('\n').forEach((linea, i) => {
    const y = el.y + pad + (i + 1) * lineH - lineH * 0.28
    if (y > el.y + el.height) return
    let x = el.x + pad
    for (const tk of tokenizar(linea, el.language)) {
      ctx.fillStyle = paleta[tk.kind]
      ctx.fillText(tk.texto, x, y)
      x += ctx.measureText(tk.texto).width
    }
  })
  ctx.restore()
  ctx.restore()
}

function drawSelection(
  ctx: CanvasRenderingContext2D, elements: CanvasElement[], ids: Set<string>,
  theme: Theme, zoom: number, conManijas: boolean, grupoAbierto?: string | null,
): void {
  const r = selectionBounds(elements, ids)
  if (!r) return
  const pad = 3 / zoom

  ctx.save()

  // UN CONECTOR SOLO tiene su propio adorno: se resalta su trazo y se ofrecen
  // los puntos medios de cada tramo. Una caja de seleccion alrededor de una
  // linea diagonal encierra sobre todo aire, y sus manijas prometerian
  // redimensionar algo que no se redimensiona.
  if (ids.size === 1) {
    const solo = elements.find(e => ids.has(e.id))
    if (solo?.type === 'connector' && solo.points.length >= 2) {
      ctx.strokeStyle = theme.selection.color
      ctx.lineWidth = 2.5 / zoom
      ctx.setLineDash([])
      ctx.globalAlpha = 0.45
      ctx.beginPath()
      ctx.moveTo(solo.points[0].x, solo.points[0].y)
      for (let i = 1; i < solo.points.length; i++) ctx.lineTo(solo.points[i].x, solo.points[i].y)
      ctx.stroke()
      ctx.globalAlpha = 1
      if (conManijas) {
        for (let i = 0; i + 1 < solo.points.length; i++) {
          const m = { x: (solo.points[i].x + solo.points[i + 1].x) / 2,
                      y: (solo.points[i].y + solo.points[i + 1].y) / 2 }
          ctx.beginPath()
          ctx.arc(m.x, m.y, 5 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = theme.selection.handle
          ctx.fill()
          ctx.lineWidth = 1.5 / zoom
          ctx.stroke()
        }
      }
      ctx.restore()
      return
    }
  }
  // Un GRUPO completo se pinta como UN recuadro punteado con su etiqueta «Grupo · N»; sus miembros no llevan contorno.
  const grupos = ids.size > 1 ? gruposCompletos(elements, ids, grupoAbierto) : []
  // Si el grupo ES toda la seleccion, su recuadro es el de la seleccion (punteado) y no se pinta dos veces.
  const grupoUnico = grupos.length === 1 && grupos[0].ids.length === ids.size
  ctx.strokeStyle = theme.selection.color
  ctx.lineWidth = 1.5 / zoom
  ctx.setLineDash(grupoUnico ? [6 / zoom, 4 / zoom] : [])
  ctx.strokeRect(r.x - pad, r.y - pad, r.width + pad * 2, r.height + pad * 2)
  ctx.setLineDash([])

  const enGrupo = new Set<string>()
  for (const g of grupos) for (const id of g.ids) enGrupo.add(id)
  for (const g of grupos) {
    ctx.save()
    ctx.strokeStyle = theme.selection.color
    ctx.lineWidth = 1.5 / zoom
    ctx.setLineDash([6 / zoom, 4 / zoom])
    if (!grupoUnico) ctx.strokeRect(g.caja.x - pad, g.caja.y - pad, g.caja.width + pad * 2, g.caja.height + pad * 2)
    ctx.setLineDash([])
    const txt = `Grupo · ${g.ids.length}`
    ctx.font = `600 ${11 / zoom}px system-ui, sans-serif`
    const w = ctx.measureText(txt).width + 12 / zoom, h = 18 / zoom
    const lx = g.caja.x - pad, ly = g.caja.y - pad - h - 3 / zoom
    ctx.fillStyle = theme.selection.color
    ctx.beginPath(); ctx.roundRect(lx, ly, w, h, 4 / zoom); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(txt, lx + 6 / zoom, ly + h / 2)
    ctx.restore()
  }

  // Con varios seleccionados, cada uno lleva su contorno tenue: sin eso, la
  // caja de union no dice QUE hay dentro.
  if (ids.size > 1) {
    ctx.globalAlpha = 0.45
    ctx.lineWidth = 1 / zoom
    ctx.setLineDash([4 / zoom, 3 / zoom])
    for (const el of elements) {
      if (!ids.has(el.id) || enGrupo.has(el.id)) continue
      const b = bounds(el)
      ctx.strokeRect(b.x, b.y, b.width, b.height)
    }
    ctx.globalAlpha = 1
    ctx.setLineDash([])
  }

  // Un elemento BLOQUEADO no enseña manijas: prometerian un gesto que no va a
  // pasar. Su contorno se pinta punteado, que es la señal de que esta quieto a
  // proposito y no de que la interfaz este rota.
  const hayBloqueado = elements.some(e => ids.has(e.id) && e.locked)
  if (hayBloqueado) {
    ctx.setLineDash([7 / zoom, 4 / zoom])
    ctx.lineWidth = 2 / zoom
    ctx.strokeRect(r.x - pad, r.y - pad, r.width + pad * 2, r.height + pad * 2)
    ctx.setLineDash([])
    ctx.restore()
    return
  }

  if (conManijas) {
    const lado = HANDLE_PX / zoom
    ctx.lineWidth = 1.5 / zoom
    for (const h of HANDLES) {
      const c = handleCenter({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 }, h)
      ctx.fillStyle = theme.selection.handle
      ctx.strokeStyle = theme.selection.color
      ctx.beginPath()
      // Redondeadas: una manija cuadrada a este tamaño se ve tosca.
      const rr = lado * 0.28
      const x = c.x - lado / 2, y = c.y - lado / 2
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, lado, lado, rr)
      else ctx.rect(x, y, lado, lado)
      ctx.fill()
      ctx.stroke()
    }

    // EL TIRADOR DE GIRO. Vive FUERA de la caja, sobre el borde superior, unido
    // por una linea fina. Ponerlo encima de una esquina —como hacen algunas
    // herramientas— obliga a adivinar por el cursor si vas a girar o a
    // redimensionar; separarlo lo hace evidente sin leer nada.
    const rc = rotateCenter({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 }, zoom)
    const rr = 7 / zoom
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(rc.x, r.y - pad)
    ctx.lineTo(rc.x, rc.y + rr)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, rr, 0, Math.PI * 2)
    ctx.fillStyle = theme.selection.handle
    ctx.fill()
    ctx.stroke()
    // Un arco con punta adentro: dice "girar" sin necesidad de etiqueta.
    ctx.save()
    ctx.strokeStyle = theme.selection.color
    ctx.lineWidth = 1.2 / zoom
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, rr * 0.5, Math.PI * 0.25, Math.PI * 1.7)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

/**
 * Los cuatro puertos de conexion de un elemento.
 *
 * Circulo con una punta de flecha hacia AFUERA: la forma dice hacia donde sale
 * el gesto. Un circulo pelado se lee como "manija de redimension" y un signo de
 * mas se lee como "agregar algo aqui" — ninguno de los dos es lo que hace.
 */
function drawPorts(
  ctx: CanvasRenderingContext2D, el: CanvasElement, activo: PortId | null | undefined,
  theme: Theme, zoom: number,
): void {
  const r = PORT_R_PX / zoom
  ctx.save()
  for (const port of portsOf(el, zoom)) {
    const vivo = port.id === activo
    const rr = vivo ? r * 1.3 : r
    ctx.beginPath()
    ctx.arc(port.x, port.y, rr, 0, Math.PI * 2)
    ctx.fillStyle = vivo ? theme.accent : theme.canvas
    ctx.fill()
    ctx.lineWidth = 1.5 / zoom
    ctx.strokeStyle = theme.accent
    ctx.stroke()

    // La punta hacia afuera. En reposo se dibuja del color de acento; con el
    // puntero encima el circulo se llena y la punta se invierte a blanco.
    const [ux, uy] = port.id === 'n' ? [0, -1] : port.id === 's' ? [0, 1]
                   : port.id === 'e' ? [1, 0] : [-1, 0]
    const px = -uy, py = ux              // perpendicular
    const largo = rr * 0.52, ancho = rr * 0.42
    ctx.beginPath()
    ctx.moveTo(port.x + ux * largo, port.y + uy * largo)
    ctx.lineTo(port.x - ux * largo * 0.35 + px * ancho, port.y - uy * largo * 0.35 + py * ancho)
    ctx.lineTo(port.x - ux * largo * 0.35 - px * ancho, port.y - uy * largo * 0.35 - py * ancho)
    ctx.closePath()
    ctx.fillStyle = vivo ? '#ffffff' : theme.accent
    ctx.fill()
  }
  ctx.restore()
}

/** Pinta un frame completo. Idempotente: mismo estado, mismo resultado. */
export function render(canvas: HTMLCanvasElement, state: RenderState): { drawn: number; culled: number } {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { drawn: 0, culled: 0 }
  const { camera, theme, viewport: vp } = state

  const pxW = Math.round(vp.width * vp.dpr)
  const pxH = Math.round(vp.height * vp.dpr)
  if (canvas.width !== pxW || canvas.height !== pxH) { canvas.width = pxW; canvas.height = pxH }

  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0)
  // El fondo se pinta en coordenadas de PANTALLA, antes de la camara: una
  // grilla infinita en coordenadas de mundo obligaria a recorrer todo el plano.
  drawBackground(ctx, state.background ?? 'liso', camera, vp, theme)

  ctx.translate(vp.width / 2, vp.height / 2)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.translate(-camera.x, -camera.y)

  // Culling por huella real. Margen generoso: un elemento parcialmente fuera
  // sigue pintandose, y un trazo grueso sobresale de su bbox nominal.
  const vis = visibleWorldBounds(camera, vp, 64 / camera.zoom)
  let drawn = 0, culled = 0

  const ordered = ordenPorZ(state.elements)
  // Las secciones que RECORTAN. Se calculan una vez por frame, no por elemento.
  const recortadoras = ordered.filter(e => e.type === 'frame' && e.clip)
  for (const el of ordered) {
    const b = bounds(el)
    if (b.x > vis.maxX || b.y > vis.maxY || b.x + b.width < vis.minX || b.y + b.height < vis.minY) { culled++; continue }
    drawn++
    ctx.globalAlpha = el.opacity
    /**
     * RECORTE POR SECCION.
     *
     * Una seccion con recorte activo corta lo que sobresale de ella. Se resuelve
     * por CONTENCION en el momento, igual que el arrastre: una lista de hijos
     * que hay que mantener sincronizada se desincroniza siempre.
     *
     * Solo recorta a lo que esta ENCIMA de ella en la pila. Recortar tambien lo
     * que quedo debajo haria que meter una seccion nueva borrara de la vista
     * cosas que ya estaban ahi.
     */
    let recorta = false
    if (el.type !== 'frame' && recortadoras.length > 0) {
      const b0 = bounds(el)
      const cx = b0.x + b0.width / 2, cy = b0.y + b0.height / 2
      for (const f of recortadoras) {
        if (f.zIndex >= el.zIndex) continue
        if (cx < f.x || cx > f.x + f.width || cy < f.y || cy > f.y + f.height) continue
        ctx.save()
        roundRect(ctx, f.x, f.y, f.width, f.height, theme.roles.tray.radius)
        ctx.clip()
        recorta = true
        break
      }
    }

    // EL GIRO ENVUELVE AL DIBUJO. Cada funcion de pintado sigue trabajando en
    // coordenadas rectas, sin saber nada de angulos: si cada una tuviera que
    // aplicar el suyo, la siguiente que se agregue lo olvidaria.
    const girado = estaGirado(el)
    if (girado) {
      const c = centroDe(el)
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(el.rotation)
      ctx.translate(-c.x, -c.y)
    }
    switch (el.type) {
      case 'shape': drawShape(ctx, el, theme, camera.zoom); break
      case 'ink': drawInk(ctx, el, theme); break
      case 'connector': drawConnector(ctx, el, theme); break
      case 'text': drawText(ctx, el, theme, camera.zoom); break
      case 'frame': drawFrame(ctx, el, theme, camera.zoom); break
      case 'image': drawImage(ctx, el, theme, el.width * camera.zoom * vp.dpr); break
      case 'table': drawTable(ctx, el, theme); break
      case 'embed': drawEmbed(ctx, el, theme); break
      case 'code': drawCode(ctx, el, theme); break
    }
    if (girado) ctx.restore()
    if (recorta) ctx.restore()
    ctx.globalAlpha = 1
  }

  /**
   * EL CANDADO SE VE SIN SELECCIONAR.
   *
   * Antes solo se notaba al elegir el elemento (contorno punteado). Eso llega
   * tarde: te enteras de que algo esta bloqueado justo cuando ya intentaste
   * moverlo. Un candadito en la esquina lo dice ANTES, que es cuando sirve.
   *
   * Se pinta encima de todo el contenido y a tamaño de PANTALLA: un candado que
   * encoge con el zoom deja de leerse justo cuando mas elementos hay a la vista.
   */
  for (const el of ordered) {
    if (!el.locked) continue
    const b = bounds(el)
    if (b.x > vis.maxX || b.y > vis.maxY || b.x + b.width < vis.minX || b.y + b.height < vis.minY) continue
    const r = 9 / camera.zoom
    const cx = b.x + b.width - r - 3 / camera.zoom
    const cy = b.y + r + 3 / camera.zoom
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = theme.roles.card.fill
    ctx.fill()
    ctx.lineWidth = 1.2 / camera.zoom
    ctx.strokeStyle = theme.text.caption
    ctx.stroke()
    // El cuerpo y el arco del candado, a escala.
    const w = r * 0.62, h = r * 0.5
    ctx.beginPath()
    ctx.rect(cx - w / 2, cy - h / 2 + r * 0.12, w, h)
    ctx.fillStyle = theme.text.caption
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy - h / 2 + r * 0.12, w * 0.36, Math.PI, 0)
    ctx.lineWidth = 1.5 / camera.zoom
    ctx.stroke()
    ctx.restore()
  }

  // Las pastillas de enlace, encima del contenido y debajo de la seleccion.
  for (const p of state.pastillas ?? pastillasDe(state.elements, camera.zoom, undefined, state.vivo)) {
    if (p.x > vis.maxX || p.y > vis.maxY || p.x + p.width < vis.minX || p.y + p.height < vis.minY) continue
    drawPastilla(ctx, p, theme, camera.zoom, p.id === state.enlaceVivo)
  }

  // El borrador se pinta con la MISMA funcion que la tinta guardada.
  if (state.draft) { drawn++; drawInk(ctx, state.draft, theme) }

  if (state.rubber) {
    const r = state.rubber
    ctx.save()
    ctx.strokeStyle = theme.selection.color
    ctx.lineWidth = 1.5 / camera.zoom
    ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom])
    ctx.strokeRect(r.x, r.y, r.width, r.height)
    ctx.restore()
  }

  if (state.hover && !state.selectedIds?.has(state.hover)) {
    const el = ordered.find(e => e.id === state.hover)
    if (el) {
      const b = bounds(el), pad = 3 / camera.zoom
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = theme.selection.color
      ctx.lineWidth = 1 / camera.zoom
      ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2)
      ctx.restore()
    }
  }

  if (state.selectedIds?.size) {
    // Las manijas se ocultan mientras se dibuja o se crea: estorban justo
    // cuando la mano necesita el lienzo libre.
    drawSelection(ctx, ordered, state.selectedIds, theme, camera.zoom, state.conManijas !== false, state.grupoAbierto)
  }

  if (state.puertos) {
    const el = ordered.find(e => e.id === state.puertos!.elementId)
    if (el) drawPorts(ctx, el, state.puertos.activo, theme, camera.zoom)
  }

  if (state.guias?.length) {
    ctx.save()
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 1 / camera.zoom
    ctx.setLineDash([5 / camera.zoom, 4 / camera.zoom])
    ctx.beginPath()
    for (const g of state.guias) {
      if (g.eje === 'x') { ctx.moveTo(g.valor, g.desde); ctx.lineTo(g.valor, g.hasta) }
      else { ctx.moveTo(g.desde, g.valor); ctx.lineTo(g.hasta, g.valor) }
    }
    ctx.stroke()
    ctx.restore()
  }

  if (state.conectando) {
    const c = state.conectando
    if (c.fantasma) {
      const f = c.fantasma
      ctx.save()
      // Relleno tenue + contorno punteado: la gramatica universal de "esto
      // todavia no existe". Es la misma que usa el rectangulo elastico al
      // crear, asi que no hay una convencion nueva que aprender.
      ctx.globalAlpha = 0.5
      ctx.fillStyle = theme.roles.card.fill
      trazarFigura(ctx, f.shape, f, f.radius)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = theme.accent
      ctx.lineWidth = 1.6 / camera.zoom
      ctx.setLineDash([7 / camera.zoom, 5 / camera.zoom])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }
    ctx.save()
    // Se marca si va a AGARRAR: sin esa señal, soltar es una apuesta.
    ctx.strokeStyle = c.sobre ? theme.accent : theme.edge.color
    ctx.lineWidth = (c.sobre ? 2.5 : 1.5) / camera.zoom
    ctx.setLineDash(c.sobre ? [] : [6 / camera.zoom, 4 / camera.zoom])
    ctx.beginPath()
    ctx.moveTo(c.desde.x, c.desde.y)
    ctx.lineTo(c.hasta.x, c.hasta.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = c.sobre ? theme.accent : theme.edge.color
    ctx.beginPath()
    ctx.arc(c.hasta.x, c.hasta.y, (c.sobre ? 6 : 3.5) / camera.zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (state.marquee) {
    const m = state.marquee
    ctx.save()
    ctx.fillStyle = theme.selection.color
    ctx.globalAlpha = 0.10
    ctx.fillRect(m.x, m.y, m.width, m.height)
    ctx.globalAlpha = 1
    ctx.strokeStyle = theme.selection.color
    ctx.lineWidth = 1 / camera.zoom
    ctx.setLineDash([])
    ctx.strokeRect(m.x, m.y, m.width, m.height)
    ctx.restore()
  }

  return { drawn, culled }
}
