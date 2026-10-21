import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { applyOps } from '@/features/draw3/ops/apply'
import { normalizeCanvasElements } from '@/features/draw3/compat/normalize'
import type { ArrangeAlgorithm, ArrangeOptions } from '@/features/draw3/ops/contract'


export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const body = await request.json().catch(() => ({})) as {
      ids?: string[]
      algorithm?: ArrangeAlgorithm
      options?: ArrangeOptions
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

    const pageElements = current.page_elements ?? {}
    const files = (pageElements.files ?? {}) as Record<string, { dataURL?: string }>
    const elements = normalizeCanvasElements((pageElements.elements ?? []) as Record<string, unknown>[], files)
    const currentVersion = (current.agent_version as number | null) ?? 0
    const { newState, result } = applyOps({
      elements,
      pageName: current.name as string,
      theme: pageElements.theme ?? 'system',
      agentVersion: currentVersion,
    }, [{
      kind: 'arrange',
      ids: body.ids,
      algorithm: body.algorithm ?? 'dagre-lr',
      options: body.options ?? { rankSep: 90, nodeSep: 70 },
    }], 'agent')

    const newVersion = currentVersion + 1
    const { error: writeError } = await supabase
      .from('draw')
      .update({
        page_elements: {
          ...pageElements,
          schemaVersion: 3,
          elements: newState.elements,
          files: {},
          theme: newState.theme ?? pageElements.theme ?? 'system',
        },
        agent_version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('page_id', pageId)

    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })

    return NextResponse.json({
      ok: result.errors.length === 0,
      page_id: pageId,
      agent_version: newVersion,
      applied: result.applied,
      errors: result.errors,
    })
  } catch (err) {
    console.error('[api/draw3/auto-layout] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
