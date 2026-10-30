/**
 * Canvas v4 — caché de imágenes.
 *
 * Una imagen tarda en cargar, y el renderer es SINCRONO: cuando le toca pintar,
 * o el bitmap está listo o no está. Sin caché, cada frame dispararía una carga
 * nueva y la imagen parpadearía para siempre.
 *
 * El contrato con el motor: `get()` devuelve el bitmap si ya está, o null y
 * arranca la carga. Cuando termina, avisa por callback para que se repinte UNA
 * vez. Nunca bloquea el frame.
 */

type Estado =
  | { kind: 'cargando' }
  | { kind: 'listo'; img: HTMLImageElement; niveles: Nivel[] }
  | { kind: 'error'; mensaje: string }

/** Una copia reducida de la imagen: `ancho` en px de bitmap. */
interface Nivel { ancho: number; bitmap: ImageBitmap }

/**
 * NIVELES REDUCIDOS (mipmaps), 5 oct 2026.
 *
 * Medido en el Customer Journey: cuatro capturas pegadas de 5 000 × 2 880 px hacían que cada cuadro
 * del zoom remuestreara 14 Mpx por imagen (en `restore`, 1.6 s de 2.4 s de CPU) y el zoom caía a
 * 25 fps con cuadros de 380 ms. Sin las fotos el mismo lienzo iba a 60. Ahora se pinta la copia más
 * chica que alcanza para su tamaño en pantalla; la original solo se usa de cerca.
 */
const ANCHOS = [256, 512, 1024, 2048]
const UMBRAL_PX = 2048 * 1536

/**
 * Rutas del DISCO (`/Users/tu-usuario/…`, `~/…`) que sfmap lee directo: el navegador las pide a
 * `/api/canvas/imagen`, que valida y sirve solo imágenes. Una ruta web (`/img/x.png`) no se toca.
 */
export function urlDeCarga(src: string): string {
  return /^(\/Users\/|\/Volumes\/|~\/)/.test(src) ? `/api/canvas/imagen?ruta=${encodeURIComponent(src)}` : src
}

async function reducir(img: HTMLImageElement): Promise<Nivel[]> {
  if (typeof createImageBitmap !== 'function' || img.naturalWidth * img.naturalHeight <= UMBRAL_PX) return []
  const niveles: Nivel[] = []
  for (const ancho of ANCHOS) {
    if (ancho >= img.naturalWidth) break
    try {
      const bitmap = await createImageBitmap(img, {
        resizeWidth: ancho, resizeHeight: Math.max(1, Math.round(img.naturalHeight * ancho / img.naturalWidth)),
        resizeQuality: 'high',
      })
      niveles.push({ ancho, bitmap })
    } catch { break }
  }
  return niveles
}

const cache = new Map<string, Estado>()
const suscriptores = new Set<() => void>()

/** Avisa que algo cambió, para repintar. Devuelve la baja. */
export function onImageLoaded(fn: () => void): () => void {
  suscriptores.add(fn)
  return () => suscriptores.delete(fn)
}

function avisar(): void {
  for (const fn of suscriptores) fn()
}

export function getImage(src: string): HTMLImageElement | null {
  const actual = cache.get(src)
  if (actual?.kind === 'listo') return actual.img
  if (actual) return null   // cargando o en error: no se reintenta en cada frame

  cache.set(src, { kind: 'cargando' })
  const img = new Image()
  // Sin esto, una imagen de otro origen "tiñe" el canvas y el export a PNG
  // falla con SecurityError — un fallo que aparece MUCHO despues, al exportar,
  // y cuesta relacionar con la imagen que lo causo.
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    cache.set(src, { kind: 'listo', img, niveles: [] })
    avisar()
    // Los niveles se hacen FUERA del cuadro; mientras tanto se pinta la original.
    void reducir(img).then(niveles => {
      const e = cache.get(src)
      if (niveles.length && e?.kind === 'listo' && e.img === img) { cache.set(src, { kind: 'listo', img, niveles }); avisar() }
    })
  }
  img.onerror = () => {
    cache.set(src, { kind: 'error', mensaje: 'no se pudo cargar' })
    avisar()   // se avisa igual: el motor pinta el marco de error
  }
  img.src = urlDeCarga(src)
  return null
}

/**
 * Lo que conviene PINTAR para una imagen que ocupa `anchoPx` px de pantalla: el nivel reducido más
 * chico que no se ve borroso (con 25 % de margen), o la original. `ancho`/`alto` son SIEMPRE los de la
 * original, para que la proporción y la caja no dependan del nivel.
 */
export function imagenParaPintar(src: string, anchoPx: number):
  { fuente: CanvasImageSource; ancho: number; alto: number } | null {
  const img = getImage(src)
  if (!img) return null
  const e = cache.get(src)
  const nivel = e?.kind === 'listo' ? e.niveles.find(n => n.ancho >= anchoPx * 1.25) : undefined
  return { fuente: nivel?.bitmap ?? img, ancho: img.naturalWidth, alto: img.naturalHeight }
}

export function imageState(src: string): Estado['kind'] | 'nueva' {
  return cache.get(src)?.kind ?? 'nueva'
}
