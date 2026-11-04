import { NOCACHE, soloAppCliente, tokenDaemon } from '@/lib/daemon-local'
import { esModoServidor, urlControl } from '@/lib/modo-servidor'
import { llegaPorTelefono } from '@/features/telefono/host-telefono'

// Ajustes › Teléfono y Ajustes › Máquinas sin Tailscale (3 nov 2026; scripts/servidor/conectar.mjs). Reenvía al control
// del supervisor, que habla con el relay con la credencial de esta máquina (la web nunca la ve):
//   GET                      estado (listo desde, dirección privada, teléfonos con sesión)
//   GET ?ver=maquinas        dónde corre tu Levy (las máquinas de tu cuenta)
//   POST {accion}            encender | apagar | qr | cerrar-telefonos | cerrar-telefono {id} | codigo-maquina | unir {codigo} | abrir {handle} | quitar {handle}
// Exige la sesión de la web y, al cambiar algo, origen propio. Fuera del modo servidor: 404.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACCIONES = new Set(['encender', 'apagar', 'qr', 'cerrar-telefonos', 'cerrar-telefono', 'codigo-maquina', 'unir', 'abrir', 'quitar'])

async function alControl(ruta: string, metodo: 'GET' | 'POST', cuerpo: Record<string, string> = {}, plazo = 30_000) {
  const control = urlControl()
  const token = tokenDaemon()
  if (!control || !token) return Response.json({ error: 'El servidor de Arbrain no le pasó a la web su control. Reinícialo con `npm run servidor`.' }, { status: 503, headers: NOCACHE })
  try {
    const r = await fetch(`${control}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(plazo),
    })
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
  const ver = new URL(request.url).searchParams.get('ver')
  if (ver === 'maquinas') return alControl('/conectar/maquinas', 'GET')
  const r = await alControl('/conectar/estado', 'GET', {}, 15_000)
  if (!r.ok) return r
  const j = await r.json() as Record<string, unknown>
  return Response.json({
    ...j,
    desdeTelefono: llegaPorTelefono(request.headers.get('host'), request.headers.get('x-forwarded-proto')),
    porRelay: request.headers.get('x-arbrain-conectar') === '1',
  }, { headers: NOCACHE })
}

export async function POST(request: Request) {
  if (!esModoServidor()) return Response.json({ error: 'No disponible en esta edición.' }, { status: 404, headers: NOCACHE })
  const no = await soloAppCliente(request, true)
  if (no) return no
  const j = await request.json().catch(() => ({})) as Record<string, unknown>
  const accion = typeof j.accion === 'string' && ACCIONES.has(j.accion) ? j.accion : null
  if (!accion) return Response.json({ error: 'Acción no permitida.' }, { status: 400, headers: NOCACHE })
  const texto = (k: string) => (typeof j[k] === 'string' ? (j[k] as string).slice(0, 200) : '')
  const cuerpo: Record<string, string> = {}
  if (accion === 'cerrar-telefono') cuerpo.id = texto('id')
  if (accion === 'unir') cuerpo.codigo = texto('codigo')
  if (accion === 'abrir' || accion === 'quitar') cuerpo.handle = texto('handle')
  return alControl(`/conectar/${accion}`, 'POST', cuerpo)
}
