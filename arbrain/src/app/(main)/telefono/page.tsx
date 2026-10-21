'use client'
import { Suspense } from 'react'
import { PanelTelefono } from '@/features/cabina/panel/PanelTelefono'

/** El panel derecho en el teléfono (14 oct 2026): las mismas pestañas que el escritorio, a pantalla completa. */
export default function Page() {
  return <Suspense><PanelTelefono /></Suspense>
}
