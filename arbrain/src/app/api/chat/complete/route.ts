import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'
import { perfilDelTurno, ownerIds as buzonDelDueno } from '@/features/avisos/server'
import { filasInyectadas } from '@/features/chat/lib/inyecciones'
import { sameSecret } from '@/lib/desktop-auth'
import { instalacion } from '@/config'

const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN

// Lazy init VAPID
let vapidReady = false
function ensureVapid() {
  if (vapidReady) return
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim()
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? '').trim()
  if (!publicKey || !privateKey) return
  webpush.setVapidDetails(
    `mailto:${(process.env.VAPID_EMAIL ?? instalacion().correoDueno).trim()}`,
    publicKey,
    privateKey,
  )
  vapidReady = true
}

interface CompletePayload {
  chatSessionId?: string | null
  // Dueño del turno (el daemon durable lo manda siempre). Con varios perfiles es lo que decide a
  // quién se le guarda la sesión nueva y a quién le suena el push, también en sesiones `sdk:`.
  ownerId?: string | null
  terminalStatus?: 'completed' | 'failed' | 'interrupted'
  error?: string | null
  runtimeSnapshot?: Record<string, unknown>
  userMessage: string
  assistantMessage: string
  audioUrl?: string | null
  imageUrl?: string | null
  assistantAudioUrl?: string | null
  fileAttachments?: Array<{ url: string; filename: string; mimeType: string; size?: number }> | null
  // ── Protocolo nuevo (entrega garantizada, jul 2026) ──
  // turnId presente = daemon nuevo. clientAcked=true significa que el cliente
  // confirmó (POST /api/chat/ack) que YA guardó el turno y lo está viendo.
  turnId?: string | null
  clientAcked?: boolean
  // Cuándo EMPEZÓ el turno (ms, created_at del journal del daemon). 1 oct 2026: las filas se insertan al
  // terminar; sin esto un turno largo o interrumpido quedaba ordenado DESPUÉS del turno siguiente.
  startedAt?: number | null
  usage?: Record<string, unknown> | null
  downgrade?: Record<string, unknown> | null
  toolSummaries?: string[] | null
  suggestions?: string[] | null
  // Chat vivo (3 oct 2026): turno que Daniel no escribió. `espontanea` = Levy respondió solo a un aviso
  // (sin fila del user); `despertador` = lo disparó un despertador (la fila del user lo dice).
  origen?: { tipo: 'espontanea' | 'despertador'; etiqueta?: string; despertadorId?: string } | null
  // Inyección a mitad de turno (7 oct 2026): lo que Daniel escribió con este turno vivo y el modelo leyó.
  // Cada uno es una fila de Daniel con SU turnId (el índice único (turnId, role) dedupea reintentos y otros
  // dispositivos) e `injectedInto` = este turno, para que la web lo pinte dentro de su actividad.
  injectedMessages?: Array<{ turnId: string; message: string; sentAt?: number | null; afterToolId?: string | null }> | null
  // ── Protocolo legacy (detección de desconexión — NUNCA funcionó en iOS) ──
  // Se conserva solo para el skew de deploy daemon-viejo/route-nuevo.
  clientWasConnected?: boolean
  source?: 'mobile' | 'desktop'
}

type PushResult = { host: string; statusCode?: number; error?: string }

