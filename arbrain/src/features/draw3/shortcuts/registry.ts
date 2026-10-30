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
  { keys: 'V', action: 'Herramienta seleccionar', category: 'Seleccion' },
  { keys: 'H', action: 'Mover lienzo (Hand)', category: 'Seleccion' },
  { keys: 'Esc', action: 'Deseleccionar todo', category: 'Seleccion' },
  { keys: `${MOD}+A`, action: 'Seleccionar todo', category: 'Seleccion' },

  // Herramientas
  { keys: 'R', action: 'Rectangulo', category: 'Herramientas' },
  { keys: 'O', action: 'Ovalo', category: 'Herramientas' },
  { keys: 'D', action: 'Rombo', category: 'Herramientas' },
  { keys: 'T', action: 'Triangulo', category: 'Herramientas' },
  { keys: 'L', action: 'Linea', category: 'Herramientas' },
  { keys: 'A', action: 'Flecha', category: 'Herramientas' },
  { keys: 'C', action: 'Flecha curva (connector)', category: 'Herramientas' },
  { keys: 'F', action: 'Frame / seccion', category: 'Herramientas' },
  { keys: 'N', action: 'Sticky note', category: 'Herramientas' },
  { keys: 'T', action: 'Texto', category: 'Herramientas' },
  { keys: 'I', action: 'Imagen', category: 'Herramientas' },
  { keys: 'P', action: 'Boligrafo (freedraw)', category: 'Herramientas' },
  { keys: 'E', action: 'Borrador', category: 'Herramientas' },

  // Edicion
  { keys: UNDO_KEYS, action: 'Deshacer', category: 'Edicion' },
  { keys: REDO_SHIFT_KEYS, action: 'Rehacer', category: 'Edicion' },
  { keys: REDO_ALT_KEYS, action: 'Rehacer (alterno)', category: 'Edicion' },
  { keys: `${MOD}+D`, action: 'Duplicar seleccion', category: 'Edicion' },
  { keys: `${MOD}+C`, action: 'Copiar', category: 'Edicion' },
  { keys: `${MOD}+X`, action: 'Cortar', category: 'Edicion' },
  { keys: `${MOD}+V`, action: 'Pegar', category: 'Edicion' },
  { keys: 'Del / Backspace', action: 'Eliminar seleccion', category: 'Edicion' },
  { keys: 'Enter', action: 'Editar elemento seleccionado', category: 'Edicion' },

  // Capas
  { keys: `${MOD}+]`, action: 'Traer al frente', category: 'Capas' },
  { keys: `${MOD}+[`, action: 'Enviar al fondo', category: 'Capas' },
  { keys: `${MOD}+G`, action: 'Agrupar / Desagrupar (toggle)', category: 'Capas' },
  { keys: `${MOD}+Shift+G`, action: 'Desagrupar', category: 'Capas' },

  // Vista
  { keys: '⌥1', action: 'Mostrar todo (Fit view)', category: 'Vista' },
  { keys: `${MOD}+0`, action: 'Resetear zoom (100%)', category: 'Vista' },
  { keys: '?', action: 'Mostrar atajos', category: 'Vista' },

  // Zoom
  { keys: `${MOD}+= / ${MOD}++`, action: 'Acercar', category: 'Zoom' },
  { keys: `${MOD}+-`, action: 'Alejar', category: 'Zoom' },
  { keys: `${MOD}+Scroll`, action: 'Zoom con rueda', category: 'Zoom' },

  // Formas (rapidos)
  { keys: 'Doble click', action: 'Editar texto / abrir comentario', category: 'Formas' },
  { keys: `${MOD}+Click / Shift+Click`, action: 'Agregar o quitar de seleccion', category: 'Formas' },
  { keys: 'Shift+Drag', action: 'Restringir proporciones', category: 'Formas' },
  { keys: 'Alt+Drag', action: 'Duplicar arrastrando', category: 'Formas' },
]

export function shortcutsByCategory(): Record<ShortcutCategory, ShortcutEntry[]> {
  const out = {} as Record<ShortcutCategory, ShortcutEntry[]>
  for (const entry of CANVAS_SHORTCUTS) {
    if (!out[entry.category]) out[entry.category] = []
    out[entry.category].push(entry)
  }
  return out
}
