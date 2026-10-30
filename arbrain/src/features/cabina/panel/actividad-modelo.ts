/**
 * Actividad viva de un subagente sin pantalla (7 oct 2026): el modelo puro que junta las lecturas incrementales
 * de `/api/cabina/actividad` (contrato en arbrain/server/src/cabina/actividad.ts). Sin React, con pruebas.
 */

export type Paso =
  | { k: 'encargo'; texto: string; n: number }
  | { k: 'entrada'; texto: string }
  | { k: 'texto'; texto: string; sub?: boolean }
  | { k: 'herramienta'; id: string; nombre: string; que: string; detalle: string; cambio?: { quita: number; pone: number }; sub?: boolean }
  | { k: 'resultado'; id: string; ok: boolean; salida: string; lineas: number; codigo?: number }
  | { k: 'progreso'; id: string; seg: number }
  | { k: 'pensando'; tokens: number }
  | { k: 'fin'; codigo: number; detenido?: boolean }
  | { k: 'error'; texto: string }

export interface Lectura { pasos: Paso[]; offset: number; recortado: boolean; turnoBase: number; corriendo: boolean; harness: string; encargo?: string }

export type Visible = Exclude<Paso, { k: 'resultado' } | { k: 'progreso' }>
export type Resultado = Extract<Paso, { k: 'resultado' }>
export interface Actividad {
  pasos: Visible[]
  resultados: Record<string, Resultado>
  progreso: Record<string, number>
  offset: number | null
  turno: number
  recortado: boolean
  corriendo: boolean
  /** ms de la última vez que llegó algo nuevo: «hace 12 s» cuando un comando largo no escribe. */
  ultimoCambio: number
}

export const vacia = (): Actividad => ({ pasos: [], resultados: {}, progreso: {}, offset: null, turno: 0, recortado: false, corriendo: false, ultimoCambio: 0 })

const TOPE = 1500

/** Aplica una lectura. La primera (offset null) reemplaza; las siguientes agregan. */
export function aplicar(a: Actividad, l: Lectura, ahora = Date.now()): Actividad {
  const primera = a.offset == null
  const pasos = primera ? [] : a.pasos.slice()
  const resultados = primera ? {} : { ...a.resultados }
  const progreso = primera ? {} : { ...a.progreso }
  const ids = new Set(pasos.flatMap(p => p.k === 'herramienta' ? [p.id] : []))
  for (const p of l.pasos) {
    if (p.k === 'resultado') { resultados[p.id] = p; continue }
    if (p.k === 'progreso') { progreso[p.id] = p.seg; continue }
    if (p.k === 'herramienta') { if (ids.has(p.id)) continue; ids.add(p.id) }
    const ult = pasos.at(-1)
    if (p.k === 'pensando' && ult?.k === 'pensando') { pasos[pasos.length - 1] = { k: 'pensando', tokens: Math.max(ult.tokens, p.tokens) }; continue }
    pasos.push(p)
  }
  const sobra = pasos.length - TOPE
  return {
    pasos: sobra > 0 ? pasos.slice(sobra) : pasos, resultados, progreso, offset: l.offset, turno: l.turnoBase,
    recortado: primera ? l.recortado : a.recortado || sobra > 0, corriendo: l.corriendo,
    ultimoCambio: l.pasos.length || primera ? ahora : a.ultimoCambio,
  }
}

export const urlActividad = (agente: number, a: Pick<Actividad, 'offset' | 'turno'>) =>
  `/api/cabina/actividad?agente=${agente}${a.offset != null ? `&desde=${a.offset}&turno=${a.turno}` : ''}`

/** Ruta relativa a la carpeta del agente: `~/Developer/wt-x/arbrain/a.ts` → `arbrain/a.ts`. */
export function relativa(ruta: string, cwd: string): string {
  const base = cwd.replace(/\/+$/, '')
  return base && ruta.startsWith(base + '/') ? ruta.slice(base.length + 1) : ruta
}

export function duracion(seg: number): string {
  if (seg < 60) return `${Math.round(seg)} s`
  const m = Math.floor(seg / 60), s = Math.round(seg % 60)
  return m < 60 ? `${m} min${s ? ` ${s} s` : ''}` : `${Math.floor(m / 60)} h ${m % 60} min`
}

export const miles = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)

/** En qué está ahora mismo, para la línea viva de abajo. */
export function enQue(a: Actividad): { tipo: 'pensando' | 'herramienta' | 'escribiendo' | 'quieto'; texto: string } {
  if (!a.corriendo) return { tipo: 'quieto', texto: '' }
  const ult = a.pasos.at(-1)
  if (ult?.k === 'pensando') return { tipo: 'pensando', texto: ult.tokens ? `Pensando · ${miles(ult.tokens)} tokens` : 'Pensando' }
  if (ult?.k === 'herramienta' && !a.resultados[ult.id]) return { tipo: 'herramienta', texto: ult.que }
  return { tipo: 'escribiendo', texto: 'Trabajando' }
}
