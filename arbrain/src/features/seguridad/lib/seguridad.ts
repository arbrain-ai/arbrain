/**
 * Seguridad del alumno (12 oct 2026; docs/builds/seguridad-alumno-2026-10-12/AUDITORIA.md): lógica pura de la vista
 * «Lo que hizo Levy», el freno «Pausar todo», las carpetas abiertas y el tope de gasto. Sin React (se prueba con
 * node:test). Los datos vienen del daemon ya redactados; aquí solo se dan forma y textos.
 */

export type DecisionBitacora = 'hecho' | 'confirmado' | 'rechazado' | 'vencido' | 'sin_respuesta' | 'negado' | 'pausado'

export interface AccionBitacora {
  id: number
  ts: number
  origen: 'agente' | 'cron'
  herramienta: string
  que: string
  decision: DecisionBitacora
  motivo?: string
  confirmacion?: string
}

export interface EstadoPausa { pausado: boolean; desde: number | null }

/** Modo de permisos de Levy (grupal 23 oct 2026). Mismos ids que `server/src/cliente/modo-permisos.ts`. */
export type ModoPermisos = 'preguntar' | 'carpeta' | 'libre'
export interface EstadoPermisosLevy { modo: ModoPermisos; modos: ModoPermisos[]; sandbox: boolean; sinFreno?: boolean; sinFrenoDesde?: number | null; frase?: string }

/**
 * «Quitar también el freno (bajo mi responsabilidad)» (23 oct 2026), dentro de «Sin preguntar». La frase y su
 * normalización son las de `server/src/cliente/modo-permisos.ts` (el daemon la vuelve a validar; esto solo habilita el
 * botón). El riesgo, en dos líneas, se muestra antes de activarlo.
 */
