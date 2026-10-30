/**
 * POST /api/draw3/[id]/thumbnail — sube el preview webp de la página al
 * bucket `draw-thumbnails` y actualiza draw.thumbnail_url.
 *
 * Body: { dataUrl: 'data:image/webp;base64,...' }
 * El cliente captura un render reducido (~480px) después de guardar.
 */
import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { urlPublicaDeStorage } from '@/features/chat/lib/adjuntos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_THUMBNAIL_BYTES = 300 * 1024

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const body = await request.json().catch(() => null) as { dataUrl?: string } | null
    const dataUrl = body?.dataUrl ?? ''
    const match = /^data:(image\/(?:webp|png|jpeg));base64,(.+)$/.exec(dataUrl)
    if (!match) {
      return NextResponse.json({ error: 'dataUrl must be a base64 image data URL (webp/png/jpeg)' }, { status: 400 })
    }
    const contentType = match[1]
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.byteLength > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json({ error: `Thumbnail too large (${bytes.byteLength} bytes, max ${MAX_THUMBNAIL_BYTES})` }, { status: 413 })
    }

    const supabase = createServiceClient()
    const ext = contentType.split('/')[1]
    const path = `${pageId}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('draw-thumbnails')
      .upload(path, bytes, { contentType, upsert: true })
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: pub } = supabase.storage.from('draw-thumbnails').getPublicUrl(path)
    // Cache-bust (6 oct 2026): el archivo es estable por pagina (upsert), asi que la URL guardada lleva ?v=<ahora>. Cambia
    // SOLO cuando cambia la imagen: con ?v=updated_at la lista pedia la imagen vieja y quedaba pegada en cache.
    // La URL pública del Funnel, no la interna (127.0.0.1:8000): la lista la pinta el navegador, a veces desde otro aparato.
    const url = `${urlPublicaDeStorage(pub.publicUrl)}?v=${Date.now()}`
    const { error: updateError } = await supabase
      .from('draw')
      .update({ thumbnail_url: url })
      .eq('page_id', pageId)
      .eq('is_deleted', false)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, page_id: pageId, thumbnail_url: url })
  } catch (err) {
    console.error('[api/draw3/:id/thumbnail] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
