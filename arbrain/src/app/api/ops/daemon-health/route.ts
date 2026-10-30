import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'
import { ownerIds as buzonDelDueno } from '@/features/avisos/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { sameSecret } from '@/lib/desktop-auth'
import { instalacion } from '@/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Watchdog del daemon (18 jul 2026) — el latido lo toma un tercero NEUTRAL.
 *
 * Incidente que lo motiva: el daemon del Mac Mini estuvo caído 38 HORAS
 * (17 jul 00:05 → 18 jul 14:00 MX) y nadie se enteró hasta que Daniel lo
 * notó a mano. Lección del twitter-radar: "un órgano muerto se ve idéntico
 * a uno vivo si nadie chequea que trajo 0 por N días". El daemon no puede
 * vigilarse a sí mismo (muerto no avisa), así que el chequeo corre AFUERA:
 * pg_cron (Supabase MC) pega aquí cada 10 min via pg_net, y este route
 * (Vercel) sondea el daemon a través del túnel.
 *
 * Protocolo:
 *  - Probe: GET {tunnel}/schedule con el gateway token (endpoint barato ya
 *    existente; "túnel muerto" y "daemon muerto" alertan igual — para la app
 *    ambos significan chat roto).
 *  - 3 fallos consecutivos (~30 min) → web push a Daniel. Cooldown 6h para
 *    no spamear durante un outage largo.
 *  - Recuperación tras alerta → push de "revivió" (cierra el loop).
 *  - Estado en app_config.daemon_health (JSON) — sin tablas nuevas.
 *
 * Auth: Bearer OPENCLAW_GATEWAY_TOKEN (server-to-server, mismo del webhook).
 */

const FAILS_TO_ALERT = 3
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000
const PROBE_TIMEOUT_MS = 10_000
const STATE_KEY = 'daemon_health'

interface HealthState {
  fails: number
  lastOkAt: string | null
  /** En alerta activa desde (null = sano o aún no alertado) */
  alertedAt: string | null
  lastAlertAt: string | null
}

let vapidReady = false
function ensureVapid() {
  if (vapidReady) return
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim()
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? '').trim()
  if (!publicKey || !privateKey) return
  webpush.setVapidDetails(
    `mailto:${(process.env.VAPID_EMAIL ?? instalacion().correoDueno).trim()}`,
    publicKey,
    privateKey,
  )
  vapidReady = true
}

async function pushToOwner(title: string, body: string): Promise<Array<{ host: string; statusCode?: number; error?: string }>> {
  ensureVapid()
  if (!vapidReady) return [{ host: 'none', error: 'VAPID not configured' }]
  const supabase = createServiceClient()
  const ownerIds = await buzonDelDueno(supabase)
  let subsQuery = supabase.from('push_subscriptions').select('*')
  if (ownerIds.length > 0) subsQuery = subsQuery.in('user_id', ownerIds)
  const { data: subs } = await subsQuery
  if (!subs?.length) return [{ host: 'none', error: 'no push_subscriptions' }]

  const payloadStr = JSON.stringify({ title, body, url: '/chat?panel=taller&taller=servidores', tag: 'daemon-health', icon: '/icon-192.png' })
  const results: Array<{ host: string; statusCode?: number; error?: string }> = []
  const invalid: string[] = []
  await Promise.allSettled(
    subs.map(async (sub) => {
      const host = (() => { try { return new URL(sub.endpoint).host } catch { return 'invalid' } })()
      try {
        const res = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr,
          { TTL: 3600, urgency: 'high' },
        )
        results.push({ host, statusCode: res.statusCode })
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        results.push({ host, statusCode: status, error: String((err as Error).message ?? err).slice(0, 200) })
        if (status && status >= 400 && status < 500) invalid.push(sub.endpoint)
      }
    }),
  )
  if (invalid.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', invalid)
  }
  return results
}

async function probeDaemon(): Promise<boolean> {
  try {
    const url = await getSchedulerUrl()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS)
    const res = await fetch(`${url}/schedule`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: ac.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

async function runCheck(): Promise<NextResponse> {
  const supabase = createServiceClient()
  const { data: stateRow } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', STATE_KEY)
    .maybeSingle()

  let state: HealthState = { fails: 0, lastOkAt: null, alertedAt: null, lastAlertAt: null }
  try {
    if (stateRow?.value) state = { ...state, ...JSON.parse(stateRow.value) as Partial<HealthState> }
  } catch { /* estado corrupto → arrancar limpio */ }

  const now = new Date()
  const nowIso = now.toISOString()
  const alive = await probeDaemon()
  let pushed: string | null = null

  if (alive) {
    if (state.alertedAt) {
      const downMin = state.lastOkAt
        ? Math.round((now.getTime() - new Date(state.lastOkAt).getTime()) / 60_000)
        : null
      await pushToOwner(
        'Daemon de Levy: revivió ✅',
        downMin ? `Volvió después de ~${downMin} min inalcanzable.` : 'Volvió a responder.',
      )
      pushed = 'recovery'
    }
    state = { fails: 0, lastOkAt: nowIso, alertedAt: null, lastAlertAt: state.lastAlertAt }
  } else {
    state.fails += 1
    const cooldownOk = !state.lastAlertAt
      || now.getTime() - new Date(state.lastAlertAt).getTime() > ALERT_COOLDOWN_MS
    if (state.fails >= FAILS_TO_ALERT && cooldownOk) {
      const downMin = state.lastOkAt
        ? Math.round((now.getTime() - new Date(state.lastOkAt).getTime()) / 60_000)
        : state.fails * 10
      await pushToOwner(
        '⚠️ Daemon de Levy caído',
        `El daemon del Mac Mini lleva ~${downMin} min inalcanzable. Chat y crons no están corriendo.`,
      )
      state.alertedAt = state.alertedAt ?? nowIso
      state.lastAlertAt = nowIso
      pushed = 'alert'
    }
  }

  await supabase
    .from('app_config')
    .upsert({ key: STATE_KEY, value: JSON.stringify(state), updated_at: nowIso }, { onConflict: 'key' })

  const summary = { ok: true, alive, fails: state.fails, alerted: !!state.alertedAt, pushed }
  console.log('[daemon-health]', JSON.stringify(summary))
  return NextResponse.json(summary)
}

function authorized(req: NextRequest): boolean {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const expected = process.env.OPENCLAW_GATEWAY_TOKEN
  return !!token && !!expected && sameSecret(token, expected)
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runCheck()
}

// GET con el mismo Bearer: chequeo manual ("¿está vivo el daemon?") sin pg_cron.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runCheck()
}
