import { planningOwner, planningError } from '@/lib/planning/server'
import { leerCanal } from '@/features/contenido/servidor'

// Tu canal: YouTube Analytics (tabla youtube_videos) para comparar contra el universo del cuartel.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await planningOwner()
    return Response.json(await leerCanal(), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return planningError(error) }
}
