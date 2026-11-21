import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Editor · Arbrain' }

/** El editor en el navegador y el teléfono (19 nov 2026): misma sesión que la app. Sin sesión, al login. */
export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !(await isDesktopAuthBypassFromHeaders())) redirect('/login')
  return children
}
