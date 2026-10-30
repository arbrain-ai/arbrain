import { NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { flujoOpenRouter } from '@/features/primer-arranque/lib/openrouter-pkce'

// «Cancelar» del botón de OpenRouter: el intento muere y un regreso tardío del navegador ya no canjea nada.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { state?: unknown }
  if (typeof body.state === 'string') flujoOpenRouter().cancelar(body.state)
  return Response.json({ ok: true }, { headers: NOCACHE })
}
