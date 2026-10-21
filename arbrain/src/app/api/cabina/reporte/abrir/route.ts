import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { createServiceClient } from '@/lib/supabase/service'
import { HILOS_RUTINAS, TITULO_REPORTES } from '@/shared/constants/rutinas-hilos'
import { corridasDelPeriodo, reporteDelPeriodo, type AlcanceReporte } from '@/features/planning/reporte-por-fecha'

// «Abrir completo» de la vista reporte: el hilo «Reportes» de la carpeta Rutinas (la conversación «Automatizaciones»,
// donde el webhook dejaba los reportes que suenan en el teléfono; 4 oct 2026). `?hilo=informacion` abre el hilo
// «Información» (v3: los dos hilos salieron de la barra y se abren desde Taller › Rutinas).
//
// `?job=business-council` (el Reporte semanal del calendario): abre la conversación ANCLADA en el mensaje de ese cron
// (`&msg=`, el mismo ancla que usa el push). v3 (10 oct 2026): con `&alcance=dia|semana|mes&fecha=AAAA-MM-DD` abre el
// reporte de ESE periodo, también de días pasados, en la conversación donde haya caído (la favorita desde el 10 oct, el
// hilo «Reportes» antes); ver features/planning/reporte-por-fecha.ts. Sin fecha, el último. `&json=1` devuelve `{ url }`
// en vez de redirigir, para navegar sin salir de la app.
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const ALCANCES = new Set<AlcanceReporte>(['dia', 'semana', 'mes'])

export async function GET(request: Request) {
  try {
    await requireChatPrincipal()
    const params = new URL(request.url).searchParams
    const job = params.get('job'), quiereJson = params.has('json')
    const fecha = params.get('fecha'), alcance = params.get('alcance') as AlcanceReporte | null
    const supabase = createServiceClient()
    const responder = (destino: string, falta?: boolean) => falta
      ? quiereJson ? Response.json({ error: 'sin reporte' }, { status: 404 }) : Response.redirect(new URL(destino, request.url), 307)
      : quiereJson ? Response.json({ url: destino }) : Response.redirect(new URL(destino, request.url), 307)

    if (params.get('hilo') === 'informacion') {
      const id = HILOS_RUTINAS.find((h) => h.id === 'informacion')?.sesionId
      return responder(id ? `/chat?session=${id}` : '/chat')
    }
    const { data } = await supabase.from('chat_sessions').select('id').eq('title', TITULO_REPORTES).eq('is_favorite', true).limit(1).maybeSingle()
    const hiloReportes = data?.id ? `/chat?session=${data.id}` : '/chat'
    if (!job || !/^[a-z0-9-]{1,60}$/.test(job)) return responder(hiloReportes)

    if (fecha && FECHA.test(fecha) && alcance && ALCANCES.has(alcance)) {
      // Holgura de 8 días: una reentrega se inserta tarde pero conserva su hora original (metadata.originalAt).
      const v = corridasDelPeriodo(alcance, fecha)
      const desde = new Date(Date.parse(`${v.desde}T00:00:00-06:00`) - 86_400_000).toISOString()
      const hasta = new Date(Date.parse(`${v.hasta}T00:00:00-06:00`) + 8 * 86_400_000).toISOString()
      const { data: mensajes, error } = await supabase.from('chat_messages').select('id, session_id, created_at, metadata')
        .eq('metadata->>jobId', job).eq('metadata->>source', 'cron').gte('created_at', desde).lt('created_at', hasta)
        .order('created_at', { ascending: false }).limit(50)
      if (error) throw new Error(error.message)
      const m = reporteDelPeriodo(mensajes ?? [], alcance, fecha)
      return m ? responder(`/chat?session=${m.session_id}&msg=${m.id}`) : responder(hiloReportes, true)
    }

    const { data: ultimo } = await supabase.from('chat_messages').select('id, session_id')
      .eq('metadata->>jobId', job).eq('metadata->>source', 'cron').order('created_at', { ascending: false }).limit(1).maybeSingle()
    return ultimo?.id ? responder(`/chat?session=${ultimo.session_id}&msg=${ultimo.id}`) : responder(hiloReportes, true)
  } catch (error) { return chatAccessResponse(error) }
}
