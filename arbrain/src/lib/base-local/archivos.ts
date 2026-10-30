/**
 * Almacén de la base local en archivos JSON (edición cliente, 11 oct 2026).
 *
 * Una tabla = un archivo `<datos>/base/<tabla>.json` (arreglo de filas). Escritura atómica (tmp + rename), carpeta
 * 0700 y archivos 0600. Lectura con caché en memoria invalidada por mtime+tamaño, así varias copias del módulo en el
 * mismo proceso (Next empaqueta rutas por separado) nunca leen datos viejos.
 *
 * Carpeta: `<ARBRAIN_DATA_DIR>/base` (la de la web, `<datos>/web`) (la fija la app de escritorio). Sin `ARBRAIN_DATA_DIR` falla con un error
 * claro: nunca cae a `~/.config/arbrain`, que en esta Mac puede ser la del autor.
 *
 * Permisos (red team 2, I9): al primer uso se FUERZAN, no solo al crear. `<datos>/web` y `base/` quedan 0700 y cada
 * tabla 0600 aunque ya existieran más abiertas (una versión anterior, otra herramienta o un umask laxo). En Windows no
 * hay modos POSIX: ahí manda la ACL de la carpeta de datos del usuario.
 */
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { dirDatosWeb } from '@/lib/rutas-instalacion'
import type { Almacen, Fila } from './consulta'

const POSIX = process.platform !== 'win32'

/**
 * Una tabla que existe pero no se puede leer (JSON roto, sin permiso, disco con errores). Resiliencia (12 oct 2026):
 * antes se leía como tabla VACÍA y la siguiente escritura la pisaba, así un archivo dañado borraba todas las
 * conversaciones del alumno sin aviso. Ahora se intenta la copia anterior (`<tabla>.json.bak`) y, si tampoco sirve,
 * se lanza esto: nadie escribe sobre lo que no pudo leer y la persona recibe un 503 que dice qué pasa.
 */
export class BaseLocalDanada extends Error {
  readonly code = 'LOCAL_DANADA'
  constructor(readonly tabla: string, detalle: string) {
    super(`La base local de Arbrain está dañada (${tabla}): ${detalle}. Tus datos no se tocaron. Reinicia Arbrain; si sigue igual, escríbenos.`)
    this.name = 'BaseLocalDanada'
  }
}

/** Lee un arreglo de filas o explica por qué no. ENOENT = la tabla no existe todavía (vacía de verdad). */
function leerFilas(p: string): { filas: Fila[] } | { falta: true } | { error: string } {
  let texto: string
  try { texto = readFileSync(p, 'utf8') } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return code === 'ENOENT' ? { falta: true } : { error: code ?? (e instanceof Error ? e.message : 'no se pudo leer') }
  }
  try {
    const crudo = JSON.parse(texto)
    return Array.isArray(crudo) ? { filas: crudo } : { error: 'el archivo no contiene filas' }
  } catch { return { error: 'el archivo no es JSON válido' } }
}

/** Deja `dir` en 0700 y sus `.json` en 0600 si existen y están más abiertos. Nunca lanza. */
export function privatizar(dirs: string[], tablas?: string): void {
  if (!POSIX) return
  for (const d of dirs) {
    try { if ((statSync(d).mode & 0o777) !== 0o700) chmodSync(d, 0o700) } catch { /* no existe todavía */ }
  }
  if (!tablas) return
  let nombres: string[] = []
  try { nombres = readdirSync(tablas) } catch { return }
  for (const n of nombres) {
    if (!n.endsWith('.json')) continue
    const p = join(tablas, n)
    try { if ((statSync(p).mode & 0o777) !== 0o600) chmodSync(p, 0o600) } catch { /* se fue entre lecturas */ }
  }
}

/**
 * `carpeta` explícita (pruebas): se privatiza solo ella. Sin argumento: `<ARBRAIN_DATA_DIR>/base`, y se privatiza
 * también `<ARBRAIN_DATA_DIR>` (la carpeta de datos de la web).
 */
