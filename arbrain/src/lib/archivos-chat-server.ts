/**
 * Lado servidor de «abrir y descargar desde el chat» (29 oct 2026, T6; lado cliente en lib/archivos-chat.ts).
 *
 * Dos pasos, como la vista documento (lib/cabina/documento-server.ts):
 *   1. `/api/chat/archivo?ruta=…` (con la sesión de siempre) valida la ruta con disco y firma un enlace a ESE archivo.
 *   2. `/api/chat/archivo/f/<token>/<nombre>` lo sirve solo con la firma. Hace falta así: la app de escritorio abre los
 *      enlaces en el navegador del sistema y la app del teléfono (PWA) en Safari, y ninguno de los dos lleva la cookie.
 *      La firma (HMAC con el secreto del proceso, el mismo de la vista documento, con su propio prefijo para que un
 *      token de un lado no valga en el otro) dice qué archivo y hasta cuándo. Al servir se vuelve a validar todo.
 *
 * Qué se puede abrir:
 *   - Edición cliente: su cerebro (`ARBRAIN_HOME`) y las «carpetas abiertas para Levy» de Ajustes › Permisos y seguridad
 *     (`<ARBRAIN_CONFIG_DIR>/carpetas-abiertas.json`, las escribe el daemon en server/src/cliente/carpetas.ts).
 *   - Instalación de Daniel: lo mismo que la vista documento (repo, ~/Developer, /tmp y sus carpetas personales).
 * Nunca: la carpeta de datos o de configuración de la app, `.git`, carpetas ocultas (salvo `.claude`, `.codex` y
 * `.agents`, donde viven los artefactos de Levy), archivos ocultos (`.env`…), llaves y credenciales por nombre
 * (`pareceSecreto`), `node_modules`, `..` ni enlaces simbólicos que salgan de la raíz.
 *
 * Sin `server-only` para que las pruebas lo importen; solo lo usan las rutas de la API.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { CARPETAS_DEL_DUENO, pareceSecreto } from '@/features/cabina/documento/ruta'
import { esEdicionCliente } from '@/lib/edicion'
import { dirConfigArbrain, raizWorkspace } from '@/lib/rutas-instalacion'
import { extensionDe, nombreArchivo } from '@/lib/archivos-chat'
import { cspCrudo } from '@/features/cabina/documento/csp-crudo'

type Env = Record<string, string | undefined>

export interface OpcionesArchivo { env?: Env; home?: string }

export class ErrorArchivo extends Error { constructor(msg: string, public status = 403) { super(msg) } }

const WIN = process.platform === 'win32'
const igual = (a: string) => WIN ? a.toLowerCase() : a
/** ¿`abs` es `base` o cuelga de ella? */
export function dentroDe(abs: string, base: string): boolean {
  const a = igual(abs), b = igual(base)
  return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep)
}

/** Carpetas abiertas para Levy (Ajustes). Lista vacía si no hay archivo o no se lee. */
export function carpetasAbiertasWeb(env: Env = process.env): string[] {
  try {
    const p = path.join(dirConfigArbrain(env), 'carpetas-abiertas.json')
    if (!existsSync(p)) return []
    const j = JSON.parse(readFileSync(p, 'utf8')) as { carpetas?: { ruta?: unknown }[] }
    return (Array.isArray(j.carpetas) ? j.carpetas : []).map(c => c?.ruta).filter((r): r is string => typeof r === 'string' && path.isAbsolute(r))
  } catch { return [] }
}

const CANDIDATAS_REPO = (home: string, env: Env) => [env.BUSINESS_OS_ROOT, path.join(home, 'Developer/artificial-brain'), path.join(home, 'Developer/business-os'), path.join(process.cwd(), '..')].filter(Boolean) as string[]

/** Base de las rutas relativas: el cerebro de la persona (cliente) o el repo vivo (Daniel). */
export function baseRelativas(op: OpcionesArchivo = {}): string {
  const env = op.env ?? process.env, home = op.home ?? homedir()
  if (esEdicionCliente(env)) return path.resolve(raizWorkspace(undefined, env))
  if (env.BUSINESS_OS_ROOT?.trim()) return path.resolve(env.BUSINESS_OS_ROOT.trim())
  const c = CANDIDATAS_REPO(home, env)
  return path.resolve(c.find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? c[0])
}

