'use client'

/**
 * Canvas v4 — iconos.
 *
 * SVG a mano, trazo de 1.6 sobre grilla de 24, `currentColor`. Sin libreria de
 * iconos: los de proposito general no tienen "marcador", "nota", "seccion" ni
 * "conector" con la misma familia visual, y mezclar dos fuentes de iconos se
 * nota al instante.
 *
 * `vectorEffect: non-scaling-stroke` para que el grosor no engorde cuando el
 * icono se escala.
 */

interface Props { size?: number; className?: string }

const svg = (children: React.ReactNode, { size = 20 }: Props = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }} aria-hidden>
    {children}
  </svg>
)

export const IconCursor = (p: Props) => svg(
  <path d="M5 3l6.5 16 2.2-6.3 6.3-2.2z" />, p)

export const IconHand = (p: Props) => svg(<>
  <path d="M9 11V5.5a1.5 1.5 0 013 0V11" />
  <path d="M12 11V4.5a1.5 1.5 0 013 0V11" />
  <path d="M15 11V6.5a1.5 1.5 0 013 0V13c0 4-2.5 7-6 7s-6-2.6-6-6v-3.5a1.5 1.5 0 013 0V11" />
</>, p)

export const IconPen = (p: Props) => svg(<>
  <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z" />
  <path d="M14.5 6.5l3 3" />
</>, p)

export const IconMarker = (p: Props) => svg(<>
  <path d="M4 20h6l9-9a2.5 2.5 0 00-3.5-3.5l-9 9z" />
  <path d="M4 20h16" strokeWidth={2.6} />
</>, p)

export const IconEraser = (p: Props) => svg(<>
  <path d="M8 20l-4-4a2 2 0 010-2.8l8-8a2 2 0 012.8 0l4 4a2 2 0 010 2.8L14 20z" />
  <path d="M20 20h-9" />
</>, p)

export const IconSticky = (p: Props) => svg(<>
  <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5V14l-6 6H5.5A1.5 1.5 0 014 18.5z" />
  <path d="M20 14h-4.5A1.5 1.5 0 0014 15.5V20" />
</>, p)

export const IconText = (p: Props) => svg(<>
  <path d="M5 6V4.5h14V6" />
  <path d="M12 4.5V20" />
  <path d="M9 20h6" />
</>, p)

export const IconSquare = (p: Props) => svg(
  <rect x="4" y="4" width="16" height="16" rx="2.5" />, p)

export const IconCircle = (p: Props) => svg(<circle cx="12" cy="12" r="8" />, p)

export const IconTriangle = (p: Props) => svg(
  <path d="M12 4l8 15H4z" />, p)

export const IconDiamond = (p: Props) => svg(
  <path d="M12 3l9 9-9 9-9-9z" />, p)

