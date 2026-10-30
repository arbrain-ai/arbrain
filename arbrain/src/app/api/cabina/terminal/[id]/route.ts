import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { ConexionMotor, MotorError, unaVez } from '@/lib/motor'
import { recortarReplay } from '@/lib/replay'

// Terminal VIVA del motor dentro del panel (panel-claridad, 1 oct 2026).
// GET = flujo SSE: replay de la terminal y su salida en vivo (attach del motor).
// POST = lo que escribe el dueño ({ datos }) o el tamaño del panel ({ cols, rows }).
// Solo Daniel (mismo candado que la planificación) y solo donde vive el socket.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const idDe = async (params: Promise<{ id: string }>) => {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id < 0) throw new MotorError('Terminal inválida.')
  return id
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let id: number
  try { await planningOwner(); id = await idDe(params) } catch (error) { return planningError(error) }
  const conexion = new ConexionMotor()
  const enc = new TextEncoder()
  let latido: NodeJS.Timeout | undefined
  const cerrar = () => { clearInterval(latido); conexion.cerrar() }
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let vivo = true
      const mandar = (msg: Record<string, unknown>) => { if (vivo) try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`)) } catch { vivo = false } }
      const terminar = () => { if (!vivo) return; vivo = false; cerrar(); try { ctrl.close() } catch { /* ya cerrado */ } }
      request.signal.addEventListener('abort', () => { void conexion.pedir({ op: 'detach', id }, 1000).catch(() => {}).finally(terminar) })
      // El replay llega antes de la respuesta de attach: se junta y sale recortado (replay.ts), así abre
      // igual de rápido desde la MacBook por el Funnel que en el Studio.
      let replay: Buffer[] | null = []
      conexion.onDatos = (term, bytes) => { if (term !== id) return; if (replay) replay.push(bytes); else mandar({ t: 'datos', b64: bytes.toString('base64') }) }
      conexion.onEvento = e => { if (e.evt === 'exit' && e.id === id) { mandar({ t: 'fin', codigo: e.code ?? null }); terminar() } }
      conexion.onCierre = () => { mandar({ t: 'error', msg: 'El motor cerró la conexión.' }); terminar() }
      try {
        await conexion.abrir('arbrain-panel')
        const info = await conexion.op({ op: 'info' }, 8000)
        const term = (info.terms as { id: number; readonly: boolean; origin: string }[] | undefined)?.find(t => t.id === id)
        if (!term) throw new MotorError('Esta terminal ya se cerró.')
        // El replay llega como DATA antes que la respuesta de attach: se manda «inicio» primero.
        mandar({ t: 'inicio', soloLectura: term.readonly, origen: term.origin })
        const r = await conexion.op({ op: 'attach', id })
        const previo = recortarReplay(Buffer.concat(replay ?? []))
        replay = null
        if (previo.length) mandar({ t: 'datos', b64: previo.toString('base64') })
        mandar({ t: 'tamano', cols: r.cols, rows: r.rows })
        latido = setInterval(() => { if (vivo) try { ctrl.enqueue(enc.encode(': latido\n\n')) } catch { vivo = false } }, 15_000)
      } catch (e) {
        mandar({ t: 'error', msg: e instanceof Error ? e.message : 'El motor no respondió.' })
        terminar()
      }
    },
    cancel() { void conexion.pedir({ op: 'detach', id }, 1000).catch(() => {}).finally(cerrar) },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkMutationOrigin(request)
    await planningOwner()
    const id = await idDe(params)
    const body = await request.json().catch(() => ({})) as { datos?: unknown; cols?: unknown; rows?: unknown }
    if (typeof body.datos === 'string') {
      if (!body.datos || body.datos.length > 16_000) throw new MotorError('Entrada vacía o demasiado larga.')
      await unaVez({ op: 'write', id, data: body.datos })
    } else if (typeof body.cols === 'number' && typeof body.rows === 'number') {
      const cols = Math.round(Math.min(Math.max(body.cols, 20), 400)), rows = Math.round(Math.min(Math.max(body.rows, 5), 200))
      await unaVez({ op: 'resize', id, cols, rows })
    } else throw new MotorError('Nada que hacer.')
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof MotorError) return Response.json({ error: error.message }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    return planningError(error)
  }
}