/** Raíces desde donde se sirve. */
export function raicesArchivos(op: OpcionesArchivo = {}): string[] {
  const env = op.env ?? process.env, home = op.home ?? homedir()
  if (esEdicionCliente(env)) return [baseRelativas(op), ...carpetasAbiertasWeb(env)]
  return [baseRelativas(op), path.join(home, 'Developer'), '/tmp', '/private/tmp', ...CARPETAS_DEL_DUENO.map(c => path.join(home, c))]
}

/** Carpetas de la app que nunca se sirven, aunque caigan dentro de una raíz. */
function protegidas(op: OpcionesArchivo): string[] {
  const env = op.env ?? process.env, home = op.home ?? homedir()
  const out = [env.ARBRAIN_DATA_DIR, env.ARBRAIN_CONFIG_DIR, path.join(home, '.config', 'arbrain'), path.join(home, '.config', 'arbrain-cliente')]
  try { out.push(dirConfigArbrain(env)) } catch { /* cliente sin config: no hay nada que proteger de más */ }
  return out.filter((p): p is string => !!p).map(p => path.resolve(p))
}

const OCULTAS_OK = new Set(['.claude', '.codex', '.agents'])
const VETADAS = new Set(['.git', 'node_modules', 'Keychains'])

/** Motivo para no servir una ruta real que ya está dentro de `raiz`, o null. */
function motivoVeto(real: string, raiz: string): string | null {
  const rel = path.relative(raiz, real).split(path.sep).filter(Boolean)
  const carpetas = rel.slice(0, -1), nombre = rel[rel.length - 1] ?? ''
  if (carpetas.some(s => VETADAS.has(s) || (s.startsWith('.') && !OCULTAS_OK.has(s)))) return 'Esa carpeta no se comparte desde el chat.'
  if (nombre.startsWith('.')) return 'Los archivos ocultos no se comparten desde el chat.'
  if (pareceSecreto(rel.join('/'))) return 'Ese archivo parece una llave o credencial: no se comparte.'
  return null
}

export interface ArchivoResuelto { real: string; nombre: string; bytes: number; mtimeMs: number }

/**
 * Ruta pedida (absoluta, `~/…`, `file://` ya decodificada por el cliente o relativa al cerebro) → archivo real
 * permitido. Lanza `ErrorArchivo` con un mensaje para personas no técnicas.
 */
export async function resolverArchivoChat(pedida: string, op: OpcionesArchivo = {}): Promise<ArchivoResuelto> {
  const home = op.home ?? homedir()
  const p = (pedida ?? '').trim()
  if (!p || p.length > 1000 || p.includes('\0')) throw new ErrorArchivo('Ruta inválida.', 400)
  if (p.split(/[\\/]/).includes('..')) throw new ErrorArchivo('La ruta no puede subir con «..».', 400)
  const abs = path.resolve(p.startsWith('~/') || p.startsWith('~\\') ? path.join(home, p.slice(2)) : path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) ? p : path.join(baseRelativas(op), p))
  const raices = raicesArchivos(op)
  // Primera puerta, sin disco: que ni siquiera se pregunte por algo fuera.
  if (!raices.some(r => dentroDe(abs, path.resolve(r)))) throw new ErrorArchivo('Ese archivo está fuera de tu cerebro y de las carpetas que abriste para Levy.')
  let real: string
  try { real = await realpath(abs) } catch { throw new ErrorArchivo('Ese archivo ya no existe.', 404) }
  // Segunda puerta, con disco: el destino real (un enlace simbólico no saca a nadie de la raíz).
  const reales = (await Promise.all(raices.map(r => realpath(r).catch(() => null)))).filter((r): r is string => !!r)
  const raiz = reales.filter(r => dentroDe(real, r)).sort((a, b) => b.length - a.length)[0]
  if (!raiz) throw new ErrorArchivo('Ese archivo está fuera de tu cerebro y de las carpetas que abriste para Levy.')
  const prot = await Promise.all(protegidas(op).map(d => realpath(d).catch(() => d)))
  if (prot.some(d => dentroDe(real, d))) throw new ErrorArchivo('Esa es la carpeta interna de Arbrain: no se comparte.')
  const veto = motivoVeto(real, raiz)
  if (veto) throw new ErrorArchivo(veto)
  const info = await stat(real).catch(() => null)
  if (!info) throw new ErrorArchivo('Ese archivo ya no existe.', 404)
  if (!info.isFile()) throw new ErrorArchivo('Eso es una carpeta, no un archivo.', 400)
  return { real, nombre: nombreArchivo(real), bytes: info.size, mtimeMs: info.mtimeMs }
}

