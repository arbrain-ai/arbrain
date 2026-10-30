/**
 * Dónde viven las Zonas de mi vida de la persona (`DocZonas`, features/planning/zonas.ts): lo que encendió, apagó, recoloreó o movió
 * en el engrane del calendario. El mismo patrón que el almacén DRIP (`drip-store.ts`):
 *
 *   - Instalación de Daniel: Supabase `app_config`, clave `planning:zonas` (lo leen sus Macs y el teléfono).
 *   - Edición del alumno: `<su cerebro>/.claude/plan/zonas.json` (ARBRAIN_HOME), un JSON que su Levy puede leer y editar.
 *   - `ARBRAIN_ZONAS_ARCHIVO=/ruta/abs.json` fuerza un archivo en cualquier edición (pruebas, QA: nunca el almacén real).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { DOC_ZONAS_VACIO, normalizarZonas, type DocZonas } from '@/features/planning/zonas'

export const CLAVE_ZONAS = 'planning:zonas'
export const RUTA_ZONAS_LOCAL = '.claude/plan/zonas.json'

export type DondeZonas = { tipo: 'archivo'; ruta: string } | { tipo: 'supabase'; clave: string }

export function dondeZonas(opciones: { cliente: boolean; raiz?: () => string }, env: Record<string, string | undefined> = process.env): DondeZonas {
  const forzado = env.ARBRAIN_ZONAS_ARCHIVO?.trim()
  if (forzado) {
    if (!isAbsolute(forzado)) throw new Error('ARBRAIN_ZONAS_ARCHIVO debe ser una ruta absoluta.')
    return { tipo: 'archivo', ruta: forzado }
  }
  if (opciones.cliente) {
    if (!opciones.raiz) throw new Error('Falta la raíz del cerebro para las zonas.')
    return { tipo: 'archivo', ruta: join(opciones.raiz(), RUTA_ZONAS_LOCAL) }
  }
  return { tipo: 'supabase', clave: CLAVE_ZONAS }
}

export function leerArchivoZonas(ruta: string): DocZonas {
  if (!existsSync(ruta)) return DOC_ZONAS_VACIO
  try { return normalizarZonas(JSON.parse(readFileSync(ruta, 'utf8'))) } catch { return DOC_ZONAS_VACIO }
}

/** Escritura atómica (tmp + rename). */
export function escribirArchivoZonas(ruta: string, doc: DocZonas) {
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(`${ruta}.tmp`, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  renameSync(`${ruta}.tmp`, ruta)
}

export const zonasDeValor = (valor: string | null | undefined): DocZonas => {
  if (!valor) return DOC_ZONAS_VACIO
  try { return normalizarZonas(JSON.parse(valor)) } catch { return DOC_ZONAS_VACIO }
}
