/**
 * Business Intelligence (7 nov 2026) · el catálogo cerrado de consultas. Daniel: «no solo mostrar datos, explicar lo que
 * ves. Sino actuar». Una pregunta nueva NUNCA ejecuta SQL libre: Levy elige una consulta de esta lista y el servidor la
 * corre con sus parámetros permitidos. Agregar una consulta = agregarla aquí y su ejecutor en servidor.ts.
 *
 * Fuentes y reglas (skill business-intelligence): Polar manda en el dinero (el libro de órdenes de sales_reconcile.py);
 * `daily_business_metrics` da visitas (personas distintas por día), suscripciones y comunidad; `funnel_events`, país.
 * `payment_verified` no es una venta y `community_purchases` no es dinero: ninguna consulta los usa. YouTube (8 nov): el
 * sensor de marketing (`marketing_canales.py`) da vistas por día del canal; los clics a la comunidad salen de `link_clicks`.
 * Lógica pura (sin React ni fs): la usan la vista, la API, la CLI de Levy y node:test.
 */

export type Tipo = 'linea' | 'acumulado' | 'barras' | 'embudo' | 'proporcion'
/** Hacia dónde es bueno que se mueva el número: decide si salirse del corredor es placer (oro) o dolor (rojo). */
export type Mejor = 'arriba' | 'abajo' | null
export type Unidad = 'personas' | 'usd' | 'pagos' | 'suscripciones' | 'bajas' | 'miembros' | 'lecciones' | 'vistas' | 'clics' | 'altas'
/** youtube: el sensor de marketing (`store/marketing-canales.json`); enlaces: `link_clicks` en vivo; netas: Polar (altas) y las métricas conciliadas (bajas). */
export type Familia = 'metricas' | 'polar' | 'eventos' | 'youtube' | 'enlaces' | 'netas'

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
}

const DIARIA = 'SaaS Factory · métricas diarias (cierre 23:55)'
const POLAR = 'Polar · órdenes pagadas (conciliadas)'