// ── Firma ──
// El mismo secreto de proceso que la vista documento (`__arbrainDocSecreto`, o `ARBRAIN_DOC_SECRET`), con prefijo propio.
const g = globalThis as { __arbrainDocSecreto?: Buffer }
const secreto = () => (g.__arbrainDocSecreto ??= process.env.ARBRAIN_DOC_SECRET ? Buffer.from(process.env.ARBRAIN_DOC_SECRET) : randomBytes(32))
const PREFIJO = 'archivo-chat:'
/** Un enlace vive 12 horas; el chat lo vuelve a pedir antes (cada vez que pinta el mensaje y cada 4 h). */
export const VIGENCIA_MS = 12 * 3600_000
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const hmac = (cuerpo: string) => b64(createHmac('sha256', secreto()).update(cuerpo).digest()).slice(0, 43)

export function firmarArchivo(real: string, ahora = Date.now()): string {
  const cuerpo = b64(JSON.stringify({ d: PREFIJO + real, e: ahora + VIGENCIA_MS }))
  return `${cuerpo}.${hmac(cuerpo)}`
}

/** Ruta real firmada, o null si la firma no cuadra o ya venció. */
export function verificarArchivo(token: string, ahora = Date.now()): string | null {
  const [cuerpo, firma, sobra] = (token ?? '').split('.')
  if (!cuerpo || !firma || sobra !== undefined) return null
  const esperada = hmac(cuerpo)
  if (firma.length !== esperada.length || !timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null
  try {
    const { d, e } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as { d?: unknown; e?: unknown }
    if (typeof d !== 'string' || !d.startsWith(PREFIJO) || typeof e !== 'number' || e <= ahora) return null
    return d.slice(PREFIJO.length)
  } catch { return null }
}

/** URL relativa servible, con el nombre al final (lo que el navegador propone al guardar). */
export function urlArchivoFirmado(real: string, ahora = Date.now()): string {
  return `/api/chat/archivo/f/${firmarArchivo(real, ahora)}/${encodeURIComponent(nombreArchivo(real))}`
}

// ── Tipos ──
/** Lo que el navegador puede mostrar. HTML y SVG van con CSP `sandbox` (origen opaco: sus scripts no tocan la app). */
const VER: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  avif: 'image/avif', svg: 'image/svg+xml', html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', markdown: 'text/plain; charset=utf-8',
  // CSV y JSON como texto: así el teléfono los enseña en vez de pedir una app.
  csv: 'text/plain; charset=utf-8', tsv: 'text/plain; charset=utf-8', json: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
}
/** Solo se descargan, pero con su tipo correcto (el teléfono ofrece abrirlos con la app que toca). */
const DESCARGAR: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', rtf: 'application/rtf',
  zip: 'application/zip', epub: 'application/epub+zip', heic: 'image/heic', key: 'application/octet-stream',
}

export function seVe(nombre: string): boolean { return extensionDe(nombre) in VER }

export interface CabecerasArchivo { tipo: string; disposicion: string; csp: string | null; ver: boolean }

/** `filename` en ASCII (navegadores viejos) y `filename*` en UTF-8 (acentos y ñ), sin comillas ni saltos. */
export function disposicion(nombre: string, descargar: boolean): string {
  const limpio = nombre.replace(/[\r\n"\\]/g, '_')
  const ascii = limpio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_')
  return `${descargar ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(limpio)}`
}

export function cabecerasArchivo(nombre: string, pideDescarga: boolean): CabecerasArchivo {
  const ext = extensionDe(nombre)
  const ver = ext in VER
  const tipo = VER[ext] ?? DESCARGAR[ext] ?? 'application/octet-stream'
  // HTML y SVG: la misma CSP `sandbox` (sin allow-same-origin) que la vista documento. El PDF no la lleva: Chrome no
  // pinta un PDF aislado. Todo va con `nosniff`, así un texto nunca se interpreta como HTML.
  return { tipo, ver, disposicion: disposicion(nombre, pideDescarga || !ver), csp: cspCrudo(ext) }
}
