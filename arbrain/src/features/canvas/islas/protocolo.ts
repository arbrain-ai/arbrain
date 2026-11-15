/**
 * Mapa v16 · el protocolo de las ISLAS (14 nov 2026).
 *
 * Daniel: «¿te imaginas un híbrido? …un botón que en finanzas me lleve a Polar, o abra otro panel donde sí tengo las
 * finanzas» · «números vivos, eso es clave!!» · «¿sabes qué es esto? un sistema nervioso vivo».
 *
 * El lienzo es el mapa del mundo; cada tarjeta es una ISLA: un `doc:…/index.html` con su `isla.json` al lado, pintado en
 * un iframe aislado (`sandbox="allow-scripts"`, origen opaco). La isla no ve la sesión ni la API de la app: todo lo que
 * necesita pasa por este protocolo de `postMessage`, y el host (el lienzo) decide.
 *
 *   isla → host   {tipo:'hola'}                       la isla cargó su runtime (docs/builds/mapa-v16/runtime/isla.js)
 *                 {tipo:'accion', destino}            panel:<seccion> · doc:<ruta> · url:<https…> · lienzo:<capitulo>
 *                 {tipo:'pedir', fuente}              datos vivos; el host responde y avisa cuando cambian
 *                 {tipo:'soltar', fuente}             ya no le interesa esa fuente
 *                 {tipo:'listo'}                      ya pintó sus datos: se le puede pedir la foto
 *                 {tipo:'foto', pedido, bitmap}       la foto (ImageBitmap transferido) que el lienzo pinta de lejos
 *                 {tipo:'despierta', pedido}          primer cuadro tras despertar (mide la latencia)
 *                 {tipo:'rueda', …} {tipo:'gesto', …} la rueda y el pellizco sobre la isla mueven la cámara del lienzo
 *   host → isla   {tipo:'tema', modo}                 'claro' | 'oscuro'
 *                 {tipo:'datos', fuente, valor, fecha, estado, error?}
 *                 {tipo:'pausa'} {tipo:'despertar', pedido}
 *                 {tipo:'foto', pedido}               «mándame tu foto»
 *
 * Puro: sin React ni DOM (tests/canvas/islas-protocolo.test.ts). Lo que llega de una isla es DATO NO CONFIABLE: se valida
 * forma y tamaño aquí y el destino en `destinos.ts`; lo desconocido se ignora.
 */

export const VERSION_PROTOCOLO = 1

/** El estado de un dato vivo. Sin dato NUNCA es 0: la isla dice «sin dato» (o qué falta). */
export type EstadoDato = 'ok' | 'sin-dato' | 'leyendo' | 'error' | 'oculto' | 'desconocida'

export type Modo = 'claro' | 'oscuro'

export type MensajeIsla =
  | { tipo: 'hola'; v?: number }
  | { tipo: 'accion'; destino: string }
  | { tipo: 'pedir'; fuente: string }
  | { tipo: 'soltar'; fuente: string }
  | { tipo: 'listo' }
  | { tipo: 'foto'; pedido: number; bitmap: ImageBitmap | null; ancho: number; alto: number; ms?: number; error?: string }
  | { tipo: 'despierta'; pedido: number }
  | { tipo: 'rueda'; x: number; y: number; deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; wheelDeltaY?: number }
  | { tipo: 'gesto'; fase: 'ini' | 'mov' | 'fin'; escala: number; x: number; y: number }

export type MensajeHost =
  | { tipo: 'bienvenida'; v: number; id: string; despierta: boolean; modo: Modo }
  | { tipo: 'tema'; modo: Modo }
  | { tipo: 'datos'; fuente: string; valor: unknown; fecha: string | null; estado: EstadoDato; error?: string }
  | { tipo: 'pausa' }
  | { tipo: 'despertar'; pedido: number }
  | { tipo: 'foto'; pedido: number }

/** Una fuente se nombra `familia` o `familia:detalle` (pulso:venta, embudo, finanzas:resumen…). */
export const FORMA_FUENTE = /^[a-z][a-z0-9-]{0,31}(:[a-z0-9_-]{1,40})?$/
export const LARGO_DESTINO = 600

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
const texto = (x: unknown, max: number) => typeof x === 'string' && x.length > 0 && x.length <= max
const esBitmap = (x: unknown): x is ImageBitmap =>
  typeof ImageBitmap !== 'undefined' ? x instanceof ImageBitmap : !!x && typeof x === 'object' && num((x as ImageBitmap).width)

/**
 * Lo que mandó una isla, validado. null = no es del protocolo (otros scripts del documento, como el del tema o el lector,
 * hablan con `arbrain-*`; esos los atiende quien ya los atendía).
 */
