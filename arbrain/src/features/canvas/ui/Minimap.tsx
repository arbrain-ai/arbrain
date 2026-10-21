'use client'

/**
 * Canvas v4 — minimapa.
 *
 * Un lienzo infinito sin minimapa es un cuarto oscuro: si algo queda fuera de
 * pantalla, no hay forma de saber que existe ni hacia donde está. El minimapa
 * es la respuesta a "¿dónde estoy y qué más hay?".
 *
 * Se dibuja con las CAJAS, no con el contenido: un minimapa que intenta ser una
 * miniatura fiel es ilegible a ese tamaño y caro de mantener. Lo que se necesita
 * es la silueta y dónde mira la cámara.
 *
 * BARATO A PROPÓSITO (5 oct 2026). Era un SVG con un `<rect>` por elemento que
 * React reconciliaba en CADA cuadro de paneo: 532 nodos y su recálculo de
 * estilos para mover un solo rectángulo. Ahora las siluetas son un canvas que
 * se repinta solo cuando cambian los elementos o el encuadre del mapa, y lo
 * único que sigue a la cámara cuadro a cuadro es el rectángulo de la vista.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { CanvasElement } from '../model/element'
import { bounds } from '../model/element'
import { estiloDeRol, type Theme } from '../theme/tokens'
import type { Viewport } from '../render/viewport'
import { useCamara, type CamaraViva } from './CamaraViva'

interface Props {
  elements: CanvasElement[]
  camara: CamaraViva
  viewport: Viewport
  theme: Theme
  onJump: (world: { x: number; y: number }) => void
}

const ANCHO = 190
const ALTO = 128
const PAD = 8

interface Mundo { minX: number; minY: number; w: number; h: number }

export function Minimap({ elements, camara, viewport, theme: t, onJump }: Props) {
  const camera = useCamara(camara)
  // Las cajas del contenido: solo cambian cuando cambian los elementos.
  const contenido = useMemo(() => {
    if (elements.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of elements) {
      const b = bounds(el)
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
    }
    return { minX, minY, maxX, maxY }
  }, [elements])

  if (!contenido) return null
  // La vista actual entra en el encuadre aunque este fuera del contenido:
  // si no, al alejarse del material el rectangulo de camara se sale del
  // minimapa y deja de decir donde estas — justo cuando mas falta hace.
  const halfW = viewport.width / 2 / camera.zoom
  const halfH = viewport.height / 2 / camera.zoom
  const minX = Math.min(contenido.minX, camera.x - halfW), maxX = Math.max(contenido.maxX, camera.x + halfW)
  const minY = Math.min(contenido.minY, camera.y - halfH), maxY = Math.max(contenido.maxY, camera.y + halfH)
  const mundo: Mundo = { minX, minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }

  const escala = Math.min((ANCHO - PAD * 2) / mundo.w, (ALTO - PAD * 2) / mundo.h)
  const offX = PAD + ((ANCHO - PAD * 2) - mundo.w * escala) / 2
  const offY = PAD + ((ALTO - PAD * 2) - mundo.h * escala) / 2

  const vista = {
    x: offX + (camera.x - viewport.width / 2 / camera.zoom - mundo.minX) * escala,
    y: offY + (camera.y - viewport.height / 2 / camera.zoom - mundo.minY) * escala,
    w: (viewport.width / camera.zoom) * escala,
    h: (viewport.height / camera.zoom) * escala,
  }

  return (
    <div
      data-minimapa
      onPointerDown={e => {
        const r = e.currentTarget.getBoundingClientRect()
        // Click = saltar ahi. Es el gesto que todo el mundo intenta primero.
        onJump({
          x: mundo.minX + (e.clientX - r.left - offX) / escala,
          y: mundo.minY + (e.clientY - r.top - offY) / escala,
        })
      }}
      style={{
        position: 'absolute', left: 14, bottom: 14, width: ANCHO, height: ALTO,
        background: t.roles.card.fill,
        border: `1px solid ${t.roles.card.stroke.color}`,
        borderRadius: 10, cursor: 'pointer', overflow: 'hidden', zIndex: 20,
        boxShadow: t.name === 'oscuro' ? '0 8px 24px rgba(0,0,0,.5)' : '0 8px 24px rgba(15,15,25,.09)',
      }}>
      <Siluetas elements={elements} theme={t} escala={escala} offX={offX} offY={offY} minX={mundo.minX} minY={mundo.minY} />
      <svg width={ANCHO} height={ALTO} style={{ display: 'block', position: 'absolute', inset: 0 }}>
        <rect x={vista.x} y={vista.y} width={vista.w} height={vista.h}
          fill={t.accent} fillOpacity={0.10}
          stroke={t.accent} strokeWidth={1.5} rx={2} />
      </svg>
    </div>
  )
}

/**
 * Las siluetas. Se repintan solo si cambia algo de lo que reciben: mientras la vista
 * se mueve dentro del contenido, el encuadre del mapa no cambia y esto no hace nada.
 */
function Siluetas({ elements, theme: t, escala, offX, offY, minX, minY }: {
  elements: CanvasElement[]; theme: Theme; escala: number; offX: number; offY: number; minX: number; minY: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (cv.width !== ANCHO * dpr) { cv.width = ANCHO * dpr; cv.height = ALTO * dpr }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, ANCHO, ALTO)
    for (const el of elements) {
      // Los conectores no se pintan: a este tamaño son ruido que ensucia la
      // silueta sin aportar orientacion.
      if (el.type === 'connector') continue
      const b = bounds(el)
      const x = offX + (b.x - minX) * escala
      const y = offY + (b.y - minY) * escala
      const w = Math.max(1.5, b.width * escala)
      const h = Math.max(1.5, b.height * escala)
      ctx.fillStyle = el.type === 'ink' ? t.text.caption
        : el.type === 'frame' ? t.roles.tray.stroke.color
        : el.type === 'shape' ? estiloDeRol(t, el.role).stroke.color
        : t.text.body
      ctx.globalAlpha = el.type === 'frame' ? 0.12 : 0.42
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 1.5)
      else ctx.rect(x, y, w, h)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }, [elements, t, escala, offX, offY, minX, minY])
  return <canvas ref={ref} style={{ width: ANCHO, height: ALTO, display: 'block', position: 'absolute', inset: 0 }} />
}

