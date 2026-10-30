'use client'

/**
 * Canvas v4 — la hoja de atajos.
 *
 * Existe porque el v3 la prometia y no la tenia: su registro declaraba `?` como
 * "mostrar atajos", habia un `showShortcutsModal` en el store, y NADA lo abria
 * jamas. Treinta atajos documentados en un archivo que ningun humano podia ver.
 *
 * ⚠️ REGLA: esta lista se deriva de lo que el teclado HACE, no de una tabla
 * paralela. Un catalogo escrito aparte se desincroniza del handler en la
 * primera semana — es literalmente lo que le paso al v3, donde `⌘A` estaba
 * documentado y no existia, y `T` aparecia dos veces para dos herramientas.
 * Cada linea de aqui esta verificada contra los handlers de `Pizarra.tsx` y `input/pointers.ts`.
 */

import { useEffect, useState } from 'react'
import { leerSensibilidad, guardarSensibilidad, SENSIBILIDAD_MIN, SENSIBILIDAD_MAX } from '../input/sensibilidad'
import type { Theme } from '../theme/tokens'

interface Props { theme: Theme; onClose: () => void }

const GRUPOS: Array<{ titulo: string; filas: Array<[string, string]> }> = [
  { titulo: 'Herramientas', filas: [
    ['V', 'Seleccionar'], ['H', 'Mano'], ['N', 'Nota'], ['T', 'Texto'],
    ['R', 'Rectángulo'], ['O', 'Círculo'], ['C', 'Conector'], ['S', 'Sección'],
    ['P', 'Lápiz'], ['M', 'Marcador'], ['E', 'Goma'],
  ]},
  { titulo: 'Moverse', filas: [
    ['Espacio + arrastrar', 'Mover el lienzo, con cualquier herramienta'],
    ['Rueda presionada + arrastrar', 'Mover el lienzo'],
    ['⌘ + arrastrar', 'Mover el lienzo (⌘ + clic quieto abre el enlace)'],
    ['H', 'Herramienta mano'],
    ['Dos dedos', 'Mover el lienzo (trackpad)'],
    ['Rueda / ⇧ + rueda', 'Mover arriba y abajo / a los lados'],
  ]},
  { titulo: 'Zoom', filas: [
    ['Pellizcar', 'Acercar y alejar (trackpad)'],
    ['⌘ + rueda', 'Acercar y alejar bajo el cursor'],
    ['⌘+ / ⌘−', 'Acercar / alejar un nivel'],
    ['⌘0 · ⇧0 · 0', 'Volver al 100%'],
    ['⌘1 · ⇧1', 'Encuadrar todo'],
    ['⌘2 · ⇧2', 'Encuadrar la selección'],
  ]},
  { titulo: 'Capítulos', filas: [
    ['← / →', 'Capítulo anterior / siguiente (sin selección)'],
    ['1 – 9', 'Ir a un capítulo'],
    ['↓ / ↑', 'Bajar y subir dentro del capítulo'],
    ['Esc', 'Vista completa'],
  ] },
  { titulo: 'Seleccionar', filas: [
    ['Clic', 'Elegir'], ['⇧ + clic', 'Sumar a la selección'],
    ['Arrastrar en vacío', 'Marquesina'], ['⌘A', 'Todo'],
    ['⌘⇧A', 'El diagrama entero, desde una de sus piezas'],
    ['Esc', 'Soltar la selección'],
  ]},
  { titulo: 'Editar', filas: [
    ['⌘Z / ⇧⌘Z', 'Deshacer / rehacer'],
    ['⌘C / ⌘X / ⌘V', 'Copiar / cortar / pegar'],
    ['⌘D', 'Duplicar'], ['⌥ + arrastrar', 'Duplicar arrastrando'],
    ['⌫', 'Eliminar'], ['Flechas', 'Empujar 1px · 10 con ⇧'],
    ['Doble clic', 'Editar el texto'],
  ]},
  { titulo: 'Dar forma', filas: [
    ['⌘B / ⌘I / ⌘U', 'Negrita / cursiva / subrayado'],
    ['⌘G / ⌘⇧G', 'Agrupar / desagrupar'],
    ['Doble clic · Esc', 'Entrar a un miembro del grupo · volver al grupo'],
    ['⌘] / ⌘[', 'Subir / bajar un paso'],
    ['⌥⌘] / ⌥⌘[', 'Al frente / al fondo'],
    ['⌘⇧L', 'Bloquear / desbloquear'],
    ['⇧ al redimensionar', 'Mantener la proporción'],
    ['⇧ al girar', 'Escalones de 15°'],
  ]},
]

