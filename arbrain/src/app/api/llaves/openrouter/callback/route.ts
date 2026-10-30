import { esEdicionCliente } from '@/lib/edicion'
import { CABECERAS_CALLBACK, flujoOpenRouter, paginaCallback } from '@/features/primer-arranque/lib/openrouter-pkce'

// Regreso de OpenRouter al navegador del sistema (no trae la cookie de la app: el proxy la deja pasar sin sesión).
// Solo hace algo con un `state` vigente de un solo uso que nació en `iniciar`; canjea el código desde este servidor y
// responde una página que NO lleva la llave («Listo, vuelve a Arbrain»). La ventana de la app la recoge en `estado`.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!esEdicionCliente()) return Response.json({ error: 'No disponible en esta edición.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const q = new URL(request.url).searchParams
  const r = await flujoOpenRouter().callback({ code: q.get('code'), state: q.get('state'), error: q.get('error') })
  return new Response(paginaCallback(r), { status: r.ok ? 200 : 400, headers: CABECERAS_CALLBACK })
}
