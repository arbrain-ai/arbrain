import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { esEdicionCliente } from '@/lib/edicion'
import { dirDatosWeb } from '@/lib/rutas-instalacion'
import { puedeRegistrar } from './rueda-vigia'

/**
 * Log local del detector de la rueda (19 oct 2026, lib/rueda-vigia.ts). Lo escribe el servidor web (el Studio sirve a la
 * app de escritorio, a la MacBook y al teléfono), junto a desktop-ipc.log: se lee sin devtools ni base de datos.
 * Una línea JSON por atasco. Antirrebote también aquí: varias ventanas abiertas no suman más de un registro cada 30 s.
 */
export const ARCHIVO_LOG_RUEDA = 'hilo-rueda.jsonl'

export function dirLogs(env: NodeJS.ProcessEnv = process.env): string {
  return esEdicionCliente(env) ? path.join(dirDatosWeb(env), 'logs') : path.join(homedir(), 'Library', 'Logs', 'Arbrain')
}

/** La línea del log. Pura, para el test. Acotada: un detalle enorme no infla el archivo. */
export function lineaLogRueda(r: { sesion?: string | null; detalle?: unknown }, ahora: Date, equipo: string): string {
  const linea = JSON.stringify({ en: ahora.toISOString(), sesion: r.sesion ?? null, equipo: equipo.slice(0, 200), detalle: r.detalle ?? null })
  return (linea.length > 8000 ? JSON.stringify({ en: ahora.toISOString(), sesion: r.sesion ?? null, recortado: linea.slice(0, 7800) }) : linea) + '\n'
}

let ultimo = 0

/** ¿Se acepta este registro? Uno cada 30 s por proceso del servidor. `ahora` inyectable para el test. */
export function aceptarRueda(ahora = Date.now()): boolean {
  if (!puedeRegistrar(ultimo, ahora)) return false
  ultimo = ahora
  return true
}

export async function escribirLogRueda(r: { sesion?: string | null; detalle?: unknown }, equipo: string): Promise<void> {
  try {
    const dir = dirLogs()
    await mkdir(dir, { recursive: true })
    await appendFile(path.join(dir, ARCHIVO_LOG_RUEDA), lineaLogRueda(r, new Date(), equipo))
  } catch { /* telemetría: nunca falla la petición */ }
}
