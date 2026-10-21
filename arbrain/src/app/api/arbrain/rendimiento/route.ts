import { planningError, planningOwner } from '@/lib/planning/server'
import { leerRendimientoVivo } from '@/features/rutinas/server/rendimiento'

// Taller › Rutinas · qué rinde (5 oct 2026). Solo el dueño; la lectura vive en features/rutinas/server/rendimiento.ts.
export const runtime = 'nodejs'

export async function GET() {
  try {
    await planningOwner()
    return Response.json(await leerRendimientoVivo(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}
