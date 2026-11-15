'use client'
/**
 * Mapa v16 · los PÓSTERS de las islas (14 nov 2026): la foto fiel que el lienzo pinta mientras la cámara se mueve o la
 * isla está lejos.
 *
 * En memoria: un `ImageBitmap` por isla y tema (lo pinta el motor con `drawImage`, barato a 60 fps). En disco (IndexedDB
 * del aparato): la misma foto como imagen, con la huella de lo que pintaba (archivo + tema + datos). Así, al abrir el mapa
 * las fotos están desde el primer cuadro, sin montar un solo iframe; si los datos cambiaron, la foto se rehace en reposo.
 *
 * `alCambiar` avisa al lienzo para volver a pintar (como `onImageLoaded` de las imágenes).
 */

export interface Poster {
  bitmap: ImageBitmap; huella: string; ancho: number; alto: number; en: number
  /** Las fuentes que pintaba (su huella se compara contra ESAS, no contra la ficha). */
  fuentes: string[]
}

const PREFIJO = 'arbrain.isla-poster.v1:'
const memoria = new Map<string, Poster>()
const cargando = new Map<string, Promise<Poster | null>>()
const oyentes = new Set<() => void>()
const clave = (ruta: string, modo: string) => `${ruta}|${modo}`

function avisar() { for (const fn of oyentes) { try { fn() } catch { /* un oyente roto no tumba al resto */ } } }
export function alCambiarPosters(fn: () => void): () => void { oyentes.add(fn); return () => { oyentes.delete(fn) } }

/** La foto en memoria (lo que pinta el motor en este cuadro). */
export const posterDe = (ruta: string, modo: string): Poster | null => memoria.get(clave(ruta, modo)) ?? null

async function idb() {
  try { return await import('idb-keyval') } catch { return null }
}

/** Trae la foto guardada en este aparato (una vez por ruta y tema). */
export function cargarPoster(ruta: string, modo: string): Promise<Poster | null> {
  const k = clave(ruta, modo)
  const ya = memoria.get(k)
  if (ya) return Promise.resolve(ya)
  let p = cargando.get(k)
  if (!p) {
    p = (async () => {
      const db = await idb()
      const g = await db?.get(PREFIJO + k).catch(() => undefined) as { blob: Blob; huella: string; en: number; fuentes?: string[] } | undefined
      if (!g?.blob || typeof createImageBitmap !== 'function') return null
      const bitmap = await createImageBitmap(g.blob).catch(() => null)
      if (!bitmap) return null
      // Si mientras leía llegó una foto más nueva (de la isla viva), gana la nueva.
      if (memoria.has(k)) { bitmap.close?.(); return memoria.get(k)! }
      const poster: Poster = { bitmap, huella: g.huella, ancho: bitmap.width, alto: bitmap.height, en: g.en, fuentes: Array.isArray(g.fuentes) ? g.fuentes : [] }
      memoria.set(k, poster)
      avisar()
      return poster
    })().finally(() => cargando.delete(k))
    cargando.set(k, p)
  }
  return p
}

/** La isla mandó su foto: queda en memoria ya y se guarda en disco cuando el hilo esté libre. */
export function guardarPoster(ruta: string, modo: string, bitmap: ImageBitmap, huella: string, fuentes: string[]) {
  const k = clave(ruta, modo)
  const vieja = memoria.get(k)
  memoria.set(k, { bitmap, huella, ancho: bitmap.width, alto: bitmap.height, en: Date.now(), fuentes })
  if (vieja && vieja.bitmap !== bitmap) vieja.bitmap.close?.()
  avisar()
  const guardar = async () => {
    const blob = await aBlob(bitmap).catch(() => null)
    if (!blob) return
    const db = await idb()
    await db?.set(PREFIJO + k, { blob, huella, en: Date.now(), fuentes }).catch(() => {})
  }
  const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  if (ric) ric(() => { void guardar() }, { timeout: 4000 }); else setTimeout(() => { void guardar() }, 300)
}

/** WebP si el navegador lo sabe escribir (la foto pesa ~10 veces menos que PNG); si no, PNG. */
async function aBlob(bitmap: ImageBitmap): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height)
    c.getContext('2d')?.drawImage(bitmap, 0, 0)
    try { return await c.convertToBlob({ type: 'image/webp', quality: 0.9 }) } catch { return await c.convertToBlob({ type: 'image/png' }) }
  }
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = bitmap.width; c.height = bitmap.height
  c.getContext('2d')?.drawImage(bitmap, 0, 0)
  return new Promise(ok => c.toBlob(b => ok(b), 'image/webp', 0.9))
}
