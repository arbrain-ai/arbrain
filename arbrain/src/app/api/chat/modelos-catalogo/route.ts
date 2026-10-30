import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

/** Catálogo del selector de modelos (Configuración → Modelos, 2 oct 2026): qué modelos existen, verificados contra
 *  Claude y OpenRouter, su precio por millón y cuáles están encendidos. Vive en el daemon: igual en todos los aparatos. */
async function exigirDueno(): Promise<void> {
  const principal = await requireChatPrincipal()
  if (!principal.owner) throw new ChatAccessError('Se requiere una conversación propia.', 403)
}

const SIN_DAEMON = { error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' }

export async function GET() {
  try { await exigirDueno() } catch (error) { return chatAccessResponse(error) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/modelos/catalogo`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'el catálogo de modelos')
    return Response.json(await upstream.json())
  } catch {
    return Response.json(SIN_DAEMON, { status: 503 })
  }
}

/** Body: { id: string, habilitado: boolean }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { id?: unknown; habilitado?: unknown } | null
  if (!body || typeof body.id !== 'string' || typeof body.habilitado !== 'boolean') return Response.json({ error: 'Falta el modelo o el interruptor.' }, { status: 400 })
  try { await exigirDueno() } catch (error) { return chatAccessResponse(error) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/modelos/catalogo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: body.id, habilitado: body.habilitado }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'guardar el catálogo de modelos')
    return Response.json(await upstream.json())
  } catch {
    return Response.json(SIN_DAEMON, { status: 503 })
  }
}
