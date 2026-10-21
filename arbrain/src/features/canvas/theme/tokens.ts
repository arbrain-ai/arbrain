/**
 * Canvas v4 — temas. EL COLOR ES UN ROL, NO UN VALOR.
 *
 * La regla que hace que dos temas cuesten una tabla y no un motor:
 * los elementos guardan un ROL semantico (`card`, `risk`, `agent`…), nunca un
 * color. El tema es la funcion rol → color, aplicada AL PINTAR. Cambiar de tema
 * repinta todo, incluido lo que ya estaba dibujado.
 *
 * El v3 fallo justo aqui: tenia el campo de rol (`semantic`) Y el color
 * horneado (`fillColor`), y ganaba el horneado. Su propio ADR lo confiesa:
 * "Mono mantiene colores explicitos de elementos existentes" — o sea, cambiar
 * de tema no podia repintar lo ya dibujado.
 *
 * El color literal existe SOLO como excepcion explicita, para cuando Daniel
 * elige uno a mano con el selector. Si el modelo permitiera guardar un literal
 * sin marcarlo como excepcion, alguien lo guardaria y el tema se romperia.
 */

export type ThemeName = 'claro' | 'oscuro'

/** Roles con significado en la gramatica visual. Cada uno pinta distinto. */
export type Role =
  | 'card' | 'module' | 'form' | 'callout' | 'deliverable'
  | 'trigger' | 'risk' | 'agent' | 'tray' | 'sticky'
  // La NOTA ADHESIVA, en su amarillo de toda la vida. Es un rol aparte de
  // `sticky` a proposito: `sticky` tambien pinta el fondo de los chips, y
  // amarillearlo convertiria cada etiqueta en un fosforito.
  | 'nota'
  // El SENSOR: una lectura del mundo, no una caja del sistema. Es un rol aparte
  // porque no es lo que se HACE ni lo que EXISTE: es lo que se MIDE, y en un
  // mapa vivo tiene que leerse como instrumento a primera vista (enmienda al
  // estandar firmada el 24 ago 2026, opsroom The Machinery v2).
  | 'sensor'
  | 'widget'
  // Lo que la MANO dibuja. No codifica semantica — codifica autoria, y por eso
  // no va en la leyenda. Existe porque una figura dibujada con el borde sutil
  // de `card` queda mas tenue que la reticula de puntos del fondo: en un
  // diagrama compilado ese gris es discrecion, en una pizarra es un trazo que
  // no se ve. El diagrama susurra; la mano habla.
  | 'drawn'

/** Roles de texto. Definen jerarquia, no tamaño. */
export type TextRole = 'title' | 'body' | 'caption' | 'chip' | 'edge-label'

/**
 * QUE CLASE de relacion es una arista. Lo declara el agente; el tema decide
 * como se pinta — la misma separacion que ya rige para los roles de caja.
 *
 * Existe porque un critico ciego, comparando este diagrama contra el conectoma,
 * le dio a ESE el unico punto que perdio el nuestro: "codifica el ESTADO de
 * cada relacion, una idea mas rica que el codigo de forma". Tenia razon. Todas
 * nuestras aristas se veian igual: decian por donde va el flujo y nada sobre
 * que tan de fiar es.
 *
 * Cuatro y no mas. Cada una se separa de las demas por DOS canales (color +
 * patron, o patron + grosor), que es la misma vara que se le exige a los roles:
 * un solo canal no sobrevive al zoom alejado.
 */
export type EdgeKind = 'flujo' | 'agente' | 'fragil' | 'hueco'

export interface Stroke {
  color: string
  width: number
  style: 'solid' | 'dashed' | 'dotted'
}

export interface RoleStyle {
  fill: string
  stroke: Stroke
  radius: number
  /** Sombra suave. Solo la usa `deliverable`, que en el estandar es la card clara. */
  shadow?: boolean
}

