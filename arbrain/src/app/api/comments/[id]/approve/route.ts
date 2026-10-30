import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSFClient } from '@/lib/supabase/sf-client'
import { DUENO } from '@/config'

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
    const { data, error } = await sf
      .from('youtube_comment_responses')
      .update({
        status: 'approved',
        approved_by: DUENO(),
        approved_at: new Date().toISOString(),
      })
      .eq('id', responseId)
      .select('id, draft_text, final_text')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await sf.from('youtube_comment_feedback').insert({
      response_id: responseId,
      feedback_type: 'approve',
      draft_text: data?.draft_text ?? null,
      human_text: data?.final_text ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
