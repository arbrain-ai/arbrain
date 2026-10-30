/**
 * Unified auth for the draw3 canvas API.
 *
 * The canvas runs on three surfaces that must all reach the same API:
 *  1. Agent (Levy / ClaudeClaw)  → Bearer OPENCLAW_GATEWAY_TOKEN
 *  2. Desktop app (Tauri)        → localhost + MISSION_CONTROL_DESKTOP_EMBED bypass
 *  3. Web (Vercel)               → authenticated Supabase session (cookie)
 *
 * Before this helper, the routes only accepted (1) and (2), so the web app got
 * 401s (stuck "Loading Canvas v3…" + empty drawings list). This accepts all three.
 */
import { isDesktopAuthBypassRequest, sameSecret } from '@/lib/desktop-auth'
import { createClient } from '@/lib/supabase/server'

export async function authenticateDraw3(request: Request): Promise<boolean> {
  // 1. Desktop localhost bypass (fast, no cookie read)
  if (isDesktopAuthBypassRequest(request)) return true

  // 2. Agent gateway token
  const authHeader = request.headers.get('authorization')
  const token = process.env.OPENCLAW_GATEWAY_TOKEN
  if (token && authHeader && sameSecret(authHeader.replace('Bearer ', ''), token)) return true

  // 3. Authenticated web session (Supabase cookie). server.ts also resolves the
  //    desktop bypass user, so this covers logged-in web users.
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    return Boolean(data?.user)
  } catch {
    return false
  }
}
