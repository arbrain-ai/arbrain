import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole } from '@/lib/auth-utils'

// Historial de corridas de cron (conversations source='cron') server-side.
// El Cron Lens del calendario lo consumia con el cliente browser de Supabase,
// que en la app de escritorio (Tauri) NO tiene sesion → RLS bloqueaba y los runs
// pasados salian vacios (solo se veian los futuros, que vienen de claudeclaw).
// Aqui va con service client (auth-gated a owner/admin) → funciona web + desktop.

async function authorized(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const role = await getUserRole(user.id)
  return role === 'owner' || role === 'admin'
}

export async function GET(request: Request) {
  if (!(await authorized())) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }
  const url = new URL(request.url)
  const jobId = url.searchParams.get('jobId')
  const jobIdsParam = url.searchParams.get('jobIds')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? '300')))

  const service = createServiceClient()
  let q = service
    .from('conversations')
    .select('id, run_id, prompt, response, error, status, created_at')
    .eq('source', 'cron')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (jobId) {
    // Historial completo de un job (panel "ver historial").
    q = q.eq('prompt', jobId)
  } else {
    // Modo rango (calendario): jobs visibles dentro de la ventana.
    const jobIds = (jobIdsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (jobIds.length === 0) return Response.json({ runs: [] })
    q = q.in('prompt', jobIds)
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lt('created_at', to)
  }

  const { data, error } = await q
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const runs = (data ?? []).map((row) => ({
    id: row.id,
    run_id: row.run_id,
    job_id: row.prompt,
    response: row.response,
    error: row.error,
    status: row.status,
    created_at: row.created_at,
  }))
  return Response.json({ runs })
}
