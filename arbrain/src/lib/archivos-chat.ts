/**
 * Archivos que Levy genera, abiertos desde el chat (29 oct 2026, T6 de docs/builds/mejoras-cohorte-2026-10-29).
 *
 * Un fundador, con su cerebro en una Mac Mini y el chat en el iPhone: el PDF que Levy le preparó para su cliente salía en el
 * chat como `/Users/usuario/…/propuesta.pdf` y el enlace terminaba en `https://<su-maquina>/Users/usuario/…`, que no existe. Aquí se
 * decide qué `href` (o qué código en línea) es una ruta local; el chat la cambia por un enlace firmado que sirve
 * `/api/chat/archivo/f/<token>/<nombre>` (lib/archivos-chat-server.ts), que funciona igual en la app de escritorio, el
 * navegador y el teléfono.
 *
 * Puro y sin dependencias de Node: lo usa el cliente (MarkdownMessage) y el servidor vuelve a validar todo con disco.
 */

/** Esquemas que nunca son archivos locales (y `//host`, `#ancla`, `?consulta`). */
const NO_LOCAL = /^(https?:|mailto:|tel:|data:|blob:|javascript:|vbscript:|sms:|\/\/|#|\?)/i
/** Unidad de Windows: `C:\…` o `C:/…`. */
const UNIDAD_WINDOWS = /^[A-Za-z]:[\\/]/
/** Raíces absolutas que son carpetas de una persona o temporales (no rutas de la app como `/chat` o `/brand/x.png`). */
const RAIZ_ABSOLUTA = /^\/(Users|home|tmp|private|Volumes|var\/folders|mnt|media)\//
/** Termina en `.<extensión>` de 1 a 8 letras o números. */
const CON_EXTENSION = /\.[A-Za-z0-9]{1,8}$/

/**
 * Ruta local de un `href` o de un texto en código, o null si no es un archivo local. Devuelve la ruta tal cual la
 * resolverá el servidor: absoluta (POSIX o Windows), `~/…`, o relativa al cerebro de la persona (sin `./`).
 * `file://` se decodifica. Las relativas solo cuentan si terminan en extensión (`entregas/propuesta.pdf`), para no
 * confundir un enlace interno o una palabra con un archivo.
 */
export function rutaArchivoLocal(href: string | undefined | null): string | null {
  if (!href) return null
  let s = href.trim()
  if (!s || s.length > 1000 || s.includes('\0')) return null
  if (/^file:/i.test(s)) {
    try {
      const u = new URL(s)
      s = decodeURIComponent(u.pathname)
      // file:///C:/Users/usuario/x.pdf → /C:/Users/usuario/x.pdf
      if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1)
    } catch { return null }
    return s || null
  }
  if (NO_LOCAL.test(s)) return null
  if (UNIDAD_WINDOWS.test(s)) return s
  // Otro esquema (`ftp:`, `obsidian:`…): no es nuestro.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null
  // Un enlace de markdown puede venir con espacios codificados (`Mi%20archivo.pdf`).
  if (/%[0-9A-Fa-f]{2}/.test(s)) { try { s = decodeURIComponent(s) } catch { /* tal cual */ } }
  if (s.startsWith('~/')) return s.length > 2 ? s : null
  if (s.startsWith('/')) return RAIZ_ABSOLUTA.test(s) ? s : null
  // Relativa: sin raíz y con extensión.
  const rel = s.replace(/^\.\//, '')
  return CON_EXTENSION.test(rel) ? rel : null
}

/** Nombre del archivo (lo que se ve y con lo que se descarga). */
export function nombreArchivo(ruta: string): string {
  const partes = ruta.split(/[\\/]/).filter(Boolean)
  return partes[partes.length - 1] ?? ruta
}

export function extensionDe(ruta: string): string {
  const n = nombreArchivo(ruta)
  const i = n.lastIndexOf('.')
  return i > 0 ? n.slice(i + 1).toLowerCase() : ''
}

/**
 * Lo que se entrega a un cliente (documentos, hojas, presentaciones, imágenes, audio, video, comprimidos). En código en
 * línea solo se convierten estos: una ruta a `server.ts` o a una memoria `.md` es conversación técnica, no un entregable.
 */
const ENTREGABLES = new Set([
  'pdf', 'doc', 'docx', 'odt', 'rtf', 'pages', 'xls', 'xlsx', 'ods', 'numbers', 'csv', 'tsv', 'ppt', 'pptx', 'odp', 'key',
  'html', 'htm', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'heic',
  'mp4', 'mov', 'm4v', 'webm', 'mp3', 'wav', 'm4a', 'ogg', 'zip', 'epub',
])

/** ¿Un texto en código en línea (`` `~/Arbrain/entregas/propuesta.pdf` ``) es un entregable que vale convertir en enlace? */
export function rutaEntregableEnCodigo(texto: string | undefined | null): string | null {
  if (!texto || /\s{2,}|\n/.test(texto)) return null
  const ruta = rutaArchivoLocal(texto)
  if (!ruta) return null
  return ENTREGABLES.has(extensionDe(ruta)) ? ruta : null
}

/** Endpoint (con sesión) que valida la ruta y devuelve el enlace firmado. */
export function urlFirmarArchivo(ruta: string): string {
  return `/api/chat/archivo?ruta=${encodeURIComponent(ruta)}`
}

/** El mismo enlace firmado, pidiendo descarga en vez de abrirlo. */
export function urlDescarga(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}descargar=1`
}

/** Respuesta de `/api/chat/archivo`. */
export interface ArchivoFirmado {
  url: string
  nombre: string
  /** true: el navegador lo puede mostrar (pdf, imagen, texto, html aislado, audio, video). */
  ver: boolean
  bytes: number
}
