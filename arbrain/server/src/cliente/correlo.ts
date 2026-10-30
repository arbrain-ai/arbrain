/**
 * «Córrelo tú» (botón Play, 27 oct 2026). Cuando el comando necesita las manos de la persona (sudo con su contraseña,
 * iniciar sesión en un servicio), el agente no lo corre: la tarjeta del hilo le enseña el comando y un botón. Su clic es
 * la autorización: el daemon abre una terminal del motor (la misma PTY del Taller), corre ahí el LITERAL que ya vio la
 * persona (nunca un texto que mande el navegador), la persona teclea lo que haga falta, y al terminar la salida vuelve
 * al agente como resultado de su herramienta.
 *
 * El fin se detecta con una marca con nonce que imprime el propio shell tras el comando (`$?` = su código). El motor no
 * teclea el comando (lo pasa con `-c`), así que la marca solo aparece en pantalla cuando de verdad terminó.
 */
import { randomBytes } from 'node:crypto'
import type { Confirmacion, Confirmaciones } from './confirmaciones.js'
import { VIDA_CORRIDA_MS } from './confirmaciones.js'
import { motor } from '../motor/cliente.js'

/**
 * ¿Responde el motor de terminales? Sin él, «Córrelo tú» no tiene dónde correr (modo servidor: el motor es de la app de
 * escritorio). Sondea `info` con un plazo corto; cualquier error cuenta como «no hay».
 */
export async function terminalDisponible(plazoMs = 1500, m: Pick<typeof motor, 'info'> = motor): Promise<boolean> {
  let t: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([m.info().then(() => true), new Promise<boolean>(ok => { t = setTimeout(() => ok(false), plazoMs) })])
  } catch { return false } finally { if (t) clearTimeout(t) }
}

export interface MotorCorrelo {
  spawn(p: { cwd: string; command: string; cols?: number; rows?: number }): Promise<{ id: number; pid: number }>
  screen(id: number, lines?: number): Promise<string>
  kill(id: number): Promise<void>
}

export interface OpcionesCorrelo {
  motor: MotorCorrelo
  cwd: string
  cadaMs?: number
  maxMs?: number
  /** Después de leer el resultado, cuánto se deja viva la terminal (para que la persona vea el final). */
  cierreMs?: number
  registrar?: (e: Record<string, unknown>) => void
}

/** Quita colores y controles de la pantalla del emulador. */
// eslint-disable-next-line no-control-regex
const limpiar = (t: string) => t.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '').replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')

export function comandoConMarca(literal: string, nonce: string): string {
  return `${literal}\nprintf '\\n__ARBRAIN_FIN_${nonce}_%s__\\n' "$?"`
}

export function leerFin(pantalla: string, nonce: string): { salida: string; codigo: number } | null {
  const re = new RegExp(`__ARBRAIN_FIN_${nonce}_(\\d+)__`)
  const m = re.exec(pantalla)
  if (!m) return null
  const salida = limpiar(pantalla.slice(0, m.index)).replace(/\s+$/, '')
  return { salida, codigo: Number(m[1]) }
}

/**
 * Empieza la corrida de una confirmación `manos` pendiente. Devuelve la confirmación ya `corriendo` (con su terminal);
 * la vigilancia sigue sola en segundo plano y deja la confirmación `corrida` con su salida.
 */
export async function empezarCorrelo(store: Confirmaciones, id: string, extras: { comentario?: unknown }, op: OpcionesCorrelo): Promise<{ ok: true; confirmacion: Confirmacion } | { ok: false; status: number; error: string }> {
  const c = store.get(id)
  if (!c) return { ok: false, status: 404, error: 'No existe esa confirmación.' }
  if (c.tipo !== 'manos' || !c.literal) return { ok: false, status: 409, error: 'Esta confirmación no es para correrla tú.' }
  if (c.estado !== 'pendiente' && c.estado !== 'en_cola') return { ok: false, status: 409, error: `La confirmación ya está ${c.estado}.` }
  const nonce = randomBytes(8).toString('hex')
  let term: { id: number }
  try { term = await op.motor.spawn({ cwd: op.cwd, command: comandoConMarca(c.literal, nonce), cols: 100, rows: 24 }) }
  catch (e) { return { ok: false, status: 503, error: `No pude abrir la terminal: ${e instanceof Error ? e.message : String(e)}` } }
  const r = store.empezarCorrida(id, term.id, extras)
  if (!r.ok) { void op.motor.kill(term.id).catch(() => {}); return r }
  void vigilar(store, id, term.id, nonce, op)
  return r
}

async function vigilar(store: Confirmaciones, id: string, term: number, nonce: string, op: OpcionesCorrelo): Promise<void> {
  const fin = Date.now() + (op.maxMs ?? VIDA_CORRIDA_MS)
  const cada = op.cadaMs ?? 500
  let ultima = ''
  for (;;) {
    try {
      ultima = await op.motor.screen(term, 400)
      const f = leerFin(ultima, nonce)
      if (f) {
        store.terminarCorrida(id, f.salida, f.codigo)
        op.registrar?.({ evento: 'correlo_terminado', confirmacion: id, codigo: f.codigo })
        setTimeout(() => { void op.motor.kill(term).catch(() => {}) }, op.cierreMs ?? 1500).unref?.()
        return
      }
    } catch (e) {
      // La terminal se cerró (la persona la cerró, o el motor se reinició): lo último que se vio es la salida.
      store.terminarCorrida(id, limpiar(ultima).replace(/\s+$/, ''), null)
      op.registrar?.({ evento: 'correlo_sin_terminal', confirmacion: id, error: e instanceof Error ? e.message : String(e) })
      return
    }
    if (Date.now() >= fin || store.get(id)?.estado !== 'corriendo') {
      store.terminarCorrida(id, limpiar(ultima).replace(/\s+$/, ''), null)
      op.registrar?.({ evento: 'correlo_sin_fin', confirmacion: id })
      void op.motor.kill(term).catch(() => {})
      return
    }
    await new Promise(r => setTimeout(r, cada))
  }
}
