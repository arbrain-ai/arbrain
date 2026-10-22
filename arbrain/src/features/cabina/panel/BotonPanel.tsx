'use client'
import { CalendarDays, PanelRight } from 'lucide-react'
import { esEdicionCliente } from '@/lib/edicion'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useFuente } from '../datos'
import { urlPanel, type Trabajos } from './datos'
import { trabajandoAhora } from '../trabajos-modelo'
import { useTodasFuera } from './fijadas'
import { mostrarPanel } from './ventanas'
import { usePanelFijadas } from './fijadas'
import { abrirSeccion } from './Secciones'

const CLIENTE = esEdicionCliente()

/** Abre y cierra el panel derecho (⌘B). El punto avisa si algo trabaja para Daniel ahora:
 *  un agente en una terminal o una tarea interna de un turno de Levy. */
export function BotonPanel() {
  const abierto = useLayoutStore(s => s.panelDerechoOpen)
  const toggle = useLayoutStore(s => s.togglePanelDerecho)
  // Todas las pestañas en su propia ventana: no queda columna que abrir (1 oct 2026).
  const fuera = useTodasFuera()
  // Solo se suscribe con el panel cerrado: abierto, el panel ya lee la misma fuente.
  const { data } = useFuente<Trabajos>(abierto || fuera ? null : urlPanel(false), 15_000)
  const trabajando = trabajandoAhora(data).total > 0
  // Con el panel en su propia ventana, el botón la trae al frente.
  if (fuera) return <button onClick={() => mostrarPanel()} className="icon-btn relative size-8" aria-pressed
    title="Las pestañas del panel están en sus ventanas: traerlas al frente (⌘B) · devolverlas al panel (⌘⌥B)" aria-label="Traer al frente las ventanas del panel">
    <PanelRight size={15} /><span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-brand" aria-hidden />
  </button>
  // Edición cliente (v0.2.6; un fundador: «¿cómo puedo agregar aquí el calendario?»): el panel no tiene Tareas, así que se
  // nombra por lo que trae, y el calendario tiene su propio botón a la vista.
  const nombre = CLIENTE ? 'el panel (calendario, lienzo, archivos y taller)' : 'el panel de tareas'
  return (
    <>
      {CLIENTE && <BotonCalendario />}
      <button onClick={toggle} className="icon-btn relative size-8" aria-pressed={abierto}
        title={`${abierto ? 'Cerrar' : 'Abrir'} ${nombre} (⌘B)`} aria-label={`${abierto ? 'Cerrar' : 'Abrir'} ${nombre}`}>
        <PanelRight size={15} />
        {!abierto && trabajando && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-brand" aria-hidden />}
      </button>
    </>
  )
}

/** Abre el calendario en el panel (o lo trae al frente si ya está abierto), en Día: el plan de hoy. */
export function BotonCalendario() {
  const abierta = usePanelFijadas(st => st.fijadas.find(f => f.input.vista === 'calendario'))
  const abrir = () => { if (abierta) mostrarPanel(abierta.id); else abrirSeccion({ vista: 'calendario', alcance: 'dia' }) }
  return (
    <button onClick={abrir} className="icon-btn relative h-8 w-auto gap-1.5 px-2 text-xs" title="Abrir tu calendario en el panel: objetivos, bloques y hábitos de hoy"
      aria-label="Abrir el calendario">
      <CalendarDays size={15} aria-hidden /><span className="hidden sm:inline">Calendario</span>
    </button>
  )
}
