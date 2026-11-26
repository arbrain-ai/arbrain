'use client'
/** Abrir dentro de la app un enlace que es de la app (ver `enlace-interno.ts`); los demás siguen su camino de siempre. */
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { rutaInterna } from './enlace-interno'

export function useAbrirInterno() {
  const router = useRouter()
  return useCallback((e: { preventDefault: () => void; stopPropagation?: () => void }, href: string | null | undefined): boolean => {
    if (!href || typeof window === 'undefined') return false
    const ruta = rutaInterna(href, window.location.href)
    if (!ruta) return false
    e.preventDefault(); e.stopPropagation?.()
    router.push(ruta)
    return true
  }, [router])
}
