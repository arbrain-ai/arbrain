import { createServiceClient } from '@/lib/supabase/service'
import { checkMutationOrigin, planningError, planningOwner } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { instalacion } from '@/config'
import { aplicarCambioZonas, zonasEfectivas, type DocZonas } from '@/features/planning/zonas'
import { dondeZonas, escribirArchivoZonas, leerArchivoZonas, zonasDeValor, type DondeZonas } from '@/lib/planning/zonas-store'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

/**
 * Zonas de mi vida (28 oct 2026): GET devuelve las zonas efectivas (las de fábrica de `instalacion().camposFondo` con los ajustes de
 * la persona encima); POST aplica UN cambio validado (`CambioZonas`: zona · restablecer) y devuelve lo nuevo. Dónde vive:
 * `lib/planning/zonas-store.ts`.
 */
const donde = (): DondeZonas => dondeZonas({ cliente: esEdicionCliente(), raiz: () => raizWorkspace() })

async function leer(d: DondeZonas): Promise<DocZonas> {
  if (d.tipo === 'archivo') return leerArchivoZonas(d.ruta)
  const { data, error } = await createServiceClient().from('app_config').select('value').eq('key', d.clave).maybeSingle()
  if (error) throw new Error('No se pudieron leer tus zonas.')
  return zonasDeValor(data?.value)
}

async function guardar(d: DondeZonas, doc: DocZonas) {
  if (d.tipo === 'archivo') { escribirArchivoZonas(d.ruta, doc); return }
  const { error } = await createServiceClient().from('app_config').upsert({ key: d.clave, value: JSON.stringify(doc), updated_at: doc.actualizado }, { onConflict: 'key' })
  if (error) throw new Error('No se guardó. Reintenta.')
}

const respuesta = (doc: DocZonas, d: DondeZonas) => ({ ...doc, efectivas: zonasEfectivas(instalacion().camposFondo, doc), almacen: d.tipo === 'archivo' ? 'archivo' : 'servidor' })

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
    if (raw.length > 20_000) throw new ChatAccessError('Demasiado grande.', 413)
    let body: unknown
    try { body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error() }
    catch { throw new ChatAccessError('JSON inválido.', 400) }
    const d = donde()
    const siguiente = aplicarCambioZonas(await leer(d), body, instalacion().camposFondo)
    if (typeof siguiente === 'string') throw new ChatAccessError(siguiente, 400)
    await guardar(d, siguiente)
    return Response.json(respuesta(siguiente, d), { headers })
  } catch (error) { return planningError(error) }
}
