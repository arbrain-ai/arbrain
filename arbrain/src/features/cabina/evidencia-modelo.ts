/**
 * «Ver resultados» de un agente (11 nov 2026, Daniel desde el Taller: «un visor de sus resultados, no tanto code review o
 * PR sino evidencia con imágenes, gráficas y todo… uno técnico pa ti, uno visual pa mí»). Puro: sin fs, sin red, sin React.
 *
 * De dónde sale la evidencia, en este orden:
 *  1. Las rutas de medios que nombra su última respuesta (absolutas, `~/…` o relativas a su carpeta), en el orden en que
 *     las dice.
 *  2. Lo que haya en `final/` o `evidencia/` dentro de su carpeta de trabajo (la convención que viaja en cada encargo:
 *     agent-server `cabina/evidencia.ts`).
 *  3. Los medios que escribió en su último turno (herramienta Write), aunque no los nombre.
 * Solo cuenta lo que existe y es medio (imagen, video, PDF, HTML): eso lo comprueba `lib/cabina/evidencia-server.ts`.
 *
 * Arriba va el resumen humano de su respuesta (corto, sin rutas ni jerga). Lo técnico (cambios, commits, comandos y
 * pruebas, archivos de código) se pliega en «Para Levy».
 */
import type { Paso } from './panel/actividad-modelo'

/** Las carpetas de la convención. Deben coincidir con `CARPETAS_EVIDENCIA` del agent-server (lo compara un test). */
export const CARPETAS_EVIDENCIA = ['final', 'evidencia'] as const

export type ClaseMedio = 'imagen' | 'video' | 'pdf' | 'html'
const EXT_MEDIO: Record<string, ClaseMedio> = {
  png: 'imagen', jpg: 'imagen', jpeg: 'imagen', webp: 'imagen', gif: 'imagen', svg: 'imagen', avif: 'imagen',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video',
  pdf: 'pdf', html: 'html', htm: 'html',
}
/** La clase de medio por extensión; null si no es algo que se ve. */
export function claseMedio(ruta: string): ClaseMedio | null {
  const b = ruta.split('/').pop() ?? ''
  const i = b.lastIndexOf('.')
  return i > 0 ? EXT_MEDIO[b.slice(i + 1).toLowerCase()] ?? null : null
}

const EXTS = Object.keys(EXT_MEDIO).join('|')
const URL_RE = /https?:\/\/[^\s)>\]`'"«»]+/g
/** Una ruta dentro de comillas invertidas (puede llevar espacios). */
const RUTA_CODIGO_RE = new RegExp(`\`([^\`\\n]*\\.(?:${EXTS}))\``, 'gi')
/** Una ruta suelta: absoluta, `~/…`, relativa con carpetas o solo el nombre del archivo. */
const C = '[\\p{L}\\p{N}_.@+\\-]', C0 = '[\\p{L}\\p{N}_@+\\-]'
const RUTA_SUELTA_RE = new RegExp(`(?<![\\p{L}\\p{N}_.\\/~])(?:~\\/|\\/)?(?:${C}+\\/)*${C0}${C}*\\.(?:${EXTS})(?![\\p{L}\\p{N}_]|\\.[\\p{L}\\p{N}])`, 'giu')

