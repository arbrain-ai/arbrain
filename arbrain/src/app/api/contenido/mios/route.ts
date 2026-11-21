import { planningOwner, planningError } from '@/lib/planning/server'
import { cambiarMios, leerMios } from '@/features/contenido/mios-servidor'
import { validarCambio } from '@/features/contenido/mios'
import { siteUrl } from '@/lib/site-url'
import { tr } from '@/shared/i18n'

// Guardados y «ver después» (17 nov 2026): lo de PANTALLAS en el Studio. GET lee; POST aplica UN cambio y devuelve todo.
// Nada de aquí escribe en el calendario: el bloque sale de la pantalla por la pluma del Día (/api/planning).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }
const origen = () => { try { return siteUrl() } catch { return null } }

export async function GET() {
  try { await planningOwner(); return Response.json({ ...(await leerMios()), origen: origen() }, { headers: H }) }
  catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    const cambio = validarCambio(await request.json().catch(() => null))
    if (!cambio) return Response.json({ error: tr('Cambio inválido.') }, { status: 400, headers: H })
    return Response.json({ ...(await cambiarMios(cambio)), origen: origen() }, { headers: H })
  } catch (error) { return planningError(error) }
}
