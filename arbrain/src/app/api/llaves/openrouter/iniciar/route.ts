import { NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { flujoOpenRouter } from '@/features/primer-arranque/lib/openrouter-pkce'

// «Conectar con OpenRouter» (v1.1): nace un intento PKCE y sale la URL que la app abre en el navegador del sistema.
// El `code_verifier` se queda en la memoria de este servidor; la URL solo lleva el desafío y el `state`.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Puerto de ESTE servidor (la app lo fija en `PORT`); en desarrollo, el de la petición. */
function puertoPropio(request: Request): number {
  const env = Number((process.env.PORT ?? '').trim())
  if (Number.isInteger(env) && env > 0) return env
  const u = new URL(request.url)
  return Number(u.port || (u.protocol === 'https:' ? 443 : 80))
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  try {
    const { url, state, expira } = flujoOpenRouter().iniciar(puertoPropio(request))
    return Response.json({ url, state, expira }, { headers: NOCACHE })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No pude preparar la conexión.' }, { status: 500, headers: NOCACHE })
  }
}
