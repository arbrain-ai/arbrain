import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { createServiceClient } from '@/lib/supabase/service'
import type { ApplyOpsRequest } from '@/features/draw3/ops/types'
import type { Op } from '@/features/draw3/ops/contract'
import { applyOps } from '@/features/draw3/ops/apply'
import { validateOps, isValidActor } from '@/features/draw3/ops/validate'
import { siteUrl } from '@/lib/site-url'
import { normalizeCanvasElements } from '@/features/draw3/compat/normalize'
import { resolveImageSource } from '@/features/draw3/api/asset-resolver'
import { bboxFromElement, bboxUnion } from '@/features/draw3/elements/types'


export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const body = await request.json() as ApplyOpsRequest
    if (!body.ops || !Array.isArray(body.ops)) {
      return NextResponse.json({ error: 'Missing or invalid "ops" array' }, { status: 400 })
    }
    if (body.actor != null && !isValidActor(body.actor)) {
      return NextResponse.json({ error: `Invalid actor "${body.actor}". Must be one of: human, agent, system` }, { status: 400 })
    }
    // Validar la FORMA de cada op antes de tocar la pagina: una op malformada
    // rechaza el batch completo con detalle accionable (nada se aplica a medias).
    const invalidOps = validateOps(body.ops)
    if (invalidOps.length > 0) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid ops',
        invalid_ops: invalidOps,
      }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: current, error: readError } = await supabase
      .from('draw')
      .select('name, page_elements, agent_version')
      .eq('page_id', pageId)
      .eq('is_deleted', false)
      .single()

    if (readError || !current) {
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
    }

    const currentVersion = (current.agent_version as number | null) ?? 0
    if (body.expectedAgentVersion != null && body.expectedAgentVersion !== currentVersion) {
      return NextResponse.json({
        ok: false,
        error: 'Version conflict',
        expected_agent_version: body.expectedAgentVersion,
        current_agent_version: currentVersion,
      }, { status: 409 })
    }

    const pageElements = current.page_elements ?? {}
    const files = (pageElements.files ?? {}) as Record<string, { dataURL?: string }>
    const elements = normalizeCanvasElements((pageElements.elements ?? []) as Record<string, unknown>[], files)
    const preparedOps = await prepareOps(body.ops as Op[], supabase)
    const { newState, result } = applyOps({
      elements,
      pageName: current.name as string,
      theme: pageElements.theme ?? 'system',
      camera: pageElements.camera
        ? { x: pageElements.camera.x ?? 0, y: pageElements.camera.y ?? 0, zoom: pageElements.camera.scale ?? pageElements.camera.zoom ?? 1 }
        : undefined,
      agentVersion: currentVersion,
    }, preparedOps, body.actor ?? 'agent')
    const newVersion = currentVersion + 1

    const updatedPageElements = {
      ...pageElements,
      schemaVersion: 3,
      elements: newState.elements,
      files: {},
      ...(newState.theme && { theme: newState.theme }),
      ...(newState.camera && { camera: { x: newState.camera.x, y: newState.camera.y, scale: newState.camera.zoom } }),
    }

    const { error: writeError } = await supabase
      .from('draw')
      .update({
        name: newState.pageName ?? current.name,
        page_elements: updatedPageElements,
        agent_version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('page_id', pageId)

    if (writeError) {
      console.error('[api/draw3/ops] write error:', writeError)
      return NextResponse.json({ error: writeError.message }, { status: 500 })
    }

    await supabase
      .from('draw_ops_log')
      .insert({
        page_id: pageId,
        actor: body.actor ?? 'agent',
        actor_id: body.actorId ?? null,
        expected_version: currentVersion,
        resulting_version: newVersion,
        ops: preparedOps as unknown as object,
      })
      .then(({ error }) => {
        if (error) console.warn('[api/draw3/ops] audit log failed:', error.message)
      })

    return NextResponse.json({
      ok: result.errors.length === 0,
      page_id: pageId,
      previous_agent_version: currentVersion,
      expected_agent_version: body.expectedAgentVersion ?? null,
      agent_version: newVersion,
      applied: result.applied,
      errors: result.errors,
      total_elements: newState.elements.length,
      changed_files: 0,
      bounding_box: newState.elements.length ? bboxUnion(newState.elements.map(bboxFromElement)) : null,
      // `zoom` es el campo canonico para agentes; `scale` se mantiene por compat
      // (la BD persiste scale, ver updatedPageElements arriba).
      camera: newState.camera ? { x: newState.camera.x, y: newState.camera.y, zoom: newState.camera.zoom, scale: newState.camera.zoom } : null,
      url: `${siteUrl()}/draw3/${pageId}`,
    })
  } catch (err) {
    console.error('[api/draw3/ops] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function prepareOps(ops: Op[], supabase: ReturnType<typeof createServiceClient>): Promise<Op[]> {
  const prepared: Op[] = []
  for (const op of ops) {
    if (op.kind !== 'insertImage' || typeof op.source !== 'string') {
      prepared.push(op)
      continue
    }
    if (op.source.startsWith('http://') || op.source.startsWith('https://') || op.source.startsWith('data:')) {
      prepared.push(op)
      continue
    }
    const asset = await resolveImageSource(op.source, supabase)
    const maxWidth = op.maxWidth ?? op.width ?? Math.min(asset.width || 800, 560)
    const scale = asset.width && asset.width > maxWidth ? maxWidth / asset.width : 1
    prepared.push({
      ...op,
      source: asset.url,
      width: op.width ?? Math.round((asset.width || 800) * scale),
      height: op.height ?? Math.round((asset.height || 600) * scale),
    })
  }
  return prepared
}
