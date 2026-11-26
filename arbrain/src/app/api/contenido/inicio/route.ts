import { planningOwner, planningError } from '@/lib/planning/server'
import { leerInicio } from '@/features/contenido/servidor'

// Feed «Inicio» (cuartel v2, PULSO, ESQUEMA §9): la dosis arriba y «Lo nuevo de tu universo» ordenado hacia la meta,
// finito y con «estás al día». Lo escribe el pulso cada 30 min; aquí solo se lee (y se quita lo ya votado).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await planningOwner()
    const inicio = await leerInicio()
    return Response.json(inicio ?? { estado: 'sin_pulso', nuevo: null }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return planningError(error) }
}
