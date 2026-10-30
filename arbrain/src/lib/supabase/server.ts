import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { LOCAL_DESKTOP_EMAIL, LOCAL_DESKTOP_USER_ID } from '@/lib/desktop-auth'
import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { preferVerifiedClaims } from './claims-user'
import { SERVER_SUPABASE_URL, AUTH_COOKIE_NAME } from './urls'
import { esEdicionCliente } from '@/lib/edicion'
import { clienteLocalSesion } from '@/lib/base-local/servidor'
import { instalacion } from '@/config'

// Hardcoded to work around Next.js 16 Turbopack env var inlining bug
// that corrupts NEXT_PUBLIC_* values at compile time.
// Publishable keys are designed to be public (RLS-protected); safe to embed.
// Mission Control vive en el Studio desde el 27 sep 2026: la URL y la llave vienen del entorno.
const SUPABASE_URL = SERVER_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function createClient() {
  // Edición cliente (empaquetado, 11 oct 2026): sin Supabase. Base local + sesión de la app de escritorio.
  if (esEdicionCliente()) return clienteLocalSesion(isDesktopAuthBypassFromHeaders)
  const cookieStore = await cookies()
  const allowLocalDesktop = await isDesktopAuthBypassFromHeaders()

  const client = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      ...(AUTH_COOKIE_NAME ? { cookieOptions: { name: AUTH_COOKIE_NAME } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore en Server Components
          }
        },
      },
    }
  )

  preferVerifiedClaims(client)

  if (allowLocalDesktop) {
    const originalGetUser = client.auth.getUser.bind(client.auth)
    client.auth.getUser = async (...args: Parameters<typeof originalGetUser>) => {
      const result = await originalGetUser(...args).catch(() => null)
      if (result?.data?.user) return result

      return {
        data: {
          user: {
            id: LOCAL_DESKTOP_USER_ID,
            email: LOCAL_DESKTOP_EMAIL,
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: { full_name: instalacion().personas.dueno.nombreCompleto },
            created_at: '2026-05-26T00:00:00.000Z',
          },
        },
        error: null,
      } as Awaited<ReturnType<typeof originalGetUser>>
    }
  }

  return client
}
