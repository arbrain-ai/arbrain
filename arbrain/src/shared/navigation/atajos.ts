import { AREA_SHORTCUTS } from './area-shortcuts'
import { ATAJOS_CTRL } from './atajos-ctrl'
import { CALENDAR_SHORTCUTS } from '@/features/planning/shortcuts'
import { CANVAS_SHORTCUTS, shortcutsByCategory, type ShortcutCategory } from '@/features/draw3/shortcuts/registry'

/**
 * Atajos de teclado de Arbrain (2 oct 2026): una sola lista, en español, para el modal de `?` / ⌘⌥S y para
 * Configuración → Atajos. Lo del shell sale de `useGlobalShortcuts` y `dashboard-shell`; lo del Canvas, de su
 * registro (`draw3/shortcuts/registry`). Si un atajo cambia en su manejador, se cambia aquí.
 */
export interface Atajo { teclas: string[]; accion: string }
export interface GrupoAtajos { id: string; titulo: string; donde: string; atajos: Atajo[] }

export const ATAJOS_SHELL: GrupoAtajos[] = [
  {
    id: 'areas',
    titulo: 'Áreas',
    donde: 'En toda la app',
    atajos: AREA_SHORTCUTS.map((a) => ({ teclas: ['Ctrl', a.key], accion: a.label })),
  },
  {
    id: 'calendario-ctrl',
    titulo: 'Calendario y pestañas con Ctrl',
    donde: 'En toda la app, también escribiendo (no en la terminal)',
    atajos: ATAJOS_CTRL,
  },
  {
    id: 'barras',
    titulo: 'Barras y paneles',
    donde: 'En toda la app',
    atajos: [
      { teclas: ['⌘', 'B'], accion: 'Mostrar u ocultar el panel de tareas' },
      { teclas: ['⌘', 'B'], accion: 'En una ventana aparte dividida: esconder o mostrar su columna derecha (manda sobre la negrita del lienzo)' },
      { teclas: ['⌘', '⌥', 'B'], accion: 'Sacar la pestaña activa del panel a su ventana, o devolverla' },
      { teclas: ['⌘', '⇧', 'B'], accion: 'Mostrar u ocultar la barra de conversaciones' },
      { teclas: ['['], accion: 'Mostrar u ocultar la barra de conversaciones' },
      { teclas: ['T'], accion: 'Tema claro u oscuro (fuera de un campo de texto)' },
      { teclas: ['⌘', '⌥', 'T'], accion: 'Tema claro u oscuro (también dentro de un campo)' },
      { teclas: ['⇧', 'T'], accion: 'Estilo actual o unificado (fuera de un campo de texto)' },
      { teclas: ['?'], accion: 'Ver los atajos' },
      { teclas: ['⌘', '⌥', 'S'], accion: 'Ver u ocultar los atajos' },
      { teclas: ['⌘', ','], accion: 'Abrir o cerrar Ajustes' },
      { teclas: ['Esc'], accion: 'Cerrar Ajustes (también con la × o un clic fuera)' },
    ],
  },
  {
    id: 'pantalla-completa',
    titulo: 'Pantalla completa',
    donde: 'En escritorio, en toda la app',
    atajos: [
      { teclas: ['⌘', '.'], accion: 'Poner la pestaña del panel a pantalla completa, o volver' },
      { teclas: ['Esc'], accion: 'Volver de pantalla completa al chat, igual que estaba' },
      { teclas: ['⌘', 'J'], accion: 'A pantalla completa: mostrar u ocultar a Levy flotando (fuera, la terminal)' },
    ],
  },
  {
    id: 'taller',
    titulo: 'Taller',
    donde: 'En el panel, con el foco en las pestañas del Taller (Agentes · Rutinas · Memoria · Máquina)',
    atajos: [
      { teclas: ['←'], accion: 'Pestaña anterior del Taller' },
      { teclas: ['→'], accion: 'Pestaña siguiente del Taller' },
      { teclas: ['Inicio'], accion: 'Ir a Agentes' },
      { teclas: ['Fin'], accion: 'Ir a Máquina' },
      { teclas: ['Esc'], accion: 'Cerrar el archivo o la terminal abierta y volver a la lista' },
    ],
  },
  {
    id: 'calendario',
    titulo: 'Calendario',
    donde: 'En Calendario (/calendar), fuera de un campo de texto',
    atajos: CALENDAR_SHORTCUTS,
  },
  {
    id: 'board',
    titulo: 'Board',
    donde: 'En el Board, con una tarea enfocada',
    atajos: [
      { teclas: ['J'], accion: 'Bajar a la siguiente tarea' },
      { teclas: ['K'], accion: 'Subir a la tarea anterior' },
      { teclas: ['Enter'], accion: 'Abrir la tarea enfocada' },
      { teclas: ['Esc'], accion: 'Cerrar el panel o quitar el foco' },
      { teclas: ['C'], accion: 'Crear una tarea' },
      { teclas: ['S'], accion: 'Cambiar el estado' },
      { teclas: ['P'], accion: 'Cambiar la prioridad' },
      { teclas: ['A'], accion: 'Asignar a un agente' },
      { teclas: ['X'], accion: 'Marcar como hecha' },
      { teclas: ['D'], accion: 'Horizonte: hoy' },
      { teclas: ['W'], accion: 'Horizonte: semana' },
      { teclas: ['M'], accion: 'Horizonte: mes' },
    ],
  },
]

const NOMBRE_CATEGORIA: Record<ShortcutCategory, string> = {
  Seleccion: 'Selección',
  Herramientas: 'Herramientas',
  Edicion: 'Edición',
  Vista: 'Vista',
  Zoom: 'Zoom',
  Capas: 'Capas',
  Formas: 'Formas',
}

/** Atajos del Canvas agrupados por categoría (las teclas del registro vienen como texto: «⌘+D»). */
export function atajosCanvas(): GrupoAtajos[] {
  return Object.entries(shortcutsByCategory()).map(([categoria, filas]) => ({
    id: `canvas-${categoria.toLowerCase()}`,
    titulo: `Canvas · ${NOMBRE_CATEGORIA[categoria as ShortcutCategory] ?? categoria}`,
    donde: 'Dentro de un lienzo (/draw3)',
    atajos: filas.map((f) => ({ teclas: [f.keys], accion: f.action })),
  }))
}

export const TOTAL_ATAJOS_CANVAS = CANVAS_SHORTCUTS.length

/** Filtra por acción o tecla, sin distinguir acentos ni mayúsculas. Un grupo sin coincidencias desaparece. */
export function filtrarAtajos(grupos: GrupoAtajos[], consulta: string): GrupoAtajos[] {
  const q = normalizar(consulta.trim())
  if (!q) return grupos
  return grupos
    .map((g) => ({ ...g, atajos: g.atajos.filter((a) => normalizar(`${a.accion} ${a.teclas.join(' ')} ${g.titulo}`).includes(q)) }))
    .filter((g) => g.atajos.length > 0)
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
