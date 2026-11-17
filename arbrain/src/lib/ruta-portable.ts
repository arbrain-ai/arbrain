/**
 * Rutas absolutas que valen en Mac, Linux y Windows (16 nov 2026, un fundador en Windows: «algún panel acá, me quedó en
 * blanco y era porque solamente funcionaba para Mac»).
 *
 * La vista «documento», las piezas, recetas y documentos del lienzo y la URL firmada del visor comparaban rutas como
 * texto POSIX (`base + '/'`, `split('/')`, «absoluta = empieza con /»). En Windows `realpath` devuelve `C:\Users\…`: nada
 * empezaba con `C:\…\cerebro/`, así que cada documento salía «fuera de la carpeta» y la pieza o el iframe quedaban vacíos.
 *
 * Regla: una ruta de Windows (letra de unidad o UNC) se compara con barras normales y sin distinguir mayúsculas (su
 * sistema de archivos no las distingue). Una ruta POSIX no se toca: en Mac y Linux `\` es un carácter más del nombre.
 * Módulo puro (sin node:*): lo usan rutas del servidor, componentes y pruebas.
 */

/** ¿Ruta absoluta de Windows? `C:\…`, `C:/…` o UNC `\\servidor\recurso`. */
export function esRutaWindows(ruta: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(ruta) || /^\\\\[^\\]/.test(ruta)
}

/** La misma ruta con `/` si es de Windows (`C:\a\b` → `C:/a/b`, `\\srv\x` → `//srv/x`); una POSIX vuelve igual. */
export function conBarras(ruta: string): string {
  return esRutaWindows(ruta) ? ruta.replace(/\\/g, '/') : ruta
}

/** ¿Absoluta en alguna plataforma? (`/…`, `C:\…`, `C:/…`, `\\srv\…`). */
export function esAbsolutaPortable(ruta: string): boolean {
  return ruta.startsWith('/') || esRutaWindows(ruta)
}

/** Forma para comparar: barras normales y, en Windows, minúsculas. */
function clave(ruta: string): string {
  const b = conBarras(ruta)
  return esRutaWindows(ruta) ? b.toLowerCase() : b
}

/** ¿`abs` es `base` o vive debajo de ella? Sin prefijos engañosos (`/r/repo-gemelo` no está en `/r/repo`). */
export function dentroDe(abs: string, base: string): boolean {
  const a = clave(abs), b = clave(base)
  if (!b) return false
  return a === b || a.startsWith(b.endsWith('/') ? b : `${b}/`)
}

/** ¿`abs` vive ESTRICTAMENTE debajo de `base`? (la raíz misma no cuenta). */
export function debajoDe(abs: string, base: string): boolean {
  const a = clave(abs), b = clave(base)
  if (!b) return false
  return a !== b.replace(/\/+$/, '') && a.startsWith(b.endsWith('/') ? b : `${b}/`)
}

/**
 * Ruta absoluta → camino de URL (`/C:/Users/x/…` en Windows, `/Users/x/…` en POSIX), un segmento por carpeta y cada uno
 * codificado. Es lo que viaja detrás del token de `/api/cabina/documento/crudo/<token>`.
 */
export function rutaAUrl(abs: string): string {
  const b = conBarras(abs)
  const conRaiz = b.startsWith('/') ? b : `/${b}`
  return conRaiz.split('/').map(encodeURIComponent).join('/')
}

/** Lo contrario de `rutaAUrl` ya decodificado: `/C:/Users/x/…` vuelve a `C:/Users/x/…`; `//srv/x` y `/Users/x/…` no cambian. */
export function urlARuta(camino: string): string {
  return /^\/[A-Za-z]:\//.test(camino) ? camino.slice(1) : camino
}
