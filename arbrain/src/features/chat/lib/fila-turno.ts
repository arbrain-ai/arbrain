/**
 * Qué tiene delante un turno en fila (5 oct 2026): el mensaje del dueño quedó detrás de dos
 * avisos de agentes y la UI decía «Hay una pregunta pendiente de tu respuesta», que era falso. El
 * agent-server manda `fila` con el estado `en_fila_turno`; aquí se vuelve una frase verdadera.
 */
export interface FilaTurno {
  /** Mensajes de Daniel delante (en curso o en fila antes que este). */
  mensajes: number
  /** Avisos de agentes, despertadores o respuestas de fondo delante. */
  avisos: number
  /** El turno en curso espera la respuesta de Daniel a una pregunta. */
  pregunta: boolean
  /** Un aviso en curso se está pausando para atender primero a Daniel. */
  cediendo: boolean
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function leerFila(value: unknown): FilaTurno | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.mensajes !== 'number' || typeof v.avisos !== 'number') return null
  return { mensajes: v.mensajes, avisos: v.avisos, pregunta: v.pregunta === true, cediendo: v.cediendo === true }
}

/** Etiqueta corta junto al indicador de actividad. */
export function etiquetaFila(fila: FilaTurno | null | undefined): string {
  if (!fila) return 'En fila · sale cuando termine el turno anterior de esta conversación'
  if (fila.pregunta) return 'En fila · Levy espera tu respuesta a una pregunta'
  if (fila.cediendo && !fila.mensajes) return 'En fila · Levy pausa un aviso de agentes para atenderte'
  const partes = [
    fila.mensajes ? plural(fila.mensajes, 'mensaje tuyo', 'mensajes tuyos') : '',
    fila.avisos ? plural(fila.avisos, 'aviso de agentes', 'avisos de agentes') : '',
  ].filter(Boolean)
  if (!partes.length) return 'En fila · sale en un momento'
  return `En fila · detrás de ${partes.join(' y ')}`
}

/** Explicación al desplegar el indicador mientras el turno aún no arranca. */
export function detalleFila(fila: FilaTurno | null | undefined): string {
  if (!fila) return 'Este mensaje está en fila: sale en cuanto termine el turno anterior de esta conversación.'
  if (fila.pregunta) return 'El turno anterior hizo una pregunta y espera tu respuesta. Respóndela o cancélalo para que este mensaje salga.'
  if (fila.cediendo) return 'Levy estaba atendiendo un aviso de agentes. Lo pausa para responderte primero; el aviso vuelve a la fila detrás de ti y no se pierde.'
  if (fila.mensajes) return 'Tus mensajes salen en el orden en que los enviaste. Los avisos de agentes esperan detrás de ti.'
  return 'Este mensaje sale después de los avisos de agentes que ya estaban corriendo.'
}