export interface Theme {
  name: ThemeName
  canvas: string
  grid: string
  /** Color de la marca. Un solo acento estructural — paleta de restriccion §2. */
  accent: string
  roles: Record<Role, RoleStyle>
  text: Record<TextRole, string>
  edge: { color: string; width: number }
  /** Un trazo por clase de arista. `flujo` es el mismo de `edge`. */
  edges: Record<EdgeKind, Stroke>
  selection: { color: string; handle: string }
  /**
   * La TINTA de la mano, cuando nadie eligio un color.
   *
   * Vive en el tema y no en el elemento por la misma razon que los roles: un
   * literal guardado al dibujar es un literal que el cambio de tema no puede
   * repintar, y eso ya produjo trazos invisibles.
   */
  ink: { lapiz: string; marcador: string }
  /** Los tintes de seccion. Ver `SectionTint` sobre por que son nombres. */
  tints: Record<'neutro' | 'morado' | 'ambar' | 'verde' | 'azul' | 'rosa' | 'rojo',
                { fill: string; stroke: string; label: string }>
}

/**
 * La gramatica de bordes del estandar §3, como datos:
 *   solido morado   = formulario / entrada
 *   discontinuo     = modulo / contenido
 *   dashed morado   = agente / IA (mismo grosor y salto que fragil: el COLOR avisa)
 *   relleno acento  = llamada humana
 *   card clara      = entregable
 *   rojo            = riesgo
 *   bandeja sutil   = fase / territorio
 */
function buildRoles(c: {
  surface: string; surfaceAlt: string; line: string; lineSoft: string; drawn: string;
  accent: string; risk: string; agentLine: string; deliverable: string; deliverableLine: string; trayFill: string;
  /** Tinte propio de la entrada: sin el, `form` solo se separa de sus vecinos
   *  por un canal y la leyenda promete una distincion que el ojo no hace. */
  formFill: string;
  /** La llamada humana pesa mas que la entrada: su tinte es mas fuerte. */
  calloutFill: string;
  riskFill: string;
  /** El amarillo de la nota adhesiva y su borde. */
  notaFill: string; notaLine: string;
  /** La cara del instrumento: pizarra fria y borde firme. NO es un color nuevo
   *  de alerta (eso devaluaria el rojo y el morado) — es un NEUTRO mas frio que
   *  la superficie, que es justo lo que separa un aparato de una tarjeta. */
  sensorFill: string; sensorLine: string;
  widgetFill: string; widgetLine: string;
}): Record<Role, RoleStyle> {
  // CADA ROL DEBE SER DISTINGUIBLE A SIMPLE VISTA, o la leyenda miente.
  //
  // Un critico ciego lo cazo en la ronda 2: "declara cinco categorias pero en el
  // lienzo real solo dos se distinguen; disparador vs entregable vs modulo son
  // variaciones de gris tan sutiles que la leyenda promete una taxonomia que el
  // diagrama no demuestra".
  //
  // Es el mismo pecado que este proyecto persigue, con otro disfraz: primero era
  // codificacion sin diccionario, y al agregar el diccionario quedo diccionario
  // sin codificacion. Un contrato que promete lo que el motor no entrega.
  //
  // La regla que lo cierra: dos roles se separan por DOS canales, no por uno.
  // Grosor + trazo, o forma + trazo, o color + trazo. Un solo canal (solo el
  // tono de gris del borde) no sobrevive al zoom alejado ni a una pantalla mala.
  return {
    // neutro: sin codigo. No aparece en la leyenda a proposito.
    card:        { fill: c.surface,    stroke: { color: c.line,      width: 1.5, style: 'solid'  }, radius: 12 },
    // contenido: mismo cuerpo que card (el dashed de cajas murio, firma 24 ago 2026)
    module:      { fill: c.surface,    stroke: { color: c.line,      width: 1.5, style: 'solid'  }, radius: 12 },
    // entrada: morado + tinte propio + esquinas de CAMPO (casi cuadradas)
    form:        { fill: c.formFill,   stroke: { color: c.accent,    width: 2,   style: 'solid'  }, radius: 4 },
    // llamada humana: morado + MUY grueso + tinte mas fuerte que la entrada
    callout:     { fill: c.calloutFill, stroke: { color: c.accent,   width: 3.5, style: 'solid'  }, radius: 12 },
    // entregable: ambar pastel + borde mostaza + esquinas de campo + sombra
    // (firma 24 ago 2026: el artefacto es LO QUE EXISTE y se viste de marca).
    deliverable: { fill: c.deliverable, stroke: { color: c.deliverableLine, width: 1.5, style: 'solid' }, radius: 4, shadow: true },
    // disparador: absorbido por proceso (la pildora murio, firma 24 ago 2026) —
    // que algo sea "el inicio" lo dice su posicion en el flujo, no la forma.
    trigger:     { fill: c.surface,    stroke: { color: c.line,      width: 1.5, style: 'solid'  }, radius: 12 },
    // riesgo: rojo + grueso + tinte rojo
    risk:        { fill: c.riskFill,   stroke: { color: c.risk,      width: 2.5, style: 'solid'  }, radius: 12 },
    // agente: morado de marca SOLIDO + fondo pastel (el dotted murio, firma 24 ago
    // 2026: el punteado se mudo a las ARISTAS, y alla es dashed).
    agent:       { fill: c.formFill,   stroke: { color: c.agentLine, width: 2.5, style: 'solid'  }, radius: 12 },
    tray:        { fill: c.trayFill,   stroke: { color: c.lineSoft,  width: 1,   style: 'solid'  }, radius: 20 },
    sticky:      { fill: c.surfaceAlt, stroke: { color: c.lineSoft,  width: 1,   style: 'solid'  }, radius: 6 },
    // nota: el amarillo caracteristico, sin sombra — una nota es papel plano.
    nota:        { fill: c.notaFill,   stroke: { color: c.notaLine,  width: 1,   style: 'solid'  }, radius: 6 },
    // sensor: pizarra fria + borde firme + esquinas de aparato (r6). Tres
    // canales lo separan de `card` (color, grosor de borde, radio), que es lo
    // que exige la regla de "dos canales, no uno".
    sensor:      { fill: c.sensorFill, stroke: { color: c.sensorLine, width: 1.5, style: 'solid'  }, radius: 6 },
    // widget: la ventana VIVA a otro sistema (calendario, monk mode, tareas).
    // Misma pizarra fria que el sensor porque los dos LEEN el mundo, y se
    // separan por r10 + su banda de cabecera con el sello de frescura. El dato
    // NO viaja en el elemento: lo pinta la app al vuelo (por eso el canvas web,
    // que no tiene esas fuentes, lo dibuja como marco rotulado y no miente).
    widget:      { fill: c.widgetFill, stroke: { color: c.sensorLine, width: 1.5, style: 'solid'  }, radius: 10 },
    // mano: sin relleno (no tapa lo que ya hay debajo) y con el mismo peso que
    // la tinta, que es su vecino natural en la pizarra.
    drawn:       { fill: 'transparent', stroke: { color: c.drawn,     width: 2.5, style: 'solid'  }, radius: 12 },
  }
}

