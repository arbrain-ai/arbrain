'use client'
/**
 * Qué es cada cosa, de un vistazo (agregado de Daniel, 1 oct 10:03). El MISMO ícono
 * en la lista y en la ficha; el punto de estado (oro espera o pregunta, rojo falló,
 * verde vivo) va encima, en la esquina. 6 oct 2026 (Daniel): el ícono entero va
 * AMARILLO mientras trabaja y MORADO cuando terminó.
 *   Bot            agente lanzado por Levy (o una sesión de agente tuya, en gris) y agente interno de un turno
 *   SquareTerminal terminal simple y comando en segundo plano
 *   Workflow       flujo de trabajo de un turno
 *   Server         servidor escuchando
 * 2 oct 2026 (Daniel: «los iconos deberían ser de agentes»): el agente interno deja de ser una rama de git.
 */
import { Bot, Server, SquareTerminal, Workflow } from 'lucide-react'
import { esAgente, type Terminal, type TareaInterna } from '../trabajos-modelo'
import { preguntaAlgo } from '../trabajos-modelo'
import s from './panel.module.css'
import { tr, trMarca } from '@/shared/i18n'

export type Tipo = 'levy' | 'agente' | 'interno' | 'comando' | 'workflow' | 'terminal' | 'servidor'
const ICONO = { levy: Bot, agente: Bot, interno: Bot, comando: SquareTerminal, workflow: Workflow, terminal: SquareTerminal, servidor: Server } as const
export const NOMBRE_TIPO: Record<Tipo, string> = { levy: trMarca('Agente lanzado por Levy'), agente: trMarca('Sesión de agente'), interno: trMarca('Agente de Levy'), comando: trMarca('Comando en segundo plano'), workflow: trMarca('Flujo de trabajo'), terminal: trMarca('Terminal'), servidor: trMarca('Servidor') }

export const tipoTerminal = (t: Terminal): Tipo => t.subagente ? 'levy' : esAgente(t) ? 'agente' : 'terminal'
export const tipoInterna = (t: TareaInterna): Tipo => t.tipo === 'comando' ? 'comando' : t.tipo === 'workflow' ? 'workflow' : 'interno'
/** Esperar sin preguntar es haber terminado: punto tenue, no oro (el oro es para lo que pide algo). */
export const estadoTerminal = (t: Terminal) => preguntaAlgo(t) ? 'pregunta' : t.estado === 'esperando' ? 'termino' : t.estado
export const estadoInterna = (t: TareaInterna) => t.estado === 'trabajando' ? 'trabajando' : t.estado === 'falló' ? 'falla' : 'termino'

export function IconoTipo({ tipo, estado, grande }: { tipo: Tipo; estado?: string; grande?: boolean }) {
  const Icono = ICONO[tipo]
  return <span className={s.tipo} data-tipo={tipo} data-estado={estado} data-grande={grande || undefined} title={tr(NOMBRE_TIPO[tipo])} aria-label={tr(NOMBRE_TIPO[tipo])} role="img">
    <Icono size={grande ? 16 : 14} strokeWidth={1.9} aria-hidden />
    {estado && estado !== 'terminal' && <i className={s.punto} data-estado={estado} aria-hidden />}
  </span>
}
