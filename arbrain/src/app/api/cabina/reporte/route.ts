import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { createServiceClient } from '@/lib/supabase/service'

// Vista «reporte» de la Cabina (goal 2): lo que llegó. Avisos sin leer de la
// campana del dueño + el TEXTO de los reportes de los crons (conversations), con
// su hora original (el runId de una reentrega la conserva). Marcar leído usa
// POST /api/avisos.

const noStore = { 'Cache-Control': 'no-store' }
const REPORTES = ['morning-briefing', 'evening-reflection', 'business-council', 'monthly-review']
const DIAS: Record<string, number> = { hoy: 1, semana: 7, pendiente: 7 }

function horaOriginal(runId: string, fallback: string) {
  const ms = Number(/-(\d{13})$/.exec(runId)?.[1]); return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback
}

export async function GET(request: Request) {
  try {
    const principal = await requireChatPrincipal()
    const alcance = new URL(request.url).searchParams.get('alcance') ?? 'pendiente'
    const dias = DIAS[alcance] ?? 7
    const supabase = createServiceClient()
    const desde = new Date(Date.now() - dias * 86400_000).toISOString()
    const [avisos, runs] = await Promise.all([
      supabase.from('avisos').select('id,created_at,kind,source,title,body,url,read_at').eq('user_id', principal.id)
        .gte('created_at', desde).order('created_at', { ascending: false }).limit(40),
      supabase.from('conversations').select('run_id,prompt,response,status,created_at').eq('source', 'cron').eq('status', 'done')
        .in('prompt', REPORTES).gte('created_at', desde).order('created_at', { ascending: false }).limit(12),
    ])
    if (avisos.error) throw new Error(avisos.error.message)
    if (runs.error) throw new Error(runs.error.message)
    const lista = avisos.data ?? []
    // Cada reporte se empareja con SU aviso (misma rutina, creado en la misma
    // entrega): así la vista sabe si ya se leyó.
    const reportes = (runs.data ?? []).filter(r => (r.response ?? '').trim()).map(r => {
      const creado = Date.parse(r.created_at)
      const aviso = lista.find(a => a.source === `rutina:${r.prompt}` && Math.abs(Date.parse(a.created_at) - creado) < 5 * 60_000)
      return { runId: r.run_id, jobId: r.prompt, at: horaOriginal(r.run_id, r.created_at), reentrega: horaOriginal(r.run_id, r.created_at) !== r.created_at && creado - Date.parse(horaOriginal(r.run_id, r.created_at)) > 6 * 3600_000,
        texto: (r.response ?? '').slice(0, 12_000), avisoId: aviso?.id ?? null, leido: aviso ? !!aviso.read_at : true }
    })
    const enReporte = new Set(reportes.map(r => r.avisoId).filter(Boolean))
    const pendiente = alcance === 'pendiente'
    return Response.json({
      alcance,
      avisos: lista.filter(a => !a.read_at && !enReporte.has(a.id)).slice(0, 12),
      // Lo pendiente primero; lo ya leído de las últimas 36 h se queda (tenue) para
      // que la conversación, al releerse días después, conserve de qué se habló.
      reportes: pendiente ? reportes.filter(r => !r.leido || Date.now() - Date.parse(r.at) < 36 * 3600_000) : reportes,
      sinLeer: lista.filter(a => !a.read_at).length,
      leidoEn: new Date().toISOString(),
    }, { headers: noStore })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) return Response.json({ error: 'No se pudo leer lo que llegó.' }, { status: 503, headers: noStore })
    return chatAccessResponse(error)
  }
}
