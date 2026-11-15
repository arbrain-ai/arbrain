/**
 * Canvas v3 — Keyboard shortcuts registry.
 *
 * Single source of truth for every shortcut available inside `/draw3/[id]`.
 * Used by:
 *   - the keyboard handler in DrawEditor3 to react to keys
 *   - the Settings page (/settings) to render a reference table
 *
 * Add new shortcuts here so they show up automatically in the UI.
 */

import { trMarca } from '@/shared/i18n'

export type ShortcutCategory =
  | 'Seleccion'
  | 'Herramientas'
  | 'Edicion'
  | 'Vista'
  | 'Zoom'
  | 'Capas'
  | 'Formas'

export interface ShortcutEntry {
  keys: string         // e.g. "⌘D", "Shift+R", "Enter"
  action: string       // human-friendly description
  category: ShortcutCategory
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'
const UNDO_KEYS = isMac ? '⌘Z / Ctrl+Z' : 'Ctrl+Z'
const REDO_SHIFT_KEYS = isMac ? '⌘Shift+Z / Ctrl+Shift+Z' : 'Ctrl+Shift+Z'
const REDO_ALT_KEYS = isMac ? '⌘Y / Ctrl+Y' : 'Ctrl+Y'

export const CANVAS_SHORTCUTS: ShortcutEntry[] = [
  // Seleccion
  { keys: 'V', action: trMarca('Herramienta seleccionar'), category: 'Seleccion' },
  { keys: 'H', action: trMarca('Mover lienzo (Hand)'), category: 'Seleccion' },
  { keys: 'Esc', action: trMarca('Deseleccionar todo'), category: 'Seleccion' },
  { keys: `${MOD}+A`, action: trMarca('Seleccionar todo'), category: 'Seleccion' },

  // Herramientas
  { keys: 'R', action: trMarca('Rectangulo'), category: 'Herramientas' },
  { keys: 'O', action: trMarca('Ovalo'), category: 'Herramientas' },
  { keys: 'D', action: trMarca('Rombo'), category: 'Herramientas' },
  { keys: 'T', action: trMarca('Triangulo'), category: 'Herramientas' },
  { keys: 'L', action: trMarca('Linea'), category: 'Herramientas' },
  { keys: 'A', action: trMarca('Flecha'), category: 'Herramientas' },
  { keys: 'C', action: trMarca('Flecha curva (connector)'), category: 'Herramientas' },
  { keys: 'F', action: trMarca('Frame / seccion'), category: 'Herramientas' },
  { keys: 'N', action: trMarca('Sticky note'), category: 'Herramientas' },
  { keys: 'T', action: trMarca('Texto'), category: 'Herramientas' },
  { keys: 'I', action: trMarca('Imagen'), category: 'Herramientas' },
  { keys: 'P', action: trMarca('Boligrafo (freedraw)'), category: 'Herramientas' },
  { keys: 'E', action: trMarca('Borrador'), category: 'Herramientas' },

  // Edicion
  { keys: UNDO_KEYS, action: trMarca('Deshacer'), category: 'Edicion' },
  { keys: REDO_SHIFT_KEYS, action: trMarca('Rehacer'), category: 'Edicion' },
  { keys: REDO_ALT_KEYS, action: trMarca('Rehacer (alterno)'), category: 'Edicion' },
  { keys: `${MOD}+D`, action: trMarca('Duplicar seleccion'), category: 'Edicion' },
  { keys: `${MOD}+C`, action: trMarca('Copiar'), category: 'Edicion' },
  { keys: `${MOD}+X`, action: trMarca('Cortar'), category: 'Edicion' },
  { keys: `${MOD}+V`, action: trMarca('Pegar'), category: 'Edicion' },
  { keys: 'Del / Backspace', action: trMarca('Eliminar seleccion'), category: 'Edicion' },
  { keys: 'Enter', action: trMarca('Editar elemento seleccionado'), category: 'Edicion' },

  // Capas
  { keys: `${MOD}+]`, action: trMarca('Traer al frente'), category: 'Capas' },
  { keys: `${MOD}+[`, action: trMarca('Enviar al fondo'), category: 'Capas' },
  { keys: `${MOD}+G`, action: trMarca('Agrupar / Desagrupar (toggle)'), category: 'Capas' },
  { keys: `${MOD}+Shift+G`, action: trMarca('Desagrupar'), category: 'Capas' },

  // Vista
  { keys: '⌥1', action: trMarca('Mostrar todo (Fit view)'), category: 'Vista' },
  { keys: `${MOD}+0`, action: trMarca('Resetear zoom (100%)'), category: 'Vista' },
  { keys: '?', action: trMarca('Mostrar atajos'), category: 'Vista' },

  // Zoom
  { keys: `${MOD}+= / ${MOD}++`, action: trMarca('Acercar'), category: 'Zoom' },
  { keys: `${MOD}+-`, action: trMarca('Alejar'), category: 'Zoom' },
  { keys: `${MOD}+Scroll`, action: trMarca('Zoom con rueda'), category: 'Zoom' },

  // Formas (rapidos)
  { keys: trMarca('Doble click'), action: trMarca('Editar texto / abrir comentario'), category: 'Formas' },
  { keys: `${MOD}+Click / Shift+Click`, action: trMarca('Agregar o quitar de seleccion'), category: 'Formas' },
  { keys: 'Shift+Drag', action: trMarca('Restringir proporciones'), category: 'Formas' },
  { keys: 'Alt+Drag', action: trMarca('Duplicar arrastrando'), category: 'Formas' },
]

export function shortcutsByCategory(): Record<ShortcutCategory, ShortcutEntry[]> {
  const out = {} as Record<ShortcutCategory, ShortcutEntry[]>
  for (const entry of CANVAS_SHORTCUTS) {
    if (!out[entry.category]) out[entry.category] = []
    out[entry.category].push(entry)
  }
  return out
}
