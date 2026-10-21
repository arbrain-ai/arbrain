'use client'
/**
 * La píldora junto a «Levy» en el encabezado del chat (4 oct 2026; simplificada el 5 oct, Daniel: «súper simple»).
 *   · Cuenta SOLO lo que trabaja para ESTA conversación (`trabajandoEn`): los agentes que Levy lanzó desde ella y las
 *     tareas internas de sus turnos. Punto amarillo mientras alguno trabaja. Clic: Taller › Agentes.
 *   · «· N te espera» con punto azul si algo pide la decisión de Daniel (pendientes.ts). Clic: Tareas.
 * Reemplaza la fila de píldoras que vivía sobre el cuerpo del panel. Misma fuente que el panel (`urlPanel`, una sola
 * lectura compartida por URL en datos.ts), cero fuentes nuevas. Sin nada que decir no pinta nada.
 */
import { useConversacionActiva } from '../conversaciones'
import { trabajandoEn } from '../trabajos-modelo'
import { usePendientes } from './pendientes'
import { abrirCasa } from './Secciones'
import { pedirSegmentoTaller } from './taller-segmento'
import s from './panel.module.css'

/** Lleva a Taller › Agentes. Antes solo escribía el recuerdo del segmento: con el Taller ya abierto en otra pestaña (Máquina)
 *  no pasaba nada (15 oct 2026). Ahora cambia el segmento vivo, aquí y en la ventana que tenga el Taller, y luego lo abre. */
function irAAgentes() {
  pedirSegmentoTaller('terminales')
  abrirCasa('taller')
}

/** `conversacion` solo para arneses fuera del chat; en la app manda la conversación abierta. */
export function AgentesTrabajando({ compacta = false, conversacion: fija }: { compacta?: boolean; conversacion?: string }) {
  const activa = useConversacionActiva(), conversacion = fija ?? activa
  const { trabajos, piden, sinLeer } = usePendientes()
  const n = trabajandoEn(trabajos.data, conversacion)
  const espera = piden.length + sinLeer.length
  if (!n && !espera) return null
  const agentes = `${n} ${n === 1 ? 'subagente trabajando' : 'subagentes trabajando'}`
  return <span className={s.agentesVivos} data-compacta={compacta || undefined}>
    {n > 0 && <button type="button" onClick={irAAgentes} data-testid="agentes-trabajando"
      title="Subagentes de esta conversación · ver en el Taller" aria-label={`${agentes} en esta conversación. Abrir el Taller`}>
      <i className={s.puntoVivo} aria-hidden /><span>{compacta ? n : agentes}</span>
    </button>}
    {espera > 0 && <button type="button" onClick={() => abrirCasa('tareas')} data-testid="te-espera"
      title="Espera tu decisión · abrir Tareas" aria-label={`${espera} ${espera === 1 ? 'cosa espera' : 'cosas esperan'} tu decisión. Abrir Tareas`}>
      <i className={s.puntoEspera} aria-hidden />
      <span>{espera} te espera{espera === 1 ? '' : 'n'}</span>
    </button>}
  </span>
}
