import { instalacion } from '@/config'
/**
 * Documentos adjuntos del chat (2 oct 2026, la socia: «subir los estados de cuenta»).
 *
 * Los documentos viajan por el MISMO campo que las imágenes (`imageUrl`, URLs separadas por salto de línea):
 * fila, reintentos, historial y el turno durable siguen funcionando sin cambios. Quien recibe distingue por la
 * extensión de la URL. El daemon descarga cada archivo al disco del servidor y le pide al modelo que lo lea
 * (Read de Claude Code lee PDF nativo; Word/Excel/PowerPoint con sus skills).
 *
 * Sin dependencias del navegador: se prueba en Node.
 */

/** Extensión → tipo MIME con que se guarda. Solo formatos que no se ejecutan en el navegador (nada de HTML/SVG). */
export const TIPOS_DOCUMENTO: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/** Para el `accept` del selector de archivos. */
export const ACCEPT_DOCUMENTOS = Object.keys(TIPOS_DOCUMENTO).map(ext => `.${ext}`).join(',')

/** Máximo de adjuntos (imágenes + documentos) por mensaje. */
export const MAX_ADJUNTOS = 10

export function extensionDe(nombre: string): string {
  const limpio = nombre.split(/[?#]/)[0]
  const m = limpio.match(/\.([A-Za-z0-9]{1,5})$/)
  return m ? m[1].toLowerCase() : ''
}

/** ¿El archivo elegido es un documento que aceptamos? Por extensión: el navegador deja `type` vacío en .md y otros. */
export function esDocumentoAceptado(file: Pick<File, 'name'>): boolean {
  return extensionDe(file.name) in TIPOS_DOCUMENTO
}

/** ¿La URL de un adjunto es un documento (no una imagen)? */
export function esUrlDeDocumento(url: string): boolean {
  return extensionDe(url) in TIPOS_DOCUMENTO
}

/** Nombre seguro para guardar en storage: sin rutas, sin caracteres raros, con su extensión real. */
export function nombreSeguro(nombre: string): string {
  const ext = extensionDe(nombre)
  const base = (nombre.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'documento')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/\.{2,}/g, '.').replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'documento'
  return ext ? `${base}.${ext}` : base
}

/** Prefijo que pone el servidor antes del nombre original: `chat-<ms>-<rand>-`. */
const PREFIJO_STORAGE = /^chat-\d+-[a-z0-9]{3,8}-/

/** Nombre legible de un documento a partir de su URL pública. */
export function nombreDesdeUrl(url: string): string {
  let ultimo = url.split(/[?#]/)[0].split('/').pop() ?? ''
  try { ultimo = decodeURIComponent(ultimo) } catch { /* se queda crudo */ }
  return ultimo.replace(PREFIJO_STORAGE, '') || 'documento'
}

/**
 * Storage de Mission Control vive en el Studio (27 sep 2026): Supabase entrega URLs públicas con su host interno
 * (`http://127.0.0.1:8000`), que solo existen dentro del Studio. Desde el iPhone o la MacBook la imagen salía rota
 * (2 oct, visto desde el teléfono). Se reescribe al Funnel público que sirve el mismo Storage.
 */
const STORAGE_INTERNO = /^https?:\/\/(?:127\.0\.0\.1|localhost):8000(?=\/storage\/v1\/object\/public\/)/
const STORAGE_PUBLICO = (process.env.NEXT_PUBLIC_MC_STORAGE_PUBLIC_URL || instalacion().storagePublico).replace(/\/$/, '')
export function urlPublicaDeStorage(url: string): string
export function urlPublicaDeStorage(url: string | undefined): string | undefined
export function urlPublicaDeStorage(url: string | undefined): string | undefined {
  return url && STORAGE_PUBLICO ? url.replace(STORAGE_INTERNO, STORAGE_PUBLICO) : url
}

/**
 * Adjunto local de la edición cliente (v0.2.6, lib/adjuntos-locales.ts): viaja con el origen de la app
 * (`http://127.0.0.1:<puerto>/api/storage/adjunto/<nombre>`). Para pintarlo se usa la ruta relativa, así el historial
 * sigue viéndose si cambia el puerto o se entra por otra dirección.
 */
const ADJUNTO_LOCAL = /^https?:\/\/[^/]+(\/api\/storage\/adjunto\/[^/?#]+)$/
export function rutaVisibleDeAdjunto(url: string): string {
  return ADJUNTO_LOCAL.exec(url)?.[1] ?? url
}

/** Separa la lista de adjuntos de un mensaje en imágenes y documentos. */
export function separarAdjuntos(lista: string | undefined | null): { imagenes: string[]; documentos: string[] } {
  const urls = (lista ?? '').split('\n').filter(u => u.startsWith('http')).map(u => rutaVisibleDeAdjunto(urlPublicaDeStorage(u)))
  return { imagenes: urls.filter(u => !esUrlDeDocumento(u)), documentos: urls.filter(esUrlDeDocumento) }
}

/** Texto por defecto cuando el mensaje sale sin texto. */
export function mensajePorDefecto(imagenes: number, documentos: number): string {
  if (documentos === 0) return imagenes > 1 ? `Analiza estas ${imagenes} imágenes` : 'Analiza esta imagen'
  if (imagenes === 0) return documentos > 1 ? `Analiza estos ${documentos} documentos` : 'Analiza este documento'
  return 'Analiza estos archivos'
}
