import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

const VALID_ACTIONS = new Set(['run', 'pause', 'resume'])

async function readUpstreamJson(res: Response) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { error: text.slice(0, 500) }
  }
}

function connectionErrorPayload(err: unknown, CLAUDECLAW_URL: string) {
  const error = err instanceof Error ? err : new Error(String(err))
  const cause = error.cause as { code?: string } | undefined
  const code = cause?.code

  return {
    error: 'ClaudeClaw unreachable',
    offline: true,
    configuredUrl: CLAUDECLAW_URL,
    offlineReason:
      code === 'ECONNREFUSED'
        ? 'connection_refused'
        : error.name === 'TimeoutError'
          ? 'timeout'
          : 'unreachable',
    detail: code ?? error.message,
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const CLAUDECLAW_URL = await getSchedulerUrl()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, action } = await params
  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    if (!CLAUDECLAW_TOKEN) {
      return NextResponse.json({
        error: 'OPENCLAW_GATEWAY_TOKEN is not set',
        offline: true,
        configuredUrl: CLAUDECLAW_URL,
        offlineReason: 'missing_token',
      }, { status: 503 })
    }

    const res = await fetch(`${CLAUDECLAW_URL}/schedule/${id}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    })

    const data = await readUpstreamJson(res)
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(connectionErrorPayload(err, CLAUDECLAW_URL), { status: 503 })
  }
}