export const CLARO: Theme = {
  name: 'claro',
  canvas: '#ffffff',
  grid: '#eeeef1',
  accent: '#8C27F1',
  roles: buildRoles({
    surface: '#ffffff', surfaceAlt: '#faf7ff', line: '#c9c9d1', lineSoft: '#e4e4e8', drawn: '#3a3a44',
    accent: '#8C27F1', risk: '#dc2626', agentLine: '#8C27F1',
    deliverable: '#fff7e8', deliverableLine: '#c98a12', trayFill: '#f7f7f9',
    formFill: '#f0eaff', calloutFill: '#e2d4ff', riskFill: '#fdeaea',
    notaFill: '#fff5c2', notaLine: '#e6cf6a',
    sensorFill: '#f1f3f8', sensorLine: '#8a8d9c',
    widgetFill: '#fbfbfd', widgetLine: '#8a8d9c',
  }),
  text: {
    title: '#111114', body: '#3f3f49', caption: '#5c5c68',
    chip: '#3f3f49', 'edge-label': '#5c5c68',
  },
  edge: { color: '#9a9aa6', width: 1.5 },
  edges: {
    // ⚠️ GROSOR 3 EN LAS DASHED (25 ago 2026). Daniel, comparando con el
    // tablero del socio: *"las lineas punteadas tienen buen grosor, se ven desde
    // lejos"*. A 2px con el lienzo alejado el patron se disolvia en gris y la
    // arista dejaba de decir su clase. La regla firmada NO cambia: mismo patron
    // para todas, el COLOR es lo que avisa.
    flujo:  { color: '#9a9aa6', width: 2,   style: 'solid'  },
    agente: { color: '#8C27F1', width: 3,   style: 'dashed' },
    fragil: { color: '#c98a12', width: 3,   style: 'dashed' },
    hueco:  { color: '#c4c4cc', width: 1.5, style: 'dashed' },
  },
  selection: { color: '#8C27F1', handle: '#ffffff' },
  ink: { lapiz: '#1a1a22', marcador: '#ffd400' },
  // Relleno MUY bajo a proposito: una seccion es un fondo, no una figura. Si
  // compite con las tarjetas que contiene, deja de ser territorio y pasa a ser
  // otro objeto mas en la pila.
  tints: {
    neutro: { fill: '#f7f7f9', stroke: '#dcdce2', label: '#6a6a76' },
    morado: { fill: '#f6f0ff', stroke: '#c9a8f5', label: '#7126c4' },
    ambar:  { fill: '#fff7e8', stroke: '#e8c07a', label: '#9a6206' },
    verde:  { fill: '#eefaf3', stroke: '#94d3b0', label: '#11734a' },
    azul:   { fill: '#eef4ff', stroke: '#9dbcf0', label: '#1b4fa8' },
    rosa:   { fill: '#fff0f6', stroke: '#f0a6c4', label: '#a41d5c' },
    rojo:   { fill: '#fdeeee', stroke: '#eda2a2', label: '#a52020' },
  },
}

