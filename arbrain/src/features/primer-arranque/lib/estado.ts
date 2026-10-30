/**
 * Estado del primer arranque de la edición cliente (11 oct 2026). Solo servidor.
 * Archivo `<ARBRAIN_DATA_DIR>/primer-arranque.json` (0600): qué textos legales aceptó la persona (versión y fecha),
 * su nombre (opcional, para que Levy la salude) y si terminó. Las llaves NO viven aquí (llavero del sistema), ni el
 * consentimiento del monitoreo (lo guarda el daemon, que es quien envía), ni computer use (config compartida).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dirDatosWeb } from '@/lib/rutas-instalacion'
import { VERSION_TEXTOS } from '../textos/legales'

export interface EstadoPrimerArranque {
  version: 1
  aceptado: { version: string; fecha: string } | null
  nombre: string | null
  completado: string | null
  sesionBienvenida: string | null
}

const VACIO: EstadoPrimerArranque = { version: 1, aceptado: null, nombre: null, completado: null, sesionBienvenida: null }
const ruta = () => join(dirDatosWeb(), 'primer-arranque.json')

export function leerPrimerArranque(): EstadoPrimerArranque {
  try {
    const j = JSON.parse(readFileSync(ruta(), 'utf8'))
    return { ...VACIO, ...(j && typeof j === 'object' ? j : {}), version: 1 }
  } catch { return { ...VACIO } }
}

export function guardarPrimerArranque(cambio: Partial<EstadoPrimerArranque>): EstadoPrimerArranque {
  const actual = { ...leerPrimerArranque(), ...cambio, version: 1 as const }
  const r = ruta(), dir = dirDatosWeb()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = `${r}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(actual, null, 1), { mode: 0o600 })
  try { chmodSync(tmp, 0o600) } catch { /* Windows */ }
  renameSync(tmp, r)
  return actual
}

/** ¿Hace falta mostrar el primer arranque? Sí si no terminó o si los textos legales cambiaron de versión. */
export function faltaPrimerArranque(e = leerPrimerArranque()): boolean {
  return !e.completado || e.aceptado?.version !== VERSION_TEXTOS
}
