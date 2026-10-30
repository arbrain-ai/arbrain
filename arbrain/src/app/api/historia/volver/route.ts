import { checkMutationOrigin, planningOwner } from '@/lib/planning/server'
import { esEdicionCliente } from '@/lib/edicion'
import { hacerVolver, previaVolver } from '@/features/historia/servidor'
import { raizHistoria } from '@/features/historia/raiz'
import { respuestaError } from '@/features/historia/respuesta'

// Volver a como estaba (27 oct 2026). POST { sha, rutas?, confirmar? }:
//  · sin `confirmar`: la vista previa (qué archivos regresan y cómo quedarían). No escribe nada.
//  · con `confirmar: true`: crea un commit NUEVO «Volver: …» con esos archivos como estaban antes del cambio. Nunca reset,
//    force ni checkout de rama; solo memoria y skills; rechaza si un archivo tiene cambios sin guardar. Se deshace con otro
//    «Volver» sobre el commit nuevo.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    if (esEdicionCliente()) return Response.json({ error: 'No disponible en esta edición.' }, { status: 404, headers: NO_CACHE })
    const body = await request.json().catch(() => null) as { sha?: unknown; rutas?: unknown; confirmar?: unknown } | null
    const sha = typeof body?.sha === 'string' ? body.sha.trim() : ''
    const rutas = Array.isArray(body?.rutas) ? body.rutas.filter((x): x is string => typeof x === 'string') : undefined
    const raiz = await raizHistoria()
    if (body?.confirmar === true) return Response.json({ ok: true, ...(await hacerVolver(raiz, sha, rutas)) }, { headers: NO_CACHE })
    return Response.json(await previaVolver(raiz, sha, rutas), { headers: NO_CACHE })
  } catch (error) { return respuestaError(error) }
}
