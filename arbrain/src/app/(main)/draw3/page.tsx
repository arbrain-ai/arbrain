'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { useDrawStore } from '@/features/draw/stores/draw-store'
import { useLayoutStore } from '@/shared/stores/layout-store'

export default function Draw3Page() {
  const router = useRouter()
  const lastPageId = useDrawStore((s) => s.lastPageId)

  useEffect(() => {
    const state = useLayoutStore.getState()
    if (!state.drawSidebarOpen) state.toggleDrawSidebar()
  }, [])

  useEffect(() => {
    if (lastPageId) router.replace(`/draw3/${lastPageId}`)
  }, [lastPageId, router])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted/80">
      <Sparkles size={32} />
      <p className="text-sm">Arbrain Canvas</p>
      <p className="max-w-sm text-center text-xs text-muted/60">
        Selecciona un dibujo o crea uno nuevo. Canvas v3 es el editor oficial.
      </p>
    </div>
  )
}
