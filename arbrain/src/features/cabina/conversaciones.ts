'use client'
/**
 * Lo que el panel y la vista «trabajos» necesitan para hablar de conversaciones (1 oct 2026):
 * cuál tiene Daniel abierta, cómo se llama una por su id y cómo abrirla en el chat.
 * Todo sale de lo que la app ya carga (`useRecientesStore`, el mismo que pinta «Recientes»);
 * la agrupación en sí es pura y vive en `internas-por-conversacion.ts`.
 */
import { useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useRecientesStore } from '../chat/stores/recientes-store'
import { useFuente } from './datos'
import { sinTitulo, tituloDe, tituloLimpio } from './internas-por-conversacion'

/** La conversación abierta en el chat. Fuera de /chat no hay «esta conversación». */
export function useConversacionActiva(): string | null {
  const activaId = useRecientesStore(s => s.activaId)
  return usePathname() === '/chat' ? activaId : null
}

/**
 * El título de una conversación. Primero de lo que ya tiene la barra («Recientes» y fijadas);
 * si no está (una vieja, o la ventana desprendida donde la barra no existe), se lo pide a la API
 * una vez. Sin título: «Otra conversación · ab12cd».
 */
export function useTituloConversacion(id: string): string {
  const sesiones = useRecientesStore(s => s.sesiones)
  const traidas = useRecientesStore(s => s.traidas)
  const fijadas = useRecientesStore(s => s.fijadas)
  const local = useMemo(() => tituloDe(id, [sesiones, traidas, fijadas]), [id, sesiones, traidas, fijadas])
  const remota = useFuente<{ session?: { title?: string | null } }>(!local && id ? `/api/chat/sessions/${encodeURIComponent(id)}` : null)
  return local ?? tituloLimpio(remota.data?.session?.title) ?? sinTitulo(id)
}

/** Abre una conversación en el chat por el mismo camino que «Recientes». */
export function useAbrirConversacion(): (id: string) => void {
  const router = useRouter()
  return useCallback((id: string) => {
    if (!id) return
    if (window.location.pathname.startsWith('/chat')) { window.dispatchEvent(new CustomEvent('openclaw:open-session', { detail: id })); return }
    // Fuera del chat ChatPanel no está montado: al montar abre la conversación de la navegación.
    try { sessionStorage.setItem('mc_activeChatSessionId', id) } catch { /* modo privado */ }
    router.push('/chat')
  }, [router])
}
