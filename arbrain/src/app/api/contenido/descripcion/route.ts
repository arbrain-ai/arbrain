import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'
import { idValido } from '@/features/contenido/servidor'

// La descripción de un video de YouTube (20 nov 2026, Daniel: «no veo la descripción del video, me sirve para entender el
// embudo»). Sale de la YouTube Data API v3 (snippet) con la llave del proyecto, `YOUTUBE_DATA_API_KEY` (env o
// arbrain/server/.env). Se guarda en memoria del proceso: la descripción casi nunca cambia.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }
const cache = new Map<string, { descripcion: string; titulo: string }>()

function llave(): string | undefined {
  if (process.env.YOUTUBE_DATA_API_KEY) return process.env.YOUTUBE_DATA_API_KEY
  const rutas: string[] = []
  for (let c = process.cwd(), i = 0; i < 6; i++) {
    rutas.push(join(c, 'server', '.env'), join(c, 'arbrain', 'server', '.env'))
    const up = dirname(c); if (up === c) break; c = up
  }
  // La web desplegada (~/Servers/arbrain-web) y la app de escritorio no traen el .env del servidor: al final, el del repo.
  rutas.push(join(homedir(), 'Developer', 'artificial-brain', 'arbrain', 'server', '.env'))
  for (const p of rutas) {
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(/^YOUTUBE_DATA_API_KEY=(.+)$/m)
    if (m) return (process.env.YOUTUBE_DATA_API_KEY = m[1].trim().replace(/^['"]|['"]$/g, ''))
  }
}

export async function GET(request: Request) {
  try {
    await planningOwner()
    const v = new URL(request.url).searchParams.get('v')
    if (!idValido(v)) return Response.json({ error: 'Video inválido.' }, { status: 400, headers: H })
    const ya = cache.get(v!)
    if (ya) return Response.json(ya, { headers: H })
    const k = llave()
    if (!k) return Response.json({ error: 'sin_llave' }, { status: 503, headers: H })
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(v!)}&key=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return Response.json({ error: `youtube_${r.status}` }, { status: 502, headers: H })
    const j = await r.json() as { items?: { snippet?: { description?: string; title?: string } }[] }
    const sn = j.items?.[0]?.snippet
    if (!sn) return Response.json({ error: 'no_encontrado' }, { status: 404, headers: H })
    const out = { descripcion: sn.description ?? '', titulo: sn.title ?? '' }
    cache.set(v!, out)
    return Response.json(out, { headers: H })
  } catch (error) { return planningError(error) }
}
