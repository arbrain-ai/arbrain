import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Modo de permisos de Levy (grupal 23 oct 2026; Autónomo con consentimiento, 0.2.15): «Preguntar siempre», «Automático
// en mi carpeta» o «Autónomo». Aflojar lleva el secreto de confirmar (lo pone este servidor, nunca el navegador); volver
// a «preguntar», retirar el consentimiento y «decidir después» no (son más estrictos). Para «autonomo» viaja además la
// aceptación: la versión y la huella del texto que la app recibió en el GET (el daemon las valida contra lo empaquetado).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODOS = new Set(['preguntar', 'carpeta', 'autonomo'])
const VIAS = new Set(['bienvenida', 'ajustes', 'pildora', 'pausa', 'migracion', 'version'])

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/permisos', { plazoMs: 5_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { modo?: unknown; acepto?: unknown; via?: unknown; retirar?: unknown; decidirDespues?: unknown; misDatos?: unknown }
  const via = typeof body.via === 'string' && VIAS.has(body.via) ? body.via : 'ajustes'
  if (body.retirar === true) return alDaemon('/permisos', { method: 'POST', body: JSON.stringify({ retirar: true, via }) })
  if (body.misDatos && typeof body.misDatos === 'object') {
    // A13: su teléfono y su correo («mándame a mí» no frena). Lleva el secreto: un destino propio afloja la R6.
    const d = body.misDatos as Record<string, unknown>
    const misDatos = { telefono: typeof d.telefono === 'string' ? d.telefono.slice(0, 30) : '', correo: typeof d.correo === 'string' ? d.correo.slice(0, 120) : '' }
    return alDaemon('/permisos', { method: 'POST', confirmar: true, body: JSON.stringify({ misDatos }) })
  }
  if (body.decidirDespues === true) return alDaemon('/permisos', { method: 'POST', body: JSON.stringify({ decidirDespues: true }) })
  if (typeof body.modo !== 'string' || !MODOS.has(body.modo)) {
    return Response.json({ error: 'Petición inválida.' }, { status: 400, headers: NOCACHE })
  }
  const a = body.acepto && typeof body.acepto === 'object' ? body.acepto as Record<string, unknown> : null
  const acepto = a && typeof a.version === 'string' && typeof a.sha256 === 'string' && a.version.length <= 80 && a.sha256.length <= 64 ? { version: a.version, sha256: a.sha256 } : undefined
  const app = (process.env.ARBRAIN_VERSION ?? process.env.NEXT_PUBLIC_ARBRAIN_VERSION ?? '').trim().slice(0, 40)
  return alDaemon('/permisos', { method: 'POST', confirmar: body.modo !== 'preguntar', body: JSON.stringify({ modo: body.modo, via, ...(acepto ? { acepto } : {}), ...(app ? { app } : {}) }) })
}