export function almacenArchivos(carpetaPropia?: string): Almacen {
  const raiz = carpetaPropia ? null : dirDatosWeb()
  const carpeta = carpetaPropia ?? join(raiz as string, 'base')
  const privadas = raiz ? [raiz, carpeta] : [carpeta]
  const cache = new Map<string, { firma: string; filas: Fila[] }>()
  const ruta = (t: string) => join(carpeta, `${t}.json`)
  const firma = (p: string) => {
    try { const s = statSync(p); return `${s.mtimeMs}:${s.size}` } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'nada'
      throw new BaseLocalDanada(basename(p, '.json'), (e as NodeJS.ErrnoException).code ?? 'no se pudo consultar el archivo')
    }
  }
  /** Tablas cuyo archivo principal está dañado y se leyeron de la copia: su `.bak` no se renueva con lo dañado. */
  const danadas = new Set<string>()
  let revisado = false
  /** Una vez por almacén: permisos de lo que ya exista (también al solo leer). */
  const revisar = () => {
    if (revisado) return
    revisado = true
    privatizar(privadas, carpeta)
  }
  const asegurar = () => {
    if (!existsSync(carpeta)) {
      mkdirSync(carpeta, { recursive: true, mode: 0o700 })
      privatizar(privadas)
    }
    revisar()
  }
  return {
    escribible: true,
    nuevoId: () => randomUUID(),
    leer(tabla) {
      revisar()
      const p = ruta(tabla)
      const f = firma(p)
      const hit = cache.get(tabla)
      if (hit && hit.firma === f) return hit.filas
      let filas: Fila[] = []
      if (f !== 'nada') {
        const principal = leerFilas(p)
        if ('filas' in principal) { filas = principal.filas; danadas.delete(tabla) }
        else if ('falta' in principal) filas = []
        else {
          // Dañada: la copia anterior manda (pierde a lo sumo la última escritura). Sin copia útil, error y nada se pisa.
          const copia = leerFilas(`${p}.bak`)
          if (!('filas' in copia)) throw new BaseLocalDanada(tabla, principal.error)
          console.error(`[base-local] ${tabla}: ${principal.error}; se usa la copia anterior (${copia.filas.length} filas)`)
          danadas.add(tabla)
          filas = copia.filas
        }
      }
      cache.set(tabla, { firma: f, filas })
      return filas
    },
    escribir(tabla, filas) {
      asegurar()
      const p = ruta(tabla)
      const tmp = `${p}.${process.pid}.${Date.now().toString(36)}.tmp`
      writeFileSync(tmp, JSON.stringify(filas), { mode: 0o600 })
      try { chmodSync(tmp, 0o600) } catch { /* Windows: sin modos POSIX */ }
      // Copia anterior: un enlace duro al contenido que se va a reemplazar (no copia bytes). Si el principal está
      // dañado, la copia buena se conserva tal cual.
      if (!danadas.has(tabla) && existsSync(p)) {
        const bak = `${p}.bak`
        try { unlinkSync(bak) } catch { /* no había */ }
        try { linkSync(p, bak) } catch { try { copyFileSync(p, bak) } catch { /* sin copia: no impide escribir */ } }
      }
      renameSync(tmp, p)
      danadas.delete(tabla)
      cache.set(tabla, { firma: firma(p), filas })
    },
  }
}

let compartido: Almacen | null = null
const real = () => (compartido ??= almacenArchivos())

/**
 * El almacén de esta instalación (uno por proceso). Perezoso: la carpeta se resuelve al primer uso, así crear el
 * cliente para comprobar la sesión no exige `ARBRAIN_DATA_DIR`; leer o escribir datos sí.
 */
export function almacenDeLaInstalacion(): Almacen {
  return {
    escribible: true,
    nuevoId: () => randomUUID(),
    leer: (t) => real().leer(t),
    escribir: (t, f) => real().escribir(t, f),
  }
}
