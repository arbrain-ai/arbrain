import { createServiceClient } from '@/lib/supabase/service'
import { planningOwner, planningError } from '@/lib/planning/server'
import { civilToday } from '@/features/sistema/calendar-days'

export const dynamic = 'force-dynamic'

interface ReporteRow {
  fecha: string
  titulo: string | null
  html: string
  generated_at: string
}

const PLACEHOLDER_HTML = '<!doctype html><html lang="es"><meta charset="utf-8">' +
  '<body style="font:14px -apple-system,system-ui,sans-serif;padding:2.5rem;color:#888">' +
  'Aún no hay reporte diario generado.</body></html>'

async function loadReporte(): Promise<ReporteRow | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('reportes_html')
    .select('fecha, titulo, html, generated_at')
    .eq('slug', 'reporte-diario')
    .maybeSingle()
  if (error) throw new Error('No se pudo consultar el reporte diario. Reintenta.')
  return (data as ReporteRow | null) ?? null
}

export async function GET(request: Request) {
  try {
    await planningOwner()
    const raw = new URL(request.url).searchParams.get('raw') === '1'
    const row = await loadReporte()
    const today = civilToday()
    const stale = !row || row.fecha !== today

    if (raw) {
      // A GET here always serves whatever real content exists (today's report,
      // or the last one generated) — never a fabricated stand-in. Staleness is
      // communicated via a header for callers that care; the card decides
      // whether to embed it based on the JSON call below, not this endpoint.
      if (!row) {
        return new Response(PLACEHOLDER_HTML, {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        })
      }
      return new Response(row.html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          // El HTML lo escribe un agente: se sirve con origen opaco (AUDITORIA A6). Sus scripts corren, pero no leen la
          // sesión ni llaman la API de la app aunque se abra directo en una pestaña.
          'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals',
          'X-Reporte-Fecha': row.fecha,
          'X-Reporte-Stale': String(stale),
        },
      })
    }

    return Response.json(
      {
        fecha: row?.fecha ?? null,
        titulo: row?.titulo ?? null,
        generated_at: row?.generated_at ?? null,
        html: row?.html ?? null,
        stale,
        today,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return planningError(error)
  }
}
