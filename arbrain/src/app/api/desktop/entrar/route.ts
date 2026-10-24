import { DESKTOP_SESSION_COOKIE, isClientEdition, isDesktopSecret, isLocalHostname, tokenSesionServidor } from '@/lib/desktop-auth'
import { tokenDaemon } from '@/lib/daemon-local'
import { cookieSesion, crearFreno, esModoServidor, origenDeEntrada, paseValido, urlControl } from '@/lib/modo-servidor'
import { llegaPorTelefono } from '@/features/telefono/host-telefono'
import { pareceCodigo } from '@/features/telefono/codigo'

// Entrada por navegador del modo servidor (21 oct 2026; docs/builds/modo-servidor-2026-10-21/REPORTE.md).
//   GET  ?pase=<64 hex>   el supervisor abre el navegador con un pase de un solo uso y 2 minutos; se canjea con él.
//   POST contrasena=…     el formulario de /sin-sesion (otro navegador, otra pestaña, después de 30 días).
// Las dos dejan la cookie de la app (`arbrain_escritorio`, el token derivado de la contraseña, nunca la contraseña: M2) por 30 días y saltan a /chat (página mínima, ver conSesion). Fuera del modo servidor: 404.
// El proxy deja pasar /api/desktop/* sin sesión y ya exige Host de loopback (hostDeLaApp).
// Teléfono (23 oct 2026): también por el Host *.ts.net encendido (HTTPS de Tailscale); ahí la cookie lleva Secure y,
// además de la contraseña, vale un código de un solo uso de Ajustes › Tu cerebro en el teléfono (lo canjea el supervisor).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
const freno = crearFreno()

const porTelefono = (request: Request) => llegaPorTelefono(request.headers.get('host'), request.headers.get('x-forwarded-proto'))

function disponible(request: Request): boolean {
  if (!isClientEdition() || !esModoServidor() || process.env.MISSION_CONTROL_DESKTOP_EMBED !== '1') return false
  const host = (request.headers.get('host') ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  return (isLocalHostname(host) || porTelefono(request)) && (process.env.ARBRAIN_DESKTOP_SECRET ?? '').length >= 32
}

const ir = (a: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { ...NOCACHE, Location: a, ...(cookie ? { 'Set-Cookie': cookie } : {}) } })

// La cookie es SameSite=Strict: si esta entrada llegó desde otro contexto (el enlace que abre la terminal, una extensión),
// un 303 directo a /chat sigue siendo «navegación ajena» y el navegador no manda la cookie recién puesta. Una página
// mínima de esta misma web hace el salto: ese segundo paso ya es del mismo sitio.
const conSesion = (segura = false) => new Response(
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/chat"><title>Arbrain</title><a href="/chat">Entrar a Arbrain</a>',
  { status: 200, headers: { ...NOCACHE, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookieSesion(DESKTOP_SESSION_COOKIE, tokenSesionServidor()!, segura) } },
)

/** Código de un solo uso (teléfono): lo canjea el supervisor; vale una vez y 10 minutos. */
async function canjearCodigo(codigo: string): Promise<boolean> {
  const control = urlControl()
  const token = tokenDaemon()
  if (!control || !token) return false
  try {
    const r = await fetch(`${control}/telefono/codigo/canjear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean }
    return r.ok && j.ok === true
  } catch { return false }
}

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
    return r.ok && j.ok === true ? conSesion(porTelefono(request)) : ir('/sin-sesion?e=pase')
  } catch {
    return ir('/sin-sesion?e=pase')
  }
}

export async function POST(request: Request) {
  if (!disponible(request)) return new Response(null, { status: 404 })
  // Un formulario de otro sitio no puede iniciar sesión aquí: si el navegador manda Origin, debe ser esta misma web.
  // `Origin: null` también se rechaza (v0.2.2, Bajo 1): antes pasaba y cualquiera podía quemar el freno. Ver origenDeEntrada.
  if (!origenDeEntrada(request.headers.get('origin'), request.headers.get('host'))) return new Response('Origen no autorizado.', { status: 403, headers: NOCACHE })
  if (freno.bloqueado()) return ir('/sin-sesion?e=espera')
  let dada = ''
  try { dada = String((await request.formData()).get('contrasena') ?? '').trim().toLowerCase() } catch { /* cuerpo ilegible = contraseña vacía */ }
  if (isDesktopSecret(dada)) return conSesion(porTelefono(request))
  if (pareceCodigo(dada) && (await canjearCodigo(dada))) return conSesion(porTelefono(request))
  freno.fallo()
  return ir(pareceCodigo(dada) ? '/sin-sesion?e=codigo' : '/sin-sesion?e=contrasena')
}