export const IconStar = (p: Props) => svg(
  <path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-2.9-5.3 2.9 1.1-6.1L3.4 9.9l6-.8z" />, p)

export const IconPill = (p: Props) => svg(
  <rect x="3" y="7" width="18" height="10" rx="5" />, p)

export const IconHexagon = (p: Props) => svg(
  <path d="M8 3.5h8l4 8.5-4 8.5H8l-4-8.5z" />, p)

export const IconArrowShape = (p: Props) => svg(
  <path d="M3 9h10V4l8 8-8 8v-5H3z" />, p)

export const IconConnector = (p: Props) => svg(<>
  <circle cx="5.5" cy="18.5" r="2.2" />
  <circle cx="18.5" cy="5.5" r="2.2" />
  <path d="M7.4 16.8C10 13 12.5 10.5 16.6 7.4" />
</>, p)

export const IconSection = (p: Props) => svg(<>
  <rect x="3.5" y="6" width="17" height="14" rx="2" strokeDasharray="3.5 2.5" />
  <path d="M3.5 6V4.5h7V6" />
</>, p)

export const IconTable = (p: Props) => svg(<>
  <rect x="3.5" y="5" width="17" height="14" rx="2" />
  <path d="M3.5 9.5h17M9.5 9.5V19M15 9.5V19" />
</>, p)

export const IconImage = (p: Props) => svg(<>
  <rect x="3.5" y="5" width="17" height="14" rx="2" />
  <circle cx="8.8" cy="10" r="1.6" />
  <path d="M20.5 15.5l-4.6-4.3L4 19" />
</>, p)

export const IconEmbed = (p: Props) => svg(<>
  <rect x="3" y="5" width="18" height="14" rx="2" />
  <path d="M9.5 10L7 12.2l2.5 2.2M14.5 10l2.5 2.2-2.5 2.2" />
</>, p)

export const IconCode = (p: Props) => svg(<>
  <path d="M8.5 8L4 12.2 8.5 16.4M15.5 8L20 12.2l-4.5 4.2" />
  <path d="M13.5 5l-3 14" />
</>, p)

export const IconUndo = (p: Props) => svg(<>
  <path d="M4 8.5h9.5a5.5 5.5 0 010 11H8" />
  <path d="M7.5 5L4 8.5 7.5 12" />
</>, p)

export const IconRedo = (p: Props) => svg(<>
  <path d="M20 8.5h-9.5a5.5 5.5 0 000 11H16" />
  <path d="M16.5 5L20 8.5 16.5 12" />
</>, p)

export const IconFit = (p: Props) => svg(<>
  <path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9" />
  <path d="M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15" />
</>, p)

export const IconPlus = (p: Props) => svg(<path d="M12 5.5v13M5.5 12h13" />, p)
export const IconMinus = (p: Props) => svg(<path d="M5.5 12h13" />, p)

export const IconGridDots = (p: Props) => svg(<>
  {[7, 12, 17].flatMap(y => [7, 12, 17].map(x =>
    <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" fill="currentColor" stroke="none" />))}
</>, p)

export const IconGridLines = (p: Props) => svg(<>
  <path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16" />
</>, p)

export const IconGridNone = (p: Props) => svg(
  <rect x="4" y="4" width="16" height="16" rx="2" />, p)

export const IconSun = (p: Props) => svg(<>
  <circle cx="12" cy="12" r="4" />
  <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
</>, p)

export const IconMoon = (p: Props) => svg(
  <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />, p)

export const IconLayers = (p: Props) => svg(<>
  <path d="M12 3l9 4.8-9 4.8-9-4.8z" />
  <path d="M3 12.5l9 4.8 9-4.8" />
  <path d="M3 17l9 4.8 9-4.8" />
</>, p)

export const IconTrash = (p: Props) => svg(<>
  <path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0110.8 3.5h2.4a1.3 1.3 0 011.3 1.3v1.7" />
  <path d="M6.5 6.5l.9 12.2a1.5 1.5 0 001.5 1.3h6.2a1.5 1.5 0 001.5-1.3l.9-12.2" />
</>, p)

export const IconDuplicate = (p: Props) => svg(<>
  <rect x="8" y="8" width="12" height="12" rx="2" />
  <path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" />
</>, p)

export const IconChevronDown = (p: Props) => svg(<path d="M6 9.5l6 6 6-6" />, p)

export const IconChevron = (p: Props) => svg(<path d="M8 10l4 4 4-4" />, p)

/* ── tipografia ──────────────────────────────────────────────────────────── */

export const IconBold = (p: Props) => svg(<>
  <path d="M7 4.5h5.4a3.75 3.75 0 010 7.5H7z" />
  <path d="M7 12h6.2a3.75 3.75 0 010 7.5H7z" />
</>, p)

export const IconItalic = (p: Props) => svg(<>
  <path d="M15.5 4.5h-5M13.5 19.5h-5M14 4.5L10 19.5" />
</>, p)

export const IconUnderline = (p: Props) => svg(<>
  <path d="M7 4v6.5a5 5 0 0010 0V4" />
  <path d="M5.5 20.5h13" />
</>, p)

export const IconStrike = (p: Props) => svg(<>
  <path d="M16.5 6.2A4.4 4.4 0 0012.4 4C9.9 4 8 5.4 8 7.5c0 1.5 1 2.5 2.6 3.1" />
  <path d="M8 16.4A4.6 4.6 0 0012 19c2.6 0 4.4-1.4 4.4-3.4 0-.9-.3-1.6-.9-2.2" />
  <path d="M4 12h16" />
</>, p)

export const IconAlignLeft = (p: Props) => svg(<>
  <path d="M4 6h16M4 11h10M4 16h13M4 21h8" />
</>, p)

export const IconAlignCenter = (p: Props) => svg(<>
  <path d="M4 6h16M7 11h10M5.5 16h13M8 21h8" />
</>, p)

export const IconAlignRight = (p: Props) => svg(<>
  <path d="M4 6h16M10 11h10M7 16h13M12 21h8" />
</>, p)

export const IconLineHeight = (p: Props) => svg(<>
  <path d="M4 5.5l2.2-2.2 2.2 2.2M6.2 3.3v17.4M4 18.5l2.2 2.2 2.2-2.2" />
  <path d="M11.5 6h9M11.5 12h9M11.5 18h9" />
</>, p)

/* ── acciones de estructura ──────────────────────────────────────────────── */

export const IconRotate = (p: Props) => svg(<>
  <path d="M20 12a8 8 0 11-2.6-5.9" />
  <path d="M20.5 3.5V8H16" />
</>, p)

export const IconGroup = (p: Props) => svg(<>
  <rect x="3.5" y="3.5" width="8" height="8" rx="1.4" />
  <rect x="12.5" y="12.5" width="8" height="8" rx="1.4" />
  <path d="M12.5 7.5h4a1.5 1.5 0 011.5 1.5v3.5" strokeDasharray="2.5 2.5" />
</>, p)

export const IconLock = (p: Props) => svg(<>
  <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
  <path d="M8 10.5V7.5a4 4 0 018 0v3" />
</>, p)

export const IconUnlock = (p: Props) => svg(<>
  <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
  <path d="M8 10.5V7.5a4 4 0 017.5-1.9" />
</>, p)

export const IconFolder = (p: Props) => svg(
  <path d="M3.5 6.5A1.5 1.5 0 015 5h4l2 2.5h8a1.5 1.5 0 011.5 1.5v8.5A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5z" />, p)

export const IconFolderPlus = (p: Props) => svg(<>
  <path d="M3.5 6.5A1.5 1.5 0 015 5h4l2 2.5h8a1.5 1.5 0 011.5 1.5v8.5A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5z" />
  <path d="M12 11v5M9.5 13.5h5" />
</>, p)

export const IconDots = (p: Props) => svg(<>
  <circle cx="12" cy="5" r="1.2" fill="currentColor" />
  <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  <circle cx="12" cy="19" r="1.2" fill="currentColor" />
</>, p)

export const IconPencilEdit = (p: Props) => svg(<>
  <path d="M4 20l.9-3.6L15.6 5.7a1.8 1.8 0 012.6 0l1.1 1.1a1.8 1.8 0 010 2.6L8.6 19.1z" />
  <path d="M14.2 7.1l2.7 2.7" />
</>, p)

export const IconCloud = (p: Props) => svg(
  <path d="M7 18.5a4 4 0 01-.4-8A5.5 5.5 0 0117.4 9.6a3.9 3.9 0 01-.4 8.9z" />, p)

export const IconBringFront = (p: Props) => svg(<>
  <rect x="8.5" y="3.5" width="12" height="12" rx="1.6" />
  <path d="M15.5 15.5v3.4a1.6 1.6 0 01-1.6 1.6H5.1a1.6 1.6 0 01-1.6-1.6V10.1a1.6 1.6 0 011.6-1.6h3.4" strokeDasharray="2.5 2.5" />
</>, p)

export const IconSendBack = (p: Props) => svg(<>
  <rect x="3.5" y="8.5" width="12" height="12" rx="1.6" />
  <path d="M8.5 8.5V5.1a1.6 1.6 0 011.6-1.6h8.8a1.6 1.6 0 011.6 1.6v8.8a1.6 1.6 0 01-1.6 1.6h-3.4" strokeDasharray="2.5 2.5" />
</>, p)

export const IconFlipH = (p: Props) => svg(<>
  <path d="M12 3v18" strokeDasharray="2.5 2.5" />
  <path d="M9.5 6.5L4 12l5.5 5.5z" />
  <path d="M14.5 6.5L20 12l-5.5 5.5z" />
</>, p)

export const IconOpacity = (p: Props) => svg(<>
  <circle cx="12" cy="12" r="8.5" />
  <path d="M12 3.5a8.5 8.5 0 000 17z" fill="currentColor" stroke="none" />
</>, p)

export const IconDownload = (p: Props) => svg(<>
  <path d="M12 3.5v11" />
  <path d="M7.5 10.5L12 15l4.5-4.5" />
  <path d="M4.5 17v2A1.5 1.5 0 006 20.5h12a1.5 1.5 0 001.5-1.5v-2" />
</>, p)

/* ── conectores: ruta, clase y puntas ────────────────────────────────────────
   Se dibujan como MUESTRAS, no como simbolos: el boton enseña la forma que va
   a producir. Un icono abstracto de "rombo" obliga a traducir; una punta de
   rombo dibujada a escala se reconoce sin leer. */

export const IconRutaCodos = (p: Props) => svg(
  <path d="M3 6h7v12h11" />, p)

export const IconRutaRecta = (p: Props) => svg(
  <path d="M3 19L21 5" />, p)

export const IconRutaCurva = (p: Props) => svg(
  <path d="M3 18C3 9 12 15 12 8s9-1 9-3" />, p)

/**
 * Una punta de flecha a escala, con su linea.
 *
 * La cabeza ocupa CASI LA MITAD del icono a proposito. La primera version la
 * dibujaba a tamaño realista sobre una linea larga y, a 16px, un triangulo, un
 * rombo y un circulo se veian los tres como una manchita: el icono existia para
 * no tener que leer la etiqueta y obligaba a leerla igual.
 */
export const IconPunta = ({ size = 20, tipo = 'flecha' }: Props & { tipo?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }} aria-hidden>
    <path d={tipo === 'ninguna' ? 'M2 12h20' : tipo === 'barra' ? 'M2 12h18' : 'M2 12h11'} />
    {tipo === 'flecha' && <path d="M13 5.5L20.5 12 13 18.5" fill="none" />}
    {tipo === 'triangulo' && <path d="M13 5.5L21.5 12 13 18.5z" fill="currentColor" />}
    {tipo === 'rombo' && <path d="M13 12l4.2-5 4.2 5-4.2 5z" fill="currentColor" />}
    {tipo === 'circulo' && <circle cx="17" cy="12" r="4.6" fill="currentColor" />}
    {tipo === 'barra' && <path d="M20.5 5v14" strokeWidth={2.6} />}
  </svg>
)

/** Una muestra de trazo por CLASE de relacion. Mismo lenguaje que la leyenda. */
export const IconClase = ({ size = 20, clase = 'flujo' }: Props & { clase?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeLinecap="round" style={{ display: 'block', flexShrink: 0 }} aria-hidden>
    <path d="M3 12h18"
      strokeWidth={clase === 'hueco' ? 1.2 : clase === 'flujo' ? 1.6 : 2}
      strokeDasharray={clase === 'agente' ? '0.5 3.6' : clase === 'fragil' ? '5 3' : clase === 'hueco' ? '3 3' : undefined} />
  </svg>
)

export const IconCrop = (p: Props) => svg(<>
  <path d="M6.5 2.5v15h15" />
  <path d="M2.5 6.5h15v15" />
</>, p)

/* ────────────────────────────────────────────────────────────────────────────
 * LA BARRA CONTEXTUAL (20 ago 2026)
 *
 * Los que faltaban para poder decir en iconos lo que hoy solo se podia decir
 * en menus. Tres de ellos —color de texto, resaltador y relleno— llevan una
 * BANDA de color abajo que pinta el valor actual: sin ella el boton dice "hay
 * un color" pero no CUAL, y hay que abrirlo para enterarse.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Enlace: dos eslabones. */
export const IconLink = (p: Props) => svg(<>
  <path d="M10.5 13.5a4 4 0 005.7 0l2.8-2.8a4 4 0 10-5.7-5.7l-1.4 1.4" />
  <path d="M13.5 10.5a4 4 0 00-5.7 0l-2.8 2.8a4 4 0 105.7 5.7l1.4-1.4" />
</>, p)

/** Una `A` con banda de color: el color del TEXTO. */
export const IconTextColor = ({ color, ...p }: Props & { color?: string }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }} aria-hidden>
    <path d="M5.5 16L10 5.5h1.4L16 16" /><path d="M7.3 12.4h7" />
    <rect x="4" y="18.4" width="16" height="3.2" rx="1.2"
      fill={color ?? 'currentColor'} stroke="none" />
  </svg>
)

/** El marcador, con banda del color de resaltado. */
export const IconHighlight = ({ color, ...p }: Props & { color?: string }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }} aria-hidden>
    <path d="M14.5 3.7l5.8 5.8-7.6 7.6-5.8-5.8z" />
    <path d="M6.9 11.3l-2 4.4 3.6 3.6 4.2-2.2" />
    <rect x="4" y="18.4" width="16" height="3.2" rx="1.2"
      fill={color ?? 'currentColor'} stroke="none" />
  </svg>
)

