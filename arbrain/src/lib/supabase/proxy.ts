import { createServerClient } from '@supabase/ssr'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isEmailAllowed } from '@/lib/auth-config'
import { isDesktopAuthBypassRequest } from '@/lib/desktop-auth'
import { preferVerifiedClaims } from './claims-user'
import { SERVER_SUPABASE_URL, AUTH_COOKIE_NAME } from './urls'
import { escrituraEntreSitios } from '@/lib/guarda-sitio'

// Hardcoded to work around Next.js 16 Turbopack env var inlining bug.
// Publishable keys are designed to be public (RLS-protected); safe to embed.
// Mission Control vive en el Studio desde el 27 sep 2026: la URL y la llave vienen del entorno.
const SUPABASE_URL = SERVER_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Desktop bypass PRIMERO: la app Tauri (127.0.0.1:3218) no tiene sesión de
  // Supabase — llamar getUser() antes de este check era un round-trip/overhead
  // potencial en CADA request del desktop. Mismo patrón que draw3-auth.ts.
  if (isDesktopAuthBypassRequest(request)) {
    // El bypass no usa cookie: cualquier página abierta en el navegador podía mandar un POST simple a 127.0.0.1 y entraba
    // como Daniel. El webview de la app siempre es same-origin (carril 5-STUDIO, 21 oct 2026).
    if (escrituraEntreSitios(request.method, request.nextUrl.pathname, {
      secFetchSite: request.headers.get('sec-fetch-site'),
      authorization: request.headers.get('authorization'),
      conCookieDeSesion: true,
    })) return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    const isDesktopAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/signup')
    if (isDesktopAuthRoute) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return supabaseResponse
  }

  if (escrituraEntreSitios(request.method, request.nextUrl.pathname, {
    secFetchSite: request.headers.get('sec-fetch-site'),
    authorization: request.headers.get('authorization'),
    conCookieDeSesion: hasSessionCookie(request),
  })) return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      ...(AUTH_COOKIE_NAME ? { cookieOptions: { name: AUTH_COOKIE_NAME } } : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verificación local del JWT (ES256) en vez de un round-trip a Auth por request.
  preferVerifiedClaims(supabase)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // Auth caído no es sesión ausente (6 oct 2026): tras reiniciar el Studio, Next levanta antes que Supabase, el JWKS
  // no está en caché y getUser() falla por red. Mandar a /login con la cookie intacta obligaba a Daniel a reentrar
  // (y el login también fallaba). Con cookie de sesión y error de red: esperar y recargar, nunca dejar pasar.
  if (!user && isAuthRetryableFetchError(authError) && hasSessionCookie(request)) {
    return authDespertando(request)
  }

  // API routes for webhooks bypass auth (they use bearer tokens)
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                      request.nextUrl.pathname.startsWith('/signup')
  const isPublicRoute = isAuthRoute ||
                        request.nextUrl.pathname.startsWith('/check-email') ||
                        request.nextUrl.pathname.startsWith('/forgot-password') ||
                        request.nextUrl.pathname.startsWith('/update-password')

  // API routes: bearer-only endpoints pass through (no session cookie).
  // But if a session exists with a non-whitelisted email, block it.
  if (isApiRoute) {
    if (user && !isEmailAllowed(user.email ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return supabaseResponse
  }

  // Not authenticated → login (preserve return URL)
  if (!isPublicRoute && !user) {
    const loginUrl = new URL('/login', request.url)
    const returnTo = request.nextUrl.pathname
    if (returnTo && returnTo !== '/') {
      loginUrl.searchParams.set('next', returnTo)
    }
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated but email not whitelisted → sign out and block
  if (user && !isEmailAllowed(user.email ?? '')) {
    await supabase.auth.signOut()
    const url = new URL('/login', request.url)
    url.searchParams.set('error', 'unauthorized')
    return NextResponse.redirect(url)
  }

  // Already authenticated → redirect away from auth pages
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) =>
    AUTH_COOKIE_NAME ? name.startsWith(AUTH_COOKIE_NAME) : /^sb-.+-auth-token/.test(name)
  )
}

function authDespertando(request: NextRequest) {
  const headers = { 'Retry-After': '3', 'Cache-Control': 'no-store' }
  if (request.nextUrl.pathname.startsWith('/api/') || request.headers.get('rsc') === '1') {
    return NextResponse.json({ error: 'auth_unavailable' }, { status: 503, headers })
  }
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="3">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Arbrain</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px -apple-system,system-ui,sans-serif;background:#f2f2f3;color:#1a1a2e}
@media (prefers-color-scheme:dark){body{background:#111116;color:#e8e8f0}}p{opacity:.7}</style></head>
<body><div style="text-align:center"><strong>Arbrain está despertando</strong><p>Tu sesión sigue aquí. Reintento en 3 s.</p></div></body></html>`
  return new NextResponse(html, { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } })
}
