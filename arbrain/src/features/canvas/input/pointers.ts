/**
 * Canvas v4 — la maquina de punteros.
 *
 * El v3 llamaba a su equivalente "LA PIEZA FRAGIL", y con razon: es donde se
 * cruzan cinco sistemas de entrada (mouse, dedo, lapiz, gestos de WebKit,
 * teclado) que el navegador NO coordina entre si.
 *
 * Cada regla de aqui es un hecho MEDIDO en hardware real, documentado en
 * HECHOS-DE-PLATAFORMA.md §B. No son decisiones de diseño: son como se comporta
 * un iPad. Se heredan porque ningun modelo las re-deriva sin tener uno en la
 * mano.
 */

import { decidirPuntero, superaUmbral, type AlSoltarQuieto } from './decision-puntero'
import type { Camera } from '../model/element'
import type { Viewport } from '../render/viewport'
import { screenToWorld, zoomAt, sanitizeCamera } from '../render/viewport'

export type Tool =
  | 'select' | 'pan'
  | 'pen' | 'highlighter' | 'eraser'
  | 'sticky' | 'text'
  | 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'star' | 'pill' | 'hexagon' | 'arrow'
  | 'section' | 'connector'
  | 'table' | 'embed' | 'image' | 'code'

/** Las formas que se dibujan arrastrando. Comparten todo menos su geometria. */
export const SHAPE_TOOLS = ['rect', 'ellipse', 'triangle', 'diamond', 'star', 'pill', 'hexagon', 'arrow'] as const
export type ShapeTool = (typeof SHAPE_TOOLS)[number]

/** Herramientas que crean con UN toque, sin arrastrar. */
export const TOOLS_TAP: ReadonlySet<Tool> = new Set<Tool>(['sticky', 'table', 'embed', 'code'])
/** Herramientas que crean ARRASTRANDO para definir su tamaño. */
export const TOOLS_DRAG: ReadonlySet<Tool> = new Set<Tool>([...SHAPE_TOOLS, 'section', 'text'])

export interface PointerSample {
  id: number
  type: 'mouse' | 'pen' | 'touch'
  x: number          // px CSS, relativos al canvas
  y: number
  pressure: number
  buttons: number
  /** Shift al momento del evento: mantiene proporcion y suma a la seleccion. */
  shift?: boolean
  /** Alt al momento del evento: arrastrar DUPLICA en vez de mover. */
  alt?: boolean
  /** ⌘ (o Ctrl) al momento del evento: ABRE el enlace del elemento. */
  meta?: boolean
}

export type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; last: { x: number; y: number } }
  | { kind: 'draw'; pointerId: number; points: Array<{ x: number; y: number; pressure: number }> }
  | { kind: 'pinch'; a: number; b: number; lastDist: number; lastMid: { x: number; y: number } }
  | { kind: 'tap-or-pan'; pointerId: number; start: { x: number; y: number }; last: { x: number; y: number }; moved: boolean
      /** Solo con la seleccion y un dedo: lo que se elige si al soltar no hubo arrastre (id, o null = vacio). */
      elige?: string | null }
  /** ⌘ abajo: si se arrastra es la mano; si se suelta quieto, era un ⌘+clic (abrir el enlace). */
  | { kind: 'pan-o-clic'; pointerId: number; start: { x: number; y: number }; tool: Tool }
  | { kind: 'drag'; pointerId: number; elementId: string; last: { x: number; y: number }; moved: boolean; activaAlSoltar?: boolean
      /** Seleccion multiple: no se mueve hasta superar el umbral desde `inicio`; si se suelta quieto, esto decide. */
      pendiente?: { inicio: { x: number; y: number }; alSoltar: AlSoltarQuieto } }
  | { kind: 'rubber'; pointerId: number; tool: Tool; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'marquee'; pointerId: number; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'resize'; pointerId: number; handle: string; start: { x: number; y: number }; last: { x: number; y: number } }
  | { kind: 'rotate'; pointerId: number; start: { x: number; y: number } }
  | { kind: 'connecting'; pointerId: number; fromId: string; current: { x: number; y: number }
      /** De que lado salio, cuando salio de un puerto. `null` = de la herramienta. */
      puerto: 'n' | 'e' | 's' | 'w' | null; inicio: { x: number; y: number }; movio: boolean }
  | { kind: 'erase'; pointerId: number }

/** HECHO B9 — la seleccion tactil se desambigua por movimiento, no por down. */
const TOUCH_TAP_SLOP = 8
/** Cuanto se mueve un ⌘+clic antes de volverse paneo. Menos que el dedo: el raton no tiembla. */
const META_SLOP = 3

