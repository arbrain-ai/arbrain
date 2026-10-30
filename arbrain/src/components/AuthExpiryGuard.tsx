'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { esPantallaDeEntrada } from '@/lib/sesion-local'

// La PWA sirve el HTML cacheado al instante (sw.js), así que una sesión vencida o de otra
// base (29 sep 2026: Mission Control pasó de la nube al Studio) no pasa por el proxy que
// redirige a /login: la pantalla carga y cada /api responde 401 «Unauthorized» para siempre.
// Si una llamada propia a /api/ responde 401 y el cliente confirma que ya no hay usuario,
// lleva a /login conservando la ruta. El escritorio (127.0.0.1/localhost) no usa sesión.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
let redirecting = false

export function AuthExpiryGuard() {
  useEffect(() => {
    if (LOCAL_HOSTS.has(window.location.hostname)) return
    const original = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await original(...args)
      if (response.status === 401 && !redirecting) {
        const url = new URL(typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url, window.location.href)
        const path = window.location.pathname
        if (url.origin === window.location.origin && url.pathname.startsWith('/api/') && !esPantallaDeEntrada(path)) {
          const { data } = await createClient().auth.getUser().catch(() => ({ data: { user: null } }))
          if (!data.user && !redirecting) {
            redirecting = true
            await createClient().auth.signOut({ scope: 'local' }).catch(() => {})
            const next = path && path !== '/' ? `?next=${encodeURIComponent(path)}` : ''
            window.location.replace(`/login${next}`)
          }
        }
      }
      return response
    }
    return () => { window.fetch = original }
  }, [])
  return null
}
