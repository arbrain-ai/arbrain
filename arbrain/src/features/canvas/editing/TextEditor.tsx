'use client'

/**
 * Canvas v4 — edicion de texto.
 *
 * Un textarea REAL posicionado sobre el elemento, no un editor dibujado en el
 * canvas. Razon: el cursor, la seleccion, el teclado del sistema, el dictado por
 * voz, el corrector, copiar y pegar, y el teclado de iPad son cosas que el
 * navegador ya resuelve y que reimplementar sobre canvas es una fuente
 * inagotable de bugs.
 *
 * REGLA: mientras se edita, el elemento NO se pinta en el canvas — o se ve el
 * texto dos veces, ligeramente desalineado. El v3 tenia exactamente ese bug
 * (su ADR lo lista: "editor de texto duplicado, overlay + bound text coexisten").
 *
 * ⚠️ LO QUE ESCRIBES TIENE QUE CAER DONDE VA A QUEDAR.
 *
 * Hasta el 20 ago 2026 el textarea se pegaba arriba a la izquierda de la figura
 * y el motor pintaba el resultado CENTRADO: el texto saltaba de sitio al soltar
 * el cursor. Un editor que no coincide con su resultado es peor que no tener
 * editor — te obliga a escribir a ciegas y a corregir despues. Ahora el
 * contenedor centra verticalmente y el textarea hereda la MISMA alineacion
 * horizontal que usa el motor, leida del mismo campo.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CanvasElement, Camera } from '../model/element'
import type { Viewport } from '../render/viewport'
import { worldToScreen } from '../render/viewport'
import { cssFont } from '../text/metrics-browser'
import type { Theme } from '../theme/tokens'

interface Props {
  element: CanvasElement
  camera: Camera
  viewport: Viewport
  theme: Theme
  onCommit: (texto: string) => void
  onCancel: () => void
}

/** El texto que se esta editando, sea de un bloque libre, una figura o una seccion. */
function textoDe(el: CanvasElement): string {
  if (el.type === 'text') return el.text
  if (el.type === 'shape') return el.text?.[0]?.text ?? ''
  if (el.type === 'frame') return el.title
  return ''
}

export function TextEditor({ element, camera, viewport, theme, onCommit, onCancel }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [valor, setValor] = useState(() => textoDe(element))

  /** El alto se ajusta al contenido para poder centrar la caja verticalmente. */
  const ajustarAlto = useCallback(() => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [])

  useLayoutEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.focus()
    // WKWebView: el `mouseup` del doble clic que abrio el editor puede devolver el foco al lienzo justo despues de
    // montar. Se reclama otra vez en el siguiente cuadro si se perdio, sin mover el cursor.
    const volver = requestAnimationFrame(() => { if (document.activeElement !== ta) ta.focus({ preventScroll: true }) })
    // El cursor al FINAL, no seleccionando todo: seleccionar todo hace que la
    // primera tecla borre lo que habia, que casi nunca es lo que se quiere al
    // entrar a corregir una palabra.
    ta.setSelectionRange(valor.length, valor.length)
    ajustarAlto()
    return () => cancelAnimationFrame(volver)
  // Solo al montar: re-poner el cursor en cada tecla lo mandaria al final
  // aunque estuvieras corrigiendo en medio de la frase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(ajustarAlto, [valor, camera.zoom, ajustarAlto])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      // Enter guarda; Shift+Enter hace salto de linea. Es la convencion de
      // cualquier herramienta con cajas de texto cortas.
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(valor) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [valor, onCommit, onCancel])

  const estilo = element.type === 'text'
    ? element.style
    : element.type === 'shape'
      ? element.text?.[0]?.style ?? { family: 'montserrat' as const, weight: 700, size: 20 }
      : { family: 'montserrat' as const, weight: 800, size: 14 }

  /**
   * LA MISMA REGLA QUE EL MOTOR, leida del mismo campo.
   *
   * Si esta condicion se escribiera distinto aqui que en `drawBoundText`, el
   * editor y el resultado divergirian en silencio — que es exactamente como el
   * v3 acabo con la geometria de sus figuras en tres archivos.
   */
  const alinea: 'left' | 'center' | 'right' =
      element.type === 'text' ? element.align
    : element.type === 'shape' ? (element.textAlign ?? (element.origin ? 'left' : 'center'))
    : 'left'
  // Una figura centra verticalmente; un bloque de texto crece hacia abajo desde
  // su borde superior, que es lo que su arrastre definio.
  const centraVertical = element.type === 'shape'

  const tl = worldToScreen({ x: element.x, y: element.y }, camera, viewport)
  const pad = element.type === 'shape' ? 16 : 0
  const z = camera.zoom

  return (
    <div style={{
      position: 'absolute',
      left: tl.x + pad * z,
      top: tl.y + pad * z,
      width: Math.max(60, (element.width - pad * 2) * z),
      height: Math.max(28, (element.height - pad * 2) * z),
      display: 'flex',
      alignItems: centraVertical ? 'center' : 'flex-start',
      justifyContent: 'stretch',
      // El marco va en el CONTENEDOR, no en el textarea: sobre el textarea se
      // encogeria y creceria con el texto, y parpadearia en cada tecla.
      border: `1.5px solid ${theme.selection.color}`,
      borderRadius: 6,
      zIndex: 10,
      overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      <textarea
        ref={ref}
        value={valor}
        onChange={e => setValor(e.target.value)}
        onBlur={() => onCommit(valor)}
        data-canvas-editing="true"
        spellCheck={false}
        rows={1}
        style={{
          width: '100%',
          font: cssFont({ ...estilo, size: estilo.size * z }),
          lineHeight: 1.25,
          textAlign: alinea,
          color: theme.text.title,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'none',
          padding: 0,
          margin: 0,
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      />
    </div>
  )
}
