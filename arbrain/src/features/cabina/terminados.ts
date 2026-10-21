/**
 * Vivos arriba, terminados plegados (2 oct 2026, Daniel: «cuando los agentes terminan, los sigo viendo»).
 * Una sola regla para la vista «trabajos» y el Taller del panel, como las listas de agentes de Codex
 * Desktop y Claude Code: lo que trabaja o te pregunta algo está vivo; lo que cumplió su paso (TUI
 * esperando sin pregunta) o cerró (completada, falló, detenida) va a «Terminados» con una línea.
 * Pura (sin React ni red) para probarla con `tsx --test`.
 */
import { esAgente, preguntaAlgo, ultimaRespuesta, type TareaInterna, type Terminal } from './trabajos-modelo'
import { lineaDeFila } from './internas-lectura'

/** Un agente vivo: trabaja, o terminó con una pregunta que Daniel o Levy aún no contestan. */
export const agenteVivo = (t: Terminal) => t.estado === 'trabajando' || preguntaAlgo(t)
/** Terminado: es un agente (no una shell) y no está vivo. */
export const agenteTerminado = (t: Terminal) => esAgente(t) && !agenteVivo(t)
export const internaViva = (t: TareaInterna) => t.estado === 'trabajando'

const MAX = 140
/** Primera línea con contenido, en texto plano y acotada a una línea. */
export function unaLinea(texto: string | null | undefined, max = MAX): string | null {
  const l = (texto ?? '').split('\n').map(x => x.replace(/[*`#>_]+/g, '').replace(/\s+/g, ' ').trim()).find(x => x.length >= 3)
  if (!l) return null
  return l.length > max ? `${l.slice(0, max - 1).trimEnd()}…` : l
}

/** El resumen de una línea de un agente terminado: lo último que dijo; si no, su última acción o su encargo. */
export function resumenTerminal(t: Terminal): string {
  return unaLinea(ultimaRespuesta(t)?.texto) ?? unaLinea(t.ultimaAccion) ?? unaLinea(t.subagente?.encargo) ?? unaLinea(t.conversacion?.titulo) ?? 'Terminó sin dejar un mensaje.'
}
/** Lo mismo para una tarea interna de un turno de Levy. */
export function resumenInterna(t: TareaInterna): string {
  return unaLinea(t.resumen) ?? unaLinea(lineaDeFila(t)) ?? unaLinea(t.nota) ?? unaLinea(t.detalle) ?? unaLinea(t.descripcion) ?? 'Sin resumen.'
}

/** Cuándo terminó, para ordenar: lo más reciente primero. */
export const finDeInterna = (t: TareaInterna) => Date.parse(t.fin ?? t.actualizado) || 0

export function partirTerminales(ts: Terminal[]) {
  return { vivos: ts.filter(t => !agenteTerminado(t)), terminados: ts.filter(agenteTerminado) }
}
export function partirInternas(ts: TareaInterna[]) {
  return {
    vivas: ts.filter(internaViva),
    terminadas: ts.filter(t => !internaViva(t)).sort((a, b) => finDeInterna(b) - finDeInterna(a)),
  }
}
