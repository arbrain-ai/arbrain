'use client'
import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * «Nuevo chat» de la barra (1 oct 2026): el mismo camino que el «+» de la cabecera del chat. En /chat avisa a
 * ChatPanel (`openclaw:new-chat`, que guarda la conversación que deja y abre una limpia). Fuera del chat
 * ChatPanel no está montado: se olvida la conversación en curso de la navegación y se entra a /chat, que al
 * montar arranca en conversación nueva (ver el efecto de arranque de ChatPanel).
 */
export function useNuevoChat() {
  const pathname = usePathname()
  const router = useRouter()
  return useCallback(() => {
    if (pathname === '/chat') {
      window.dispatchEvent(new CustomEvent('openclaw:new-chat'))
      return
    }
    try { sessionStorage.removeItem('mc_activeChatSessionId') } catch { /* modo privado */ }
    router.push('/chat')
  }, [pathname, router])
}
