import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSFClient } from '@/lib/supabase/sf-client'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const responseId = Number(id)
  if (!Number.isFinite(responseId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const sf = createSFClient()
    const currentRes = await sf
      .from('youtube_comment_responses')
      .select('draft_text, final_text')
      .eq('id', responseId)
      .single()

    const { error } = await sf
      .from('youtube_comment_responses')
      .update({ status: 'skipped' })
      .eq('id', responseId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await sf.from('youtube_comment_feedback').insert({
      response_id: responseId,
      feedback_type: 'skip',
      draft_text: currentRes.data?.draft_text ?? null,
      human_text: null,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
