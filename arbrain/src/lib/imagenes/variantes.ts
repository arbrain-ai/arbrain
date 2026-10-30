/**
 * Imágenes rápidas (5 oct 2026, Daniel desde una cafetería: «asegúrate que si me lo vas a mostrar en el FE carguen
 * rápido»). Una lámina PNG de 6.9 MB tardaba decenas de segundos en pintarse completa en la vista documento.
 *
 * Toda imagen que Levy enseña (vista documento, markdown del chat, adjuntos) pasa por el mismo camino:
 *   1. El servidor la registra: hash del CONTENIDO, tamaño, color dominante y un placeholder de ~200 bytes.
 *   2. El cliente mide el ancho real en pantalla y pide la variante de 1x y 2x en AVIF (WebP de respaldo).
 *   3. La variante se genera una vez con sharp, vive en disco y se sirve inmutable: su URL cambia si cambia el archivo.
 *   4. El clic abre la original completa.
 *
 * Puro y sin dependencias de Node: lo usan el cliente y el servidor.
 */

export interface MetaImagen {
  /** sha256 del contenido (32 hex): la clave de la caché y de la URL. */
  hash: string
  ancho: number
  alto: number
  /** Color dominante, `#rrggbb`: el fondo mientras llega todo lo demás. */
  color: string
  /** data:image/webp de ~24 px de ancho, se pinta borroso al instante. */
  placeholder: string
}

export type FormatoVariante = 'avif' | 'webp'
export const FORMATOS: readonly FormatoVariante[] = ['avif', 'webp']

/** Anchos permitidos: escalones fijos para que la caché no guarde una variante por cada píxel de ventana. */
export const ANCHOS = [160, 320, 480, 640, 800, 960, 1280, 1600, 1920, 2560, 3200, 3840] as const

/** Extensiones que vale la pena recomprimir. GIF (animado) y SVG (vectorial) se sirven tal cual. */
export const EXT_OPTIMIZABLE = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tif', 'tiff'])

export const HASH_VALIDO = /^[0-9a-f]{32}$/

export function extensionDeRuta(ruta: string): string {
  const base = ruta.split(/[?#]/)[0].split('/').pop() ?? ''
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(i + 1).toLowerCase() : ''
}

export const esOptimizable = (ruta: string) => EXT_OPTIMIZABLE.has(extensionDeRuta(ruta))

/** El menor escalón que cubre `px`; si alcanza o pasa el original, el original (nunca se agranda). */
export function anchoVariante(px: number, original: number): number {
  const necesario = Math.max(1, Math.ceil(px))
  if (necesario >= original) return original
  return ANCHOS.find(a => a >= necesario && a < original) ?? original
}

/** ¿El servidor acepta generar ese ancho para esa imagen? Solo escalones menores que el original, o el original. */
export const anchoAceptado = (ancho: number, original: number) =>
  ancho === original || ((ANCHOS as readonly number[]).includes(ancho) && ancho < original)

export const urlVariante = (hash: string, ancho: number, formato: FormatoVariante) => `/api/imagen/${hash}/${ancho}.${formato}`

/** srcset de densidad: 1x al ancho en pantalla, 2x al doble (pantallas Retina y teléfonos). */
export function srcSetDe(meta: Pick<MetaImagen, 'hash' | 'ancho'>, pxPantalla: number, formato: FormatoVariante): string {
  const a1 = anchoVariante(pxPantalla, meta.ancho)
  const a2 = anchoVariante(pxPantalla * 2, meta.ancho)
  return a1 === a2 ? urlVariante(meta.hash, a1, formato) + ' 1x' : `${urlVariante(meta.hash, a1, formato)} 1x, ${urlVariante(meta.hash, a2, formato)} 2x`
}

/** Píxeles CSS que debe cubrir la imagen en una caja: `contain` llena el ancho; `cover` también el alto. */
export function pxNecesarios(caja: { ancho: number; alto: number }, meta: Pick<MetaImagen, 'ancho' | 'alto'>, ajuste: 'contain' | 'cover'): number {
  if (ajuste === 'contain') return caja.ancho
  return Math.max(caja.ancho, caja.alto * (meta.ancho / meta.alto))
}

/** URLs de Storage (Mission Control en el Studio o Supabase en la nube) que el servidor sabe leer y optimizar. */
export const STORAGE_PUBLICO_RE = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/[^?#]+$/
export const esStorageOptimizable = (url: string | undefined): url is string =>
  !!url && STORAGE_PUBLICO_RE.test(url.split(/[?#]/)[0]) && esOptimizable(url)

/** Dónde pide el cliente la ficha de una imagen que no vino con el documento (chat). */
export const urlInfoImagen = (origen: { ruta: string } | { url: string }) =>
  'ruta' in origen ? `/api/imagen/info?ruta=${encodeURIComponent(origen.ruta)}` : `/api/imagen/info?url=${encodeURIComponent(origen.url)}`
