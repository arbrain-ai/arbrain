import { callPlanning, checkMutationOrigin, planningError, planningViewer } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(request: Request) {
  try {
    const { ownerId, perfil } = await planningViewer()
    const params = new URL(request.url).searchParams
    const result = await callPlanning({ action: 'snapshot', from: params.get('from'), to: params.get('to'), includeCompleted: params.get('includeCompleted') === 'true', forceMetadata: params.get('forceMetadata') === 'true', perfil })
    return Response.json({ ...result, ownerId }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    const { ownerId, perfil } = await planningViewer()
    const raw = await request.text()
    if (raw.length > 100_000) throw new ChatAccessError('El borrador es demasiado grande.', 413)
    let payload: Record<string, unknown>
    try { payload = JSON.parse(raw) } catch { throw new ChatAccessError('JSON inválido.', 400) }
    if (!payload || typeof payload !== 'object' || payload.ownerId !== ownerId) {
      throw new ChatAccessError('El borrador pertenece a otra identidad. Vuelve a abrir el calendario.', 409)
    }
    if (!['create', 'update', 'delete', 'complete', 'move', 'reopen'].includes(String(payload.action))) throw new ChatAccessError('Acción inválida.', 400)
    // El perfil lo pone la sesión, no el borrador (sin perfil = la vista del dueño).
    return Response.json(await callPlanning({ ...payload, perfil }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}
