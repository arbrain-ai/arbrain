// Mission Control Service Worker — Push + PWA Install + Cache Strategy
// Handles: fetch (cache-first static, stale-while-revalidate app-shell HTML), push, notification click

// v10: app-shell SWR para navegaciones + auto-reparación de version skew.
// El cold open del PWA pintaba en blanco esperando el round-trip del server
// (network-first HTML). Ahora servimos el HTML cacheado AL INSTANTE (keyed por
// pathname, ignora query como ?session=) y revalidamos en background — el shell
// pinta en ~0 y los datos frescos los trae el cliente como siempre.
// SKEW GUARD (verificado empíricamente en v9): tras un deploy, el HTML stale
// del build anterior podía dejar la app medio-hidratada (chunks/RSC del build
// viejo vs server nuevo). Ahora el revalidate compara la FIRMA de assets del
// HTML fresco vs el cacheado; si difiere (deploy nuevo) purga el cache de
// páginas y avisa a los clients para UN reload auto-reparador.
// Reglas iOS-safe: solo GET, solo same-origin, solo respuestas 200 type basic
// sin redirect, nunca range/206.
// Versión del archivo (cambiarla basta para que iOS instale el SW nuevo; no se toca CACHE_NAME para no volver a
// bajar los chunks y avatares 3D por datos móviles).
const SW_VERSION = 'v19-toque-notificacion'
const CACHE_NAME = 'mc-sw-v18'
const PAGES_CACHE = 'mc-pages-v16'

// v11: prefetch de la sesión de chat al RECIBIR un push (antes del tap). El
// push llega con url /chat?session=<id>&msg=<id>; en ese instante bajamos la
// sesión + última página de mensajes (endpoint combinado) y la dejamos en un
// cache serve-once. Cuando el usuario toca la notificación segundos/minutos
// después, el fetch del cliente (misma URL exacta) se resuelve desde el
// dispositivo — patrón WhatsApp/Telegram web. Serve-once + TTL corto: se sirve
// UNA vez y se borra (los mensajes que lleguen después los trae el realtime),
// y nunca una respuesta más vieja que PREFETCH_MAX_AGE_MS.
const PUSH_PREFETCH_CACHE = 'mc-push-prefetch-v1'
const PREFETCH_MAX_AGE_MS = 10 * 60 * 1000

// URL del endpoint combinado para un deep-link de chat de un push. Debe ser
// BYTE-IDÉNTICA a la que arma el cliente (useChatHistory.fetchSessionWithMessages
// con limit=60) para que cache.match haga hit.
function chatPrefetchUrl(pushUrl) {
  try {
    const u = new URL(pushUrl, self.location.origin)
    if (u.pathname !== '/chat') return null
    const sessionId = u.searchParams.get('session')
    if (!sessionId || sessionId.startsWith('sdk:')) return null
    return `/api/chat/sessions/${encodeURIComponent(sessionId)}?with=messages&limit=60`
  } catch {
    return null
  }
}

async function prefetchChatSession(prefetchUrl) {
  try {
    const res = await fetch(prefetchUrl, { credentials: 'include', cache: 'no-store' })
    if (!res || res.status !== 200) return
    const body = await res.blob()
    const headers = new Headers(res.headers)
    headers.set('x-mc-prefetched-at', String(Date.now()))
    const cache = await caches.open(PUSH_PREFETCH_CACHE)
    await cache.put(prefetchUrl, new Response(body, { status: 200, headers }))
  } catch { /* best-effort: sin prefetch el tap sigue el flujo normal por red */ }
}

// Static asset extensions that use cache-first strategy
const CACHEABLE_STATIC = /\.(js|css|png|jpg|jpeg|svg|woff2|woff|ico|webp|avif|glb)$/

// Inmutables (11 oct 2026, datos móviles): los chunks de Next llevan el hash del contenido en el nombre y los
// avatares 3D (29-35 MB) se publican con `Cache-Control: immutable` (next.config). Una vez guardados no se vuelven
// a pedir: antes cada uso servido desde caché disparaba además un fetch de fondo, y si iOS había vaciado su caché
// HTTP ese fetch bajaba el archivo completo otra vez, en cada carga.
const INMUTABLE = (pathname) => pathname.startsWith('/_next/static/') || /\.glb$/.test(pathname)

// Turbopack/Webpack HMR chunks — must always hit network in dev. The hash in
// the filename changes every reload, so caching them serves dead URLs and
// crashes the Next.js router on hydration.
const HMR_CHUNK = /\/_next\/static\/chunks\/.*(turbopack|hmr|webpack-hmr)/i

