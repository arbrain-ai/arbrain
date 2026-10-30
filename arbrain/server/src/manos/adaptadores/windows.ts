/**
 * Adaptador `windows`: las manos propias de Arbrain en Windows (ManosWindows.exe, C#).
 *
 * Mismo papel que `casa` en macOS y mismo contrato: árbol de accesibilidad (UIA3) con refs estables, acciones por
 * dentro de la app sin mover el cursor ni robar el foco, y el Halo como cursor de Levy. El freno y las herramientas MCP
 * no cambian: este archivo solo traduce.
 *
 * Cómo llega el binario (sin descargas ni SDK):
 *   1. `MANOS_WINDOWS_EXE` si el instalador trae uno ya compilado y firmado;
 *   2. si no, se compila UNA vez con el csc.exe de .NET Framework 4.x que trae Windows 10/11, junto con el interop de
 *      UIA que se genera del typelib de `UIAutomationCore.dll`. Queda en `%LOCALAPPDATA%\Arbrain\manos-windows\<huella>`.
 * Protocolo: JSON por líneas por stdin/stdout, el mismo de ArbrainManos ({id, op, ...} → {id, ok, r | error, ms}).
 *
 * Código del helper: arbrain/server/manos-windows/src/. Resultados y paridad: docs/builds/manos-windows-2026-10-17/.
 */
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Adaptador, App, ContextoAccion, Elemento, Expectativa, Objetivo, Observacion, PedidoActuar, PedidoNavegar, PedidoObservar, ResultadoAccion, ResultadoMedios, ResultadoVerificar, Ventana } from '../contrato.js'

export const DIR_FUENTE = () => process.env.MANOS_WINDOWS_FUENTE || fileURLToPath(new URL('../../../manos-windows/src', import.meta.url))
const CACHE = () => process.env.MANOS_WINDOWS_CACHE || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Arbrain', 'manos-windows')
const CSC = () => process.env.MANOS_WINDOWS_CSC || join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')

type Respuesta = { id: number; ok: boolean; r?: any; error?: string; ms?: number }

const correr = (exe: string, args: string[], cwd?: string) => new Promise<string>((ok, mal) =>
  execFile(exe, args, { cwd, timeout: 120_000, windowsHide: true }, (e, out, err) => (e ? mal(new Error(`${exe} ${args.slice(-1)}: ${String(out || '').slice(-1500)} ${String(err || '').slice(-500)} ${e.message}`)) : ok(String(out)))))

/** Huella de las fuentes: un cambio del helper recompila; el mismo código reusa el binario. */
export function huellaFuente(dir = DIR_FUENTE()): string {
  const h = createHash('sha256')
  for (const f of ['GenerarInterop.cs', 'ManosWindows.cs']) h.update(readFileSync(join(dir, f)))
  return h.digest('hex').slice(0, 12)
}

let compilando: Promise<string> | null = null
/** Ruta al ManosWindows.exe listo para correr; compila la primera vez (≈ 3–5 s). */
export function asegurarBinario(): Promise<string> {
  if (process.env.MANOS_WINDOWS_EXE) return Promise.resolve(process.env.MANOS_WINDOWS_EXE)
  return (compilando ??= (async () => {
    const fuente = DIR_FUENTE()
    const dir = join(CACHE(), huellaFuente(fuente))
    const exe = join(dir, 'ManosWindows.exe')
    if (existsSync(exe) && existsSync(join(dir, 'Interop.UIAutomationClient.dll'))) return exe
    if (!existsSync(CSC())) throw new Error(`No encontré el compilador de .NET Framework 4 (${CSC()}). Viene con Windows 10/11; en otro caso, el instalador debe traer ManosWindows.exe (MANOS_WINDOWS_EXE).`)
    mkdirSync(dir, { recursive: true })
    await correr(CSC(), ['/nologo', '/optimize', `/out:${join(dir, 'GenerarInterop.exe')}`, join(fuente, 'GenerarInterop.cs')])
    await correr(join(dir, 'GenerarInterop.exe'), [dir], dir)
    await correr(CSC(), ['/nologo', '/optimize', '/nowarn:1690', '/target:exe', `/out:${exe}`, `/r:${join(dir, 'Interop.UIAutomationClient.dll')}`,
      '/r:System.Web.Extensions.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Core.dll', join(fuente, 'ManosWindows.cs')], dir)
    return exe
  })().catch(e => { compilando = null; throw e }))
}

