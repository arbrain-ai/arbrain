import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { readCanvasStateFromCache, writeCanvasStateToCache } from '@/lib/local-first/server-canvas-cache'
import { bboxFromElement, bboxUnion } from '@/features/draw3/elements/types'
import { normalizeCanvasElements } from '@/features/draw3/compat/normalize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeCamera(camera: { x?: number; y?: number; zoom?: number; scale?: number } | null | undefined) {
  if (!camera) return null
  const zoom = camera.zoom ?? camera.scale ?? 1
  // `zoom` es el campo canonico del contrato agentico; `scale` se mantiene
  // porque getDrawData/DrawEditor3 historicamente leen scale del payload.
  return { x: camera.x ?? 0, y: camera.y ?? 0, zoom, scale: zoom }
}


export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const source = new URL(request.url).searchParams.get('source')
    if (source === 'local') {
      const cached = await readCanvasStateFromCache(pageId)
      if (cached) return NextResponse.json({ ...cached, source: 'local-cache' })
      return NextResponse.json({ error: 'Drawing not found in local cache' }, { status: 404 })
    }

    const supabase = createServiceClient()
    const { data: rows, error } = await supabase
      .from('draw')
      .select('page_id, name, page_elements, agent_version, settings')
      .eq('page_id', pageId)
      .eq('is_deleted', false)
      .limit(1)

    if (error) {
      // Error real (red/BD): el fallback local-first aplica.
      const cached = await readCanvasStateFromCache(pageId)
      if (cached) return NextResponse.json({ ...cached, source: 'local-cache' })
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
    }
    if (!rows || rows.length === 0) {
      // La BD respondio y la pagina NO existe (o esta borrada): 404 honesto,
      // SIN servir un cache stale de una pagina eliminada.
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
    }
    const data = rows[0]

    const files = (data.page_elements?.files ?? {}) as Record<string, { dataURL?: string }>
    const elements = normalizeCanvasElements((data.page_elements?.elements ?? []) as Record<string, unknown>[], files)
    const bounds = elements.length > 0 ? bboxUnion(elements.map(bboxFromElement)) : null

    const payload = {
      ok: true,
      version: 'draw3',
      page_id: data.page_id,
      name: data.name,
      agent_version: data.agent_version ?? 0,
      schema_version: data.page_elements?.schemaVersion ?? 3,
      element_count: elements.length,
      bounding_box: bounds,
      elements,
      files: data.page_elements?.files ?? {},
      theme: data.page_elements?.theme ?? 'system',
      // Normalizado a `zoom` (la BD persiste `scale` por razones historicas;
      // el contrato agentico habla siempre en zoom).
      camera: normalizeCamera(data.page_elements?.camera),
      // Settings de la PÁGINA (columna `settings` de la tabla `draw`), distintos
      // de `page_elements.settings` (config del grid del editor). Hoy solo se usa
      // para `htmlUrl`: paginas "hoja HTML" que renderizan un iframe en vez del canvas.
      page_settings: data.settings ?? null,
      source: 'cloud',
    }

    await writeCanvasStateToCache({
      page_id: data.page_id,
      name: data.name,
      page_elements: {
        schemaVersion: data.page_elements?.schemaVersion ?? 3,
        elements: elements as unknown as Record<string, unknown>[],
        files: data.page_elements?.files ?? {},
        theme: data.page_elements?.theme ?? 'system',
        camera: data.page_elements?.camera ?? null,
      },
      agent_version: data.agent_version ?? 0,
      updated_at: new Date().toISOString(),
    }).catch((cacheError) => {
      console.error('[api/draw3/state] cache write failed:', cacheError)
    })

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[api/draw3/state] error:', err)
    const { id: pageId } = await params
    const cached = await readCanvasStateFromCache(pageId)
    if (cached) return NextResponse.json({ ...cached, source: 'local-cache' })
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Guardado del editor (snapshot completo de la página).
 *
 * Los WRITES deben usar el mismo modelo de auth que los READS: el cliente
 * supabase del browser fallaba silenciosamente en el desktop (sin sesión →
 * RLS → UPDATE de 0 filas SIN error → "Guardado" mentiroso y el server nunca
 * se enteraba). Este PUT usa authenticateDraw3 + service client, igual que GET.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const body = await request.json().catch(() => null) as {
      name?: string
      page_elements?: Record<string, unknown>
    } | null
    if (!body || typeof body.page_elements !== 'object' || body.page_elements === null) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('draw')
      .update({
        name: body.name ?? 'New Page',
        page_elements: body.page_elements,
        updated_at: new Date().toISOString(),
      })
      .eq('page_id', pageId)
      .eq('is_deleted', false)
      .select('page_id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) {
      // 0 filas = página inexistente/borrada. NUNCA fallar en silencio.
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, page_id: pageId })
  } catch (err) {
    console.error('[api/draw3/state] PUT error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
