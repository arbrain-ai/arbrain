/**
 * Permiso por app (1 nov 2026, firmado por Daniel: «ok lo que tú consideres», opción 1 de
 * docs/builds/computer-use-competencia-2026-11-01/REPORTE.md; patrón de Cloudroom). Edición del alumno.
 *
 * La primera vez que las manos van a tocar una app en una conversación, la persona ve una tarjeta en Arbrain con el
 * para qué: «Siempre / Solo esta conversación / No».
 *   siempre        la app entra a la lista de Ajustes › Computer use (persistente, se quita ahí).
 *   conversacion   vale mientras dure esta conversación (memoria del daemon; reiniciar Arbrain la olvida).
 *   no             en esta conversación las manos no tocan esa app y el agente no vuelve a preguntar.
 * Es la puerta de ENTRADA (dónde puede entrar el agente); `frenar()` sigue decidiendo qué no puede hacer ahí.
 *
 * El daemon es la fuente: el proceso de manos pide por HTTP con el pase (`/manos/apps/pedir`, `/manos/apps/<id>`) y
 * solo la app resuelve (`/manos/apps/resolver`, con el secreto de confirmar). Un agente nunca se da permiso a sí mismo.
 * La lista de «siempre» vive en `DIR_ARBRAIN()/manos/apps-siempre.json` (la carpeta de la app, como las reglas de
 * «Permitir siempre»; el Bash de los agentes no la escribe).
 *
 * Aquí vive también el reloj de turnos de las manos (opción 2): el daemon cuenta los turnos de chat que terminan por
 * conversación y el proceso de manos suelta sus candados en cuanto el suyo terminó (`manos/ciclo.ts`).
 *
 * Capa común: no sabe qué adaptador hay debajo (casa en macOS, windows, o el que venga). Instalación de Daniel: no aplica.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'

export type DecisionApp = 'siempre' | 'conversacion' | 'no'
/** La app tal como la identifica el adaptador: `clave` estable (bundle id o ejecutable) y su nombre visible. */
export interface AppObjetivo { clave: string; nombre: string }
export interface PedidoApp {
  id: string
  app: AppObjetivo
  /** Para qué la quiere el agente, en sus palabras (declarado, sin verificar). */
  para: string
  conversacion: string | null
  estado: 'pendiente' | 'resuelta' | 'vencida'
  decision?: DecisionApp
  creada: number
  resuelta?: number
}
export interface AppSiempre { clave: string; nombre: string; desde: number }
export type RespuestaPedir =
  | { estado: 'permitida'; alcance: 'siempre' | 'conversacion' }
  | { estado: 'negada' }
  | { estado: 'pendiente'; id: string }

/** Una tarjeta sin respuesta deja de pintarse a los 10 min; el agente vuelve a pedir y aparece otra vez. */
export const VIDA_PEDIDO_MS = 10 * 60_000
const MAX_SIEMPRE = 200
const SIN_CONVERSACION = '(sin conversación)'

export const ID_PEDIDO_APP = /^pa_[0-9a-f]{12}$/

// eslint-disable-next-line no-control-regex
const limpio = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
/** Clave de una app: minúsculas, sin espacios de sobra. `com.WhatsApp.Desktop` y `com.whatsapp.desktop` son la misma. */
export const claveApp = (v: unknown) => limpio(v, 160).toLowerCase()

/** `{ clave, nombre }` válido o null. Pura. */
export function appObjetivo(v: unknown): AppObjetivo | null {
  const o = (v ?? {}) as Record<string, unknown>
  const clave = claveApp(o.clave)
  const nombre = limpio(o.nombre, 80) || clave
  return clave ? { clave, nombre } : null
}

export class PermisosApp {
  private pedidos = new Map<string, PedidoApp>()
  /** Decisiones de esta conversación: conversación → clave → sí/no. Solo en memoria. */
  private porConversacion = new Map<string, Map<string, 'si' | 'no'>>()
  private lista: AppSiempre[] | null = null

