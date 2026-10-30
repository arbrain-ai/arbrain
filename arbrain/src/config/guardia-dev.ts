// Guardia de `next dev` en las copias de agentes (28 oct 2026; el porqué completo vive en scripts/dev-agente.mjs).
// next.config.ts la corre en cada proceso que carga la configuración (el `next dev` y su next-server):
//   1. Una copia de la app original que no es el checkout designado (worktree de agente) solo levanta `next dev` por
//      `npm run dev`, que pasa por el semáforo, el tope de memoria y el apagado por inactividad. `npx next dev` crudo
//      se niega con el comando correcto.
//   2. Si el envoltorio muere de golpe (kill -9 al agente), el servidor se apaga solo en segundos en vez de quedar
//      huérfano comiéndose memoria.
// Fuera de macOS, en CI, en Vercel y en la copia del alumno no hace nada.
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'

const FASE_DEV = 'phase-development-server'

const real = (p: string) => {
  try { return realpathSync(p) } catch { return path.resolve(p) }
}

export function esCopiaDeAgente(raiz: string, home = process.env.HOME || ''): boolean {
  return existsSync(path.join(raiz, 'src-tauri/tauri.original.conf.json')) &&
    real(raiz) !== real(path.join(home, 'Developer/artificial-brain/arbrain'))
}

let vigilando = false

export function guardiaDev(fase: string, raiz = process.cwd(), env: NodeJS.ProcessEnv = process.env): void {
  if (fase !== FASE_DEV || process.platform !== 'darwin' || env.CI || env.VERCEL) return
  if (!esCopiaDeAgente(raiz, env.HOME)) return
  if (env.ARBRAIN_DEV_AGENTE !== '1') {
    throw new Error(
      `next dev en una copia de agente (${raiz}) solo por \`npm run dev\` (scripts/dev-agente.mjs): semáforo, tope de memoria ` +
      'y apagado tras 15 min sin uso. Para capturas: `npm run dev -- --capturas <comando>` (recibe ARBRAIN_DEV_URL y apaga al ' +
      'terminar). Regla del 28 oct 2026: dos next dev olvidados de subagentes llevaron el swap del Studio a 38 de 40 GB.',
    )
  }
  const guardian = Number(env.ARBRAIN_DEV_GUARDIAN)
  if (!guardian || vigilando) return
  vigilando = true
  setInterval(() => {
    try { process.kill(guardian, 0) } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') process.exit(0)
    }
  }, 5000).unref()
}
