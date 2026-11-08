import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { requireChatPrincipal } from '@/lib/chat-access'
import { leerDirectoDelDaemon, ponerDirectoEnDaemon } from '@/lib/modo-directo/servidor'

// Modo directo (7 nov 2026): el interruptor vive en el daemon (~/.config/arbrain/modo-directo.json,
// arbrain/server/src/cabina/modo-directo.ts), el mismo que leen las herramientas de la Cabina. GET lee (con el modo
// prendido trae los nombres que la app tapa); POST { prendido } lo cambia.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    // Leer es de cualquiera con sesión (la segunda persona también tapa su pantalla); cambiarlo, del dueño.
    await requireChatPrincipal()
    const r = await leerDirectoDelDaemon()
    return Response.json(r.body, { status: r.status, headers: NO_CACHE })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as { prendido?: unknown } | null
    if (typeof body?.prendido !== 'boolean') return Response.json({ error: 'prendido debe ser true o false.' }, { status: 400, headers: NO_CACHE })
    const r = await ponerDirectoEnDaemon(body.prendido)
    return Response.json(r.body, { status: r.status, headers: NO_CACHE })
  } catch (error) { return planningError(error) }
}
