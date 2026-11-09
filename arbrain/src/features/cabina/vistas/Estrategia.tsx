'use client'
/** Estrategia (8 nov 2026) como vista de la Cabina: la misma pieza en la pestaña del panel, en «Ampliar» y en /estrategia. */
import { Estrategia } from '@/features/negocio/SeccionEstrategia'

export function VistaEstrategia({ grande }: { grande?: boolean }) {
  return <Estrategia grande={grande} />
}
