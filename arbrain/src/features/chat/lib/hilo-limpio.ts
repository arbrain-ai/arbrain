import type { ChatMessage } from '../hooks/useChat'

/**
 * El hilo que ve el dueño (30 sep 2026, noche de remodelación). El historial
 * reconstruido trae piezas que no son conversación:
 *  · respuestas de Levy que SOLO tienen razonamiento (un turno largo deja decenas
 *    de «Resumen de razonamiento» sueltos): se juntan con la siguiente respuesta
 *    con texto, como un solo razonamiento plegado;
 *  · marcas del CLI que el historial guardó como si las hubiera escrito Daniel
 *    («[Request interrupted by user…]», notas «[Image: original…]»): se ocultan.
 * No se borra nada: es solo la presentación. El mensaje en vivo nunca se toca.
 */
const PENSAMIENTO = /<!--thinking-->[\s\S]*?<!--\/thinking-->/g
const TIENE_PENSAMIENTO = /<!--thinking-->/
const RUIDO_USUARIO = /^\s*(\[Request interrupted by user[^\]]*\]|\[Image(?::| #)[^\]\n]*\])\s*$/

const soloPensamiento = (m: ChatMessage) =>
  m.role === 'assistant' && !m.streaming && !m.error && !m.toolCalls?.length && !m.tasks?.length && !m.questionPrompts?.length &&
  !m.fileAttachments?.length && !m.imageUrl && !m.audioUrl && !m.compact &&
  TIENE_PENSAMIENTO.test(m.content) && !m.content.replace(PENSAMIENTO, '').trim()

export function hiloLimpio(mensajes: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  let pendiente: string[] = []
  for (let i = 0; i < mensajes.length; i++) {
    const m = mensajes[i]
    if (m.role === 'user' && !m.imageUrl && !m.fileAttachments?.length && RUIDO_USUARIO.test(m.content)) continue
    if (soloPensamiento(m) && i < mensajes.length - 1) { pendiente.push(m.content.trim()); continue }
    if (pendiente.length && m.role === 'assistant') {
      out.push({ ...m, content: `${pendiente.join('\n\n')}\n\n${m.content}` })
      pendiente = []
      continue
    }
    if (pendiente.length) {
      // Razonamiento huérfano antes de un mensaje de Daniel: se conserva en UN bloque.
      out.push({ id: `${m.id}-razonamiento`, role: 'assistant', content: pendiente.join('\n\n'), timestamp: m.timestamp })
      pendiente = []
    }
    out.push(m)
  }
  return out
}
