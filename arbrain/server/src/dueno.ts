/**
 * Nombre del dueño de la instalación: la única fuente para todos los textos que leen el agente o la persona
 * (descripciones de herramientas, prompts, avisos del freno). Empaquetado del alumno, 11 oct 2026 (DECISIONES #9).
 *
 * Prioridad: `ARBRAIN_DUENO` > edición cliente («la persona») > `instalacion.json` de la carpeta de la instalación
 * original > «la persona». La copia del alumno no lleva esa carpeta, así que ahí nunca aparece otro nombre.
 *
 * La carpeta de la instalación original es la subcarpeta de `src/` que contiene `instalacion.json` (se descubre, no se
 * nombra aquí): sus crons, prompts e identidades no viajan con la app del alumno.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esEdicionCliente } from './edicion.js'

const aqui = dirname(fileURLToPath(import.meta.url))
export const MARCA_ORIGINAL = 'instalacion.json'

export interface Instalacion { cuentas_alternas?: { claude?: string; codex?: string; claude_extra?: string[] }; dueno?: string; personas_reporte?: string[]; equipo?: string[]; repo_txt?: string; perfil_id?: string; origen_respaldo?: string; sitios_vigilados?: string; lienzo_sistema_id?: string; consejo_origen_salud?: string; manos_perfil_defecto?: string; manos_perfil_trabajo?: string; manos_correo_trabajo?: string; perfiles_equipo?: Record<string, { nombre?: string; contexto?: string }> }
export interface CarpetaOriginal { nombre: string; src: string }

let cache: CarpetaOriginal | null | undefined
/** La carpeta de la instalación original (nombre y ruta dentro de src/), buscada desde src/ (tsx) o desde dist/. */
export function carpetaOriginal(): CarpetaOriginal | null {
  if (cache !== undefined) return cache
  cache = null
  for (const base of [aqui, join(aqui, '..', 'src')]) {
    let dirs: string[] = []
    try { dirs = readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) } catch { continue }
    const nombre = dirs.find(d => existsSync(join(base, d, MARCA_ORIGINAL)))
    if (nombre) { cache = { nombre, src: join(base, nombre) }; break }
  }
  return cache
}

/** Lee un JSON de la carpeta original, o null si no viaja. */
export function jsonOriginal<T>(archivo: string): T | null {
  const c = carpetaOriginal()
  if (!c) return null
  try { return JSON.parse(readFileSync(join(c.src, archivo), 'utf8')) as T } catch { return null }
}

export function instalacionOriginal(): Instalacion {
  return jsonOriginal<Instalacion>(MARCA_ORIGINAL) ?? {}
}

export function dueno(env: NodeJS.ProcessEnv = process.env): string {
  const explicito = (env.ARBRAIN_DUENO ?? '').trim()
  if (explicito) return explicito.slice(0, 60)
  if (esEdicionCliente(env)) return 'la persona'
  const d = instalacionOriginal().dueno
  return typeof d === 'string' && d.trim() ? d.trim() : 'la persona'
}

const mayuscula = (s: string) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1)

/** El dueño a mitad de frase («de la persona», «de Fulano»). */
export const DUENO = dueno()
/** El dueño al inicio de frase («La persona escribió…»). */
export const DUENO_M = mayuscula(DUENO)

/** Personas con reporte diario y pizarrón (vistas de la instalación original). La primera es el dueño. */
export const PERSONAS: readonly string[] = (() => {
  const p = instalacionOriginal().personas_reporte
  return Array.isArray(p) && p.length && p.every(x => typeof x === 'string' && /^[a-z]{2,30}$/.test(x)) ? p : ['dueno']
})()
export const PERSONA_DUENO = PERSONAS[0]

/** Quien comparte la operación con el dueño (vistas de equipo y finanzas). En la copia del alumno: «tu equipo». */
export const EQUIPO: readonly string[] = (() => { const e = instalacionOriginal().equipo; return Array.isArray(e) ? e.filter(x => typeof x === 'string') : [] })()
export const SEGUNDA = EQUIPO[0] ?? 'tu equipo'
/** Cómo se nombra la raíz del repo en las instrucciones al agente. */
export const REPO_TXT = (() => { const r = instalacionOriginal().repo_txt; return typeof r === 'string' && r ? r : '<raíz del cerebro>' })()
/** Los sitios que la vista «servidores» comprueba desde afuera (texto para el agente). */
export const SITIOS_VIGILADOS = (() => { const v = instalacionOriginal().sitios_vigilados; return typeof v === 'string' && v ? v : 'tus sitios públicos' })()

/**
 * Perfiles de Chrome de las manos web (13 oct 2026). Viven en `instalacion.json` de la instalación original (o en
 * `MANOS_PERFIL_DEFECTO`), nunca en el código: la copia del alumno no trae correos de nadie.
 *   defecto  correo del perfil al que va el trabajo web si nadie elige otro ('' = la extensión más reciente)
 *   trabajo  subcadena del correo del perfil de trabajo ('' = no hay perfil de trabajo configurado)
 *   correoTrabajo  correo completo del perfil de trabajo (para reconocerlo en un pedido y en los ejemplos)
 */
export function perfilesChrome(env: NodeJS.ProcessEnv = process.env): { defecto: string; trabajo: string; correoTrabajo: string } {
  const i = esEdicionCliente(env) ? {} as Instalacion : instalacionOriginal()
  const limpio = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
  return {
    defecto: limpio(env.MANOS_PERFIL_DEFECTO) || limpio(i.manos_perfil_defecto),
    trabajo: limpio(i.manos_perfil_trabajo),
    correoTrabajo: limpio(i.manos_correo_trabajo),
  }
}

/** Ejemplo para las descripciones de las herramientas: el perfil de trabajo real si existe, uno genérico si no. */
export function ejemploPerfilChrome(env: NodeJS.ProcessEnv = process.env): string {
  const p = perfilesChrome(env)
  return p.trabajo ? `«${p.trabajo}»${p.correoTrabajo ? ` para ${p.correoTrabajo}` : ''}` : '«empresa» para nombre@empresa.com'
}
