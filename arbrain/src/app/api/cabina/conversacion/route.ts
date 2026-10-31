import { createServiceClient } from '@/lib/supabase/service'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { sameSecret } from '@/lib/desktop-auth'
import { cuerpoPrimerMensaje, esLaMisma, filaConversacion, leerPedido } from '@/features/cabina/conversacion-nueva'

// Conversación nueva que abre Levy (31 oct 2026): la pide la herramienta `conversacion` de la Cabina y la manda aquí el
// agent-server (server/src/cabina/conversaciones.ts), servidor a servidor con su token, como /api/chat/complete. Crea la fila
// fijada del dueño de la conversación de origen y entrega el primer mensaje al daemon por /chat/stream, el camino de uno
// escrito en la app. Idempotente por id y turnId: el agent-server reintenta sin duplicar.

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const esperado = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!token || !esperado || !sameSecret(token, esperado)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const pedido = leerPedido(await request.json().catch(() => null))
  if ('error' in pedido) return Response.json({ error: pedido.error }, { status: 400 })
  let account: string
  try { account = accountId(pedido.account) } catch (error) { return Response.json({ error: error instanceof ChatAccessError ? error.message : 'Cuenta inválida.' }, { status: 400 }) }

  const service = createServiceClient()
  const { data, error } = await service.from('chat_sessions').insert(filaConversacion(pedido, account)).select('*').single()
  let session = data
  if (error || !data) {
    if (error?.code !== '23505') return Response.json({ error: error?.message ?? 'No se pudo crear la conversación.' }, { status: 500 })
    // Reintento del agent-server: la fila ya existe; vale solo si es la misma conversación.
    const existente = await service.from('chat_sessions').select('*').eq('id', pedido.id).maybeSingle()
    if (existente.error || !existente.data) return Response.json({ error: existente.error?.message ?? 'No se pudo leer la conversación.' }, { status: 500 })
    if (!esLaMisma(existente.data, pedido, account)) return Response.json({ error: 'Ese id ya es de otra conversación.' }, { status: 409 })
    session = existente.data
  }

  try {
    const r = await fetch(`${await getClaudeclawUrl()}/chat/stream`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoPrimerMensaje(pedido, account)), signal: AbortSignal.timeout(20_000),
    })
    const out = await r.json().catch(() => ({})) as { accepted?: boolean; turnId?: string; error?: string }
    if (!r.ok || !out.accepted) return Response.json({ error: `la conversación existe pero el servidor no aceptó su primer mensaje: ${out.error ?? r.status}` }, { status: 502 })
    return Response.json({ session, turnId: out.turnId })
  } catch (e) {
    return Response.json({ error: `la conversación existe pero el servidor no respondió al primer mensaje (${e instanceof Error ? e.message : 'sin respuesta'})` }, { status: 502 })
  }
}
