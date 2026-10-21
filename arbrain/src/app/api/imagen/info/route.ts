import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth-utils'
import { ErrorDocumento, resolverEnDisco } from '@/lib/cabina/documento-server'
import { registrarArchivo, registrarUrl } from '@/lib/imagenes/optimizar'

// Ficha de una imagen que el chat pinta (5 oct 2026): ruta de disco en el markdown de Levy o adjunto en Storage.
// Devuelve tamaño, color, placeholder y el hash con el que el cliente pide sus variantes. La vista documento no la
// necesita: la ficha le llega con el documento.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const fallo = (status: number, error: string) => Response.json({ error }, { status, headers: NO_CACHE })

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fallo(401, 'Unauthorized')
  if (!(await hasRole(user.id, 'owner', 'admin'))) return fallo(403, 'Forbidden')
  const q = req.nextUrl.searchParams
  const ruta = q.get('ruta')
  const url = q.get('url')
  try {
    let meta = null
    if (ruta) {
      const doc = await resolverEnDisco(ruta)
      if (doc.tipo !== 'imagen') return fallo(415, 'Solo imágenes.')
      meta = await registrarArchivo(doc.real)
    } else if (url) {
      meta = await registrarUrl(url)
    } else return fallo(400, 'Falta ruta o url.')
    if (!meta) return fallo(415, 'Esta imagen se sirve tal cual.')
    // Una URL de Storage es única por subida; una ruta de disco puede reescribirse (Levy regenera la lámina).
    return Response.json(meta, { headers: url && !ruta ? { 'Cache-Control': 'private, max-age=86400' } : NO_CACHE })
  } catch (e) {
    if (e instanceof ErrorDocumento) return fallo(e.status, e.message)
    return fallo(502, 'No se pudo leer la imagen.')
  }
}
