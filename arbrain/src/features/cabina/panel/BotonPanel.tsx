'use client'
import { PanelRight } from 'lucide-react'
import { esEdicionCliente } from '@/lib/edicion'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useFuente } from '../datos'
import { urlPanel, type Trabajos } from './datos'
import { trabajandoAhora } from '../trabajos-modelo'
import { useTodasFuera } from './fijadas'
import { mostrarPanel } from './ventanas'

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
  // Edición cliente: el panel no tiene Tareas, así que se nombra por lo que trae. El calendario vive DENTRO del panel (22 oct 2026,
  // prueba de Windows de Daniel: el botón «Calendario» de la cabecera salía cortado y él lo quiere en el panel): es su primera
  // pestaña (fijadas.ts, `siembraCalendario`) y vuelve desde «+» › Calendario.
  const nombre = CLIENTE ? 'el panel (calendario, lienzo, archivos y taller)' : 'el panel de tareas'
  return (
    <button onClick={toggle} className="icon-btn relative size-8" aria-pressed={abierto}
      title={`${abierto ? 'Cerrar' : 'Abrir'} ${nombre} (⌘B)`} aria-label={`${abierto ? 'Cerrar' : 'Abrir'} ${nombre}`}>
      <PanelRight size={15} />
      {!abierto && trabajando && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-brand" aria-hidden />}
    </button>
  )
}
