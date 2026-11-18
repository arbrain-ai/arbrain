/**
 * Lo que el modo coche le manda al agente con cada mensaje y lo que toma de vuelta para decirlo en voz. Puro (sin
 * pantalla), para las pruebas.
 */
import type { ChatMessage } from '@/features/chat/hooks/useChat'

/** La nota invisible que acompaña cada mensaje del coche (contexto de un solo turno; no aparece en el chat). */
export const NOTA_COCHE = '[Modo coche] Te hablan desde el Orbe de Arbrain (pueden ir manejando y sin ver la pantalla). '
  + 'Tu respuesta final se va a leer en voz alta: contesta breve y conversacional, como lo dirías hablando; lo importante '
  + 'primero, sin tablas, código ni listas largas (si hace falta un detalle largo, dilo en una frase y déjalo escrito). '
  + 'El Orbe sigue abierto: al terminar tu voz vuelve a escuchar solo, hasta que digan «terminamos» o lo toquen (no '
  + 'pidas que lo toquen ni que lo vuelvan a abrir). Esta nota llega con cada mensaje dicho desde el Orbe; un mensaje '
  + 'sin ella fue escrito en el chat.'

/** La última respuesta del agente: su id y su texto (para decirla en voz al terminar el turno). */
export function ultimaRespuesta(mensajes: readonly Pick<ChatMessage, 'id' | 'role' | 'content'>[]): { id: string; texto: string } | null {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const m = mensajes[i]
    if (m.role === 'assistant') return { id: m.id, texto: m.content ?? '' }
  }
  return null
}
