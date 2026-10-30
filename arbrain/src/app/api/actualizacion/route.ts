import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { estadoDespliegue, pedirDespliegue } from '@/lib/actualizacion-web'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }

/** ¿Hay commits de arbrain web sin desplegar? Solo Daniel (el proxy deja pasar /api/*; cada ruta se autentica). */
export async function GET() {
  try {
    await planningOwner()
    return Response.json(await estadoDespliegue(), { headers })
  } catch (error) { return planningError(error) }
}

/** «Reiniciar»: despliega ya (sin ventana de silencio ni espera de turnos para compilar). */
export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    await planningOwner()
    return Response.json(await pedirDespliegue(), { headers })
  } catch (error) { return planningError(error) }
}
