/**
 * Registro de adaptadores y lectura de la bitácora de un subagente sin pantalla.
 *
 * La bitácora (`~/.config/arbrain/subagentes/<id>.jsonl`) es el stdout del CLI tal cual, turno tras turno, con dos
 * marcas propias: `{"arbrain":"inicio",…}` (la escribe Levy antes de lanzar cada turno, con el texto que le mandó) y
 * `{"arbrain":"salida","codigo":N}` (la escribe la envoltura de shell cuando el proceso sale). Terminar = salir.
 */
import { claude } from './claude.js'
import { codex } from './codex.js'
import { gemini } from './gemini.js'
import { opencode } from './opencode.js'
import { qwen } from './qwen.js'
import { json, num, str, type Adaptador } from './tipos.js'

export type { Adaptador, Evento, Permisos } from './tipos.js'

export const ADAPTADORES: Record<string, Adaptador> = { claude, codex, opencode, gemini, qwen }
export const NOMBRES = Object.keys(ADAPTADORES)
export const adaptador = (h: string): Adaptador | null => ADAPTADORES[h] ?? null

export interface Turno {
  n: number
  inicio: number
  /** Lo que Levy le mandó en este turno (encargo o seguimiento). */
  texto: string
  mensajes: string[]
  herramientas: string[]
  final?: string
  error?: string
  tokens: number
  /** El CLI declaró fin de turno (result/turn.completed). */
  finCli: boolean
  /** El proceso salió: código y hora. Sin esto el turno sigue corriendo o lo mataron. `detenido` = Levy cortó el paso. */
  salida?: { codigo: number; en: number; detenido?: boolean }
  /** Mensajes que Levy le metió EN VIVO, a mitad del trabajo (pastor). */
  entradas: string[]
  /** Levy pidió detener el paso en este turno. */
  detenido?: boolean
  /** La última herramienta y lo que tocó: el tablero lo dice en humano («Corriendo las pruebas»). */
  paso?: { herramienta: string; detalle?: string }
}
/** `acuses`: id de cada mensaje en vivo → si el pastor lo entregó al CLI. */
export interface Bitacora { sesion?: string; turnos: Turno[]; acuses: Record<string, boolean> }

export const bitacoraVacia = (): Bitacora => ({ turnos: [], acuses: {} })

/** La respuesta con la que cerró un turno: la final que da el CLI o su último mensaje. */
export const respuestaDe = (t: Turno | undefined) => t ? (t.final?.trim() || t.mensajes.at(-1)?.trim() || '') : ''

/** Aplica una línea a la bitácora (muta y devuelve). Reductor puro sobre texto: sirve igual en pruebas y en vivo. */
export function aplicarLinea(b: Bitacora, linea: string, ad: Adaptador, estado: { delta?: boolean } = {}): Bitacora {
  const marca = json(linea)
  if (marca && typeof marca.arbrain === 'string') {
    if (marca.arbrain === 'inicio') {
      b.turnos.push({ n: b.turnos.length + 1, inicio: num(marca.en), texto: str(marca.texto) ?? '', mensajes: [], herramientas: [], tokens: 0, finCli: false, entradas: [] })
      estado.delta = false
    } else if (marca.arbrain === 'salida') {
      const t = b.turnos.at(-1)
      if (t && !t.salida) t.salida = { codigo: num(marca.codigo), en: num(marca.en) || Date.now(), ...(marca.detenido === true ? { detenido: true } : {}) }
    } else if (marca.arbrain === 'entrada') {
      const id = str(marca.id)
      if (id) b.acuses[id] = marca.entregado === true
      const t = b.turnos.at(-1), texto = str(marca.texto)
      if (t && marca.entregado === true && texto) t.entradas.push(texto)
    } else if (marca.arbrain === 'detener') {
      const t = b.turnos.at(-1)
      if (t && marca.ok === true) t.detenido = true
    } else if (marca.arbrain === 'sesion') {
      const s = str(marca.id)
      if (s && !b.sesion) b.sesion = s
    } else if (marca.arbrain === 'error') {
      const t = b.turnos.at(-1)
      if (t) t.error = str(marca.mensaje) ?? 'error del pastor'
    }
    return b
  }
  const e = ad.leerEvento(linea)
  if (!e) return b
  if (e.sesion && !b.sesion) b.sesion = e.sesion
  // eventos antes de la primera marca (no debería pasar): se abren como turno 1
  if (!b.turnos.length) b.turnos.push({ n: 1, inicio: 0, texto: '', mensajes: [], herramientas: [], tokens: 0, finCli: false, entradas: [] })
  const t = b.turnos.at(-1)!
  if (e.texto) {
    if (e.delta && estado.delta && t.mensajes.length) t.mensajes[t.mensajes.length - 1] += e.texto
    else t.mensajes.push(e.texto)
    if (t.mensajes.length > 40) t.mensajes.splice(0, t.mensajes.length - 40)
  }
  estado.delta = !!(e.texto && e.delta)
  if (e.herramienta) {
    t.herramientas.push(e.herramienta); if (t.herramientas.length > 40) t.herramientas.shift()
    t.paso = { herramienta: e.herramienta, ...(e.detalle ? { detalle: e.detalle } : {}) }
  }
  if (e.final) t.final = e.final
  if (e.error) t.error = e.error
  if (e.tokens) t.tokens += e.tokens
  if (e.fin) t.finCli = true
  // con entrada en vivo un turno puede cerrar varias veces: el último cierre limpio borra un error anterior
  if (e.fin && !e.error && !t.detenido) delete t.error
  return b
}

export function leerBitacora(texto: string, ad: Adaptador): Bitacora {
  const b = bitacoraVacia(), estado = {}
  for (const l of texto.split('\n')) if (l.trim()) aplicarLinea(b, l, ad, estado)
  return b
}

export const tokensDe = (b: Bitacora): number | null => b.turnos.some(t => t.tokens) ? b.turnos.reduce((a, t) => a + t.tokens, 0) : null
