/**
 * Dependencias al día con el `package-lock.json` (23 nov 2026, al pasar una copia con ajustes propios de 0.2.26 a 0.2.30).
 *
 * Antes, el arranque solo instalaba si faltaba `next` o `typescript`. Si una versión nueva traía dependencias nuevas
 * (0.2.27 → `docx-preview`, `dompurify`, `fflate`), el `node_modules` viejo se quedaba, la huella de la web cambiaba
 * (incluye `arbrain/package-lock.json`) y `next build` fallaba por «Module not found»: Arbrain no levantaba. Con el
 * programa ya compilado de una versión publicada no se nota; se nota en cuanto la copia compila (ajustes propios, sin
 * etiqueta, `--compilar`).
 *
 * Ahora, después de cada `npm ci` correcto se anota la huella del lockfile en `node_modules/.arbrain-dependencias.json`
 * (vive dentro de `node_modules`: si alguien lo borra, la marca se va con él). En el arranque:
 *   - falta algo imprescindible            → instalar (como antes);
 *   - la marca no coincide con el lockfile → reinstalar (`npm ci`);
 *   - no hay marca (instalación de antes de esto) → se revisan las dependencias directas de `package.json` contra el
 *     lockfile: si alguna falta o tiene otra versión, reinstalar; si todas cuadran, se adopta la instalación (se anota
 *     la marca sin reinstalar: sin red, una copia que ya funciona no se rompe por la comprobación).
 * Sin lockfile no hay con qué comparar: se queda como antes (solo instala si falta algo).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MARCA = '.arbrain-dependencias.json'

const leerJson = (ruta) => { try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return null } }

/** sha256 del `package-lock.json` de `dir` (16 caracteres), o null si no hay. */
export function huellaBloqueo(dir) {
  let datos
  try { datos = readFileSync(join(dir, 'package-lock.json')) } catch { return null }
  return createHash('sha256').update(datos).digest('hex').slice(0, 16)
}

/** Dependencias directas que faltan o no tienen la versión del lockfile: `["falta docx-preview", "next 16.4.3 → 16.4.5"]`. */
export function directasDesfasadas(dir) {
  const pkg = leerJson(join(dir, 'package.json'))
  const lock = leerJson(join(dir, 'package-lock.json'))
  if (!pkg || !lock?.packages) return [] // lockfile de npm 6 o ilegible: no hay con qué comparar
  const nombres = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  const fuera = []
  for (const nombre of nombres) {
    const esperado = lock.packages[`node_modules/${nombre}`]
    // Opcionales (pueden no instalarse en esta plataforma) y enlaces sin versión: no se exigen.
    if (!esperado?.version || esperado.optional || esperado.link) continue
    const instalado = leerJson(join(dir, 'node_modules', nombre, 'package.json'))
    if (!instalado) fuera.push(`falta ${nombre}`)
    else if (instalado.version !== esperado.version) fuera.push(`${nombre} ${instalado.version} → ${esperado.version}`)
  }
  return fuera
}

/**
 * ¿Hay que (re)instalar en `dir`? Devuelve `{ instalar, motivo, detalle, huella, adoptar }`.
 * motivo: 'faltan' | 'cambio' | 'desfasadas' | null. `adoptar`: no hace falta instalar pero conviene anotar la marca.
 * @param {string} dir
 * @param {string[]} [imprescindibles]
 */
export function estadoDependencias(dir, imprescindibles = []) {
  const huella = huellaBloqueo(dir)
  const faltan = imprescindibles.filter((n) => !existsSync(join(dir, 'node_modules', n, 'package.json')))
  if (faltan.length) return { instalar: true, motivo: 'faltan', detalle: faltan.join(', '), huella, adoptar: false }
  if (!huella) return { instalar: false, motivo: null, detalle: '', huella, adoptar: false }
  const marca = leerJson(join(dir, 'node_modules', MARCA))
  if (marca?.huella === huella) return { instalar: false, motivo: null, detalle: '', huella, adoptar: false }
  if (marca) return { instalar: true, motivo: 'cambio', detalle: 'cambió package-lock.json', huella, adoptar: false }
  const fuera = directasDesfasadas(dir)
  if (fuera.length) {
    const detalle = fuera.slice(0, 3).join(', ') + (fuera.length > 3 ? ` y ${fuera.length - 3} más` : '')
    return { instalar: true, motivo: 'desfasadas', detalle, huella, adoptar: false }
  }
  return { instalar: false, motivo: null, detalle: '', huella, adoptar: true }
}

/** Anota que `node_modules` de `dir` corresponde al lockfile con esa huella (tras un `npm ci` correcto o al adoptar). */
export function anotarInstalacion(dir, huella, ahora = new Date().toISOString()) {
  if (!huella || !existsSync(join(dir, 'node_modules'))) return false
  try { writeFileSync(join(dir, 'node_modules', MARCA), JSON.stringify({ huella, instalado: ahora }) + '\n'); return true } catch { return false }
}

/**
 * Lo que hace el arranque por cada carpeta: decide, instala con `instalar(dir)` (devuelve `{ orden, codigo }`) y anota.
 * `registrar` recibe los mensajes para la persona. Devuelve el estado más `{ codigo, orden }` si instaló.
 * @param {string} dir
 * @param {{ imprescindibles?: string[], cual: string, instalar: (dir: string) => { orden: string, codigo: number | null }, registrar?: (msg: string) => void }} o
 */
export function asegurarDependencias(dir, { imprescindibles = [], cual, instalar, registrar = () => {} }) {
  const e = estadoDependencias(dir, imprescindibles)
  if (e.adoptar) anotarInstalacion(dir, e.huella)
  if (!e.instalar) return { ...e, codigo: 0, orden: null }
  registrar(e.motivo === 'faltan'
    ? `Instalando dependencias ${cual} (una sola vez, unos minutos)…`
    : `Las dependencias ${cual} cambiaron con esta versión (${e.detalle}); las reinstalo para que compile…`)
  const r = instalar(dir)
  if (r.codigo === 0) anotarInstalacion(dir, e.huella)
  return { ...e, ...r }
}
