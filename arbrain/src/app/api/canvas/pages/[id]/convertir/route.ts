/**
 * Canvas v4 — convertir una pagina del canvas anterior, de verdad.
 *
 * Es el UNICO camino que escribe. Leer una pagina del v3 la convierte en
 * memoria y no toca la fila; esto la persiste, y solo corre cuando Daniel lo
 * pide.
 *
 * ⚠️ NO HAY VUELTA ATRAS AUTOMATICA, asi que la fila original se guarda entera
 * bajo `v3Original` dentro del mismo JSON antes de sobrescribirla. Ocupa lo
 * mismo que ocupaba y es la diferencia entre "convertimos" y "convertimos y si
 * sale mal lo perdiste". Una migracion sin copia es una apuesta.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { migrarDesdeV3 } from '@/features/canvas/model/migrar-v3'
import { SCHEMA_V4 } from '@/features/canvas/model/schema'

export const runtime = 'nodejs'
interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const { id } = await params
  const db = createServiceClient()
  const { data: fila } = await db.from('draw')
    .select('page_elements, agent_version').eq('page_id', id).maybeSingle()
  if (!fila) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })

  const doc = fila.page_elements as {
    schemaVersion?: number; elements?: unknown[]; camera?: unknown; v3Original?: unknown
  } | null
  if (doc?.schemaVersion === SCHEMA_V4) {
    return NextResponse.json({ ok: false, error: 'esta pagina ya es del v4' }, { status: 409 })
  }

  const { elements, informe } = migrarDesdeV3(doc?.elements ?? [])
  const cam = doc?.camera as { x?: number; y?: number; scale?: number; zoom?: number } | null
  const siguiente = (fila.agent_version ?? 0) + 1

  const { data: escrito, error } = await db.from('draw').update({
    page_elements: {
      schemaVersion: SCHEMA_V4,
      elements,
      camera: cam ? { x: cam.x ?? 0, y: cam.y ?? 0, zoom: cam.scale ?? cam.zoom ?? 1 } : null,
      // La copia de seguridad, dentro del mismo JSON. Si algo salio mal, el
      // original sigue completo y se puede volver a leer.
      v3Original: doc,
    },
    agent_version: siguiente,
    updated_at: new Date().toISOString(),
  }).eq('page_id', id).select('page_id')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!escrito?.length) return NextResponse.json({ ok: false, error: 'no se escribio ninguna fila' }, { status: 404 })

  return NextResponse.json({ ok: true, version: siguiente, informe, elementos: elements.length })
}