export const FRASE_SIN_FRENO = 'quito el freno bajo mi responsabilidad'
export const normalizarFrase = (t: string): string =>
  t.normalize('NFC').toLowerCase().replace(/[«»"“”'‘’]/g, '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').trim()
export const fraseCoincide = (t: string, frase: string = FRASE_SIN_FRENO): boolean => normalizarFrase(t) === normalizarFrase(frase)
export const RIESGO_SIN_FRENO: readonly [string, string] = [
  'Levy podrá enviar correos y mensajes, borrar archivos y publicar (subir código, desplegar, postear) sin pedirte clic: un error suyo o una instrucción escondida en lo que lee puede salir de tu computadora antes de que lo veas.',
  'Siguen bloqueados siempre: mover dinero, comprar, operar acciones o cripto y tocar tus llaves y secretos; y tras leer algo de afuera vuelve a preguntarte.',
]
export const NOMBRE_SIN_FRENO = 'Quitar también el freno (bajo mi responsabilidad)'
/** Aviso que se ve mientras está activo (Ajustes y la píldora de toda la app). */
export function avisoSinFreno(desde: number | null | undefined, ahora = Date.now()): string {
  return `Freno quitado${desde ? ` desde ${horaDe(desde, ahora)}` : ''}: Levy envía, borra y publica sin pedirte clic.`
}
export const FICHAS_MODO: ReadonlyArray<{ modo: ModoPermisos; nombre: string; detalle: string; recomendado?: boolean }> = [
  { modo: 'preguntar', nombre: 'Preguntar siempre', detalle: 'Te pide tu clic para casi todo lo que no sea leer y escribir notas dentro de tu cerebro. El más estricto.' },
  { modo: 'carpeta', nombre: 'Automático en mi carpeta', recomendado: true, detalle: 'Dentro de tu cerebro y de tus carpetas agregadas trabaja sin preguntarte: lee, busca, crea y edita archivos, y ajusta sus instrucciones y skills. Te pregunta para todo lo que sale de ahí (comandos que instalan o usan internet, páginas nuevas, otras carpetas).' },
  { modo: 'libre', nombre: 'Sin preguntar', detalle: 'Corre comandos, lee fuera de su carpeta, abre páginas y usa tus herramientas conectadas sin pedirte clic. Para cuando ya confías en lo que le encargas.' },
]
export interface CarpetaAbierta { ruta: string; abierta: number }

export interface GastoOpenRouter {
  usado: number; usadoHoy: number | null; usadoSemana: number | null; usadoMes: number | null
  limite: number | null; restante: number | null; reinicio: string | null; gratis: boolean
}
export interface RespuestaGasto {
  openrouter: { conectada: boolean; gasto: GastoOpenRouter | null; error: string | null }
  anthropic: { conectada: boolean; gastoDisponible: false }
  enlaces: { openrouterLlaves: string; openrouterCreditos: string; anthropicLimite: string; anthropicUso: string }
}

/** Enlaces oficiales para poner el límite (verificados en la doc de cada proveedor el 12 oct 2026). */
export const ENLACES_TOPE = {
  openrouterLlaves: 'https://openrouter.ai/settings/keys',
  anthropicLimite: 'https://platform.claude.com/settings/billing',
  anthropicUso: 'https://platform.claude.com/usage',
} as const

export const ETIQUETA_DECISION: Record<DecisionBitacora, { texto: string; tono: 'ok' | 'aviso' | 'freno' }> = {
  hecho: { texto: 'Hecho sin preguntar', tono: 'ok' },
  confirmado: { texto: 'Lo confirmaste', tono: 'ok' },
  rechazado: { texto: 'Lo rechazaste', tono: 'freno' },
  vencido: { texto: 'Venció sin respuesta', tono: 'aviso' },
  sin_respuesta: { texto: 'Esperó tu respuesta (no se hizo)', tono: 'aviso' },
  negado: { texto: 'Bloqueado por Arbrain', tono: 'freno' },
  pausado: { texto: 'En pausa', tono: 'aviso' },
}

/** Nombre humano de la herramienta. */
export function nombreHerramienta(h: string): string {
  const fijo: Record<string, string> = {
    Bash: 'Terminal', Write: 'Escribir archivo', Edit: 'Editar archivo', MultiEdit: 'Editar archivo', NotebookEdit: 'Editar cuaderno',
    WebFetch: 'Abrir página', Read: 'Leer archivo', Arbrain: 'Arbrain', mcp__cabina__despertador: 'Despertador',
  }
  if (fijo[h]) return fijo[h]
  const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(h)
  return m ? `${m[1]} · ${m[2].replace(/_/g, ' ')}` : h
}

/** Hora local corta; si no es de hoy, con la fecha. */
export function horaDe(ts: number, ahora = Date.now()): string {
  const d = new Date(ts), hoy = new Date(ahora)
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === hoy.toDateString() ? hora : `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · ${hora}`
}

/** Dinero de OpenRouter (créditos en dólares). */
export function usd(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return `US$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`
}

/** Resumen en una línea del gasto de la llave de OpenRouter, o null si no hay dato. */
export function resumenGasto(g: GastoOpenRouter | null): { linea: string; sinLimite: boolean; porcentaje: number | null } | null {
  if (!g) return null
  const reinicio = g.reinicio === 'daily' ? ' al día' : g.reinicio === 'weekly' ? ' a la semana' : g.reinicio === 'monthly' ? ' al mes' : ''
  if (g.limite === null) return { linea: `Llevas ${usd(g.usado)} con esta llave${g.usadoMes !== null ? ` (${usd(g.usadoMes)} este mes)` : ''}. No tiene límite.`, sinLimite: true, porcentaje: null }
  const usadoPeriodo = g.restante !== null ? Math.max(0, g.limite - g.restante) : g.usado
  const porcentaje = g.limite > 0 ? Math.min(100, Math.round((usadoPeriodo / g.limite) * 100)) : 100
  return { linea: `Llevas ${usd(usadoPeriodo)} de ${usd(g.limite)}${reinicio}. Te quedan ${usd(g.restante)}.`, sinLimite: false, porcentaje }
}
