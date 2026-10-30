/**
 * Freehand outline — variable-width stroke geometry via perfect-freehand.
 *
 * Un trazo se convierte en un POLIGONO de contorno (outline) que se rellena
 * con fill(), en vez de N ctx.stroke() por segmento con lineWidth variable
 * (el approach viejo producia "cuentas"/banding en cada junta). Mismo motor
 * para el trazo committeado y el draft en vivo (AMBOS en world-space — el
 * draft reaplica la misma transform de camara en drawFreehandDraft):
 * la geometria es identica y el preview coincide 1:1 con el resultado.
 */
import { getStroke } from 'perfect-freehand'

export interface FreehandOutlinePoint {
  x: number
  y: number
  pressure?: number
}

export interface FreehandOutlineOpts {
  /** Diametro base del trazo (unidades del espacio de los puntos). */
  size: number
  /** 0..1 — cuanto afecta la presion al ancho. */
  thinning: number
  /** 0..1 — suavizado del contorno generado. */
  smoothing: number
  /** 0..1 — cuanto se "arrastra" el punto hacia el anterior (filtra jitter). */
  streamline: number
  /** true mientras el trazo sigue en curso (evita el taper de cierre al final). */
  live?: boolean
}

const NEUTRAL_PRESSURE = 0.5
const PRESSURE_EPSILON = 0.03

// Parametros canonicos del motor freehand. Viven aqui (modulo puro) para que
// renderer, draft y factories importen del mismo lugar sin ciclos.
/** Multiplicador strokeWidth → diametro pf del boligrafo (calza el look previo). */
export const FREEDRAW_SIZE_FACTOR = 1.25
export const FREEDRAW_THINNING = 0.65
export const FREEDRAW_STREAMLINE = 0.5
/** El marcador es casi de ancho constante. */
export const HIGHLIGHTER_THINNING = 0.15
export const HIGHLIGHTER_STREAMLINE = 0.55

/**
 * Un mouse (y un dedo en iOS) reporta pressure constante — con presion "real"
 * plana el trazo queda muerto. perfect-freehand puede SIMULAR presion por
 * velocidad; detectamos si el input trae presion real con variacion.
 */
export function hasRealPressure(points: ReadonlyArray<FreehandOutlinePoint>): boolean {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    const p = typeof point.pressure === 'number' && Number.isFinite(point.pressure)
      ? point.pressure
      : NEUTRAL_PRESSURE
    if (p < min) min = p
    if (p > max) max = p
  }
  if (!Number.isFinite(min)) return false
  return max - min > PRESSURE_EPSILON
}

export function freehandOutline(
  points: ReadonlyArray<FreehandOutlinePoint>,
  opts: FreehandOutlineOpts,
): number[][] {
  const input = points.map(point => [point.x, point.y, pressureOrNeutral(point.pressure)])
  return getStroke(input, {
    size: Math.max(0.5, opts.size),
    thinning: clamp01(opts.thinning),
    smoothing: clamp01(opts.smoothing),
    streamline: clamp01(opts.streamline),
    simulatePressure: !hasRealPressure(points),
    last: !opts.live,
  })
}

/**
 * Path2D suave desde el poligono del outline (midpoint quadratic smoothing —
 * el patron canonico de getSvgPathFromStroke, pero directo a Path2D).
 */
export function freehandOutlinePath(
  points: ReadonlyArray<FreehandOutlinePoint>,
  opts: FreehandOutlineOpts,
): Path2D | null {
  const outline = freehandOutline(points, opts)
  if (outline.length < 3) return null
  const path = new Path2D()
  const first = outline[0]
  path.moveTo(first[0], first[1])
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  }
  path.closePath()
  return path
}

function pressureOrNeutral(value: number | undefined): number {
  return clamp01(typeof value === 'number' && Number.isFinite(value) ? value : NEUTRAL_PRESSURE)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}
