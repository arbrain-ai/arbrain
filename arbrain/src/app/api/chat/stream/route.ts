import { requireChatPrincipal, resolveChatConversation, chatAccessResponse, requireExpectedChatOwner } from '@/lib/chat-access'
import { fetchConPlazoDeCabeceras, PLAZO_STREAM_MS } from '@/lib/daemon-fetch'
import { hiloDeSesion } from '@/shared/constants/rutinas-hilos'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { createServiceClient } from '@/lib/supabase/service'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'
import { capital, NOMBRE_DUENO } from '@/config'
import { msjMotorCaido } from '@/lib/infra-errores'

// Turnos largos de Levy (deep work multi-minuto): sin esto, la función muere en
// el límite default de Vercel y corta el stream aunque la app siga abierta.
// Mismo techo que /api/cerebro/synthesize. ClaudeClaw capea a 600s server-side;
// si esta función muere antes, el turno igual se recupera vía /api/chat/complete
// + push + reconciliación al foreground.
export const maxDuration = 300

export async function POST(request: Request) {
  let principal
  try { principal = await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const message = body['message']
  if (typeof message !== 'string' || !message.trim()) {
    return new Response(JSON.stringify({ error: 'message required' }), { status: 400 })
  }

  // Opción B (thread de automatizaciones conversable): si la sesión contiene
  // mensajes de cron (briefings/councils/reflexión), inyectamos las inteligencias
  // recientes como CONTEXTO de este reply. Así conversas con continuidad —
  // "sobre el lead crítico del briefing, ¿qué hago?" y el agente sabe de qué
  // hablas — sin anclar los crons a una sesión SDK pesada que se infla cada día.
  // Los crons siguen efímeros; la thread es la memoria y aquí pasamos la rebanada.
  let chatSessionId = typeof body['chatSessionId'] === 'string' ? body['chatSessionId'] : undefined
  let scope
  try {
    requireExpectedChatOwner(principal, body.expectedOwnerId)
    if (chatSessionId && !chatSessionId.startsWith('sdk:')) {
      scope = await resolveChatConversation(principal, chatSessionId, body['account'])
    } else {
      // Native-only conversations still require host-side binding; keep their
      // explicit routing separate from persisted MC conversations during migration.
      if (chatSessionId ? !principal.personalOwner : !principal.owner) throw new ChatAccessError('Las sesiones nativas requieren acceso del propietario.', 403)
      scope = { owner: principal.id, account: accountId(body['account']), conversationId: chatSessionId }
    }
  } catch (error) { return chatAccessResponse(error) }
  chatSessionId = scope.conversationId
  // Resolve the host only after authorization; overlap with permitted history work.
  const urlPromise = getClaudeclawUrl()
  let contextParam = typeof body['context'] === 'string' ? body['context'] : undefined
  if (chatSessionId && !chatSessionId.startsWith('sdk:')) {
    // Leer la thread con el SERVICE client (no el autenticado): en la app de
    // escritorio el usuario es el sintetico local y RLS le bloquea leer los
    // mensajes del owner. Ya autorizamos al requester (owner/admin) arriba.
    const service = createServiceClient()
    const { data: recent } = await service
      .from('chat_messages')
      .select('content, metadata, created_at')
      .eq('session_id', chatSessionId)
      .order('created_at', { ascending: false })
      .limit(10)
    const crons = (recent ?? []).filter(
      (m) => (m.metadata as { source?: string } | null)?.source === 'cron',
    )
    // Un slash command («/compact», «/skill args») debe llegar al CLI empezando con «/» (19 oct 2026):
    // no se le arma contexto de crons. El daemon (chat-job.ts) lo garantiza igual; esto solo ahorra trabajo.
    const esComando = typeof message === 'string' && /^\/[\w:-]+(\s|$)/.test(message.trim())
    if (crons.length > 0 && !esComando) {
      const parts = crons.slice(0, 5).reverse().map((m) => {
        const md = m.metadata as { jobLabel?: string; jobId?: string } | null
        const label = md?.jobLabel ?? md?.jobId ?? 'Automatización'
        const text = (m.content ?? '').slice(0, 1500)
        return `## ${label} (${(m.created_at ?? '').slice(0, 16)})\n${text}`
      })
      // El reporte de la mañana entra a la conversación favorita de Daniel (10 oct 2026): ahí no es una thread de crons.
      const titulo = hiloDeSesion(chatSessionId)?.titulo
      const threadContext =
        `${titulo ? `Estás en la thread "${titulo}". Estas son las inteligencias recientes` : 'En esta conversación hay mensajes recientes'} ` +
        `que te llegaron por cron (briefings, councils, reflexión, investigaciones). Úsalas para responder ` +
        `con continuidad sobre lo que ${NOMBRE_DUENO()} pregunte:\n\n${parts.join('\n\n')}`
      contextParam = contextParam ? `${threadContext}\n\n${contextParam}` : threadContext
    }

    // Cierre del día: si el mensaje MÁS reciente de la thread es el cron
    // evening-reflection (o sea, este mensaje de Daniel es su respuesta directa a
    // la pregunta "¿tu objetivo #1 de mañana?"), lo registramos en
    // sistema_reflexion (respuesta_am de hoy). Determinista, sin depender del
    // agente: solo la PRIMERA respuesta tras el prompt de la noche entra (después
    // el mensaje más reciente ya no es el cron). El agente igual responde normal.
    const mostRecent = recent?.[0]
    const isEveningReply =
      (mostRecent?.metadata as { source?: string; jobId?: string } | null)?.source === 'cron' &&
      (mostRecent?.metadata as { jobId?: string } | null)?.jobId === 'evening-reflection'
    if (isEveningReply) {
      try {
        const { data: hab } = await service.from('sistema_habitos').select('user_id').limit(1).maybeSingle()
        const uid = hab?.user_id
        if (uid) {
          const fecha = new Date().toISOString().slice(0, 10)
          await service.from('sistema_reflexion').upsert(
            { user_id: uid, fecha, respuesta_am: message.trim(), updated_at: new Date().toISOString() },
            { onConflict: 'user_id,fecha' },
          )
          const ackHint =
            `NOTA: ${capital(NOMBRE_DUENO())} acaba de responder su objetivo #1 de mañana ("${message.trim().slice(0, 200)}"). ` +
            `YA quedó registrado en su reflexión del día — confírmaselo en UNA línea corta, con energía, sin repetir todo el objetivo.`
          contextParam = contextParam ? `${contextParam}\n\n${ackHint}` : ackHint
        }
      } catch {
        // no bloquear el chat si falla el registro
      }
    }
  }

  try {
    const CLAUDECLAW_URL = await urlPromise
    // Plazo hasta las cabeceras (7 oct 2026): el turno puede transmitir lo que dure, pero la conexión no puede
    // quedar colgada sin respuesta ocupando una de las 6 de WebKit.
    const upstream = await fetchConPlazoDeCabeceras(`${CLAUDECLAW_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CLAUDECLAW_TOKEN}`,
      },
      body: JSON.stringify({
        message: message.trim(),
        liveWorkspace: principal.personalOwner && body.liveWorkspace === true,
        ownerId: scope.owner,
        account: scope.account,
        verifiedConversation: !!chatSessionId && !chatSessionId.startsWith('sdk:'),
        verifiedNativeOwner: !!chatSessionId?.startsWith('sdk:') && principal.personalOwner,
        clientContext: typeof body.context === 'string' ? body.context : null,
        ...(body.intent !== undefined ? { intent: body.intent } : {}),
        ...(body.acceptOnly === true ? { acceptOnly: true } : {}),
        // Inyección a mitad de turno (7 oct 2026): con un turno vivo, el daemon lo pliega en él y responde 202 JSON.
        ...(body.inyectar === true ? { inyectar: true, acceptOnly: true } : {}),
        ...(typeof body['source'] === 'string' && { source: body['source'] }),
        ...(typeof body['turnId'] === 'string' && { turnId: body['turnId'] }),
        ...(typeof body['effort'] === 'string' && { effort: body['effort'] }),
        ...(chatSessionId && { chatSessionId }),
        ...(chatSessionId?.startsWith('sdk:') && { sdkSessionId: chatSessionId.slice(4) }),
        // Edición de un mensaje pasado: rebobina el contexto del SDK (fork). Match
        // por contenido (texto original) + ocurrencia desde el final (duplicados).
        ...(typeof body['editOriginalText'] === 'string' && { editOriginalText: body['editOriginalText'] }),
        ...(typeof body['editTurnId'] === 'string' && { editTurnId: body['editTurnId'] }),
        ...(typeof body['editOccurrenceFromEnd'] === 'number' && { editOccurrenceFromEnd: body['editOccurrenceFromEnd'] }),
        // TEMPORAL (2026-07-08): cuenta que factura el turno ('bro' = segunda
        // cuenta de Claude). El daemon la mapea a CLAUDE_CONFIG_DIR. Ver memoria bro-claude.
        // 'codex' (4 sep 2026) → motor Codex CLI (OpenAI, cuenta principal).
        // 'yt' (6 sep 2026) → mismo Codex CLI con la segunda cuenta de OpenAI (su CODEX_HOME).
        ...(typeof body['audioUrl'] === 'string' && { audioUrl: body['audioUrl'] }),
        ...(typeof body['imageUrl'] === 'string' && { imageUrl: body['imageUrl'] }),
        ...(contextParam && { context: contextParam }),
      }),
      signal: request.signal,
    }, PLAZO_STREAM_MS)

    if (!upstream.ok || !upstream.body) {
      // SIEMPRE JSON: si el tunel murio, ngrok contesta HTML y el cliente
      // terminaba mostrando "Error desconocido" (incidente 2 sep 2026).
      return upstreamError(upstream, 'el chat')
    }

    if (body.acceptOnly === true || body.inyectar === true) return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' } })
    // Proxy the SSE stream from ClaudeClaw to the browser
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // Browser disconnected — expected for background processing
      return new Response(null, { status: 499 })
    }
    if (err instanceof Error && err.name === 'TimeoutError') {
      return new Response(JSON.stringify({ error: 'Agent timeout' }), { status: 504 })
    }
    return Response.json(
      { error: msjMotorCaido(), code: 'DAEMON_UNREACHABLE', reintentable: true },
      { status: 503 },
    )
  }
}
