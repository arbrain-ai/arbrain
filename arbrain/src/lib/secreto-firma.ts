/**
 * Secreto con que se firman los enlaces de la vista documento (video, audio, imágenes, HTML) y los de los archivos del chat.
 *
 * 8 nov 2026, Daniel: un video se quedaba congelado y al moverlo hacia atrás no cambiaba. Causa de fondo: el secreto era
 * aleatorio POR PROCESO (`randomBytes` si no había `ARBRAIN_DOC_SECRET`, y en el Studio no la hay). Cada deploy reinicia el
 * servidor web (hoy a las 08:18 y a las 08:55) y con el reinicio todos los enlaces de una página abierta dejaban de valer:
 * el navegador seguía con lo ya bufereado y cada petición nueva (seguir, saltar, volver atrás) recibía 403 «Enlace vencido».
 *
 * Ahora vive en un archivo de la carpeta de configuración de esta instalación (`doc-secret`, modo 0600) y todos los procesos
 * (el servidor web, su relevo azul/verde, la app) leen el mismo: un enlace vale lo que dice su caducidad (6 a 12 h),
 * sobreviva o no el proceso que lo firmó. Esa carpeta no es de las que el visor puede abrir (ruta.ts) y el nombre está vetado.
 *
 * Orden: `ARBRAIN_DOC_SECRET` (si alguien la fija) → el archivo (se crea la primera vez) → aleatorio por proceso, como antes,
 * solo si no hay carpeta escribible. Una sola resolución por proceso (`globalThis`, la misma clave que ya usaban los dos módulos).
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dirConfigArbrain } from './rutas-instalacion'

type Env = Record<string, string | undefined>
const g = globalThis as { __arbrainDocSecreto?: Buffer }

export const ARCHIVO_SECRETO = 'doc-secret'
const hex64 = (t: string) => /^[0-9a-f]{64}$/.test(t.trim())

/**
 * Lee el secreto del archivo o lo crea. Dos procesos que arrancan a la vez: gana quien lo crea (`wx` es atómico) y el otro
 * lo lee. Un archivo corrupto (vacío, a medias) se reemplaza con rename, que tampoco deja a nadie con un archivo roto.
 */
export function leerOCrearSecreto(archivo: string): Buffer {
  const leer = () => { try { const t = readFileSync(archivo, 'utf8'); return hex64(t) ? Buffer.from(t.trim()) : null } catch { return null } }
  const existente = leer()
  if (existente) return existente
  mkdirSync(dirname(archivo), { recursive: true })
  const nuevo = randomBytes(32).toString('hex')
  try { writeFileSync(archivo, nuevo + '\n', { flag: 'wx', mode: 0o600 }); return Buffer.from(nuevo) } catch { /* ya existe: lo creó otro proceso, o está corrupto */ }
  const del_otro = leer()
  if (del_otro) return del_otro
  const tmp = `${archivo}.${process.pid}.tmp`
  writeFileSync(tmp, nuevo + '\n', { mode: 0o600 })
  renameSync(tmp, archivo)
  return Buffer.from(nuevo)
}

function resolver(env: Env): Buffer {
  if (env.ARBRAIN_DOC_SECRET) return Buffer.from(env.ARBRAIN_DOC_SECRET)
  try { return leerOCrearSecreto(join(dirConfigArbrain(env), ARCHIVO_SECRETO)) } catch { return randomBytes(32) }
}

/** El secreto de este proceso (se resuelve una vez). */
export const secretoDeFirma = (env: Env = process.env): Buffer => (g.__arbrainDocSecreto ??= resolver(env))

/** Solo para pruebas: olvida el secreto resuelto. */
export const olvidarSecretoResuelto = () => { delete g.__arbrainDocSecreto }