/** Las rutas de medios que nombra un texto, sin repetir y en orden de aparición. Nunca URLs. */
export function rutasMencionadas(texto: string | null | undefined): string[] {
  const s = (texto ?? '').replace(URL_RE, u => ' '.repeat(u.length))
  const hallazgos: { i: number; r: string }[] = []
  const tapado = s.replace(RUTA_CODIGO_RE, (m, r: string, i: number) => { hallazgos.push({ i, r: r.trim() }); return ' '.repeat(m.length) })
  for (const m of tapado.matchAll(RUTA_SUELTA_RE)) hallazgos.push({ i: m.index ?? 0, r: m[0] })
  const vistos = new Set<string>(), out: string[] = []
  for (const { r } of hallazgos.sort((a, b) => a.i - b.i)) {
    const limpia = r.replace(/^\.\//, '').replace(/[.,;:]+$/, '')
    if (!limpia || vistos.has(limpia) || !claseMedio(limpia)) continue
    vistos.add(limpia); out.push(limpia)
  }
  return out
}

const sinBarra = (x: string) => x.replace(/\/+$/, '')
/**
 * Dónde puede estar una ruta que nombró: tal cual si es absoluta o `~/…`; si es relativa, contra su carpeta, contra las
 * carpetas de evidencia (dice «video.mp4» y vive en final/) y contra las dos de arriba (un worktree con cwd en `wt/arbrain`
 * nombra `arbrain/…`). La primera que exista gana.
 */
export function candidatas(ruta: string, cwd: string): string[] {
  if (ruta.startsWith('/') || ruta.startsWith('~/')) return [ruta]
  const base = sinBarra(cwd)
  if (!base) return []
  const arriba = (x: string) => x.slice(0, x.lastIndexOf('/'))
  const padres = [arriba(base), arriba(arriba(base))].filter(p => p && p !== '~' && p.split('/').filter(Boolean).length >= 3)
  const lista = [`${base}/${ruta}`, ...(ruta.includes('/') ? [] : CARPETAS_EVIDENCIA.map(c => `${base}/${c}/${ruta}`)), ...padres.map(p => `${p}/${ruta}`)]
  return [...new Set(lista)]
}

/** Las carpetas de evidencia de su cwd. */
export const carpetasEvidencia = (cwd: string) => sinBarra(cwd) ? CARPETAS_EVIDENCIA.map(c => `${sinBarra(cwd)}/${c}`) : []

// ── La bitácora (lo que lee `/api/cabina/actividad`) ──

/** Los pasos de su último turno: desde el último encargo o mensaje que recibió. */
export function ultimoTurno(pasos: Paso[]): Paso[] {
  let i = pasos.length - 1
  while (i >= 0 && pasos[i].k !== 'encargo' && pasos[i].k !== 'entrada') i--
  return pasos.slice(i + 1)
}

/** Su última respuesta: el último texto suyo (no de un ayudante) del turno. */
export function respuestaFinal(pasos: Paso[]): string | null {
  const t = ultimoTurno(pasos)
  for (let i = t.length - 1; i >= 0; i--) { const p = t[i]; if (p.k === 'texto' && !p.sub && p.texto.trim()) return p.texto.trim() }
  return null
}

const ESCRIBE = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
/** Los archivos que escribió o editó en su último turno, sin repetir. */
export function archivosTocados(pasos: Paso[]): string[] {
  const out: string[] = []
  for (const p of ultimoTurno(pasos)) if (p.k === 'herramienta' && !p.sub && ESCRIBE.has(p.nombre) && p.detalle && !out.includes(p.detalle)) out.push(p.detalle)
  return out
}

export interface Comando { que: string; comando: string; ok: boolean | null; codigo: number | null; prueba: boolean }
const PRUEBA_RE = /\b(npm (run )?test|vitest|jest|pytest|tsx --test|tsc\b|typecheck|cargo (check|test)|playwright)\b/i
/** Los comandos de su último turno con cómo salieron (los últimos `max`). `prueba` = parece una prueba o un typecheck. */
export function comandosDe(pasos: Paso[], max = 10): Comando[] {
  const turno = ultimoTurno(pasos)
  const resultados = new Map<string, Extract<Paso, { k: 'resultado' }>>()
  for (const p of turno) if (p.k === 'resultado') resultados.set(p.id, p)
  const out: Comando[] = []
  for (const p of turno) {
    if (p.k !== 'herramienta' || p.sub || p.nombre !== 'Bash') continue
    const r = resultados.get(p.id)
    out.push({ que: p.que, comando: p.detalle.split('\n')[0].slice(0, 200), ok: r ? r.ok : null, codigo: r?.codigo ?? null, prueba: PRUEBA_RE.test(p.detalle) })
  }
  return out.slice(-max)
}

const COMMIT_RE = /\bcommits?\s+`?([0-9a-f]{7,40})\b/gi
export function commitsDe(texto: string | null | undefined): string[] {
  return [...new Set([...(texto ?? '').matchAll(COMMIT_RE)].map(m => m[1].slice(0, 12)))]
}

// ── Lo que el visor pinta ──

/** Una pieza de evidencia ya comprobada en disco. */
export interface PiezaEvidencia { ruta: string; nombre: string; clase: ClaseMedio; url: string; bytes: number; mtime: string; de: 'mencion' | 'carpeta' | 'escrito' }
/** Junta lo comprobado en el orden de la regla (mención, carpeta, escrito), sin repetir la misma ruta real. */
export function ordenarEvidencia(listas: { mencion: PiezaEvidencia[]; carpeta: PiezaEvidencia[]; escrito: PiezaEvidencia[] }, max = 60): PiezaEvidencia[] {
  const vistos = new Set<string>(), out: PiezaEvidencia[] = []
  for (const p of [...listas.mencion, ...listas.carpeta, ...listas.escrito]) {
    if (vistos.has(p.ruta)) continue
    vistos.add(p.ruta); out.push(p)
    if (out.length >= max) break
  }
  return out
}

/**
 * El resumen para el dueño: el primer párrafo de su respuesta, en una o dos frases, sin rutas, código, enlaces ni marcas
 * de Markdown. La convención le pide al agente abrir así su respuesta; si no lo hizo, esto es lo más cerca.
 */
export function resumenHumano(texto: string | null | undefined, max = 300): string | null {
  const s = (texto ?? '').replace(/```[\s\S]*?```/g, '\n\n').replace(/\r/g, '')
  const parrafos = s.split(/\n\s*\n/).map(p => p.split('\n').filter(l => !/^\s*(#|\||[-*_]{3,}\s*$)/.test(l)).join(' ').trim()).filter(Boolean)
  const elegido = parrafos.find(p => !/^\s*([-*•]|\d+\.)\s/.test(p) && /[a-záéíóúñ]{3}/i.test(p)) ?? parrafos[0]
  if (!elegido) return null
  const ruta = `(?:\`[^\`]*\`|(?:~\\/|\\/)?(?:[\\w.@+\\-]+\\/)+(?:[\\w.@+\\-]*[\\w@+\\-])?|[\\w@+\\-]+\\.(?:${EXTS}|md|ts|tsx|js|json|py|sh|txt))`
  const limpio = elegido
    .replace(URL_RE, '')
    .replace(new RegExp(`\\s+(?:en|a|de|desde|hacia)\\s+(?:la carpeta\\s+|el archivo\\s+)?${ruta}`, 'gi'), '')
    .replace(new RegExp(ruta, 'g'), '')
    .replace(/\*\*|__/g, '').replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|$)/g, '$1')
    .replace(/^\s*([-*•]|\d+\.)\s+/, '')
    .replace(/\s+([,.;:])/g, '$1').replace(/([,;:])(?=[,.;:])/g, '').replace(/\(\s*[,;:]\s*/g, '(').replace(/\s*[,;:]\s*\)/g, ')').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim()
  if (!limpio) return null
  const frases = limpio.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map(f => f.trim()).filter(Boolean) ?? [limpio]
  let out = frases[0]
  if (frases[1] && out.length + frases[1].length + 1 <= max) out += ` ${frases[1]}`
  return out.length > max ? `${out.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : out
}
