import { createServiceClient } from '@/lib/supabase/service'
import { planningError, planningOwner } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { esEdicionCliente } from '@/lib/edicion'
import { contarInterrupciones, type LecturaInterrupciones } from '@/features/planning/interrupciones'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

/**
 * GET ?desde=ISO&hasta=ISO → cuántos avisos de rutinas pidieron decisión y cuántos eran de Reemplazar/Delegar
 * (features/planning/interrupciones.ts). Solo lectura. En la edición del alumno no hay esa tabla: «sin medir».
 */
export async function GET(request: Request) {
  try {
    await planningOwner()
    const u = new URL(request.url)
    const desde = u.searchParams.get('desde') ?? '', hasta = u.searchParams.get('hasta') ?? ''
    if (!Number.isFinite(Date.parse(desde)) || !Number.isFinite(Date.parse(hasta)) || Date.parse(hasta) <= Date.parse(desde)) throw new ChatAccessError('Rango inválido.', 400)
    if (esEdicionCliente()) return Response.json({ medido: false, motivo: 'Tu edición aún no registra los avisos que piden decisión.' } satisfies LecturaInterrupciones, { headers })
    const { data, error } = await createServiceClient().from('chat_messages').select('created_at, metadata')
      .eq('metadata->>pide_decision', 'true').gte('created_at', new Date(desde).toISOString()).lt('created_at', new Date(hasta).toISOString()).limit(500)
    if (error) return Response.json({ medido: false, motivo: 'No pude leer los avisos.' } satisfies LecturaInterrupciones, { headers })
    const filas = (data ?? []).map(r => { const m = (r.metadata ?? {}) as Record<string, unknown>
      return { creado: r.created_at as string, decision: typeof m.decision === 'string' ? m.decision : null, rutina: typeof m.jobLabel === 'string' ? m.jobLabel : null } })
    return Response.json(contarInterrupciones(filas) satisfies LecturaInterrupciones, { headers })
  } catch (error) { return planningError(error) }
}