  constructor(private readonly ruta: () => string = () => join(DIR_ARBRAIN(), 'manos', 'apps-siempre.json'), private readonly ahora: () => number = Date.now) {}

  // ---------- «Siempre» (persistente) ----------

  siempre(): AppSiempre[] {
    if (this.lista) return this.lista
    try {
      const j = JSON.parse(readFileSync(this.ruta(), 'utf8'))
      this.lista = (Array.isArray(j?.apps) ? j.apps : []).map((a: unknown) => {
        const o = appObjetivo(a)
        return o ? { ...o, desde: Number((a as AppSiempre).desde) || 0 } : null
      }).filter(Boolean).slice(0, MAX_SIEMPRE) as AppSiempre[]
    } catch { this.lista = [] }
    return this.lista!
  }

  private guardar(lista: AppSiempre[]): void {
    this.lista = lista
    const ruta = this.ruta()
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 })
    writeFileSync(`${ruta}.tmp`, JSON.stringify({ apps: lista }, null, 1), { mode: 0o600 })
    renameSync(`${ruta}.tmp`, ruta)
  }

  /** Ajustes › Computer use: quitar una app de «siempre». La próxima vez vuelve a preguntar. */
  quitar(clave: unknown): boolean {
    const c = claveApp(clave)
    const antes = this.siempre()
    if (!antes.some(a => a.clave === c)) return false
    this.guardar(antes.filter(a => a.clave !== c))
    return true
  }

  // ---------- Consulta y pedido ----------

  private conv = (c: string | null | undefined) => limpio(c, 200) || SIN_CONVERSACION

  /** Lo que ya está decidido para esta app en esta conversación (sin crear nada). */
  consultar(app: AppObjetivo, conversacion: string | null): RespuestaPedir | null {
    const c = this.porConversacion.get(this.conv(conversacion))?.get(app.clave)
    // «No» en esta conversación manda incluso sobre «siempre»: la persona lo acaba de decir aquí.
    if (c === 'no') return { estado: 'negada' }
    if (this.siempre().some(a => a.clave === app.clave)) return { estado: 'permitida', alcance: 'siempre' }
    if (c === 'si') return { estado: 'permitida', alcance: 'conversacion' }
    return null
  }

  /** El proceso de manos va a tocar una app: decisión vigente o una tarjeta pendiente (reutiliza la que ya espera). */
  pedir(p: { app: AppObjetivo; para?: unknown; conversacion?: unknown }): RespuestaPedir {
    const conversacion = typeof p.conversacion === 'string' && p.conversacion.trim() ? limpio(p.conversacion, 200) : null
    const ya = this.consultar(p.app, conversacion)
    if (ya) return ya
    this.vencer()
    const viva = [...this.pedidos.values()].find(x => x.estado === 'pendiente' && x.app.clave === p.app.clave && x.conversacion === conversacion)
    if (viva) return { estado: 'pendiente', id: viva.id }
    const id = `pa_${randomBytes(6).toString('hex')}`
    this.pedidos.set(id, { id, app: p.app, para: limpio(p.para, 200), conversacion, estado: 'pendiente', creada: this.ahora() })
    return { estado: 'pendiente', id }
  }

  private vencer(): void {
    const ahora = this.ahora()
    for (const [id, x] of this.pedidos) {
      // La vencida se queda otros 10 min para que el proceso de manos que la esperaba lo sepa; luego se olvida.
      if (x.estado === 'pendiente' && ahora - x.creada > VIDA_PEDIDO_MS) { x.estado = 'vencida'; x.resuelta = ahora; continue }
      if (x.estado !== 'pendiente' && ahora - (x.resuelta ?? x.creada) > VIDA_PEDIDO_MS) this.pedidos.delete(id)
    }
  }

  get(id: string): PedidoApp | null { this.vencer(); return this.pedidos.get(id) ?? null }

  /** Estado de un pedido para el proceso de manos (lo que espera mientras la persona decide). */
  estadoDe(id: string): RespuestaPedir | { estado: 'vencida' } | null {
    const x = this.get(id)
    if (!x) return null
    if (x.estado === 'vencida') return { estado: 'vencida' }
    if (x.estado === 'pendiente') return { estado: 'pendiente', id }
    return x.decision === 'no' ? { estado: 'negada' } : { estado: 'permitida', alcance: x.decision === 'siempre' ? 'siempre' : 'conversacion' }
  }

  /** Tarjetas que esperan a la persona (la más vieja primero). */
  pendientes(): PedidoApp[] {
    this.vencer()
    return [...this.pedidos.values()].filter(x => x.estado === 'pendiente').sort((a, b) => a.creada - b.creada)
  }

  /** Decisión de la persona (quien llama ya verificó el secreto de la app). */
  resolver(id: unknown, decision: unknown): { ok: true; pedido: PedidoApp } | { ok: false; status: number; error: string } {
    if (decision !== 'siempre' && decision !== 'conversacion' && decision !== 'no') return { ok: false, status: 400, error: 'decision: «siempre», «conversacion» o «no».' }
    const x = typeof id === 'string' && ID_PEDIDO_APP.test(id) ? this.get(id) : null
    if (!x) return { ok: false, status: 404, error: 'No existe ese pedido de permiso.' }
    if (x.estado !== 'pendiente') return { ok: false, status: 409, error: `Ese pedido ya está ${x.estado}.` }
    const c = this.conv(x.conversacion)
    if (!this.porConversacion.has(c)) this.porConversacion.set(c, new Map())
    if (decision === 'siempre') {
      const lista = this.siempre().filter(a => a.clave !== x.app.clave)
      if (lista.length >= MAX_SIEMPRE) lista.shift()
      this.guardar([...lista, { ...x.app, desde: this.ahora() }])
      this.porConversacion.get(c)!.delete(x.app.clave)
    } else this.porConversacion.get(c)!.set(x.app.clave, decision === 'no' ? 'no' : 'si')
    x.estado = 'resuelta'; x.decision = decision; x.resuelta = this.ahora()
    // La misma app pedida en otra tarjeta de esta conversación queda resuelta con ella.
    for (const y of this.pedidos.values()) if (y !== x && y.estado === 'pendiente' && y.app.clave === x.app.clave && (decision === 'siempre' || y.conversacion === x.conversacion)) { y.estado = 'resuelta'; y.decision = decision; y.resuelta = x.resuelta }
    return { ok: true, pedido: x }
  }
}

