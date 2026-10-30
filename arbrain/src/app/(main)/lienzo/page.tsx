'use client'

import { Suspense } from 'react'
import { LienzoSeccion } from '@/features/canvas/ui/LienzoSeccion'

// useSearchParams pide un Suspense; su respaldo es vacío para que no pinte nada antes del lienzo.
export default function LienzoPage() {
  return <Suspense fallback={null}><LienzoSeccion /></Suspense>
}
