'use client'
import type { CalendarMode } from '@/features/planning/types'
import { useOrdenCalendario } from '@/features/planning/orden-panel'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { hoyCivil, type Alcance } from '../model'
import { usePanelFijadas, ventanaPropia } from './fijadas'
import { pestanaActiva, PRINCIPAL, tiraDe, todasLasClaves } from './pestanas-fuera'
import { mostrarPanel } from './ventanas'

/** La pestaña recuerda día, semana o mes; 4 días cuenta como semana (igual que `ALCANCE_DE` en Secciones). */
const ALCANCE: Record<CalendarMode, Alcance> = { day: 'dia', fourDays: 'semana', week: 'semana', agenda: 'semana', month: 'mes', year: 'mes', crons: 'semana', habits: 'dia' }

/** Ctrl+D/X/W/M: la pestaña Calendario (la abre si no está, y el panel si está cerrado), a la vista y en hoy con esa escala. */
export function calendarioEn(modo: CalendarMode) {
  // Como abrirSeccion (Secciones.tsx): id `mano-` (vista del «+», no se guarda) y una sola pestaña por vista. Solo en el panel principal.
  const id = usePanelFijadas.getState().fijar(`mano-calendario-${Date.now().toString(36)}`, { vista: 'calendario', alcance: ALCANCE[modo] })
  mostrarPanel(id)
  useOrdenCalendario.getState().pedir(hoyCivil(), modo)
}

/** Ctrl+Q: cierra la pestaña que se ve en el panel (o en esta ventana aparte). Con el panel cerrado no cierra nada que no se vea. */
export function cerrarPestanaActiva(): boolean {
  const lay = useLayoutStore.getState(), propia = ventanaPropia()
  if (propia === PRINCIPAL && !lay.panelDerechoOpen && !lay.enfoquePanel) return false
  const st = usePanelFijadas.getState()
  const tira = tiraDe(todasLasClaves(st.orden, st.taller), st.enVentana, propia)
  const activa = pestanaActiva(st.activa, tira)
  if (!activa) return false
  st.cerrar(activa)
  // A pantalla completa, cerrar la última deja la pantalla vacía: se vuelve al chat.
  if (tira.length === 1 && lay.enfoquePanel) lay.setEnfoquePanel(false)
  return true
}
