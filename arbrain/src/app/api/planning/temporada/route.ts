import { checkMutationOrigin, planningError, planningOwner } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { instalacion } from '@/config'
import { fijarTemporada, sinTemporada, temporadaVigente, type DocTemporada } from '@/features/planning/temporada'
import { dondeTemporada, escribirArchivoTemporada, leerArchivoTemporada, type DondeTemporada } from '@/lib/planning/temporada-store'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

/**
 * La temporada (24 oct 2026): GET devuelve la vigente (`periodo` + `temporadaHabitos`, la forma de `instalacion()`) y de dónde sale;
 * POST `{ accion: 'fijar', periodo, nombre?, arranque? }` o `{ accion: 'quitar' }` escribe el almacén (solo donde hay archivo: la
 * edición del alumno o un archivo forzado). Precedencia y forma: `features/planning/temporada.ts`; dónde vive: `lib/planning/temporada-store.ts`.
 */
const donde = (): DondeTemporada => dondeTemporada({ cliente: esEdicionCliente(), raiz: () => raizWorkspace() })

function respuesta(doc: DocTemporada | null, d: DondeTemporada) {
  const i = instalacion()
  return { ...temporadaVigente(doc, { periodo: i.periodo, temporadaHabitos: i.temporadaHabitos }),
    fuente: doc ? 'archivo' : 'instalacion', editable: d.tipo === 'archivo' }
}

export async function GET() {
  try {
    await planningOwner()
    const d = donde()
    return Response.json(respuesta(d.tipo === 'archivo' ? leerArchivoTemporada(d.ruta) : null, d), { headers })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const d = donde()
    if (d.tipo !== 'archivo') throw new ChatAccessError('En esta instalación la temporada vive en src/config/instalacion.ts.', 409)
    const raw = await request.text()
    if (raw.length > 20_000) throw new ChatAccessError('Demasiado grande.', 413)
    let body: Record<string, unknown>
    try { const b = JSON.parse(raw); if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error(); body = b }
    catch { throw new ChatAccessError('JSON inválido.', 400) }
    const doc = body.accion === 'quitar' ? sinTemporada() : body.accion === 'fijar' ? fijarTemporada(body) : 'Acción inválida: fijar o quitar.'
    if (typeof doc === 'string') throw new ChatAccessError(doc, 400)
    escribirArchivoTemporada(d.ruta, doc)
    return Response.json(respuesta(doc, d), { headers })
  } catch (error) { return planningError(error) }
}
