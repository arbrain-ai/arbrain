import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { checkMutationOrigin } from '@/lib/planning/server'
import { createServiceClient } from '@/lib/supabase/service'
import { registrar } from '@/features/avisos/server'
import { cuerpoReporte, type ReporteHilo } from '@/features/chat/lib/hilo-vigia'
import { aceptarRueda, escribirLogHilo, escribirLogRueda } from '@/features/chat/lib/rueda-log'
import { esEdicionCliente } from '@/lib/edicion'

// El hilo del chat que no se pudo pintar o quedó vacío a la vista (12 oct 2026) deja fila en la BITÁCORA: es
// telemetría para Levy, nunca la campana ni el teléfono de Daniel. Ver features/chat/lib/hilo-vigia.ts.
// 19 oct 2026: `rueda` (la rueda no movió el hilo, lib/rueda-vigia.ts) va además a ~/Library/Logs/Arbrain/hilo-rueda.jsonl;
// uno cada 30 s como mucho.
export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    await requireChatPrincipal()
    const r = (await request.json().catch(() => ({}))) as Partial<ReporteHilo>
    const tipo = r.tipo === 'render' ? 'render' : r.tipo === 'rueda' ? 'rueda' : 'vacio'
    if (tipo === 'rueda' && !aceptarRueda()) return Response.json({ ok: false, antirrebote: true }, { headers: { 'Cache-Control': 'no-store' } })
    const { title, body } = cuerpoReporte({
      tipo,
      mensaje: typeof r.mensaje === 'string' ? r.mensaje : '',
      sesion: typeof r.sesion === 'string' ? r.sesion : null,
      detalle: r.detalle && typeof r.detalle === 'object' ? r.detalle : undefined,
    })
    if (tipo === 'rueda') await escribirLogRueda({ sesion: typeof r.sesion === 'string' ? r.sesion : null, detalle: r.detalle }, request.headers.get('user-agent') ?? '')
    // Edición cliente (30 oct 2026): sin Supabase; la línea queda en SU carpeta de datos (rueda-log.ts › dirLogs).
    if (esEdicionCliente()) {
      if (tipo !== 'rueda') await escribirLogHilo({ tipo, title, body, sesion: typeof r.sesion === 'string' ? r.sesion : null })
      return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const ok = await registrar(createServiceClient(), { kind: 'sistema', entrega: 'bitacora', source: `chat:hilo-${tipo}` }, { title, body }, [])
    return Response.json({ ok }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return chatAccessResponse(error)
  }
}
