/**
 * Canvas v4 — resolver una liga `doc:` (3 oct 2026).
 *
 * El lienzo guarda `doc:ruta/relativa/al/repo` (contrato de sfmap). Esta ruta
 * la convierte en algo que el navegador puede pintar, y SOLO desde la raiz del
 * repo — la misma que usa sfmap (`Enlace.repo`: la carpeta con `CLAUDE.md` y
 * `.claude/`, hoy el checkout del repo):
 *
 *   1. lo lexico (`leerLigaDoc`): fuera `..`, absolutas, esquemas, `~`
 *   2. el DISCO: se resuelven los enlaces simbolicos y lo real tiene que seguir
 *      dentro de la raiz real. Un symlink que apunte a ~/.ssh muere aqui.
 *   3. las reglas de credenciales de la vista documento (`rutaPermitida`)
 *
 * Devuelve la URL firmada del lector de documentos (la de la vista documento
 * del panel): el HTML vive en un iframe sin mismo origen y sus assets solo se
 * sirven desde su carpeta. Nada se copia: el canonico es el archivo del repo.
 */

import { NextResponse } from 'next/server'
import path from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { raices, urlCruda } from '@/lib/cabina/documento-server'
import { rutaPermitida, tipoDocumento } from '@/features/cabina/documento/ruta'
import { dentroDeRaiz, leerLigaDoc } from '@/features/canvas/model/doc'

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const no = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: NO_CACHE })

export async function GET(request: Request) {
  if (!await authenticateDraw3(request)) return no(401, 'no autorizado')
  const pedida = new URL(request.url).searchParams.get('liga') ?? ''
  const liga = leerLigaDoc(pedida.startsWith('doc:') ? pedida : `doc:${pedida}`)
  if (!liga) return no(400, 'Esa liga sale de la carpeta de documentos.')

  const r = raices()
  const raiz = await realpath(r.repo).catch(() => r.repo)
  let real: string
  try { real = await realpath(path.join(raiz, liga.ruta)) } catch { return no(404, 'Ese documento ya no existe.') }
  if (!dentroDeRaiz(real, raiz)) return no(403, 'El enlace apunta fuera de la carpeta de documentos.')
  if (rutaPermitida(real, { ...r, repo: raiz })) return no(403, 'Ese archivo no se muestra.')
  const info = await stat(real).catch(() => null)
  if (!info?.isFile()) return no(404, 'Ese documento ya no existe.')

  const tipo = tipoDocumento(real)
  return NextResponse.json({
    ok: true, ruta: liga.ruta, fragmento: liga.fragmento ?? null, tipo,
    archivo: path.basename(real),
    // El HTML (y la imagen/video) se pintan con su URL firmada; el markdown lo
    // lee la vista documento del panel por su ruta.
    url: tipo === 'html' || tipo === 'imagen' || tipo === 'video' ? urlCruda(real) : null,
    hash: `${info.size}-${info.mtimeMs}`,
  }, { headers: NO_CACHE })
}
