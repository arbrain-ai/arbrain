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

/** Modo de permisos de Levy (grupal 23 oct 2026; Autónomo 0.2.15). Mismos ids que `server/src/cliente/modo-permisos.ts`. */
export type ModoPermisos = 'preguntar' | 'carpeta' | 'autonomo'
export type ViaConsentimiento = 'bienvenida' | 'ajustes' | 'pildora' | 'pausa' | 'migracion' | 'version' | 'modelo'
/** Lo que la persona aceptó, tal como lo guardó el daemon (fecha, versión y huella del texto, app, sistema, por dónde). */
export interface Consentimiento { ts: number; version: string; sha256: string; app: string; so: string; via: string }
/** El texto del modo Autónomo que empaqueta el daemon: la app lo muestra tal cual y devuelve versión y huella al aceptar. */
export interface TextoAutonomia { version: string; sha256: string; titulo: string; cuerpo: string; casillas: string[]; aviso: string }
export interface AvisoPermisos { id: string; texto: string; como: string }
export interface EntradaHistorialModo { ts: number; accion: string; modo: ModoPermisos; via?: string; motivo?: string; texto?: { version: string; sha256: string } }
export interface EstadoPermisosLevy {
  modo: ModoPermisos
  modos: ModoPermisos[]
  sandbox: boolean
  consentimiento?: Consentimiento | null
  /** El consentimiento guardado es de otra versión del texto: Autónomo no aplica hasta aceptar la nueva. */
  reaceptar?: boolean
  /** Venía de «Sin preguntar» o del freno quitado (versiones anteriores): se ofrece Autónomo una vez. */
  migracion?: 'libre' | 'sinFreno' | null
  historialModo?: EntradaHistorialModo[]
  texto?: TextoAutonomia
  avisos?: AvisoPermisos[]
  /** A13 (0.2.15): su teléfono y su correo; mandarse algo a sí misma no cuenta como «transmitir datos». */
  misDatos?: { telefono: string; correo: string }
}

export const NOMBRE_MODO: Record<ModoPermisos, string> = { preguntar: 'Preguntar siempre', carpeta: 'Automático en mi carpeta', autonomo: 'Autónomo' }

/** Lo que ni Autónomo deja pasar, en una línea (para el menú del modelo, Ajustes y la franja de pausa). */
export const RED_MINIMA = 'Dinero, tus secretos, sus propios permisos y los borrados grandes se niegan solos; mandar a muchas personas, o a alguien que no nombraste, te lo enseña antes.'

export const FICHAS_MODO: ReadonlyArray<{ modo: ModoPermisos; nombre: string; detalle: string; recomendado?: boolean }> = [
  { modo: 'autonomo', nombre: 'Autónomo', recomendado: true, detalle: 'Hace lo que le pides sin pedirte un clic en cada paso. Nunca toca tu dinero ni tus contraseñas, no borra en masa y te enseña antes de mandar algo a muchas personas o a alguien que no nombraste.' },
  { modo: 'carpeta', nombre: 'Automático en mi carpeta', detalle: 'Trabaja solo dentro de tu cerebro y de tus carpetas agregadas: lee, busca, crea y edita archivos, y ajusta sus instrucciones y skills. Te pregunta antes de lo que sale de tu computadora: comandos que instalan o usan internet, páginas nuevas, enviar, borrar y publicar.' },
  { modo: 'preguntar', nombre: 'Preguntar siempre', detalle: 'Te pide tu clic para casi todo lo que no sea leer y escribir notas dentro de tu cerebro. Ideal para tus primeros días.' },
]

/** Aviso que se ve mientras Autónomo está activo (Ajustes, el menú del modelo y la franja de pausa). */
export function avisoAutonomo(desde: number | null | undefined, ahora = Date.now()): string {
  return `Modo Autónomo${desde ? ` desde ${horaDe(desde, ahora)}` : ''}: Levy actúa sin preguntarte, salvo la red mínima.`
}

/** ¿El consentimiento guardado vale para el texto que empaqueta esta versión? Si no, hay que volver a aceptar. */
export function consentimientoVigente(e: Pick<EstadoPermisosLevy, 'consentimiento' | 'texto'>): boolean {
  return !!e.consentimiento && !!e.texto && e.consentimiento.version === e.texto.version && e.consentimiento.sha256 === e.texto.sha256
}

/** Lo que se manda al daemon para aceptar Autónomo: la versión y la huella que vinieron en el GET; la app no las inventa. */
export function cuerpoAceptacion(texto: TextoAutonomia, via: ViaConsentimiento): { modo: 'autonomo'; acepto: { version: string; sha256: string }; via: ViaConsentimiento } {
  return { modo: 'autonomo', acepto: { version: texto.version, sha256: texto.sha256 }, via }
}
/**
 * Menú del modelo del chat (30 oct 2026, Daniel: «el modo autónomo debería poder cambiarlo dando clic al modelo button»).
 * Dos lados: Autónomo y Preguntar («Preguntar siempre» y «Automático en mi carpeta» cuentan como Preguntar).
 */
export type LadoPermisos = 'autonomo' | 'preguntar'
export const ladoDelModo = (modo: ModoPermisos): LadoPermisos => (modo === 'autonomo' ? 'autonomo' : 'preguntar')

/** Qué hace elegir un lado: nada (ya está), mandarlo al daemon, o abrir Ajustes para leer y aceptar el texto de Autónomo. */
export type AccionLado = { tipo: 'nada' } | { tipo: 'mandar'; cuerpo: { modo: ModoPermisos; via: 'modelo' } } | { tipo: 'ajustes' }
export function accionAlElegirLado(lado: LadoPermisos, e: Pick<EstadoPermisosLevy, 'modo' | 'consentimiento' | 'texto'>): AccionLado {
  if (ladoDelModo(e.modo) === lado) return { tipo: 'nada' }
  // Volver a preguntar = «Automático en mi carpeta», igual que la píldora de antes y la franja de pausa.
  if (lado === 'preguntar') return { tipo: 'mandar', cuerpo: { modo: 'carpeta', via: 'modelo' } }
  return consentimientoVigente(e) ? { tipo: 'mandar', cuerpo: { modo: 'autonomo', via: 'modelo' } } : { tipo: 'ajustes' }
}

/** Una línea bajo los dos lados: qué hace el modo en el que está. */
export const LINEA_MODO: Record<ModoPermisos, string> = {
  autonomo: 'Actúa sin pedirte un clic en cada paso, salvo la red mínima.',
  carpeta: 'Trabaja en tu carpeta y te pregunta antes de lo que sale de tu computadora.',
  preguntar: 'Te pide tu clic para casi todo.',
}

/** Dónde están «Pausar todo» y el modo (Ajustes y la bienvenida lo dicen igual). */
export const DONDE_PAUSAR = 'Detiene en el acto lo que Levy esté haciendo (respuestas, rutinas, comandos) y no deja empezar nada hasta que reanudes. También está en el chat: toca el botón del modelo (abajo, junto a donde escribes) y elige «Pausar todo»; ahí mismo cambias entre Autónomo y Preguntar.'

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
