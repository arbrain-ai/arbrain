import { redirect } from 'next/navigation'
import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { createClient } from '@/lib/supabase/server'
import { esEdicionCliente } from '@/lib/edicion'
import { irABienvenida } from '@/features/primer-arranque/lib/estado'
import { RastroDeError } from '@/components/RastroDeError'
import { DashboardShell } from './dashboard-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const allowLocalDesktop = await isDesktopAuthBypassFromHeaders()

  if (!user && !allowLocalDesktop) {
    redirect('/login')
  }

  // Edición cliente: hasta terminar el primer arranque (o si cambiaron los textos legales), la app abre en la bienvenida.
  if (esEdicionCliente()) {
    // Sin carpeta de datos, la bienvenida lo explica; con el estado ilegible, no se manda ahí (irABienvenida).
    if (irABienvenida()) redirect('/bienvenida')
  }

  return <RastroDeError><DashboardShell>{children}</DashboardShell></RastroDeError>
}
