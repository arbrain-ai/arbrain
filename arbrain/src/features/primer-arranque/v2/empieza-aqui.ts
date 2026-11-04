/**
 * «Empieza aquí 0 de 5» de la pantalla «Tu socio estratega» (onboarding v2, 3 nov 2026). Módulo puro.
 *
 * Copia la mecánica del «Get started 0 of 5» de Cloudroom v140 (`ActivationChecklist.tsx`, `activation.ts`): cinco
 * casillas que se marcan SOLAS por una señal del sistema (nunca con un clic de «ya lo hice»), una vez hecha se queda
 * hecha, «Ocultar» la esconde 8 horas y desaparece para siempre al completar las cinco. Tocar una casilla llena la caja
 * de escribir con su pedido, sin enviarlo; la del teléfono abre Ajustes.
 *
 * Adapta el contenido: en Cloudroom son hitos de uso de la herramienta; aquí son las cinco casillas de la Semana 1 del
 * programa, atadas a resultados de negocio (tu camino, tu meta en número, tu ritual, tu teléfono, tu primer loop).
 * El teléfono y los loops tienen dueño propio (docs/builds/arbrain-connect-2026-11-03 y docs/builds/loops-negocio-2026-11-03):
 * aquí solo se apunta a su vista y se lee su señal.
 */
export const CASILLAS = ['camino', 'meta', 'ritual', 'telefono', 'loop'] as const
export type Casilla = typeof CASILLAS[number]

export interface DatosCasilla {
  id: Casilla
  titulo: string
  /** Para qué sirve, en una línea y en resultado. */
  para: string
  /** Qué tiene que pasar para que se marque sola. Se lee en el SPEC; la señal la entrega el servidor. */
  hechaCuando: string
  /** Lo que se escribe en la caja al tocarla (no se envía). Sin pedido, la casilla abre `abre`. */
  pedido?: string
  abre?: string
}

export const DATOS_CASILLA: Record<Casilla, DatosCasilla> = {
  camino: {
    id: 'camino',
    titulo: 'Revisa tu camino',
    para: 'Lo que tu socio entendió de ti: quién eres, qué vendes, a quién y en qué fase vas.',
    hechaCuando: 'Tu expediente existe y lo confirmaste en «Mi camino».',
    pedido: 'Muéstrame mi camino: quién soy, qué vendo, a quién, en qué fase voy y qué te falta saber de mí.',
  },
  meta: {
    id: 'meta',
    titulo: 'Tu meta en un número',
    para: 'Cuánto al mes y para cuándo. Todo lo demás se mide contra ese número.',
    hechaCuando: 'Tu plan tiene una meta con cantidad y fecha.',
    pedido: 'Esta es mi meta: [cuánto] al mes para el [fecha]. Guárdala en mi plan y dime qué tendría que pasar esta semana.',
  },
  ritual: {
    id: 'ritual',
    titulo: 'Tu ritual de la mañana',
    para: 'Un «buenos días» y tu socio te dice qué mueve la aguja hoy.',
    hechaCuando: 'Le escribiste «buenos días» por la mañana y te respondió con tu día.',
    pedido: 'Buenos días',
  },
  telefono: {
    id: 'telefono',
    titulo: 'Tu socio en tu teléfono',
    para: 'Te avisa cuando te necesita, aunque no estés frente a la computadora.',
    hechaCuando: 'Tu teléfono entró a tu Arbrain y tiene los avisos encendidos.',
    abre: '/settings?seccion=telefono',
  },
  loop: {
    id: 'loop',
    titulo: 'Activa tu primer loop de negocio',
    para: 'Un proceso de tu negocio corriendo solo: tu socio lo hace, te avisa y lo mide.',
    hechaCuando: 'Tienes un loop de negocio activo (la señal la define la vista de Loops).',
    pedido: 'Quiero activar mi primer loop de negocio: [el proceso que más odio], cada [cuándo]. Hazlo una vez conmigo y luego déjalo corriendo.',
  },
}

/** Señales del sistema: `true` = ya pasó. Lo que el servidor no sabe medir llega como `false`, nunca como hecho. */
export type Senales = Partial<Record<Casilla, boolean>>

/** Lo guardado: casillas ya hechas (no se desmarcan) y hasta cuándo está oculta la tarjeta. */
export interface Guardado { hechas: Casilla[]; ocultaHasta: number | null }

export const OCULTAR_MS = 8 * 60 * 60 * 1000

/** Une lo guardado con lo que dicen las señales: una casilla hecha se queda hecha aunque la señal se pierda. */
export function hechas(guardado: Guardado, senales: Senales): Set<Casilla> {
  const s = new Set<Casilla>(guardado.hechas.filter((c): c is Casilla => (CASILLAS as readonly string[]).includes(c)))
  for (const c of CASILLAS) if (senales[c] === true) s.add(c)
  return s
}

export interface Progreso { hechas: number; total: number; siguiente: Casilla | null; completa: boolean }

export function progreso(h: Set<Casilla>): Progreso {
  const siguiente = CASILLAS.find(c => !h.has(c)) ?? null
  return { hechas: h.size, total: CASILLAS.length, siguiente, completa: siguiente === null }
}

/** ¿Se ve la tarjeta? No si las cinco están hechas (para siempre) o si se ocultó hace menos de 8 horas. */
export function visible(guardado: Guardado, h: Set<Casilla>, ahora = Date.now()): boolean {
  if (progreso(h).completa) return false
  return !(guardado.ocultaHasta && guardado.ocultaHasta > ahora)
}

export function ocultar(guardado: Guardado, ahora = Date.now()): Guardado {
  return { ...guardado, ocultaHasta: ahora + OCULTAR_MS }
}

/** Lo que se guarda tras leer las señales (solo crece). */
export function guardar(guardado: Guardado, h: Set<Casilla>): Guardado {
  return { ...guardado, hechas: CASILLAS.filter(c => h.has(c)) }
}
