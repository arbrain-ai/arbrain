/**
 * Qué repo cuenta la historia (27 oct 2026). Nunca una ruta fija a un worktree:
 *  1. `ARBRAIN_HISTORIA_REPO`, si alguien la fija.
 *  2. En desarrollo (`next dev`), el repo donde corre este proceso: `git rev-parse --show-toplevel` desde `cwd`
 *     (en un worktree, ese worktree).
 *  3. En producción, el repo vivo que ya leen el explorador y la vista documento (`raices().repo`): la web del Studio
 *     corre desde la copia de despliegue, que va suelta (HEAD sin rama) y no es donde se guarda el trabajo.
 * Siempre pasa por `rev-parse --show-toplevel`: lo que se devuelve es la raíz real de un repo git.
 */
import path from 'node:path'
import { raices } from '@/lib/cabina/documento-server'
import { dirDespliegue } from '@/lib/actualizacion-web'
import { ErrorHistoria, git } from './servidor'

async function toplevel(dir: string): Promise<string | null> {
  try { return path.resolve((await git(dir, ['rev-parse', '--show-toplevel'], { timeout: 5_000 })).trim()) } catch { return null }
}

export async function raizHistoria(): Promise<string> {
  const candidatas = [
    process.env.ARBRAIN_HISTORIA_REPO,
    process.env.NODE_ENV === 'development' ? process.cwd() : null,
    raices().repo,
    process.cwd(),
  ].filter((x): x is string => !!x)
  for (const c of candidatas) { const t = await toplevel(c); if (t) return t }
  throw new ErrorHistoria('No encontré el repo de tu cerebro en esta computadora.', 503)
}

/** La copia que sirve la app web en el Studio (la misma de «Reiniciar»), si existe. */
export const copiaDespliegue = () => dirDespliegue()
