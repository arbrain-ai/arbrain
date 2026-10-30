import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole, RoleLookupError } from '@/lib/auth-utils'
import { createServiceClient } from '@/lib/supabase/service'
import { instalacion } from '@/config'

/** Id del agente Levy en la base de la instalación (config/instalacion.ts › idAgenteLevy). */
export const levyAgentId = () => instalacion().idAgenteLevy

export async function requireCalendarUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      user: null,
      role: null,
    }
  }

  let role: Awaited<ReturnType<typeof getUserRole>>
  try { role = await getUserRole(user.id) } catch (error) {
    if (!(error instanceof RoleLookupError)) throw error
    return { error: NextResponse.json({ error: 'La base de Arbrain no responde; reintenta en un momento.' }, { status: 503 }), user: null, role: null }
  }
  if (!role) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      user: null,
      role: null,
    }
  }

  return { error: null, user, role }
}

export function canUseAccount(role: string | null, accountEmail?: string) {
  if (!accountEmail) return true
  if (role === 'owner') return true
  return !!instalacion().correoNegocio && accountEmail === instalacion().correoNegocio
}

export async function logCalendarActivity(message: string, targetId?: string | null) {
  try {
    const service = createServiceClient()
    await service.from('activities').insert({
      type: 'calendar_update',
      agent_id: levyAgentId() || null,
      message,
      target_id: targetId ?? null,
    })
  } catch {
    // Activity logging should never break Calendar writes.
  }
}