export interface MachineCallbacks {
  onCamera(next: Camera): void
  /** ¿Hay algo agarrable aqui? Devuelve su id, o null para panear el lienzo. */
  hitTest?(worldPoint: { x: number; y: number }, coarse: boolean): string | null
  /**
   * ALT al empezar a arrastrar: se duplica y se arrastra la COPIA.
   *
   * El original se queda donde estaba. Es el gesto que todo editor serio tiene
   * y el canvas viejo lo documento sin implementarlo: su registro de atajos
   * decia "Alt+Drag: duplicar arrastrando" y el codigo hacia PAN con Alt. Un
   * atajo documentado que hace otra cosa es peor que uno ausente.
   *
   * Devuelve el id de la copia; si devuelve null, el arrastre sigue con el
   * original.
   */
  onDuplicarParaArrastrar?(elementId: string): string | null
  /** Arrastre en curso. El delta viene en unidades de MUNDO, ya sin el zoom. */
  onDragElement?(elementId: string, deltaWorld: { x: number; y: number }): void
  onDragEnd?(elementId: string, movio: boolean): void
  /** `conMeta` = venia con ⌘/Ctrl. La pagina decide que significa (abrir
   *  el enlace del elemento); la maquina solo reporta el hecho. */
  onSelect?(elementId: string | null, conMeta?: boolean): void
  /** ¿Ya esta seleccionado? Con un dedo, arrastrar mueve lo seleccionado; lo demas panea y un toque lo elige. */
  esSeleccionado?(elementId: string): boolean
  /** Cuantos hay seleccionados, el id de uno de ellos y si el punto cae en el recuadro de la seleccion multiple. */
  estadoSeleccion?(worldPoint: { x: number; y: number }): { cantidad: number; ancla: string | null; dentroDelRecuadro: boolean }
  /** Shift+clic: suma o quita de la seleccion sin reemplazarla. */
  onToggleSelect?(elementId: string): void
  /** Doble toque sobre un elemento: entrar a editarlo. */
  onActivate?(elementId: string): void
  /** Toque en el vacio: salir de cualquier modo de interaccion. */
  onSelectOutside?(): void
  /** ¿Hay una manija de redimension bajo el punto? Devuelve su id. */
  handleAt?(worldPoint: { x: number; y: number }, coarse: boolean): string | null
  /**
   * ¿Hay un PUERTO de conexion bajo el punto? Devuelve de que elemento.
   *
   * Es lo que convierte "quiero una flecha de aqui a alla" en un solo gesto,
   * sin cambiar de herramienta ni antes ni despues.
   */
  portAt?(worldPoint: { x: number; y: number }, coarse: boolean):
    { id: string; puerto: 'n' | 'e' | 's' | 'w' } | null
  /** Redimension en curso: delta acumulado desde el inicio, en mundo. */
  onResize?(handle: string, deltaDesdeInicio: { x: number; y: number }, proporcional: boolean): void
  onResizeEnd?(): void
  /** Giro en curso: el puntero, en mundo. `shift` pide escalones de 15°. */
  onRotate?(worldPoint: { x: number; y: number }, shift: boolean): void
  onRotateEnd?(): void
  /** Rectangulo de seleccion en curso. null al terminar. */
  onMarquee?(box: { x: number; y: number; width: number; height: number } | null): void
  /** Seleccion final del marquee. `aditivo` con Shift. */
  onMarqueeEnd?(box: { x: number; y: number; width: number; height: number }, aditivo: boolean): void
  /** Conector en curso: de que elemento sale y donde esta el puntero. */
  onConnecting?(fromId: string | null, hasta: { x: number; y: number } | null): void
  /**
   * Soltar el conector.
   *
   * `toId` null NO significa "no pasa nada": significa que cayo en el VACIO, y
   * ahi es donde nace una figura nueva ya conectada. Por eso viajan tambien el
   * `puerto` del que salio y si hubo `arrastre`: un CLIC en el puerto (sin
   * mover) crea la figura a una distancia estandar en esa direccion, y un
   * arrastre la crea donde la soltaste. Son dos gestos distintos con la misma
   * intencion, y la diferencia solo se puede saber aqui.
   */
  onConnect?(fromId: string, toId: string | null, punto: { x: number; y: number },
             puerto: 'n' | 'e' | 's' | 'w' | null, arrastre: boolean): void
  /** Crear con un toque (nota, bloque de texto). */
  onCreateAt?(tool: Tool, worldPoint: { x: number; y: number }): void
  /** Rectangulo elastico en curso: se pinta como preview. */
  onRubber?(tool: Tool, box: { x: number; y: number; width: number; height: number } | null): void
  /** Crear con el tamaño que se arrastro. Un area minuscula = fue un clic. */
  onCreateBox?(tool: Tool, box: { x: number; y: number; width: number; height: number }): void
  /**
   * BORRAR. Se llama por cada punto del recorrido de la goma.
   *
   * Es un gesto CONTINUO, no un clic: se pasa la goma por encima y va comiendo
   * lo que toca, como una goma de verdad. Un borrador de un solo clic obliga a
   * apuntar a cada trazo por separado, que es justo lo que nadie quiere hacer
   * cuando se esta corrigiendo un dibujo.
   */
  onErase?(worldPoint: { x: number; y: number }): void
  onEraseEnd?(): void
  onDrawStart(worldPoint: { x: number; y: number; pressure: number }): void
  onDrawPoint(worldPoint: { x: number; y: number; pressure: number }): void
  onDrawEnd(): void
  onTap(worldPoint: { x: number; y: number }): void
}

