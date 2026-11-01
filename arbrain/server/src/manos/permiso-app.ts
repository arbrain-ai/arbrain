/**
 * La puerta de entrada de las manos (1 nov 2026, opciones 1 y 2 firmadas por Daniel; docs/builds/
 * manos-permiso-por-app-2026-11-01). Una capa del adaptador, encima del freno y debajo de la grabadora:
 * `Grabadora → CapaApps → Freno → Vigía → adaptador`. Común a todos los adaptadores (casa, windows y el que venga):
 * solo usa el contrato (`apps`, `ventanas`, `inactividad`, `ultimaToma`).
 *
 * 1. Permiso por app (solo la edición del alumno). Antes de observar, actuar, verificar, mostrar o abrir una app, la
 *    capa pregunta al daemon (`/manos/apps/pedir`, `cliente/permisos-app.ts`). Si la persona no ha decidido, Arbrain
 *    le pinta una tarjeta «Siempre / Solo esta conversación / No» con el para qué, y la llamada espera su clic un rato.
 *    Si no contesta, el agente recibe `PERMISO_PENDIENTE` (no un error): lo dice en una línea y vuelve a llamar, sin
 *    cerrar el turno. «No» vale para toda la conversación. Las ventanas que abrieron las manos (navegar, abrir) no
 *    preguntan: ya pasaron su propio juicio (`juicio-url.ts`). La lista de apps no pregunta: es metadato.
 *    Instalación de Daniel: sin cambio (su interruptor y su freno como están).
 *
 * 2. «Daniel tiene el control» (ambas ediciones, opción 2). Si la app que el agente va a tocar está al frente y la
 *    persona hizo clic o tecleó hace menos de `MANOS_TOMA_S` segundos (2.5 por defecto), `actuar` no toca nada y
 *    devuelve un error con nombre (`persona_tiene_el_control`) que le dice al agente que no reintente en bucle.
 *    Idea de T3 Code (`humanControl`). `via: hid` no pasa por aquí: ya tiene su propio candado de inactividad.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { esEdicionCliente } from '../edicion.js'
import type { Adaptador, App, Expectativa, Objetivo, Observacion, PedidoActuar, PedidoObservar, ResultadoAccion, ResultadoVerificar, Ventana } from './contrato.js'
import { Freno } from './freno.js'

export interface AppIdentificada { clave: string; nombre: string; pid?: number; activa?: boolean }
export type RespuestaPermiso = { estado: 'permitida'; alcance?: string } | { estado: 'negada' } | { estado: 'pendiente'; id: string } | { estado: 'vencida' } | { estado: 'error'; detalle: string }

/** Cómo habla la capa con el daemon (inyectable en pruebas). */
export interface DaemonPermisos {
  pedir(p: { app: { clave: string; nombre: string }; para: string; conversacion: string | null }): Promise<RespuestaPermiso>
  estado(id: string): Promise<RespuestaPermiso>
}

const CATEGORIA_PERMISO = 'permiso_app'
export const CATEGORIA_CONTROL = 'persona_tiene_el_control'

export const textoPendiente = (nombre: string) => `PERMISO_PENDIENTE (app_en_espera): la persona todavía no decide si puedes usar ${nombre}. En Arbrain tiene una tarjeta «Siempre / Solo esta conversación / No». No se tocó nada. No termines tu turno ni busques otra vía: dile en una línea que esperas su permiso para ${nombre} y vuelve a llamar a esta misma herramienta (la llamada espera su clic).`
export const textoNegada = (nombre: string) => `PERMISO (app_negada): la persona dijo que no a que uses ${nombre} en esta conversación. No se tocó nada. No lo intentes por otra vía (otra app, AppleScript, PowerShell, la terminal): dile en una línea qué necesitabas de ${nombre} y sigue con lo que no dependa de esa app.`
export const textoSinDaemon = (nombre: string, detalle = '') => `PERMISO (sin_conexion): no pude preguntarle a la persona si puedes usar ${nombre}${detalle ? ` (${detalle})` : ''}. No se tocó nada; inténtalo de nuevo en un momento.`
export const textoControl = (nombre: string, hace: number) => `${DUENO_M} tiene el control (${CATEGORIA_CONTROL}): está usando ${nombre} ahora mismo (su último clic o tecla fue hace ${hace.toFixed(1)} s). No se tocó nada. No reintentes en bucle ni busques otra vía: dile en una línea que esperas a que termine y sigue cuando ${DUENO} te lo diga o cuando lleve unos segundos sin tocar ${nombre}.`

