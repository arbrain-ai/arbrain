import { planningOwner, planningError } from '@/lib/planning/server'
import { galeria } from '@/features/editor/galeria/servidor'

// Galería de videos del editor (19 nov 2026): todas las carpetas del pipeline y los publicados del canal, con su estado.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try { await planningOwner(); return Response.json(await galeria(), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch (error) { return planningError(error) }
}
