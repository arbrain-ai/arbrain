import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

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
    tasks: [],
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

export async function GET() {
  const CLAUDECLAW_URL = await getSchedulerUrl()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!CLAUDECLAW_TOKEN) {
      return NextResponse.json({
        tasks: [],
        offline: true,
        configuredUrl: CLAUDECLAW_URL,
        offlineReason: 'missing_token',
        detail: 'OPENCLAW_GATEWAY_TOKEN is not set',
      })
    }

    const res = await fetch(`${CLAUDECLAW_URL}/schedule`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(5_000),
    })
    const data = await readUpstreamJson(res)

    if (!res.ok) {
      return NextResponse.json({
        tasks: [],
        offline: true,
        configuredUrl: CLAUDECLAW_URL,
        offlineReason: res.status === 401 ? 'unauthorized' : 'upstream_error',
        upstreamStatus: res.status,
        detail: typeof data === 'object' && data && 'error' in data ? String(data.error) : res.statusText,
      })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(connectionErrorPayload(err, CLAUDECLAW_URL))
  }
}
