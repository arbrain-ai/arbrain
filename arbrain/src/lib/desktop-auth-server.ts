import { cookies, headers } from 'next/headers'
import { DESKTOP_SESSION_COOKIE, esCookieDeSesion, hostnameFromHostHeader, isClientEdition, isLocalHostname } from '@/lib/desktop-auth'
import { llegaPorTelefono } from '@/features/telefono/host-telefono'

export async function isDesktopAuthBypassFromHeaders() {
  const headerStore = await headers()
  const host = headerStore.get('host')
  // Teléfono (23 oct 2026): el Host *.ts.net encendido cuenta como el de la app; la cookie se exige igual (abajo).
  const permitido = isLocalHostname(hostnameFromHostHeader(host)) || llegaPorTelefono(host, headerStore.get('x-forwarded-proto'))
  if (process.env.MISSION_CONTROL_DESKTOP_EMBED !== '1' || !permitido) return false
  // Edición cliente (AUDITORIA I5): el Host se falsifica; vale solo la cookie del secreto por instalación.
  if (!isClientEdition()) return true
  const cookieStore = await cookies()
  return esCookieDeSesion(cookieStore.get(DESKTOP_SESSION_COOKIE)?.value)
}
