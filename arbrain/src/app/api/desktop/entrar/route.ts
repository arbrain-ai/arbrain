import { DESKTOP_SESSION_COOKIE, isClientEdition, isDesktopSecret, isLocalHostname } from '@/lib/desktop-auth'
import { tokenDaemon } from '@/lib/daemon-local'
import { cookieSesion, crearFreno, esModoServidor, paseValido, urlControl } from '@/lib/modo-servidor'

// Entrada por navegador del modo servidor (21 oct 2026; docs/builds/modo-servidor-2026-10-21/REPORTE.md).
//   GET  ?pase=<64 hex>   el supervisor abre el navegador con un pase de un solo uso y 2 minutos; se canjea con él.
//   POST contrasena=…     el formulario de /sin-sesion (otro navegador, otra pestaña, después de 30 días).
// Las dos dejan la cookie de la app (`arbrain_escritorio`) por 30 días y saltan a /chat (página mínima, ver conSesion). Fuera del modo servidor: 404.
// El proxy deja pasar /api/desktop/* sin sesión y ya exige Host de loopback (hostDeLaApp).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
const freno = crearFreno()

function disponible(request: Request): boolean {
  if (!isClientEdition() || !esModoServidor() || process.env.MISSION_CONTROL_DESKTOP_EMBED !== '1') return false
  const host = (request.headers.get('host') ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  return isLocalHostname(host) && (process.env.ARBRAIN_DESKTOP_SECRET ?? '').length >= 32
}

const ir = (a: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { ...NOCACHE, Location: a, ...(cookie ? { 'Set-Cookie': cookie } : {}) } })

// La cookie es SameSite=Strict: si esta entrada llegó desde otro contexto (el enlace que abre la terminal, una extensión),
// un 303 directo a /chat sigue siendo «navegación ajena» y el navegador no manda la cookie recién puesta. Una página
// mínima de esta misma web hace el salto: ese segundo paso ya es del mismo sitio.
const conSesion = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/chat"><title>Arbrain</title><a href="/chat">Entrar a Arbrain</a>',
  { status: 200, headers: { ...NOCACHE, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookieSesion(DESKTOP_SESSION_COOKIE, process.env.ARBRAIN_DESKTOP_SECRET!) } },
)

export async function GET(request: Request) {
  if (!disponible(request)) return new Response(null, { status: 404 })
  const pase = new URL(request.url).searchParams.get('pase')
  const control = urlControl()
  const token = tokenDaemon()
  if (!paseValido(pase) || !control || !token) return ir('/sin-sesion?e=pase')
  try {
    const r = await fetch(`${control}/ticket/canjear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: pase }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean }
    return r.ok && j.ok === true ? conSesion() : ir('/sin-sesion?e=pase')
  } catch {
    return ir('/sin-sesion?e=pase')
  }
}

export async function POST(request: Request) {
  if (!disponible(request)) return new Response(null, { status: 404 })
  // Un formulario de otro sitio no puede iniciar sesión aquí: si el navegador manda Origin, debe ser esta misma web.
  const origen = request.headers.get('origin')
  if (origen && origen !== 'null') {
    try { if (new URL(origen).host !== request.headers.get('host')) return new Response('Origen no autorizado.', { status: 403, headers: NOCACHE }) } catch { return new Response('Origen no autorizado.', { status: 403, headers: NOCACHE }) }
  }
  if (freno.bloqueado()) return ir('/sin-sesion?e=espera')
  let dada = ''
  try { dada = String((await request.formData()).get('contrasena') ?? '').trim().toLowerCase() } catch { /* cuerpo ilegible = contraseña vacía */ }
  if (!isDesktopSecret(dada)) {
    freno.fallo()
    return ir('/sin-sesion?e=contrasena')
  }
  return conSesion()
}
