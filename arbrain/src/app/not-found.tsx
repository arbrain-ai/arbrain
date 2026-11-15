import type { Metadata } from 'next'
import { connection } from 'next/server'
import { PaginaError } from '@/components/PaginaError'
import { tr, trMarca } from '@/shared/i18n'

/** Ruta inexistente (o `notFound()`): página propia de Arbrain en vez de la 404 de Next (21 oct 2026). */
// Idioma (13 nov 2026): el título se pide en cada petición, en el idioma de la instalación.
export async function generateMetadata(): Promise<Metadata> {
  await connection()
  return { title: tr('No existe · Arbrain') }
}

export default function NoExiste() {
  return (
    <PaginaError
      titulo={trMarca('Esta página no existe')}
      mensaje={trMarca('La dirección que abriste no corresponde a ninguna pantalla de Arbrain. Puede que el enlace sea viejo o tenga un error de escritura.')}
      codigo="404"
      sinRecargar
    />
  )
}
