/**
 * Lienzo v17 · el archivo de una PIEZA LIBRE (15 nov 2026). Contrato: `docs/builds/lienzo-v17/MOTOR.md`.
 *
 * Daniel: «facilidad para ti de editar estos lienzos sin tener que reiniciar la app cada vez que hay un cambio». Una pieza
 * vive en `doc:…/pieza.html` y el lienzo la relee cada segundo mientras la página está abierta: con `?hash=` la respuesta es
 * `{ sinCambio: true }` si el archivo no cambió (un `stat`, sin leerlo), y el texto nuevo si sí.
 *
 * La misma guarda que las recetas de la v16 (`/api/canvas/receta`): lo léxico (`leerLigaDoc`), el disco (symlinks: lo real
 * sigue dentro de la raíz) y las reglas de credenciales de la vista documento. Solo `.html`, hasta 512 KB. El texto se lee
 * en el cliente (`piezas/formato.ts`) y CORRE en el host aislado (`public/piezas/host.js`), nunca en la app.
 */
import { NextResponse } from 'next/server'
import path from 'node:path'
import { readFile, realpath, stat } from 'node:fs/promises'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { raices } from '@/lib/cabina/documento-server'
import { rutaPermitida } from '@/features/cabina/documento/ruta'
import { dentroDeRaiz, leerLigaDoc } from '@/features/canvas/model/doc'
import { MAX_PIEZA } from '@/features/canvas/piezas/formato'
import { tr } from '@/shared/i18n'

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const no = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: NO_CACHE })

type Lectura = { ok: true; sinCambio: true; hash: string } | { ok: true; hash: string; texto: string; mtime: number } | { ok: false; error: string; status: number }

async function leer(pedida: string, hashPrevio: string | null): Promise<Lectura> {
  const liga = leerLigaDoc(pedida.startsWith('doc:') ? pedida : `doc:${pedida}`)
  if (!liga || !/\.html?$/i.test(liga.ruta)) return { ok: false, status: 400, error: tr('La pieza debe ser un .html dentro del repo.') }
  const r = raices()
  const raiz = await realpath(r.repo).catch(() => r.repo)
  let real: string
  try { real = await realpath(path.join(raiz, liga.ruta)) } catch { return { ok: false, status: 404, error: tr('Esa pieza ya no existe.') } }
  if (!dentroDeRaiz(real, raiz)) return { ok: false, status: 403, error: tr('El enlace apunta fuera de la carpeta de documentos.') }
  if (rutaPermitida(real, { ...r, repo: raiz })) return { ok: false, status: 403, error: tr('Ese archivo no se muestra.') }
  const info = await stat(real).catch(() => null)
  if (!info?.isFile()) return { ok: false, status: 404, error: tr('Esa pieza ya no existe.') }
  if (info.size > MAX_PIEZA) return { ok: false, status: 413, error: tr('La pieza pasa de 512 KB.') }
  const hash = `${info.size}-${Math.floor(info.mtimeMs)}`
  if (hashPrevio === hash) return { ok: true, sinCambio: true, hash }
  const texto = await readFile(real, 'utf8').catch(() => null)
  if (texto === null) return { ok: false, status: 404, error: tr('Esa pieza ya no existe.') }
  return { ok: true, hash, texto, mtime: info.mtimeMs }
}

/**
 * `?liga=<doc:…>&hash=<h>` → una pieza. `?l=<doc:…>|<hash>` repetido → TODAS las de la página en un solo pedido (lo que
 * usa el lienzo cada segundo: un `stat` por archivo y el texto solo del que cambió), `{ ok, piezas: { [liga]: lectura } }`.
 */
export async function GET(request: Request) {
  if (!await authenticateDraw3(request)) return no(401, tr('no autorizado'))
  const q = new URL(request.url).searchParams
  const varias = q.getAll('l').slice(0, 64)
  if (varias.length) {
    const piezas: Record<string, Lectura> = {}
    await Promise.all(varias.map(async par => {
      const i = par.lastIndexOf('|')
      const liga = i >= 0 ? par.slice(0, i) : par, h = i >= 0 ? par.slice(i + 1) : ''
      piezas[liga] = await leer(liga, h || null)
    }))
    return NextResponse.json({ ok: true, piezas }, { headers: NO_CACHE })
  }
  const r = await leer(q.get('liga') ?? '', q.get('hash'))
  if (!r.ok) return no(r.status, r.error)
  return NextResponse.json(r, { headers: NO_CACHE })
}
