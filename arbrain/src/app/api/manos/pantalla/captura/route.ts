import { NOCACHE, soloAppCliente, tokenDaemon } from '@/lib/daemon-local'
import { urlDaemonCliente } from '@/lib/claudeclaw'
import { pantallaVirtualServidor } from '@/features/permisos/lib/pantalla-server'

// Un cuadro (JPEG) de la pantalla virtual del servidor, para la vista `/pantalla` (1 nov 2026). Solo mirar: no hay
// ruta que mande clics ni teclas. Solo con la sesión de la app; sin ella el proxy responde 401 antes de llegar aquí y
// esta ruta lo vuelve a comprobar. 204 = la pantalla está apagada (se enciende cuando Levy la usa). La web escucha solo
// en 127.0.0.1 y al teléfono llega por `tailscale serve` (nunca funnel): ningún puerto nuevo.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const entero = (v: string | null, min: number, max: number, def: number) => {
  const n = Number(v)
  return v && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : def
}

export async function GET(request: Request) {
  const no = await soloAppCliente()
  if (no) return no
  if (!pantallaVirtualServidor()) return Response.json({ error: 'Este Arbrain no tiene pantalla virtual.' }, { status: 404, headers: NOCACHE })
  const token = tokenDaemon()
  if (!token) return Response.json({ error: 'La web no tiene la llave de su daemon.' }, { status: 503, headers: NOCACHE })
  const q = new URL(request.url).searchParams
  const ruta = `/pantalla/captura?calidad=${entero(q.get('calidad'), 25, 85, 55)}&ancho=${entero(q.get('ancho'), 320, 1440, 1080)}`
  try {
    const r = await fetch(`${urlDaemonCliente()}${ruta}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    if (r.status === 204) return new Response(null, { status: 204, headers: NOCACHE })
    if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/jpeg')) {
      const texto = await r.text().catch(() => '')
      return new Response(texto || '{}', { status: r.ok ? 502 : r.status, headers: { 'Content-Type': 'application/json', ...NOCACHE } })
    }
    const cuerpo = await r.arrayBuffer()
    return new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'image/jpeg', ...NOCACHE, 'X-Pantalla-Ancho': r.headers.get('x-pantalla-ancho') ?? '', 'X-Pantalla-Alto': r.headers.get('x-pantalla-alto') ?? '' } })
  } catch {
    return Response.json({ error: 'Tu Arbrain local no responde.', code: 'sin_daemon' }, { status: 502, headers: NOCACHE })
  }
}
