/**
 * Mapa v16 · la RECETA de una isla desde un archivo del repo (14 nov 2026).
 *
 * Daniel: «facilidad para ti de editar estos lienzos sin tener que reiniciar la app cada vez que hay un cambio». Una isla
 * cuya receta vive en `doc:…/receta.json` se relee cada segundo mientras la página está abierta: con `?hash=` la respuesta
 * es `{ sinCambio: true }` si el archivo no cambió (un `stat`, sin leerlo), y la receta nueva si sí. Levy edita el archivo y
 * la app abierta lo pinta en menos de dos segundos.
 *
 * La misma guarda que `/api/canvas/doc`: lo léxico (`leerLigaDoc`), el disco (symlinks: lo real sigue dentro de la raíz) y
 * las reglas de credenciales de la vista documento. Solo `.json`, hasta 256 KB. La receta se valida en el cliente
 * (islas/receta.ts) para que el error se vea EN la isla.
 */
import { NextResponse } from 'next/server'
import path from 'node:path'
import { readFile, realpath, stat } from 'node:fs/promises'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { raices } from '@/lib/cabina/documento-server'
import { rutaPermitida } from '@/features/cabina/documento/ruta'
import { dentroDeRaiz, leerLigaDoc } from '@/features/canvas/model/doc'
import { tr } from '@/shared/i18n'

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const no = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: NO_CACHE })
const MAX = 256 * 1024

export async function GET(request: Request) {
  if (!await authenticateDraw3(request)) return no(401, tr('no autorizado'))
  const q = new URL(request.url).searchParams
  const pedida = q.get('liga') ?? ''
  const liga = leerLigaDoc(pedida.startsWith('doc:') ? pedida : `doc:${pedida}`)
  if (!liga || !/\.json$/i.test(liga.ruta)) return no(400, tr('La receta debe ser un .json dentro del repo.'))
  const r = raices()
  const raiz = await realpath(r.repo).catch(() => r.repo)
  let real: string
  try { real = await realpath(path.join(raiz, liga.ruta)) } catch { return no(404, tr('Esa receta ya no existe.')) }
  if (!dentroDeRaiz(real, raiz)) return no(403, tr('El enlace apunta fuera de la carpeta de documentos.'))
  if (rutaPermitida(real, { ...r, repo: raiz })) return no(403, tr('Ese archivo no se muestra.'))
  const info = await stat(real).catch(() => null)
  if (!info?.isFile()) return no(404, tr('Esa receta ya no existe.'))
  if (info.size > MAX) return no(413, tr('La receta pasa de 256 KB.'))
  const hash = `${info.size}-${Math.floor(info.mtimeMs)}`
  if (q.get('hash') === hash) return NextResponse.json({ ok: true, sinCambio: true, hash }, { headers: NO_CACHE })
  let receta: unknown
  try { receta = JSON.parse(await readFile(real, 'utf8')) } catch {
    return NextResponse.json({ ok: true, hash, receta: null, error: tr('La receta no es JSON válido (revisa comas y comillas).') }, { headers: NO_CACHE })
  }
  return NextResponse.json({ ok: true, hash, receta }, { headers: NO_CACHE })
}