/** Cliente JSON-por-líneas sobre el proceso del helper, con arranque perezoso y reinicio si muere. */
export class ClienteWindows {
  private hijo: ChildProcessWithoutNullStreams | null = null
  private arrancando: Promise<ChildProcessWithoutNullStreams> | null = null
  private siguiente = 1
  private pendientes = new Map<number, { ok: (r: Respuesta) => void; mal: (e: Error) => void }>()
  private bufer = ''
  ultimoMsApp = 0
  readonly sesion: string

  constructor(private readonly exe?: string, sesion?: string, private readonly quien = process.env.MANOS_QUIEN || 'manos') {
    this.sesion = sesion ?? `${this.quien}-${process.pid}-${randomBytes(3).toString('hex')}`
  }

  private async arrancar(): Promise<ChildProcessWithoutNullStreams> {
    if (this.hijo && this.hijo.exitCode === null) return this.hijo
    return (this.arrancando ??= (async () => {
      try {
        if (process.platform !== 'win32' && !this.exe) throw new Error('El adaptador windows solo corre en Windows (en macOS usa MANOS_ADAPTADOR=casa).')
        const exe = this.exe ?? await asegurarBinario()
        const h = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
        h.stdout.setEncoding('utf8')
        h.stdout.on('data', (d: string) => this.recibir(d))
        h.stderr.on('data', () => {})
        h.on('exit', () => { this.hijo = null; for (const p of this.pendientes.values()) p.mal(new Error('ManosWindows terminó')); this.pendientes.clear() })
        h.on('error', () => {})
        this.hijo = h
        return h
      } finally { this.arrancando = null }
    })())
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
    const h = await this.arrancar()
    const id = this.siguiente++
    const r = await new Promise<Respuesta>((ok, mal) => {
      const t = setTimeout(() => { this.pendientes.delete(id); mal(new Error(`${op}: ManosWindows no respondió en ${tiempoMs} ms`)) }, tiempoMs)
      this.pendientes.set(id, { ok: (x) => { clearTimeout(t); ok(x) }, mal: (e) => { clearTimeout(t); mal(e) } })
      h.stdin.write(JSON.stringify({ id, op, sesion: this.sesion, quien: this.quien, ...args }) + '\n')
    })
    this.ultimoMsApp = r.ms ?? 0
    if (!r.ok) throw new Error(r.error || `${op}: error sin detalle`)
    return r.r
  }

  cerrar(): void { this.hijo?.stdin.end(); this.hijo = null }
}

export class AdaptadorWindows implements Adaptador {
  readonly nombre = 'windows'
  readonly cliente: ClienteWindows

  constructor(opts: { exe?: string; sesion?: string; quien?: string } = {}) {
    this.cliente = new ClienteWindows(opts.exe, opts.sesion, opts.quien)
  }

  private objetivo(o: Objetivo): Record<string, unknown> {
    return { ...(o.app ? { app: o.app } : {}), ...(o.pid ? { pid: o.pid } : {}), ...(o.ventana ? { ventana: o.ventana } : {}) }
  }

  async apps(): Promise<App[]> {
    return (await this.cliente.llamar('apps')).map((a: any) => ({ nombre: a.nombre, bundle: a.bundle, pid: a.pid, activa: !!a.activa }))
  }

  async abrir(app: string): Promise<{ pid: number; ventanas: Ventana[] }> {
    const r = await this.cliente.llamar('abrir', { app }, 30_000)
    return { pid: r.pid, ventanas: (r.ventanas ?? []).map(aVentana) }
  }

  /** Abre una URL en una ventana nueva del navegador sin activarla (lo usa `navegar`). Sin navegador: Chrome y si no, Edge. */
  async abrirUrl(p: PedidoNavegar): Promise<{ pid: number; ventanas: Ventana[] }> {
    const r = await this.cliente.llamar('abrir_url', { url: p.url, navegador: p.navegador ?? 'auto' }, 30_000)
    return { pid: r.pid, ventanas: (r.ventanas ?? []).map(aVentana) }
  }

  async ventanas(p: { app?: string; pid?: number } = {}): Promise<Ventana[]> {
    return (await this.cliente.llamar('ventanas', this.objetivo(p))).map(aVentana)
  }

