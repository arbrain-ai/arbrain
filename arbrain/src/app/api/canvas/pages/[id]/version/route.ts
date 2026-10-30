/**
 * Canvas v4 — la VERSION de una pagina, sin el documento.
 *
 * Es el sensor del sondeo de la pizarra (3 oct 2026). sfmap guarda por REST
 * directo a Supabase y no pasa por el PUT de aqui, asi que no dispara el aviso
 * del canal: la unica forma honesta de enterarse es preguntar. Dos campos y
 * nada mas — pedir `page_elements` para saber si algo cambio costaria megas
 * por cada vuelta (invariante 8 de sfmap).
 *
 * Solo LEE. Mirar no escribe.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateDraw3 } from '@/lib/draw3-auth'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const { id } = await params
  const { data, error } = await createServiceClient().from('draw')
    .select('agent_version, updated_at, is_deleted').eq('page_id', id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })
  return NextResponse.json(
    { ok: true, version: data.agent_version ?? 0, actualizado: data.updated_at, borrada: !!data.is_deleted },
    { headers: { 'Cache-Control': 'no-store' } })
}
