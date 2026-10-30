// Catálogo de la paleta «/»: base local (los 16 de siempre + modos), lo que entrega el daemon
// (`GET /api/chat/commands`) y los nombres del evento `init` del SDK. Todo puro y sin React,
// para que paleta y teclado usen exactamente el mismo filtro.

export type SeccionComando = 'modos' | 'arbrain' | 'nativos' | 'skills' | 'agentes'
export type TipoComando = 'local' | 'sdk' | 'agent' | 'mode'

export interface ComandoCatalogo {
  /** Con '/' inicial; los agentes con '@'. */
  name: string
  description: string
  argumentHint?: string
  /** Sin '/'. */
  aliases?: string[]
  section: SeccionComando
  kind: TipoComando
  origin?: string
}

export const SECCIONES: SeccionComando[] = ['modos', 'arbrain', 'nativos', 'skills', 'agentes']
export const ETIQUETA_SECCION: Record<SeccionComando, string> = {
  modos: 'Modos', arbrain: 'Arbrain', nativos: 'Nativos', skills: 'Skills', agentes: 'Agentes',
}

const modo = (name: string, description: string, argumentHint?: string): ComandoCatalogo =>
  ({ name, description, section: 'modos', kind: 'mode', ...(argumentHint && { argumentHint }) })
const local = (name: string, description: string): ComandoCatalogo =>
  ({ name, description, section: 'arbrain', kind: 'local' })

/** Base inmediata: la paleta nunca está vacía, ni offline. Orden fijo. */
export const CATALOGO_BASE: ComandoCatalogo[] = [
  modo('/goal', 'Objetivo persistente: sigue trabajando hasta cumplir la condición', '<condición>'),
  modo('/model', 'Cambiar modelo de IA'),
  modo('/effort', 'Nivel de esfuerzo de razonamiento (low → max)'),
  modo('/fast', 'Fast mode: ~2.5x velocidad en Opus 4.8 (toggle)'),
  modo('/ultracode', 'Ultracode: xhigh + workflows multi-agente (toggle)'),
  modo('/compact', 'Comprime el contexto (reduce tokens usados)'),
  modo('/context', 'Cuánto contexto se está usando (tokens)'),
  modo('/loop', 'Repite un prompt en un intervalo', '[intervalo] [prompt]'),
  local('/clear', 'Nueva conversación — borra el historial'),
  local('/status', 'Estado de Levy: modelo, tareas activas, sesión'),
  local('/skills', 'Skills disponibles (.claude/skills/)'),
  local('/memory', 'Memoria persistente (MEMORY.md)'),
  local('/mcp', 'Estado de los MCP servers'),
  local('/todos', 'TODO list activo del agente'),
  local('/tasks', 'Tareas actuales del Kanban board'),
  local('/agents', 'Estado en vivo de todos los agentes'),
  local('/usage', 'Costo y tokens de Levy (7/30 días)'),
  local('/help', 'Ver todos los comandos disponibles'),
]

/** Nombres internos del SDK que no sirven en una UI. */
export function esComandoOculto(nombre: string): boolean {
  const n = nombre.replace(/^[/@]/, '')
  return !n || n.startsWith('__') || n === 'workflow-launch-exec' || n === 'heapdump'
}

/** Nativos conocidos de Claude Code: sirven para ubicar los nombres del `init`, que llegan sin descripción. */
const NATIVOS_CONOCIDOS = new Set([
  'compact', 'context', 'effort', 'fast', 'model', 'goal', 'loop', 'code-review', 'simplify', 'init', 'clear', 'mcp',
  'agents', 'usage', 'recap', 'insights', 'schedule', 'security-review', 'rename', 'config', 'output-style',
  'autocompact', 'focus', 'reload-skills', 'reload-plugins', 'verify', 'debug', 'batch', 'doctor', 'help', 'cost',
  'status', 'memory', 'review', 'resume', 'export', 'permissions', 'hooks', 'login', 'logout', 'bug', 'feedback',
])

const SECCIONES_VALIDAS = new Set<string>(SECCIONES)
const TIPOS_VALIDOS = new Set<string>(['local', 'sdk', 'agent', 'mode'])

/** Valida lo que llega del daemon: una fila rara se descarta, nunca rompe la paleta. */
export function normalizarRemoto(raw: unknown): ComandoCatalogo[] {
  if (!Array.isArray(raw)) return []
  const out: ComandoCatalogo[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if (typeof o.name !== 'string' || !o.name.trim()) continue
    const section = typeof o.section === 'string' && SECCIONES_VALIDAS.has(o.section) ? (o.section as SeccionComando) : null
    const kind = typeof o.kind === 'string' && TIPOS_VALIDOS.has(o.kind) ? (o.kind as TipoComando) : null
    if (!section || !kind) continue
    const name = o.name.trim()
    if (esComandoOculto(name)) continue
    const hint = typeof o.argumentHint === 'string' ? o.argumentHint.trim() : ''
    const aliases = Array.isArray(o.aliases) ? o.aliases.filter((a): a is string => typeof a === 'string' && !!a) : []
    out.push({
      name,
      description: typeof o.description === 'string' ? o.description : '',
      section, kind,
      ...(hint && { argumentHint: hint }),
      ...(aliases.length && { aliases }),
      ...(typeof o.origin === 'string' && o.origin && { origin: o.origin }),
    })
  }
  return out
}

