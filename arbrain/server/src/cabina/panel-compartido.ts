/**
 * Panel compartido entre dispositivos (14 oct 2026, Daniel: «lo que tengo en el escritorio poderlo ver en el teléfono, sobre
 * todo la pantalla derecha»). Hasta hoy las pestañas del panel vivían en el `localStorage` de cada aparato: el escritorio y el
 * teléfono divergían. Ahora el Studio guarda UNA copia (las pestañas, su orden, el Taller, las ancladas y la pestaña a la vista)
 * y cada app la sincroniza en el mismo latido del bus (panel-bus.ts › sincronizar), cada ~3 s y al cambiar algo.
 *
 * Concurrencia optimista: un cambio trae la `base` (la versión que el cliente conocía). Si otra app escribió antes, se rechaza
 * y el cliente recibe la versión vigente para rehacer su cambio encima (arbrain/src/features/cabina/panel/compartido.ts).
 * La pestaña a la vista viaja aparte (`activaRev`): cambiarla no choca con abrir o cerrar pestañas.
 * Lo que es de cada aparato NO viaja: en qué ventana vive cada pestaña (las ventanas son del escritorio) ni la división.
 *
 * Archivo: `~/.config/arbrain/panel/compartido.json` (o `ARBRAIN_PANEL_DIR`). Solo llega aquí la sesión del dueño (la ruta del
 * Studio exige planningOwner), así que es SU panel.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { DIR_ARBRAIN } from '../edicion.js'

/** La misma carpeta del bus (panel-bus.ts › DIR_PANEL), sin importarlo: el bus importa este módulo. */
const DIR_PANEL = () => process.env.ARBRAIN_PANEL_DIR || path.join(DIR_ARBRAIN(), 'panel')

export interface Pestanas { fijadas: Record<string, unknown>[]; orden: string[]; taller: boolean; ancladas: string[] }
export interface Compartido extends Pestanas { rev: number; activa: string; activaRev: number; en: string; dispositivo?: string }
/** Lo que manda la app en su latido. */
export interface PedidoCompartido { rev?: number; activaRev?: number; cambio?: Pestanas & { base: number }; activa?: string }
/** Lo que vuelve: siempre las versiones; el estado y la activa solo si la app no los tiene. */
export interface RespuestaCompartido { rev: number; activaRev: number; rechazado?: boolean; error?: string; estado?: Pestanas; activa?: string }

const MAX_FIJADAS = 80
const MAX_BYTES = 400_000
export const archivoCompartido = (dir = DIR_PANEL()) => path.join(dir, 'compartido.json')

const vacio = (): Compartido => ({ rev: 0, activa: '', activaRev: 0, en: new Date(0).toISOString(), fijadas: [], orden: [], taller: true, ancladas: [] })

export function leerCompartido(dir = DIR_PANEL()): Compartido {
  try {
    const v = JSON.parse(readFileSync(archivoCompartido(dir), 'utf8')) as Compartido
    if (!v || !Number.isInteger(v.rev) || !Array.isArray(v.fijadas) || !Array.isArray(v.orden)) return vacio()
    return { ...vacio(), ...v }
  } catch { return vacio() }
}

function escribir(c: Compartido, dir = DIR_PANEL()) {
  const archivo = archivoCompartido(dir)
  mkdirSync(path.dirname(archivo), { recursive: true })
  const tmp = `${archivo}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify(c))
  renameSync(tmp, archivo)
}

const ids = (v: unknown, max = MAX_FIJADAS + 2): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x && x.length <= 160))].slice(0, max) : []

/** Valida lo que manda la app: pestañas con id e invocación (`input.vista`), sin pasar de un tamaño razonable. */
export function limpiarPestanas(v: unknown): Pestanas {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const vistos = new Set<string>()
  const fijadas = (Array.isArray(o.fijadas) ? o.fijadas : []).filter((f): f is Record<string, unknown> => {
    if (!f || typeof f !== 'object') return false
    const x = f as Record<string, unknown>, input = x.input as Record<string, unknown> | undefined
    if (typeof x.id !== 'string' || !x.id || x.id.length > 160 || vistos.has(x.id)) return false
    if (!input || typeof input !== 'object' || typeof input.vista !== 'string') return false
    vistos.add(x.id)
    return true
  }).slice(0, MAX_FIJADAS)
  if (JSON.stringify(fijadas).length > MAX_BYTES) throw new Error('El panel compartido es demasiado grande.')
  return { fijadas, orden: ids(o.orden), taller: o.taller !== false, ancladas: ids(o.ancladas) }
}

/** Atiende la parte compartida de un latido: aplica el cambio (si su base es la vigente) y dice qué le falta a la app. */
export function sincronizarCompartido(p: PedidoCompartido | undefined, dispositivo: string | undefined, ahora = Date.now(), dir = DIR_PANEL()): RespuestaCompartido {
  let actual = leerCompartido(dir)
  let rechazado = false, error: string | undefined
  if (p?.cambio) {
    if (p.cambio.base !== actual.rev) rechazado = true
    else {
      let limpio: Pestanas | null = null
      // Un cambio inválido (demasiado grande) no tumba el latido del bus: se ignora y la app sigue con lo suyo.
      try { limpio = limpiarPestanas(p.cambio) } catch { error = 'El panel compartido es demasiado grande; no se guardó.' }
      if (limpio) {
        actual = { ...actual, ...limpio, rev: actual.rev + 1, en: new Date(ahora).toISOString(), ...(dispositivo ? { dispositivo } : {}) }
        escribir(actual, dir)
      }
    }
  }
  if (typeof p?.activa === 'string' && p.activa.length <= 160 && p.activa !== actual.activa) {
    actual = { ...actual, activa: p.activa, activaRev: actual.activaRev + 1 }
    escribir(actual, dir)
  }
  const { fijadas, orden, taller, ancladas } = actual
  const r: RespuestaCompartido = { rev: actual.rev, activaRev: actual.activaRev, ...(rechazado ? { rechazado } : {}), ...(error ? { error } : {}) }
  // El estado viaja si la app no tiene esta versión (o si su cambio se rechazó: lo rehace encima).
  if (actual.rev > 0 && (rechazado || p?.rev !== actual.rev || (p?.cambio && !error))) r.estado = { fijadas, orden, taller, ancladas }
  if (actual.activaRev > 0 && p?.activaRev !== actual.activaRev) r.activa = actual.activa
  return r
}