  async observar(p: PedidoObservar): Promise<Observacion & { cambios?: string; ms_app?: number }> {
    const captura = p.captura ? join(tmpdir(), `manos-windows-${Date.now()}.png`) : undefined
    const r = await this.cliente.llamar('observar', {
      ...this.objetivo(p),
      ...(p.consulta ? { consulta: p.consulta } : {}),
      ...(p.max_elementos ? { max_elementos: p.max_elementos } : {}),
      ...(captura ? { captura: true, captura_ruta: captura } : {}),
      ...(p.ocr ? { ocr: true } : {}),
    }, Math.max(15_000, (p.tiempo_max_ms ?? 0) + 5000))
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
      // La confirmación es para el freno (capa TS): no viaja al helper.
      const { confirmacion: _c, ...resto } = p
      const r = await this.cliente.llamar('actuar', { ...this.objetivo(p), ...resto }, 30_000)
      return { ok: !!r.ok, efecto: r.efecto ?? (r.ok ? 'sin_verificar' : 'fallo'), detalle: r.detalle }
    } catch (e) {
      return { ok: false, efecto: 'fallo', detalle: (e as Error).message }
    }
  }

  async verificar(p: Objetivo & { espera: Expectativa[] }): Promise<ResultadoVerificar> {
    try {
      const r = await this.cliente.llamar('verificar', { ...this.objetivo(p), espera: p.espera })
      return { cumple: r.cumple, detalle: r.detalle }
    } catch (e) {
      return { cumple: 'desconocido', detalle: (e as Error).message }
    }
  }

  async cursor(): Promise<{ x: number; y: number }> {
    const r = await this.cliente.llamar('cursor')
    return { x: Number(r.x), y: Number(r.y) }
  }

  /** Segundos desde el último toque al ratón o al teclado (GetLastInputInfo; las manos no inyectan entrada de fondo). */
  async inactividad(): Promise<number | undefined> {
    try {
      const r = await this.cliente.llamar('inactividad', {}, 3_000)
      return typeof r?.segundos === 'number' ? r.segundos : undefined
    } catch { return undefined }
  }

  async salud(): Promise<{ ok: boolean; detalle: string }> {
    try {
      const r = await this.cliente.llamar('salud', {}, 120_000)
      return { ok: !!r.ok, detalle: `ManosWindows ${r.version} · ${r.uia} · Windows ${r.windows} · sesión ${r.sesion}${r.escritorio_interactivo ? '' : ' (SIN escritorio interactivo)'}${r.elevado ? ' · elevado' : ''}` }
    } catch (e) {
      return { ok: false, detalle: (e as Error).message }
    }
  }

  async contexto(p: Objetivo & { ref?: string }): Promise<ContextoAccion> {
    return await this.cliente.llamar('contexto', { ...this.objetivo(p), ...(p.ref ? { ref: p.ref } : {}) }, 10_000)
  }

  async pagina(p: Objetivo): Promise<{ ventana: number; titulo?: string; url?: string }> {
    const r = await this.cliente.llamar('pagina', this.objetivo(p), 10_000)
    return { ventana: r.ventana, titulo: r.titulo_pagina || undefined, url: r.url || undefined }
  }

  async medios(p: Objetivo & { tope_ms?: number }): Promise<ResultadoMedios> {
    return await this.cliente.llamar('medios', { ...this.objetivo(p), ...(p.tope_ms ? { tope_ms: p.tope_ms } : {}) }, 30_000)
  }

  async mostrar(p: Objetivo): Promise<void> { await this.cliente.llamar('mostrar', this.objetivo(p), 10_000) }

  async soltar(): Promise<void> { await this.cliente.llamar('soltar').catch(() => {}) }

  /** Solo pruebas y evidencia: PNG de una ventana (PrintWindow, sin traerla al frente) o de la pantalla entera. */
  async captura(p: { ventana?: number; ruta?: string } = {}): Promise<string> { return (await this.cliente.llamar('captura', p)).ruta }

  /** Solo pruebas: qué ventana tiene el frente (para probar que las manos no lo roban). */
  async frente(): Promise<{ ventana: number; titulo: string; pid: number }> { return await this.cliente.llamar('frente') }

  async cerrar(): Promise<void> { this.cliente.cerrar() }
}

function aVentana(w: any): Ventana {
  return { id: w.id, pid: w.pid, app: w.app, titulo: w.titulo || undefined, marco: w.marco, en_pantalla: !!w.en_pantalla, z: w.z ?? null }
}
