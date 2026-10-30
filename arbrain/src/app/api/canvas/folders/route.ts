/**
 * Canvas v4 — carpetas.
 *
 * Sobre la tabla `draw_folders` que ya existe. Una sola ruta con `accion` en el
 * PATCH en vez de tres endpoints: renombrar, mover y borrar comparten
 * autenticacion, cliente y forma de respuesta, y separarlos solo multiplicaria
 * el mismo preambulo.
 *
 * `position` SI se escribe al crear. En el v3 la columna se leia para ordenar y
 * nunca se escribia, asi que el orden dependia de que Postgres devolviera nulls
 * en algun orden — una lista que se reacomoda sola sin que nadie la haya tocado.
 *
 * SUBCARPETAS (3 oct 2026): `parent_id`, el mismo contrato que sfmap
 * (NubePaginas.swift): UN nivel. La regla vive en `state/carpetas.ts` y se
 * valida AQUI tambien, porque la interfaz solo ofrece; quien escribe es esto.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { puedeAnidar, puedeSerMadre, type CarpetaPlana } from '@/features/canvas/state/carpetas'
import { conSubcarpetas } from '@/features/canvas/state/vista-lienzos'
import { conArchivado } from '@/features/canvas/state/organizacion'
import { instalacion } from '@/config'

export const runtime = 'nodejs'
// Dueño de los lienzos: la persona dueña de esta instalación (config/instalacion.ts).
const OWNER = instalacion().idPerfilDueno

type Db = ReturnType<typeof createServiceClient>
async function leerCarpetas(db: Db): Promise<CarpetaPlana[]> {
  const { data, error } = await db.from('draw_folders')
    .select('id, name, position, parent_id, archived_at').eq('user_id', OWNER)
    .order('position', { ascending: true }).order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(f => ({ id: f.id, nombre: f.name, orden: f.position ?? 0, madre: f.parent_id ?? null, archivada: (f.archived_at as string | null) ?? null }))
}

export async function GET(request: Request) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, carpetas: await leerCarpetas(createServiceClient()) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'no se leyeron' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({})) as { nombre?: string; madre?: string | null }
  const db = createServiceClient()
  if (body.madre) {
    const carpetas = await leerCarpetas(db).catch(() => [])
    if (!puedeSerMadre(carpetas, body.madre)) {
      return NextResponse.json({ ok: false, error: 'solo hay un nivel: esa carpeta no puede tener subcarpetas' }, { status: 400 })
    }
  }
  const { data: ultimas } = await db.from('draw_folders')
    .select('position').eq('user_id', OWNER).order('position', { ascending: false }).limit(1)
  const orden = ((ultimas?.[0]?.position as number | null) ?? 0) + 1

  const { data, error } = await db.from('draw_folders')
    .insert({ user_id: OWNER, name: body.nombre?.trim() || 'Carpeta nueva', position: orden, ...(body.madre ? { parent_id: body.madre } : {}) })
    .select('id, name, position, parent_id').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, carpeta: { id: data.id, nombre: data.name, orden: data.position ?? orden, madre: data.parent_id ?? null, archivada: null } })
}

export async function PATCH(request: Request) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const body = await request.json().catch(() => null) as
    { accion?: 'renombrar' | 'borrar' | 'mover' | 'anidar' | 'renombrarPagina' | 'archivar'; id?: string; nombre?: string; paginaId?: string; folderId?: string | null; madre?: string | null; archivar?: boolean } | null
  if (!body?.accion) return NextResponse.json({ ok: false, error: 'falta accion' }, { status: 400 })
  const db = createServiceClient()

  if (body.accion === 'renombrar') {
    if (!body.id || !body.nombre?.trim()) return NextResponse.json({ ok: false, error: 'falta id o nombre' }, { status: 400 })
    const { data, error } = await db.from('draw_folders')
      .update({ name: body.nombre.trim() }).eq('id', body.id).eq('user_id', OWNER).select('id')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  /**
   * ARCHIVAR UNA CARPETA (6 oct 2026): marca `archived_at`, no borra nada. La carpeta y sus subcarpetas se ocultan juntas con
   * todo lo que tienen dentro. Restaurar devuelve también los lienzos de adentro (la carpeta vuelve con su contenido); una
   * subcarpeta cuya madre sigue archivada sale a la raíz al restaurarse, porque si no volvería a quedar oculta.
   */
  if (body.accion === 'archivar') {
    if (!body.id || typeof body.archivar !== 'boolean') return NextResponse.json({ ok: false, error: 'falta id o archivar' }, { status: 400 })
    const carpetas = await leerCarpetas(db).catch(() => [] as CarpetaPlana[])
    const objetivo = carpetas.find(c => c.id === body.id)
    if (!objetivo) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })
    const todas = conSubcarpetas(carpetas, body.id)
    const ahora = new Date().toISOString()
    if (body.archivar) {
      const { error } = await db.from('draw_folders').update({ archived_at: ahora }).in('id', todas).eq('user_id', OWNER)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    const madreArchivada = objetivo.madre ? carpetas.find(c => c.id === objetivo.madre)?.archivada : null
    const { error } = await db.from('draw_folders')
      .update({ archived_at: null, ...(madreArchivada ? { parent_id: null } : {}) }).in('id', todas).eq('user_id', OWNER)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const { data: filas } = await db.from('draw').select('page_id, settings').in('folder_id', todas).eq('is_deleted', false)
    for (const f of filas ?? []) {
      const s = (f.settings && typeof f.settings === 'object' ? f.settings : {}) as Record<string, unknown>
      if (s.archivado) await db.from('draw').update({ settings: conArchivado(s, false) }).eq('page_id', f.page_id)
    }
    return NextResponse.json({ ok: true })
  }

  if (body.accion === 'borrar') {
    if (!body.id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 })
    // Las paginas de adentro SALEN a la raiz antes de borrar la carpeta. Si no,
    // quedan apuntando a una carpeta que ya no existe: invisibles en el arbol y
    // vivas en la tabla. Un lienzo perdido es peor que una carpeta de mas.
    await db.from('draw').update({ folder_id: null }).eq('folder_id', body.id)
    // Y sus SUBCARPETAS suben a la raiz, igual que en sfmap: borrar el
    // contenedor jamas se lleva el contenido.
    await db.from('draw_folders').update({ parent_id: null }).eq('parent_id', body.id).eq('user_id', OWNER)
    const { error } = await db.from('draw_folders').delete().eq('id', body.id).eq('user_id', OWNER)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.accion === 'mover') {
    if (!body.paginaId) return NextResponse.json({ ok: false, error: 'falta paginaId' }, { status: 400 })
    const { data, error } = await db.from('draw')
      .update({ folder_id: body.folderId ?? null, updated_at: new Date().toISOString() })
      .eq('page_id', body.paginaId).select('page_id')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ ok: false, error: 'no existe la pagina' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  if (body.accion === 'anidar') {
    if (!body.id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 })
    const madre = body.madre ?? null
    const motivo = puedeAnidar(await leerCarpetas(db).catch(() => []), body.id, madre)
    if (motivo) return NextResponse.json({ ok: false, error: motivo }, { status: 400 })
    const { data, error } = await db.from('draw_folders')
      .update({ parent_id: madre }).eq('id', body.id).eq('user_id', OWNER).select('id')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  /**
   * RENOMBRAR UNA PAGINA SIN TOCAR SU DOCUMENTO (3 oct 2026).
   *
   * El rail renombraba con el PUT de la pagina, que exige `elements`, y le
   * mandaba los del lienzo ABIERTO: renombrar desde la lista un lienzo que no
   * era el abierto le escribia encima el contenido del otro. Aqui solo cambia
   * el nombre, como hace sfmap.
   */
  if (body.accion === 'renombrarPagina') {
    if (!body.paginaId || !body.nombre?.trim()) return NextResponse.json({ ok: false, error: 'falta paginaId o nombre' }, { status: 400 })
    const { data, error } = await db.from('draw')
      .update({ name: body.nombre.trim(), updated_at: new Date().toISOString() })
      .eq('page_id', body.paginaId).eq('user_id', OWNER).select('page_id')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ ok: false, error: 'no existe la pagina' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'accion desconocida' }, { status: 400 })
}
