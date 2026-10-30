'use client'
import { useEffect } from 'react'
import { apagadoAMano, registrarEnServidor, tocaReconfirmar, urlBase64ToUint8Array, VAPID_PUBLICA } from '@/features/notifications/lib/pushCliente'

// iOS revoca suscripciones push EN SILENCIO (pushsubscriptionchange jamás
// dispara en Safari/iOS). Guard: en cada foreground, si el permiso está
// concedido pero pushManager perdió la suscripción, re-suscribir y re-registrar
// en push_subscriptions sin prompt (permission ya granted). Throttle 60s.
// 12 oct 2026: una suscripción viva también se re-confirma con el servidor cada 12 h (el envío borra las que el
// push service rechaza; sin esto el teléfono creía estar suscrito y no le llegaba nada).
let lastPushCheck = 0
async function ensurePushSubscription() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (apagadoAMano()) return
    const now = Date.now()
    if (now - lastPushCheck < 60_000) return
    lastPushCheck = now
    if (!VAPID_PUBLICA) return
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      if (tocaReconfirmar(existing.endpoint)) await registrarEnServidor(existing)
      return
    }
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLICA),
    })
    await registrarEnServidor(subscription)
    console.log('[push] re-suscrito tras revocación silenciosa de iOS')
  } catch { /* best-effort: reintenta en el próximo foreground */ }
}

// Apertura en frío = Chat: la decide `aperturaEnChatScript` en el <head> de app/layout.tsx, antes de pintar (11 oct 2026).
// Aquí solo queda la marca de salida que ese script lee: una recarga nuestra o una navegación completa conserva la ruta.

export function PWARegister() {
  useEffect(() => {
    const marcarSalida = () => { try { sessionStorage.setItem('arbrain:salida', String(Date.now())) } catch { /* sin almacenamiento */ } }
    window.addEventListener('pagehide', marcarSalida)
    return () => window.removeEventListener('pagehide', marcarSalida)
  }, [])

  // Cmd/Ctrl+R = recargar TODA la app, en cualquier tab. La webview de Tauri
  // (app desktop) no siempre pasa el reload nativo del navegador; lo cableamos
  // a mano. window.location.reload() conserva la URL (la ruta/tab donde estabas)
  // y el sessionStorage restaura la sesión de chat activa — vuelves a donde te
  // quedaste. Shift+Cmd+R se deja pasar (hard-reload nativo si existe).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onReloadKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        window.location.reload()
      }
    }
    window.addEventListener('keydown', onReloadKey)
    return () => window.removeEventListener('keydown', onReloadKey)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Skip SW in dev — it caches Turbopack HMR chunks (.js) and serves stale
    // versions, which crashes the router with "Router action dispatched before
    // initialization" and re-mounts in an infinite loop.
    const isLocalDev =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname.startsWith('192.168.')
    if (isLocalDev) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister())
      })
      return
    }

    // Red de seguridad contra version skew: el SW sirve HTML cacheado al
    // instante (app-shell SWR). Si ese HTML quedó de un build viejo, purgamos
    // el cache de páginas y recargamos UNA vez (guard en sessionStorage).
    const skewReload = () => {
      try {
        if (sessionStorage.getItem('sw-skew-reloaded') === '1') return
        sessionStorage.setItem('sw-skew-reloaded', '1')
      } catch { /* private mode — allow single reload */ }
      navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_PAGES_CACHE' })
      setTimeout(() => window.location.reload(), 150)
    }
    // El guard solo debe frenar LOOPS (reload inmediato repetido), no bloquear
    // la auto-reparación de un deploy futuro en la misma sesión de tab.
    setTimeout(() => {
      try { sessionStorage.removeItem('sw-skew-reloaded') } catch { /* noop */ }
    }, 20000)
    // La reparación PRIMARIA del skew vive en el SW (detecta deploy nuevo en el
    // revalidate y fuerza client.navigate — funciona aunque este JS nunca
    // cargue). Esto de aquí es la heurística de RESPALDO: chunk 404 (promesa)
    // o <script>/<link> de /_next/static que falla en cargar (resource error —
    // NO burbujea, va en fase capture).
    const onChunkError = (reason: unknown) => {
      const msg = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason ?? '')
      if (!/ChunkLoadError|Loading chunk|dynamically imported module|import\(\) failed|Failed to fetch dynamically/i.test(msg)) return
      skewReload()
    }
    const onRejection = (e: PromiseRejectionEvent) => onChunkError(e.reason)
    const onResourceError = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const src = (target as HTMLScriptElement).src ?? (target as HTMLLinkElement).href ?? ''
      if ((target.tagName === 'SCRIPT' || target.tagName === 'LINK') && src.includes('/_next/static/')) {
        skewReload()
      }
    }
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onResourceError, true)

    const register = async () => {
      try {
        // If the PWA was already controlled by a SW, a controllerchange means a
        // NEW build just took over — reload once so the running page swaps stale
        // cached assets for the fresh bundle (otherwise resume keeps old JS/CSS).
        //
        // LOOP GUARD (persistent, per-tab): `refreshing` alone resets to false on
        // every reload, so it CANNOT break a reload loop. When a domain carries a
        // stale/foreign SW (e.g. the public domain previously served a different app) a
        // controller can keep changing → the page reloads on every load = flicker.
        // sessionStorage survives reloads within the tab, so we reload at most once.
        const hadController = !!navigator.serviceWorker.controller
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing || !hadController) return
          try {
            if (sessionStorage.getItem('sw-reloaded') === '1') return
            sessionStorage.setItem('sw-reloaded', '1')
          } catch { /* storage blocked (private mode) — allow the single reload below */ }
          refreshing = true
          window.location.reload()
        })

        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })

        // Check for a new SW on mount, on focus/visibility, and hourly. The
        // resumed PWA never re-navigates, so without these it keeps the old SW.
        reg.update().catch(() => undefined)
        ensurePushSubscription()
        const onWake = () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => undefined)
            ensurePushSubscription()
          }
        }
        document.addEventListener('visibilitychange', onWake)
        window.addEventListener('focus', onWake)
        const checkInterval = setInterval(() => {
          reg.update().catch(() => undefined)
        }, 60 * 60 * 1000)

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW available — send skip waiting message
              newWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        return () => clearInterval(checkInterval)
      } catch (err) {
        console.error('SW registration failed:', err)
      }
    }

    register()
  }, [])

  return null
}
