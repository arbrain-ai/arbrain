import type { ChatSession } from '../hooks/useChatHistory'
import type { GrupoDia } from './recientes-lista'

/**
 * REGLA DURA (Daniel, 2 oct 2026, QUINTA vez que lo pide): al montar la app (reconstruir o recargar, web y
 * escritorio) TODOS los grupos por fecha nacen CERRADOS; solo «Fijadas» va abierta. No cambies este default ni
 * lo guardes entre recargas sin firma de Daniel. Candado: tests/chat/sidebar-grupos-cerrados.test.ts.
 * Causa raíz de las regresiones: docs/builds/sidebar-grupos-cerrados-2026-10-02/ESTADO.md
 *
 * Plegado de los días de «Recientes» (2 oct 2026). Daniel: «cada que se abra la app, que las conversaciones
 * estén compactadas, en pro de reducir ruido». Hoy, Ayer y Hace 2 días arrancan plegados (solo el encabezado
 * con su conteo); Fijadas no se pliega. Lo que Daniel abre a mano vive en memoria mientras la app siga
 * abierta (el store de Recientes, que no se persiste): al reabrirla vuelve todo a plegado.
 *
 * Solo se guardan los días ABIERTOS a mano (clave `AAAA-MM-DD` del grupo): sin entrada = plegado. La clave
 * es la fecha, no la etiqueta: lo abierto como «Hoy» sigue abierto como «Ayer» tras la medianoche.
 */
export type DiasAbiertos = Readonly<Record<string, true>>

export const diaAbierto = (abiertos: DiasAbiertos, clave: string): boolean => abiertos[clave] === true

/** Abre el día si estaba plegado y lo pliega si estaba abierto; devuelve un objeto nuevo (el original no cambia). */
export function alternarDia(abiertos: DiasAbiertos, clave: string): DiasAbiertos {
  if (diaAbierto(abiertos, clave)) {
    const { [clave]: _cerrado, ...resto } = abiertos
    return resto
  }
  return { ...abiertos, [clave]: true }
}

/**
 * Las filas que se pintan de un día. Abierto: todas. Plegado: ninguna, tampoco la conversación activa.
 * Daniel, 4 oct 2026: «¿por qué no cierra la de hoy a pesar de que está toggle on?». Cerrado es cerrado;
 * antes (2 oct) la conversación abierta se asomaba bajo el encabezado plegado y parecía que no cerraba.
 */
export function filasVisibles(grupo: GrupoDia, abierto: boolean): ChatSession[] {
  return abierto ? grupo.sesiones : []
}
