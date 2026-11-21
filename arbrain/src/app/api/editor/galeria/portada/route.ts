import { readFile } from 'node:fs/promises'
import { planningOwner, planningError } from '@/lib/planning/server'
import { portada, tipoDe } from '@/features/editor/galeria/servidor'
import { partirId } from '@/features/editor/galeria/modelo'

// La portada de un video (o una candidata con &f=): la elegida, la primera candidata, la de YouTube (en caché local) o un
// cuadro del video. Se sirve desde Arbrain: la página nunca carga imágenes de otro sitio.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await planningOwner()
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!partirId(id)) return new Response('Video inválido.', { status: 400 })
    const ruta = await portada(id!, url.searchParams.get('f'), url.searchParams.get('yt'))
    if (!ruta) return new Response('Sin portada.', { status: 404 })
    return new Response(new Uint8Array(await readFile(ruta)), { headers: { 'Content-Type': tipoDe(ruta), 'Cache-Control': 'private, max-age=600' } })
  } catch (error) { return planningError(error) }
}
