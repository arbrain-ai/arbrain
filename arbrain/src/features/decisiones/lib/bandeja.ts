/**
 * Bandeja de decisiones (autonomía v2, 3 nov 2026): lo que la web sabe de una tarjeta y las reglas puras de la vista.
 * La fuente es el daemon (`arbrain/server/src/autonomia/bandeja.ts`); aquí no se decide nada, solo se ordena y se dice.
 */

export type Respuesta = 'si' | 'no' | 'otro'
export type Clase = 'configurar' | 'agenda' | 'cohorte' | 'borrar_prueba' | 'contactar' | 'pagar' | 'borrar' | 'publicar' | 'legal'
export type Modo = 'hacer' | 'tocar' | 'nunca'
export type Preset = 'cauteloso' | 'equilibrado' | 'piloto'

export interface Tarjeta {
  id: string
  estado: 'pendiente' | 'en_cola' | 'permitida' | 'rechazada' | 'vencida' | 'usada' | 'corriendo' | 'corrida'
  tipo: 'permiso' | 'manos' | 'decision'
  categoria: 'enviar' | 'pagar' | 'borrar' | 'publicar' | 'otra'
  origen: 'agente' | 'manos' | 'cron'
  titulo: string
  recomendacion?: string
  recomienda?: 'si' | 'no'
  detalle?: string
  literal?: string
  botonSi?: string
  creada: number
  resuelta?: number
  respuesta?: Respuesta
  comentario?: string
  irreversible: boolean
  /** Quién la subió si no fue Levy en una conversación: «Loop · Cobranza pendiente» (loops de negocio). */
  de?: string
  /** Atada a una hora (3 nov 2026): a partir de aquí ya no aplica y vence sola. */
  vence?: number
  /** Contactar personas o pagar: nunca en «Sí a todas». */
  unaPorUna?: boolean
}

export interface HechoSolo { ts: string; clase: Clase; que: string; donde?: string; deshacer?: string; origen?: string; sesion?: string; conversacion?: unknown }
export interface Espera { dia: string; minutos: number; tarjetas: number; abiertas: number }
export interface PoliticaApp {
  preset: Preset
  vigente: Record<Clase, Modo>
  presets: { id: Preset; nombre: string; que: string }[]
  clases: { id: Clase; nombre: string; que: string; irreversible: boolean; modo: Modo }[]
  siempreTuyo: string[]
}
export interface VistaBandeja {
  pendientes: Tarjeta[]
  decididasHoy: Tarjeta[]
  /** Las que vencieron hoy sin respuesta porque su hora pasó: «ya no aplica» (nunca se ejecutan). */
  vencidasHoy?: Tarjeta[]
  espera: { hoy: Espera; ayer: Espera }
  hechoSolo: { hoy: HechoSolo[]; ayer: HechoSolo[] }
  politica: PoliticaApp
}

/** En orden: la que más lleva esperando primero. */
export const enOrden = (t: Tarjeta[]): Tarjeta[] => [...t].sort((a, b) => a.creada - b.creada)

/**
 * «Sí a todas» (3 nov 2026, Daniel vio un «Sí a las 6» que incluía contactar personas): solo agrupa las que Levy recomienda con Sí
 * y no contactan personas ni pagan. Contactar y pagar van una por una; «Córrelo tú» nunca va en lote. El daemon lo repite en el lote.
 */
export const UNA_POR_UNA: readonly Tarjeta['categoria'][] = ['enviar', 'pagar']
export const unaPorUna = (x: Tarjeta) => x.unaPorUna === true || UNA_POR_UNA.includes(x.categoria)
export const recomendadas = (t: Tarjeta[]): Tarjeta[] => t.filter(x => x.recomienda === 'si' && x.tipo !== 'manos' && !unaPorUna(x))

/** Cuánto se queda a la vista una que venció («ya no aplica») antes de irse al historial. */
export const VENCIDA_A_LA_VISTA_MS = 45 * 60_000
/** Las vencidas recientes que la franja todavía enseña tachadas. */
export const vencidasRecientes = (v: VistaBandeja | null, ahora = Date.now()): Tarjeta[] =>
  (v?.vencidasHoy ?? []).filter(t => t.resuelta && ahora - t.resuelta < VENCIDA_A_LA_VISTA_MS)

const VERBO: Record<Tarjeta['categoria'], string> = { enviar: 'Contactar', pagar: 'Pagar', borrar: 'Borrar', publicar: 'Publicar', otra: 'Decidir' }
export const etiquetaCategoria = (c: Tarjeta['categoria']) => VERBO[c]

/** La línea de la recomendación, en voz de Levy. */
export function lineaRecomendacion(t: Tarjeta): string | null {
  if (!t.recomendacion && !t.recomienda) return null
  const que = t.recomienda === 'no' ? 'Recomiendo que no' : 'Recomiendo que sí'
  return t.recomendacion ? `${que}: ${t.recomendacion.replace(/^(s[ií]|no)\s*[:,.-]\s*/i, '')}` : `${que}.`
}

/** «12 min», «1 h 5 min». */
export function minutos(n: number): string {
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60), m = n % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** La métrica del día, en una frase. */
export function fraseEspera(e: Espera | undefined): string {
  if (!e || !e.tarjetas) return 'Hoy el sistema no ha esperado por ti.'
  return `Hoy el sistema esperó ${minutos(e.minutos)} por ti (${e.tarjetas} ${e.tarjetas === 1 ? 'decisión' : 'decisiones'}${e.abiertas ? `, ${e.abiertas} abierta${e.abiertas === 1 ? '' : 's'}` : ''}).`
}

/** Hora corta de una acción («08:14»). */
export const hora = (ts: string | number, zona?: string) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, ...(zona ? { timeZone: zona } : {}) })

/** ¿Se puede pedir «Deshacer» desde la app? Solo si quedó ligada a una conversación (ahí lo hace Levy). */
export const deshacible = (h: HechoSolo) => !!(h.sesion || h.conversacion)

/** Qué responde cada botón, para el texto del estado de una tarjeta decidida. */
export function estadoDecidida(t: Tarjeta): string {
  if (t.respuesta === 'otro') return `Otro: «${t.comentario ?? ''}»`
  if (t.respuesta === 'si' || t.estado === 'usada' || t.estado === 'permitida') return 'Sí'
  if (t.respuesta === 'no' || t.estado === 'rechazada') return 'No'
  if (t.estado === 'vencida') return 'ya no aplica'
  return t.estado
}