/**
 * RELLENO y CONTORNO: el mismo circulo, distinto por dentro.
 *
 * Es la gramatica de Miro y funciona porque la diferencia es LITERAL — uno esta
 * lleno, el otro es un anillo. Dos simbolos distintos (un bote de pintura, un
 * lapiz) obligarian a aprenderse una convencion.
 */
export const IconFill = ({ color, ...p }: Props & { color?: string }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24"
    style={{ display: 'block', flexShrink: 0 }} aria-hidden>
    <circle cx="12" cy="12" r="8" fill={color ?? 'currentColor'} />
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={1.3} opacity={.45} />
  </svg>
)

export const IconStroke = ({ color, ...p }: Props & { color?: string }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24"
    style={{ display: 'block', flexShrink: 0 }} aria-hidden>
    <circle cx="12" cy="12" r="7.2" fill="none" stroke={color ?? 'currentColor'} strokeWidth={3.4} />
  </svg>
)

/** El destello de la IA. Cuatro puntas, no una estrella de cinco: es un brillo. */
export const IconSparkle = (p: Props) => svg(<>
  <path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z" />
  <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
</>, p)

/* Los tres estilos de linea, dibujados como lo que son. */
export const IconLineSolid = (p: Props) => svg(<path d="M4 12h16" />, p)
export const IconLineDashed = (p: Props) => svg(
  <path d="M4 12h4.5M12 12h4.5M20 12h.01" strokeDasharray="none" />, p)
