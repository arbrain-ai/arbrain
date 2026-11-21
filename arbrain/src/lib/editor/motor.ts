/**
 * El motor del editor visto desde el servidor de Arbrain (19 nov 2026, encargo `editor-interfaz`).
 *
 * El motor (Scarlet de Forward Future, sin ventana; contrato en `docs/builds/editor-arbrain-2026-11-19/CONTRATO-MOTOR.md`) escucha
 * solo en loopback y pide un token. El token vive en un archivo que lee ESTE servidor; el navegador nunca lo ve: habla con
 * `/api/editor/motor/…` (con la sesión de Arbrain) y aquí se le pone el token y se reenvía. Las rutas permitidas son una
 * lista cerrada (lo que el editor usa), no todo el motor.
 *
 * Configuración: `ARBRAIN_EDITOR_MOTOR_URL` (por omisión `http://127.0.0.1:47420`) y `ARBRAIN_EDITOR_MOTOR_TOKEN`
 * (ruta del archivo; por omisión `~/Library/Application Support/arbrain-editor/data/access-token`).
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const MOTOR_URL_POR_OMISION = 'http://127.0.0.1:47420'
export const TOKEN_POR_OMISION = () => join(homedir(), 'Library', 'Application Support', 'arbrain-editor', 'data', 'access-token')

/** La base del motor, solo si es loopback (http://127.0.0.1, localhost o [::1]). Cualquier otra cosa se rechaza. */
export function baseDelMotor(env: Record<string, string | undefined> = process.env): URL {
  const crudo = (env.ARBRAIN_EDITOR_MOTOR_URL || MOTOR_URL_POR_OMISION).replace(/\/+$/, '').replace(/\/api$/, '')
  const u = new URL(crudo)
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('El motor del editor solo se alcanza en loopback.')
  return u
}

let cache: { ruta: string; token: string; leido: number } | null = null

/** El token del motor (leído del archivo, con caché corta: el motor puede rotarlo al reinstalarse). */
export async function tokenDelMotor(env: Record<string, string | undefined> = process.env): Promise<string> {
  const ruta = env.ARBRAIN_EDITOR_MOTOR_TOKEN || TOKEN_POR_OMISION()
  if (cache && cache.ruta === ruta && Date.now() - cache.leido < 30_000) return cache.token
  const token = (await readFile(ruta, 'utf8')).trim()
  if (!/^sct_[a-f0-9]{64}$/.test(token)) throw new Error('El archivo del token del motor no tiene la forma esperada.')
  cache = { ruta, token, leido: Date.now() }
  return token
}

/**
 * Lista cerrada de lo que el editor puede pedir al motor: `método ruta` con `:x` como comodín de un segmento.
 * Lo que no esté aquí no pasa (skills, ajustes, almacenamiento, papelera, hosts…).
 */
export const PERMITIDAS: ReadonlyArray<readonly [string, string]> = [
  ['GET', '/health'], ['GET', '/auth/me'],
  ['GET', '/projects'], ['GET', '/projects/:id'],
  ['GET', '/projects/:id/timeline'], ['GET', '/projects/:id/versions'], ['GET', '/projects/:id/branches'],
  ['GET', '/projects/:id/versions/:a/diff/:b'], ['POST', '/projects/:id/versions/:v/checkout'],
  ['POST', '/projects/:id/versions/:v/revert'], ['POST', '/projects/:id/versions/:v/restore'],
  ['GET', '/projects/:id/changes'], ['POST', '/projects/:id/changes'], ['GET', '/changes/:c'],
  ['POST', '/changes/:c/cut-review'], ['PUT', '/changes/:c/cut-choices'], ['POST', '/changes/:c/approve'],
  ['POST', '/changes/:c/unapprove'], ['POST', '/changes/:c/reject'], ['POST', '/changes/:c/revise'], ['POST', '/changes/:c/reopen'],
  ['GET', '/projects/:id/media'], ['GET', '/media/:m/file'], ['GET', '/media/:m/proxy'], ['GET', '/media/:m/waveform'],
  ['GET', '/media/:m/transcript'], ['GET', '/media/:m/frame'],
  ['GET', '/projects/:id/notes'], ['POST', '/projects/:id/notes'],
  ['POST', '/projects/:id/kept-edits'],
  ['GET', '/projects/:id/tasks'], ['GET', '/tasks/:t'], ['GET', '/projects/:id/activity'],
  ['POST', '/projects/:id/versions/:v/prepare-playback'], ['POST', '/projects/:id/versions/:v/cut-playback-file'],
  ['GET', '/renders/:r'], ['GET', '/renders/:r/file'], ['GET', '/projects/:id/renders'],
]

const SEGMENTO = /^[A-Za-z0-9._-]{1,200}$/

/** ¿Se puede reenviar `método /ruta`? Cada segmento comodín debe ser un id simple (sin `..`, sin barras codificadas). */
export function rutaPermitida(metodo: string, segmentos: string[]): boolean {
  if (!segmentos.length || segmentos.some(s => !SEGMENTO.test(s) || s === '.' || s === '..')) return false
  return PERMITIDAS.some(([m, patron]) => {
    if (m !== metodo) return false
    const p = patron.split('/').filter(Boolean)
    return p.length === segmentos.length && p.every((x, i) => x.startsWith(':') || x === segmentos[i])
  })
}

/** Cabeceras que viajan del navegador al motor (nada de cookies ni autorización propia). */
export const CABECERAS_IDA = ['range', 'content-type', 'if-none-match', 'if-modified-since', 'accept'] as const
/** Cabeceras que vuelven del motor al navegador. */
export const CABECERAS_VUELTA = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'content-disposition'] as const

/** Una llamada al motor desde el servidor (para las rutas propias de Arbrain que no son reenvío puro). */
export async function alMotor(ruta: string, init: RequestInit = {}): Promise<Response> {
  const base = baseDelMotor()
  const token = await tokenDelMotor()
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  return fetch(new URL(`/api${ruta}`, base), { ...init, headers, cache: 'no-store' })
}
