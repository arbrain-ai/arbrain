import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isLocalDesktopUserId } from '@/lib/desktop-auth'
import type { UserRole } from '@/types/database'

// Cache in-memory del rol por userId (TTL 5 min). El rol de un profile casi
// nunca cambia, pero ANTES cada request de API pagaba un round-trip a Postgres
// solo para re-leerlo (16 call-sites de hasRole en /api/chat/* y compañía).
// En lambdas tibias de Vercel y en el server desktop esto elimina ese hop del
// critical path. Mismas semánticas: cache miss o expirado → query real.
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000
const roleCache = new Map<string, { role: UserRole | null; expires: number }>()

let cachedServiceClient: SupabaseClient | null = null
function getServiceClient(): SupabaseClient {
  if (cachedServiceClient) return cachedServiceClient
  const supabaseUrl = process.env.SUPABASE_URL_INTERNA || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials')
  }
  cachedServiceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cachedServiceClient
}

export class RoleLookupError extends Error {
  constructor(detail: string) { super(`No se pudo leer el rol (base de datos sin respuesta): ${detail}`); this.name = 'RoleLookupError' }
}

/**
 * Get the user's role from the database.
 * Throws RoleLookupError when the database fails; null only when the profile does not exist.
 * Used in API routes to enforce role-based access control.
 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  if (isLocalDesktopUserId(userId)) return 'owner'

  const hit = roleCache.get(userId)
  if (hit && hit.expires > Date.now()) return hit.role

  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  // Sin perfil = sin rol (403 legítimo). Base caída ≠ sin permiso: el 12 oct 2026 PostgREST murió
  // y Arbrain respondió «Forbidden» 8 horas; ahora el fallo sube como error y se reporta 503.
  if (error) throw new RoleLookupError(error.message)
  if (!data) return null

  const role = (data.role as UserRole) || 'member'
  roleCache.set(userId, { role, expires: Date.now() + ROLE_CACHE_TTL_MS })
  return role
}

/**
 * Check if the user is an owner.
 * Returns true only if role is 'owner'.
 */
export async function isOwner(userId: string): Promise<boolean> {
  const role = await getUserRole(userId)
  return role === 'owner'
}

/**
 * Check if the user has access to a specific role.
 * Useful for protecting specific features.
 */
export async function hasRole(userId: string, ...allowedRoles: UserRole[]): Promise<boolean> {
  const role = await getUserRole(userId)
  return role ? allowedRoles.includes(role) : false
}
