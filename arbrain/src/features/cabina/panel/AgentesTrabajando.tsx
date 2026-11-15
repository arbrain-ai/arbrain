'use client'
/**
 * La píldora junto a «Levy» en el encabezado del chat (4 oct 2026; simplificada el 5 oct, Daniel: «súper simple»).
 *   · Cuenta SOLO lo que trabaja para ESTA conversación (`cuentas` del tablero, la misma del Taller): los agentes que Levy lanzó desde ella y las
 *     tareas internas de sus turnos. Punto amarillo que late mientras alguno trabaja (28 oct, Daniel: «este era amarillo»). Clic: Taller › Agentes.
 *   · Las decisiones de la bandeja («N te esperan») ya NO van aquí (4 nov 2026, 19:31, Daniel: «quita eso de 5 te esperan… debería solo
 *     aparecer en la vista de mi hoy»): un número, un solo lugar, la línea de la tarjeta HOY del Día. El push lleva a ella.
 *   · «· N pregunta» si un modelo que Levy no lleva o un aviso pide algo (pendientes.ts). Clic: Tareas.
 * Reemplaza la fila de píldoras que vivía sobre el cuerpo del panel. Misma fuente que el panel (`urlPanel`, una sola
 * lectura compartida por URL en datos.ts), cero fuentes nuevas. Sin nada que decir no pinta nada.
 */
import { useConversacionActiva } from '../conversaciones'
import { usePendientes } from './pendientes'
import { abrirCasa } from './Secciones'
import { pedirSegmentoTaller } from './taller-segmento'
import s from './panel.module.css'
import t from './tablero.module.css'
import { armarTablero, cuentas, resumenPildora } from '../tablero-modelo'
import { tr, trn } from '@/shared/i18n'

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
  const preguntas = piden.length + sinLeer.length
  // Tablero por estado (27 oct 2026): lo que ya no trabaja de esta conversación también se cuenta, para que un agente
  // muerto no desaparezca en silencio. Las decisiones de Daniel viven en la tarjeta HOY. Ronda 3: la misma cuenta que el
  // Taller (`cuentas`), con su ventana de 24 h: un fallo de hace días ya no se suma aquí.
  const tablero = armarTablero(trabajos.data, conversacion)
  const n = cuentas(tablero).trabajando
  const otros = resumenPildora(tablero).filter(p => p.parte === 'listo' || p.parte === 'sin-terminar')
  if (!n && !preguntas && !otros.length) return null
  const agentes = trn(n, '{n} subagente trabajando', '{n} subagentes trabajando')
  const resto = otros.map(p => p.texto).join(', ')
  return <span className={s.agentesVivos} data-compacta={compacta || undefined}>
    {(n > 0 || otros.length > 0) && <button type="button" onClick={irAAgentes} data-testid="agentes-trabajando"
      title={tr('Subagentes de esta conversación · ver en el Taller')} aria-label={tr('{estado} en esta conversación. Abrir el Taller', { estado: `${n > 0 ? agentes : tr('Ningún subagente trabajando')}${resto ? `, ${resto}` : ''}` })}>
      {n > 0 && <><i className={s.puntoVivo} aria-hidden /><span>{compacta ? n : agentes}</span></>}
      {!compacta && otros.length > 0 && <span className={t.pildora}>{otros.map(p => <span key={p.parte} className={t.pildoraParte} data-parte={p.parte}><i className={t.punto} aria-hidden />{p.texto}</span>)}</span>}
      {compacta && otros.length > 0 && !n && <span>{otros.reduce((a, p) => a + p.n, 0)}</span>}
    </button>}
    {preguntas > 0 && <button type="button" onClick={() => abrirCasa('tareas')} data-testid="te-pregunta"
      title={tr('Te preguntan · abrir Tareas')} aria-label={trn(preguntas, '{n} pregunta para ti. Abrir Tareas', '{n} preguntas para ti. Abrir Tareas')}>
      <span>{trn(preguntas, '{n} pregunta', '{n} preguntan')}</span>
    </button>}
  </span>
}
