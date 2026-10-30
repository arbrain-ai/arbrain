import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole } from '@/lib/auth-utils'
import { SENSOR_JOB_IDS_HISTORICOS } from '@/shared/constants/cron-taxonomy'

// Runs de crons SENSOR para la zona INTELIGENCIA de /sistema. Server-side por
// la misma razón que /api/sistema: el cliente browser de Supabase no tiene
// sesión en el webview de la desktop (Tauri) y RLS devuelve vacío.

const LOOKBACK_DAYS = 30
const RUN_LIMIT = 200

async function authorized(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const role = await getUserRole(user.id)
  return role === 'owner' || role === 'admin'
}

export async function GET() {
  if (!(await authorized())) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }
  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)

  const service = createServiceClient()
  const { data } = await service
    .from('conversations')
    .select('id, run_id, prompt, response, error, status, created_at')
    .eq('source', 'cron')
    .in('prompt', [...SENSOR_JOB_IDS_HISTORICOS])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(RUN_LIMIT)

  return Response.json({ runs: data ?? [] })
}
