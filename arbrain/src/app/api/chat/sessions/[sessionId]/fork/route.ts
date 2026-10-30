import { randomUUID } from 'node:crypto'
import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { createServiceClient } from '@/lib/supabase/service'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'
import { mensajeParaCopia, patronTitulosParecidos, tituloBifurcada, trozos, type MensajeOrigen } from '@/features/chat/lib/conversacion-bifurcada'

// POST /api/chat/sessions/[sessionId]/fork   body opcional: { forkId }
//
// Bifurcar (1 oct 2026): una conversación NUEVA con todo el historial de la original hasta su último mensaje;
// la original no se toca. Orden a propósito:
//   1. El daemon crea la sesión NATIVA del motor (Claude forkSession / Codex thread/fork) y la liga al id de la
//      copia. Es lo que hace que Levy recuerde el contexto. Va primero: si el daemon no puede, no se crea una
//      copia solo de pantalla que aparente memoria que no tiene.
//   2. Se inserta la fila y se copian los mensajes. Si algo falla aquí se borra la fila (cascada) y el cliente
//      reintenta con el mismo `forkId`: el daemon lo reconoce y no crea otra sesión del motor.
// `forkId` lo manda el cliente para que un reintento (la respuesta se perdió) no deje dos copias.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGINA = 1000
const LOTE = 200
/** Tope de la espera al motor: el fork de Claude lanza un proceso hijo (hasta 60 s en el daemon). */
const ESPERA_DAEMON_MS = 75_000

interface RespuestaFork { engine?: 'claude' | 'codex' | 'none'; reused?: boolean }

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  if (!UUID.test(sessionId)) return Response.json({ error: 'Esta conversación no se puede bifurcar.' }, { status: 400 })

  let principal
  let scope
  try {
    principal = await requireChatPrincipal()
    scope = await resolveChatConversation(principal, sessionId)
  } catch (error) { return chatAccessResponse(error) }

  const body = await request.json().catch(() => ({})) as { forkId?: unknown }
  const forkId = typeof body.forkId === 'string' && UUID.test(body.forkId) ? body.forkId.toLowerCase() : randomUUID()
  if (forkId === sessionId.toLowerCase()) return Response.json({ error: 'La copia no puede tener el mismo id que la original.' }, { status: 400 })

  const service = createServiceClient()
  const { data: origen, error: errorOrigen } = await service.from('chat_sessions').select('*').eq('id', sessionId).maybeSingle()
  if (errorOrigen) return Response.json({ error: errorOrigen.message }, { status: 500 })
  if (!origen) return Response.json({ error: 'Conversación no encontrada.' }, { status: 404 })

  const { count: total, error: errorConteo } = await service.from('chat_messages').select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  if (errorConteo) return Response.json({ error: errorConteo.message }, { status: 500 })
  if (!total) return Response.json({ error: 'Esta conversación aún no tiene mensajes que bifurcar.' }, { status: 400 })

  // Un reintento reutiliza la copia que ya quedó; si no, calcula el título sin chocar con otras bifurcaciones.
  const { data: yaExiste } = await service.from('chat_sessions').select('*').eq('id', forkId).maybeSingle()
  if (yaExiste) {
    try { await resolveChatConversation(principal, forkId, scope.account) } catch (error) { return chatAccessResponse(error) }
  }
  let titulo = yaExiste?.title as string | undefined
  if (!titulo) {
    const { data: parecidos } = await service.from('chat_sessions').select('title').ilike('title', patronTitulosParecidos(origen.title as string)).limit(200)
    titulo = tituloBifurcada(origen.title as string, (parecidos ?? []).map((f) => String(f.title)))
  }

  // 1) Motor.
  let motor: RespuestaFork
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/chat/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      body: JSON.stringify({ ownerId: scope.owner, account: scope.account, sourceId: sessionId, forkId, title: titulo }),
      signal: AbortSignal.timeout(ESPERA_DAEMON_MS),
    })
    if (!upstream.ok) return upstreamError(upstream, 'bifurcar la conversación')
    motor = await upstream.json() as RespuestaFork
  } catch (error) {
    const agotado = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return Response.json({
      error: agotado
        ? 'El motor tardó demasiado en bifurcar la conversación. No se creó nada; intenta de nuevo.'
        : 'No se pudo hablar con el servidor del chat. No se creó la copia; intenta de nuevo en un momento.',
    }, { status: agotado ? 504 : 503 })
  }
  const contextoMotor = motor.engine === 'claude' || motor.engine === 'codex'

  if (yaExiste) return Response.json({ session: yaExiste, engine: motor.engine ?? 'none', contextoMotor, reused: true })

  // 2) Fila + mensajes.
  const { error: errorFila } = await service.from('chat_sessions').insert({
    id: forkId,
    title: titulo,
    profile_id: scope.owner,
    account: origen.account ?? null,
    is_favorite: false,
  })
  if (errorFila) return Response.json({ error: errorFila.message }, { status: 500 })

  try {
    // Mismo orden que lee el chat: por fecha y, en empate, el usuario antes que Levy. Así el trigger de la base
    // deja `last_role` en el último mensaje real y el semáforo de la copia no se desordena.
    for (let desde = 0; desde < total; desde += PAGINA) {
      const { data: pagina, error } = await service
        .from('chat_messages')
        .select('role, content, created_at, audio_url, image_url, metadata')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .order('role', { ascending: false })
        .order('id', { ascending: true })
        .range(desde, desde + PAGINA - 1)
      if (error) throw new Error(error.message)
      if (!pagina?.length) break
      for (const lote of trozos(pagina as MensajeOrigen[], LOTE)) {
        const { error: errorInsert } = await service.from('chat_messages').insert(lote.map((m) => mensajeParaCopia(m, forkId)))
        if (errorInsert) throw new Error(errorInsert.message)
      }
    }
  } catch (error) {
    await service.from('chat_sessions').delete().eq('id', forkId) // cascada: no queda copia a medias
    return Response.json({ error: `No se pudieron copiar los mensajes: ${error instanceof Error ? error.message : 'error desconocido'}` }, { status: 500 })
  }

  // La copia nace «de hoy» (sube a Recientes) y ya vista (gris): quien la crea está mirándola.
  const ahora = new Date().toISOString()
  const { data: copia, error: errorFinal } = await service
    .from('chat_sessions')
    .update({ last_message_at: ahora, updated_at: ahora, last_read_at: ahora })
    .eq('id', forkId)
    .select('*')
    .single()
  if (errorFinal || !copia) {
    await service.from('chat_sessions').delete().eq('id', forkId)
    return Response.json({ error: errorFinal?.message ?? 'No se pudo terminar la copia.' }, { status: 500 })
  }
  return Response.json({ session: copia, engine: motor.engine ?? 'none', contextoMotor, reused: false })
}
