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
  if (s.startsWith('/Users/') || s.startsWith('/tmp/') || s.startsWith('/private/tmp/')) return s
  // Relativa al repo: sin esquema y sin raíz (/brand/x.png son assets de public/, no tocarlos).
  if (!s.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s.replace(/^\.\//, '')
  return null
}

/** URL same-origin (relativa) por la que se sirve la imagen. `full` = original sin reducir. */
export function localImageUrl(path: string, full = false): string {
  return `/api/local-image?path=${encodeURIComponent(path)}${full ? '&full=1' : ''}`
}

/** Miniatura: el servidor la reduce a `px` de lado mayor (WebP), para no bajar el original a una fila de 28 px. */
export function localImageThumbUrl(path: string, px: number): string {
  return `/api/local-image?path=${encodeURIComponent(path)}&w=${Math.round(px)}`
}

const EXT_IMAGEN = /\.(png|jpe?g|webp|gif)$/i

/**
 * La imagen que leyó una herramienta (26 oct 2026, «ver las imágenes en el tool usage»): `Read` de Claude o
 * `view_image` de Codex sobre png/jpg/webp/gif → su ruta absoluta; si no, null. El servidor del chat descarta el
 * base64 del resultado (llega «[imagen]»), así que el chat la pide por /api/local-image con la ruta del input.
 */
export function imagenLeida(toolName: string, input: string | undefined): string | null {
  if (toolName !== 'Read' && toolName !== 'view_image') return null
  let ruta: string | null = null
  try {
    const v = input ? JSON.parse(input) as Record<string, unknown> : null
    const r = v?.file_path ?? v?.path
    ruta = typeof r === 'string' ? r.trim() : null
  } catch { return null } // JSON parcial: la llamada todavía no llega entera
  if (!ruta || !ruta.startsWith('/') || !EXT_IMAGEN.test(ruta)) return null
  return localImagePath(ruta)
}
