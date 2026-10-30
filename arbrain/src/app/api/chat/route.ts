import { NextResponse } from 'next/server'
import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

export async function POST(request: Request) {
  // En paralelo con la auth: la URL del daemon no depende de ella.
  const claudeclawUrl = getClaudeclawUrl()
  // Require authenticated session
  // Misma puerta que el resto del chat: base o Auth caídas = 503 con causa, nunca 401/403 (12 oct 2026).
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const endpoint = body['action'] === 'newchat' ? '/newchat' : '/chat'

  try {
    const res = await fetch(`${await claudeclawUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CLAUDECLAW_TOKEN}`,
      },
      body: JSON.stringify({ message: body['message'] }),
      // 10 min timeout — matches ClaudeClaw AGENT_TIMEOUT_MS
      signal: AbortSignal.timeout(600_000),
    })

    const data: unknown = await res.json()
    // Pass through all fields including compact metadata and slashCommands
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Agent timeout — try again' }, { status: 504 })
    }
    return NextResponse.json(
      { error: 'ClaudeClaw unreachable. Make sure it is running locally.' },
      { status: 503 },
    )
  }
}
