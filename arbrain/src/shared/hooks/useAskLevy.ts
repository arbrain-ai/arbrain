'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Camino conversacional AI-first (Regla de Oro #5): prellena el input del chat
 * con un draft. NUNCA auto-envía — ChatPanel lee ?draft= y solo hace setInput.
 * Gating: /chat es owner-only; renderiza los botones que lo usan solo si
 * useAuth().isOwner.
 */
export function useAskLevy() {
  const router = useRouter()
  return useCallback(
    (draft: string) => {
      router.push(`/chat?draft=${encodeURIComponent(draft)}`)
    },
    [router],
  )
}
