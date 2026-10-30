/**
 * Dónde vive la temporada (`DocTemporada`, features/planning/temporada.ts). UN documento por instalación, que escriben la app, el
 * Levy de la persona y su CLI (`src/lib/planning/temporada-cli.ts`):
 *
 *   - Edición del alumno: `<su cerebro>/.claude/plan/temporada.json` (ARBRAIN_HOME), junto a `calendario.json`, `objetivos.md` y
 *     `drip.json`. Sin archivo, manda la plantilla (sin periodo): la franja invita a armarla con Levy.
 *   - Instalación de Daniel: no hay almacén; manda `src/config/instalacion.ts` (`periodo` y `temporadaHabitos`).
 *   - `ARBRAIN_TEMPORADA_ARCHIVO=/ruta/abs.json` fuerza un archivo en cualquier edición (pruebas, QA: nunca el almacén real).
 *
 * Sin `server-only` a propósito: el CLI lo importa desde la terminal. Solo node:fs y node:path.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { normalizarTemporada, type DocTemporada } from '@/features/planning/temporada'

/** La ruta dentro del cerebro del alumno. */
export const RUTA_TEMPORADA_LOCAL = '.claude/plan/temporada.json'

export type DondeTemporada = { tipo: 'archivo'; ruta: string } | { tipo: 'instalacion' }

/** Dónde leer y escribir, según la edición y el entorno. `raiz` es el cerebro del alumno (solo se usa en la edición cliente). */
export function dondeTemporada(opciones: { cliente: boolean; raiz?: () => string }, env: Record<string, string | undefined> = process.env): DondeTemporada {
  const forzado = env.ARBRAIN_TEMPORADA_ARCHIVO?.trim()
  if (forzado) {
    if (!isAbsolute(forzado)) throw new Error('ARBRAIN_TEMPORADA_ARCHIVO debe ser una ruta absoluta.')
    return { tipo: 'archivo', ruta: forzado }
  }
  if (opciones.cliente) {
    if (!opciones.raiz) throw new Error('Falta la raíz del cerebro para la temporada.')
    return { tipo: 'archivo', ruta: join(opciones.raiz(), RUTA_TEMPORADA_LOCAL) }
  }
  return { tipo: 'instalacion' }
}

/** El documento guardado, o null si no hay archivo (entonces manda la instalación). Un JSON roto cuenta como «sin temporada». */
export function leerArchivoTemporada(ruta: string): DocTemporada | null {
  if (!existsSync(ruta)) return null
  try { return normalizarTemporada(JSON.parse(readFileSync(ruta, 'utf8'))) } catch { return normalizarTemporada(null) }
}

/** Escritura atómica (tmp + rename): una lectura a medias nunca ve un JSON roto. */
export function escribirArchivoTemporada(ruta: string, doc: DocTemporada) {
  mkdirSync(dirname(ruta), { recursive: true })
  const como = 'Tu temporada (Arbrain): el escalón de arriba de temporada → mes → semana → día. La pinta la franja del Calendario y la usa «Hábitos de hoy». Levy la escribe con `npx tsx src/lib/planning/temporada-cli.ts` (desde arbrain/); también la puedes editar a mano.'
  writeFileSync(`${ruta}.tmp`, JSON.stringify({ _como_se_usa: como, ...doc }, null, 2) + '\n', 'utf8')
  renameSync(`${ruta}.tmp`, ruta)
}
