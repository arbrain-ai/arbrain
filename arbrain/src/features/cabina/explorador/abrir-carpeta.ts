/**
 * «Abrir carpeta» del explorador (22 oct 2026, prueba de Windows de Daniel: «falta un botón abrir esta carpeta»).
 * Abre la carpeta que se está viendo en el gestor de archivos del sistema: Explorer en Windows, Finder en Mac, `xdg-open` en Linux.
 *
 * Módulo puro (sin node:*): qué carpeta pide la vista, si el pedido llega de esta misma computadora, si la ruta pedida cae dentro
 * de la raíz del explorador y qué comando corre cada plataforma. El lado servidor (/api/cabina/explorador/abrir) solo junta las
 * piezas: sesión, origen, `relativaSegura`, la lista visible, `realpath` dentro de la raíz y `spawn` con argumentos, sin shell.
 */
import { relativaSegura, esCarpeta } from './arbol'

/** La carpeta que se está viendo: la fila con el foco si es carpeta, la carpeta de un archivo, o la raíz. */
export function carpetaDeFoco(foco: string | null | undefined, tipo: 'carpeta' | 'archivo' | null | undefined): string {
  if (!foco) return ''
  if (tipo === 'carpeta') return foco
  return foco.includes('/') ? foco.slice(0, foco.lastIndexOf('/')) : ''
}

const LOCALES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
/** Hostname de un `Host` (sin puerto; IPv6 con corchetes). */
export function nombreDeHost(host: string | null | undefined): string {
  const h = (host ?? '').trim().toLowerCase()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1)
  return h.split(':')[0]
}
const esLocal = (ip: string) => {
  const v = ip.trim().toLowerCase()
  return v === '::1' || v === 'localhost' || v.startsWith('127.') || v === '::ffff:127.0.0.1'
}

/**
 * ¿El pedido viene de esta computadora? El servidor escucha en 127.0.0.1; uno que llegó por un túnel (Funnel, Cloudflare)
 * trae otro Host o una cadena `x-forwarded-for` con alguien de fuera. Abrir el Finder del Studio desde el teléfono no tiene sentido.
 */
export function pedidoLocal(headers: { get(nombre: string): string | null }): boolean {
  if (!LOCALES.has(nombreDeHost(headers.get('host')))) return false
  const reenviado = headers.get('x-forwarded-for')
  if (reenviado && reenviado.split(',').some(ip => ip.trim() && !esLocal(ip))) return false
  return true
}

/** Valida la carpeta pedida contra la lista visible del explorador: relativa, sin «..», sin lo escondido y existente. */
export function carpetaPermitida(pedida: unknown, lista: readonly string[]): { rel: string } | { error: string; status: number } {
  if (pedida != null && typeof pedida !== 'string') return { error: 'Ruta inválida.', status: 400 }
  const r = relativaSegura(pedida as string | null | undefined)
  if ('error' in r) return { error: r.error, status: 403 }
  if (!esCarpeta(lista, r.rel)) return { error: 'Esa carpeta no existe en el explorador.', status: 404 }
  return r
}

/** ¿`real` (ya resuelta en disco) queda dentro de `raiz` (también resuelta)? Para que un enlace simbólico no saque del árbol. */
export function dentroDeRaiz(real: string, raiz: string, plataforma: string = 'darwin'): boolean {
  const win = plataforma === 'win32'
  const norm = (p: string) => { const s = (win ? p.replace(/\//g, '\\') : p).replace(/[\\/]+$/, ''); return win ? s.toLowerCase() : s }
  const sep = win ? '\\' : '/'
  const a = norm(real), b = norm(raiz)
  if (!b) return false
  return a === b || a.startsWith(b + sep)
}

export type Comando = { cmd: string; args: string[] } | { error: string }

/**
 * El comando del gestor de archivos, con la ruta como UN argumento (nunca por shell).
 * Windows: Explorer necesita barras invertidas (con «/» abre Documentos). Linux sin DISPLAY ni WAYLAND_DISPLAY: no hay a quién pedírselo.
 */
export function comandoAbrir(plataforma: string, ruta: string, env: Record<string, string | undefined> = {}): Comando {
  if (!ruta || ruta.includes('\0')) return { error: 'Ruta inválida.' }
  // Solo absolutas: así la ruta nunca se lee como opción («-a…» para open, «/select,…» para Explorer).
  if (plataforma === 'win32') {
    const w = ruta.replace(/\//g, '\\')
    if (!/^([A-Za-z]:\\|\\\\[^\\])/.test(w)) return { error: 'Ruta inválida.' }
    return { cmd: 'explorer.exe', args: [w] }
  }
  if (!ruta.startsWith('/')) return { error: 'Ruta inválida.' }
  if (plataforma === 'darwin') return { cmd: 'open', args: [ruta] }
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return { error: 'Esta computadora no tiene entorno gráfico: no hay un gestor de archivos que abrir.' }
  return { cmd: 'xdg-open', args: [ruta] }
}
