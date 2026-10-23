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
 * Lo que NINGÚN modo cambia: el freno (enviar, borrar, publicar y pagar siempre piden su clic; el dinero se niega), los
 * secretos y la carpeta de datos de la app (negados), escribir fuera del cerebro y de las carpetas abiertas (negado), los
 * ajustes y ganchos del cerebro y `.git` (negados), y una conversación que ya leyó contenido de afuera vuelve a pedir
 * clic para todo lo que tiene efecto (`endurecerContaminada`). Las rutinas (crons) no usan el modo: corren sin la
 * persona delante y conservan «preguntar».
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

const archivo = () => join(DIR_ARBRAIN(), 'permisos.json')
let cache: { ruta: string; mtime: number; modo: ModoPermisos } | null = null

export function modoPermisos(): ModoPermisos {
  try {
    const p = archivo()
    if (!existsSync(p)) return MODO_POR_DEFECTO
    const mtime = statSync(p).mtimeMs
    if (cache && cache.ruta === p && cache.mtime === mtime) return cache.modo
    const j = JSON.parse(readFileSync(p, 'utf8')) as { modo?: unknown }
    const modo = esModo(j.modo) ? j.modo : MODO_POR_DEFECTO
    cache = { ruta: p, mtime, modo }
    return modo
  } catch { return MODO_POR_DEFECTO }
}

export function fijarModoPermisos(modo: ModoPermisos, ahora = Date.now()): ModoPermisos {
  const p = archivo()
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 })
  writeFileSync(p, JSON.stringify({ modo, cambiado: ahora }, null, 1) + '\n', { mode: 0o600 })
  cache = null
  return modoPermisos()
}
