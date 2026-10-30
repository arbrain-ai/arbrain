import { planningOwner } from '@/lib/planning/server'
import { esEdicionCliente } from '@/lib/edicion'
import { leerDiff, leerDiffArchivo } from '@/features/historia/servidor'
import { raizHistoria } from '@/features/historia/raiz'
import { respuestaError } from '@/features/historia/respuesta'

// Un cambio por dentro (27 oct 2026): GET ?sha=<cambio> da sus archivos por área, con memorias y skills ya legibles;
// GET ?sha=<cambio>&ruta=<archivo> despliega el diff de un archivo de código. Solo lee.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  try {
    await planningOwner()
    if (esEdicionCliente()) return Response.json({ error: 'No disponible en esta edición.' }, { status: 404, headers: NO_CACHE })
    const q = new URL(request.url).searchParams
    const sha = (q.get('sha') ?? '').trim(), ruta = q.get('ruta')
    const raiz = await raizHistoria()
    return Response.json(ruta ? await leerDiffArchivo(raiz, sha, ruta) : await leerDiff(raiz, sha), { headers: NO_CACHE })
  } catch (error) { return respuestaError(error) }
}
