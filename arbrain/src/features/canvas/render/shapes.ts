/**
 * Canvas v4 — geometria de las figuras. UN SOLO LUGAR.
 *
 * En el v3 esto estaba escrito TRES veces (el renderer que dibuja, el hit-test
 * que clickea y el modulo que ancla conectores) y ya habian divergido: una
 * estrella se anclaba con un radio interno distinto al que dibujaba, y el
 * hit-test ignoraba el espejado por completo.
 *
 * Aqui hay una funcion que devuelve el CONTORNO como puntos, y todos —dibujar,
 * clickear, anclar— la consumen. Si algun dia diverge, divergen los tres
 * juntos, que es la unica forma honesta de fallar.
 */

import type { ShapeKind } from '../model/element'

export interface Rect { x: number; y: number; width: number; height: number }
export interface Punto { x: number; y: number }

/**
 * El contorno de una figura, en coordenadas de mundo.
 * `null` para el rectangulo redondeado, que se pinta con su propio camino.
 */
export function contorno(kind: ShapeKind, r: Rect): Punto[] | null {
  const { x, y, width: w, height: h } = r
  const cx = x + w / 2, cy = y + h / 2

  switch (kind) {
    case 'rect':
    case 'pill':
      return null   // caminos redondeados propios

    case 'ellipse':
      return null   // arco propio

    case 'triangle':
      return [{ x: cx, y }, { x: x + w, y: y + h }, { x, y: y + h }]

    case 'diamond':
      return [{ x: cx, y }, { x: x + w, y: cy }, { x: cx, y: y + h }, { x, y: cy }]

    case 'hexagon': {
      // Hexagono "de tarjeta": lados verticales rectos y puntas a los lados.
      // Es el que se usa en diagramas; el hexagono regular se ve decorativo.
      const corte = Math.min(w * 0.22, h * 0.5)
      return [
        { x: x + corte, y }, { x: x + w - corte, y },
        { x: x + w, y: cy },
        { x: x + w - corte, y: y + h }, { x: x + corte, y: y + h },
        { x, y: cy },
      ]
    }

    case 'arrow': {
      // Flecha de bloque: cuerpo + punta. Las proporciones se acotan para que
      // no degenere en una punta sola cuando la caja es angosta.
      const puntaW = Math.min(w * 0.38, h * 0.9)
      const cuerpoY = h * 0.24
      return [
        { x, y: y + cuerpoY }, { x: x + w - puntaW, y: y + cuerpoY },
        { x: x + w - puntaW, y }, { x: x + w, y: cy },
        { x: x + w - puntaW, y: y + h }, { x: x + w - puntaW, y: y + h - cuerpoY },
        { x, y: y + h - cuerpoY },
      ]
    }

    case 'star': {
      const puntas = 5
      const rx = w / 2, ry = h / 2
      const interior = 0.42   // proporcion del radio interno
      const pts: Punto[] = []
      for (let i = 0; i < puntas * 2; i++) {
        const ang = (Math.PI * i) / puntas - Math.PI / 2
        const f = i % 2 === 0 ? 1 : interior
        pts.push({ x: cx + Math.cos(ang) * rx * f, y: cy + Math.sin(ang) * ry * f })
      }
      return pts
    }
  }
}

/** Traza la figura en el contexto. La UNICA funcion que dibuja formas. */
export function trazarFigura(
  ctx: CanvasRenderingContext2D, kind: ShapeKind, r: Rect, radio: number,
): void {
  const pts = contorno(kind, r)
  if (pts) {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
    return
  }
  if (kind === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2)
    return
  }
  // rect y pill: mismo camino, distinto radio.
  const rr = kind === 'pill' ? Math.min(r.width, r.height) / 2 : Math.min(radio, r.width / 2, r.height / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(r.x, r.y, r.width, r.height, rr); return }
  ctx.moveTo(r.x + rr, r.y)
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + r.height, rr)
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x, r.y + r.height, rr)
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y, rr)
  ctx.arcTo(r.x, r.y, r.x + r.width, r.y, rr)
  ctx.closePath()
}

/**
 * ¿El punto cae DENTRO de la figura? Usa el mismo contorno que se dibuja.
 *
 * Para las figuras con vertices se usa el test del rayo; una estrella tiene
 * huecos entre sus puntas y tratarla como su caja hace que se pueda agarrar
 * por el aire.
 */
export function dentroDeFigura(kind: ShapeKind, r: Rect, p: Punto): boolean {
  if (kind === 'ellipse') {
    const rx = r.width / 2, ry = r.height / 2
    if (rx <= 0 || ry <= 0) return false
    const dx = (p.x - (r.x + rx)) / rx, dy = (p.y - (r.y + ry)) / ry
    return dx * dx + dy * dy <= 1
  }
  const pts = contorno(kind, r)
  if (!pts) {
    return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
  }
  let dentro = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y, yj = pts[j].y
    if ((yi > p.y) !== (yj > p.y)) {
      const xCorte = ((pts[j].x - pts[i].x) * (p.y - yi)) / (yj - yi) + pts[i].x
      if (p.x < xCorte) dentro = !dentro
    }
  }
  return dentro
}
