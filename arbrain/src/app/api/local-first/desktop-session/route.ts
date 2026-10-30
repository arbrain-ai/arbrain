import { NextResponse, type NextRequest } from 'next/server'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { isDesktopAuthBypassRequest } from '@/lib/desktop-auth'
import { esEdicionCliente } from '@/lib/edicion'
import { dirDatosWeb } from '@/lib/rutas-instalacion'

export const dynamic = 'force-dynamic'

/** Tells a loopback browser whether this server runs with the desktop bypass
 * (MISSION_CONTROL_DESKTOP_EMBED=1). The same condition already lets every API
 * route treat loopback requests as the personal owner; this only lets a plain
 * browser on this machine (a canary/ensayo without Tauri) paint that same
 * session instead of bouncing to the member landing. Never true on Vercel. */
export async function GET(request: NextRequest) {
  if (!isDesktopAuthBypassRequest(request)) return NextResponse.json({ bypass: false }, { status: 404 })
  return NextResponse.json({ bypass: true }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Desktop diagnostics from the WebView (loopback + embed only): the runtime
 * reports once per session why the Tauri bridge was unusable. Appended to
 * ~/Library/Logs/Arbrain/desktop-ipc.log so it can be read without devtools. */
export async function POST(request: NextRequest) {
  if (!isDesktopAuthBypassRequest(request)) return NextResponse.json({ ok: false }, { status: 404 })
  let body: { issue?: unknown; userAgent?: unknown } = {}
  try { body = await request.json() } catch { /* empty body */ }
  const issue = typeof body.issue === 'string' ? body.issue.slice(0, 2000) : 'sin detalle'
  const userAgent = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : ''
  try {
    const dir = esEdicionCliente() ? path.join(dirDatosWeb(), 'logs') : path.join(homedir(), 'Library', 'Logs', 'Arbrain')
    await mkdir(dir, { recursive: true })
    await appendFile(path.join(dir, 'desktop-ipc.log'), `${new Date().toISOString()} ${issue}${userAgent ? ` · ${userAgent}` : ''}\n`)
  } catch { /* logging must never fail the app */ }
  return NextResponse.json({ ok: true })
}
