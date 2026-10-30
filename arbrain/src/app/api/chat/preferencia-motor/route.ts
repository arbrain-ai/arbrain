import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

/** Motor, modelo y esfuerzo de las conversaciones nuevas (Configuración → Modelo, 2 oct 2026). Vive en el
 *  daemon para que web, escritorio y teléfono vean lo mismo; el daemon valida contra el catálogo vivo. */
async function exigirDueno(): Promise<void> {
  const principal = await requireChatPrincipal()
  if (!principal.owner) throw new ChatAccessError('Se requiere una conversación propia.', 403)
}

const SIN_DAEMON = { error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' }

export async function GET() {
  try { await exigirDueno() } catch (error) { return chatAccessResponse(error) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/preferencias/motor`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'la preferencia de modelo')
    return Response.json(await upstream.json())
  } catch {
    return Response.json(SIN_DAEMON, { status: 503 })
  }
}

/** Body: { motor: string | null, modelo?: string | null, esfuerzo?: string | null }. motor null = como estaba. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { motor?: unknown; modelo?: unknown; esfuerzo?: unknown } | null
  if (!body || !('motor' in body)) return Response.json({ error: 'Falta el motor.' }, { status: 400 })
  try { await exigirDueno() } catch (error) { return chatAccessResponse(error) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/preferencias/motor`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ motor: body.motor ?? null, modelo: body.modelo ?? null, esfuerzo: body.esfuerzo ?? null }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'guardar la preferencia de modelo')
    return Response.json(await upstream.json())
  } catch {
    return Response.json(SIN_DAEMON, { status: 503 })
  }
}
