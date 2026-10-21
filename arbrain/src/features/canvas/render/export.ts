/**
 * Canvas v4 — exportar a imagen.
 *
 * Se re-renderiza en un canvas APARTE con su propia camara, en vez de capturar
 * el que esta en pantalla. Capturar la pantalla exporta lo que se ve — con el
 * zoom actual, cortado por el viewport y con las guias y manijas encima. Un
 * export debe dar el CONTENIDO, no la sesion.
 *
 * HECHO A1 reusado: el techo de 4096px del presupuesto de iOS Safari aplica
 * igual aqui. Un canvas de export tambien puede exceder el limite del navegador,
 * y falla en el mismo sitio.
 */

import type { CanvasElement } from '../model/element'
import { visualBounds } from '../model/element'
import type { Theme } from '../theme/tokens'
import { render } from './engine'

const MAX_LADO = 4096
const MARGEN = 48

export interface ExportOptions {
  /** Multiplicador sobre el tamaño real. 2 = retina. */
  escala?: number
  /** Fondo transparente en vez del color del tema. */
  transparente?: boolean
  /** Solo estos elementos. Vacio o ausente = todos. */
  soloIds?: ReadonlySet<string>
  /** Lado mayor maximo en px (por defecto el techo de 4096). Las miniaturas piden ~400. */
  ladoMax?: number
  /** Margen alrededor del contenido en unidades del lienzo (por defecto 48). */
  margen?: number
  /** Formato del blob (por defecto PNG). `image/webp` + `calidad` para miniaturas. */
  mime?: 'image/png' | 'image/webp'
  calidad?: number
}

/** Renderiza a un canvas nuevo y devuelve el blob PNG. */
export async function exportarPNG(
  elements: CanvasElement[], theme: Theme, options: ExportOptions = {},
): Promise<Blob | null> {
  const visibles = options.soloIds?.size
    ? elements.filter(e => options.soloIds!.has(e.id))
    : elements
  if (visibles.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of visibles) {
    // La caja VISIBLE, no la del objeto: el pie de una tarjeta cuelga fuera y
    // se quedaba cortado a media frase en el PNG.
    const b = visualBounds(el)
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
  }
  const margen = options.margen ?? MARGEN
  const w = maxX - minX + margen * 2
  const h = maxY - minY + margen * 2

  // La escala pedida se ACOTA al presupuesto: pedir 4x sobre un mapa grande
  // produce un canvas que el navegador rechaza, y el fallo aparece como un PNG
  // vacio sin explicacion.
  const pedida = options.escala ?? 2
  const escala = Math.min(pedida, Math.min(options.ladoMax ?? MAX_LADO, MAX_LADO) / Math.max(w, h))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * escala)
  canvas.height = Math.round(h * escala)

  render(canvas, {
    elements: visibles,
    camera: { x: minX + w / 2 - margen, y: minY + h / 2 - margen, zoom: 1 },
    theme: options.transparente
      // Fondo transparente: se pinta con un canvas de color nulo y el motor
      // pone su fillRect igual, asi que se limpia despues.
      ? { ...theme, canvas: 'rgba(0,0,0,0)' }
      : theme,
    viewport: { width: w, height: h, dpr: escala },
    background: 'liso',
    // Sin seleccion, sin guias, sin manijas: eso es estado de sesion, no
    // contenido. Exportar con la caja de seleccion encima es el error clasico.
    selectedIds: undefined,
    guias: [],
    marquee: null,
    conectando: null,
    draft: null,
  })

  return new Promise(resolve => canvas.toBlob(b => resolve(b), options.mime ?? 'image/png', options.calidad))
}

/** Dispara la descarga. Se separa del render para poder probar el blob solo. */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  // Liberar en el siguiente tick: revocarla de inmediato cancela la descarga
  // en algunos navegadores antes de que empiece.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
