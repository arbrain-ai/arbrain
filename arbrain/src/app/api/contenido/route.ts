import { planningOwner, planningError } from '@/lib/planning/server'
import { leerCuartel } from '@/features/contenido/servidor'

// Cuartel de Contenido (15 nov 2026): la lectura completa (vistas del sensor + lo de CEREBRO). Solo texto; YouTube reproduce.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await planningOwner()
    return Response.json(await leerCuartel(), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return planningError(error) }
}
