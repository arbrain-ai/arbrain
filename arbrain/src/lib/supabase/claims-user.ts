import type { SupabaseClient, User } from '@supabase/supabase-js'

// getUser() → getClaims() (26 sep 2026, pase de latencia).
//
// `auth.getUser()` hace un round-trip al servidor de Auth en CADA llamada. En el
// PWA eso se pagaba dos veces por request (proxy + route handler) y además cruzaba
// el continente (funciones en iad1, Supabase en us-west-2). El proyecto firma los
// JWT con llave asimétrica (ES256), así que `getClaims()` verifica la firma LOCAL
// contra el JWKS (cacheado en memoria del proceso) y solo va a la red si el token
// expiró y hay que refrescarlo.
//
// El servidor solo usa `user.id` y `user.email` (auditado 26 sep), que viajan en
// los claims. Si el token no verifica, se cae al getUser() original: mismas
// semánticas de seguridad, nunca más permisivo.
type GetUser = SupabaseClient['auth']['getUser']

export function preferVerifiedClaims(client: SupabaseClient): void {
  const originalGetUser: GetUser = client.auth.getUser.bind(client.auth)
  client.auth.getUser = (async (jwt?: string) => {
    if (jwt) return originalGetUser(jwt)
    const result = await client.auth.getClaims().catch(() => null)
    const claims = result?.data?.claims
    if (!result?.error && claims?.sub) {
      const user = {
        id: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : undefined,
        phone: typeof claims.phone === 'string' ? claims.phone : undefined,
        aud: Array.isArray(claims.aud) ? claims.aud[0] : claims.aud,
        role: claims.role,
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
        is_anonymous: claims.is_anonymous,
        created_at: '',
      } as User
      return { data: { user }, error: null }
    }
    return originalGetUser()
  }) as GetUser
}
