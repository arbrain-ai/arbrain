import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChevronLeft, X } from 'lucide-react'
import { SeccionNotificaciones } from '../../src/features/notifications/components/SeccionNotificaciones'
import '../../src/app/globals.css'

// Ajustes › Notificaciones en el teléfono (12 oct 2026). `?estado=` simula el dispositivo: activo | listo | instalar |
// bloqueado | escritorio. Sin servidor ni suscripciones reales: fetch, permiso y service worker son falsos.
const estado = new URLSearchParams(location.search).get('estado') ?? 'listo'
const instalada = estado !== 'instalar'
Object.defineProperty(navigator, 'standalone', { value: instalada, configurable: true })
const mm = window.matchMedia.bind(window)
window.matchMedia = (q: string) => (q.includes('display-mode') ? { ...mm(q), matches: instalada && q.includes('standalone') } : mm(q))
const permiso = estado === 'activo' ? 'granted' : estado === 'bloqueado' ? 'denied' : 'default'
Object.defineProperty(Notification, 'permission', { get: () => permiso, configurable: true })
if (estado === 'escritorio') delete (window as { PushManager?: unknown }).PushManager
const endpoint = 'https://web.push.apple.com/falso-fixture'
const sub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: async () => true, options: {} }
Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
  value: async () => ({ pushManager: { getSubscription: async () => (estado === 'activo' ? sub : null) } }), configurable: true,
})
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } })
  if (url.pathname === '/api/notifications/subscribe' && (!init?.method || init.method === 'GET')) {
    return json({ registrada: estado === 'activo' && url.searchParams.get('endpoint') === endpoint, dispositivos: estado === 'activo' ? 2 : 0 })
  }
  if (url.pathname === '/api/notifications/prueba') return json({ enviadas: 2, fallidas: 0, dispositivos: 2 })
  return json({ success: true })
}

function Fixture() {
  return <main className="min-h-dvh bg-surface text-foreground">
    <header className="flex items-start gap-2 px-4 pb-3 pt-3">
      <span className="icon-btn-ghost -ml-2 grid size-11 shrink-0 place-items-center"><ChevronLeft className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1 pt-1.5">
        <h2 className="font-sans text-lg font-semibold tracking-tight text-foreground">Notificaciones</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">Reportes y avisos en tu teléfono: activar, probar y apagar.</p>
      </div>
      <span className="icon-btn-ghost grid size-11 shrink-0 place-items-center"><X className="size-5" aria-hidden /></span>
    </header>
    <div className="px-4 pb-24 pt-2"><SeccionNotificaciones /></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
