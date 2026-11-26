import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { ficha, raiz } from '@/features/editor/galeria/servidor'
import { escribirBorrador } from '@/features/editor/galeria/lector'
import { partirId } from '@/features/editor/galeria/modelo'

// La ficha de un video. GET ?id= la lee (y refleja lo que el dueño respondió en la bandeja). POST { id, revision, post }
// guarda el borrador del post en su publish.json: editar retira la aprobación. Nada se publica desde aquí.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  try {
    await planningOwner()
    const id = new URL(request.url).searchParams.get('id')
    if (!partirId(id)) return Response.json({ error: 'Video inválido.' }, { status: 400, headers: H })
    const f = await ficha(request, id!)
    return f ? Response.json(f, { headers: H }) : Response.json({ error: 'No encontré ese video.' }, { status: 404, headers: H })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const b = await request.json().catch(() => null) as { id?: unknown; revision?: unknown; post?: unknown } | null
    const R = raiz()
    if (!R || !b || !partirId(b.id) || typeof b.post !== 'string') return Response.json({ error: 'Cambio inválido.' }, { status: 400, headers: H })
    try {
      const r = await escribirBorrador(R, String(b.id), b.post, typeof b.revision === 'string' ? b.revision : null)
      return Response.json(r, { headers: H })
    } catch (e) { return Response.json({ error: (e as Error).message }, { status: 409, headers: H }) }
  } catch (error) { return planningError(error) }
}
