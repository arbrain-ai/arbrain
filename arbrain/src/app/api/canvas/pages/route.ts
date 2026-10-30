/**
 * Canvas v4 — listar y crear paginas.
 *
 * Vive sobre la MISMA tabla `draw` que el v3, de forma ADITIVA: el documento
 * del v4 entra en `page_elements` con `schemaVersion: 4`. La tabla no se toca,
 * no se dropea, y el v3 sigue leyendo lo suyo.
 *
 * TODO pasa por el servidor con la llave de servicio, nunca por el cliente con
 * RLS. Ese es el hecho #26 del libro de plataforma, y costo dos dias de
 * "Guardado" mentiroso descubrirlo: un UPDATE sin sesion matchea CERO filas,
 * NO devuelve error, y el cliente limpia su bandera de sucio. Aqui cero filas
 * es un error explicito, siempre.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateDraw3 } from '@/lib/draw3-auth'

export const runtime = 'nodejs'

/** El perfil de Daniel. Las filas de `draw` se filtran y escriben con este id. */
// Dueño de los lienzos: la persona dueña de esta instalación (config/instalacion.ts).
const OWNER = instalacion().idPerfilDueno

/** Solo lo que el v4 entiende. Una pagina del v3 se abre vacia, no rota. */
import { SCHEMA_V4 } from '@/features/canvas/model/schema'
import { leerOrganizacion } from '@/features/canvas/state/organizacion'
import { urlPublicaDeStorage } from '@/features/chat/lib/adjuntos'
import { instalacion } from '@/config'

export async function GET(request: Request) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const db = createServiceClient()
  const { data, error } = await db.from('draw')
    .select('page_id, name, folder_id, updated_at, created_at, agent_version, page_elements, settings, thumbnail_url')
    .eq('user_id', OWNER).eq('is_deleted', false)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // El conteo se deriva aqui y no se guarda: un contador guardado se
  // desincroniza del contenido en cuanto un camino de escritura lo olvida.
  const paginas = (data ?? []).map(r => {
    const doc = r.page_elements as { schemaVersion?: number; elements?: unknown[] } | null
    return {
      id: r.page_id, nombre: r.name ?? 'Sin título', folderId: r.folder_id,
      actualizado: r.updated_at, creado: r.created_at, version: r.agent_version ?? 0,
      elementos: Array.isArray(doc?.elements) ? doc.elements.length : 0,
      esV4: doc?.schemaVersion === SCHEMA_V4,
      miniatura: urlPublicaDeStorage((r.thumbnail_url as string | null) ?? undefined) ?? null,
      ...leerOrganizacion(r.settings),
    }
  })
  return NextResponse.json({ ok: true, paginas })
}

export async function POST(request: Request) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({})) as { nombre?: string; folderId?: string | null; duplicarDe?: string }
  const db = createServiceClient()
  // DUPLICAR (6 oct 2026): copia el documento tal cual en un lienzo nuevo, en la misma carpeta. Sin settings: la copia
  // no hereda fijado ni archivado, y sin regiones gobernadas (la copia es un lienzo de mano, no un diagrama del compilador).
  if (body.duplicarDe) {
    const { data: o, error: eo } = await db.from('draw').select('name, folder_id, page_elements').eq('page_id', body.duplicarDe).eq('is_deleted', false).maybeSingle()
    if (eo) return NextResponse.json({ ok: false, error: eo.message }, { status: 500 })
    if (!o) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })
    const doc = o.page_elements as { schemaVersion?: number; elements?: unknown[]; camera?: unknown } | null
    const { data, error } = await db.from('draw').insert({
      user_id: OWNER, name: `${o.name ?? 'Sin título'} (copia)`, folder_id: o.folder_id,
      page_elements: { ...(doc ?? {}), regions: undefined }, agent_version: 1, is_deleted: false,
    }).select('page_id, name, folder_id, updated_at, created_at').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const elementos = Array.isArray(doc?.elements) ? doc.elements.length : 0
    return NextResponse.json({ ok: true, pagina: {
      id: data.page_id, nombre: data.name, folderId: data.folder_id, actualizado: data.updated_at, creado: data.created_at,
      version: 1, elementos, esV4: doc?.schemaVersion === SCHEMA_V4, miniatura: null, fijado: null, archivado: null,
    } })
  }
  const { data, error } = await db.from('draw').insert({
    user_id: OWNER,
    name: body.nombre?.trim() || 'Lienzo nuevo',
    folder_id: body.folderId ?? null,
    page_elements: { schemaVersion: SCHEMA_V4, elements: [], camera: { x: 0, y: 0, zoom: 1 } },
    agent_version: 1,
    is_deleted: false,
  }).select('page_id, name, folder_id, updated_at').single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pagina: {
    id: data.page_id, nombre: data.name, folderId: data.folder_id,
    actualizado: data.updated_at, version: 1, elementos: 0, esV4: true, miniatura: null, fijado: null, archivado: null,
  } })
}
