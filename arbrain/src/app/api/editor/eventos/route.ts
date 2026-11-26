import { planningError, planningOwner } from '@/lib/planning/server'
import { baseDelMotor, tokenDelMotor } from '@/lib/editor/motor'

// Eventos en vivo del motor (19 nov 2026): el motor los da por WebSocket con el token en la URL; el navegador no debe
// verlo, así que este servidor abre el WebSocket y los reenvía como Server-Sent Events. Solo los eventos del proyecto
// pedido, y solo los que el editor usa.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIPOS = new Set(['project.updated', 'media.updated', 'change.updated', 'task.updated', 'note.updated', 'render.updated', 'activity.added'])

export async function GET(request: Request) {
  try {
    await planningOwner()
    const proyecto = new URL(request.url).searchParams.get('proyecto') ?? ''
    if (!/^prj_[A-Za-z0-9]{4,40}$/.test(proyecto)) return new Response('Proyecto inválido.', { status: 400 })
    const base = baseDelMotor()
    const token = await tokenDelMotor()
    const enc = new TextEncoder()
    let ws: WebSocket | null = null
    let latido: ReturnType<typeof setInterval> | null = null
    const cerrar = () => { if (latido) clearInterval(latido); latido = null; try { ws?.close() } catch { /* ya cerrado */ } ws = null }
    const flujo = new ReadableStream<Uint8Array>({
      start(ctl) {
        const mandar = (evento: string, datos: unknown) => { try { ctl.enqueue(enc.encode(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`)) } catch { cerrar() } }
        ws = new WebSocket(`ws://${base.host}/ws?token=${encodeURIComponent(token)}`)
        ws.onopen = () => { ws?.send(JSON.stringify({ type: 'subscribe', projectId: proyecto })); mandar('listo', { proyecto }) }
        ws.onmessage = m => {
          try {
            const e = JSON.parse(String(m.data)) as { type?: string; projectId?: string }
            if (e.type && TIPOS.has(e.type) && (!e.projectId || e.projectId === proyecto)) mandar('motor', e)
          } catch { /* mensaje ilegible */ }
        }
        ws.onclose = () => { mandar('cerrado', {}); cerrar(); try { ctl.close() } catch { /* ya cerrado */ } }
        ws.onerror = () => { mandar('error', { message: 'Se perdió la conexión con el motor.' }) }
        latido = setInterval(() => { try { ctl.enqueue(enc.encode(': latido\n\n')) } catch { cerrar() } }, 20_000)
        request.signal.addEventListener('abort', () => { cerrar(); try { ctl.close() } catch { /* ya cerrado */ } })
      },
      cancel() { cerrar() },
    })
    return new Response(flujo, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
  } catch (error) { return planningError(error) }
}
