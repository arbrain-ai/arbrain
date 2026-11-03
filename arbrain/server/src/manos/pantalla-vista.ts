/**
 * Vista privada de la pantalla virtual (modo servidor, 1 nov 2026; docs/builds/modo-servidor-2026-11-01/pantalla-virtual.md).
 *
 * Lo que el daemon le da a la web para que la persona MIRE la pantalla de su servidor desde su Arbrain o su teléfono,
 * mientras Levy trabaja en ella. Solo mirar: aquí no hay ninguna ruta que mande clics, teclas ni texto. Rutas (solo la
 * app, con el Bearer del daemon: el pase de los agentes no las abre, `cliente/cofre.ts › rutaSoloApp`):
 *
 *   GET /pantalla/estado                         → { instalada, encendida, procesos, rss_mb, sin_uso_s… } (no la enciende)
 *   GET /pantalla/captura?calidad=55&ancho=1080  → image/jpeg de la pantalla entera; 204 si está apagada
 *
 * La captura la toma un ayudante ManosLinux propio de la vista (el de las manos vive en el proceso MCP de cada sesión
 * de Levy): mirar no enciende la pantalla ni lanza el navegador, y ese ayudante se cierra tras un minuto sin que nadie
 * mire. Mirar cuenta como uso: mientras la persona mira, la pantalla no se apaga por inactividad.
 */
import { ClienteLinux, pantallaVirtualInstalada, type EstadoPantalla } from './adaptadores/linux.js'

export interface DepsVista {
  instalada: () => boolean
  llamar: (op: string, args?: Record<string, unknown>, tiempoMs?: number) => Promise<any>
}

let cliente: ClienteLinux | null = null
let reloj: NodeJS.Timeout | null = null
const OCIOSO_MS = 60_000

/** El ayudante de la vista: se crea al primer vistazo y se cierra tras un minuto sin mirar. */
function llamarReal(op: string, args: Record<string, unknown> = {}, tiempoMs = 15_000): Promise<any> {
  cliente ??= new ClienteLinux(undefined, undefined, 'vista')
  if (reloj) clearTimeout(reloj)
  reloj = setTimeout(() => { cliente?.cerrar(); cliente = null; reloj = null }, OCIOSO_MS)
  reloj.unref()
  return cliente.llamar(op, args, tiempoMs)
}

export const depsReales = (): DepsVista => ({ instalada: () => pantallaVirtualInstalada(), llamar: llamarReal })

const entero = (v: string | null, min: number, max: number, def: number) => {
  const n = Number(v)
  return Number.isFinite(n) && v !== null && v !== '' ? Math.max(min, Math.min(max, Math.round(n))) : def
}

export type RespuestaVista =
  | { status: number; json: Record<string, unknown> }
  | { status: 200; jpeg: Buffer; ancho: number; alto: number }
  | { status: 204 }

/** Atiende `/pantalla/*` del daemon. `null` = no es una ruta de la vista. */
export async function atenderPantalla(metodo: string | undefined, url: string, deps: DepsVista = depsReales()): Promise<RespuestaVista | null> {
  const u = new URL(url, 'http://127.0.0.1')
  if (u.pathname !== '/pantalla/estado' && u.pathname !== '/pantalla/captura') return null
  if (metodo !== 'GET') return { status: 405, json: { error: 'La vista de la pantalla solo mira (GET).' } }
  if (!deps.instalada()) return { status: 404, json: { instalada: false, error: 'Este Arbrain no tiene pantalla virtual (se instala en un servidor Linux con: nube.sh pantalla).' } }
  try {
    if (u.pathname === '/pantalla/estado') {
      const e = await deps.llamar('estado', {}, 10_000) as EstadoPantalla
      return { status: 200, json: { ...e, instalada: true } }
    }
    const r = await deps.llamar('captura_jpeg', {
      calidad: entero(u.searchParams.get('calidad'), 25, 85, 55),
      ancho_max: entero(u.searchParams.get('ancho'), 320, 1440, 1080),
    }, 10_000) as { apagada: boolean; jpeg?: string; ancho?: number; alto?: number }
    if (r.apagada || !r.jpeg) return { status: 204 }
    return { status: 200, jpeg: Buffer.from(r.jpeg, 'base64'), ancho: r.ancho ?? 0, alto: r.alto ?? 0 }
  } catch (e) {
    return { status: 503, json: { error: `La pantalla no respondió: ${(e as Error).message.slice(0, 200)}` } }
  }
}

/** Solo pruebas. */
export function _cerrarVista(): void { cliente?.cerrar(); cliente = null; if (reloj) clearTimeout(reloj); reloj = null }