export const IconLineDotted = (p: Props) => svg(
  <path d="M4.5 12h.01M9 12h.01M13.5 12h.01M18 12h.01M20.5 12h.01" />, p)

/** Esquina redondeada: un angulo recto con la curva marcada. */
export const IconCorner = (p: Props) => svg(<>
  <path d="M4 20V10a6 6 0 016-6h10" />
  <path d="M4 20h.01M20 4h.01" strokeWidth={2.6} />
</>, p)

export const IconCaretUp = (p: Props) => svg(<path d="M6.5 14.5L12 9l5.5 5.5" />, p)
export const IconCaretDown = (p: Props) => svg(<path d="M6.5 9.5L12 15l5.5-5.5" />, p)

/** Cambiar de figura: tres formas encimadas. */
export const IconShapes = (p: Props) => svg(<>
  <rect x="3.2" y="9.5" width="9" height="9" rx="1.6" />
  <circle cx="16.5" cy="14.5" r="4.4" />
  <path d="M11.2 3.2l4 5.4h-8z" />
</>, p)

/** Fijado por la mano: una tachuela. */
export const IconPin = (p: Props) => svg(<>
  <path d="M9.5 3.5h5l-.8 5.2 3.3 3.3H7l3.3-3.3z" />
  <path d="M12 12v8.5" />
</>, p)
