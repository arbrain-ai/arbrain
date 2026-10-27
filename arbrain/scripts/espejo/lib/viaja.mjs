/**
 * Qué viaja por el espejo y qué nunca (DISENO cerebro-24-7 §2.1). Puro: solo rutas relativas a la raíz del cerebro.
 *
 *   Viaja      la capa del alumno de CAPAS.json (memoria, plan, now.md, diario, daily, knowledge, mi-negocio…), sus
 *              skills propias y las carpetas del cerebro (meta, sentidos, memoria, manos, dolor) más los archivos del
 *              espejo (lider.json, maquinas/, latidos/, enviados/, espejo.json).
 *   Nunca      llaves, .env, OAuth, sesiones, bases de datos, store/, identidad de la máquina (.host-slug,
 *              compile-state.json, flush-state.json; lección del 24 sep) y el estado local del espejo.
 *   Lo demás   (el código de Arbrain) no lo sube el espejo: llega por la actualización firmada, igual en las dos.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

export const RAMA_POR_DEFECTO = 'mi-arbrain'
export const ESTADO_DIR = '.arbrain-espejo'
export const LIDER = 'arbrain/cerebro/lider.json'
export const CONFIG_VERSIONADA = 'arbrain/cerebro/espejo.json'
export const MAQUINAS_DIR = 'arbrain/cerebro/maquinas'
export const LATIDOS_DIR = 'arbrain/cerebro/latidos'
export const ENVIADOS_DIR = 'arbrain/cerebro/enviados'

/** Capa del alumno si la copia no trae CAPAS.json (la de la v0.2.9). `.claude/settings.local.json` es de la máquina. */
const CAPA_ALUMNO = [
  '.claude/memory/', '.claude/plan/', '.claude/now.md', '.claude/diario/', '.claude/daily/', '.claude/knowledge/',
  'CLAUDE.local.md', '.arbrain-sembrado.json', 'mi-negocio/',
]
const SKILLS_DEL_AUTOR = [
  'actualizar-arbrain', 'artificial-brain', 'autoresearch', 'bajar-a-tierra', 'canvas', 'edicion-por-voz', 'goal-compiler',
  'habit-system', 'image-generation', 'knowledge-search', 'libro-os', 'memory-manager', 'os-audit', 'sistema-viable',
]
const CEREBRO = [
  'arbrain/cerebro/meta/', 'arbrain/cerebro/sentidos/', 'arbrain/cerebro/memoria/', 'arbrain/cerebro/manos/',
  'arbrain/cerebro/dolor/', 'arbrain/cerebro/reportes/',
  LIDER, CONFIG_VERSIONADA, `${MAQUINAS_DIR}/`, `${LATIDOS_DIR}/`, `${ENVIADOS_DIR}/`,
]

/** Archivos que solo escribe el líder: el resto los recibe («esto lo genera tu cerebro en la nube»). */
export const SOLO_LIDER = ['.claude/now.md', '.claude/reportes/', '.claude/briefs/', 'arbrain/cerebro/reportes/']

/** Nunca viajan, estén donde estén (aunque caigan dentro de una carpeta que sí viaja). */
export const NUNCA = [
  { re: /(^|\/)\.env(\.(?!example$)[^/]*)?$/i, porque: 'archivo .env' },
  { re: /(^|\/)[^/]*\.env$/i, porque: 'archivo .env' },
  { re: /(^|\/)llaves(\.[^/]*)?\.json$/i, porque: 'llaves' },
  { re: /(^|\/)(acceso|servidor|motor-claude)\.json$/i, porque: 'configuración privada del servidor' },
  { re: /\.(pem|key|p12|pfx|jks|keystore|ppk|age|gpg|asc)$/i, porque: 'llave o certificado' },
  { re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i, porque: 'llave SSH' },
  { re: /(^|\/)\.(netrc|npmrc|pypirc|git-credentials)$/i, porque: 'credenciales' },
  { re: /(^|\/)\.?credentials?([._-][^/]*)?\.json$/i, porque: 'credenciales' },
  { re: /(^|\/)[^/]*(token|tokens|oauth|client_secret|secret|secrets)[^/]*\.json$/i, porque: 'token OAuth o secreto' },
  { re: /(^|\/)\.claude\/settings\.local\.json$/, porque: 'ajustes de esta máquina' },
  { re: /(^|\/)\.host-slug$/, porque: 'identidad de la máquina' },
  { re: /(^|\/)(compile|flush)-state\.json$/, porque: 'estado de esta máquina' },
  { re: /(^|\/)store\//, porque: 'base del daemon' },
  { re: /\.(db|db-wal|db-shm|db-journal|sqlite|sqlite3)$/i, porque: 'base de datos' },
  { re: /(^|\/)\.arbrain-espejo\//, porque: 'estado local del espejo' },
  { re: /(^|\/)node_modules\//, porque: 'dependencias' },
  { re: /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/, porque: 'basura del sistema' },
  { re: /\.(log|tmp|swp)$/i, porque: 'temporal' },
]

const prefijo = (ruta, p) => (p.endsWith('/') ? ruta.startsWith(p) : ruta === p)

export function porQueNunca(ruta) {
  for (const n of NUNCA) if (n.re.test(ruta)) return n.porque
  return null
}

/** Capa del alumno de la copia: lee CAPAS.json (fuente del autor) y cae a la de la v0.2.9. */
export function cargarCapas(cerebro) {
  let alumno = CAPA_ALUMNO, autor = SKILLS_DEL_AUTOR
  const ruta = join(cerebro, 'CAPAS.json')
  if (existsSync(ruta)) {
    try {
      const j = JSON.parse(readFileSync(ruta, 'utf8'))
      if (Array.isArray(j.alumno) && j.alumno.length) alumno = j.alumno.filter((p) => typeof p === 'string')
      if (Array.isArray(j.skills_del_autor)) autor = j.skills_del_autor.filter((p) => typeof p === 'string')
    } catch { /* CAPAS.json roto: la capa por defecto */ }
  }
  return { alumno: alumno.filter((p) => !porQueNunca(p)), autor }
}

/** ¿El espejo sube esta ruta? `capas` = cargarCapas(cerebro). */
export function viaja(ruta, capas) {
  if (!ruta || ruta.startsWith('/') || ruta.split('/').includes('..')) return false
  if (porQueNunca(ruta)) return false
  if (capas.alumno.some((p) => prefijo(ruta, p))) return true
  if (CEREBRO.some((p) => prefijo(ruta, p))) return true
  const m = /^\.claude\/skills\/([^/]+)\//.exec(ruta)
  return !!m && !capas.autor.includes(m[1])
}

export const esSoloLider = (ruta) => SOLO_LIDER.some((p) => prefijo(ruta, p))

export const HOST_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
export const hostValido = (h) => typeof h === 'string' && HOST_RE.test(h)

/** `diario/2026-10-23.md` → `diario/2026-10-23.<host>.md` (archivos por máquina: nunca chocan). */
export function rutaPorMaquina(ruta, host) {
  const ext = extname(ruta)
  const base = basename(ruta, ext)
  const dir = dirname(ruta)
  return `${dir === '.' ? '' : dir + '/'}${base}.${host}${ext}`
}

/** `plan/objetivos.md` → `plan/objetivos.conflicto-<host>-<fecha>.md`. */
export function rutaConflicto(ruta, host, fecha) {
  const ext = extname(ruta)
  const base = basename(ruta, ext)
  const dir = dirname(ruta)
  return `${dir === '.' ? '' : dir + '/'}${base}.conflicto-${host}-${fecha}${ext}`
}
