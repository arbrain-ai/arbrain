import type { UserRole } from '@/types/database'

const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['owner', 'admin', 'member'],
  '/hoy': ['owner'],
  '/todotask': ['owner'],
  '/board': ['owner', 'admin', 'member'],
  '/chat': ['owner'],
  '/activity': ['owner'],
  '/ops': ['owner', 'admin'],
  '/cron': ['owner'],
  '/rutinas': ['owner'],
  '/memoria': ['owner'],
  '/equipo': ['owner'],
  '/salud': ['owner', 'admin', 'member'],
  '/masterclass': ['owner'],
  '/cohorte': ['owner'],
  '/calendar': ['owner', 'admin', 'member'],
  '/objectives': ['owner'],
  '/draw3': ['owner', 'admin'],
  '/lienzo': ['owner', 'admin'],
  '/settings': ['owner', 'admin', 'member'],
  '/vision': ['owner', 'admin', 'member'],
  '/ml-dashboard': ['owner'],
  '/command-center': ['owner'],
  '/intel': ['owner'],
  '/finanzas': ['owner', 'admin'],
  '/sistema': ['owner'],
  '/comments': ['owner'],
  '/youtube': ['owner'],
  '/segundo-cerebro': ['owner'],
}

export function canAccessRoute(ruta: string, role: UserRole): boolean {
  if (role === 'owner') return true
  // Un atajo puede traer su escala (`/calendar?mode=day`): manda la ruta.
  const pathname = ruta.split(/[?#]/)[0]

  // Exact match
  const exact = ROUTE_PERMISSIONS[pathname]
  if (exact) return exact.includes(role)

  // Prefix match for dynamic routes like /draw/[id]
  for (const [route, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (route !== '/' && pathname.startsWith(route + '/')) {
      return roles.includes(role)
    }
  }

  // Default: owner-only
  return false
}

// Rutas de aterrizaje SEGURAS: páginas reales que NO redirigen server-side.
// OJO: '/' NO va aquí — '/' hace redirect('/chat') (owner-only), así que mandar a
// un no-owner a '/' lo devuelve a '/chat', el guard lo vuelve a expulsar y se forma
// un loop infinito (el parpadeo). Estas rutas se quedan donde aterrizan.
// /ops salió el 5 oct 2026: ahora redirige (al chat, solo del dueño) y dejaría al admin rebotando.
const SAFE_LANDING_ROUTES = ['/board', '/calendar', '/finanzas', '/settings'] as const

// A dónde mandar a un usuario cuando NO puede ver la ruta actual. Devuelve la primera
// ruta segura que su rol sí puede abrir (owner nunca llega aquí: canAccessRoute=true).
export function landingRouteFor(role: UserRole): string {
  for (const route of SAFE_LANDING_ROUTES) {
    if (canAccessRoute(route, role)) return route
  }
  return '/board'
}
