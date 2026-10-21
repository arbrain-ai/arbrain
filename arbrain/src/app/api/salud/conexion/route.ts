import { principalSalud } from '@/features/salud/principal'
import { checkMutationOrigin, planningError } from '@/lib/planning/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { conexionDe, hashToken, nuevoToken, origenDe, pistaDe } from '@/features/salud/servidor'

// «Conecta tu reloj» (5 oct 2026): el estado de la conexión de quien pregunta y, con POST, su token nuevo.
// Regenerar invalida el anterior al instante. El token completo solo viaja en la respuesta del POST.
const noStore = { 'Cache-Control': 'no-store' }
const COLUMNAS = 'token_pista, ultimo_envio, ultimo_envio_muestras, ultimo_error'

export async function GET(request: Request) {
  try {
    const principal = await principalSalud()
    const { data, error } = await createServiceClient().from('salud_conexiones').select(COLUMNAS).eq('user_id', principal.id).maybeSingle()
    if (error) throw new Error('No se pudo leer tu conexión.')
    return Response.json({ conexion: conexionDe(data, origenDe(request)) }, { headers: noStore })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    const principal = await principalSalud()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as { accion?: unknown } | null
    if (body?.accion !== 'generar') throw new ChatAccessError('Acción desconocida.', 400)
    const token = nuevoToken()
    const { data, error } = await createServiceClient().from('salud_conexiones')
      .upsert({ user_id: principal.id, token_hash: hashToken(token), token_pista: pistaDe(token), creado_en: new Date().toISOString(), ultimo_error: null }, { onConflict: 'user_id' })
      .select(COLUMNAS).single()
    if (error) throw new Error('No se pudo generar tu token.')
    return Response.json({ token, conexion: conexionDe(data, origenDe(request)) }, { headers: noStore })
  } catch (error) { return planningError(error) }
}