// Rutas que NUNCA se sirven desde cache (flujos de auth deben ser frescos)
// Cuánto espera una navegación al HTML fresco antes de entregar el cacheado (apertura en frío por 5G/wifi).
const NAV_TOPE_MS = 1200

const NEVER_CACHE_PAGE = /^\/(login|signup|check-email|forgot-password|update-password|auth)/

// Solo cachear respuestas seguras: 200 same-origin sin redirect (un redirect
// a /login cacheado bajo /chat serviría la página equivocada para siempre).
function isCacheableResponse(response) {
  return response && response.status === 200 && response.type === 'basic' && !response.redirected
}

// Firma de build de un HTML: el conjunto de assets /_next/static/ que referencia.
// Cambia en cada deploy (hashes por chunk) — es nuestro detector de deploy nuevo.
function assetSignature(html) {
  const matches = html.match(/\/_next\/static\/[^"']+/g)
  if (!matches) return ''
  return [...new Set(matches)].sort().join('|')
}

// Revalidación con detector de skew: si el HTML fresco trae una firma de assets
// distinta a la del cacheado, hubo deploy — purgamos TODO el cache de páginas
// (cualquier otra ruta cacheada también es del build viejo) y FORZAMOS la
// recarga de los clients con client.navigate(). No sirve postMessage aquí: si
// el shell stale no pudo cargar sus chunks, el JS de la página está MUERTO y
// nadie escucha mensajes — navigate() funciona igual (verificado: ese era el
// hueco de la primera versión del guard). Rate-guard anti-loop: tras el
// navigate, el HTML re-cacheado ya es fresco → firmas iguales → no re-dispara.
let lastSkewReloadAt = 0

async function updatePageCache(pages, pageKey, response, cachedResponse) {
  try {
    const freshClone = response.clone()
    let deployChanged = false
    if (cachedResponse) {
      const [freshHtml, cachedHtml] = await Promise.all([
        response.clone().text(),
        cachedResponse.clone().text(),
      ])
      deployChanged = assetSignature(freshHtml) !== assetSignature(cachedHtml)
    }
    if (deployChanged) {
      await caches.delete(PAGES_CACHE)
      const fresh = await caches.open(PAGES_CACHE)
      await fresh.put(pageKey, freshClone)
      if (Date.now() - lastSkewReloadAt > 15000) {
        lastSkewReloadAt = Date.now()
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const client of clients) {
          try { await client.navigate(client.url) } catch { /* client cerrado */ }
        }
      }
    } else {
      await pages.put(pageKey, freshClone)
    }
  } catch { /* best-effort: la próxima navegación reintenta */ }
}

// ── Install: precache app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(['/icon.svg', '/manifest.json', '/levy.png']).catch(() => {})
      // Warm del shell de las rutas de arranque (best-effort: si no hay sesión
      // el server redirige a /login y isCacheableResponse lo descarta).
      const pages = await caches.open(PAGES_CACHE)
      await Promise.all(
        ['/ml-dashboard', '/chat'].map(async (path) => {
          try {
            const res = await fetch(path, { credentials: 'include' })
            if (isCacheableResponse(res)) await pages.put(path, res)
          } catch { /* offline durante install — se llena en la primera navegación */ }
        })
      )
      await self.skipWaiting()
    })()
  )
})

// ── Activate: clean old caches ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== PAGES_CACHE && n !== PUSH_PREFETCH_CACHE)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  // Red de seguridad contra version skew: si el cliente detecta un chunk 404
  // (deploy nuevo con HTML stale), limpia el cache de páginas y recarga.
  if (event.data?.type === 'CLEAR_PAGES_CACHE') {
    event.waitUntil(caches.delete(PAGES_CACHE))
  }
})

