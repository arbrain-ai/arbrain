'use client'
/** Business Intelligence (7 nov 2026) como vista de la Cabina: la misma pieza en la pestaña del panel, en «Ampliar» y en /bi. */
import { BusinessIntelligence } from '@/features/bi/BusinessIntelligence'

export function VistaBI({ grande }: { grande?: boolean }) {
  return <BusinessIntelligence grande={grande} />
}
