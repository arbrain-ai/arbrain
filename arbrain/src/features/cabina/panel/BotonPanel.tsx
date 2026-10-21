'use client'
import { PanelRight } from 'lucide-react'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useFuente } from '../datos'
import { urlPanel, type Trabajos } from './datos'
import { trabajandoAhora } from '../trabajos-modelo'
import { useTodasFuera } from './fijadas'
import { mostrarPanel } from './ventanas'

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
  return (
    <button onClick={toggle} className="icon-btn relative size-8" aria-pressed={abierto}
      title={abierto ? 'Cerrar el panel de tareas (⌘B)' : 'Abrir el panel de tareas (⌘B)'} aria-label={abierto ? 'Cerrar el panel de tareas' : 'Abrir el panel de tareas'}>
      <PanelRight size={15} />
      {!abierto && trabajando && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-brand" aria-hidden />}
    </button>
  )
}