export class PointerMachine {
  private pointers = new Map<number, PointerSample>()
  private gesture: Gesture = { kind: 'none' }
  /**
   * HECHO B5 — "este dispositivo tiene stylus" es un hecho PERSISTENTE por
   * dispositivo, no de sesion. No hay API sincrona para preguntarlo de
   * antemano, asi que se recuerda: una vez visto un lapiz, el patron
   * "dedo panea / lapiz dibuja" queda activo para siempre en ese aparato,
   * incluso antes de que el lapiz vuelva a tocar en una sesion futura.
   */
  private stylusSeen = false
  /** HECHO A2 — los gesture events de WebKit disparan EN PARALELO a los pointer
   *  events para el MISMO pinch. Sin una señal compartida de quien es dueño del
   *  gesto, los dos mueven la camara y el zoom salta. */
  private touchPinchActive = false
  private lastTap: { id: string; at: number } | null = null
  private shiftAlIniciar = false
  /**
   * Barra espaciadora abajo = mano temporal.
   *
   * Vive en la maquina y no en la pagina porque el gesto ya empezado tiene que
   * poder consultarlo: soltar el espacio a media pasada no debe cortar el
   * paneo en curso. Es la convencion de Figma, Miro, Photoshop e Illustrator —
   * la mano mas entrenada que existe en software de lienzo.
   */
  private espacio = false

  constructor(
    private cb: MachineCallbacks,
    storage?: Pick<Storage, 'getItem' | 'setItem'>,
  ) {
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
    this.stylusSeen = this.storage?.getItem(STYLUS_KEY) === '1'
  }
  private storage?: Pick<Storage, 'getItem' | 'setItem'>

  /** La pagina reporta el estado de la barra espaciadora. */
  setEspacio(abajo: boolean): void { this.espacio = abajo }
  espacioAbajo(): boolean { return this.espacio }

  isPinching(): boolean { return this.touchPinchActive }
  hasStylus(): boolean { return this.stylusSeen }
  currentGesture(): Gesture['kind'] { return this.gesture.kind }

  /** HECHO B2 — con un lapiz abajo, TODO touch se ignora: no dibuja, no panea,
   *  no arma pinch. La palm rejection no es automatica. */
  private penIsDown(): boolean {
    for (const p of this.pointers.values()) if (p.type === 'pen') return true
    return false
  }

