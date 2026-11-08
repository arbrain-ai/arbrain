/**
 * Conversaciones únicas en el modo espejo (5 nov 2026). Entrada para las rutas; el diseño en
 * docs/builds/espejo-conversaciones-2026-11-05/DISENO.md.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { leerEstado } from './diario'
import { armarPuente, comoMensajes } from './puente'
import { archivoEstado, maquinaEnEspejo } from './pulso'

export { estadoConversaciones } from './pulso'

/**
 * Contexto para seguir aquí una conversación que avanzó en la otra máquina. null si el espejo está apagado o no hace
 * falta. Nunca lanza: el chat no se detiene por el puente.
 */
export async function puenteDeConversacion(sessionId: string): Promise<string | null> {
  try {
    if (!maquinaEnEspejo()) return null
    // Primero la lectura: une lo que haya llegado de la otra máquina; luego quién escribió qué.
    const { data } = await createServiceClient()
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    const ajenos = leerEstado(archivoEstado()).ajenos
    if (!Object.keys(ajenos).length) return null
    return armarPuente(comoMensajes((data ?? []) as Record<string, unknown>[]), ajenos)
  } catch { return null }
}
