'use client'
/**
 * AuthProvider — fuente ÚNICA de auth para toda la app. Antes 11 componentes
 * llamaban useAuth por separado, cada uno con su propia suscripción onAuthStateChange
 * + su propio fetch de `profiles` (11 fetches en cada apertura). Ahora: 1 suscripción,
 * 1 fetch, compartido por contexto.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LOCAL_DESKTOP_EMAIL, LOCAL_DESKTOP_USER_ID } from '@/lib/desktop-auth'
import { isDesktopRuntime, isLocalhostRuntime } from '@/lib/local-first'
import { preguntarSesionLocal } from '@/lib/sesion-local'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile, UserRole } from '@/types/database'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import { nombreVisible } from '@/features/primer-arranque/textos/bienvenida'

const LOCAL_DESKTOP_PROFILE: Profile = {
  id: LOCAL_DESKTOP_USER_ID,
  full_name: instalacion().personas.dueno.nombreCompleto,
  avatar_url: null,
  email: LOCAL_DESKTOP_EMAIL,
  role: 'owner',
  created_at: '2026-05-26T00:00:00.000Z',
  updated_at: '2026-05-26T00:00:00.000Z',
}

/** Estado del perfil de un usuario CON sesión. 'sin-sesion' = nadie entró (no hay perfil que pedir). */
export type EstadoPerfil = 'sin-sesion' | 'cargando' | 'listo' | 'error'

export interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  isOwner: boolean
  role: UserRole
  /** Con sesión y perfil sin cargar, `role` NO es el real: no pintar ni decidir con él (2 oct 2026). */
  perfil: EstadoPerfil
  /** true cuando `role` es confiable: sin sesión, o con sesión y perfil cargado. */
  rolConfirmado: boolean
  reintentarPerfil: () => void
}

const AuthContext = createContext<AuthState>({
  user: null, profile: null, loading: true, isOwner: false, role: 'member',
  perfil: 'cargando', rolConfirmado: false, reintentarPerfil: () => {},
})

