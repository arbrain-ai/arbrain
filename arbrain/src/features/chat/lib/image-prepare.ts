/**
 * Prepara una imagen para el chat en el navegador (2 oct 2026), antes de que toque el borrador o la red.
 *
 * Dos problemas de raíz, los dos de la misma causa: un `File` del portapapeles o de arrastrar no es un dato,
 * es una referencia a algo que el sistema puede borrar (la miniatura flotante de las capturas de macOS, los
 * temporales de WebKit). Mientras estuvo así: la miniatura salía rota, IndexedDB no podía clonarlo («no pudo
 * guardarse en este dispositivo») y el envío viajaba cortado («Failed to parse body as FormData»).
 *   1. Los bytes se leen a memoria AHORA, una vez, y de ahí en adelante se trabaja con una copia propia.
 *   2. Si es enorme (dos monitores: 8960×2880 o más) se reduce y se recomprime para que suba y se guarde.
 */
import {
  ErrorImagen, MAX_ENTRADA_BYTES, MAX_LADO_IMAGEN, PRESUPUESTO_BYTES, dimensionesDestino, formatoBytes,
  necesitaRecompresion, nombreConTipo, tipoPorBytes, TIPOS_SUBIBLES, PERFIL_NORMAL, type PerfilImagen,
} from './image-upload'

type Decodificada = { dibujar: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ancho: number, alto: number) => void; ancho: number; alto: number; cerrar: () => void }

async function decodificar(bytes: ArrayBuffer, tipo: string, nombre: string): Promise<Decodificada> {
  const blob = new Blob([bytes], { type: tipo })
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return { ancho: bmp.width, alto: bmp.height, dibujar: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), cerrar: () => bmp.close() }
    } catch { /* cae a <img>: algunos WebKit no decodifican todo con createImageBitmap */ }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((ok, mal) => { img.onload = () => ok(); img.onerror = () => mal(new Error('decode')); img.src = url })
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('decode')
    return { ancho: img.naturalWidth, alto: img.naturalHeight, dibujar: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), cerrar: () => {} }
  } catch {
    const heic = tipo === 'image/heic'
    throw new ErrorImagen('formato', heic
      ? `«${nombre}» es HEIC y este navegador no lo abre. Pásala a JPG (en Fotos: Archivo > Exportar) o adjunta una captura.`
      : `No pude abrir «${nombre}» como imagen: el archivo está dañado o el formato no es compatible. Adjunta otra, o pega una captura nueva.`)
  } finally { URL.revokeObjectURL(url) }
}

async function codificar(d: Decodificada, ancho: number, alto: number, tipo: 'image/webp' | 'image/jpeg', calidad: number): Promise<Blob | null> {
  const pintar = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
    if (tipo === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ancho, alto) } // JPEG no tiene transparencia
    ctx.imageSmoothingQuality = 'high'
    d.dibujar(ctx, ancho, alto)
  }
  if (typeof OffscreenCanvas === 'function') {
    try {
      const c = new OffscreenCanvas(ancho, alto)
      const ctx = c.getContext('2d')
      if (ctx) { pintar(ctx); return await c.convertToBlob({ type: tipo, quality: calidad }) }
    } catch { /* cae al canvas del documento */ }
  }
  const c = document.createElement('canvas')
  c.width = ancho; c.height = alto
  const ctx = c.getContext('2d')
  if (!ctx) return null
  pintar(ctx)
  return await new Promise<Blob | null>(ok => c.toBlob(ok, tipo, calidad))
}

/** Escalas de respaldo si, ya reducida al lado máximo, aún pesa más que el presupuesto. */
const ESCALAS = [1, 0.8, 0.62, 0.48, 0.36]
async function recomprimir(d: Decodificada, nombre: string, perfil: PerfilImagen): Promise<Blob> {
  let tipo: 'image/webp' | 'image/jpeg' = 'image/webp'
  for (const escala of ESCALAS) {
    const { ancho, alto } = dimensionesDestino(d.ancho, d.alto, perfil.maxLado, escala)
    for (const calidad of perfil.calidades) {
      let blob = await codificar(d, ancho, alto, tipo, calidad)
      // Safari no codifica WebP: devuelve PNG sin avisar. Entonces el formato eficiente disponible es JPEG.
      if (blob && tipo === 'image/webp' && blob.type !== 'image/webp') { tipo = 'image/jpeg'; blob = await codificar(d, ancho, alto, tipo, calidad) }
      if (blob && blob.size > 0 && blob.size <= PRESUPUESTO_BYTES) return blob
    }
  }
  throw new ErrorImagen('compresion', `No logré reducir «${nombre}» por debajo de ${formatoBytes(PRESUPUESTO_BYTES)}. Adjunta una captura de menos área o menos resolución.`)
}

export function esArchivoDeImagen(file: File): boolean {
  return file.type.startsWith('image/') || /\.(heic|heif|jpg|jpeg|png|gif|webp)$/i.test(file.name)
}

/**
 * Devuelve un `File` en memoria, listo para guardarse en el borrador y subirse: copia propia de los bytes y,
 * si hacía falta, reducida a MAX_LADO_IMAGEN y recomprimida. Lanza `ErrorImagen` con el mensaje para Daniel.
 */
export async function prepararImagen(file: File, perfil: PerfilImagen = PERFIL_NORMAL): Promise<File> {
  const nombre = file.name || 'imagen'
  if (file.size > MAX_ENTRADA_BYTES) throw new ErrorImagen('demasiado-grande', `«${nombre}» pesa ${formatoBytes(file.size)}; puedo preparar imágenes de hasta ${formatoBytes(MAX_ENTRADA_BYTES)}. Recórtala o baja la resolución.`)
  let bytes: ArrayBuffer
  try { bytes = await file.arrayBuffer() } catch {
    throw new ErrorImagen('ilegible', `No pude leer «${nombre}»: el sistema ya no la tiene disponible. Pasa con las capturas flotantes de macOS cuando se cierran, o con archivos movidos. Vuelve a copiarla y pégala (Cmd+V) o adjúntala con el clip.`)
  }
  if (bytes.byteLength === 0 || (file.size > 0 && bytes.byteLength !== file.size)) {
    throw new ErrorImagen('ilegible', `«${nombre}» llegó vacía o incompleta (${formatoBytes(bytes.byteLength)} de ${formatoBytes(file.size)}). Vuelve a copiarla y pégala (Cmd+V) o adjúntala con el clip.`)
  }
  const tipo = tipoPorBytes(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength))) ?? file.type
  const d = await decodificar(bytes, tipo, nombre)
  try {
    const sube = necesitaRecompresion({ tipo, bytes: bytes.byteLength, ancho: d.ancho, alto: d.alto }, perfil)
    if (!sube) return new File([bytes], nombreConTipo(nombre, tipo), { type: tipo, lastModified: file.lastModified || Date.now() })
    const nuevo = await recomprimir(d, nombre, perfil)
    const original = (TIPOS_SUBIBLES as readonly string[]).includes(tipo) && bytes.byteLength <= PRESUPUESTO_BYTES && Math.max(d.ancho, d.alto) <= perfil.maxLado
    // Si recomprimir no ganó nada y la original ya servía, se conserva la original.
    if (original && nuevo.size >= bytes.byteLength) return new File([bytes], nombreConTipo(nombre, tipo), { type: tipo, lastModified: file.lastModified || Date.now() })
    return new File([await nuevo.arrayBuffer()], nombreConTipo(nombre, nuevo.type), { type: nuevo.type, lastModified: file.lastModified || Date.now() })
  } finally { d.cerrar() }
}
