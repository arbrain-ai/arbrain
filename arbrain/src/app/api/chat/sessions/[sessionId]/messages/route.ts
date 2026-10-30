import { after } from 'next/server'
import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { createServiceClient } from '@/lib/supabase/service'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { isNonDefaultAccount } from '@/features/chat/stores/account-store'

async function requireChatUser() {
  try { return { principal: await requireChatPrincipal(), error: null } }
  catch (error) { return { principal: null, error: chatAccessResponse(error) } }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  // En paralelo con la auth: la URL del daemon no depende de ella.
  const claudeclawUrl = getClaudeclawUrl()
  const auth = await requireChatUser()
  if (auth.error) return auth.error

  const { sessionId } = await params
  const { searchParams } = new URL(request.url)

  if (searchParams.get('source') === 'mc') {
    try { await resolveChatConversation(auth.principal!, sessionId) } catch (error) { return chatAccessResponse(error) }
    const service = createServiceClient()

    // Paginación por cursor (keyset): con `limit` traemos solo la ÚLTIMA página
    // (los N más recientes) y `before` pagina hacia atrás. La sesión
    // "Automatizaciones" acumula cientos de mensajes (~1.3MB) — bajar todo el
    // historial en cada apertura era el cuello del chat. Sin `limit` se
    // conserva el comportamiento viejo (historial completo ascendente).
    const limitParam = Number(searchParams.get('limit'))
    const before = searchParams.get('before')

    if (Number.isFinite(limitParam) && limitParam > 0) {
      const limit = Math.min(limitParam, 200)
      let query = service
        .from('chat_messages')
        .select('*')
        // El user y el assistant de un mismo turno se insertan en batch → comparten
        // created_at al microsegundo. Sin desempate determinista el orden dentro del
        // turno lo decidía el UUID (aleatorio) y al RECARGAR salía assistant-antes-que-
        // user (~la mitad de los turnos). Fetch en DESC + reverse: role ASC aquí ⇒ tras
        // el reverse queda user antes que assistant en el mismo timestamp.
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .order('role', { ascending: true })
        .order('id', { ascending: false })
        .limit(limit)
      if (before) query = query.lt('created_at', before)

      const { data, error } = await query
      if (error) return Response.json({ error: error.message }, { status: 500 })
      const page = (data ?? []).reverse() // cliente espera orden cronológico
      return Response.json({ messages: page, hasMore: (data ?? []).length === limit })
    }

    const { data, error } = await service
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      // Mismo desempate determinista que el path paginado: user antes que assistant
      // cuando comparten created_at (turno insertado en batch).
      .order('created_at', { ascending: true })
      .order('role', { ascending: false })
      .order('id', { ascending: true })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ messages: data ?? [] })
  }

  if (!auth.principal!.personalOwner) return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    // TEMPORAL: leer el transcript del pool de la cuenta correcta ('bro' → su carpeta de configuración).
    const accountParam = searchParams.get('account')
    const accountQs = isNonDefaultAccount(accountParam) ? `?account=${accountParam}` : ''
    const res = await fetch(`${await claudeclawUrl}/sessions/${sessionId}/messages${accountQs}`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
    })
    if (!res.ok) throw new Error(`ClaudeClaw ${res.status}`)
    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json({ error: 'ClaudeClaw unreachable' }, { status: 503 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireChatUser()
  if (auth.error) return auth.error

  const { sessionId } = await params
  try { await resolveChatConversation(auth.principal!, sessionId) } catch (error) { return chatAccessResponse(error) }
  const body = await request.json().catch(() => ({})) as {
    messages?: Array<{
      role: 'user' | 'assistant'
      content: string
      audioUrl?: string | null
      imageUrl?: string | null
      metadata?: Record<string, unknown> | null
    }>
  }
  const messages = body.messages ?? []
  if (!messages.length) return Response.json({ error: 'messages required' }, { status: 400 })

  const service = createServiceClient()
  // Inserts POR FILA, no en batch: un 23505 (unique_violation contra
  // chat_messages_turnid_role_uniq) en UNA fila abortaba el statement completo
  // y tiraba las demás. Con el guardado eager del user al enviar (18 jul), la
  // fila del user casi siempre ya existe cuando llega el guardado rico del
  // turno — el batch habría descartado el assistant. Por fila, cada mensaje se
  // persiste exactamente una vez, gane quien gane la carrera (eager / cliente /
  // webhook del daemon).
  let inserted = 0
  let deduped = 0
  for (const message of messages) {
    const { error } = await service.from('chat_messages').insert({
      session_id: sessionId,
      role: message.role,
      content: message.content,
      audio_url: message.audioUrl ?? null,
      image_url: message.imageUrl ?? null,
      ...(message.metadata ? { metadata: message.metadata } : {}),
    })
    if (error?.code === '23505') { deduped++; continue }
    if (error) return Response.json({ error: error.message }, { status: 500 })
    inserted++
  }
  if (inserted === 0) {
    return Response.json({ ok: true, deduped: true })
  }

  // Bookkeeping fuera del critical path: el touch de updated_at no debe
  // bloquear el `ok` al cliente. `after()` garantiza que corre tras responder.
  after(async () => {
    await service
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .then(() => undefined)
  })

  return Response.json({ ok: true })
}

// Limpieza del turno por identidad (?turnId=): la usa el rollback total con ESC
// para retirar la fila del user que el guardado eager ya persistió al enviar.
// Borra TODAS las filas del turno en la sesión (si el webhook alcanzó a guardar
// el par completo, ESC significa "este turno no existió" — se van ambas).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireChatUser()
  if (auth.error) return auth.error

  const { sessionId } = await params
  try { await resolveChatConversation(auth.principal!, sessionId) } catch (error) { return chatAccessResponse(error) }
  const turnId = new URL(request.url).searchParams.get('turnId')
  if (!turnId) return Response.json({ error: 'turnId required' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('chat_messages')
    .delete()
    .eq('session_id', sessionId)
    .eq('metadata->>turnId', turnId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
