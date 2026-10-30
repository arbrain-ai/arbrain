import { NOCACHE, soloAppCliente, tokenDaemon } from '@/lib/daemon-local'
import { esModoServidor, urlControl } from '@/lib/modo-servidor'
import { llegaPorTelefono } from '@/features/telefono/host-telefono'

// Ajustes › Tu cerebro en el teléfono (23 oct 2026; scripts/servidor/telefono.mjs). Reenvía al control del supervisor:
//   GET                     estado (Tailscale, publicación, dirección)
//   POST {accion}           encender | apagar | codigo (código de un solo uso para entrar desde el teléfono)
// Exige la sesión de la web y, al cambiar algo, origen propio. Fuera del modo servidor: 404.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACCIONES = new Set(['encender', 'apagar', 'codigo'])

async function alControl(ruta: string, metodo: 'GET' | 'POST', plazo: number) {
  const control = urlControl()
  const token = tokenDaemon()
  if (!control || !token) return Response.json({ error: 'El servidor de Arbrain no le pasó a la web su control. Reinícialo con `npm run servidor`.' }, { status: 503, headers: NOCACHE })
  try {
    const r = await fetch(`${control}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: metodo === 'POST' ? '{}' : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(plazo),
    })
    // Un supervisor anterior a esta versión no conoce /telefono: 404 con su error genérico.
    if (r.status === 404) return Response.json({ estado: 'servidor-viejo', error: 'Tu Arbrain corre una versión sin esta función. Actualízalo y reinícialo.' }, { status: 200, headers: NOCACHE })
    const j = await r.json().catch(() => ({ error: 'Respuesta ilegible del servidor de Arbrain.' }))
    return Response.json(j, { status: r.status, headers: NOCACHE })
  } catch {
    return Response.json({ error: 'No pude hablar con el servidor de Arbrain. ¿Sigue corriendo?' }, { status: 503, headers: NOCACHE })
  }
}

export async function GET(request: Request) {
  if (!esModoServidor()) return Response.json({ estado: 'sin-modo-servidor' }, { status: 200, headers: NOCACHE })
  const no = await soloAppCliente(request)
  if (no) return no
  const r = await alControl('/telefono/estado', 'GET', 15_000)
  if (!r.ok) return r
  const j = await r.json() as Record<string, unknown>
  return Response.json({ ...j, desdeTelefono: llegaPorTelefono(request.headers.get('host'), request.headers.get('x-forwarded-proto')) }, { headers: NOCACHE })
}

export async function POST(request: Request) {
  if (!esModoServidor()) return Response.json({ error: 'No disponible en esta edición.' }, { status: 404, headers: NOCACHE })
  const no = await soloAppCliente(request, true)
  if (no) return no
  const j = await request.json().catch(() => ({})) as { accion?: unknown }
  const accion = typeof j.accion === 'string' && ACCIONES.has(j.accion) ? j.accion : null
  if (!accion) return Response.json({ error: 'Acción no permitida.' }, { status: 400, headers: NOCACHE })
  return alControl(`/telefono/${accion}`, 'POST', 90_000)
}
