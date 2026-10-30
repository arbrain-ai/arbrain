import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveImageSource } from '@/features/draw3/api/asset-resolver'


export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const body = await request.json() as { source?: string }
    if (!body.source) {
      return NextResponse.json({ error: 'Missing source' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const asset = await resolveImageSource(body.source, supabase)

    await supabase
      .from('draw_assets')
      .insert({
        user_id: null,
        url: asset.url,
        mime_type: asset.mimeType,
        width: asset.width,
        height: asset.height,
        tags: ['draw3', pageId],
        last_used_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.warn('[api/draw3/assets] draw_assets insert failed:', error.message)
      })

    return NextResponse.json({
      ok: true,
      page_id: pageId,
      asset,
    })
  } catch (err) {
    console.error('[api/draw3/assets] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
