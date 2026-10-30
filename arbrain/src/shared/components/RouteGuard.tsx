'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute, landingRouteFor } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

const CACHED_ROLE_KEY = 'mc_cachedRole'
const VALID_ROLES: UserRole[] = ['owner', 'admin', 'member']

// Lectura SSR-safe del rol cacheado (24 ago 2026). ANTES vivia en un useEffect,
// asi que el rol llegaba DESPUES del primer pintado: la apertura en frio pintaba
// el placeholder vacio de abajo, luego el contenido optimista, luego el contenido
// ya con auth resuelto = TRES repintados visibles en cada cold open del PWA.
// useSyncExternalStore aplica el valor DURANTE la hidratacion (no tras un effect)
// sin romperla: el server devuelve null y React reconcilia. Es el mismo patron que
// ya usa useMediaQuery en este repo, y por la misma razon (matar el parpadeo).
const subscribeCachedRole = () => () => {}
const getCachedRoleSnapshot = (): UserRole | null => {
  try {
    const stored = localStorage.getItem(CACHED_ROLE_KEY) as UserRole | null
    return stored && VALID_ROLES.includes(stored) ? stored : null
  } catch {
    return null // storage bloqueado (modo privado)
  }
}
const getCachedRoleServerSnapshot = (): UserRole | null => null

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, role, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const checkedRef = useRef(false)

  // Render optimista: el rol cacheado de la última sesión resuelta pinta el
  // contenido AL INSTANTE (sin esperar el round-trip auth+profile, que en red
  // mala tarda segundos). Es solo percepción de UI — cada API sigue validando
  // server-side, y si el rol real difiere al resolver, el guard corrige abajo.
  // Se lee con useSyncExternalStore (arriba): el valor entra DURANTE la
  // hidratación, sin el repintado extra que costaba el useEffect.
  const cachedRole = useSyncExternalStore(
    subscribeCachedRole,
    getCachedRoleSnapshot,
    getCachedRoleServerSnapshot
  )

  // Auth resuelto = no cargando Y (sin sesión | profile presente). Un usuario CON
  // sesión pero con profile aún en null (fetch en vuelo / reintentando) NO se trata
  // como 'member': de lo contrario el owner es expulsado de las rutas owner-only
  // durante el arranque y se dispara el loop de redirect (móvil/red lenta).
  const authResolved = !loading && (!user || profile !== null)

  useEffect(() => {
    if (!authResolved) return
    if (!canAccessRoute(pathname, role)) {
      // Mandar a una ruta que ESTE rol sí pueda ver y que no redirija. Antes esto
      // era router.replace('/'), pero '/' reenvía a '/chat' (owner-only) y para un
      // no-owner eso era un loop infinito (el parpadeo). landingRouteFor rompe el ciclo.
      const landing = landingRouteFor(role)
      if (pathname !== landing) router.replace(landing)
    } else {
      checkedRef.current = true
      // Solo cachear el rol de una sesión REAL (user presente). Sin esto, la
      // ventana logged-out (user null → role default 'member') contaminaba el
      // cache y degradaba el render optimista del owner.
      if (user && role) {
        try { localStorage.setItem(CACHED_ROLE_KEY, role) } catch { /* storage bloqueado */ }
      }
    }
  }, [pathname, role, user, authResolved, router])

  // Antes del primer check exitoso, mostrar un contenedor estable (no `null`, que
  // colapsa el main y produce el flash blanco→contenido). El bg del shell se ve.
  // Excepción: con rol cacheado que da acceso, pintamos el contenido de inmediato.
  if (!checkedRef.current) {
    const optimistic = !authResolved && cachedRole !== null && canAccessRoute(pathname, cachedRole)
    if (!authResolved && !optimistic) return <div className="h-full" aria-hidden />
    if (authResolved && !canAccessRoute(pathname, role)) return <div className="h-full" aria-hidden />
  }

  return <>{children}</>
}
