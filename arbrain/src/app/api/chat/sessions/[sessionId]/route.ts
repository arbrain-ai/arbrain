import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { createServiceClient } from '@/lib/supabase/service'
import { respuestaServicioCaido } from '@/lib/infra-errores'

// GET /api/chat/sessions/[sessionId]?with=messages&limit=60
//
// UN solo round-trip para el cold open por deep-link (push → ?session=): devuelve
// la sesion + su ULTIMA pagina de mensajes juntas. Antes el cliente bajaba la
// lista completa de 30 sesiones solo para resolver un UUID que YA venia en la
// URL, y recien despues pedia los mensajes — cadena serial de 2 round-trips en
// el critical path del tap de la notificacion. El service worker tambien
// prefetchea ESTA URL al recibir el push (sw.js), asi que al tocar la
// notificacion la respuesta puede estar ya en el dispositivo.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params
  try {
    const principal = await requireChatPrincipal()
    await resolveChatConversation(principal, sessionId)
  } catch (error) { return chatAccessResponse(error) }
  const { searchParams } = new URL(request.url)
  const withMessages = searchParams.get('with') === 'messages'

  const service = createServiceClient()

  const sessionQuery = service
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!withMessages) {
    const { data: session, error } = await sessionQuery
    // Base caída ≠ conversación inexistente (12 oct 2026).
    if (error && error.code !== 'PGRST116') return respuestaServicioCaido()
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 })
    return Response.json({ session })
  }

  const limit = Math.min(Number(searchParams.get('limit')) || 60, 200)

  // Mismo orden determinista que /messages: DESC + reverse, con desempate por
  // role/id para turnos insertados en batch (comparten created_at).
  const messagesQuery = service
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .order('role', { ascending: true })
    .order('id', { ascending: false })
    .limit(limit)

  const [sessionRes, messagesRes] = await Promise.all([sessionQuery, messagesQuery])

  if (sessionRes.error && sessionRes.error.code !== 'PGRST116') return respuestaServicioCaido()
  if (!sessionRes.data) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }
  if (messagesRes.error) return respuestaServicioCaido()

  const page = (messagesRes.data ?? []).reverse() // cliente espera orden cronologico
  return Response.json({
    session: sessionRes.data,
    messages: page,
    hasMore: (messagesRes.data ?? []).length === limit,
  })
}
