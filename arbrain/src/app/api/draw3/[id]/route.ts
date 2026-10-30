/**
 * DELETE /api/draw3/[id] — soft-delete de una página del canvas.
 *
 * Antes NO existía: el agente tenía que ir directo a Supabase Management API
 * con `UPDATE draw SET is_deleted=true` (workaround documentado en la skill).
 * Soft-delete: la fila queda en la BD (recuperable via SQL), los listados y
 * el editor ya la filtran por `is_deleted=false`.
 */
import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('draw')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('page_id', pageId)
      .eq('is_deleted', false)
      .select('page_id, name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Drawing not found (or already deleted)' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, page_id: pageId, name: data[0].name, deleted: true })
  } catch (err) {
    console.error('[api/draw3/:id DELETE] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