// ---------- Turnos (ciclo de vida atado al turno, opción 2) ----------

/** Turnos de chat por conversación: cuántos terminaron y si hay uno vivo. El proceso de manos suelta al ver que el suyo cerró. */
export class TurnosManos {
  private vivos = new Map<string, number>()
  private fines = new Map<string, number>()
  empezar(conversacion: string): void { this.vivos.set(conversacion, (this.vivos.get(conversacion) ?? 0) + 1) }
  terminar(conversacion: string): void {
    const n = (this.vivos.get(conversacion) ?? 1) - 1
    if (n > 0) this.vivos.set(conversacion, n); else this.vivos.delete(conversacion)
    this.fines.set(conversacion, (this.fines.get(conversacion) ?? 0) + 1)
  }
  estado(conversacion: unknown): { vivo: boolean; fin: number } {
    const c = typeof conversacion === 'string' ? conversacion : ''
    return { vivo: (this.vivos.get(c) ?? 0) > 0, fin: this.fines.get(c) ?? 0 }
  }
}

// ---------- Instancias del daemon ----------

let permisos: PermisosApp | null = null
export const permisosAppDelDaemon = (): PermisosApp => (permisos ??= new PermisosApp())
export const turnosManos = new TurnosManos()
/** Solo pruebas. */
export function _permisosAppParaPruebas(p: PermisosApp | null): void { permisos = p }