// Reintento del perfil: rápido al principio (red móvil), luego cada 30 s, sin rendirse nunca.
const esperaReintento = (intento: number) => Math.min(1200 * (intento + 1), 30_000)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil] = useState<EstadoPerfil>('cargando')
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  // Ruta para la que ya se releyó la cookie. Sin sesión, el rol 'member' solo cuenta como resuelto
  // cuando la cookie se leyó para ESTA ruta: si no, el guard redirige con el rol viejo antes de que
  // la reconciliación asíncrona descubra la sesión que el servidor acaba de fijar.
  const [rutaVerificada, setRutaVerificada] = useState<string | null>(null)
  // Lo que el efecto de Supabase expone hacia fuera: reconciliar con la cookie y reintentar el perfil.
  const syncRef = useRef<((ruta: string) => void) | null>(null)
  const reintentarRef = useRef<(() => void) | null>(null)
  // id del usuario cuyo profile YA cargó CON ÉXITO. Solo se marca tras un fetch OK,
  // para que un fetch fallido reintente en lugar de quedar atascado en role='member'.
  const loadedIdRef = useRef<string | null>(null)
  // id cuyo fetch está EN VUELO — dedupe de eventos repetidos (INITIAL_SESSION +
  // TOKEN_REFRESHED) sin marcarlo como cargado todavía.
  const fetchingIdRef = useRef<string | null>(null)

  // Un navegador normal en loopback contra un servidor con el bypass desktop
  // (ensayo local / canary sin Tauri) pinta la misma sesión sintética que el
  // desktop; el servidor decide (404 fuera del bypass) y entonces sigue Supabase.
  // Edición cliente: también fuera de loopback (modo servidor por el teléfono); ver lib/sesion-local.ts.
  const [localBypass, setLocalBypass] = useState<boolean | null>(() => preguntarSesionLocal({
    escritorio: isDesktopRuntime(), loopback: isLocalhostRuntime(), edicionCliente: esEdicionCliente(),
  }) ? null : false)
  useEffect(() => {
    if (localBypass !== null) return
    let mounted = true
    fetch('/api/local-first/desktop-session', { cache: 'no-store' })
      .then(response => { if (mounted) setLocalBypass(response.ok) })
      .catch(() => { if (mounted) setLocalBypass(false) })
    return () => { mounted = false }
  }, [localBypass])

  useEffect(() => {
    if (localBypass === null) return
    if (isDesktopRuntime() || localBypass) {
      setUser(null)
      setProfile(LOCAL_DESKTOP_PROFILE)
      setPerfil('listo')
      setLoading(false)
      // La sesión del escritorio es sintética y no trae foto: el pie mostraba la inicial «D» (5 oct 2026). La foto y
      // el nombre salen del perfil real del dueño (/api/equipo, `yo`); el id y el rol sintéticos no se tocan.
      let vivo = true
      if (esEdicionCliente()) {
        // Edición cliente (A/B ronda 3): el nombre es el que la persona dio en el primer arranque; sin él, «Tú».
        fetch('/api/primer-arranque', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then((d: { estado?: { nombre?: string | null } } | null) => {
          if (vivo) setProfile({ ...LOCAL_DESKTOP_PROFILE, full_name: nombreVisible(d?.estado?.nombre) })
        }).catch(() => { /* queda «Tú» */ })
        return () => { vivo = false }
      }
      fetch('/api/equipo', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then((d: { yo?: { avatar?: string | null; nombre?: string } | null } | null) => {
        if (vivo && d?.yo) setProfile({ ...LOCAL_DESKTOP_PROFILE, avatar_url: d.yo.avatar ?? null, full_name: d.yo.nombre || LOCAL_DESKTOP_PROFILE.full_name })
      }).catch(() => { /* sin foto: queda la inicial */ })
      return () => { vivo = false }
    }

    const supabase = createClient()
    let mounted = true
    let currentUserId: string | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    // setTimeout(0) escapa el navigator lock que supabase auth sostiene durante la
    // emisión del evento (sin esto, deadlock en la query REST). loading SOLO pasa a
    // false cuando el profile queda resuelto — NUNCA con profile=null por un evento
    // duplicado (esa ventana exponía role='member' y expulsaba al owner de las rutas
    // owner-only → loop de redirect en móvil/red lenta).
    // Si falla, NO se baja a 'member' en silencio (2 oct 2026): perfil='error', la UI lo
    // dice y se sigue reintentando con espera creciente hasta que cargue o cambie el usuario.
    const loadProfile = (userId: string, attempt = 0) => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      setTimeout(async () => {
        if (!mounted || currentUserId !== userId) return
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (!mounted || currentUserId !== userId) return
        if (error || !data) {
          // Cada intento ya trae los reintentos propios de postgrest-js: al primer fallo se suelta
          // loading (la UI no se cuelga) y se avisa que el rol no está confirmado.
          setPerfil('error')
          setLoading(false)
          retryTimer = setTimeout(() => { if (mounted) loadProfile(userId, attempt + 1) }, esperaReintento(attempt))
          return
        }
        fetchingIdRef.current = null
        loadedIdRef.current = userId
        setProfile(data)
        setPerfil('listo')
        setLoading(false)
      }, 0)
    }

    const applySession = (session: Session | null) => {
      const currentUser = session?.user ?? null
      if (!mounted) return
      setUser(currentUser)
      currentUserId = currentUser?.id ?? null

      if (!currentUser) {
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
        loadedIdRef.current = null
        fetchingIdRef.current = null
        setProfile(null)
        setPerfil('sin-sesion')
        setRutaVerificada(pathnameRef.current)
        setLoading(false)
        return
      }

      // Profile ya cargado con éxito → nada que hacer (loading ya es false).
      if (loadedIdRef.current === currentUser.id) return
      // Fetch en vuelo para este usuario → no duplicar.
      if (fetchingIdRef.current === currentUser.id) return

      fetchingIdRef.current = currentUser.id
      setProfile(null)
      setPerfil('cargando')
      setLoading(true)
      loadProfile(currentUser.id)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => applySession(session)
    )

    // El login y el logout de la web los hace el SERVIDOR (server actions que fijan o borran la
    // cookie y redirigen con navegación suave). Este provider vive en el layout raíz: se montó en
    // /login sin sesión y el cliente de Supabase del navegador no emite ningún evento cuando la
    // cookie cambia por debajo. Sin esta reconciliación el owner quedaba con user=null → role
    // 'member' → el guard lo mandaba a /board con solo Board y Calendario (2 oct 2026).
    // getSession() relee la cookie; si el usuario cambió, se aplica como cualquier evento.
    syncRef.current = (ruta) => {
      supabase.auth.getSession()
        .then(({ data }) => {
          if (!mounted) return
          if ((data.session?.user?.id ?? null) !== currentUserId) applySession(data.session)
        })
        .catch(() => {})
        .finally(() => { if (mounted) setRutaVerificada(ruta) })
    }
    reintentarRef.current = () => {
      if (currentUserId && loadedIdRef.current !== currentUserId) {
        setPerfil('cargando')
        loadProfile(currentUserId)
      }
    }
    const alVolver = () => { if (document.visibilityState === 'visible') syncRef.current?.(pathnameRef.current) }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)

    return () => {
      mounted = false
      if (retryTimer) clearTimeout(retryTimer)
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      syncRef.current = null
      reintentarRef.current = null
    }
  }, [localBypass])

  // Cada navegación (incluida la que sigue al login/logout del servidor) reconcilia con la cookie.
  useEffect(() => { syncRef.current?.(pathname) }, [pathname])

  const reintentarPerfil = useCallback(() => reintentarRef.current?.(), [])

  const isOwner = profile?.role === 'owner'
  const role: UserRole = profile?.role ?? 'member'
  const sinSesionPorConfirmar = perfil === 'sin-sesion' && rutaVerificada !== pathname
  const rolConfirmado = perfil === 'listo' || (perfil === 'sin-sesion' && !sinSesionPorConfirmar)

  return (
    <AuthContext.Provider value={{ user, profile, loading: loading || sinSesionPorConfirmar, isOwner, role, perfil, rolConfirmado, reintentarPerfil }}>
      {children}
      {(perfil === 'error' || (perfil === 'cargando' && user && !loading)) && (
        <AvisoPerfil reintentando={perfil === 'cargando'} onReintentar={reintentarPerfil} />
      )}
    </AuthContext.Provider>
  )
}

/** Aviso visible cuando hay sesión pero el perfil (y con él el rol) no cargó: nunca se degrada en silencio. */
function AvisoPerfil({ reintentando, onReintentar }: { reintentando: boolean; onReintentar: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-[100] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-border-subtle bg-surface/95 px-4 py-2 text-sm text-foreground shadow-depth-rest-soft backdrop-blur-xl"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span>{reintentando ? 'Cargando tu perfil…' : 'No pude cargar tu perfil. Reintento solo.'}</span>
      {!reintentando && (
        <button type="button" onClick={onReintentar} className="font-medium text-foreground/80 underline-offset-2 hover:underline">
          Reintentar ya
        </button>
      )}
    </div>
  )
}

export function useAuthContext(): AuthState {
  return useContext(AuthContext)
}
