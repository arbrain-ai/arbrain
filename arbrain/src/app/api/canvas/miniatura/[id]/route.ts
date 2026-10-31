/**
 * Miniaturas del lienzo en la edición cliente (30 oct 2026; la del autor sigue en `/api/draw3/[id]/thumbnail`, Supabase).
 *
 *   POST { dataUrl } → guarda `<ARBRAIN_DATA_DIR>/miniaturas/<id>.<ext>` y apunta `draw.thumbnail_url` (base local) a
 *                      `/api/canvas/miniatura/<id>?v=<ahora>`, relativa: se pinta igual desde otro puerto o el teléfono.
 *   GET              → sirve esa imagen, con sesión.
 * Antes la lista de lienzos del alumno se quedaba con el marcador gris para siempre y cada guardado dejaba un 404.
 */
import { NextResponse } from 'next/server'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { esEdicionCliente } from '@/lib/edicion'
import { dirDatosWeb } from '@/lib/rutas-instalacion'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 300 * 1024
const ID = /^[A-Za-z0-9_-]{1,80}$/
const TIPOS: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpeg: 'image/jpeg' }
const no = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } })

const dirMiniaturas = (env: NodeJS.ProcessEnv = process.env) => path.join(dirDatosWeb(env), 'miniaturas')
const urlMiniaturaLocal = (id: string, ahora = Date.now()) => `/api/canvas/miniatura/${id}?v=${ahora}`

async function archivoDe(id: string): Promise<string | null> {
  const nombres = await readdir(dirMiniaturas()).catch(() => [] as string[])
  const n = nombres.find(x => Object.keys(TIPOS).some(ext => x === `${id}.${ext}`))
  return n ? path.join(dirMiniaturas(), n) : null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!esEdicionCliente()) return no(404, 'no existe')
  if (!(await authenticateDraw3(request))) return no(401, 'no autorizado')
  const { id } = await params
  if (!ID.test(id)) return no(400, 'id inválido')
  const body = await request.json().catch(() => null) as { dataUrl?: string } | null
  const m = /^data:image\/(webp|png|jpeg);base64,(.+)$/.exec(body?.dataUrl ?? '')
  if (!m) return no(400, 'dataUrl debe ser una imagen base64 (webp, png o jpeg)')
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.byteLength > MAX_BYTES) return no(413, `miniatura demasiado grande (${bytes.byteLength} bytes, máximo ${MAX_BYTES})`)
  const db = createServiceClient()
  const { data: fila } = await db.from('draw').select('page_id').eq('page_id', id).eq('is_deleted', false).maybeSingle()
  if (!fila) return no(404, 'no existe')
  await mkdir(dirMiniaturas(), { recursive: true })
  const previa = await archivoDe(id)
  if (previa && !previa.endsWith(`.${m[1]}`)) await rm(previa, { force: true })
  await writeFile(path.join(dirMiniaturas(), `${id}.${m[1]}`), bytes)
  const url = urlMiniaturaLocal(id)
  const { error } = await db.from('draw').update({ thumbnail_url: url }).eq('page_id', id).eq('is_deleted', false)
  if (error) return no(500, error.message)
  return NextResponse.json({ ok: true, page_id: id, thumbnail_url: url })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!esEdicionCliente()) return no(404, 'no existe')
  if (!(await authenticateDraw3(request))) return no(401, 'no autorizado')
  const { id } = await params
  if (!ID.test(id)) return no(400, 'id inválido')
  const archivo = await archivoDe(id)
  if (!archivo) return no(404, 'sin miniatura')
  const ext = path.extname(archivo).slice(1)
  return new NextResponse(new Uint8Array(await readFile(archivo)), { headers: { 'Content-Type': TIPOS[ext], 'Cache-Control': 'private, max-age=31536000, immutable' } })
}
