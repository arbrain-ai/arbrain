import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Modo de permisos de Levy (grupal 23 oct 2026): «Preguntar siempre», «Automático en mi carpeta» o «Sin preguntar».
// Aflojar lleva el secreto de confirmar (lo pone este servidor, nunca el navegador); volver a «preguntar» no.
// Dentro de «Sin preguntar», el interruptor «Quitar también el freno» (23 oct 2026).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODOS = new Set(['preguntar', 'carpeta', 'libre'])

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/permisos', { plazoMs: 3_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { modo?: unknown; sinFreno?: unknown; frase?: unknown }
  // «Quitar también el freno (bajo mi responsabilidad)»: quitarlo lleva el secreto y la frase (el daemon la valida);
  // devolverlo, no (es más estricto).
  if (typeof body.sinFreno === 'boolean') {
    if (body.sinFreno && (typeof body.frase !== 'string' || body.frase.length > 200)) {
      return Response.json({ error: 'Escribe la frase de confirmación.' }, { status: 400, headers: NOCACHE })
    }
    return alDaemon('/permisos', { method: 'POST', confirmar: body.sinFreno, body: JSON.stringify(body.sinFreno ? { sinFreno: true, frase: body.frase } : { sinFreno: false }) })
  }
  if (typeof body.modo !== 'string' || !MODOS.has(body.modo)) {
    return Response.json({ error: 'Petición inválida.' }, { status: 400, headers: NOCACHE })
  }
  return alDaemon('/permisos', { method: 'POST', confirmar: body.modo !== 'preguntar', body: JSON.stringify({ modo: body.modo }) })
}
