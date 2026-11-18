/**
 * Ajustes › Mejoras en el daemon: los interruptores viven en `<config de Arbrain>/mejoras.json` (o `ARBRAIN_MEJORAS`),
 * junto a panel-ajustes.json, y llegan a todas las ventanas y al teléfono. La app los cambia con
 * `POST /cabina {que:'mejoras'}`; el daemon los lee para lo que hace él solo (la voz de LemonFox).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'
import { esMejora, MEJORAS, normalizarMejoras, type EstadoMejoras, type Mejora } from './mejoras-lista.js'

export { MEJORAS, type Mejora, type EstadoMejoras }

export const ARCHIVO_MEJORAS = () => process.env.ARBRAIN_MEJORAS || path.join(DIR_ARBRAIN(), 'mejoras.json')

export function leerMejoras(archivo: string = ARCHIVO_MEJORAS()): { mejoras: EstadoMejoras; existe: boolean } {
  try { return { mejoras: normalizarMejoras(JSON.parse(readFileSync(archivo, 'utf8'))), existe: true } }
  catch { return { mejoras: normalizarMejoras(null), existe: false } }
}

/** ¿Está prendida? Un archivo ilegible cuenta como de fábrica. */
export function mejoraActiva(id: Mejora, archivo?: string): boolean {
  return leerMejoras(archivo).mejoras[id]
}

export function guardarMejoras(cambio: Partial<Record<Mejora, boolean>>, archivo: string = ARCHIVO_MEJORAS()): EstadoMejoras {
  const mejoras = normalizarMejoras(cambio, leerMejoras(archivo).mejoras)
  mkdirSync(path.dirname(archivo), { recursive: true })
  const tmp = `${archivo}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(mejoras, null, 2)}\n`)
  renameSync(tmp, archivo)
  return mejoras
}

/** Lo que pide la app (`POST /cabina {que:'mejoras', accion: 'leer' | 'guardar', mejoras?}`). */
export function accionMejoras(p: Record<string, unknown>, archivo?: string): { mejoras: EstadoMejoras; existe: boolean } | { error: string; status: number } {
  if (p.accion === 'leer' || p.accion === undefined) return leerMejoras(archivo)
  if (p.accion !== 'guardar') return { error: 'accion debe ser leer o guardar.', status: 400 }
  const m = p.mejoras
  if (!m || typeof m !== 'object' || !Object.keys(m).every(esMejora)) return { error: 'mejoras desconocidas.', status: 400 }
  try { return { mejoras: guardarMejoras(m as Partial<Record<Mejora, boolean>>, archivo), existe: true } }
  catch (e) { return { error: e instanceof Error ? e.message : 'No se pudo guardar.', status: 500 } }
}
