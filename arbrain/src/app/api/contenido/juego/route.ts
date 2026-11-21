import { planningOwner, planningError } from '@/lib/planning/server'
import { leerJuego } from '@/features/contenido/juego-servidor'

// Stats Royale (19 nov 2026): perfil, partidas, mazos, meta, rankings y repetición, ya calculados por el cuartel
// (`vistas/juego.json`, una vez al día). Aquí solo se lee.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await planningOwner()
    return Response.json(await leerJuego(), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return planningError(error) }
}
