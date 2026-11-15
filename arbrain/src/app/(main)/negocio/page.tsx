import { NegocioSeccion } from '@/features/cabina/vistas/NegocioSeccion'
import { connection } from 'next/server'
import { tr } from '@/shared/i18n'

// Idioma (13 nov 2026): el título se pide en cada petición para que siga al idioma de la instalación.
export async function generateMetadata() {
  await connection()
  return { title: tr('Tu negocio · Arbrain') }
}

export default function NegocioRoute() {
  return <NegocioSeccion />
}