// ── Fetch: strategy per resource type ───────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET requests
  if (request.method !== 'GET') return
  // Range requests (audio/video seeking) — cache.put lanza con 206. Red directa.
  if (request.headers.has('range')) return

  const url = new URL(request.url)

  // Solo same-origin. Supabase/analytics/API/HMR van directo a red.
  if (url.origin !== self.location.origin) return

  // Serve-once del prefetch de push: el fetch del cliente tras tocar la
  // notificación (endpoint combinado sesión+mensajes) se resuelve desde el
  // cache que dejó el push handler — y se borra al servirse. TTL corto: si el
  // tap llegó tarde, se ignora el prefetch y va a red como siempre.
  if (url.pathname.startsWith('/api/chat/sessions/') && url.searchParams.get('with') === 'messages') {
    const key = url.pathname + url.search
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(PUSH_PREFETCH_CACHE)
          const hit = await cache.match(key)
          if (hit) {
            await cache.delete(key)
            const at = Number(hit.headers.get('x-mc-prefetched-at') || 0)
            if (at && Date.now() - at < PREFETCH_MAX_AGE_MS) return hit
          }
        } catch { /* cache roto — red directa */ }
        return fetch(event.request)
      })()
    )
    return
  }

  if (url.pathname.startsWith('/api/')) return
  if (HMR_CHUNK.test(url.pathname)) return

  // Cache-first: static assets (JS, CSS, images, fonts)
  if (CACHEABLE_STATIC.test(url.pathname) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          if (INMUTABLE(url.pathname)) return cached
          // Update cache in background (stale-while-revalidate for static)
          event.waitUntil(
            fetch(request).then((response) => {
              if (isCacheableResponse(response)) {
                return caches.open(CACHE_NAME).then((cache) => cache.put(request, response))
              }
            }).catch(() => {})
          )
          return cached
        }
        // Not in cache — fetch and cache
        return fetch(request).then((response) => {
          if (isCacheableResponse(response)) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {})
          }
          return response
        })
      })
    )
    return
  }

  // App-shell SWR: navegaciones HTML. Cacheado al instante + revalidación en
  // background. Key = pathname puro para que /chat?session=xyz (deep-link de
  // push) pinte el MISMO shell cacheado de /chat sin esperar red.
  // Nota: solo request.mode === 'navigate' — los fetch RSC/data de Next NO
  // entran aquí (siguen network-only), esto sirve únicamente el documento.
  if (request.mode === 'navigate') {
    if (NEVER_CACHE_PAGE.test(url.pathname)) return

    const pageKey = url.pathname

    // UN solo fetch fresco por navegación, compartido entre la respuesta (cache
    // miss) y la revalidación. Se pide por pathname con un GET limpio — NO se
    // re-usa la Request navigate original (re-fetchearla como side-request no
    // completaba de forma confiable en Chrome).
    const freshFetch = fetch(pageKey, {
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'text/html' },
    })

    // Qué se le entregó a la página: 'fresco' (la red ganó) o 'cache'. Solo si se entregó el cacheado tiene sentido
    // forzar la recarga por deploy nuevo; si ya se entregó el fresco, recargar sería otra pantalla de más.
    let entregar
    const entregado = new Promise((r) => { entregar = r })

    // Revalidación + detector de skew — waitUntil registrado SÍNCRONO en el
    // dispatch del evento (registrarlo tarde, tras awaits, no es confiable).
    event.waitUntil(
      (async () => {
        try {
          const pages = await caches.open(PAGES_CACHE)
          const cached = await pages.match(pageKey)
          const cachedClone = cached ? cached.clone() : null
          const response = await freshFetch
          if (isCacheableResponse(response)) {
            const como = await entregado
            await updatePageCache(pages, pageKey, response.clone(), como === 'cache' ? cachedClone : null)
          }
        } catch { /* offline — la próxima navegación reintenta */ }
      })()
    )

    event.respondWith(
      (async () => {
        const pages = await caches.open(PAGES_CACHE)
        const cached = await pages.match(pageKey)
        if (cached) {
          // Red primero con tope (11 oct 2026, Daniel: «cierro y abro la app y veo como 45 pantallas antes del Chat»).
          // Antes se pintaba el cacheado al instante; con varios deploys al día casi siempre era de un build viejo, así
          // que la revalidación detectaba el deploy y forzaba client.navigate: una recarga completa más en cada
          // apertura. Ahora, si la red responde en NAV_TOPE_MS, se entrega el HTML fresco y no hay recarga; si tarda o
          // no hay red, el cacheado de siempre (y la recarga auto-reparadora solo en ese caso).
          const fresco = await Promise.race([
            freshFetch.then((r) => (isCacheableResponse(r) ? r : null), () => null),
            new Promise((r) => setTimeout(() => r(null), NAV_TOPE_MS)),
          ])
          if (fresco) { entregar('fresco'); return fresco.clone() }
          entregar('cache')
          return cached
        }
        entregar('fresco')
        try {
          const response = await freshFetch
          // Una respuesta que ya siguió una redirección (p. ej. /todotask/hoy → /login
          // sin sesión) no se puede entregar a una navegación: Chrome y Safari la
          // rechazan con ERR_FAILED y la PWA abría en una pantalla de error (25 sep
          // 2026, al instalarla desde la URL final sin sesión). Se reenvía la
          // redirección para que el navegador la siga.
          if (response.redirected) return Response.redirect(response.url, 302)
          return response.clone()
        } catch {
          // Offline: el shell de /chat es el default de la app; /ml-dashboard
          // queda de respaldo para installs viejos que aún arrancan ahí.
          const fallback = (await pages.match('/chat')) || (await pages.match('/ml-dashboard'))
          return (
            fallback ||
            new Response(
              '<html><body style="background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><h2>Offline</h2><p>Check your connection and try again.</p></div></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            )
          )
        }
      })()
    )
    return
  }
})

