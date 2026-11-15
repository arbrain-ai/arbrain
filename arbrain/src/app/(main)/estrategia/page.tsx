import { EstrategiaSeccion } from '@/features/cabina/vistas/EstrategiaSeccion'
import { connection } from 'next/server'
import { tr } from '@/shared/i18n'

// Idioma (13 nov 2026): el título se pide en cada petición para que siga al idioma de la instalación.
export async function generateMetadata() {
  await connection()
  return { title: tr('Estrategia · Arbrain') }
}

export default function EstrategiaRoute() {
  return <EstrategiaSeccion />
}
