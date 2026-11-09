/**
 * Business Intelligence (7 nov 2026) · la forma de una consulta del catálogo cerrado. Daniel: «no solo mostrar datos,
 * explicar lo que ves. Sino actuar». Una pregunta nueva NUNCA ejecuta SQL libre: Levy elige una consulta de un catálogo y el
 * servidor la corre con sus parámetros permitidos.
 *
 * Dos catálogos con esta misma forma (8 nov, «este mismo sistema les compartiré a mis alumnos»): el del autor, con sus
 * consultas fijas (autor/catalogo.ts, no viaja a la copia del alumno), y el genérico (generico.ts), que cada dueño conecta
 * a sus fuentes desde `bi-fuentes.json`. Cuál rige en una instalación lo decide servidor.ts; la vista y la CLI reciben el
 * catálogo vigente y no saben cuál es.
 * Lógica pura (sin React ni fs): la usan la vista, la API, la CLI de Levy y node:test.
 */

export type Tipo = 'linea' | 'acumulado' | 'barras' | 'embudo' | 'proporcion'
/** Hacia dónde es bueno que se mueva el número: decide si salirse del corredor es placer (oro) o dolor (rojo). */
export type Mejor = 'arriba' | 'abajo' | null
/** `dinero` es dinero en la moneda del dueño (`moneda`); `registros` se cuenta con las palabras que diga la consulta. */
export type Unidad = 'personas' | 'usd' | 'pagos' | 'suscripciones' | 'bajas' | 'miembros' | 'lecciones' | 'vistas' | 'clics' | 'altas'
  | 'dinero' | 'ventas' | 'clientes' | 'registros'
/**
 * `datos`: una fuente que conectó el dueño (archivo o base) con el catálogo genérico. Las demás son del autor: youtube, el
 * sensor de marketing; enlaces, `link_clicks`; netas, Polar (altas) y las métricas conciliadas (bajas).
 */
export type Familia = 'metricas' | 'polar' | 'eventos' | 'youtube' | 'enlaces' | 'netas' | 'datos'

export const VENTANAS = [7, 30, 90] as const
export type Ventana = (typeof VENTANAS)[number]

export interface Consulta {
  id: string
  /** Cómo la nombra el dueño. */
  nombre: string
  /** Qué mide, en una línea, sin jerga. */
  que: string
  familia: Familia
  /** De dónde sale, como se lee en el sello de la gráfica. */
  fuente: string
  tipo: Tipo
  tipos: readonly Tipo[]
  unidad: Unidad
  mejor: Mejor
  /** ¿Puede encender la alarma? Solo series diarias con historia propia. */
  alarma: boolean
  ventanas: readonly Ventana[]
  /** Advertencia honesta que viaja con la gráfica (atribución parcial, MRR no es caja…). */
  nota?: string
  /** Lo que propone Levy cuando el número se sale de su corredor, por el lado del dolor y por el del placer. */
  propone?: { dolor: string; placer: string }
  /** Preguntas de ejemplo: le enseñan a Levy qué cae aquí y alimentan las sugerencias del panel. */
  ejemplos: string[]
  /** Moneda de `dinero` (MXN, USD, COP…). */
  moneda?: string
  /** Cómo se cuenta lo que mide, en singular y plural («cita», «citas»). Gana a la palabra de la unidad. */
  palabras?: readonly [string, string]
  /** Catálogo genérico: false mientras el dueño no le conecte una fuente; `falta` dice qué la conectaría. */
  conectada?: boolean
  falta?: string
}

export const esVentana = (v: unknown): v is Ventana => (VENTANAS as readonly unknown[]).includes(v)
export const consultaEn = (catalogo: readonly Consulta[], id: string): Consulta | null => catalogo.find(c => c.id === id) ?? null
/** Lo que es dinero no se pide ni se pinta en modo directo. */
export const esDinero = (c: Pick<Consulta, 'unidad'>) => c.unidad === 'usd' || c.unidad === 'dinero'

/** Las unidades en palabras para una cifra («personas», «pagos»); singular cuando toca. */
const PALABRA: Record<Unidad, [string, string]> = {
  personas: ['persona', 'personas'], usd: ['dólar', 'dólares'], pagos: ['pago', 'pagos'], suscripciones: ['suscripción', 'suscripciones'],
  bajas: ['baja', 'bajas'], miembros: ['miembro', 'miembros'], lecciones: ['lección', 'lecciones'],
  vistas: ['vista', 'vistas'], clics: ['clic', 'clics'], altas: ['alta neta', 'altas netas'], dinero: ['peso', 'pesos'],
  ventas: ['venta', 'ventas'], clientes: ['cliente', 'clientes'], registros: ['registro', 'registros'],
}
export const palabra = (u: Unidad, n: number, propias?: readonly [string, string]) => (propias ?? PALABRA[u])[Math.abs(Math.round(n)) === 1 ? 0 : 1]

/** Una cifra como la lee una persona: «1,240», «$8,512 USD». Todo lo que no es dinero se cuenta en enteros (no hay 5.7 pagos). */
export function cifra(n: number, u: Unidad, moneda = 'USD'): string {
  if (u === 'usd') return `$${Math.round(n).toLocaleString('es-MX')} USD`
  if (u === 'dinero') return `$${Math.round(n).toLocaleString('es-MX')} ${moneda}`
  // Altas netas: el signo dice si creció o se encogió («+3», «−2»).
  if (u === 'altas') return `${Math.round(n) > 0 ? '+' : Math.round(n) < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('es-MX')}`
  return Math.round(n).toLocaleString('es-MX')
}
/** La cifra y la palabra con lo que dice la consulta (su moneda, sus palabras). */
export const cifraDe = (n: number, c: Pick<Consulta, 'unidad' | 'moneda'>) => cifra(n, c.unidad, c.moneda)
export const palabraDe = (c: Pick<Consulta, 'unidad' | 'palabras'>, n: number) => palabra(c.unidad, n, c.palabras)

/** El catálogo como lo lee Levy en la CLI: una línea por consulta, con lo permitido y, si es genérico, si ya tiene fuente. */
export function catalogoEnTexto(catalogo: readonly Consulta[]): string {
  return catalogo.map(c => `- ${c.id} · ${c.nombre}${c.conectada === false ? ' [SIN FUENTE]' : ''}: ${c.que} Tipos: ${c.tipos.join('|')} (por defecto ${c.tipo}). Ventanas: ${c.ventanas.join('|')} días.${c.alarma ? ' Con alarma.' : ''}${c.nota ? ` Nota: ${c.nota}` : ''}${c.conectada === false && c.falta ? ` Falta: ${c.falta}` : ''} Ej.: ${c.ejemplos.map(e => `«${e}»`).join(' ')}`).join('\n')
}
