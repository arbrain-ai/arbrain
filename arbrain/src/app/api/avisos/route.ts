import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { checkMutationOrigin } from '@/lib/planning/server'
import { createServiceClient } from '@/lib/supabase/service'

// La campana (25 sep 2026). Lee y marca `avisos` del principal por el servidor:
// funciona igual en la PWA (sesión Supabase) y en el escritorio (bypass local),
// sin exponer la tabla al navegador. La telemetría vive en `bitacora` y nunca
// sale por aquí.

const noStore = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    const principal = await requireChatPrincipal()
    const supabase = createServiceClient()
    const [list, unread] = await Promise.all([
      supabase.from('avisos').select('id,created_at,kind,title,body,url,read_at').eq('user_id', principal.id)
        .order('created_at', { ascending: false }).limit(40),
      supabase.from('avisos').select('id', { count: 'exact', head: true }).eq('user_id', principal.id).is('read_at', null),
    ])
    if (list.error) throw new Error(list.error.message)
    return Response.json({ avisos: list.data ?? [], unread: unread.count ?? 0 }, { headers: noStore })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) {
      return Response.json({ error: 'No se pudo leer la campana.' }, { status: 503, headers: noStore })
    }
    return chatAccessResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    const principal = await requireChatPrincipal()
    const body = await request.json().catch(() => ({})) as { ids?: unknown }
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, 100) : null
    let query = createServiceClient().from('avisos').update({ read_at: new Date().toISOString() })
      .eq('user_id', principal.id).is('read_at', null)
    if (ids) query = query.in('id', ids)
    const { error } = await query
    if (error) throw new Error(error.message)
    return Response.json({ ok: true }, { headers: noStore })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) {
      return Response.json({ error: 'No se pudo marcar la campana.' }, { status: 503, headers: noStore })
    }
    return chatAccessResponse(error)
  }
}
