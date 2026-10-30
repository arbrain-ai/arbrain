import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Panel · Arbrain' }

/** La ventana desprendida del panel: misma sesión que la app, sin barra ni chat. */
export default async function VentanaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !(await isDesktopAuthBypassFromHeaders())) redirect('/login')
  return children
}
