import {
  LayoutGrid, Bot, Youtube, Brain, CalendarDays, Wallet, Repeat, Shapes, BrainCircuit, Network, Activity, GraduationCap, UsersRound, Dog, House,
  type LucideIcon,
} from 'lucide-react'
import { ArbrainMark } from '@/shared/components/icons/ArbrainMark'
import { canAccessRoute } from '@/lib/permissions'
import type { UserRole } from '@/types/database'
import { AREA_SHORTCUTS } from '@/shared/navigation/area-shortcuts'

type Icono = LucideIcon | typeof ArbrainMark
export interface Seccion { href: string; label: string; icon: Icono }

/**
 * Secciones de la app (4 oct 2026: ya no hay riel ni cajón de secciones; se abren desde el «+» del panel derecho,
 * por ruta directa y con Ctrl+1…7). Una sola lista para todos esos accesos.
 * Chat va primero (1 oct 2026, pedido de Daniel: es el inicio y la columna de conversaciones cuelga de él);
 * el resto conserva su orden. Los Ctrl+1…7 siguen siendo los de AREA_SHORTCUTS, no la posición visual.
 * Lienzo (3 oct 2026, «Arbrain, una sola app»): el lienzo que antes vivía fuera (sfmap, /canvas-lab) entra a la
 * barra, junto al chat; Calendario y Objetivos lo siguen. Expandir una vista del panel lleva a su sección.
 */
const SECCIONES: readonly Seccion[] = [
  { href: '/chat', label: 'Chat', icon: Bot },
  { href: '/lienzo', label: 'Lienzo', icon: Shapes },
  { href: '/calendar', label: 'Calendario', icon: CalendarDays },
  // «Objetivos» (/todotask) salió el 5 oct 2026: Todoist vive en Tareas (panel) y los objetivos y hábitos en el Calendario.
  // Funnel reloj de arena (2 jul 2026): estrategia → contenido → operación → personal.
  // Sin secciones colapsables: puros botones. Ops vive en Settings. Visión = tab del Command Center.
  { href: '/ml-dashboard', label: 'Command Center', icon: Brain },
  { href: '/youtube', label: 'Contenido', icon: Youtube },
  { href: '/segundo-cerebro', label: 'Artificial Brain', icon: ArbrainMark },
  { href: '/finanzas', label: 'Finanzas', icon: Wallet },
  // Rutinas (25 sep 2026): lo que corre solo, en lenguaje de dueño. Sin atajo Ctrl+N.
  { href: '/rutinas', label: 'Rutinas', icon: Repeat },
  // Memoria y contexto (4 oct 2026): lo que Levy sabe de Daniel y lo que entra en cada conversación. Sin atajo.
  { href: '/memoria', label: 'Memoria', icon: BrainCircuit },
  // Equipo (5 oct 2026): el organigrama vivo, el dueño, la socia, la próxima contratación y los agentes. Sin atajo.
  { href: '/equipo', label: 'Equipo', icon: Network },
  // Salud (5 oct 2026): el cuerpo de hoy desde el reloj, contra tu propio normal. Para cualquier usuario. Sin atajo.
  { href: '/salud', label: 'Salud', icon: Activity },
  // Masterclass (7 oct 2026): la del sábado 17 de octubre, desde su fuente única en el repo del Studio. Sin atajo.
  { href: '/masterclass', label: 'Masterclass', icon: GraduationCap },
  // Cohorte (18 oct 2026): la venta y la entrega de la cohorte fundadora del Cerebro Artificial, en vivo. Sin atajo.
  { href: '/cohorte', label: 'Cohorte', icon: UsersRound },
  // Perro (26 oct 2026): el Go2 Pro de Daniel, primero para el teléfono: cámara, mapa del LiDAR, lugares, voz y STOP. Sin atajo.
  { href: '/perro', label: 'Perro', icon: Dog },
  // Casa (26 oct 2026): la casa en 3D desde el LiDAR del perro, con el perro y los dispositivos dentro. Sin atajo.
  { href: '/casa', label: 'Casa', icon: House },
]

const BOARD: Seccion = { href: '/board', label: 'Tablero', icon: LayoutGrid }

/** Las que el rol puede abrir (el dueño no ve Board; los demás sí, primero). */
export function seccionesPara(role: UserRole): Seccion[] {
  return (role === 'owner' ? SECCIONES : [BOARD, ...SECCIONES]).filter(({ href }) => canAccessRoute(href, role))
}

/** Ctrl+N de una sección, si tiene. */
export const atajoDe = (href: string) => AREA_SHORTCUTS.find((a) => a.href === href || a.href.startsWith(href + '/'))
