import { existsSync } from 'node:fs'
import { planningOwner } from '@/lib/planning/server'
import { esEdicionCliente } from '@/lib/edicion'
import { leerCarriles, leerGrafo, leerHistoria } from '@/features/historia/servidor'
import { respuestaError } from '@/features/historia/respuesta'
import { copiaDespliegue, raizHistoria } from '@/features/historia/raiz'

// «La historia de tu cerebro» (27 oct 2026). Solo lee.
//  · GET /api/historia            la línea del tiempo de main en humano (~1 s).
//  · GET /api/historia?parte=carriles  los trabajos en paralelo (ramas y copias de trabajo de agentes; ~5 s la primera vez).
//  · GET /api/historia?parte=grafo     el historial de git como VS Code (commits de main y ramas vivas, carriles, +/−); Taller › Historia.
// Se recuerda 15 s: abrir la vista en el panel y en la sección no le pregunta dos veces a git.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const VIDA_MS = 15_000
const memo = new Map<string, { en: number; datos: Promise<unknown> }>()

function recordado<T>(clave: string, fresco: boolean, leer: () => Promise<T>): Promise<T> {
  const m = memo.get(clave)
  if (!fresco && m && Date.now() - m.en < VIDA_MS) return m.datos as Promise<T>
  const datos = leer()
  memo.set(clave, { en: Date.now(), datos })
  datos.catch(() => memo.delete(clave))
  return datos
}

export async function GET(request: Request) {
  try {
    await planningOwner()
    if (esEdicionCliente()) return Response.json({ error: 'La historia todavía no está en esta edición.' }, { status: 404, headers: NO_CACHE })
    const q = new URL(request.url).searchParams
    const fresco = q.get('fresco') === '1'
    const raiz = await raizHistoria()
    if (q.get('parte') === 'grafo') return Response.json(await recordado(`g:${raiz}`, fresco, () => leerGrafo(raiz)), { headers: NO_CACHE })
    if (q.get('parte') === 'carriles') return Response.json(await recordado(`c:${raiz}`, fresco, () => leerCarriles(raiz)), { headers: NO_CACHE })
    const limite = Math.min(Math.max(Number(q.get('limite')) || 60, 5), 200)
    const dir = copiaDespliegue()
    return Response.json(await recordado(`h:${raiz}:${limite}`, fresco, () => leerHistoria(raiz, { limite, dirDespliegue: existsSync(dir) ? dir : null })), { headers: NO_CACHE })
  } catch (error) { return respuestaError(error) }
}
