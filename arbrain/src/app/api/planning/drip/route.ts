import { createServiceClient } from '@/lib/supabase/service'
import { checkMutationOrigin, planningError, planningOwner } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { instalacion } from '@/config'
import { aplicarCambioDrip, type DocDrip } from '@/features/planning/drip'
import { docDeValor, dondeDrip, escribirArchivoDrip, leerArchivoDrip, type DondeDrip } from '@/lib/planning/drip-store'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

/**
 * El almacén DRIP del calendario (24 oct 2026): GET lee el documento; POST aplica UN cambio validado (`CambioDrip`:
 * corregir · delegar · tarifa · foto · manana) y devuelve el documento nuevo. Dónde vive: `lib/planning/drip-store.ts`.
 * La tarifa de recompra cae a la de la instalación (`instalacion().recompra`) mientras la persona no fije la suya.
 */
const donde = (): DondeDrip => dondeDrip({ cliente: esEdicionCliente(), raiz: () => raizWorkspace() })

async function leer(d: DondeDrip): Promise<DocDrip> {
  if (d.tipo === 'archivo') return leerArchivoDrip(d.ruta)
  const { data, error } = await createServiceClient().from('app_config').select('value').eq('key', d.clave).maybeSingle()
  if (error) throw new Error('No se pudo leer tu clasificación DRIP.')
  return docDeValor(data?.value)
}

async function guardar(d: DondeDrip, doc: DocDrip) {
  if (d.tipo === 'archivo') { escribirArchivoDrip(d.ruta, doc); return }
  const { error } = await createServiceClient().from('app_config').upsert({ key: d.clave, value: JSON.stringify(doc), updated_at: doc.actualizado }, { onConflict: 'key' })
  if (error) throw new Error('No se pudo guardar. Reintenta.')
}

/** Lo que ve la app: el documento con la tarifa efectiva (la propia o la de la instalación). */
function respuesta(doc: DocDrip, d: DondeDrip) {
  const recompra = instalacion().recompra
  const tarifa = doc.tarifa ?? (recompra && recompra.tarifa > 0 ? { monto: recompra.tarifa, moneda: recompra.moneda } : null)
  return { ...doc, tarifa, tarifaPropia: Boolean(doc.tarifa), almacen: d.tipo === 'archivo' ? 'archivo' : 'servidor' }
}

export async function GET() {
  try {
    await planningOwner()
    const d = donde()
    return Response.json(respuesta(await leer(d), d), { headers })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const raw = await request.text()
    if (raw.length > 120_000) throw new ChatAccessError('Demasiado grande.', 413)
    let body: unknown
    try { body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error() }
    catch { throw new ChatAccessError('JSON inválido.', 400) }
    const d = donde()
    const siguiente = aplicarCambioDrip(await leer(d), body)
    if (typeof siguiente === 'string') throw new ChatAccessError(siguiente, 400)
    await guardar(d, siguiente)
    return Response.json(respuesta(siguiente, d), { headers })
  } catch (error) { return planningError(error) }
}
