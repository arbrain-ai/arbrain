/**
 * Dónde vive el documento DRIP (`DocDrip`, features/planning/drip.ts): correcciones por serie/título, delegaciones, tarifa de
 * recompra, fotos del plan de cada semana y mañanas aceptadas. UN documento por instalación, que escriben la app, el Levy de la
 * persona y su CLI (`src/lib/planning/drip-cli.ts`):
 *
 *   - Instalación de Daniel: Supabase `app_config`, clave `planning:drip` (el mismo lugar que sus Macs y el teléfono leen).
 *   - Edición del alumno: `<su cerebro>/.claude/plan/drip.json` (ARBRAIN_HOME), un JSON que su Levy puede leer y editar a mano.
 *   - `ARBRAIN_DRIP_ARCHIVO=/ruta/abs.json` fuerza un archivo en cualquier edición (pruebas, QA: nunca el almacén real).
 *
 * Sin `server-only` a propósito: el CLI lo importa desde la terminal. Solo node:fs y node:path.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { DOC_VACIO, normalizarDoc, type DocDrip } from '@/features/planning/drip'

/** La clave en `app_config` (instalación de Daniel). */
export const CLAVE_DRIP = 'planning:drip'
/** La ruta dentro del cerebro del alumno. */
export const RUTA_DRIP_LOCAL = '.claude/plan/drip.json'

export type DondeDrip = { tipo: 'archivo'; ruta: string } | { tipo: 'supabase'; clave: string }

/** Dónde leer y escribir, según la edición y el entorno. `raiz` es el cerebro del alumno (solo se usa en la edición cliente). */
export function dondeDrip(opciones: { cliente: boolean; raiz?: () => string }, env: Record<string, string | undefined> = process.env): DondeDrip {
  const forzado = env.ARBRAIN_DRIP_ARCHIVO?.trim()
  if (forzado) {
    if (!isAbsolute(forzado)) throw new Error('ARBRAIN_DRIP_ARCHIVO debe ser una ruta absoluta.')
    return { tipo: 'archivo', ruta: forzado }
  }
  if (opciones.cliente) {
    if (!opciones.raiz) throw new Error('Falta la raíz del cerebro para el almacén DRIP.')
    return { tipo: 'archivo', ruta: join(opciones.raiz(), RUTA_DRIP_LOCAL) }
  }
  return { tipo: 'supabase', clave: CLAVE_DRIP }
}

export function leerArchivoDrip(ruta: string): DocDrip {
  if (!existsSync(ruta)) return DOC_VACIO
  try { return normalizarDoc(JSON.parse(readFileSync(ruta, 'utf8'))) } catch { return DOC_VACIO }
}

/** Escritura atómica (tmp + rename): una lectura a medias nunca ve un JSON roto. */
export function escribirArchivoDrip(ruta: string, doc: DocDrip) {
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(`${ruta}.tmp`, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  renameSync(`${ruta}.tmp`, ruta)
}

/** El valor de `app_config` (texto JSON) como documento. */
export const docDeValor = (valor: string | null | undefined): DocDrip => {
  if (!valor) return DOC_VACIO
  try { return normalizarDoc(JSON.parse(valor)) } catch { return DOC_VACIO }
}