export function leerMensaje(d: unknown): MensajeIsla | null {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  const m = d as Record<string, unknown>
  switch (m.tipo) {
    case 'hola': return { tipo: 'hola', v: num(m.v) ? m.v as number : undefined }
    case 'accion': return texto(m.destino, LARGO_DESTINO) ? { tipo: 'accion', destino: (m.destino as string).trim() } : null
    case 'pedir':
    case 'soltar': return typeof m.fuente === 'string' && FORMA_FUENTE.test(m.fuente) ? { tipo: m.tipo, fuente: m.fuente } : null
    case 'listo': return { tipo: 'listo' }
    case 'foto': {
      if (!num(m.pedido)) return null
      const bitmap = esBitmap(m.bitmap) ? m.bitmap : null
      return { tipo: 'foto', pedido: m.pedido as number, bitmap, ancho: num(m.ancho) ? m.ancho as number : bitmap?.width ?? 0,
        alto: num(m.alto) ? m.alto as number : bitmap?.height ?? 0, ms: num(m.ms) ? m.ms as number : undefined,
        error: typeof m.error === 'string' ? m.error.slice(0, 300) : undefined }
    }
    case 'despierta': return num(m.pedido) ? { tipo: 'despierta', pedido: m.pedido as number } : null
    case 'rueda': {
      if (![m.x, m.y, m.deltaX, m.deltaY].every(num)) return null
      const tope = (v: number) => Math.max(-4000, Math.min(4000, v))
      return { tipo: 'rueda', x: m.x as number, y: m.y as number, deltaX: tope(m.deltaX as number), deltaY: tope(m.deltaY as number),
        deltaMode: m.deltaMode === 1 || m.deltaMode === 2 ? m.deltaMode : 0, ctrlKey: m.ctrlKey === true, metaKey: m.metaKey === true, shiftKey: m.shiftKey === true,
        ...(num(m.wheelDeltaY) ? { wheelDeltaY: tope(m.wheelDeltaY as number) } : {}) }
    }
    case 'gesto': {
      if (m.fase !== 'ini' && m.fase !== 'mov' && m.fase !== 'fin') return null
      const escala = num(m.escala) && (m.escala as number) > 0 ? Math.min(20, m.escala as number) : 1
      return { tipo: 'gesto', fase: m.fase, escala, x: num(m.x) ? m.x as number : 0, y: num(m.y) ? m.y as number : 0 }
    }
    default: return null
  }
}

/** `isla.json`: la ficha de cada isla (la escribe el agente ISLAS; la lee `/api/canvas/doc`). */
export interface FichaIsla {
  id: string
  titulo: string
  /** Tamaño LÓGICO de su diseño en px CSS: el ancho manda la escala (la cámara lo escala entero, sin remaquetar). */
  ancho: number
  alto: number
  /** Las fuentes que lee: el lienzo las pide antes de despertarla y rehace su foto cuando cambian. */
  fuentes: string[]
  /** Los destinos de sus botones (documentación y prueba: el host valida cada acción igual). */
  acciones: string[]
}

export const ANCHO_LOGICO = 1440

/** `isla.json` con tolerancia: lo que no cumple se descarta campo por campo; sin `id` no es una isla. */
export function leerFicha(x: unknown): FichaIsla | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const id = typeof o.id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(o.id) ? o.id : null
  if (!id) return null
  const tam = (v: unknown, d: number) => (num(v) && (v as number) >= 120 && (v as number) <= 8000 ? Math.round(v as number) : d)
  const lista = (v: unknown, ok: (s: string) => boolean) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && ok(s)).slice(0, 40) : [])
  return {
    id,
    titulo: typeof o.titulo === 'string' && o.titulo.trim() ? o.titulo.trim().slice(0, 120) : id,
    ancho: tam(o.ancho, ANCHO_LOGICO),
    alto: tam(o.alto, 900),
    fuentes: [...new Set(lista(o.fuentes, s => FORMA_FUENTE.test(s)))],
    acciones: lista(o.acciones, s => s.length <= LARGO_DESTINO),
  }
}

/**
 * La huella de lo que la isla está pintando: archivo, tema y cada dato que recibió. Si cambia, la foto vieja ya no es fiel
 * y se rehace. Orden estable por fuente; los valores se serializan tal cual (un objeto con otro orden de llaves es otra
 * huella, y eso solo cuesta una foto de más).
 */
export function huellaDeDatos(hash: string, modo: Modo, datos: ReadonlyMap<string, { valor: unknown; estado: EstadoDato }>): string {
  const partes = [...datos.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([f, d]) => `${f}=${d.estado}:${JSON.stringify(d.valor ?? null)}`)
  let h = 2166136261
  const s = `${hash}|${modo}|${partes.join('|')}`
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return `${hash}|${modo}|${(h >>> 0).toString(36)}`
}