/** Segundos de «la persona acaba de tocar»: menos que esto y la app al frente = tomó la ventana. */
export const TOMA_S = () => Number(process.env.MANOS_TOMA_S) || 2.5
/** Cuánto espera una llamada el clic de la persona antes de devolver `PERMISO_PENDIENTE`. */
const ESPERA_MS = () => (Number(process.env.ARBRAIN_PERMISO_APP_ESPERA_S) || 25) * 1000

/** Daemon real: HTTP local con el pase de agente (mismas credenciales que `confirmacion-humana.ts`). */
export function daemonHttp(fetcher: typeof fetch = fetch): DaemonPermisos {
  const llamar = async (ruta: string, cuerpo?: unknown): Promise<RespuestaPermiso> => {
    const puerto = process.env.MC_SERVER_PORT, token = process.env.ARBRAIN_PASE_AGENTE || process.env.OPENCLAW_GATEWAY_TOKEN
    if (!puerto || !token) return { estado: 'error', detalle: 'sin conexión con Arbrain' }
    try {
      const r = await fetcher(`http://127.0.0.1:${puerto}${ruta}`, { method: cuerpo === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }), signal: AbortSignal.timeout(5_000) })
      const j = await r.json().catch(() => ({})) as Record<string, unknown>
      if (!r.ok) return { estado: 'error', detalle: String(j.error ?? `HTTP ${r.status}`) }
      if (j.estado === 'permitida') return { estado: 'permitida', alcance: String(j.alcance ?? '') }
      if (j.estado === 'negada' || j.estado === 'vencida') return { estado: j.estado }
      if (j.estado === 'pendiente' && typeof j.id === 'string') return { estado: 'pendiente', id: j.id }
      return { estado: 'error', detalle: 'respuesta desconocida' }
    } catch (e) { return { estado: 'error', detalle: (e as Error).message.slice(0, 120) } }
  }
  return { pedir: p => llamar('/manos/apps/pedir', p), estado: id => llamar(`/manos/apps/${id}`) }
}

/** El freno de esta cadena (para saber qué ventanas abrieron las manos). */
function frenoDe(a: Adaptador): Freno | undefined {
  let x: any = a
  for (let i = 0; x && i < 8; i++, x = x.interno) if (x instanceof Freno) return x
  return undefined
}

const minus = (s: string | undefined) => (s ?? '').trim().toLowerCase()

export class CapaApps implements Adaptador {
  readonly nombre: string
  /** Para qué declaró el agente que usa la app (lo pone `ejecutarManos` antes de cada llamada). */
  private para = ''
  /** Apps que ya pasaron en este proceso con «siempre» o «esta conversación» (se vuelve a preguntar al daemon igual). */
  private readonly op: { cliente: () => boolean; daemon: DaemonPermisos; conversacion: () => string | null; esperaMs: () => number; cadaMs: number }

  constructor(readonly interno: Adaptador, op: Partial<{ cliente: () => boolean; daemon: DaemonPermisos; conversacion: () => string | null; esperaMs: () => number; cadaMs: number }> = {}) {
    this.nombre = interno.nombre
    this.op = {
      cliente: op.cliente ?? (() => esEdicionCliente()),
      daemon: op.daemon ?? daemonHttp(),
      conversacion: op.conversacion ?? (() => process.env.ARBRAIN_MANOS_CONVERSACION || null),
      esperaMs: op.esperaMs ?? ESPERA_MS,
      cadaMs: op.cadaMs ?? 500,
    }
  }

  /** Lo que el agente dijo que quiere hacer (o el pedido de la persona): se muestra en la tarjeta. */
  declarar(para: unknown): void { this.para = typeof para === 'string' ? para.replace(/\s+/g, ' ').trim().slice(0, 200) : '' }

  /** ¿Qué app es este objetivo? Por pid, bundle o nombre; con solo la ventana, por su dueño. */
  async identificar(o: Objetivo): Promise<AppIdentificada | null> {
    const apps = await this.interno.apps().catch(() => [] as App[])
    let a: App | undefined
    if (o.pid) a = apps.find(x => x.pid === o.pid)
    if (!a && o.app) a = apps.find(x => x.bundle === o.app || x.nombre === o.app) ?? apps.find(x => minus(x.bundle) === minus(o.app) || minus(x.nombre) === minus(o.app))
    if (!a && o.ventana != null) {
      const w = (await this.interno.ventanas().catch(() => [] as Ventana[])).find(x => x.id === Number(o.ventana))
      if (w) a = apps.find(x => x.pid === w.pid) ?? { nombre: w.app, pid: w.pid, activa: false }
    }
    if (a) return { clave: minus(a.bundle || a.nombre), nombre: a.nombre || a.bundle || 'la app', pid: a.pid, activa: a.activa }
    if (o.app) return { clave: minus(o.app), nombre: o.app }
    return null
  }

