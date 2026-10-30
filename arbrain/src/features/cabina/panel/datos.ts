'use client'
/**
 * El panel derecho lee la MISMA fuente que la vista «trabajos» del chat
 * (`../trabajos-modelo.ts`: motor de Arbrain, gate de SFTerm de respaldo, tareas
 * internas de Levy, lsof y launchctl del Studio). Aquí solo se ordena para leerse
 * de un vistazo: de Levy contra tuyas, agentes contra shells.
 */

export type { Subagente, EstadoTerminal, Terminal, Servidor, Servicio, Trabajos, TareaInterna, Proceso, AreaServicio } from '../trabajos-modelo'
export { esAgente } from '../trabajos-modelo'
import { urlTrabajos, type EstadoTerminal, type Servidor, type Terminal } from '../trabajos-modelo'

/** Lista: 6 líneas por terminal (la MISMA URL que la vista «trabajos»: una lectura para las dos).
 *  Con una terminal abierta: 30 (el tope del Studio). */
export const urlPanel = (detalle: boolean) => urlTrabajos(detalle ? 30 : 6)

/** El nombre que le dio Levy; si no, el título de SFTerm sin el glifo de su spinner (◐ ◑ ✳ …);
 *  si tampoco, qué corre y dónde. Nunca «#11»: el número es del motor, no del dueño. */
export const nombreTerminal = (t: Terminal) => t.subagente?.nombre ?? (t.titulo.replace(/^[^\p{L}\p{N}~/]+/u, '').trim() || `${programa(t)} en ${t.cwd.split('/').filter(Boolean).at(-1) ?? 'tu carpeta'}`)
const programa = (t: Terminal) => { const p = (t.subagente?.harness ?? t.proc).toLowerCase(); return p === 'claude' ? 'Claude' : p === 'codex' ? 'Codex' : /^(zsh|bash|fish|sh)$/.test(p) ? 'Terminal' : p }
/** La última acción del agente en palabras del dueño: «Editó Cabina.tsx», no «Update(src/…)». */
export function accionLegible(a: string | null): string | null {
  if (!a) return null
  const m = /^(\w+)\(([\s\S]*?)\)?$/.exec(a.trim())
  if (!m) return a
  const [, herramienta, arg = ''] = m, archivo = arg.split(/[\s,)]/)[0].split('/').filter(Boolean).at(-1) ?? ''
  switch (herramienta) {
    case 'Bash': return 'Ejecutó un comando'
    case 'Read': return archivo ? `Leyó ${archivo}` : 'Leyó un archivo'
    case 'Edit': case 'Update': case 'MultiEdit': return archivo ? `Editó ${archivo}` : 'Editó un archivo'
    case 'Write': return archivo ? `Escribió ${archivo}` : 'Escribió un archivo'
    case 'Grep': case 'Glob': case 'Search': return 'Buscó en el código'
    case 'WebFetch': case 'WebSearch': return 'Investigó en la web'
    case 'Task': case 'Agent': return 'Lanzó un subagente'
    default: return /^mcp__/.test(herramienta) ? `Usó ${herramienta.split('__').at(-1)}` : a
  }
}
export const servicioCorto = (label: string) => label.replace(/^com\.(claudeclaw|levy|arbrain)\./, '')

export function hace(iso: string | number) {
  const s = Math.max(0, Math.round((Date.now() - (typeof iso === 'number' ? iso : Date.parse(iso))) / 1000))
  if (s < 10) return 'ahora'
  if (s < 60) return `hace ${s} s`
  const m = Math.round(s / 60)
  return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`
}

/** Orden de lectura: lo que trabaja arriba, luego lo que espera, al final las shells. */
const PESO: Record<EstadoTerminal, number> = { trabajando: 0, esperando: 1, terminal: 2 }
export function agrupar(terminales: Terminal[]) {
  const orden = (a: Terminal, b: Terminal) => PESO[a.estado] - PESO[b.estado] || a.id - b.id
  return {
    deLevy: terminales.filter(t => t.subagente).sort(orden),
    tuyas: terminales.filter(t => !t.subagente).sort(orden),
  }
}

/** Puertos que no hablan HTTP: no tiene sentido abrirlos en el navegador. */
const NO_WEB = new Set([53, 5432, 6543, 54322, 54390])
export const abreEnNavegador = (s: Servidor) => !NO_WEB.has(s.puerto) && !/^(postgres|limactl|ssh|com\.docke|mongod|redis)/i.test(s.proceso)

/** Abre en el navegador de Daniel (Chrome): en el escritorio por el opener de Tauri. Vive en `@/lib/navegador`. */
export { abrirEnNavegador } from '@/lib/navegador'
