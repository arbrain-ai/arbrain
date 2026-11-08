/**
 * La plantilla «Clase» de «＋ Nuevo lienzo» (7 nov 2026, Daniel: «si quiero hacer una clase la experiencia manual de usuario
 * no es tan buena»). Un título y tres bloques que se leen de izquierda a derecha: qué van a aprender, cómo funciona y qué
 * hacen hoy. Cada bloque es una sección con una nota adentro, lista para escribir encima.
 *
 * Nace de la MANO (sin `origin`): el compilador no la gobierna y Daniel la mueve como quiera. Pura salvo la medición, que se
 * inyecta: el servidor la arma con `serverMeasureContext` (tests/canvas/plantilla-clase.test.ts).
 */
import type { Camera, CanvasElement, FrameElement, SectionTint, TextElement } from './element'
import type { MeasureContext, TextStyle } from '../text/types'
import { wrapText } from '../text/layout'
import { createSection, createSticky } from './create'

export const BLOQUES_CLASE: { titulo: string; nota: string; tinte: SectionTint }[] = [
  { titulo: '1 · Qué van a aprender', nota: 'La idea en una frase', tinte: 'morado' },
  { titulo: '2 · Cómo funciona', nota: 'El mecanismo, paso a paso', tinte: 'azul' },
  { titulo: '3 · Qué hacen hoy', nota: 'La acción concreta al salir', tinte: 'verde' },
]

const ANCHO = 520, ALTO = 560, HUECO = 60
const TITULO: TextStyle = { family: 'roboto-slab', weight: 900, size: 64 }

export function plantillaClase(ctx: MeasureContext, titulo: string): { elements: CanvasElement[]; camera: Camera } {
  const total = BLOQUES_CLASE.length * ANCHO + (BLOQUES_CLASE.length - 1) * HUECO
  const texto = titulo.trim() || 'Clase'
  const laid = wrapText(ctx, texto, TITULO, { maxWidth: total })
  const cabeza: TextElement = {
    id: `clase-titulo-${Date.now().toString(36)}`, type: 'text',
    x: 0, y: 0, width: total, height: Math.ceil(laid.height), rotation: 0, zIndex: 1, opacity: 1, locked: false,
    version: 1, createdAt: Date.now(), updatedAt: Date.now(),
    text: texto, lines: laid.lines.map(l => l.text), style: TITULO, align: 'left',
  }
  const y0 = cabeza.height + 56
  const elements: CanvasElement[] = [cabeza]
  BLOQUES_CLASE.forEach((b, i) => {
    const x = i * (ANCHO + HUECO)
    const seccion: FrameElement = { ...createSection({ x, y: y0, width: ANCHO, height: ALTO }, b.titulo), tint: b.tinte }
    elements.push(seccion, createSticky(ctx, { x: x + ANCHO / 2, y: y0 + 190 }, b.nota, 2 + i))
  })
  const alto = y0 + ALTO
  return { elements, camera: { x: total / 2, y: alto / 2, zoom: 0.55 } }
}
