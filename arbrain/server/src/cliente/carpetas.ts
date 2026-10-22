/**
 * Carpetas abiertas (seguridad del alumno, 12 oct 2026; AUDITORIA punto 1). Por defecto el agente del alumno trabaja
 * solo en su cerebro (ARBRAIN_HOME). La persona puede abrirle carpetas extra, UNA POR UNA, desde Ajustes › Seguridad,
 * con su clic (la ruta exige el secreto de la app: un agente nunca se abre carpetas) y las ve listadas ahí mismo.
 *
 * Qué da una carpeta abierta: leer y buscar dentro sin preguntar; escribir con las herramientas de archivos pide
 * confirmación (fuera de las abiertas, escribir fuera del cerebro se niega). Lo secreto sigue negado aunque esté dentro
 * (`.env*`, `.git`, llaves…). No se pueden abrir: la raíz, la carpeta personal entera ni un ancestro suyo, `Library`,
 * `AppData`, `.config`, `.local`, carpetas del sistema, la carpeta de datos de la app ni nada secreto.
 *
 * La lista vive en `<ARBRAIN_CONFIG_DIR>/carpetas-abiertas.json` (carpeta protegida). Instalación de Daniel: no se usa.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { DIR_ARBRAIN } from '../edicion.js'

export interface CarpetaAbierta { ruta: string; abierta: number }

const archivo = () => join(DIR_ARBRAIN(), 'carpetas-abiertas.json')
let cache: { mtime: number; lista: CarpetaAbierta[] } | null = null

export function carpetasAbiertas(): CarpetaAbierta[] {
  try {
    const p = archivo()
    if (!existsSync(p)) { cache = null; return [] }
    const mtime = statSync(p).mtimeMs
    if (cache && cache.mtime === mtime) return cache.lista
    const j = JSON.parse(readFileSync(p, 'utf8')) as { carpetas?: CarpetaAbierta[] }
    const lista = (Array.isArray(j.carpetas) ? j.carpetas : []).filter(c => c && typeof c.ruta === 'string' && isAbsolute(c.ruta)).map(c => ({ ruta: c.ruta, abierta: Number(c.abierta) || 0 }))
    cache = { mtime, lista }
    return lista
  } catch { return [] }
}

function guardar(lista: CarpetaAbierta[]): void {
  const p = archivo()
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 })
  writeFileSync(p, JSON.stringify({ carpetas: lista }, null, 1) + '\n', { mode: 0o600 })
  cache = null
}

const dentroDeExacto = (p: string, raiz: string) => p === raiz || p.startsWith(raiz.endsWith(sep) ? raiz : raiz + sep)
/** En Windows las rutas no distinguen mayúsculas (`c:\users` = `C:\Users`). */
const dentroDe = (p: string, raiz: string) => process.platform === 'win32' ? dentroDeExacto(p.toLowerCase(), raiz.toLowerCase()) : dentroDeExacto(p, raiz)
const SISTEMA = ['/System', '/Library', '/etc', '/usr', '/bin', '/sbin', '/var', '/private', '/dev', '/proc', '/sys', '/boot', '/opt/homebrew', '/Applications', '/Volumes', '/root', '/snap']
const DEL_USUARIO_PROHIBIDAS = ['Library', 'AppData', '.config', '.local', '.cache', '.npm', '.cargo', '.rustup', 'Applications', '.claude', '.codex']

export interface ValidarOpciones {
  usuario?: string
  home: string
  protegidas: string[]
  /** La misma regla de secretos que la política (inyectada para no crear un ciclo de imports). */
  motivoSecreto: (real: string) => string | null
}

/** ¿Se puede abrir esta carpeta? Devuelve la ruta real o el motivo para no abrirla. */
export function validarCarpeta(entrada: unknown, op: ValidarOpciones): { ok: true; ruta: string } | { ok: false; error: string } {
  const usuario = op.usuario ?? homedir()
  if (typeof entrada !== 'string' || !entrada.trim()) return { ok: false, error: 'Escribe la ruta de la carpeta.' }
  const cruda = entrada.trim().replace(/^~(?=$|[\\/])/, usuario)
  if (!isAbsolute(cruda)) return { ok: false, error: 'Usa la ruta completa de la carpeta (por ejemplo ~/Documents/MiProyecto).' }
  let real: string
  try { real = realpathSync.native(resolve(cruda)) } catch { return { ok: false, error: 'Esa carpeta no existe.' } }
  try { if (!statSync(real).isDirectory()) return { ok: false, error: 'Eso es un archivo; abre la carpeta que lo contiene.' } } catch { return { ok: false, error: 'No se pudo leer esa carpeta.' } }
  let usuarioReal = usuario
  try { usuarioReal = realpathSync.native(usuario) } catch { /* tal cual */ }
  if (real === resolve('/') || /^[A-Za-z]:\\?$/.test(real)) return { ok: false, error: 'No se puede abrir el disco entero.' }
  if (dentroDe(usuarioReal, real)) return { ok: false, error: 'No se puede abrir tu carpeta personal entera: abre solo la carpeta del proyecto que necesitas.' }
  for (const s of SISTEMA) if (dentroDe(real, s) && !dentroDe(real, usuarioReal)) return { ok: false, error: 'Es una carpeta del sistema.' }
  if (/^[A-Za-z]:\\(Windows|Program Files|ProgramData)/i.test(real)) return { ok: false, error: 'Es una carpeta del sistema.' }
  for (const d of DEL_USUARIO_PROHIBIDAS) if (dentroDe(real, join(usuarioReal, d))) return { ok: false, error: `Las carpetas dentro de ${d} guardan configuración y datos de otras apps: no se abren.` }
  for (const p of op.protegidas) if (p && (dentroDe(real, p) || dentroDe(p, real))) return { ok: false, error: 'Es (o contiene) la carpeta de datos de Arbrain.' }
  if (dentroDe(real, op.home)) return { ok: false, error: 'Esa carpeta ya está dentro de tu cerebro.' }
  const secreto = op.motivoSecreto(real)
  if (secreto) return { ok: false, error: `No se puede abrir: ${secreto}.` }
  return { ok: true, ruta: real }
}

export function abrirCarpeta(entrada: unknown, op: ValidarOpciones, ahora = Date.now()): { ok: true; carpetas: CarpetaAbierta[] } | { ok: false; error: string } {
  const v = validarCarpeta(entrada, op)
  if (!v.ok) return v
  const lista = carpetasAbiertas().filter(c => c.ruta !== v.ruta)
  if (lista.length >= 20) return { ok: false, error: 'Ya tienes 20 carpetas abiertas; cierra alguna primero.' }
  guardar([...lista, { ruta: v.ruta, abierta: ahora }])
  return { ok: true, carpetas: carpetasAbiertas() }
}

export function cerrarCarpeta(ruta: unknown): CarpetaAbierta[] {
  if (typeof ruta !== 'string') return carpetasAbiertas()
  const lista = carpetasAbiertas()
  const resto = lista.filter(c => c.ruta !== ruta)
  if (resto.length !== lista.length) guardar(resto)
  return carpetasAbiertas()
}
