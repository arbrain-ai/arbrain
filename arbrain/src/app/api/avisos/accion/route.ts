import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { checkMutationOrigin } from '@/lib/planning/server'
import { createServiceClient } from '@/lib/supabase/service'
import { postDeRecap, presentar, type AvisoFila } from '@/features/avisos/bandeja'
import { publicarRecapDesdeCampana, responderDesdeCampana } from '@/features/avisos/decisiones'

// Un botón de la campana (29 oct 2026). «Publicar» y «Descartar» son el toque de /decidir («Publícala» / «No»): el
// mismo formulario, la misma acción en arbrain.ai y el mismo freno (nada sale sin este toque; ht-pipeline publica en
// su siguiente vuelta). «Publicar» del recap de la grupal publica ESE borrador en arbrain.ai al momento, como el botón
// del feed (29 oct). «Ya lo vi» cierra el aviso sin decidir nada. Solo el dueño del aviso puede tocarlo.

const noStore = { 'Cache-Control': 'no-store' }
const ACCIONES = { publicar: 'si', descartar: 'no', duda: 'duda', visto: null } as const
type Accion = keyof typeof ACCIONES

const MENSAJE: Record<string, string> = {
  'sin-enlace': 'Este aviso no tiene una decisión que tocar desde aquí.',
  'ya-respondida': 'Esta decisión ya estaba respondida.',
  'sin-respuesta': 'arbrain.ai no respondió. No se publicó nada; intenta de nuevo.',
  'no-confirmada': 'No pude confirmar el toque en arbrain.ai. Ábrela para revisarla.',
  'recap-sin-respuesta': 'arbrain.ai no respondió. El recap sigue en borrador; intenta de nuevo.',
  'recap-no-confirmada': 'No pude confirmar que se publicó. Ábrelo para revisarlo.',
}

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    const principal = await requireChatPrincipal()
    const body = await request.json().catch(() => ({})) as { id?: unknown; accion?: unknown }
    const accion = typeof body.accion === 'string' && body.accion in ACCIONES ? body.accion as Accion : null
    if (typeof body.id !== 'string' || !accion) return Response.json({ error: 'Falta el aviso o la acción.' }, { status: 400, headers: noStore })
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('avisos').select('id,created_at,kind,source,title,body,url,read_at,resuelto_at')
      .eq('id', body.id).eq('user_id', principal.id).maybeSingle()
    if (error) throw new Error(error.message)
    const aviso = data as AvisoFila | null
    if (!aviso) return Response.json({ error: 'Ese aviso no existe.' }, { status: 404, headers: noStore })

    const r = ACCIONES[accion]
    const recap = accion === 'publicar' ? postDeRecap(aviso) : null
    if (recap) {
      // El recap no pasa por /decidir: su toque publica ese borrador (solo si es del dueño) y se confirma releyéndolo.
      const toque = await publicarRecapDesdeCampana(recap)
      if (!toque.ok) return Response.json({ ok: false, motivo: toque.motivo, mensaje: MENSAJE[`recap-${toque.motivo}`] }, { status: 502, headers: noStore })
      await cerrar(supabase, principal.id, aviso.id, 'publicado')
      return Response.json({ ok: true, ya: toque.ya }, { headers: noStore })
    }
    if (r) {
      // Solo donde el aviso ofrece ese botón (hoy: las respuestas de la comunidad).
      const ofrece = presentar(aviso).acciones.some(a => a.tipo === accion)
      if (!ofrece || !aviso.url) return Response.json({ error: MENSAJE['sin-enlace'] }, { status: 409, headers: noStore })
      const toque = await responderDesdeCampana(aviso.url, r)
      if (!toque.ok) {
        // Ya respondida (en su página o por otra persona del equipo): el aviso no pide nada más y se cierra.
        if (toque.motivo === 'ya-respondida') await cerrar(supabase, principal.id, aviso.id, 'decidido')
        return Response.json({ ok: false, motivo: toque.motivo, mensaje: MENSAJE[toque.motivo] }, { status: toque.motivo === 'ya-respondida' ? 409 : 502, headers: noStore })
      }
    }
    await cerrar(supabase, principal.id, aviso.id, accion === 'publicar' ? 'publicado' : accion === 'descartar' ? 'descartado' : accion === 'duda' ? 'duda' : 'visto')
    return Response.json({ ok: true }, { headers: noStore })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) {
      return Response.json({ error: 'No se pudo tocar el aviso.' }, { status: 503, headers: noStore })
    }
    return chatAccessResponse(error)
  }
}

async function cerrar(supabase: ReturnType<typeof createServiceClient>, userId: string, id: string, por: string) {
  const ahora = new Date().toISOString()
  const { error } = await supabase.from('avisos').update({ resuelto_at: ahora, resuelto_por: por }).eq('id', id).eq('user_id', userId).is('resuelto_at', null)
  // Base sin la migración 20261029: al menos queda leído.
  if (error) console.error('[avisos] cerrar:', error.message)
  await supabase.from('avisos').update({ read_at: ahora }).eq('id', id).eq('user_id', userId).is('read_at', null)
}
