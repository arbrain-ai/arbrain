/**
 * Lo que el modo coche le manda al agente con cada mensaje y lo que toma de vuelta para decirlo en voz. Puro (sin
 * pantalla), para las pruebas.
 */
import type { ChatMessage } from '@/features/chat/hooks/useChat'

/**
 * La nota invisible que acompaña cada mensaje del coche (contexto de un solo turno; no aparece en el chat). Basta sola
 * para que el agente conteste para OÍRSE, sin skills ni programas extra: corta, sin tablas ni rutas, contando qué hizo y
 * qué necesita. Cambia una frase según el modo del Orbe (fluido / por turnos).
 */
const INICIO = '[Modo coche] Te hablan desde el Orbe de Arbrain (pueden ir manejando y sin ver la pantalla). '
  + 'Tu respuesta final se va a leer en voz alta tal cual: escríbela para oírse. Corta (de dos a cinco frases), en tono '
  + 'de conversación y en el idioma de quien te habla. Lo importante primero: qué hiciste, cómo quedó y qué necesitas de '
  + 'la persona (una pregunta concreta, si hace falta). Sin tablas, código, rutas de archivos, comandos, enlaces ni '
  + 'listas largas; los números solo si importan, dichos como se hablan. Si hay un detalle largo, resúmelo en una frase '
  + 'y déjalo escrito para cuando vea la pantalla. No uses otras herramientas de voz en esta respuesta: el Orbe ya la lee. '
const FIN = 'Esta nota llega con cada mensaje dicho desde el Orbe; un mensaje sin ella fue escrito en el chat.'

/** Fluido: tras la voz, el Orbe vuelve a escuchar solo. */
export const NOTA_COCHE = INICIO
  + 'El Orbe sigue abierto: al terminar tu voz vuelve a escuchar solo, hasta que digan «terminamos» o lo toquen (no '
  + 'pidas que lo toquen ni que lo vuelvan a abrir). '
  + FIN

/** Por turnos: tras la voz, el Orbe queda en pausa y sin micrófono hasta el próximo toque. */
export const NOTA_TURNOS = INICIO
  + 'Está en modo «por turnos»: al terminar tu voz, el Orbe queda en pausa, sin micrófono, hasta que lo vuelvan a tocar '
  + '(no digas que sigues escuchando ni pidas que lo toquen). '
  + FIN

export type ModoTurno = 'fluido' | 'turnos'
export const notaDelModo = (m: ModoTurno): string => (m === 'turnos' ? NOTA_TURNOS : NOTA_COCHE)

/** La última respuesta del agente: su id y su texto (para decirla en voz al terminar el turno). */
export function ultimaRespuesta(mensajes: readonly Pick<ChatMessage, 'id' | 'role' | 'content'>[]): { id: string; texto: string } | null {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const m = mensajes[i]
    if (m.role === 'assistant') return { id: m.id, texto: m.content ?? '' }
  }
  return null
}
