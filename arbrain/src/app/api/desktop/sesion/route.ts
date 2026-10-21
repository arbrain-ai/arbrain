import { DESKTOP_SESSION_COOKIE, isClientEdition, isDesktopSecret, isLocalHostname } from '@/lib/desktop-auth'
import { destinoSeguro } from '@/features/auth/entrada'

// Entrada de la app de escritorio en la edición cliente (seguridad, 10 oct 2026; AUDITORIA I5).
// La app abre `/api/desktop/sesion?t=<secreto>&a=<ruta>` en su primera carga: si el secreto por instalación coincide,
// queda una cookie HttpOnly y se redirige a la ruta. Así «es la app» deja de depender del encabezado Host.
// En la instalación de Daniel esta ruta no hace nada (404).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isClientEdition() || process.env.MISSION_CONTROL_DESKTOP_EMBED !== '1') return new Response(null, { status: 404 })
  const url = new URL(request.url)
  const host = (request.headers.get('host') ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  if (!isLocalHostname(host) || !isDesktopSecret(url.searchParams.get('t'))) {
    return new Response('No autorizado.', { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }
  const destino = destinoSeguro(url.searchParams.get('a'))
  // Cookie de sesión (sin Max-Age): el secreto es por apertura (CONTRATO-DAEMON v2) y así el webview no lo escribe en su
  // almacén de cookies en disco, donde un agente con Bash podría leerlo.
  const cookie = `${DESKTOP_SESSION_COOKIE}=${encodeURIComponent(process.env.ARBRAIN_DESKTOP_SECRET!)}; Path=/; HttpOnly; SameSite=Strict`
  return new Response(null, { status: 303, headers: { Location: destino, 'Set-Cookie': cookie, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