/**
 * Completion webhook — ClaudeClaw lo postea al terminar CADA turno del chat.
 *
 * Diseño "server-owned turn" (asumir desconexión, no detectarla):
 * - turnId presente y sin ACK del cliente → este route PERSISTE el turno
 *   (el índice único chat_messages_turnid_role_uniq hace el dedupe atómico
 *   contra el guardado rico del cliente, gane quien gane la carrera).
 * - push SOLO si el origen fue móvil y el cliente NO ack-eó (nadie está viendo
 *   el chat) — el mismo criterio que Claude iOS: notificar al que se fue.
 * - CADA webpush.sendNotification se loggea con statusCode + host y se devuelve
 *   en la respuesta (el daemon loggea el body → evidencia E2E en sus logs).
 *
 * Auth: Bearer OPENCLAW_GATEWAY_TOKEN only (server-to-server).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token || !OPENCLAW_GATEWAY_TOKEN || !sameSecret(token, OPENCLAW_GATEWAY_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = (await req.json()) as CompletePayload
  const {
    chatSessionId, userMessage, assistantMessage, audioUrl, imageUrl,
    assistantAudioUrl, fileAttachments, turnId, clientAcked, usage, downgrade,
    toolSummaries, suggestions, clientWasConnected, source,
  } = payload

  if (!userMessage || (!assistantMessage && !payload.terminalStatus)) {
    return NextResponse.json({ error: 'userMessage and assistantMessage required' }, { status: 400 })
  }

  // Inicio del turno: solo si es un instante verosímil (ni 0 ni del futuro); si no, se ignora y manda created_at.
  const startedAt = typeof payload.startedAt === 'number' && Number.isFinite(payload.startedAt)
    && payload.startedAt > 1_600_000_000_000 && payload.startedAt <= Date.now() + 60_000
    ? Math.floor(payload.startedAt) : null

  const finalContent = assistantMessage || payload.error || (payload.terminalStatus === 'interrupted' ? 'Turno interrumpido.' : 'El turno terminó sin respuesta.')
  const supabase = createServiceClient()
  let sessionId = chatSessionId
  let saved = false
  let dedupeReason: string | null = null

  // Sesiones SDK-only ("sdk:<uuid>"): NO tienen filas en chat_sessions/
  // chat_messages — su verdad es el transcript del daemon (el cliente las
  // reconcilia con el loader sdk: + /api/chat/live). Intentar persistir aquí
  // crasheaba con "invalid input syntax for type uuid" (visto 7 jul, sesión
  // sdk:fed9f97a) y el turno se perdía. Se salta Supabase; el push SÍ sale.
  const isSdkSession = !!sessionId?.startsWith('sdk:')
  if (isSdkSession) dedupeReason = 'sdk-only session (el transcript del daemon es la verdad)'

  // Protocolo nuevo: persistir SIEMPRE que el turno no exista ya (por turnId).
  // Protocolo legacy: solo si el daemon reportó desconexión (comportamiento viejo).
  const shouldPersist = isSdkSession ? false : turnId ? true : !clientWasConnected

  if (shouldPersist) {
    if (!sessionId) {
      const ownerProfileId = perfilDelTurno(payload.ownerId) ?? (await buzonDelDueno(supabase))[0]
      const title = userMessage.replace(/^\[Nota de voz\]:\s*/i, '').slice(0, 55) + (userMessage.length > 55 ? '...' : '')
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({ title, profile_id: ownerProfileId ?? null })
        .select('id')
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
      }
      sessionId = data.id
    }

    if (turnId) {
      // Dedupe exacto por identidad de turno (independiente del contenido: dos
      // "ok" seguidos ya no se confunden). Check barato primero; el índice
      // único es el candado atómico si la carrera se cuela entre check e insert.
      // ⚠️ Filtrar por role='assistant' es OBLIGATORIO: el guardado eager del
      // cliente (18 jul) persiste la fila del USER al enviar, así que una fila
      // con este turnId existe SIEMPRE al llegar el webhook. Sin el filtro, el
      // check corto-circuitaba con "client saved" y el assistant JAMÁS se
      // guardaba server-side — todo turno completado con la app backgroundeada
      // se perdía de Supabase (bug 18-20 jul: "el mensaje desaparece al volver").
      const { data: existing } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('session_id', sessionId)
        .eq('metadata->>turnId', turnId)
        .eq('role', 'assistant')
        .limit(1)
      if (existing && existing.length > 0) {
        dedupeReason = 'turnId already persisted (client saved)'
      } else {
        const origen = payload.origen && (payload.origen.tipo === 'espontanea' || payload.origen.tipo === 'despertador') ? payload.origen : null
        const assistantMeta: Record<string, unknown> = { turnId, ...(startedAt ? { startedAt } : {}), ...(origen ? { origen } : {}) }
        if (fileAttachments?.length) assistantMeta.fileAttachments = fileAttachments
        if (usage) assistantMeta.usage = usage
        if (downgrade) assistantMeta.downgrade = downgrade
        if (toolSummaries?.length) assistantMeta.toolSummaries = toolSummaries
        if (suggestions?.length) assistantMeta.suggestions = suggestions
        // Inserts POR FILA: el guardado eager del cliente persiste la fila del
        // user al ENVIAR, así que aquí el 23505 en esa fila es lo normal. Con el
        // batch viejo ese conflicto abortaba el statement entero y el assistant
        // se perdía. Cada fila se dedupea sola contra el índice único.
        const rows = [
          // La fila del user se guarda AHORA pero el mensaje se escribió al INICIO del turno: su created_at es ese
          // instante (la del assistant se queda en el final real: el trigger del semáforo usa created_at del
          // último mensaje y no puede ir hacia atrás).
          // Respuesta espontánea: Daniel no escribió nada, no hay fila suya que inventar.
          ...(origen?.tipo === 'espontanea' ? [] : [{ session_id: sessionId, role: 'user', content: userMessage, audio_url: audioUrl ?? null, image_url: imageUrl ?? null, metadata: { turnId, ...(startedAt ? { startedAt } : {}), ...(origen ? { origen } : {}) } as Record<string, unknown>, ...(startedAt ? { created_at: new Date(startedAt).toISOString() } : {}) }]),
          { session_id: sessionId, role: 'assistant', content: finalContent, audio_url: assistantAudioUrl ?? null, image_url: null, metadata: assistantMeta },
        ]
        let insertedCount = 0
        for (const row of rows) {
          const { error: insertError } = await supabase.from('chat_messages').insert(row)
          if (insertError?.code === '23505') continue
          if (insertError?.code === '23503') {
            // The conversation was deleted after the turn ran: nothing to attach
            // the result to. 410 tells the daemon's outbox to stop retrying.
            console.warn('[chat/complete] conversation gone', { turnId, sessionId })
            return NextResponse.json({ error: 'La conversación ya no existe.', code: 'SESSION_GONE' }, { status: 410 })
          }
          if (insertError) {
            console.error('[chat/complete] insert failed', { turnId, role: row.role, error: insertError.message })
            return NextResponse.json({ error: insertError.message }, { status: 500 })
          }
          insertedCount++
        }
        if (insertedCount > 0) saved = true
        else dedupeReason = 'unique index won race (client saved concurrently)'
      }
      // Fuera del else: aunque el cliente ya haya guardado la respuesta, las inyecciones solo las guarda el host.
      for (const row of filasInyectadas(payload.injectedMessages, sessionId!, turnId)) {
        const { error: insertError } = await supabase.from('chat_messages').insert(row)
        if (!insertError) { saved = true; continue }
        if (insertError.code === '23505') continue
        if (insertError.code === '23503') return NextResponse.json({ error: 'La conversación ya no existe.', code: 'SESSION_GONE' }, { status: 410 })
        console.error('[chat/complete] injected insert failed', { turnId, injected: row.metadata.turnId, error: insertError.message })
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    } else {
      // Legacy: dedupe por contenido contra la cola de la sesión (daemon viejo
      // sin turnId — solo durante el skew de deploy).
      const { data: tail } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(4)
      const alreadySaved = (tail ?? []).some((m) => m.role === 'user' && m.content === userMessage)
      if (alreadySaved) {
        dedupeReason = 'legacy tail dedupe'
      } else {
        await supabase.from('chat_messages').insert([
          { session_id: sessionId, role: 'user', content: userMessage, audio_url: audioUrl ?? null, image_url: imageUrl ?? null },
          { session_id: sessionId, role: 'assistant', content: finalContent, audio_url: assistantAudioUrl ?? null, ...(fileAttachments && fileAttachments.length > 0 ? { metadata: { fileAttachments } } : {}) },
        ])
        saved = true
      }
    }

    // The durable host snapshot is authoritative even when the old client saved first.
    // Merge extra metadata rather than losing artifacts/status in the insert race.
    if (turnId && payload.runtimeSnapshot) {
      const { data: rows, error: readError } = await supabase.from('chat_messages').select('id, metadata')
        .eq('session_id', sessionId).eq('metadata->>turnId', turnId).eq('role', 'assistant').limit(1)
      if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
      const row = rows?.[0]
      if (!row) return NextResponse.json({ error: 'Authoritative result not persisted' }, { status: 500 })
      const metadata = { ...(row.metadata ?? {}), turnId, ...(startedAt ? { startedAt } : {}), terminalStatus: payload.terminalStatus, error: payload.error,
        runtimeSnapshot: payload.runtimeSnapshot, ...(usage ? { usage } : {}),
        ...(fileAttachments ? { fileAttachments } : {}), ...(toolSummaries ? { toolSummaries } : {}), ...(suggestions ? { suggestions } : {}) }
      const { error: updateError } = await supabase.from('chat_messages').update({ content: finalContent, metadata }).eq('id', row.id).eq('session_id', sessionId)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      saved = true
    }

    if (saved) {
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    }
  }

  // ── Push ──
  // Nuevo: móvil + sin ACK (nadie viendo el chat) → push.
  // Legacy: móvil + desconexión detectada (nunca disparaba en iOS, se conserva
  // idéntico para daemon viejo).
  // Kill switch: DISABLE_CHAT_PUSH=true silencia todo push del chat.
  const shouldNotify =
    source === 'mobile' &&
    (turnId ? clientAcked !== true : clientWasConnected === false) &&
    process.env.DISABLE_CHAT_PUSH !== 'true'
  ensureVapid()
  const pushResults: PushResult[] = []
  if (shouldNotify && vapidReady) {
    const targetIds: string[] = []
    const duenoDelTurno = perfilDelTurno(payload.ownerId)
    if (duenoDelTurno) targetIds.push(duenoDelTurno)

    // Look up session owner if we have a session (las sdk: no existen en BD —
    // el .eq sobre columna uuid con "sdk:..." falla; van directo al fallback owner)
    if (targetIds.length === 0 && sessionId && !isSdkSession) {
      const { data: sessionRow } = await supabase
        .from('chat_sessions')
        .select('profile_id')
        .eq('id', sessionId)
        .single()
      if (sessionRow?.profile_id) targetIds.push(sessionRow.profile_id)
    }

    // Fallback to owner if no session or session has no profile_id
    if (targetIds.length === 0) {
      targetIds.push(...await buzonDelDueno(supabase))
    }

    let subsQuery = supabase.from('push_subscriptions').select('*')
    if (targetIds.length > 0) subsQuery = subsQuery.in('user_id', targetIds)
    const { data: subs } = await subsQuery
    if (subs && subs.length > 0) {
      // Deep link directly to the conversation. Tag per-session so concurrent
      // chats don't collapse into a single notification, but multiple responses
      // in the same session DO replace each other (no spam).
      const deepLinkUrl = sessionId ? `/chat?session=${sessionId}` : '/chat'
      const tag = sessionId ? `levy-response-${sessionId}` : 'levy-response'
      const preview = assistantMessage.replace(/\s+/g, ' ').trim().slice(0, 120)
      const payloadStr = JSON.stringify({
        title: 'Levy',
        body: preview || 'Tu respuesta esta lista',
        url: deepLinkUrl,
        tag,
        icon: '/icon-192.png',
      })
      const invalidEndpoints: string[] = []
      await Promise.allSettled(
        subs.map(async (sub) => {
          const host = (() => { try { return new URL(sub.endpoint).host } catch { return 'invalid-endpoint' } })()
          try {
            // TTL alto: si el teléfono está sin red, APNs retiene y entrega al
            // reconectar. Urgency high: iOS lo despierta aunque esté en low power.
            const res = await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payloadStr,
              { TTL: 3600, urgency: 'high' },
            )
            pushResults.push({ host, statusCode: res.statusCode })
          } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode
            pushResults.push({ host, statusCode: status, error: String((err as Error).message ?? err).slice(0, 200) })
            if (status && status >= 400 && status < 500) {
              invalidEndpoints.push(sub.endpoint)
            }
          }
        }),
      )
      if (invalidEndpoints.length > 0) {
        await supabase.from('push_subscriptions').delete().in('endpoint', invalidEndpoints)
      }
    } else {
      pushResults.push({ host: 'none', error: 'no push_subscriptions for target user' })
    }
  }

  // Observabilidad: una línea por webhook con la decisión completa. Visible en
  // Vercel logs Y devuelta al daemon (que la loggea en /tmp/claudeclaw.out) —
  // "no sé si me llegó" se responde con esta evidencia, no adivinando.
  const summary = {
    ok: true,
    sessionId,
    turnId: turnId ?? null,
    protocol: turnId ? 'ack' : 'legacy',
    clientAcked: clientAcked ?? null,
    saved,
    dedupeReason,
    pushed: shouldNotify && vapidReady,
    pushResults,
  }
  console.log('[chat/complete]', JSON.stringify(summary))
  return NextResponse.json(summary)
}