// ── Push Events ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  // iOS-safe: SIEMPRE mostrar una notificación por cada push recibido. Apple
  // revoca la suscripción en silencio tras ~3 pushes que no muestran nada
  // (y pushsubscriptionchange NUNCA dispara en iOS para avisarlo). Un push
  // sin data muestra el genérico en vez de tragarse el evento.
  let payload = {}
  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { title: 'Arbrain', body: event.data.text() }
    }
  }

  const title = payload.title ?? 'Arbrain'
  const options = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag ?? 'mc-notification',
    data: { url: payload.url ?? '/', notificationId: payload.notificationId },
    requireInteraction: false,
    silent: false,
  }

  // Prefetch de la sesión de chat en el instante del push (antes del tap) —
  // en paralelo con mostrar la notificación, nunca bloqueándola (iOS-safe:
  // showNotification SIEMPRE corre).
  const prefetchUrl = chatPrefetchUrl(payload.url)
  // La campana abierta relee sus avisos al llegar un push (25 sep 2026).
  const notifyBell = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => clients.forEach((c) => c.postMessage({ type: 'aviso-recibido' })))
    .catch(() => undefined)
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      prefetchUrl ? prefetchChatSession(prefetchUrl) : Promise.resolve(),
      notifyBell,
    ])
  )
})

// ── Notification Click ────────────────────────────────────────────────
// v19 (18 oct 2026, Daniel: «me llegó la noti pero no a la conversación»):
// - Solo ventanas de primer nivel: matchAll también devuelve iframes del mismo
//   origen y antes se navegaba el primero que saliera (podía ser un iframe).
// - Primero se AVISA a la página (`notificacion-tocada`): en el teléfono, volver
//   tras minutos fuera abría un chat nuevo y pisaba el deep link; ese aviso lo frena.
// - Ya en /chat con deep link a una conversación: mensaje, sin recarga (ChatPanel
//   la abre). En otra ruta: focus y navigate; si iOS no deja navegar (rechaza o
//   devuelve null), `abrir-url` y la página navega sola.
function elegirVentana(clientList) {
  const propias = clientList.filter((c) => {
    if (c.frameType === 'nested') return false
    try { return new URL(c.url).origin === self.location.origin } catch { return false }
  })
  return (
    propias.find((c) => c.focused) ||
    propias.find((c) => c.visibilityState === 'visible') ||
    propias[0] ||
    null
  )
}

async function abrirDesdeNotificacion(targetUrl) {
  let destino
  try { destino = new URL(targetUrl, self.location.origin) } catch { destino = new URL('/', self.location.origin) }
  const url = destino.origin === self.location.origin ? destino.pathname + destino.search + destino.hash : destino.href
  const sessionId = destino.pathname === '/chat' ? destino.searchParams.get('session') : null
  const messageId = sessionId ? destino.searchParams.get('msg') : null

  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const client = elegirVentana(clientList)
  if (!client) {
    if (self.clients.openWindow) return self.clients.openWindow(url)
    return
  }

  client.postMessage({ type: 'notificacion-tocada', url })
  let enChat = false
  try { enChat = new URL(client.url).pathname === '/chat' } catch { /* url rara: se navega */ }
  if (sessionId) client.postMessage({ type: 'open-chat-session', sessionId, messageId })

  let ventana = client
  try { ventana = (await client.focus()) || client } catch { /* sin activación: se sigue */ }
  if (sessionId && enChat) return ventana

  let navegada = null
  try { navegada = await ventana.navigate(url) } catch { /* no controlada o iOS sin navigate */ }
  if (!navegada && destino.origin === self.location.origin) {
    ventana.postMessage({ type: 'abrir-url', url, sessionId, messageId })
  }
  return navegada || ventana
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/'
  event.waitUntil(abrirDesdeNotificacion(targetUrl).catch(() => undefined))
})

// ── Push Subscription Change ──────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: event.oldSubscription?.options?.applicationServerKey })
      .then((subscription) => {
        return fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        })
      })
  )
})