export const CATALOGO: readonly Consulta[] = [
  {
    id: 'visitas', nombre: 'Visitas a la página de venta', que: 'Personas distintas que abrieron la página de venta cada día.',
    familia: 'metricas', fuente: DIARIA, tipo: 'linea', tipos: ['linea'], unidad: 'personas', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    propone: {
      dolor: 'Revisa qué video dejó de empujar: abre los enlaces rastreados de la semana y publica el siguiente con el enlace arriba.',
      placer: 'Algo empujó gente de más: averigua qué video o mención fue y repítelo esta semana mientras está caliente.',
    },
    ejemplos: ['¿Cuánta gente llega a la página de venta?', '¿Cuántas visitas tuve esta semana?'],
  },
  {
    id: 'clics', nombre: 'Clics al botón de compra', que: 'Personas distintas que tocaron el botón de compra de la página de venta.',
    familia: 'metricas', fuente: DIARIA, tipo: 'linea', tipos: ['linea'], unidad: 'personas', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    propone: {
      dolor: 'La página dejó de convencer o llegó gente menos lista: compara las visitas del mismo día antes de tocar el texto.',
      placer: 'Más gente quiere comprar: confirma que el pago no se atora (checkout) para no perderla.',
    },
    ejemplos: ['¿Cuántos tocan el botón de comprar?'],
  },
  {
    id: 'altas', nombre: 'Suscripciones nuevas', que: 'Órdenes de entrada pagadas en Polar (sin renovaciones ni pruebas en cero).',
    familia: 'polar', fuente: POLAR, tipo: 'linea', tipos: ['linea'], unidad: 'pagos', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    propone: {
      dolor: 'Entraron menos de lo normal: mira si bajaron las visitas (arriba del embudo) o el paso de clic a pago (abajo).',
      placer: 'Entraron más de lo normal: dales la bienvenida hoy y averigua de qué video vinieron para repetirlo.',
    },
    ejemplos: ['¿Cuántos se suscribieron esta semana?', '¿Cuántas ventas nuevas tuve?'],
  },
  {
    id: 'cobrado', nombre: 'Lo que entró', que: 'Dinero cobrado en Polar (nuevas y renovaciones, menos reembolsos), en dólares.',
    familia: 'polar', fuente: POLAR, tipo: 'acumulado', tipos: ['acumulado', 'linea'], unidad: 'usd', mejor: 'arriba', alarma: false, ventanas: [30],
    nota: 'Es lo cobrado, no el MRR: las anuales entran de golpe el día que se pagan.',
    ejemplos: ['¿Cuánto dinero entró este mes?', '¿Voy mejor que el mes pasado?'],
  },
  {
    id: 'ventas-por-video', nombre: 'Pagos por video', que: 'Pagos de entrada en Polar atribuidos al video que trajo a la persona.',
    familia: 'polar', fuente: POLAR, tipo: 'barras', tipos: ['barras'], unidad: 'pagos', mejor: 'arriba', alarma: false, ventanas: VENTANAS,
    nota: 'Atribución parcial: los pagos sin enlace rastreado quedan «sin video», nunca en cero.',
    ejemplos: ['¿Qué video trajo más pagos este mes?', '¿Qué video vende?'],
  },
  {
    id: 'embudo-web', nombre: 'Del clic al pago', que: 'Cuántas personas pasan por cada paso de la página de venta al registro.',
    familia: 'metricas', fuente: DIARIA, tipo: 'embudo', tipos: ['embudo'], unidad: 'personas', mejor: 'arriba', alarma: false, ventanas: VENTANAS,
    nota: 'Cada paso cuenta personas distintas por día; la suma de días puede repetir a alguien que volvió otro día.',
    ejemplos: ['¿Dónde se cae la gente antes de pagar?', '¿Cómo va mi embudo?'],
  },
  {
    id: 'suscriptores', nombre: 'Suscripciones activas', que: 'Suscripciones activas en Polar al cierre de cada día.',
    familia: 'metricas', fuente: 'Polar · conciliado cada noche (23:30)', tipo: 'linea', tipos: ['linea'], unidad: 'suscripciones', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    propone: {
      dolor: 'Se fueron más de los que entraron: abre las bajas de la semana y escríbele a quien canceló para saber por qué.',
      placer: 'Creciste más rápido de lo normal: es buen momento para pedir testimonios a los nuevos.',
    },
    ejemplos: ['¿Cuántos suscriptores tengo?', '¿Estoy creciendo?'],
  },
  {
    id: 'bajas', nombre: 'Bajas', que: 'Suscripciones que terminaron ese día en Polar.',
    familia: 'metricas', fuente: 'Polar · conciliado cada noche (23:30)', tipo: 'linea', tipos: ['linea'], unidad: 'bajas', mejor: 'abajo', alarma: true, ventanas: VENTANAS,
    propone: {
      dolor: 'Se fueron más de lo normal: revisa si fue un cobro fallido (se recupera) o una cancelación (se pregunta por qué).',
      placer: 'Casi nadie se fue: lo que estés haciendo en la comunidad está reteniendo; anótalo.',
    },
    ejemplos: ['¿Cuántos se dan de baja?', '¿Cuánto churn tengo?'],
  },
  {
    id: 'mrr', nombre: 'MRR', que: 'Lo que vale al mes lo ya suscrito: mensuales más anuales ÷ 12, en dólares.',
    familia: 'metricas', fuente: 'Polar · conciliado cada noche (23:30)', tipo: 'linea', tipos: ['linea'], unidad: 'usd', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    nota: 'El MRR no es lo que entra a la cuenta: para caja, «Lo que entró».',
    propone: {
      dolor: 'El valor mensual bajó fuera de lo normal: cruza con bajas y con cambios de plan del mismo día.',
      placer: 'El valor mensual subió fuera de lo normal: probablemente anuales nuevas; confirma en Polar.',
    },
    ejemplos: ['¿Cuál es mi MRR?', '¿Cuánto vale mi negocio al mes?'],
  },
  {
    id: 'comunidad', nombre: 'Miembros activos', que: 'Miembros que ganaron puntos ese día (publicaron, comentaron o completaron lecciones).',
    familia: 'metricas', fuente: DIARIA, tipo: 'linea', tipos: ['linea'], unidad: 'miembros', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    propone: {
      dolor: 'La comunidad se apagó: un post con pregunta abierta o un reto de una semana la vuelve a mover.',
      placer: 'La comunidad se movió de más: mira qué post lo provocó y conviértelo en ritual.',
    },
    ejemplos: ['¿Está viva la comunidad?', '¿Cuántos participan?'],
  },
  {
    id: 'lecciones', nombre: 'Lecciones completadas', que: 'Lecciones que terminaron los miembros ese día.',
    familia: 'metricas', fuente: DIARIA, tipo: 'linea', tipos: ['linea'], unidad: 'lecciones', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    propone: {
      dolor: 'Dejaron de estudiar: revisa si la última lección nueva atora o si falta anunciarla.',
      placer: 'Estudiaron de más: algo nuevo los enganchó; pregunta qué y haz más de eso.',
    },
    ejemplos: ['¿Están estudiando?', '¿Cuántas lecciones completan?'],
  },
  {
    id: 'dispositivo', nombre: 'Teléfono o computadora', que: 'Desde qué aparato abren la página de venta.',
    familia: 'metricas', fuente: DIARIA, tipo: 'proporcion', tipos: ['proporcion', 'barras'], unidad: 'personas', mejor: null, alarma: false, ventanas: VENTANAS,
    ejemplos: ['¿Desde dónde me ven?', '¿Me ven más en el teléfono?'],
  },
  {
    id: 'origen', nombre: 'De dónde llegan', que: 'Visitas que vinieron de YouTube contra las que llegaron directo.',
    familia: 'metricas', fuente: DIARIA, tipo: 'proporcion', tipos: ['proporcion', 'barras'], unidad: 'personas', mejor: null, alarma: false, ventanas: VENTANAS,
    ejemplos: ['¿Cuánto me trae YouTube?', '¿De dónde llega la gente?'],
  },
  {
    id: 'vistas-canal', nombre: 'Vistas de tu canal', que: 'Vistas por día de tu canal principal de YouTube: la gente que te descubre.',
    familia: 'youtube', fuente: 'YouTube Analytics · tu canal principal', tipo: 'linea', tipos: ['linea'], unidad: 'vistas', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    nota: 'YouTube publica cada día con 1 a 3 días de retraso: la gráfica llega hasta el último día que ya dio.',
    propone: {
      dolor: 'Te están descubriendo menos: revisa si bajaron las impresiones (YouTube te mostró menos) o el CTR (te mostró igual pero no hicieron clic).',
      placer: 'Algo te está mostrando de más: mira qué video empuja las vistas de la semana y haz el siguiente sobre lo mismo.',
    },
    ejemplos: ['¿Cuánta gente me descubre por semana?', '¿Cuántas vistas tuvo mi canal?', '¿Está creciendo mi canal?'],
  },
  {
    id: 'clics-por-video', nombre: 'Clics a la comunidad por video', que: 'Clics en los enlaces rastreados de cada video hacia la comunidad.',
    familia: 'enlaces', fuente: 'Enlaces rastreados · clics a la comunidad', tipo: 'barras', tipos: ['barras'], unidad: 'clics', mejor: 'arriba', alarma: false, ventanas: VENTANAS,
    nota: 'Cuenta clics, no personas distintas. Los enlaces que no identifican un video (el genérico del canal o uno sin video asociado) van aparte, nunca en cero.',
    ejemplos: ['¿Qué video trae más gente a la comunidad?', '¿Qué video manda más clics?'],
  },
  {
    id: 'altas-netas', nombre: 'Altas netas de SaaS Factory', que: 'Suscripciones nuevas menos bajas de cada día: si la comunidad crece o se encoge.',
    familia: 'netas', fuente: 'Polar · altas (órdenes de entrada) menos bajas (conciliado 23:30)', tipo: 'linea', tipos: ['linea'], unidad: 'altas', mejor: 'arriba', alarma: true, ventanas: VENTANAS,
    nota: 'El día sin conciliar con Polar queda sin medir, nunca en cero.',
    propone: {
      dolor: 'Se fue más gente de la que entró: abre las bajas del día y separa cobro fallido (se recupera) de cancelación (se pregunta por qué).',
      placer: 'Entró mucha más gente de la que se fue: averigua de qué video vinieron y dales la bienvenida hoy.',
    },
    ejemplos: ['¿Cuántas altas netas tengo?', '¿Crece o se encoge SaaS Factory?', 'Altas menos bajas'],
  },
  {
    id: 'paises', nombre: 'Países', que: 'Personas distintas que abrieron la página de venta, por país.',
    familia: 'eventos', fuente: 'SaaS Factory · eventos del embudo', tipo: 'barras', tipos: ['barras', 'proporcion'], unidad: 'personas', mejor: null, alarma: false, ventanas: VENTANAS,
    nota: 'Depende de que cada visita traiga su país; la que no lo trae se cuenta aparte, nunca como cero.',
    ejemplos: ['¿De qué países me visitan?', '¿Dónde está mi audiencia?'],
  },
]

