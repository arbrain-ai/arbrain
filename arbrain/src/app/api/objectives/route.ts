import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole } from '@/lib/auth-utils'
import { instalacion } from '@/config'

// SSOT de objetivos: archivo markdown en el repo (mes -> semana -> dia).
// Lo mismo que lee now-snapshot.py y que Levy edita directo via time-os.
// Desktop (Tauri + Next standalone) escribe el archivo; web (Vercel) lee el
// ESPEJO en Mission Control (system_docs.key='objetivos'), sincronizado por
// este POST y por now-snapshot.py (launchd cada 20 min + session-start hook).
const ROOT = process.env.BUSINESS_OS_ROOT || instalacion().raizRepoRespaldo
const OBJ_FILE = path.join(ROOT, '.claude', 'plan', 'objetivos.md')
const MIRROR_KEY = 'objetivos'

export const dynamic = 'force-dynamic'

async function roleOf(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return getUserRole(user.id)
}

export async function GET() {
  const role = await roleOf()
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
  }
  try {
    const content = await readFile(OBJ_FILE, 'utf8')
    return NextResponse.json({ ok: true, source: 'file', content })
  } catch {
    // Sin filesystem (web/Vercel): leer el espejo de Mission Control.
    const service = createServiceClient()
    const { data } = await service.from('system_docs').select('content, updated_at').eq('key', MIRROR_KEY).maybeSingle()
    if (data?.content) {
      return NextResponse.json({ ok: true, source: 'mirror', content: data.content, updated_at: data.updated_at })
    }
    return NextResponse.json({ ok: false, reason: 'unavailable', content: '' }, { status: 200 })
  }
}

export async function POST(req: Request) {
  const role = await roleOf()
  if (role !== 'owner') {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
  }
  let body: { content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad_json' }, { status: 400 })
  }
  if (typeof body.content !== 'string') {
    return NextResponse.json({ ok: false, reason: 'no_content' }, { status: 400 })
  }
  try {
    const dir = path.dirname(OBJ_FILE)
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(OBJ_FILE, body.content, 'utf8')
    // Espejo web (best-effort, no bloquea la respuesta si falla).
    try {
      const service = createServiceClient()
      await service.from('system_docs').upsert(
        { key: MIRROR_KEY, content: body.content, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    } catch { /* no-op */ }
    // Regenera now.md (el sentido del tiempo de Levy) al instante para que su
    // vista ambiental refleje el edit de Daniel sin esperar al cron de 20 min.
    try {
      const snap = path.join(ROOT, 'arbrain', 'server', 'scripts', 'calendar', 'now-snapshot.py')
      if (existsSync(snap)) {
        spawn('python3', [snap], { detached: true, stdio: 'ignore' }).unref()
      }
    } catch { /* no-op */ }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: 'write_failed', message: String(e) },
      { status: 500 },
    )
  }
}