export const OSCURO: Theme = {
  name: 'oscuro',
  canvas: '#0a0b10',
  grid: '#16171f',
  // ⚠️ EL NEON ES LA MARCA, NO UN EFECTO (enmienda 25 ago 2026). El oscuro
  // venia con morados y oros GENERICOS (#a855f7 de Tailwind, #d9a23c) que en
  // near-black se leen como "un tema oscuro cualquiera". Daniel: *"me gustaria
  // conservar el ambar y el morado en NEON"*. Sobre #0a0b10 el morado madre
  // #8C27F1 y el oro madre #ff9101 (nucleo.md) SI encienden — son los mismos
  // hex del claro, y esa identidad entre temas es justo el punto.
  accent: '#8C27F1',
  roles: buildRoles({
    surface: '#12131b', surfaceAlt: '#181528', line: '#33343f', lineSoft: '#26272f', drawn: '#c8c9d4',
    accent: '#8C27F1', risk: '#ef4444', agentLine: '#8C27F1',
    deliverable: '#241c0d', deliverableLine: '#ff9101', trayFill: '#101119',
    formFill: '#1d1733', calloutFill: '#2a1d4d', riskFill: '#2a1416',
    // En oscuro el amarillo se apaga: un post-it fosforito sobre negro
    // deslumbra y se come todo lo que tiene alrededor.
    notaFill: '#332b0e', notaLine: '#7a6a24',
    sensorFill: '#14161f', sensorLine: '#4a4d5e',
    widgetFill: '#0d0f17', widgetLine: '#4a4d5e',
  }),
  text: {
    title: '#f6f7fb', body: '#c3c7d4', caption: '#9599a6',
    chip: '#c3c7d4', 'edge-label': '#9599a6',
  },
  edge: { color: '#585a68', width: 1.5 },
  edges: {
    flujo:  { color: '#6a6c7c', width: 2,   style: 'solid'  },
    // Los derivados documentados del morado y el oro (nucleo.md §2): sobre
    // near-black el hex madre a 3px de linea se apaga, sus luces no.
    agente: { color: '#9d3cf5', width: 3,   style: 'dashed' },
    fragil: { color: '#ffac3d', width: 3,   style: 'dashed' },
    hueco:  { color: '#3a3b47', width: 1.5, style: 'dashed' },
  },
  selection: { color: '#8C27F1', handle: '#0a0b10' },
  // Blanco roto, no blanco puro: sobre negro el blanco puro deslumbra y el
  // trazo se ve mas grueso de lo que es.
  ink: { lapiz: '#eceef6', marcador: '#ffd400' },
  tints: {
    neutro: { fill: '#15161d', stroke: '#2f313c', label: '#9a9cab' },
    // Filo NEON sobre fondo oscuro. El fill se queda hondo a proposito: un
    // territorio es un fondo, y en oscuro un fondo claro se lee como un bloque
    // LAVADO que se come todo lo que contiene (asi salio el maestro del 24 ago).
    morado: { fill: '#1b1330', stroke: '#8C27F1', label: '#c79cff' },
    ambar:  { fill: '#241c0d', stroke: '#ff9101', label: '#ffb64d' },
    verde:  { fill: '#0f2019', stroke: '#2c6a4c', label: '#6fd3a4' },
    azul:   { fill: '#111a2c', stroke: '#2f5490', label: '#8fb4f5' },
    rosa:   { fill: '#26121c', stroke: '#8a3a63', label: '#f095bd' },
    rojo:   { fill: '#261314', stroke: '#8c3a3a', label: '#f09a9a' },
  },
}

