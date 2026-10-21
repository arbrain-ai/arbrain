'use client'
import { Suspense } from 'react'
import { VentanaPanel } from '@/features/cabina/panel/Ventana'

export default function PanelEnVentana() {
  return <Suspense><VentanaPanel /></Suspense>
}