export function Atajos({ theme: t, onClose }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div data-atajos onPointerDown={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 120, display: 'grid', placeItems: 'center',
        background: t.name === 'oscuro' ? 'rgba(4,5,9,.62)' : 'rgba(20,20,30,.28)',
        backdropFilter: 'blur(2px)',
      }}>
      <div onPointerDown={e => e.stopPropagation()}
        style={{
          width: 'min(880px, 92vw)', maxHeight: '84vh', overflowY: 'auto', padding: '20px 22px 24px',
          borderRadius: 16, background: t.roles.card.fill,
          border: `1px solid ${t.roles.card.stroke.color}`,
          boxShadow: t.name === 'oscuro' ? '0 24px 70px rgba(0,0,0,.7)' : '0 24px 70px rgba(15,15,25,.22)',
        }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
          <strong style={{ font: '900 20px CanvasSlab, Georgia, serif', color: t.text.title }}>Atajos</strong>
          <span style={{ font: '600 12px CanvasSans, system-ui', color: t.text.caption }}>
            ? para abrir · Esc para cerrar
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '18px 30px' }}>
          {GRUPOS.map(g => (
            <div key={g.titulo}>
              <div style={{
                font: '700 10.5px CanvasSans, system-ui', letterSpacing: .7, textTransform: 'uppercase',
                color: t.accent, marginBottom: 7,
              }}>{g.titulo}</div>
              {g.filas.map(([tecla, que]) => (
                <div key={tecla} style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, padding: '3px 0',
                  font: '600 12.5px CanvasSans, system-ui', color: t.text.body,
                }}>
                  <kbd style={{
                    flexShrink: 0, minWidth: 26, textAlign: 'center', padding: '2px 6px', borderRadius: 5,
                    font: '700 11px CanvasMono, ui-monospace, monospace',
                    background: t.name === 'oscuro' ? 'rgba(255,255,255,.07)' : 'rgba(15,15,25,.055)',
                    border: `1px solid ${t.roles.card.stroke.color}`, color: t.text.title,
                  }}>{tecla}</kbd>
                  <span style={{ color: t.text.caption }}>{que}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <Sensibilidades theme={t} />
      </div>
    </div>
  )
}

/**
 * Velocidad del paneo y del zoom (5 oct 2026). Vive aquí porque esta hoja es la que explica cómo moverse;
 * se aplica al instante, sin botón de guardar.
 */
function Sensibilidades({ theme: t }: { theme: Theme }) {
  const [s, setS] = useState(leerSensibilidad)
  const fila = (clave: 'paneo' | 'zoom', titulo: string, ayuda: string) => (
    <label style={{ display: 'grid', gridTemplateColumns: '120px 1fr 44px', alignItems: 'center', gap: 12,
      font: '600 12.5px CanvasSans, system-ui', color: t.text.body }}>
      <span title={ayuda}>{titulo}</span>
      <input type="range" min={SENSIBILIDAD_MIN} max={SENSIBILIDAD_MAX} step={0.05} value={s[clave]}
        aria-label={`Sensibilidad de ${titulo.toLowerCase()}`}
        onChange={e => setS(guardarSensibilidad({ [clave]: Number(e.target.value) }))}
        style={{ accentColor: t.accent, width: '100%' }} />
      <span style={{ font: '700 11px CanvasMono, ui-monospace, monospace', color: t.text.caption, textAlign: 'right' }}>
        {s[clave].toFixed(2)}×
      </span>
    </label>
  )
  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${t.roles.card.stroke.color}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <div style={{ font: '700 10.5px CanvasSans, system-ui', letterSpacing: .7, textTransform: 'uppercase', color: t.accent }}>
          Sensibilidad
        </div>
        {(s.paneo !== 1 || s.zoom !== 1) && (
          <button type="button" onClick={() => setS(guardarSensibilidad({ paneo: 1, zoom: 1 }))}
            style={{ font: '600 11.5px CanvasSans, system-ui', color: t.text.caption, background: 'none', border: 0,
              cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
            Volver a 1×
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
        {fila('paneo', 'Desplazar', 'Dos dedos, rueda y ⇧ + rueda')}
        {fila('zoom', 'Zoom', 'Pellizcar y ⌘ + rueda, bajo el cursor')}
      </div>
    </div>
  )
}
