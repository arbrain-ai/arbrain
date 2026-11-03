/**
 * Marcadores vacíos del aislamiento de Claude Code en Linux (1 nov 2026, VPS de pruebas del modo servidor).
 *
 * En Linux, el sandbox de Claude Code (bubblewrap) protege contra escritura una lista de archivos peligrosos dentro de la
 * carpeta donde deja escribir (la raíz de tu Arbrain): `.env*`, `.npmrc`, `.gitmodules`, `package.json`,
 * `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`… Si no existen, crea uno VACÍO (0 bytes) en su lugar para montarle
 * encima una copia de solo lectura, y los anota en `.git/info/exclude`. En la demo del VPS aparecieron el 30 oct a las
 * 07:40, con el primer turno del chat.
 *
 * Para `next build` esos vacíos no son inocentes: un `package-lock.json` o un `pnpm-lock.yaml` en la raíz hacen que Next
 * tome esa carpeta como la raíz del proyecto y deje `server.js` en `.next/standalone/arbrain/` («La compilación no dejó
 * .next/standalone/server.js»), y el `package.json` vacío rompe la resolución de módulos de webpack («Module not found:
 * …/package.json (directory description file): No file content»). Con el programa ya compilado de una versión publicada
 * no se notaba; se notó al compilar en el servidor (la copia de main, 1 nov: el servicio reintentando sin fin).
 *
 * Mientras se compila, los marcadores VACÍOS de la raíz se apartan y al terminar vuelven a su lugar (el sandbox los
 * espera ahí). Un archivo con contenido nunca se toca: ese es de la persona. next.config.ts además fija la raíz del
 * rastreo en arbrain/ (outputFileTracingRoot).
 */
import { existsSync, lstatSync, mkdirSync, renameSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'

/** Los que Next o webpack leen al compilar: manifiestos y bloqueos de paquetes de la raíz. */
export const MARCADORES = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']

/**
 * Aparta los marcadores vacíos de `raiz` a `aparte` (carpeta que se crea si hace falta). Devuelve
 * `{ apartados, devolver }`: `devolver()` los regresa a su lugar (si ahí no apareció otro archivo mientras tanto).
 */
export function apartarMarcadoresVacios(raiz, aparte) {
  const apartados = []
  for (const nombre of MARCADORES) {
    const ruta = join(raiz, nombre)
    let st = null
    try { st = lstatSync(ruta) } catch { continue }
    if (!st.isFile() || st.size !== 0) continue
    mkdirSync(aparte, { recursive: true, mode: 0o700 })
    renameSync(ruta, join(aparte, nombre))
    apartados.push(nombre)
  }
  const devolver = () => {
    for (const nombre of apartados) {
      const ruta = join(raiz, nombre)
      try { if (!existsSync(ruta)) renameSync(join(aparte, nombre), ruta) } catch { /* el sandbox lo vuelve a crear */ }
    }
    // La carpeta de paso se va si quedó vacía (QA 1 nov 2026: en la demo quedaba una `marcadores-apartados-<pid>` vacía
    // por cada compilación). Si algo no pudo volver, se queda ahí para no perderlo.
    try { rmdirSync(aparte) } catch { /* no existe o no está vacía */ }
  }
  return { apartados, devolver }
}
