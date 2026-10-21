/**
 * Mudanza de servidor (11 oct 2026). La app de escritorio puede quedar en el servidor embebido (127.0.0.1:3218)
 * mientras el Studio (127.0.0.1:3300) se despliega; en cuanto el Studio vuelve, el lado nativo (src-tauri/src/
 * servidor.rs) avisa a cada ventana con `arbrain:mudar-servidor`. Otro puerto es otro ORIGEN: localStorage e
 * IndexedDB no viajan solos. Por eso, antes de irse, la ventana principal entrega sus borradores y su fila al lado
 * nativo y, ya en el Studio, los recoge y los funde con lo que hubiera ahí. Este módulo es la parte pura.
 */

/** Ocio mínimo para mudarse sin que Daniel lo note (la versión nueva espera 2 min; aquí el destino es el mismo sitio). */
export const OCIO_PARA_MUDAR_MS = 20_000
/** Tope del paquete (el lado nativo rechaza más de 48 MB). */
export const TOPE_TRASPASO = 40 * 1024 * 1024
export const PREFIJO_BORRADOR = 'arbrain:composer:v1:'
export const PREFIJO_FILA = 'arbrain:cola:'
export const MARCA_IMAGEN = '#img#'

export interface SenalesMudanza {
  /** El servidor de esta página ya no contesta: no hay nada en vuelo que esperar. */
  urgente: boolean
  streamLocal: boolean
  turnosServidor: number | null
  hijosVivos: number | null
  ocioMs: number
  /** Hay texto escrito en un campo que no es el compositor del chat (ese no sobrevive a navegar). */
  textoAjeno: boolean
}

export function listoParaMudar(s: SenalesMudanza): boolean {
  if (s.urgente) return true
  if (s.streamLocal || (s.turnosServidor ?? 0) > 0 || (s.hijosVivos ?? 0) > 0) return false
  if (s.textoAjeno) return false
  return s.ocioMs >= OCIO_PARA_MUDAR_MS
}

export interface ImagenTraspaso { id: string; name: string; type: string; lastModified: number; b64: string }
export interface BorradorTraspaso { clave: string; doc: Record<string, unknown>; imagenes: ImagenTraspaso[] }
export interface FilaTraspaso { clave: string; items: Array<{ id: string } & Record<string, unknown>> }
export interface Traspaso { v: 1; ts: number; borradores: BorradorTraspaso[]; filas: FilaTraspaso[] }

/** [dueño, espacio, conversación] de una clave de borrador, o null. */
export function partesClave(clave: string): [string, string, string] | null {
  if (!clave.startsWith(PREFIJO_BORRADOR) || clave.includes(MARCA_IMAGEN)) return null
  try {
    const v = JSON.parse(clave.slice(PREFIJO_BORRADOR.length))
    return Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'string') ? (v as [string, string, string]) : null
  } catch { return null }
}

/**
 * La clave del traspaso que corresponde a `clave` en el origen nuevo. El dueño puede cambiar de origen a origen (el
 * embebido usa el usuario local de escritorio, el Studio la cuenta real): manda espacio + conversación, y se prefiere
 * la coincidencia exacta.
 */
export function claveEquivalente(clave: string, candidatas: Iterable<string>): string | null {
  const p = partesClave(clave)
  if (!p) return null
  let parecida: string | null = null
  for (const c of candidatas) {
    if (c === clave) return c
    const q = partesClave(c)
    if (q && q[1] === p[1] && q[2] === p[2]) parecida ??= c
  }
  return parecida
}

const vacioValor = (v: unknown) => v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0)

/** Un borrador sin nada escrito ni adjunto (o sin documento). */
export function docVacio(doc: unknown): boolean {
  if (doc == null) return true
  if (typeof doc !== 'object' || Array.isArray(doc)) return false
  return Object.values(doc as Record<string, unknown>).every(v => vacioValor(typeof v === 'string' ? v.trim() : v))
}

/** Campos que son texto escrito por Daniel (se suman); el resto de escalares (ids, rama) los decide el entrante. */
const CAMPOS_TEXTO = new Set(['input', 'text'])

const idDe = (x: unknown) => (x && typeof x === 'object' ? ((x as Record<string, unknown>).__archivo ?? (x as Record<string, unknown>).id ?? JSON.stringify(x)) : JSON.stringify(x))

/**
 * Funde el borrador que llega (lo último que Daniel escribió, en el servidor provisional) con el que ya había en el
 * origen nuevo. Nada se pierde: textos distintos quedan los dos (el nuevo arriba), listas se unen sin duplicar.
 */
export function fundirBorrador(destino: unknown, entrante: Record<string, unknown>): Record<string, unknown> {
  if (docVacio(destino)) return { ...entrante }
  const d = destino as Record<string, unknown>
  const out: Record<string, unknown> = { ...d }
  for (const [k, v] of Object.entries(entrante)) {
    const viejo = d[k]
    if (vacioValor(typeof v === 'string' ? v.trim() : v)) continue
    if (vacioValor(typeof viejo === 'string' ? viejo.trim() : viejo)) { out[k] = v; continue }
    if (typeof v === 'string' && typeof viejo === 'string' && CAMPOS_TEXTO.has(k)) out[k] = v.trim() === viejo.trim() ? v : `${v}\n\n${viejo}`
    else if (Array.isArray(v) && Array.isArray(viejo)) {
      const vistos = new Set(v.map(idDe))
      out[k] = [...v, ...viejo.filter(x => !vistos.has(idDe(x)))]
    } else out[k] = v
  }
  return out
}

/** Une la fila que llega con la que hay, sin repetir mensajes (por id). */
export function fundirFila<T extends { id: string }>(actual: T[], entrante: T[]): T[] {
  const ids = new Set(actual.map(x => x.id))
  return [...actual, ...entrante.filter(x => x && typeof x.id === 'string' && !ids.has(x.id))]
}

/** Lee un traspaso entregado por el lado nativo; cualquier cosa rara es null (jamás lanza). */
export function leerTraspaso(raw: string | null | undefined): Traspaso | null {
  if (!raw) return null
  try {
    const t = JSON.parse(raw) as Partial<Traspaso>
    if (!t || t.v !== 1 || !Array.isArray(t.borradores) || !Array.isArray(t.filas)) return null
    return {
      v: 1,
      ts: typeof t.ts === 'number' ? t.ts : 0,
      borradores: t.borradores.filter(b => b && typeof b.clave === 'string' && partesClave(b.clave) && b.doc && typeof b.doc === 'object')
        .map(b => ({ clave: b.clave, doc: b.doc, imagenes: Array.isArray(b.imagenes) ? b.imagenes.filter(i => i && typeof i.id === 'string' && typeof i.b64 === 'string') : [] })),
      filas: t.filas.filter(f => f && typeof f.clave === 'string' && Array.isArray(f.items)),
    }
  } catch { return null }
}

/** Referencias a imágenes (`{__archivo: id}`) que un documento de borrador usa. */
export function idsDeImagenes(doc: Record<string, unknown>): string[] {
  const ids: string[] = []
  for (const v of Object.values(doc)) {
    if (!Array.isArray(v)) continue
    for (const x of v) if (x && typeof x === 'object' && typeof (x as Record<string, unknown>).__archivo === 'string') ids.push((x as Record<string, string>).__archivo)
  }
  return ids
}
