'use client'
import { useCallback } from 'react'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useBarras } from '@/shared/stores/barras-store'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'

/**
 * «Esconder/mostrar la barra izquierda» (⌘⇧B, `[`, ⌘⌃H y el comando de la paleta). Hay una sola barra, la de
 * conversaciones: en escritorio la esconde o la muestra; en el teléfono abre o cierra su cajón.
 */
export function useAlternarBarras() {
  const isMobile = useIsMobile()
  const toggleConversationsDrawer = useLayoutStore((s) => s.toggleConversationsDrawer)
  const alternarConversaciones = useBarras((s) => s.alternarConversaciones)
  return useCallback(() => { if (isMobile) toggleConversationsDrawer(); else alternarConversaciones() }, [isMobile, toggleConversationsDrawer, alternarConversaciones])
}