  down(s: PointerSample, tool: Tool, camera: Camera, vp: Viewport): void {
    if (s.type === 'pen') {
      if (!this.stylusSeen) {
        this.stylusSeen = true
        this.storage?.setItem(STYLUS_KEY, '1')
      }
      // HECHO B3 — el stylus MANDA: si la palma ya habia iniciado pan o pinch,
      // se aborta y el lapiz toma el gesto limpio.
      if (this.gesture.kind === 'pan' || this.gesture.kind === 'pinch' || this.gesture.kind === 'tap-or-pan') {
        this.gesture = { kind: 'none' }
        this.touchPinchActive = false
      }
    }
    if (s.type === 'touch' && this.penIsDown()) return   // HECHO B2

    this.pointers.set(s.id, s)

    // EL PANEO GANA A TODO. El boton del medio y la barra espaciadora son la
    // via de escape universal de cualquier lienzo serio: da igual que
    // herramienta este activa, mueven la camara. Sin esto, con el lapiz o una
    // figura en la mano no hay forma de desplazarse sin cambiar de herramienta
    // — y cambiar de herramienta para moverte y volver es justo la friccion
    // que hace que una pizarra se sienta barata.
    //
    // `buttons & 4` es el boton del medio; `& 2` el derecho, que se reserva
    // para el menu contextual.
    const botonMedio = s.type === 'mouse' && (s.buttons & 4) !== 0
    if (botonMedio || (this.espacio && s.type !== 'touch')) {
      this.gesture = { kind: 'pan', last: { x: s.x, y: s.y } }
      return
    }
    // ⌘ (Ctrl fuera del Mac) + ARRASTRAR = la mano, con cualquier herramienta. Daniel, 5 oct 2026: *"cmd clic no
    // saca la manita"*. El ⌘+clic QUIETO conserva su significado (abrir el enlace del elemento): la intencion solo
    // se sabe al moverse o al soltar, asi que el gesto espera unos px antes de decidir.
    if (s.type === 'mouse' && s.meta && (s.buttons & 1) !== 0) {
      this.gesture = { kind: 'pan-o-clic', pointerId: s.id, start: { x: s.x, y: s.y }, tool }
      return
    }
    const touches = [...this.pointers.values()].filter(p => p.type === 'touch')

    // HECHO B4 — con el pinch armado, los contactos EXTRA (palma en el borde,
    // tercer dedo) se descartan por completo. Si entraran al mapa, soltar un
    // dedo re-parearia la distancia con el par equivocado y el zoom saltaria.
    if (this.gesture.kind === 'pinch') return

    if (touches.length === 2) {
      const [a, b] = touches
      this.touchPinchActive = true
      this.gesture = {
        kind: 'pinch', a: a.id, b: b.id,
        lastDist: Math.hypot(a.x - b.x, a.y - b.y),
        lastMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
      return
    }

    // El CONECTOR nace de un elemento, no del vacio: una flecha que empieza en
    // la nada no conecta nada. Si no hay elemento debajo, no pasa nada.
    if (tool === 'connector') {
      const w = screenToWorld(s, camera, vp)
      const desde = this.cb.hitTest?.(w, s.type === 'touch')
      if (desde) {
        this.gesture = { kind: 'connecting', pointerId: s.id, fromId: desde, current: w,
                         puerto: null, inicio: w, movio: false }
        this.cb.onConnecting?.(desde, w)
      }
      return
    }

    if (TOOLS_TAP.has(tool)) {
      this.cb.onCreateAt?.(tool, screenToWorld(s, camera, vp))
      this.gesture = { kind: 'none' }
      return
    }

    if (TOOLS_DRAG.has(tool)) {
      const w = screenToWorld(s, camera, vp)
      this.gesture = { kind: 'rubber', pointerId: s.id, tool, start: w, current: w }
      return
    }

    // LA GOMA es un gesto propio. Sin este caso caia hasta el final del metodo
    // y armaba un `pan`: pasar la goma MOVIA el lienzo en vez de borrar, que es
    // lo mas desconcertante que puede hacer una herramienta — no falla, hace
    // otra cosa.
    if (tool === 'eraser') {
      this.gesture = { kind: 'erase', pointerId: s.id }
      this.cb.onErase?.(screenToWorld(s, camera, vp))
      return
    }

    const dibuja = (tool === 'pen' || tool === 'highlighter')
      // Patron FigJam/Procreate: si el aparato conoce un stylus, el DEDO panea
      // y solo el lapiz dibuja. Sin stylus conocido, el dedo dibuja.
      && (s.type !== 'touch' || !this.stylusSeen)

    if (dibuja) {
      const w = screenToWorld(s, camera, vp)
      this.gesture = { kind: 'draw', pointerId: s.id, points: [{ ...w, pressure: s.pressure }] }
      this.cb.onDrawStart({ ...w, pressure: s.pressure })
      return
    }

    // Con la herramienta de seleccion el orden importa:
    //   1. manija de redimension (esta ENCIMA de todo, aunque caiga sobre otro
    //      elemento: si perdiera contra el elemento de abajo, redimensionar
    //      algo pegado a otra cosa seria imposible)
    //   2. elemento bajo el puntero → arrastrar
    //   3. vacio → marquee de seleccion
    //
    // Vacio hace MARQUEE, no pan. Es la convencion de Figma y Miro, y la
    // alternativa (panear al arrastrar en vacio) deja sin forma de seleccionar
    // varios elementos, que es mas importante: para panear estan la mano, el
    // espacio y el trackpad.
    if (tool === 'select') {
      const w = screenToWorld(s, camera, vp)
      const h = this.cb.handleAt?.(w, s.type === 'touch')
      if (h === ROTATE) {
        this.gesture = { kind: 'rotate', pointerId: s.id, start: w }
        this.cb.onRotate?.(w, s.shift === true)
        return
      }
      if (h) {
        this.gesture = { kind: 'resize', pointerId: s.id, handle: h, start: w, last: w }
        return
      }
      // Los puertos van DESPUES de las manijas: viven fuera del borde, asi que
      // rara vez compiten, y cuando lo hacen gana redimensionar — es lo que la
      // mano espera de algo ya seleccionado.
      const desde = this.cb.portAt?.(w, s.type === 'touch')
      if (desde) {
        this.gesture = { kind: 'connecting', pointerId: s.id, fromId: desde.id, current: w,
                         puerto: desde.puerto, inicio: w, movio: false }
        this.cb.onConnecting?.(desde.id, w)
        return
      }
    }

    if (tool === 'select' && this.cb.hitTest) {
      const w = screenToWorld(s, camera, vp)
      const hit = this.cb.hitTest(w, s.type === 'touch')
      // DEDO (5 oct 2026, Daniel desde el iPhone): arrastrar con un dedo mueve el LIENZO y seleccionar es un TOQUE. Sin
      // esto habia que tocar la flecha y luego la mano para moverse. Lo ya seleccionado si se arrastra (es como se mueve
      // algo con el dedo); lo demas panea, y al soltar sin mover se elige (o se deselecciona si era vacio).
      if (s.type === 'touch' && !s.shift && (!hit || !this.cb.esSeleccionado?.(hit))) {
        this.gesture = { kind: 'tap-or-pan', pointerId: s.id, start: { x: s.x, y: s.y }, last: { x: s.x, y: s.y }, moved: false, elige: hit }
        return
      }
      if (hit) {
        // HECHO A7 — `onDoubleClick` es fragil bajo touch-action:none con
        // pointer capture en iPad; el doble-tap no lo dispara de forma
        // confiable. Se detecta a mano por timestamp, como todo lo tactil.
        //
        // ⚠️ SE RESUELVE AL SOLTAR, JAMAS AL PRESIONAR. Medido el 19 ago 2026:
        // resolverlo en el `down` hacia que "clic para seleccionar y enseguida
        // arrastrar" — el gesto mas comun que existe en un lienzo — abriera el
        // editor de texto y dejara el arrastre MUERTO (`dx = 0`). Cualquier
        // mano que dude menos de 350 ms entre seleccionar y mover choca con
        // esto. Ahora el segundo toque arma el arrastre igual y solo se
        // convierte en "activar" si al soltar NO hubo movimiento.
        const ahora = Date.now()
        const segundoToque = this.lastTap != null && this.lastTap.id === hit
          && ahora - this.lastTap.at < 500
        this.lastTap = { id: hit, at: ahora }
        // Con una seleccion multiple, apretar sobre uno de sus elementos NO la reduce: se arrastra entera y recien al
        // soltar quieto se queda solo ese (decision-puntero.ts).
        const est = this.cb.estadoSeleccion?.(w)
        const dec = decidirPuntero({
          hit, hitSeleccionado: this.cb.esSeleccionado?.(hit) === true, cantidad: est?.cantidad ?? 1,
          dentroDelRecuadro: est?.dentroDelRecuadro === true, ancla: est?.ancla ?? null,
          shift: s.shift === true, meta: s.meta === true,
        })
        if (dec.tipo === 'arrastrar-seleccion' && !s.alt) {
          this.gesture = {
            kind: 'drag', pointerId: s.id, elementId: dec.objetivo, last: { x: s.x, y: s.y }, moved: false,
            pendiente: { inicio: { x: s.x, y: s.y }, alSoltar: dec.alSoltarQuieto },
            activaAlSoltar: segundoToque,
          }
          return
        }
        // Shift SUMA a la seleccion en vez de reemplazarla. Sin esto, armar una
        // seleccion de tres cosas exige rodearlas con la marquesina aunque haya
        // otras en medio.
        if (dec.tipo === 'alternar') this.cb.onToggleSelect?.(hit)
        else this.cb.onSelect?.(hit, s.meta === true)
        const objetivo = s.alt ? (this.cb.onDuplicarParaArrastrar?.(hit) ?? hit) : hit
        this.gesture = {
          kind: 'drag', pointerId: s.id, elementId: objetivo,
          last: { x: s.x, y: s.y }, moved: false,
          // Duplicar y activar son incompatibles: si acabas de crear una copia,
          // soltar sin moverla no debe abrirte su editor.
          activaAlSoltar: segundoToque && !s.alt,
        }
        return
      }
      const est = this.cb.estadoSeleccion?.(w)
      const vac = decidirPuntero({
        hit: null, hitSeleccionado: false, cantidad: est?.cantidad ?? 0, dentroDelRecuadro: est?.dentroDelRecuadro === true,
        ancla: est?.ancla ?? null, shift: s.shift === true, meta: s.meta === true,
      })
      if (vac.tipo === 'arrastrar-seleccion' && !s.alt) {
        this.gesture = {
          kind: 'drag', pointerId: s.id, elementId: vac.objetivo, last: { x: s.x, y: s.y }, moved: false,
          pendiente: { inicio: { x: s.x, y: s.y }, alSoltar: vac.alSoltarQuieto },
        }
        return
      }
      this.cb.onSelect?.(null)
      this.cb.onSelectOutside?.()
      this.gesture = { kind: 'marquee', pointerId: s.id, start: w, current: { ...w } }
      this.shiftAlIniciar = s.shift === true
      return
    }

    if (s.type === 'touch') {
      // HECHO B9 — un toque de un dedo sobre lienzo vacio es ambiguo entre
      // panear y seleccionar hasta que se suelta. Se resuelve con 8px de slop.
      this.gesture = { kind: 'tap-or-pan', pointerId: s.id, start: { x: s.x, y: s.y }, last: { x: s.x, y: s.y }, moved: false }
      return
    }

    this.gesture = { kind: 'pan', last: { x: s.x, y: s.y } }
  }

  move(s: PointerSample, camera: Camera, vp: Viewport): void {
    if (s.type === 'touch' && this.penIsDown()) return
    if (!this.pointers.has(s.id) && this.gesture.kind !== 'pan') return
    this.pointers.set(s.id, s)

    switch (this.gesture.kind) {
      case 'pan-o-clic': {
        const g = this.gesture
        if (s.id !== g.pointerId || Math.hypot(s.x - g.start.x, s.y - g.start.y) <= META_SLOP) break
        // Ya es paneo: se aplica el tramo recorrido de una vez para que la mano no se quede atras del cursor.
        this.gesture = { kind: 'pan', last: { x: s.x, y: s.y } }
        const dx = s.x - g.start.x, dy = s.y - g.start.y
        this.cb.onCamera(sanitizeCamera({ x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom, zoom: camera.zoom }, camera))
        break
      }
      case 'pan': {
        const dx = s.x - this.gesture.last.x, dy = s.y - this.gesture.last.y
        this.gesture.last = { x: s.x, y: s.y }
        this.cb.onCamera(sanitizeCamera({ x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom, zoom: camera.zoom }, camera))
        break
      }
      case 'tap-or-pan': {
        const g = this.gesture
        if (s.id !== g.pointerId) break
        const dist = Math.hypot(s.x - g.start.x, s.y - g.start.y)
        if (!g.moved && dist > TOUCH_TAP_SLOP) g.moved = true
        if (g.moved) {
          const dx = s.x - g.last.x, dy = s.y - g.last.y
          this.cb.onCamera(sanitizeCamera({ x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom, zoom: camera.zoom }, camera))
        }
        g.last = { x: s.x, y: s.y }
        break
      }
      case 'drag': {
        const g = this.gesture
        if (s.id !== g.pointerId) break
        if (g.pendiente) {
          if (!superaUmbral(g.pendiente.inicio, s)) break
          // Ya es arrastre: el tramo recorrido hasta aqui se aplica de una vez.
          g.last = { ...g.pendiente.inicio }
          g.pendiente = undefined
        }
        const dx = (s.x - g.last.x) / camera.zoom
        const dy = (s.y - g.last.y) / camera.zoom
        if (dx !== 0 || dy !== 0) g.moved = true
        g.last = { x: s.x, y: s.y }
        this.cb.onDragElement?.(g.elementId, { x: dx, y: dy })
        break
      }
      case 'rubber': {
        const g = this.gesture
        if (s.id !== g.pointerId) break
        g.current = screenToWorld(s, camera, vp)
        this.cb.onRubber?.(g.tool, normalizeBox(g.start, g.current))
        break
      }
      case 'connecting': {
        const g = this.gesture
        if (s.id !== g.pointerId) break
        g.current = screenToWorld(s, camera, vp)
        if (Math.hypot(g.current.x - g.inicio.x, g.current.y - g.inicio.y) > 6 / camera.zoom) g.movio = true
        this.cb.onConnecting?.(g.fromId, g.current)
        break
      }
      case 'marquee': {
        const g = this.gesture
        if (s.id !== g.pointerId) break
        g.current = screenToWorld(s, camera, vp)
        this.cb.onMarquee?.(normalizeBox(g.start, g.current))
        break
      }
      case 'rotate': {
        if (s.id !== this.gesture.pointerId) break
        this.cb.onRotate?.(screenToWorld(s, camera, vp), s.shift === true)
        break
      }
      case 'resize': {
        const g = this.gesture
        if (s.id !== g.pointerId) break
        const w = screenToWorld(s, camera, vp)
        g.last = w
        this.cb.onResize?.(g.handle, { x: w.x - g.start.x, y: w.y - g.start.y }, s.shift === true)
        break
      }
      case 'erase': {
        if (s.id !== this.gesture.pointerId) break
        this.cb.onErase?.(screenToWorld(s, camera, vp))
        break
      }
      case 'draw': {
        if (s.id !== this.gesture.pointerId) break
        const w = screenToWorld(s, camera, vp)
        this.gesture.points.push({ ...w, pressure: s.pressure })
        this.cb.onDrawPoint({ ...w, pressure: s.pressure })
        break
      }
      case 'pinch': {
        const g = this.gesture
        const a = this.pointers.get(g.a), b = this.pointers.get(g.b)
        if (!a || !b) break
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        // HECHO B6 — el pan del pinch es (medio ACTUAL − medio ANTERIOR), igual
        // que el pan de un dedo. La version inicial del v3 uso el orden inverso
        // y la camara se movia AL REVES de los dedos; no se detecto hasta
        // probarlo en un iPad de verdad. Ningun test unitario lo atrapa.
        const dx = mid.x - g.lastMid.x, dy = mid.y - g.lastMid.y
        const zoomed = zoomAt(camera, vp, mid, g.lastDist > 0 ? dist / g.lastDist : 1)
        this.cb.onCamera(sanitizeCamera({
          x: zoomed.x - dx / zoomed.zoom, y: zoomed.y - dy / zoomed.zoom, zoom: zoomed.zoom,
        }, camera))
        g.lastDist = dist
        g.lastMid = mid
        break
      }
      default: break
    }
  }

  up(s: PointerSample, camera: Camera, vp: Viewport): void {
    const g = this.gesture
    this.pointers.delete(s.id)

    if (g.kind === 'pan-o-clic' && g.pointerId === s.id) {
      this.gesture = { kind: 'none' }
      // Fue un clic quieto con ⌘. Con el puntero significa lo de siempre: abrir el enlace o, sin enlace, elegir.
      if (g.tool === 'select') {
        const hit = this.cb.hitTest?.(screenToWorld(g.start, camera, vp), false) ?? null
        this.cb.onSelect?.(hit, true)
        if (!hit) this.cb.onSelectOutside?.()
      }
      return
    }

    if (g.kind === 'erase' && g.pointerId === s.id) {
      this.cb.onEraseEnd?.()
      this.gesture = { kind: 'none' }
      return
    }

    if (g.kind === 'draw' && g.pointerId === s.id) {
      this.cb.onDrawEnd()
      this.gesture = { kind: 'none' }
      return
    }

    if (g.kind === 'rubber' && g.pointerId === s.id) {
      const box = normalizeBox(g.start, g.current)
      this.cb.onRubber?.(g.tool, null)
      // Un area minuscula significa que fue un clic, no un arrastre: se crea
      // con un tamaño util en vez de una figura de 2px que nadie puede agarrar.
      const chico = box.width < 12 || box.height < 12
      // Un clic con la herramienta de TEXTO no puede caer en 180px: eso parte
      // cualquier frase en una columna de dos palabras. Su default es una
      // columna de lectura.
      const defecto = g.tool === 'text'
        ? { x: g.start.x, y: g.start.y, width: 420, height: 60 }
        : { x: g.start.x - 90, y: g.start.y - 60, width: 180, height: 120 }
      this.cb.onCreateBox?.(g.tool, chico ? defecto : box)
      this.gesture = { kind: 'none' }
      return
    }

    if (g.kind === 'connecting' && g.pointerId === s.id) {
      const w = screenToWorld(s, camera, vp)
      const hasta = this.cb.hitTest?.(w, s.type === 'touch') ?? null
      this.cb.onConnecting?.(null, null)
      // Conectar algo consigo mismo no significa nada; se descarta en silencio.
      this.cb.onConnect?.(g.fromId, hasta === g.fromId ? null : hasta, w, g.puerto, g.movio)
      this.gesture = { kind: 'none' }
      return
    }

    if (g.kind === 'marquee' && g.pointerId === s.id) {
      this.cb.onMarquee?.(null)
      const box = normalizeBox(g.start, g.current)
      // Un area minuscula es un clic en el vacio, no una seleccion.
      if (box.width > 4 || box.height > 4) this.cb.onMarqueeEnd?.(box, this.shiftAlIniciar)
      this.gesture = { kind: 'none' }
      return
    }

    if (g.kind === 'rotate' && g.pointerId === s.id) {
      this.cb.onRotateEnd?.()
      this.gesture = { kind: 'none' }
      return
    }

    if (g.kind === 'resize' && g.pointerId === s.id) {
      this.cb.onResizeEnd?.()
      this.gesture = { kind: 'none' }
      return
    }

    if (g.kind === 'drag' && g.pointerId === s.id) {
      this.cb.onDragEnd?.(g.elementId, g.moved)
      this.gesture = { kind: 'none' }
      if (g.pendiente) {
        // Soltar quieto sobre una seleccion multiple: recien ahora se resuelve la seleccion.
        const q = g.pendiente.alSoltar
        // Doble clic quieto sobre un hijo de una seleccion multiple: entra a ESE hijo (y lo activa).
        if (q.tipo === 'reducir' && g.activaAlSoltar && !g.moved) {
          this.lastTap = null
          this.cb.onSelect?.(q.id)
          this.cb.onActivate?.(q.id)
        }
        else if (q.tipo === 'reducir') this.cb.onSelect?.(q.id)
        else if (q.tipo === 'deseleccionar') { this.cb.onSelect?.(null); this.cb.onSelectOutside?.() }
        return
      }
      // Doble toque = dos clics QUIETOS. Si el segundo arrastro, era un
      // arrastre y activar ahora abriria un editor sobre algo recien movido.
      if (g.activaAlSoltar && !g.moved) {
        this.lastTap = null
        this.cb.onActivate?.(g.elementId)
      }
      return
    }

    if (g.kind === 'tap-or-pan' && g.pointerId === s.id) {
      if (!g.moved) {
        if (g.elige === undefined) this.cb.onTap(screenToWorld({ x: g.start.x, y: g.start.y }, camera, vp))
        else if (g.elige) {
          // Doble toque = editar, como con el puntero (se resuelve al soltar, HECHO A7).
          const ahora = Date.now(), segundo = this.lastTap != null && this.lastTap.id === g.elige && ahora - this.lastTap.at < 500
          this.lastTap = { id: g.elige, at: ahora }
          this.cb.onSelect?.(g.elige)
          if (segundo) { this.lastTap = null; this.cb.onActivate?.(g.elige) }
        } else { this.cb.onSelect?.(null); this.cb.onSelectOutside?.() }
      }
      this.gesture = { kind: 'none' }
      return
    }

    if (g.kind === 'pinch') {
      const quedan = [...this.pointers.values()].filter(p => p.type === 'touch')
      if (quedan.length === 1) {
        // HECHO B7 — soltar un dedo durante un pinch hace handoff suave a pan
        // con el que queda (patron Figma/Miro/Procreate). La version ingenua
        // congelaba el canvas hasta soltar el ultimo dedo.
        this.gesture = { kind: 'pan', last: { x: quedan[0].x, y: quedan[0].y } }
      } else {
        this.gesture = { kind: 'none' }
        this.touchPinchActive = false
      }
      return
    }

    if (this.pointers.size === 0) {
      this.gesture = { kind: 'none' }
      this.touchPinchActive = false
    }
  }

  /**
   * HECHO A9 — `pointercancel` dispara con facilidad en iPad (gestos del
   * sistema, palma en el borde). Para una herramienta de tinta significa
   * "GUARDA lo que hay", jamas "descarta". Perder un trazo es inaceptable.
   */
  cancel(s: PointerSample, camera: Camera, vp: Viewport): void {
    if (this.gesture.kind === 'draw' && this.gesture.pointerId === s.id) {
      this.cb.onDrawEnd()
      this.pointers.delete(s.id)
      this.gesture = { kind: 'none' }
      return
    }
    this.up(s, camera, vp)
  }

  /**
   * HECHO A8 — iOS puede suspender la pestaña (multitarea, Centro de Control)
   * SIN entregar el pointerup final, dejando punteros fantasma en el estado.
   * Toda maquina de punteros necesita esta red de seguridad, y CIERRA el trazo
   * en curso en vez de tirarlo.
   */
  resetStuck(): void {
    if (this.gesture.kind === 'draw') this.cb.onDrawEnd()
    this.pointers.clear()
    this.gesture = { kind: 'none' }
    this.touchPinchActive = false
  }
}

const STYLUS_KEY = 'canvas-v4:stylus-seen'
/** El id que devuelve `handleAt` para el tirador de giro. */
const ROTATE = 'rotate'

function normalizeBox(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
  }
}
