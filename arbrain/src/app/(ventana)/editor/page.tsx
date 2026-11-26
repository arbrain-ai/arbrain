'use client'
import { Suspense } from 'react'
import { EditorPantalla } from '@/features/editor/Editor'

/** El editor de video (19 nov 2026). En el escritorio vive en su ventana (`/panel?editor=…`); esta es la ruta directa (teléfono, navegador). */
export default function Page() {
  return <Suspense><EditorPantalla /></Suspense>
}