export const THEMES: Record<ThemeName, Theme> = { claro: CLARO, oscuro: OSCURO }

/**
 * El estilo de un rol, con respaldo neutro (2 oct 2026).
 *
 * La tabla `draw` la escriben tambien sfmap y sus generadores, que conocen
 * roles que este tema no (p. ej. `circulo`, la figura didactica de sfmap).
 * Leer `theme.roles[rol]` a pelo devolvia `undefined` y el minimapa tumbaba la
 * pizarra entera ("This page couldn't load" al abrir Claridad). Se pinta como
 * `card` y el dato NO se toca: el rol original sigue en el elemento y sfmap lo
 * sigue pintando a su manera.
 */
export function estiloDeRol(theme: Theme, role: string | undefined): RoleStyle {
  return (role && (theme.roles as Record<string, RoleStyle | undefined>)[role]) || theme.roles.card
}

/**
 * Resuelve el color de un elemento. El literal SOLO gana si viene marcado como
 * eleccion explicita del humano — esa marca es lo que impide que el tema se
 * rompa en silencio como paso en el v3.
 */
export function resolveFill(theme: Theme, role: Role, override?: { fill?: string; explicit?: boolean }): string {
  if (override?.explicit && override.fill) return override.fill
  return estiloDeRol(theme, role).fill
}

export function resolveStroke(
  theme: Theme, role: Role,
  override?: { stroke?: string; explicit?: boolean },
  trazo?: { style?: 'solid' | 'dashed' | 'dotted'; width?: number; explicit?: boolean },
): Stroke {
  const base = estiloDeRol(theme, role).stroke
  // Se compone campo por campo: elegir el estilo punteado no debe borrar un
  // color que la mano habia elegido antes, ni al reves. Un override que
  // reemplaza el objeto entero convierte cada ajuste en un reinicio silencioso.
  const out: Stroke = { ...base }
  if (override?.explicit && override.stroke) out.color = override.stroke
  if (trazo?.explicit) {
    if (trazo.style) out.style = trazo.style
    if (typeof trazo.width === 'number') out.width = trazo.width
  }
  return out
}

/**
 * El radio de esquina que toca pintar.
 *
 * Existe por simetria con los otros dos: sin el, el redondeo seria el unico
 * atributo visual que se lee directo de `theme.roles[...]` en el motor, y la
 * proxima superficie que necesite pintar una figura (la exportacion, una
 * miniatura) se olvidaria de aplicar el override. Un resolver por atributo, y
 * todos los consumidores heredan el mismo comportamiento.
 */
export function resolveRadius(
  theme: Theme, role: Role, trazo?: { radius?: number; explicit?: boolean },
): number {
  if (trazo?.explicit && typeof trazo.radius === 'number') return Math.max(0, trazo.radius)
  return estiloDeRol(theme, role).radius
}


/**
 * Los colores que el JUEZ necesita para medir contraste, derivados del tema.
 *
 * Vive aqui y no en cada ruta que llama al juez. Estaba escrito a mano dentro
 * de `/api/canvas/compile` y la segunda ruta que lo necesitara habria escrito
 * su propia version — que es exactamente como el v3 acabo con la geometria de
 * las figuras en tres archivos distintos, ya divergidos.
 */
export function coloresParaJuez(t: Theme): {
  bg: string; box: string; title: string; body: string
  caption: string; chip: string; chipText: string
} {
  return {
    bg: t.canvas, box: t.roles.card.fill, title: t.text.title, body: t.text.body,
    caption: t.text.caption, chip: t.roles.sticky.fill, chipText: t.text.chip,
  }
}
