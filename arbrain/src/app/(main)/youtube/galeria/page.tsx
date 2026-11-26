import { Suspense } from 'react'
import { GaleriaSeccion } from '@/features/editor/galeria/GaleriaSeccion'

export const metadata = { title: 'Tus videos · Arbrain' }

// La galería de videos como sección propia (desde Contenido › Tu canal, o `/youtube/galeria?video=<id>`). En el editor
// la monta `editor-interfaz` como su inicio.
export default function GaleriaRoute() {
  return <Suspense><GaleriaSeccion /></Suspense>
}