const POR_ID = new Map(CATALOGO.map(c => [c.id, c]))
export const consultaDe = (id: string): Consulta | null => POR_ID.get(id) ?? null
export const esVentana = (v: unknown): v is Ventana => (VENTANAS as readonly unknown[]).includes(v)

/** Las unidades en palabras para una cifra («personas», «pagos»); singular cuando toca. */
const PALABRA: Record<Unidad, [string, string]> = {
  personas: ['persona', 'personas'], usd: ['dólar', 'dólares'], pagos: ['pago', 'pagos'], suscripciones: ['suscripción', 'suscripciones'],
  bajas: ['baja', 'bajas'], miembros: ['miembro', 'miembros'], lecciones: ['lección', 'lecciones'],
  vistas: ['vista', 'vistas'], clics: ['clic', 'clics'], altas: ['alta neta', 'altas netas'],
}
export const palabra = (u: Unidad, n: number) => PALABRA[u][Math.abs(Math.round(n)) === 1 ? 0 : 1]

/** Una cifra como la lee una persona: «1,240», «$8,512 USD». Todo lo que no es dinero se cuenta en enteros (no hay 5.7 pagos). */
export function cifra(n: number, u: Unidad): string {
  if (u === 'usd') return `$${Math.round(n).toLocaleString('es-MX')} USD`
  // Altas netas: el signo dice si creció o se encogió («+3», «−2»).
  if (u === 'altas') return `${Math.round(n) > 0 ? '+' : Math.round(n) < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('es-MX')}`
  return Math.round(n).toLocaleString('es-MX')
}

/** El catálogo como lo lee Levy en la CLI: una línea por consulta, con lo permitido. */
export function catalogoEnTexto(): string {
  return CATALOGO.map(c => `- ${c.id} · ${c.nombre}: ${c.que} Tipos: ${c.tipos.join('|')} (por defecto ${c.tipo}). Ventanas: ${c.ventanas.join('|')} días.${c.alarma ? ' Con alarma.' : ''}${c.nota ? ` Nota: ${c.nota}` : ''} Ej.: ${c.ejemplos.map(e => `«${e}»`).join(' ')}`).join('\n')
}
