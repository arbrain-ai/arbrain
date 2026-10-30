/**
 * Canvas v4 — fondo del lienzo.
 *
 * Liso, puntos o cuadricula. Suena trivial y tiene una decision que separa una
 * pizarra seria de una de juguete: la DENSIDAD se adapta al zoom.
 *
 * Una grilla de paso fijo en el mundo se vuelve inservible en los dos extremos:
 * al alejarse, las lineas se juntan hasta ser un gris sucio que tapa el
 * contenido; al acercarse, quedan tan separadas que dejan de orientar. La
 * solucion es saltar de escala por potencias, como una regla de verdad: cuando
 * el paso en pantalla baja de un minimo, se usa el siguiente multiplo.
 */

import type { Camera } from '../model/element'
import type { Theme } from '../theme/tokens'
import type { Viewport } from './viewport'

export type BackgroundKind = 'liso' | 'puntos' | 'cuadricula'

/** Paso base en unidades de mundo. */
const PASO_BASE = 20
/** Por debajo de esto en pantalla, la grilla estorba en vez de orientar. */
const MIN_PX = 14

/** El paso de mundo que toca a este zoom, saltando de escala en potencias de 2. */
export function pasoParaZoom(zoom: number): number {
  let paso = PASO_BASE
  while (paso * zoom < MIN_PX) paso *= 2
  while (paso * zoom > MIN_PX * 4 && paso > 1) paso /= 2
  return paso
}

/**
 * Pinta el fondo. Se llama ANTES de la transformada de camara y trabaja en
 * coordenadas de PANTALLA: dibujar una grilla infinita en coordenadas de mundo
 * obligaria a recorrer todo el plano, y en pantalla son dos bucles acotados por
 * el tamaño del viewport.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  kind: BackgroundKind,
  camera: Camera,
  vp: Viewport,
  theme: Theme,
): void {
  ctx.fillStyle = theme.canvas
  ctx.fillRect(0, 0, vp.width, vp.height)
  if (kind === 'liso') return

  const paso = pasoParaZoom(camera.zoom)
  const pasoPx = paso * camera.zoom

  // Origen del mundo proyectado a pantalla, y de ahi el primer punto visible.
  const ox = vp.width / 2 - camera.x * camera.zoom
  const oy = vp.height / 2 - camera.y * camera.zoom
  const x0 = ox - Math.ceil(ox / pasoPx) * pasoPx
  const y0 = oy - Math.ceil(oy / pasoPx) * pasoPx

  ctx.save()
  if (kind === 'puntos') {
    // El punto NO crece con el zoom: es una referencia, no contenido. Un punto
    // que engorda al acercarse se convierte en una mancha.
    const r = Math.min(1.6, Math.max(0.9, 1.1))
    ctx.fillStyle = theme.grid
    for (let x = x0; x < vp.width + pasoPx; x += pasoPx) {
      for (let y = y0; y < vp.height + pasoPx; y += pasoPx) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else {
    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    // El medio pixel evita que una linea de 1px se reparta entre dos y se vea
    // gris y borrosa en vez de nitida.
    for (let x = x0; x < vp.width + pasoPx; x += pasoPx) {
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, vp.height)
    }
    for (let y = y0; y < vp.height + pasoPx; y += pasoPx) {
      ctx.moveTo(0, Math.round(y) + 0.5)
      ctx.lineTo(vp.width, Math.round(y) + 0.5)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Ajusta un punto de mundo a la grilla vigente. */
export function ajustarAGrilla(p: { x: number; y: number }, zoom: number, activo: boolean) {
  if (!activo) return p
  const paso = pasoParaZoom(zoom)
  return { x: Math.round(p.x / paso) * paso, y: Math.round(p.y / paso) * paso }
}
