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
/** El archivo que lee esta web (GET /api/primer-arranque lo devuelve: dice en qué carpeta de datos busca). */
export const rutaPrimerArranque = ruta

/**
 * El archivo existe pero no se pudo leer o no es JSON (29 oct 2026, un fundador en Windows: antes este error se tragaba
 * como «primera vez» y la bienvenida volvía en bucle a quien ya la había completado). Se registra en el log de la web
 * (su salida va a `<datos>/logs/web.log`) y quien llama decide: la API responde 503 con el motivo y el shell no manda a
 * la bienvenida.
 */
export class PrimerArranqueIlegible extends Error {
  constructor(readonly ruta: string, readonly causa: string) {
    super(`No pude leer el estado de tu bienvenida (${ruta}): ${causa}`)
    this.name = 'PrimerArranqueIlegible'
  }
}

/** Solo «no existe» es primera vez; cualquier otro fallo lanza `PrimerArranqueIlegible` (o `ConfiguracionFaltante`). */
export function leerPrimerArranque(): EstadoPrimerArranque {
  const r = ruta()
  let texto: string
  try {
    texto = readFileSync(r, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return { ...VACIO }
    throw ilegible(r, e)
  }
  let j: unknown
  // Sin BOM: un editor de Windows (PowerShell 5, Bloc de notas) lo antepone y JSON.parse lo rechaza.
  try { j = JSON.parse(texto.replace(/^\uFEFF/, '')) } catch (e) { throw ilegible(r, e) }
  return { ...VACIO, ...(j && typeof j === 'object' ? j : {}), version: 1 }
}

function ilegible(r: string, e: unknown): PrimerArranqueIlegible {
  const err = e as NodeJS.ErrnoException
  const causa = [err?.code, err instanceof Error ? err.message : String(e)].filter(Boolean).join(' ')
  const x = new PrimerArranqueIlegible(r, causa)
  console.error(`[primer-arranque] ${x.message}`)
  return x
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

/** ¿Hace falta mostrar el primer arranque? Sí si no terminó o si los textos legales cambiaron de versión. Lanza si no se pudo leer. */
export function faltaPrimerArranque(e = leerPrimerArranque()): boolean {
  return !e.completado || e.aceptado?.version !== VERSION_TEXTOS
}

/**
 * Para el shell y la página de bienvenida: ¿mandar a la bienvenida? Sin carpeta de datos (`ConfiguracionFaltante`), sí:
 * la bienvenida lo explica al guardar. Con el archivo ilegible, no: quien lo tiene ya pasó por ahí, y volver a la
 * bienvenida es justo el bucle; el motivo queda en web.log y en GET /api/primer-arranque (503).
 */
export function irABienvenida(): boolean {
  try { return faltaPrimerArranque() } catch (e) { return !(e instanceof PrimerArranqueIlegible) }
}
