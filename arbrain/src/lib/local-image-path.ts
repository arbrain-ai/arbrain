// Rutas locales de imagen que Levy escribe en markdown → URL same-origin del endpoint /api/local-image.
// Puro y sin dependencias de Node: lo usa el cliente (MarkdownMessage) y el servidor lo valida aparte.

const REMOTE = /^(https?:|data:|blob:|\/\/)/i

/** Devuelve la ruta local (absoluta o relativa al repo) o null si el src no es un archivo local. */
export function localImagePath(src: string | undefined): string | null {
  if (!src) return null
  let s = src.trim()
  if (s.startsWith('file://')) {
    try { s = decodeURIComponent(new URL(s).pathname) } catch { return null }
  }
  if (REMOTE.test(s)) return null
  if (s.startsWith('/Users/')) return s
  // Relativa al repo: sin esquema y sin raíz (/brand/x.png son assets de public/, no tocarlos).
  if (!s.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s.replace(/^\.\//, '')
  return null
}

/** URL same-origin (relativa) por la que se sirve la imagen. `full` = original sin reducir. */
export function localImageUrl(path: string, full = false): string {
  return `/api/local-image?path=${encodeURIComponent(path)}${full ? '&full=1' : ''}`
}
