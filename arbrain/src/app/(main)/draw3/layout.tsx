'use client'

import { type CSSProperties, type ReactNode, type TouchEvent, useEffect, useRef } from 'react'
import { DrawSidebar } from '@/features/draw/components/DrawSidebar'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'

// El drawer es `fixed` pero queda dentro del wrapper transformado (page-enter), así
// que su contexto de posicionamiento es el BODY (ya debajo del header). Por eso el
// top debe ser 0 — sumar 3.5rem duplicaba la altura del header y dejaba un gap.
const DRAW_SIDEBAR_OVERLAY_STYLE: CSSProperties = {
  ['--draw-sidebar-top' as string]: '0px',
  ['--draw-sidebar-height' as string]: 'calc(var(--app-h, 100dvh) - 3.5rem - env(safe-area-inset-top, 0px))',
}

export default function Draw3Layout({ children }: { children: ReactNode }) {
  const sidebarOpen = useLayoutStore((s) => s.drawSidebarOpen)
  const fullscreen = useLayoutStore((s) => s.drawFullscreen)
  const isMobile = useIsMobile()
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const swipeStartX = useRef<number | null>(null)
  const swipeDX = useRef(0)

  const close = () => useLayoutStore.getState().closeDrawSidebar()

  // En móvil el canvas arranca LIMPIO: tanto el sidebar de páginas como el nav
  // principal del app arrancan cerrados (se abren bajo demanda desde el header).
  // En desktop ambos quedan como paneles fijos.
  useEffect(() => {
    if (isMobile) {
      useLayoutStore.getState().closeDrawSidebar()
      useLayoutStore.getState().closeConversationsDrawer()
    }
  }, [isMobile])

  // Móvil: deslizar la hoja hacia la izquierda la cierra (gesto idiomático iOS/Android).
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return
    swipeStartX.current = e.touches[0]?.clientX ?? null
    swipeDX.current = 0
  }
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (swipeStartX.current == null) return
    const dx = (e.touches[0]?.clientX ?? 0) - swipeStartX.current
    swipeDX.current = dx
    const el = sheetRef.current
    if (el && dx < 0) el.style.transform = `translateX(${Math.max(dx, -400)}px)`
  }
  const onTouchEnd = () => {
    const el = sheetRef.current
    if (el) el.style.transform = ''
    if (swipeDX.current < -60) close()
    swipeStartX.current = null
    swipeDX.current = 0
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {!fullscreen && (
        <>
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-20 bg-black/40 animate-in fade-in duration-150 lg:hidden"
              onClick={close}
            />
          )}
          {sidebarOpen && (
            <div
              ref={sheetRef}
              className="fixed left-0 top-[var(--draw-sidebar-top)] z-30 h-[var(--draw-sidebar-height)] w-[min(20rem,85vw)] shrink-0 overflow-hidden rounded-r-2xl bg-surface shadow-elevation-lg transition-transform animate-in slide-in-from-left duration-200 lg:relative lg:top-0 lg:h-full lg:w-64 lg:rounded-none lg:shadow-none lg:animate-none"
              style={DRAW_SIDEBAR_OVERLAY_STYLE}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {/* Drag-handle (solo móvil): pista de que se desliza para cerrar */}
              <div
                className="pointer-events-none absolute right-1.5 top-1/2 h-10 w-1 -translate-y-1/2 rounded-full bg-white/15 lg:hidden"
                aria-hidden
              />
              <DrawSidebar />
            </div>
          )}
        </>
      )}

      <div className="h-full min-w-0 flex-1">{children}</div>
    </div>
  )
}
