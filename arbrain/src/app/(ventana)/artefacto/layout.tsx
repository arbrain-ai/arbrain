import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Arbrain' }

/** El enlace propio de una vista (14 oct 2026): misma sesión que la app. Sin sesión, al login; nada queda público. */
export default async function ArtefactoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !(await isDesktopAuthBypassFromHeaders())) redirect('/login')
  return children
}
