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
import { tr, trMarca } from '@/shared/i18n'

interface Props { theme: Theme; onClose: () => void }

const GRUPOS: Array<{ titulo: string; filas: Array<[string, string]> }> = [
  { titulo: trMarca('Herramientas'), filas: [
    ['V', trMarca('Seleccionar')], ['H', trMarca('Mano')], ['N', trMarca('Nota')], ['T', trMarca('Texto')],
    ['R', trMarca('Rectángulo')], ['O', trMarca('Círculo')], ['C', trMarca('Conector')], ['S', trMarca('Sección')],
    ['P', trMarca('Lápiz')], ['M', trMarca('Marcador')], ['E', trMarca('Goma')],
  ]},
  { titulo: trMarca('Moverse'), filas: [
    [trMarca('Espacio + arrastrar'), trMarca('Mover el lienzo, con cualquier herramienta')],
    [trMarca('Rueda presionada + arrastrar'), trMarca('Mover el lienzo')],
    [trMarca('⌘ + arrastrar'), trMarca('Mover el lienzo (⌘ + clic quieto abre el enlace)')],
    ['H', trMarca('Herramienta mano')],
    [trMarca('Dos dedos'), trMarca('Mover el lienzo (trackpad)')],
    [trMarca('Rueda / ⇧ + rueda'), trMarca('Mover arriba y abajo / a los lados')],
  ]},
  { titulo: trMarca('Zoom'), filas: [
    [trMarca('Pellizcar'), trMarca('Acercar y alejar (trackpad)')],
    [trMarca('⌘ + rueda'), trMarca('Acercar y alejar bajo el cursor')],
    ['⌘+ / ⌘−', trMarca('Acercar / alejar un nivel')],
    ['⌘0 · ⇧0 · 0', trMarca('Volver al 100%')],
    ['⌘1 · ⇧1', trMarca('Encuadrar todo')],
    ['⌘2 · ⇧2', trMarca('Encuadrar la selección')],
  ]},
  { titulo: trMarca('Capítulos'), filas: [
    ['← / →', trMarca('Capítulo anterior / siguiente (sin selección)')],
    ['1 – 9', trMarca('Ir a un capítulo')],
    ['↓ / ↑', trMarca('Bajar y subir dentro del capítulo')],
    ['Esc', trMarca('Vista completa')],
  ] },
  { titulo: trMarca('Seleccionar'), filas: [
    [trMarca('Clic'), trMarca('Elegir')], [trMarca('⇧ + clic'), trMarca('Sumar a la selección')],
    [trMarca('Arrastrar en vacío'), trMarca('Marquesina')], ['⌘A', trMarca('Todo')],
    ['⌘⇧A', trMarca('El diagrama entero, desde una de sus piezas')],
    ['Esc', trMarca('Soltar la selección')],
  ]},
  { titulo: trMarca('Editar'), filas: [
    ['⌘Z / ⇧⌘Z', trMarca('Deshacer / rehacer')],
    ['⌘C / ⌘X / ⌘V', trMarca('Copiar / cortar / pegar')],
    ['⌘D', trMarca('Duplicar')], [trMarca('⌥ + arrastrar'), trMarca('Duplicar arrastrando')],
    ['⌫', trMarca('Eliminar')], [trMarca('Flechas'), trMarca('Empujar 1px · 10 con ⇧')],
    [trMarca('Doble clic'), trMarca('Editar el texto')],
  ]},
  { titulo: trMarca('Dar forma'), filas: [
    ['⌘B / ⌘I / ⌘U', trMarca('Negrita / cursiva / subrayado')],
    ['⌘G / ⌘⇧G', trMarca('Agrupar / desagrupar')],
    [trMarca('Doble clic · Esc'), trMarca('Entrar a un miembro del grupo · volver al grupo')],
    ['⌘] / ⌘[', trMarca('Subir / bajar un paso')],
    ['⌥⌘] / ⌥⌘[', trMarca('Al frente / al fondo')],
    ['⌘⇧L', trMarca('Bloquear / desbloquear')],
    [trMarca('⇧ al redimensionar'), trMarca('Mantener la proporción')],
    [trMarca('⇧ al girar'), trMarca('Escalones de 15°')],
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
          <strong style={{ font: '900 20px CanvasSlab, Georgia, serif', color: t.text.title }}>{tr('Atajos')}</strong>
          <span style={{ font: '600 12px CanvasSans, system-ui', color: t.text.caption }}>
            {tr('? para abrir · Esc para cerrar')}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '18px 30px' }}>
          {GRUPOS.map(g => (
            <div key={g.titulo}>
              <div style={{
                font: '700 10.5px CanvasSans, system-ui', letterSpacing: .7, textTransform: 'uppercase',
                color: t.accent, marginBottom: 7,
              }}>{tr(g.titulo)}</div>
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
                  }}>{tr(tecla)}</kbd>
                  <span style={{ color: t.text.caption }}>{tr(que)}</span>
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
        aria-label={tr('Sensibilidad de {que}', { que: titulo.toLowerCase() })}
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
          {tr('Sensibilidad')}
        </div>
        {(s.paneo !== 1 || s.zoom !== 1) && (
          <button type="button" onClick={() => setS(guardarSensibilidad({ paneo: 1, zoom: 1 }))}
            style={{ font: '600 11.5px CanvasSans, system-ui', color: t.text.caption, background: 'none', border: 0,
              cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
            {tr('Volver a 1×')}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
        {fila('paneo', tr('Desplazar'), tr('Dos dedos, rueda y ⇧ + rueda'))}
        {fila('zoom', tr('Zoom'), tr('Pellizcar y ⌘ + rueda, bajo el cursor'))}
      </div>
    </div>
  )
}
