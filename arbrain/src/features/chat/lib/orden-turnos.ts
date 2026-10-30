import type { ChatMessage } from '../hooks/useChat'

/**
 * Orden del hilo por TURNO, no por llegada (1 oct 2026).
 *
 * Antes se ordenaba por `timestamp` (= created_at de la fila). Pero el webhook de
 * completado inserta el par user+assistant AL TERMINAR el turno: un turno largo, o
 * uno interrumpido por «Enviar ya», quedaba con la hora de su final y se iba DESPUÉS
 * del turno siguiente. Resultado visto por Daniel: el bloque vivo de Levy arriba de
 * tu mensaje y de la respuesta cortada del turno anterior.
 *
 * Ahora cada turno (mismo `metadata.turnId`) se ordena por CUÁNDO EMPEZÓ:
 *  · `metadata.startedAt` (ms, created_at del turno en el journal del daemon), o
 *  · el timestamp más temprano de sus filas si no lo trae (datos anteriores).
 * Dentro del turno, el user va antes que el assistant. Las filas sin turnId (cron,
 * historial viejo) se ordenan solas por su timestamp, igual que antes.
 *
 * El turno que está transmitiendo se queda SIEMPRE al final: es lo último que pasó.
 * Los mensajes del asistente sin identidad más nuevos que su inicio (el transcript de
 * una sesión solo-SDK trae así los «Razonando» parciales del turno vivo) se ubican
 * entre tu mensaje y el bloque vivo, donde `hiloLimpio` los pliega dentro de él.
 */
export function inicioDeMensaje(m: ChatMessage): number {
  const inicio = m.metadata?.startedAt
  return typeof inicio === 'number' && Number.isFinite(inicio) ? inicio : m.timestamp.getTime()
}

interface Grupo { inicio: number; primero: number; vivo: boolean }

export function ordenarPorTurno(mensajes: ChatMessage[]): ChatMessage[] {
  const grupos = new Map<string, Grupo>()
  const claveDe = (m: ChatMessage, i: number) => m.metadata?.turnId ? `t:${m.metadata.turnId}` : `i:${i}`

  mensajes.forEach((m, i) => {
    const clave = claveDe(m, i)
    const g = grupos.get(clave)
    const inicio = inicioDeMensaje(m)
    const vivo = m.role === 'assistant' && !!m.streaming
    if (!g) grupos.set(clave, { inicio, primero: i, vivo })
    else {
      g.inicio = Math.min(g.inicio, inicio)
      g.primero = Math.min(g.primero, i)
      g.vivo ||= vivo
    }
  })

  // El turno vivo más antiguo manda el ancla: lo que sea más nuevo y no tenga identidad cuelga de él.
  const vivos = [...grupos.values()].filter(g => g.vivo).sort((a, b) => a.inicio - b.inicio)
  const ancla = vivos[0]

  return mensajes
    .map((m, i) => {
      const propio = grupos.get(claveDe(m, i))!
      const sinIdentidad = !m.metadata?.turnId
      const colgado = !!ancla && sinIdentidad && m.role === 'assistant' && !m.streaming && inicioDeMensaje(m) >= ancla.inicio
      const g = colgado ? ancla : propio
      // 0 = el user abre el turno, 1 = piezas del asistente sin identidad, 2 = la respuesta (la viva, al final).
      const rango = colgado ? 1 : m.role === 'user' ? 0 : m.streaming ? 2 : 1
      return { m, i, g, rango, vivo: g.vivo }
    })
    .sort((a, b) =>
      Number(a.vivo) - Number(b.vivo) ||
      a.g.inicio - b.g.inicio ||
      a.g.primero - b.g.primero ||
      a.rango - b.rango ||
      (a.rango === 1 ? inicioDeMensaje(a.m) - inicioDeMensaje(b.m) : 0) ||
      a.i - b.i)
    .map(x => x.m)
}
