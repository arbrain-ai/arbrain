import { createServiceClient } from '@/lib/supabase/service'
import { sameSecret } from '@/lib/desktop-auth'
import { COLUMNAS_ORDEN, cambioDe, leerOrden, unirSinRepetir } from '@/features/cabina/conversaciones-orquesta'

// Orquestar conversaciones existentes (6 nov 2026): la herramienta `conversacion` de la Cabina (accion listar, renombrar,
// fijar, desfijar) deja la orden en el agent-server (server/src/cabina/conversaciones.ts) y su pulso la manda aquí,
// servidor a servidor con su token, como /api/cabina/conversacion. Solo filas del dueño de la orden; nunca borra ni archiva.

export const runtime = 'nodejs'

type Fila = { id: string; title: string | null; is_favorite: boolean | null }

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const esperado = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!token || !esperado || !sameSecret(token, esperado)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const orden = leerOrden(await request.json().catch(() => null))
  if ('error' in orden) return Response.json({ error: orden.error }, { status: 400 })
  const service = createServiceClient()

  if (orden.accion === 'listar') {
    // Por ids: también archivadas, para que el agent-server pueda decir «está archivada» en vez de «no existe».
    if (orden.ids) {
      const { data, error } = await service.from('chat_sessions').select(COLUMNAS_ORDEN).eq('profile_id', orden.ownerId).in('id', orden.ids)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ conversaciones: data ?? [] })
    }
    const [fijadas, recientes] = await Promise.all([
      service.from('chat_sessions').select(COLUMNAS_ORDEN).eq('profile_id', orden.ownerId).is('archived_at', null).eq('is_favorite', true).limit(100),
      service.from('chat_sessions').select(COLUMNAS_ORDEN).eq('profile_id', orden.ownerId).is('archived_at', null)
        .order('last_message_at', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false }).limit(orden.limite),
    ])
    const error = fijadas.error ?? recientes.error
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ conversaciones: unirSinRepetir((fijadas.data ?? []) as unknown as Fila[], (recientes.data ?? []) as unknown as Fila[]) })
  }

  const actual = await service.from('chat_sessions').select(COLUMNAS_ORDEN).eq('id', orden.id).eq('profile_id', orden.ownerId).maybeSingle()
  if (actual.error) return Response.json({ error: actual.error.message }, { status: 500 })
  if (!actual.data) return Response.json({ error: 'Conversación no encontrada (o no es de este dueño).' }, { status: 404 })
  const cambio = cambioDe(orden, actual.data as unknown as Fila)
  if (!cambio) return Response.json({ conversacion: actual.data })
  const { data, error } = await service.from('chat_sessions').update(cambio).eq('id', orden.id).eq('profile_id', orden.ownerId).select(COLUMNAS_ORDEN).single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ conversacion: data })
}
