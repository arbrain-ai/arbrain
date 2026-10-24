/**
 * Modo de permisos del agente (grupal del 23 oct 2026: «demasiadas confirmaciones»; los alumnos terminaban saltándose
 * Arbrain con Claude Code para que dejara de preguntar). La persona lo elige en Ajustes › Permisos, con su clic (la
 * ruta exige el secreto de la app: un agente nunca cambia sus propios permisos).
 *
 *   preguntar  como hasta v0.2.9: todo lo que no es seguro por construcción pide su clic.
 *   carpeta    «Automático en mi carpeta» (por defecto): dentro de su cerebro y de las carpetas que abrió, Levy trabaja
 *              sin preguntar (comandos de solo lectura aunque el sistema no tenga sandbox, crear carpetas y archivos,
 *              escribir en sus carpetas abiertas, editar sus instrucciones y skills en Markdown). Fuera de ahí, pregunta.
 *   libre      «Sin preguntar»: todo lo que no es el freno ni un secreto corre sin clic (comandos, leer fuera de su
 *              carpeta, páginas nuevas, herramientas conectadas).
 *
 * Lo que NINGÚN modo cambia: el freno (enviar, borrar, publicar y pagar siempre piden su clic, salvo el interruptor de
 * abajo para los tres primeros; el dinero se niega), los
 * secretos y la carpeta de datos de la app (negados), escribir fuera del cerebro y de las carpetas abiertas (negado), los
 * ajustes y ganchos del cerebro y `.git` (negados), y una conversación que ya leyó contenido de afuera vuelve a pedir
 * clic para todo lo que tiene efecto (`endurecerContaminada`). Las rutinas (crons) no usan el modo: corren sin la
 * persona delante y conservan «preguntar».
 *
 * «Quitar también el freno (bajo mi responsabilidad)» (Daniel, 23 oct 2026, 16:40: «deberíamos tener un modo de
 * dangerously skip permissions bajo la recomendación del usuario»): interruptor opcional DENTRO de «Sin preguntar».
 * Solo se activa si la persona escribe `FRASE_SIN_FRENO` (se valida aquí, en el servidor, no solo en la UI) y con el
 * secreto de la app; libera ÚNICAMENTE enviar, borrar y publicar. Mover dinero, operar valores o cripto y los secretos
 * siguen negados; una conversación contaminada sigue preguntando; las rutinas no lo usan. Si el modo deja de ser
 * «libre», se apaga solo. Cada activación y desactivación queda con fecha en «Lo que hizo Levy» (la bitácora del
 * daemon, que la ruta escribe) y en `historialFreno` de este mismo archivo (no se poda con la bitácora).
 *
 * Vive en `<ARBRAIN_CONFIG_DIR>/permisos.json` (carpeta protegida de la app). Instalación de Daniel: no se usa.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'

export type ModoPermisos = 'preguntar' | 'carpeta' | 'libre'
export const MODOS: readonly ModoPermisos[] = ['preguntar', 'carpeta', 'libre']
export const MODO_POR_DEFECTO: ModoPermisos = 'carpeta'
export const esModo = (v: unknown): v is ModoPermisos => typeof v === 'string' && (MODOS as readonly string[]).includes(v)

/** Nombre que ve la persona en Ajustes (y que el agente usa para guiarla). */
export const NOMBRE_MODO: Record<ModoPermisos, string> = {
  preguntar: 'Preguntar siempre',
  carpeta: 'Automático en mi carpeta',
  libre: 'Sin preguntar',
}

/** Dónde se cambia, en las palabras de la app. */
export const DONDE_PERMISOS = 'Ajustes › Permisos y seguridad'
export const DONDE_CARPETAS = 'Ajustes › Permisos y seguridad › Carpetas a las que tu cerebro puede entrar'

