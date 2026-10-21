/**
 * Cada quien su cursor (regla firmada por Daniel, 3 oct 2026: .claude/memory/feedback/cada-quien-su-cursor-2026-10-03.md).
 *
 * 1. Por defecto las manos trabajan por dentro de las apps (AX, SkyLight, CDP) y dibujan SU cursor, el Halo.
 *    El ratón y el teclado de Daniel nunca se tocan.
 * 2. «Quiero verte» / «muéstrame cómo»: la ventana de trabajo pasa al frente y Daniel ve moverse al Halo. Su cursor
 *    sigue siendo suyo. NO enciende `via: hid` (ese fue el malentendido del 2–3 oct).
 * 3. `via: hid` (el cursor real) es el último recurso: solo si Daniel lleva ≥ N s sin tocar ratón ni teclado
 *    (`MANOS_HID_INACTIVO_S`, 60 por defecto) o si SU cita lo pide explícitamente para esa acción («usa mi ratón»).
 *    Si mueve el ratón a mitad del gesto, la mano se detiene (ManosCasa/Mano.swift).
 *
 * El modo «quiero verte» dura lo que dura el encargo: se apaga con un pedido nuevo que no lo pida, o a los 10 min.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { esEdicionCliente } from '../edicion.js'

export const INTENCION_VER = /(quiero|quisiera|d[eé]jame|me gustar[ií]a)\s+ver(te|lo|la)?\b|\ben vivo\b|\bque (yo )?(te )?vea\b|\bmu[eé]strame c[oó]mo\b|\bens[eé][nñ]ame c[oó]mo\b|\b(con|mueve|mover|moviendo) (el|tu) cursor\b|\bt[uú] (est[eé]s|seas|eres) (quien|el que)\b.*\bcontrol|\bverte (trabajar|hacerlo|mover)/i

/**
 * Pedido explícito de usar el ratón FÍSICO de Daniel. «Quiero ver el cursor moviéndose» NO lo es (es el Halo):
 * hace falta que diga que es SU ratón o el cursor real.
 */
export const INTENCION_CURSOR_REAL = /\b(usa|usar|toma|tomar|agarra|agarrar|mueve|mover|controla|controlar|ocupa|ocupar|utiliza|utilizar)\s+mi\s+(rat[oó]n|mouse|trackpad|cursor)\b|\bcon mi (rat[oó]n|mouse|trackpad|cursor)\b|\b(rat[oó]n|mouse|cursor) (real|f[ií]sico|de verdad)\b|\bv[ií]a:? ?hid\b/i
const NEGACION_CURSOR = /\b(no|nunca|jam[aá]s|sin)\b[^.;!?]{0,24}\b(rat[oó]n|mouse|trackpad|cursor)\b/i

/** Segundos sin que Daniel toque ratón o teclado para que `via: hid` pueda usarse sin su pedido explícito. */
export const HID_INACTIVO_S = () => Number(process.env.MANOS_HID_INACTIVO_S) || 60

export class ModoVer {
  private hasta = 0
  private cita = ''
  private mostradas = new Set<number>()
  constructor(private readonly duracionMs = 10 * 60_000) {}
  /** Cada pedido de Daniel decide: si pide ver, se enciende; si es otro encargo sin pedirlo, se apaga. */
  observar(pedido?: string, ahora = Date.now()): void {
    if (!pedido || !pedido.trim()) return
    if (INTENCION_VER.test(pedido)) {
      if (pedido.trim() !== this.cita) this.mostradas.clear()
      this.hasta = ahora + this.duracionMs; this.cita = pedido.trim()
    } else this.apagar()
  }
  activo(ahora = Date.now()): boolean { return ahora < this.hasta }
  /** La cita textual de Daniel que pidió verlo. */
  get autorizacion(): string { return this.activo() ? this.cita : '' }
  /** ¿Hay que traer al frente esta app antes de actuar? Una vez por app y encargo. */
  porMostrar(pid: number): boolean { return this.activo() && !this.mostradas.has(pid) }
  mostrada(pid: number): void { this.mostradas.add(pid) }
  apagar(): void { this.hasta = 0; this.cita = ''; this.mostradas.clear() }
}

/** Uno por proceso del servidor MCP (un cliente = un proceso). */
export const modoVer = new ModoVer()

export type PermisoHid = { ok: true; permiso: 'explicito' | 'inactivo'; umbral_s: number } | { ok: false; motivo: string }

/** ¿La cita pide de forma explícita el ratón físico de Daniel? */
export function pideCursorReal(cita: unknown): boolean {
  return typeof cita === 'string' && INTENCION_CURSOR_REAL.test(cita) && !NEGACION_CURSOR.test(cita)
}

/**
 * ¿Puede ESTE paso mover el cursor real? Nunca por el modo «quiero verte». Solo con la cita explícita de Daniel
 * (`confirmacion`) o con Daniel inactivo ≥ umbral (`inactivoS`, medido por ArbrainManos; sin medida no hay permiso).
 */
export function permisoHid(confirmacion: unknown, inactivoS: number | undefined, umbral = HID_INACTIVO_S()): PermisoHid {
  // Edición cliente (AUDITORIA, valores seguros): el ratón real está desactivado; solo el cursor propio (Halo).
  if (esEdicionCliente()) return { ok: false, motivo: 'via=hid está desactivado en esta instalación: las manos solo usan su propio cursor (el Halo), nunca el ratón de la persona.' }
  if (pideCursorReal(confirmacion)) return { ok: true, permiso: 'explicito', umbral_s: umbral }
  if (typeof inactivoS === 'number' && Number.isFinite(inactivoS) && inactivoS >= umbral) return { ok: true, permiso: 'inactivo', umbral_s: umbral }
  const medida = typeof inactivoS === 'number' && Number.isFinite(inactivoS) ? `${DUENO_M} tocó el ratón o el teclado hace ${Math.round(inactivoS)} s` : `no se pudo medir la inactividad de ${DUENO}`
  return { ok: false, motivo: `via=hid mueve el cursor real de ${DUENO}. Cada quien su cursor: el Halo es el tuyo («quiero verte» = ventana al frente con el Halo, no hid). hid solo como último recurso con ${DUENO} inactivo ≥ ${umbral} s (${medida}) o con confirmacion = su cita que lo pida explícitamente («usa mi ratón»).` }
}

/** Mensaje uniforme del freno. */
export const FRENO_CURSOR = (motivo: string) => `FRENO (cursor_de_daniel): ${motivo}`
