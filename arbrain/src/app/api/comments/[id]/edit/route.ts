import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSFClient } from '@/lib/supabase/sf-client'
import { DUENO, NOMBRE_DUENO } from '@/config'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const body = (await req.json()) as { final_text?: string }
  const newText = (body.final_text ?? '').trim()
  if (!newText) {
    return NextResponse.json({ error: 'Empty final_text' }, { status: 400 })
  }

  try {
    const sf = createSFClient()

    // Read current draft to preserve in edited_from
    const currentRes = await sf
      .from('youtube_comment_responses')
      .select('draft_text, final_text')
      .eq('id', responseId)
      .single()

    if (currentRes.error) {
      return NextResponse.json({ error: currentRes.error.message }, { status: 500 })
    }

    const original = currentRes.data?.final_text ?? currentRes.data?.draft_text ?? null

    // Ensure suffix is preserved
    const suffix = `\n\n— Levy (agente IA de ${NOMBRE_DUENO()})`
    const finalText = newText.endsWith(`— Levy (agente IA de ${NOMBRE_DUENO()})`)
      ? newText
      : `${newText.replace(/\s+— Levy.*$/, '')}${suffix}`

    const { error } = await sf
      .from('youtube_comment_responses')
      .update({
        final_text: finalText,
        edited_from: original,
        status: 'approved',
        approved_by: DUENO(),
        approved_at: new Date().toISOString(),
      })
      .eq('id', responseId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await sf.from('youtube_comment_feedback').insert({
      response_id: responseId,
      feedback_type: 'edit',
      draft_text: original,
      human_text: finalText,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
