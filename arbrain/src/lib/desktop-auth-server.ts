import { cookies, headers } from 'next/headers'
import { DESKTOP_SESSION_COOKIE, hostnameFromHostHeader, isClientEdition, isDesktopSecret, isLocalHostname } from '@/lib/desktop-auth'

export async function isDesktopAuthBypassFromHeaders() {
  const headerStore = await headers()
  if (process.env.MISSION_CONTROL_DESKTOP_EMBED !== '1' || !isLocalHostname(hostnameFromHostHeader(headerStore.get('host')))) return false
  // Edición cliente (AUDITORIA I5): el Host se falsifica; vale solo la cookie del secreto por instalación.
  if (!isClientEdition()) return true
  const cookieStore = await cookies()
  return isDesktopSecret(cookieStore.get(DESKTOP_SESSION_COOKIE)?.value)
}
