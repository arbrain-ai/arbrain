import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { sinRespuestaDelServidor } from '@/lib/edicion'
import { dirConfigArbrain } from '@/lib/rutas-instalacion'
import { OCULTO_POR_DIRECTO, velo, type Diccionario, type Velo } from './reglas'

/**
 * Modo directo del lado del servidor de la web (7 nov 2026). La verdad la tiene el daemon (POST /cabina
 * {que:'modo-directo'}); esta capa la pide para la app (api/modo-directo) y para negar datos en las rutas de las vistas
 * vetadas (Finanzas, Cohorte, Casa, Perro y el visor de documentos) aunque una vista se montara por error.
 */

async function alDaemon(cuerpo: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
    method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ que: 'modo-directo', ...cuerpo }), signal: AbortSignal.timeout(6_000), cache: 'no-store',
  })
  const body = await res.json().catch(() => ({ error: sinRespuestaDelServidor() })) as Record<string, unknown>
  return { status: res.status, body }
}

/** El archivo del interruptor en esta máquina (la web y el daemon comparten carpeta en el Studio y en la app del alumno). */
function leerArchivoLocal(): boolean | null {
  try { return (JSON.parse(readFileSync(join(dirConfigArbrain(), 'modo-directo.json'), 'utf8')) as { prendido?: unknown }).prendido === true }
  catch { return null }
}

export async function leerDirectoDelDaemon() {
  try { return await alDaemon({ accion: 'leer' }) }
  catch {
    const local = leerArchivoLocal()
    if (local === null) return { status: 502, body: { error: sinRespuestaDelServidor() } }
    return { status: 200, body: { estado: { version: 1, prendido: local }, sinDaemon: true } }
  }
}

export async function ponerDirectoEnDaemon(prendido: boolean) {
  try { return await alDaemon({ accion: 'poner', prendido }) }
  catch { return { status: 502, body: { error: sinRespuestaDelServidor() } } }
}

let cache: { en: number; prendido: boolean; velo: Velo | null } | null = null
/** El estado y su velo (nombres de clientes ya compilados). Caché de 2 s; si el daemon no responde, el archivo local; si tampoco, apagado. */
export async function estadoDirecto(ahora = Date.now()): Promise<{ prendido: boolean; velo: Velo | null }> {
  if (cache && ahora - cache.en < 2_000) return cache
  let prendido = false, v: Velo | null = null
  try {
    const r = await alDaemon({ accion: 'leer' })
    prendido = (r.body.estado as { prendido?: unknown } | undefined)?.prendido === true
    const dic = r.body.diccionario as Diccionario | undefined
    if (prendido) v = velo({ nombres: Array.isArray(dic?.nombres) ? dic.nombres : [], literales: Array.isArray(dic?.literales) ? dic.literales : [] })
  } catch { prendido = leerArchivoLocal() ?? false; if (prendido) v = velo({ nombres: [] }) }
  cache = { en: ahora, prendido, velo: v }
  return cache
}
export const directoPrendido = async (ahora = Date.now()) => (await estadoDirecto(ahora)).prendido

/** La respuesta de una ruta vetada (423 Locked: el recurso existe, pero ahora no se entrega). */
export function respuestaOculta(que = 'Esta sección') {
  return Response.json({ error: `${OCULTO_POR_DIRECTO}: ${que} no se muestra mientras transmites.`, ocultoPorDirecto: true }, { status: 423, headers: { 'Cache-Control': 'no-store' } })
}

/** Para el inicio de un handler: `const v = await vetoDirecto('Finanzas'); if (v) return v`. */
export async function vetoDirecto(que?: string): Promise<Response | null> {
  return (await directoPrendido()) ? respuestaOculta(que) : null
}
