import { checkMutationOrigin, planningError, planningOwner } from '@/lib/planning/server'
import { requireChatPrincipal } from '@/lib/chat-access'
import { guardarIdioma, leerIdioma } from '@/lib/idioma-servidor'
import { normalizarIdioma } from '@/shared/i18n/idioma'
import { tr } from '@/shared/i18n/tr'

// Ajustes › Idioma (13 nov 2026): Español o English para toda la instalación (interfaz, fechas, agente y voz).
// GET lo lee cualquiera con sesión; POST { idioma: 'es' | 'en' } lo cambia el dueño. La página se recarga después.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    await requireChatPrincipal()
    return Response.json({ idioma: leerIdioma() }, { headers: NO_CACHE })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as { idioma?: unknown } | null
    if (body?.idioma !== 'es' && body?.idioma !== 'en') return Response.json({ error: tr('El idioma debe ser «es» o «en».') }, { status: 400, headers: NO_CACHE })
    return Response.json({ idioma: guardarIdioma(normalizarIdioma(body.idioma)) }, { headers: NO_CACHE })
  } catch (error) { return planningError(error) }
}
