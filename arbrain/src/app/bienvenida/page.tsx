import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { esEdicionCliente } from '@/lib/edicion'
import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { irABienvenida } from '@/features/primer-arranque/lib/estado'
import { PrimerArranque } from '@/features/primer-arranque/components/PrimerArranque'

export const metadata: Metadata = { title: 'Bienvenida · Arbrain' }
export const dynamic = 'force-dynamic'

/** Primer arranque de la edición cliente (11 oct 2026). En la instalación de Daniel no existe. */
export default async function BienvenidaPage() {
  if (!esEdicionCliente()) notFound()
  if (!(await isDesktopAuthBypassFromHeaders())) redirect('/sin-sesion')
  // Sin carpeta de datos, el flujo muestra el error al guardar; con el estado ilegible, al chat (irABienvenida).
  if (!irABienvenida()) redirect('/chat')
  return <PrimerArranque />
}
