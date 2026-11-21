'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { VentanaPanel } from '@/features/cabina/panel/Ventana'
import { EditorPantalla } from '@/features/editor/Editor'

/** `/panel?ventana=N`: una ventana del panel. `/panel?editor=…` (19 nov 2026): la ventana del editor en la segunda pantalla. */
function Elegir() {
  const params = useSearchParams()
  return params.has('editor') ? <EditorPantalla /> : <VentanaPanel />
}

export default function PanelEnVentana() {
  return <Suspense><Elegir /></Suspense>
}
