/**
 * Adaptador `linux`: las manos de Arbrain en la pantalla virtual del modo servidor (ManosLinux, Python; 1 nov 2026).
 *
 * Mismo papel que `casa` (macOS) y `windows`, y mismo contrato: árbol de accesibilidad (AT-SPI) con refs estables,
 * acciones por accesibilidad primero y por X (xdotool) de respaldo, capturas y el navegador de la pantalla (Google
 * Chrome). La diferencia: no hay una persona frente a esta pantalla (Xvfb en el servidor); la persona la MIRA en vivo
 * desde su Arbrain por el canal privado (`/pantalla`), sin tocarla. El freno y las herramientas MCP no cambian: este
 * archivo solo traduce, y todo pasa por `componerManos` → `Freno` antes de llegar aquí.
 *
 * El ayudante (`arbrain/server/manos-linux/manos_linux.py`) viaja con el daemon (empaquetado.json › extras) y corre con
 * el Python del sistema (`/usr/bin/python3`: ahí viven gi/AT-SPI, Xlib y Pillow que instala `nube.sh pantalla`).
 * Protocolo: JSON por líneas por stdin/stdout, el mismo de ArbrainManos y ManosWindows ({id, op, ...} → {id, ok, r |
 * error, ms}). La pantalla arranca la primera vez que se usa y se apaga sola sin uso; la instala root con
 * `bash arbrain/scripts/instalar/nube.sh pantalla`, que deja el marcador que lee `pantallaVirtualInstalada()`.
 *
 * Diseño, evidencia y consumo: docs/builds/modo-servidor-2026-11-01/pantalla-virtual.md.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Adaptador, App, ContextoAccion, Elemento, Expectativa, Objetivo, Observacion, PedidoActuar, PedidoNavegar, PedidoObservar, ResultadoAccion, ResultadoMedios, ResultadoVerificar, Ventana } from '../contrato.js'

/** Marcador que deja el instalador (root). Sin él, computer use no existe en Linux (edición cliente). */
export const RUTA_MARCADOR_PANTALLA = () => process.env.ARBRAIN_PANTALLA_MARCADOR || '/etc/arbrain/pantalla-virtual.json'

/** ¿Hay pantalla virtual instalada en esta máquina? Solo Linux; un solo lugar que lo dice (política, registro, daemon). */
export function pantallaVirtualInstalada(plataforma: string = process.env.ARBRAIN_PLATAFORMA_PRUEBA || process.platform): boolean {
  return plataforma === 'linux' && existsSync(RUTA_MARCADOR_PANTALLA())
}

export const RUTA_AYUDANTE = () => process.env.MANOS_LINUX_HELPER || fileURLToPath(new URL('../../../manos-linux/manos_linux.py', import.meta.url))
const PYTHON = () => process.env.MANOS_LINUX_PYTHON || '/usr/bin/python3'

type Respuesta = { id: number; ok: boolean; r?: any; error?: string; ms?: number }

/** Cliente JSON-por-líneas sobre el ayudante, con arranque perezoso y reinicio si muere. */
export class ClienteLinux {
  private hijo: ChildProcessWithoutNullStreams | null = null
  private siguiente = 1
  private pendientes = new Map<number, { ok: (r: Respuesta) => void; mal: (e: Error) => void }>()
  private bufer = ''
  ultimoMsApp = 0
  readonly sesion: string

  /** `comando`: solo pruebas (un ayudante falso). Por defecto, el Python del sistema con manos_linux.py. */
  constructor(private readonly comando?: string[], sesion?: string, private readonly quien = process.env.MANOS_QUIEN || 'manos') {
    this.sesion = sesion ?? `${this.quien}-${process.pid}-${randomBytes(3).toString('hex')}`
  }

  private arrancar(): ChildProcessWithoutNullStreams {
    if (this.hijo && this.hijo.exitCode === null && !this.hijo.killed) return this.hijo
    if (!this.comando && process.platform !== 'linux') throw new Error('El adaptador linux solo corre en el servidor Linux con la pantalla virtual (en macOS usa casa; en Windows, windows).')
    const [exe, ...args] = this.comando ?? [PYTHON(), RUTA_AYUDANTE()]
    const h = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    h.stdout.setEncoding('utf8')
    h.stdout.on('data', (d: string) => this.recibir(d))
    h.stderr.on('data', () => {})
    h.on('exit', () => { if (this.hijo === h) this.hijo = null; for (const p of this.pendientes.values()) p.mal(new Error('ManosLinux terminó')); this.pendientes.clear() })
    h.on('error', (e) => { for (const p of this.pendientes.values()) p.mal(e); this.pendientes.clear() })
    this.bufer = ''
    this.hijo = h
    return h
  }

