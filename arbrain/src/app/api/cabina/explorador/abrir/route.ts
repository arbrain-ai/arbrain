import { spawn } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { listaDe, raizExplorador } from '@/lib/cabina/explorador-server'
import { absoluta } from '@/features/cabina/explorador/arbol'
import { carpetaPermitida, comandoAbrir, dentroDeRaiz, pedidoLocal } from '@/features/cabina/explorador/abrir-carpeta'

// «Abrir carpeta» del explorador (22 oct 2026): POST { dir: <relativa> } abre esa carpeta en Explorer, Finder o el gestor de
// Linux. Misma sesión y misma raíz que GET /api/cabina/explorador; solo desde esta computadora (Host local, sin reenvío de fuera),
// sin «..», solo carpetas que el explorador muestra y, ya resuelta en disco, dentro de la raíz. `spawn` con argumentos, sin shell.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const falla = (error: string, status: number) => Response.json({ error }, { status, headers: NO_CACHE })

/** Lanza el gestor suelto (no espera a que se cierre). Resuelve al nacer el proceso; rechaza si no existe el comando. */
function lanzar(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false, windowsHide: false })
    hijo.once('error', reject)
    hijo.once('spawn', () => { hijo.unref(); resolve() })
  })
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    if (!pedidoLocal(request.headers)) return falla('Abrir carpeta solo funciona en la computadora donde corre Arbrain.', 403)
    const body = await request.json().catch(() => null) as { dir?: unknown } | null
    const raiz = await raizExplorador()
    const { lista } = await listaDe(raiz.ruta)
    const pedida = carpetaPermitida(body?.dir ?? '', lista)
    if ('error' in pedida) return falla(pedida.error, pedida.status)
    const raizReal = await realpath(raiz.ruta).catch(() => raiz.ruta)
    const real = await realpath(absoluta(raiz.ruta, pedida.rel)).catch(() => null)
    if (!real || !dentroDeRaiz(real, raizReal, process.platform)) return falla('Esa carpeta queda fuera del explorador.', 403)
    if (!(await stat(real).then(s => s.isDirectory(), () => false))) return falla('Esa carpeta ya no existe.', 404)
    const comando = comandoAbrir(process.platform, real, process.env)
    if ('error' in comando) return falla(comando.error, 501)
    try { await lanzar(comando.cmd, comando.args) } catch {
      return falla(`No encontré el gestor de archivos (${comando.cmd}) en esta computadora.`, 501)
    }
    return Response.json({ ok: true, dir: pedida.rel }, { headers: NO_CACHE })
  } catch (error) { return planningError(error) }
}
