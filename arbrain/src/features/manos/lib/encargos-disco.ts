/**
 * Encargos de las manos en disco (5 nov 2026): leer los `<id>.json` vivos y dejar la orden de la franja en `<id>.detener`.
 *
 * Carpeta: `MANOS_ENCARGOS_DIR` si existe; si no, `<config de Arbrain>/manos/encargos`, la misma que usa el servidor de
 * manos (`server/src/manos/encargar.ts › DIR_ENCARGOS`). En la edición cliente el daemon la fija en
 * `<daemon>/config/manos/encargos` y la web recibe `ARBRAIN_CONFIG_DIR = <daemon>/config`: es la misma.
 *
 * Lectura barata (se sondea cada ~1.5 s mientras un encargo corre): solo los `.json` con nombre de encargo, tocados en
 * los últimos 10 min por mtime. Nunca se arma una ruta con texto libre: el id pasa antes por `ID_ENCARGO`.
 */
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dirConfigArbrain } from '@/lib/rutas-instalacion'
import { ID_ENCARGO, ORDENES, porReciente, resumirEncargo, VENTANA_LECTURA_MS, visible, type EncargoVivo, type OrdenEncargo } from './encargos'

type Env = Record<string, string | undefined>

export function dirEncargos(env: Env = process.env): string {
  return env.MANOS_ENCARGOS_DIR?.trim() || join(dirConfigArbrain(env), 'manos', 'encargos')
}

/** Lee `<dir>/<id>.json` si su nombre y su contenido son de ese encargo. */
function leerArchivo(dir: string, id: string): EncargoVivo | null {
  try {
    const e = resumirEncargo(JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')))
    return e && e.id === id ? e : null
  } catch { return null }
}

/** Un encargo por id (validado), o `null`. */
export function leerEncargo(dir: string, id: string): EncargoVivo | null {
  return ID_ENCARGO.test(id) ? leerArchivo(dir, id) : null
}

/** Los encargos que se pintan ahora (vivos y terminados hace ≤ 15 s), el más reciente primero. Sin carpeta: `[]`. */
export function leerEncargosVivos(dir: string, ahora = Date.now()): EncargoVivo[] {
  let nombres: string[]
  try { nombres = readdirSync(dir) } catch { return [] }
  const lista: EncargoVivo[] = []
  for (const nombre of nombres) {
    // `<id>.json.tmp` (escritura atómica a medias) y `<id>.detener` no terminan en `.json`.
    if (!nombre.endsWith('.json')) continue
    const id = nombre.slice(0, -'.json'.length)
    if (!ID_ENCARGO.test(id)) continue
    let mtime: number
    try {
      const s = statSync(join(dir, nombre))
      if (!s.isFile()) continue
      mtime = s.mtimeMs
    } catch { continue }
    if (ahora - mtime > VENTANA_LECTURA_MS) continue
    const e = leerArchivo(dir, id)
    if (e && visible(e, ahora, mtime)) lista.push(e)
  }
  return lista.sort(porReciente)
}

/** Deja la orden de la franja donde la busca el latido del encargo (`<id>.detener`, 0600, escritura atómica). */
export function escribirOrden(dir: string, id: string, orden: OrdenEncargo): void {
  if (!ID_ENCARGO.test(id)) throw new Error('Encargo inválido.')
  if (!(ORDENES as readonly string[]).includes(orden)) throw new Error('Orden inválida.')
  const ruta = join(dir, `${id}.detener`)
  writeFileSync(`${ruta}.tmp`, orden, { mode: 0o600 })
  renameSync(`${ruta}.tmp`, ruta)
}
