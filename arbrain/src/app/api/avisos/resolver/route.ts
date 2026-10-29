import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sameSecret } from '@/lib/desktop-auth'

// El emisor cierra su aviso cuando la causa se resolvió (29 oct 2026): el recap ya se publicó, la grabación apareció.
// Solo servidor (Bearer OPENCLAW_GATEWAY_TOKEN, como /api/notifications/send). Por `clave` (el `tag` con que avisó) o
// por `url` exacta. Idempotente: lo ya cerrado no se toca. Body: { clave?: string, url?: string, por?: string }.

const noStore = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const secreto = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!secreto || !token || !sameSecret(token, secreto)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  const body = await req.json().catch(() => ({})) as { clave?: unknown; url?: unknown; por?: unknown }
  const clave = typeof body.clave === 'string' && body.clave.trim() ? body.clave.trim().slice(0, 200) : null
  const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim().slice(0, 2000) : null
  if (!clave && !url) return Response.json({ error: 'Falta clave o url.' }, { status: 400, headers: noStore })
  const por = typeof body.por === 'string' && /^[a-z-]{3,30}$/.test(body.por) ? body.por : 'causa-resuelta'
  const ahora = new Date().toISOString()
  const supabase = createServiceClient()
  let q = supabase.from('avisos').update({ resuelto_at: ahora, resuelto_por: por }).is('resuelto_at', null)
  q = clave ? q.eq('clave', clave) : q.eq('url', url!)
  const { data, error } = await q.select('id')
  if (error) return Response.json({ error: error.message }, { status: 503, headers: noStore })
  const ids = (data ?? []).map(f => f.id as string)
  if (ids.length) await supabase.from('avisos').update({ read_at: ahora }).in('id', ids).is('read_at', null)
  return Response.json({ cerrados: ids.length }, { headers: noStore })
}
