import { AREA_SHORTCUTS } from './area-shortcuts'
import { esEdicionCliente } from '@/lib/edicion'
import { ATAJOS_CTRL } from './atajos-ctrl'
import { CALENDAR_SHORTCUTS } from '@/features/planning/shortcuts'
import { CANVAS_SHORTCUTS, shortcutsByCategory, type ShortcutCategory } from '@/features/draw3/shortcuts/registry'
import { tr, trMarca } from '@/shared/i18n'

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
    titulo: trMarca('Áreas'),
    donde: trMarca('En toda la app'),
    atajos: AREA_SHORTCUTS.map((a) => ({ teclas: ['Ctrl', a.key], accion: a.label })),
  },
  {
    id: 'calendario-ctrl',
    titulo: trMarca('Calendario y pestañas con Ctrl'),
    donde: trMarca('En toda la app, también escribiendo (no en la terminal)'),
    atajos: ATAJOS_CTRL,
  },
  {
    id: 'barras',
    titulo: trMarca('Barras y paneles'),
    donde: trMarca('En toda la app'),
    atajos: [
      { teclas: ['⌘', 'B'], accion: trMarca('Mostrar u ocultar el panel de tareas') },
      { teclas: ['⌘', 'B'], accion: trMarca('En una ventana aparte dividida: esconder o mostrar su columna derecha (manda sobre la negrita del lienzo)') },
      { teclas: ['⌘', '⌥', 'B'], accion: trMarca('Sacar la pestaña activa del panel a su ventana, o devolverla') },
      { teclas: ['⌘', '⇧', 'B'], accion: trMarca('Mostrar u ocultar la barra de conversaciones') },
      { teclas: ['['], accion: trMarca('Mostrar u ocultar la barra de conversaciones') },
      { teclas: ['T'], accion: trMarca('Tema claro u oscuro (fuera de un campo de texto)') },
      { teclas: ['⌘', '⌥', 'T'], accion: trMarca('Tema claro u oscuro (también dentro de un campo)') },
      { teclas: ['⇧', 'T'], accion: trMarca('Estilo actual o unificado (fuera de un campo de texto)') },
      { teclas: ['?'], accion: trMarca('Ver los atajos') },
      { teclas: ['⌘', '⌥', 'S'], accion: trMarca('Ver u ocultar los atajos') },
      { teclas: ['⌘', ','], accion: trMarca('Abrir o cerrar Ajustes') },
      // Modo directo: solo en la instalación original (en la edición cliente no existe, v0.2.24).
      ...(esEdicionCliente() ? [] : [{ teclas: ['⌘', '⇧', 'D'], accion: trMarca('Prender o apagar el modo directo (antes de grabar o transmitir)') }]),
      { teclas: ['Esc'], accion: trMarca('Cerrar Ajustes (también con la × o un clic fuera)') },
    ],
  },
  {
    id: 'pantalla-completa',
    titulo: trMarca('Pantalla completa'),
    donde: trMarca('En escritorio, en toda la app'),
    atajos: [
      { teclas: ['⌘', '.'], accion: trMarca('Poner la pestaña del panel a pantalla completa, o volver') },
      { teclas: ['Esc'], accion: trMarca('Volver de pantalla completa al chat, igual que estaba') },
      { teclas: ['⌘', 'J'], accion: trMarca('A pantalla completa: mostrar u ocultar a Levy flotando (fuera, la terminal)') },
    ],
  },
  {
    id: 'taller',
    titulo: trMarca('Taller'),
    donde: trMarca('En el panel, con el foco en las pestañas del Taller (Agentes · Rutinas · Memoria · Máquina)'),
    atajos: [
      { teclas: ['←'], accion: trMarca('Pestaña anterior del Taller') },
      { teclas: ['→'], accion: trMarca('Pestaña siguiente del Taller') },
      { teclas: [trMarca('Inicio')], accion: trMarca('Ir a Agentes') },
      { teclas: [trMarca('Fin')], accion: trMarca('Ir a Máquina') },
      { teclas: ['Esc'], accion: trMarca('Cerrar el archivo o la terminal abierta y volver a la lista') },
    ],
  },
  {
    id: 'calendario',
    titulo: trMarca('Calendario'),
    donde: trMarca('En Calendario (/calendar), fuera de un campo de texto'),
    atajos: CALENDAR_SHORTCUTS,
  },
  {
    id: 'board',
    titulo: trMarca('Board'),
    donde: trMarca('En el Board, con una tarea enfocada'),
    atajos: [
      { teclas: ['J'], accion: trMarca('Bajar a la siguiente tarea') },
      { teclas: ['K'], accion: trMarca('Subir a la tarea anterior') },
      { teclas: ['Enter'], accion: trMarca('Abrir la tarea enfocada') },
      { teclas: ['Esc'], accion: trMarca('Cerrar el panel o quitar el foco') },
      { teclas: ['C'], accion: trMarca('Crear una tarea') },
      { teclas: ['S'], accion: trMarca('Cambiar el estado') },
      { teclas: ['P'], accion: trMarca('Cambiar la prioridad') },
      { teclas: ['A'], accion: trMarca('Asignar a un agente') },
      { teclas: ['X'], accion: trMarca('Marcar como hecha') },
      { teclas: ['D'], accion: trMarca('Horizonte: hoy') },
      { teclas: ['W'], accion: trMarca('Horizonte: semana') },
      { teclas: ['M'], accion: trMarca('Horizonte: mes') },
    ],
  },
]

const NOMBRE_CATEGORIA: Record<ShortcutCategory, string> = {
  Seleccion: trMarca('Selección'),
  Herramientas: trMarca('Herramientas'),
  Edicion: trMarca('Edición'),
  Vista: trMarca('Vista'),
  Zoom: trMarca('Zoom'),
  Capas: trMarca('Capas'),
  Formas: trMarca('Formas'),
}

/** Atajos del Canvas agrupados por categoría (las teclas del registro vienen como texto: «⌘+D»). */
export function atajosCanvas(): GrupoAtajos[] {
  return Object.entries(shortcutsByCategory()).map(([categoria, filas]) => ({
    id: `canvas-${categoria.toLowerCase()}`,
    titulo: tr('Canvas · {categoria}', { categoria: tr(NOMBRE_CATEGORIA[categoria as ShortcutCategory] ?? categoria) }),
    donde: trMarca('Dentro de un lienzo (/draw3)'),
    atajos: filas.map((f) => ({ teclas: [f.keys], accion: f.action })),
  }))
}

export const TOTAL_ATAJOS_CANVAS = CANVAS_SHORTCUTS.length

/** Filtra por acción o tecla, sin distinguir acentos ni mayúsculas. Un grupo sin coincidencias desaparece. */
export function filtrarAtajos(grupos: GrupoAtajos[], consulta: string): GrupoAtajos[] {
  const q = normalizar(consulta.trim())
  if (!q) return grupos
  return grupos
    // Busca también en el idioma activo: con la app en inglés, «theme» encuentra «Tema claro u oscuro».
    .map((g) => ({ ...g, atajos: g.atajos.filter((a) => normalizar(`${a.accion} ${tr(a.accion)} ${a.teclas.join(' ')} ${g.titulo} ${tr(g.titulo)}`).includes(q)) }))
    .filter((g) => g.atajos.length > 0)
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
