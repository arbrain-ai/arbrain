import { NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { flujoOpenRouter } from '@/features/primer-arranque/lib/openrouter-pkce'

// La ventana de la app pregunta por su intento. Con `estado: 'lista'` la llave sale UNA vez (se borra del servidor en
// ese instante) y la app la guarda en el llavero con `llave_guardar`. POST con el `state` en el cuerpo: nada de esto
// viaja en una URL ni queda en caché.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { state?: unknown }
  const state = typeof body.state === 'string' ? body.state : ''
  const r = flujoOpenRouter().recoger(state)
  return Response.json(r, { status: r.estado === 'vencido' ? 404 : 200, headers: { ...NOCACHE, Pragma: 'no-cache' } })
}