const NOMBRE_ORDEN = (a: ComandoCatalogo, b: ComandoCatalogo) =>
  a.name.replace(/^[/@]/, '').localeCompare(b.name.replace(/^[/@]/, ''), 'en', { sensitivity: 'base' })

/** Fusiona base local + catálogo del daemon + nombres del init. Gana siempre lo local (dedup por nombre, sin
 * distinguir mayúsculas); modos y Arbrain conservan su orden fijo, el resto va alfabético. */
export function fusionarCatalogo(
  { base = CATALOGO_BASE, remoto = [], initNames = [] }: { base?: ComandoCatalogo[]; remoto?: ComandoCatalogo[]; initNames?: string[] },
): ComandoCatalogo[] {
  const vistos = new Set<string>()
  const lista: ComandoCatalogo[] = []
  const agregar = (c: ComandoCatalogo) => {
    const k = c.name.toLowerCase()
    if (vistos.has(k)) return
    vistos.add(k)
    lista.push(c)
  }
  // Con catálogo del daemon, los modos que él no lista no aplican a esa cuenta (p. ej. /compact o /loop en Codex).
  const modosRemotos = new Set(remoto.filter((c) => c.section === 'modos').map((c) => c.name.toLowerCase()))
  base.forEach((c) => {
    if (c.section === 'modos' && modosRemotos.size && !modosRemotos.has(c.name.toLowerCase())) return
    agregar(c)
  })
  remoto.forEach(agregar)
  for (const crudo of initNames) {
    if (typeof crudo !== 'string') continue
    const nombre = crudo.trim().replace(/^\//, '')
    if (!nombre || esComandoOculto(nombre)) continue
    const nativo = NATIVOS_CONOCIDOS.has(nombre)
    agregar({ name: `/${nombre}`, description: '', section: nativo ? 'nativos' : 'skills', kind: 'sdk' })
  }
  const rank = (s: SeccionComando) => SECCIONES.indexOf(s)
  const fijos = (s: SeccionComando) => s === 'modos' || s === 'arbrain'
  return lista
    .map((c, i) => ({ c, i }))
    .sort((x, y) => {
      const d = rank(x.c.section) - rank(y.c.section)
      if (d) return d
      return fijos(x.c.section) ? x.i - y.i : NOMBRE_ORDEN(x.c, y.c)
    })
    .map(({ c }) => c)
}

function plano(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Búsqueda por subcadena (sin acentos ni mayúsculas) en nombre, alias y descripción. Ranking dentro de cada
 * sección: prefijo de nombre > subcadena en nombre > alias > descripción. Con «@» solo agentes. Query vacía:
 * todo, en orden de sección. La usan la paleta y el teclado: así el índice seleccionado coincide. */
export function filtrarComandos(items: ComandoCatalogo[], query: string): ComandoCatalogo[] {
  const arroba = query.startsWith('@')
  const q = plano(query.replace(/^[/@]/, '').trim())
  const puntuados: { c: ComandoCatalogo; score: number; i: number }[] = []
  items.forEach((c, i) => {
    if (arroba && c.section !== 'agentes') return
    const nombre = plano(c.name.replace(/^[/@]/, ''))
    let score = -2
    if (!q) score = 0
    else if (nombre === q) score = -1
    else if (nombre.startsWith(q)) score = 0
    else if (nombre.includes(q)) score = 1
    else if (c.aliases?.some((a) => plano(a).includes(q))) score = 2
    else if (q.length >= 2 && plano(c.description).includes(q)) score = 3
    if (score >= -1) puntuados.push({ c, score, i })
  })
  return puntuados
    .sort((a, b) => {
      // La coincidencia exacta de nombre gana a cualquier sección; luego manda la sección.
      if ((a.score === -1) !== (b.score === -1)) return a.score === -1 ? -1 : 1
      const d = SECCIONES.indexOf(a.c.section) - SECCIONES.indexOf(b.c.section)
      return d || a.score - b.score || a.i - b.i
    })
    .map((p) => p.c)
}

/** ¿Un mensaje corto «/palabra[ args]» presente en el catálogo? Devuelve el comando para pintarlo. */
export function comandoDeMensaje(items: ComandoCatalogo[], texto: string): ComandoCatalogo | null {
  const t = texto.trim()
  if (!t.startsWith('/') || t.length > 300 || t.includes('\n')) return null
  const palabra = t.split(/\s/, 1)[0].toLowerCase()
  return items.find((c) => c.name.toLowerCase() === palabra || c.aliases?.some((a) => `/${a.toLowerCase()}` === palabra)) ?? null
}

/** ¿Al elegirlo se rellena el composer en vez de enviar? Los que piden argumentos, las skills, /goal y /loop. */
export function pideArgumentos(c: ComandoCatalogo): boolean {
  if (c.name === '/goal' || c.name === '/loop') return true
  if (c.section === 'skills') return true
  if (c.kind === 'local' || c.kind === 'mode') return false
  return !!c.argumentHint?.trim()
}

/** Texto que queda en el composer al elegir un comando que pide argumentos. */
export function textoRelleno(c: ComandoCatalogo): string {
  if (c.section === 'agentes') return `Usa el subagente ${c.name.replace(/^@/, '')} para `
  return `${c.name} `
}