/** La frase que la persona escribe para quitar el freno. La UI la muestra; el servidor la exige. */
export const FRASE_SIN_FRENO = 'quito el freno bajo mi responsabilidad'
/** Mayúsculas, espacios de más, comillas y el punto final no cuentan; las palabras sí, completas y en orden. */
export const normalizarFrase = (t: string): string =>
  t.normalize('NFC').toLowerCase().replace(/[«»"“”'‘’]/g, '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').trim()
export const fraseSinFrenoValida = (t: unknown): boolean => typeof t === 'string' && t.length <= 200 && normalizarFrase(t) === FRASE_SIN_FRENO
/** Lo que el freno quitado deja correr sin clic. Pagar no está: el dinero se niega siempre. */
export const LIBERA_SIN_FRENO = ['enviar', 'borrar', 'publicar'] as const

export interface EntradaHistorialFreno { ts: number; accion: 'activado' | 'desactivado'; motivo: string }
export interface EstadoPermisos {
  modo: ModoPermisos
  /** El freno quitado solo vale en «libre»: en cualquier otro modo es false aunque el archivo diga otra cosa. */
  sinFreno: boolean
  sinFrenoDesde: number | null
  historialFreno: EntradaHistorialFreno[]
}
const MAX_HISTORIAL = 50

const archivo = () => join(DIR_ARBRAIN(), 'permisos.json')
let cache: { ruta: string; mtime: number; estado: EstadoPermisos } | null = null
const DEFECTO = (): EstadoPermisos => ({ modo: MODO_POR_DEFECTO, sinFreno: false, sinFrenoDesde: null, historialFreno: [] })

function leerHistorial(v: unknown): EntradaHistorialFreno[] {
  if (!Array.isArray(v)) return []
  return v.filter((e): e is EntradaHistorialFreno => !!e && typeof e === 'object' && typeof (e as EntradaHistorialFreno).ts === 'number'
    && ((e as EntradaHistorialFreno).accion === 'activado' || (e as EntradaHistorialFreno).accion === 'desactivado'))
    .map(e => ({ ts: e.ts, accion: e.accion, motivo: String(e.motivo ?? '').slice(0, 200) })).slice(-MAX_HISTORIAL)
}

export function estadoPermisos(): EstadoPermisos {
  try {
    const p = archivo()
    if (!existsSync(p)) return DEFECTO()
    const mtime = statSync(p).mtimeMs
    if (cache && cache.ruta === p && cache.mtime === mtime) return cache.estado
    const j = JSON.parse(readFileSync(p, 'utf8')) as { modo?: unknown; sinFreno?: unknown; historialFreno?: unknown }
    const modo = esModo(j.modo) ? j.modo : MODO_POR_DEFECTO
    const desde = j.sinFreno && typeof j.sinFreno === 'object' && typeof (j.sinFreno as { desde?: unknown }).desde === 'number' ? (j.sinFreno as { desde: number }).desde : null
    const sinFreno = modo === 'libre' && desde !== null
    const estado: EstadoPermisos = { modo, sinFreno, sinFrenoDesde: sinFreno ? desde : null, historialFreno: leerHistorial(j.historialFreno) }
    cache = { ruta: p, mtime, estado }
    return estado
  } catch { return DEFECTO() }
}

export const modoPermisos = (): ModoPermisos => estadoPermisos().modo

function escribir(e: EstadoPermisos, ahora: number): void {
  const p = archivo()
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 })
  const cuerpo = { modo: e.modo, cambiado: ahora, ...(e.sinFreno && e.sinFrenoDesde !== null ? { sinFreno: { desde: e.sinFrenoDesde } } : {}), historialFreno: e.historialFreno.slice(-MAX_HISTORIAL) }
  writeFileSync(p, JSON.stringify(cuerpo, null, 1) + '\n', { mode: 0o600 })
  cache = null
}

/**
 * Cambia el modo. Si el freno estaba quitado y el modo deja de ser «libre», se apaga solo (y queda en el historial).
 * `frenoApagado` le dice a la ruta que lo anote en la bitácora.
 */
export function cambiarModoPermisos(modo: ModoPermisos, ahora = Date.now()): { estado: EstadoPermisos; frenoApagado: boolean } {
  const antes = estadoPermisos()
  const frenoApagado = antes.sinFreno && modo !== 'libre'
  const historialFreno = frenoApagado
    ? [...antes.historialFreno, { ts: ahora, accion: 'desactivado' as const, motivo: `el modo cambió a «${NOMBRE_MODO[modo]}»` }]
    : antes.historialFreno
  escribir({ modo, sinFreno: modo === 'libre' && antes.sinFreno, sinFrenoDesde: modo === 'libre' ? antes.sinFrenoDesde : null, historialFreno }, ahora)
  return { estado: estadoPermisos(), frenoApagado }
}

export function fijarModoPermisos(modo: ModoPermisos, ahora = Date.now()): ModoPermisos {
  return cambiarModoPermisos(modo, ahora).estado.modo
}

export type ResultadoSinFreno = { ok: true; estado: EstadoPermisos; cambio: boolean } | { ok: false; status: number; error: string }

/**
 * Quita o devuelve el freno. Quitarlo exige el modo «Sin preguntar» y la frase exacta; devolverlo, nada (es más
 * estricto, un clic). `cambio` = false si ya estaba así (no se anota dos veces).
 */
export function fijarSinFreno(activar: boolean, op: { frase?: unknown; ahora?: number } = {}): ResultadoSinFreno {
  const ahora = op.ahora ?? Date.now()
  const antes = estadoPermisos()
  if (!activar) {
    if (!antes.sinFreno) return { ok: true, estado: antes, cambio: false }
    escribir({ ...antes, sinFreno: false, sinFrenoDesde: null, historialFreno: [...antes.historialFreno, { ts: ahora, accion: 'desactivado', motivo: 'lo apagó la persona' }] }, ahora)
    return { ok: true, estado: estadoPermisos(), cambio: true }
  }
  if (antes.modo !== 'libre') return { ok: false, status: 409, error: `Quitar el freno solo existe dentro de «${NOMBRE_MODO.libre}». Elige ese modo primero.` }
  if (!fraseSinFrenoValida(op.frase)) return { ok: false, status: 400, error: `Para quitar el freno escribe exactamente: «${FRASE_SIN_FRENO}».` }
  if (antes.sinFreno) return { ok: true, estado: antes, cambio: false }
  escribir({ ...antes, sinFreno: true, sinFrenoDesde: ahora, historialFreno: [...antes.historialFreno, { ts: ahora, accion: 'activado', motivo: 'la persona escribió la frase de confirmación' }] }, ahora)
  return { ok: true, estado: estadoPermisos(), cambio: true }
}