  private recibir(d: string): void {
    this.bufer += d
    let i: number
    while ((i = this.bufer.indexOf('\n')) >= 0) {
      const linea = this.bufer.slice(0, i).trim(); this.bufer = this.bufer.slice(i + 1)
      if (!linea) continue
      let r: Respuesta
      try { r = JSON.parse(linea) } catch { continue }
      const p = this.pendientes.get(r.id)
      if (p) { this.pendientes.delete(r.id); p.ok(r) }
    }
  }

  async llamar(op: string, args: Record<string, unknown> = {}, tiempoMs = 60_000): Promise<any> {
    const h = this.arrancar()
    const id = this.siguiente++
    const r = await new Promise<Respuesta>((ok, mal) => {
      const t = setTimeout(() => { this.pendientes.delete(id); mal(new Error(`${op}: ManosLinux no respondió en ${tiempoMs} ms`)) }, tiempoMs)
      this.pendientes.set(id, { ok: (x) => { clearTimeout(t); ok(x) }, mal: (e) => { clearTimeout(t); mal(e) } })
      h.stdin.write(JSON.stringify({ id, op, sesion: this.sesion, quien: this.quien, ...args }) + '\n')
    })
    this.ultimoMsApp = r.ms ?? 0
    if (!r.ok) throw new Error(r.error || `${op}: error sin detalle`)
    return r.r
  }

  /** ¿Hay un ayudante vivo? (la vista privada cierra el suyo tras un rato sin mirar). */
  get vivo(): boolean { return !!this.hijo && this.hijo.exitCode === null }

  cerrar(): void { this.hijo?.stdin.end(); this.hijo = null }
}

export class AdaptadorLinux implements Adaptador {
  readonly nombre = 'linux'
  readonly cliente: ClienteLinux

  constructor(opts: { comando?: string[]; sesion?: string; quien?: string } = {}) {
    this.cliente = new ClienteLinux(opts.comando, opts.sesion, opts.quien)
  }

  private objetivo(o: Objetivo): Record<string, unknown> {
    return { ...(o.app ? { app: o.app } : {}), ...(o.pid ? { pid: o.pid } : {}), ...(o.ventana ? { ventana: o.ventana } : {}) }
  }

  async apps(): Promise<App[]> {
    return (await this.cliente.llamar('apps', {}, 90_000)).map((a: any) => ({ nombre: a.nombre, bundle: a.bundle, pid: a.pid, activa: !!a.activa }))
  }

  /** La primera llamada enciende la pantalla (Xvfb, openbox, AT-SPI): hasta unos segundos. */
  async abrir(app: string): Promise<{ pid: number; ventanas: Ventana[] }> {
    const r = await this.cliente.llamar('abrir', { app }, 90_000)
    return { pid: r.pid, ventanas: (r.ventanas ?? []).map(aVentana) }
  }

  /** Abre la URL en una ventana NUEVA del navegador de la pantalla y dice cuál es (lo usa `navegar`). */
  async abrirUrl(p: PedidoNavegar): Promise<{ pid: number; ventanas: Ventana[] }> {
    const r = await this.cliente.llamar('abrir_url', { url: p.url }, 90_000)
    return { pid: r.pid, ventanas: (r.ventanas ?? []).map(aVentana) }
  }

  async ventanas(p: { app?: string; pid?: number } = {}): Promise<Ventana[]> {
    return (await this.cliente.llamar('ventanas', this.objetivo(p), 90_000)).map(aVentana)
  }

  async observar(p: PedidoObservar): Promise<Observacion & { cambios?: string; ms_app?: number }> {
    const captura = p.captura ? join(tmpdir(), `manos-linux-${Date.now()}.png`) : undefined
    const r = await this.cliente.llamar('observar', {
      ...this.objetivo(p),
      ...(p.consulta ? { consulta: p.consulta } : {}),
      ...(p.max_elementos ? { max_elementos: p.max_elementos } : {}),
      ...(p.tiempo_max_ms ? { tiempo_max_ms: p.tiempo_max_ms } : {}),
      ...(captura ? { captura: true, captura_ruta: captura } : {}),
      ...(p.ocr ? { ocr: true } : {}),
    }, Math.max(30_000, (p.tiempo_max_ms ?? 0) + 10_000))
    const elementos: Elemento[] = (r.elementos ?? []).map((e: any) => ({
      ref: e.ref, rol: e.rol, etiqueta: e.etiqueta, valor: e.valor, acciones: e.acciones, marco: e.marco, profundidad: e.profundidad,
    }))
    return {
      app: r.app, pid: r.pid, ventana: r.ventana, titulo: r.titulo || undefined, elementos, texto: r.texto,
      captura: r.captura, total_elementos: r.total_elementos ?? elementos.length, aviso: r.aviso || undefined,
      cambios: r.cambios, ms_app: r.ms, ...(r.url ? { url: r.url } : {}),
    }
  }