  /** Permiso por app: null si puede entrar; si no, el texto para el agente. */
  async revisar(o: Objetivo): Promise<string | null> {
    if (!this.op.cliente()) return null
    // Ventanas que abrieron las manos (navegar, abrir una app que no corría): ya pasaron su juicio.
    if (o.ventana != null && frenoDe(this.interno)?.propias.has(Number(o.ventana))) return null
    const app = await this.identificar(o)
    if (!app) return null // sin objetivo: el adaptador dirá qué falta
    const conversacion = this.op.conversacion()
    let r = await this.op.daemon.pedir({ app: { clave: app.clave, nombre: app.nombre }, para: this.para, conversacion })
    const fin = Date.now() + this.op.esperaMs()
    while (r.estado === 'pendiente' && Date.now() < fin) {
      await new Promise(res => setTimeout(res, this.op.cadaMs))
      const id = r.id
      r = await this.op.daemon.estado(id)
      if (r.estado === 'pendiente' && !r.id) r = { estado: 'pendiente', id }
    }
    if (r.estado === 'permitida') return null
    if (r.estado === 'negada') return textoNegada(app.nombre)
    if (r.estado === 'pendiente' || r.estado === 'vencida') return textoPendiente(app.nombre)
    return textoSinDaemon(app.nombre, r.estado === 'error' ? r.detalle : '')
  }

  /** «Daniel tiene el control»: la app está al frente y la persona hizo clic o tecleó hace un instante. */
  async controlDeLaPersona(p: PedidoActuar): Promise<string | null> {
    if (p.via === 'hid') return null
    const app = await this.identificar(p)
    if (!app?.activa) return null
    const hace = await (this.interno.ultimaToma?.() ?? this.interno.inactividad?.() ?? Promise.resolve(undefined)).catch(() => undefined)
    if (typeof hace !== 'number' || hace >= TOMA_S()) return null
    return textoControl(app.nombre, hace)
  }

  async observar(p: PedidoObservar): Promise<Observacion> {
    const no = await this.revisar(p)
    if (no) throw new Error(no)
    return this.interno.observar(p)
  }

  async actuar(p: PedidoActuar): Promise<ResultadoAccion> {
    const no = await this.revisar(p)
    if (no) return { ok: false, efecto: 'bloqueado', freno: { categoria: CATEGORIA_PERMISO, motivo: no.slice(0, 160), paso: false }, detalle: no }
    const control = await this.controlDeLaPersona(p)
    if (control) return { ok: false, efecto: 'bloqueado', freno: { categoria: CATEGORIA_CONTROL, motivo: `${DUENO} está usando la app`, paso: false }, detalle: control }
    return this.interno.actuar(p)
  }

  async verificar(p: Objetivo & { espera: Expectativa[] }): Promise<ResultadoVerificar> {
    const no = await this.revisar(p)
    if (no) throw new Error(no)
    return this.interno.verificar(p)
  }

  async abrir(app: string) {
    const no = await this.revisar({ app })
    if (no) throw new Error(no)
    return this.interno.abrir(app)
  }

  get mostrar() {
    const m = this.interno.mostrar?.bind(this.interno)
    if (!m) return undefined
    return async (p: Objetivo) => { const no = await this.revisar(p); if (no) throw new Error(no); await m(p) }
  }

  apps() { return this.interno.apps() }
  ventanas(p?: { app?: string; pid?: number }) { return this.interno.ventanas(p) }
  cursor() { return this.interno.cursor() }
  salud() { return this.interno.salud() }
  cerrar() { return this.interno.cerrar() }
  get contexto() { return this.interno.contexto?.bind(this.interno) }
  get pagina() { return this.interno.pagina?.bind(this.interno) }
  get medios() { return this.interno.medios?.bind(this.interno) }
  get soltar() { return this.interno.soltar?.bind(this.interno) }
  get inactividad() { return this.interno.inactividad?.bind(this.interno) }
  get ultimaToma() { return this.interno.ultimaToma?.bind(this.interno) }
  get abrirUrl() { return this.interno.abrirUrl?.bind(this.interno) }
}
