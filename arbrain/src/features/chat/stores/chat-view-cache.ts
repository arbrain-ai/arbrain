import type { ChatMessage } from '../hooks/useChat'
import type { ChatSession } from '../hooks/useChatHistory'

// Caché EN MEMORIA de las conversaciones ya abiertas en ESTA instancia de la app
// (module-level: sobrevive el unmount de la página al navegar entre tabs, muere al
// cerrar/recargar).
//
// Por qué existe: cada cambio de ruta desmonta ChatPanel completo (no hay
// keep-alive). Sin esto, volver a /chat re-abría la sesión pagando red +
// IndexedDB + esperar la lista de sesiones. Con esto, el view exacto que
// dejaste (mensajes ya deserializados, con toolCalls/thinking/usage vivos,
// scroll incluido) se pinta SÍNCRONO en el primer render — percepción de
// latencia cero. La verdad del server se reconcilia en background después.
//
// VARIAS A LA VEZ (28 jul 2026): antes esto guardaba UNA sola conversación
// (`let cache`), y con eso el trabajo en paralelo pagaba red siempre: abrías A,
// te ibas a B (A se perdía del caché), volvías a A y se recargaba entera. Ahora
// es un LRU de varias, que es como se trabaja de verdad — dos o tres hilos
// abiertos, saltando entre ellos mientras cada uno responde.
export interface ChatViewCache {
  session: ChatSession
  messages: ChatMessage[]
  hasMore: boolean
  oldestLoaded: string | null
  /** scrollTop exacto al salir; null = estaba en el fondo (pin al fondo al volver) */
  scrollTop: number | null
  suggestions: string[]
}

// Cuántas conversaciones se recuerdan a la vez. Son mensajes ya deserializados en
// memoria, así que el techo cuida la RAM del teléfono: 8 cubre de sobra cualquier
// sesión de trabajo real y el LRU tira la más vieja sin que nadie lo note.
const MAX_VIEWS = 8

// Map preserva orden de inserción: re-insertar en cada acceso lo convierte en LRU.
const views = new Map<string, ChatViewCache>()

export function saveChatView(view: ChatViewCache): void {
  const id = view.session.id
  if (views.has(id)) views.delete(id) // reinsertar al final = "recién usada"
  views.set(id, view)
  while (views.size > MAX_VIEWS) {
    const masVieja = views.keys().next().value
    if (masVieja === undefined) break
    views.delete(masVieja)
  }
}

export function getChatView(sessionId: string): ChatViewCache | null {
  const hit = views.get(sessionId)
  if (!hit) return null
  views.delete(sessionId) // tocarla la vuelve la más reciente
  views.set(sessionId, hit)
  return hit
}

/** Olvida UNA conversación (se borró, o su contenido dejó de ser confiable). */
export function dropChatView(sessionId: string): void {
  views.delete(sessionId)
}

export function clearChatView(): void {
  views.clear()
}
