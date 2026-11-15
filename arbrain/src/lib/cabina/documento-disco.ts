/**
 * Vista «documento»: de dónde se lee y cómo se valida una ruta contra el disco (enlaces simbólicos incluidos).
 *
 * Vivía en documento-server.ts, que lleva `server-only` y no se puede importar en las pruebas. Se separó el 12 nov 2026 para
 * que la descarga del visor (descarga-documento.ts) use y pruebe EXACTAMENTE esta validación, la misma que pinta el visor.
 * documento-server.ts la re-exporta: quien la importaba de ahí no cambia.
 */
import { existsSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { resolverRuta, rutaPermitida, tipoDocumento, type Raices, type TipoDocumento } from '@/features/cabina/documento/ruta'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { tr } from '@/shared/i18n'

const CANDIDATAS = [process.env.BUSINESS_OS_ROOT, path.join(homedir(), 'Developer/artificial-brain'), path.join(homedir(), 'Developer/business-os'), path.join(process.cwd(), '..')].filter(Boolean) as string[]
/**
 * El repo vivo (el mismo que lee el Taller): donde Levy escribe, no la copia que sirve la web.
 * Edición cliente: solo el workspace del alumno (`ARBRAIN_HOME`), también como «home»: nada fuera de su cerebro.
 */
export function raices(): Raices {
  if (esEdicionCliente()) { const ws = path.resolve(raizWorkspace()); return { repo: ws, home: ws } }
  const repo = CANDIDATAS.find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? CANDIDATAS[0]
  return { repo: path.resolve(repo), home: homedir() }
}

export class ErrorDocumento extends Error { constructor(msg: string, public status = 400) { super(msg) } }

/** Ruta pedida → ruta real en disco, validada antes y después de seguir enlaces. */
export async function resolverEnDisco(pedida: string, r: Raices = raices()): Promise<{ abs: string; real: string; tipo: TipoDocumento }> {
  const res = resolverRuta(pedida, r)
  if ('error' in res) throw new ErrorDocumento(res.error, 403)
  let real: string
  try { real = await realpath(res.abs) } catch { throw new ErrorDocumento(tr('Ese archivo ya no existe.'), 404) }
  const repoReal = await realpath(r.repo).catch(() => r.repo)
  if (rutaPermitida(real, r) && rutaPermitida(real, { ...r, repo: repoReal })) throw new ErrorDocumento(tr('El enlace apunta fuera de lo permitido.'), 403)
  const info = await stat(real)
  // Una carpeta se abre como entrega (8 oct 2026, visor único).
  if (info.isDirectory()) return { abs: res.abs, real, tipo: 'carpeta' }
  if (!info.isFile()) throw new ErrorDocumento(tr('Eso no es un archivo ni una carpeta.'), 400)
  return { abs: res.abs, real, tipo: tipoDocumento(real) }
}
