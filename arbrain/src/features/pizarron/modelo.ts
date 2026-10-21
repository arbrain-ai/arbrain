/**
 * El pizarrón (7 oct 2026) · modelo compartido del cliente.
 *
 * Una sesión es un REGISTRO: los pasos que Levy fue escribiendo (sesion.json, lo escribe la herramienta `pizarron` del
 * MCP cabina: arbrain/server/src/cabina/pizarron.ts) y los gestos del alumno (eventos.jsonl, los escribe esta app). Con
 * los dos se reconstruye el pizarrón en cualquier momento, se reproduce y se exporta a video.
 * Vive en el repo: docs/pizarron/{sesiones,biblioteca,alumnos}.
 */

export type Lado = 'derecha' | 'izquierda' | 'arriba' | 'abajo'
export type Lugar = Lado | { x: number; y: number }
interface Base { id: string; junto?: string; lado?: Lado; lugar?: Lugar; oculto?: boolean }
export type Elemento =
  | (Base & { tipo: 'objeto'; objeto: string; params?: Record<string, unknown>; ancho?: number; alto?: number; titulo?: string })
  | (Base & { tipo: 'texto'; texto: string; estilo?: 'grande' | 'titulo' | 'nota' | 'formula'; ancho?: number })
  | (Base & { tipo: 'imagen'; imagen: string; ancho?: number; pie?: string })
  | (Base & { tipo: 'hilo'; de: string; a: string; f?: string })

export type ModoPrediccion = 'arrastra' | 'dibuja' | 'numero' | 'palabras'
export interface Prediccion { pregunta: string; modo: ModoPrediccion; en?: string; pista?: string; revela?: string; respuesta?: unknown }

export interface Paso {
  id: string; n: number; creado: string
  pon?: Elemento[]; quita?: string[]
  /** Lo que Levy dice, con acotaciones [[…]]. */
  voz?: string
  predice?: Prediccion
  luz?: 'papel' | 'noche'
  camara?: boolean
}

export interface ImagenSesion { archivo: string; ancho: number; alto: number; prompt?: string }
export interface Sesion {
  version: 1; id: string; tema: string; alumno: string
  documento?: string; conversacion?: string
  creada: string; actualizada: string; rev: number
  luz?: 'papel' | 'noche'
  pasos: Paso[]
  imagenes?: Record<string, ImagenSesion>
  cierre?: { en: string; entendido: string[]; palabras?: string; escritoEn: string[] }
}

export interface Ficha { id: string; nombre: string; ensena: string; temas?: string[]; params?: Record<string, unknown>; anclas?: string[]; metodos?: string[]; eventos?: string[]; ancho?: number; alto?: number; creado?: string; usos?: number }

/** Una línea de eventos.jsonl. `t` = ISO; `ms` = milisegundos desde que empezó la sesión en esta app (reproducción). */
export type Evento = { t: string; ms?: number } & (
  | { tipo: 'inicio-paso'; paso: string }
  | { tipo: 'fin-paso'; paso: string }
  | { tipo: 'gesto'; gesto: Gesto }
  | { tipo: 'respuesta'; paso: string; modo: ModoPrediccion; valor: unknown; foto?: string }
  | { tipo: 'mensaje'; texto: string }
  | { tipo: 'error'; donde: string; mensaje: string }
  | { tipo: 'declarado'; el: string; objeto: string; params: string[]; anclas: string[]; metodos: string[] }
)
export type Gesto =
  | { tipo: 'param'; el: string; param: string; valor: unknown }
  | { tipo: 'evento'; el: string; evento: string; datos: unknown }
  | { tipo: 'trazo'; id: string; puntos: [number, number][]; en?: string | null; pred?: string | null; tinta?: boolean; origen?: [number, number] | null }

/** Lo que devuelve GET /api/pizarron/sesion. */
export interface EstadoSesion {
  sesion: Sesion
  eventos: Evento[]
  objetos: Record<string, { codigo: string; ficha: Ficha | null }>
  imagenes: Record<string, { url: string; ancho: number; alto: number }>
}

export interface ResumenSesion { id: string; tema: string; creada: string; actualizada: string; pasos: number; cerrada: boolean; documento?: string }

export const ID_SESION = /^[a-z0-9][a-z0-9-]{2,90}$/
export const ID_OBJETO = /^[a-z0-9][a-z0-9-]{1,60}$/

/** El mensaje que el pizarrón deja en el chat para despertar a Levy. Prefijo fijo: Levy lo reconoce. */
export function mensajeDeRespuesta(sesion: string, tema: string, paso: string, modo: ModoPrediccion, valor: unknown): string {
  const v = valor as Record<string, unknown> | number | string
  let dicho: string
  if (modo === 'arrastra' && v && typeof v === 'object') dicho = 'u' in v ? `puse el alfiler en (${v.u}, ${v.v})` : `puse el alfiler en x=${v.x}, y=${v.y} del objeto`
  else if (modo === 'dibuja' && v && typeof v === 'object') dicho = `dibujé mi predicción (${(v.trazos as unknown[] | undefined)?.length ?? 0} trazo(s))`
  else dicho = String(v)
  return `✎ Pizarrón «${tema}» · ${paso} · mi predicción: ${dicho}\n(${sesion}; el detalle y la foto de mi trazo, con pizarron {accion:"leer"})`
}
