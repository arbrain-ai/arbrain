import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { esFallaDeAuth, respuestaServicioCaido } from '@/lib/infra-errores'
import { almacenSupabase } from '@/features/notifications/lib/almacenSupabase'
import { altaSuscripcion, bajaSuscripcion, estadoSuscripcion, type Respuesta } from '@/features/notifications/lib/pushServidor'

/**
 * Suscripción push de ESTE dispositivo (Ajustes › Notificaciones, 12 oct 2026). El destinatario sale de la sesión;
 * cualquier destinatario que mande el cliente se ignora. La lógica vive en `features/notifications/lib/pushServidor.ts` (probada).
 */
async function usuarioDeSesion(): Promise<string | null | Response> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!user && esFallaDeAuth(error)) return respuestaServicioCaido()
  return user?.id ?? null
}

const responder = (r: Respuesta) => NextResponse.json(r.json, { status: r.status, headers: r.headers })

async function conAlmacen(fn: (usuario: string | null, almacen: ReturnType<typeof almacenSupabase>) => Promise<Respuesta>) {
  const usuario = await usuarioDeSesion()
  if (usuario instanceof Response) return usuario
  try {
    return responder(await fn(usuario, almacenSupabase(createServiceClient())))
  } catch (err) {
    console.error('notifications/subscribe:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'No se pudo guardar este dispositivo. Intenta de nuevo.' }, { status: 500 })
  }
}

// POST — registra la suscripción de este dispositivo a nombre del usuario de la sesión
export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => null)
  return conAlmacen((usuario, almacen) => altaSuscripcion(usuario, cuerpo, almacen))
}

// GET ?endpoint= — ¿este dispositivo está registrado para mí? (la UI no confía solo en el navegador)
export async function GET(req: NextRequest) {
  const endpoint = req.nextUrl.searchParams.get('endpoint')
  return conAlmacen((usuario, almacen) => estadoSuscripcion(usuario, endpoint, almacen))
}

// DELETE — da de baja este dispositivo (solo si es del usuario de la sesión)
export async function DELETE(req: NextRequest) {
  const cuerpo = await req.json().catch(() => null)
  return conAlmacen((usuario, almacen) => bajaSuscripcion(usuario, cuerpo, almacen))
}
