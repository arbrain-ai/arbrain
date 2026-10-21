import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decidir } from '@/features/avisos/policy'
import { ownerIds, registrar } from '@/features/avisos/server'
import { sameSecret } from '@/lib/desktop-auth'
import { prepararVapid } from '@/features/notifications/lib/vapid'

const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN

// Accepts: Bearer (OPENCLAW_GATEWAY_TOKEN) OR authenticated session
// Devuelve quién llama: 'servidor' (bearer) o el id del usuario con sesión (su destinatario por defecto).
async function authorize(req: NextRequest): Promise<{ por: 'servidor' } | { por: 'usuario'; id: string } | null> {
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    if (OPENCLAW_GATEWAY_TOKEN && sameSecret(token, OPENCLAW_GATEWAY_TOKEN)) return { por: 'servidor' }
  }
  // Fall back to session check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? { por: 'usuario', id: user.id } : null
}

export async function POST(req: NextRequest) {
  try {
    const quien = await authorize(req)
    if (!quien) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { title, body: msgBody, url, tag, userId, kind, source, quiet } = body as {
      title?: string
      body?: string
      url?: string
      tag?: string
      userId?: string
      kind?: string
      source?: string
      quiet?: boolean
    }

    // Use service client to bypass RLS (needed when called via bearer token)
    const supabase = createServiceClient()

    // Política única (25 sep 2026): decide ANTES de escribir o sonar. La telemetría
    // queda en la bitácora y nunca llega al teléfono ni a la campana. Todo lo demás
    // deja fila en `avisos` (la campana) antes del push. Ver features/avisos/policy.ts.
    const decision = decidir({ kind, source: source ?? tag, quiet })
    const aviso = { title: title ?? 'Arbrain', body: msgBody ?? '', url: url ?? '/' }
    if (decision.entrega === 'bitacora') {
      const recorded = await registrar(supabase, decision, aviso, [])
      return NextResponse.json({ sent: 0, entrega: 'bitacora', recorded })
    }

    // Safety default: if no userId is provided, only send to owners
    // (prevents accidental broadcast to all devices when a caller forgets to pass userId)
    // Con sesión propia (p. ej. La socia desde su teléfono) el aviso sin destinatario es SUYO, no del dueño.
    const targets = userId ? [userId] : quien.por === 'usuario' ? [quien.id] : await ownerIds(supabase)
    if (targets.length === 0) {
      return NextResponse.json({ sent: 0, reason: 'no userId provided and no owner profile found' })
    }
    const recorded = await registrar(supabase, decision, aviso, targets)
    if (decision.entrega === 'campana') {
      return NextResponse.json({ sent: 0, entrega: 'campana', recorded })
    }

    if (!prepararVapid()) {
      await supabase.from('push_log').insert({ job_id: decision.source, status: 'vapid_missing', error: 'VAPID keys not configured', title: aviso.title })
      return NextResponse.json({ error: 'VAPID not configured (missing env vars)', recorded }, { status: 500 })
    }

    const { data: subs, error: fetchError } = await supabase.from('push_subscriptions').select('*').in('user_id', targets)
    if (fetchError) {
      console.error('fetch push_subscriptions error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch subscriptions', detail: fetchError.message }, { status: 500 })
    }
    if (!subs || subs.length === 0) {
      await supabase.from('push_log').insert({ job_id: decision.source, status: 'no_subs', error: 'target has no push subscriptions', title: aviso.title })
      return NextResponse.json({ sent: 0, entrega: 'push', recorded, reason: 'no subscriptions found' })
    }

    const payload = JSON.stringify({
      title: aviso.title,
      body: aviso.body,
      url: aviso.url,
      tag: tag ?? decision.source,
      icon: '/icon.svg',
    })

    let sent = 0
    const errors: string[] = []
    const invalidEndpoints: string[] = []
    // Acuse por intento en push_log (sensor 30 jul 2026): antes esta ruta no dejaba
    // rastro y sus push eran invisibles para cualquier auditoría.
    const attempts: { job_id: string; status: 'accepted' | 'failed'; status_code?: number | null; error?: string | null; endpoint_tail: string; title: string }[] = []

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
          sent++
          attempts.push({ job_id: decision.source, status: 'accepted', endpoint_tail: sub.endpoint.slice(-16), title: aviso.title })
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`${status ?? 'unknown'}: ${msg}`)
          attempts.push({ job_id: decision.source, status: 'failed', status_code: status ?? null, error: msg.slice(0, 300), endpoint_tail: sub.endpoint.slice(-16), title: aviso.title })
          // 4xx = subscription expired/invalid — remove it
          if (status && status >= 400 && status < 500) {
            invalidEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    // Clean up invalid subscriptions
    if (invalidEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', invalidEndpoints)
    }

    if (attempts.length) {
      const { error: logError } = await supabase.from('push_log').insert(attempts)
      if (logError) console.error('push_log insert failed:', logError.message)
    }

    return NextResponse.json({ sent, entrega: 'push', recorded, cleaned: invalidEndpoints.length, errors: errors.length > 0 ? errors : undefined })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('notifications/send crash:', msg)
    return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 })
  }
}
