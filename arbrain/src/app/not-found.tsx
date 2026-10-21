import type { Metadata } from 'next'
import { PaginaError } from '@/components/PaginaError'

/** Ruta inexistente (o `notFound()`): página propia de Arbrain en vez de la 404 de Next (21 oct 2026). */
export const metadata: Metadata = { title: 'No existe · Arbrain' }

export default function NoExiste() {
  return (
    <PaginaError
      titulo="Esta página no existe"
      mensaje="La dirección que abriste no corresponde a ninguna pantalla de Arbrain. Puede que el enlace sea viejo o tenga un error de escritura."
      codigo="404"
      sinRecargar
    />
  )
}