  async actuar(p: PedidoActuar): Promise<ResultadoAccion> {
    try {
      // La confirmación es para el freno (capa TS): no viaja al ayudante. Tampoco los permisos del cursor de la persona:
      // en la pantalla virtual no hay persona y todo va por dentro (accesibilidad) o por X.
      const { confirmacion: _c, permiso_hid: _h, hid_inactivo_s: _s, via: _v, ...resto } = p
      const r = await this.cliente.llamar('actuar', { ...this.objetivo(p), ...resto }, 45_000)
      return { ok: !!r.ok, efecto: r.efecto ?? (r.ok ? 'sin_verificar' : 'fallo'), detalle: r.detalle }
    } catch (e) {
      return { ok: false, efecto: 'fallo', detalle: (e as Error).message }
    }
  }

  async verificar(p: Objetivo & { espera: Expectativa[] }): Promise<ResultadoVerificar> {
    try {
      const r = await this.cliente.llamar('verificar', { ...this.objetivo(p), espera: p.espera }, 30_000)
      return { cumple: r.cumple, detalle: r.detalle }
    } catch (e) {
      return { cumple: 'desconocido', detalle: (e as Error).message }
    }
  }

  async cursor(): Promise<{ x: number; y: number }> {
    const r = await this.cliente.llamar('cursor')
    return { x: Number(r.x), y: Number(r.y) }
  }

  /** En la pantalla virtual nadie toca ratón ni teclado. */
  async inactividad(): Promise<number | undefined> {
    try {
      const r = await this.cliente.llamar('inactividad', {}, 3_000)
      return typeof r?.segundos === 'number' ? r.segundos : undefined
    } catch { return undefined }
  }

  async salud(): Promise<{ ok: boolean; detalle: string }> {
    try {
      const r = await this.cliente.llamar('salud', {}, 30_000)
      const faltan = (r.faltan ?? []) as string[]
      return { ok: !!r.ok, detalle: `ManosLinux ${r.version} · ${r.atspi} · pantalla ${r.pantalla} ${r.geometria} ${r.encendida ? 'encendida' : 'apagada (enciende al usarla)'} · ${r.navegador ?? 'sin navegador'}${r.marcador ? '' : ' · SIN INSTALAR (nube.sh pantalla)'}${faltan.length ? ` · faltan: ${faltan.join(', ')}` : ''}` }
    } catch (e) {
      return { ok: false, detalle: (e as Error).message }
    }
  }

  async contexto(p: Objetivo & { ref?: string }): Promise<ContextoAccion> {
    return await this.cliente.llamar('contexto', { ...this.objetivo(p), ...(p.ref ? { ref: p.ref } : {}) }, 20_000)
  }

  async pagina(p: Objetivo): Promise<{ ventana: number; titulo?: string; url?: string }> {
    const r = await this.cliente.llamar('pagina', this.objetivo(p), 15_000)
    return { ventana: r.ventana, titulo: r.titulo_pagina || undefined, url: r.url || undefined }
  }

  async medios(p: Objetivo & { tope_ms?: number }): Promise<ResultadoMedios> {
    return await this.cliente.llamar('medios', { ...this.objetivo(p), ...(p.tope_ms ? { tope_ms: p.tope_ms } : {}) }, 30_000)
  }

  async mostrar(p: Objetivo): Promise<void> { await this.cliente.llamar('mostrar', this.objetivo(p), 10_000) }

  async soltar(): Promise<void> { await this.cliente.llamar('soltar').catch(() => {}) }

  /** PNG de una ventana o de la pantalla entera (evidencia y pruebas). */
  async captura(p: { ventana?: number; ruta?: string } = {}): Promise<string> { return (await this.cliente.llamar('captura', p)).ruta }

  /** Estado de la pantalla (procesos, memoria, minutos sin uso). No la enciende. */
  async estadoPantalla(): Promise<EstadoPantalla> { return await this.cliente.llamar('estado', {}, 15_000) }

  /** Apaga navegador y pantalla (la siguiente llamada la vuelve a encender). */
  async apagarPantalla(): Promise<void> { await this.cliente.llamar('apagar', {}, 30_000) }

  async cerrar(): Promise<void> { this.cliente.cerrar() }
}

export interface EstadoPantalla {
  encendida: boolean; pantalla: string; geometria: string; instalada: boolean
  procesos: Record<string, number>; navegador_procesos: number; /** Memoria proporcional (PSS), no RSS: los procesos de Chrome comparten páginas. */
  memoria_mb: { pantalla: number; navegador: number }
  ventanas: number; sin_uso_s: number | null; apaga_tras_s: number
}

function aVentana(w: any): Ventana {
  return { id: w.id, pid: w.pid, app: w.app, titulo: w.titulo || undefined, marco: w.marco, en_pantalla: !!w.en_pantalla, z: w.z ?? null }
}
