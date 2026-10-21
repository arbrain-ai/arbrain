/**
 * Adaptador `casa`: las manos propias de Arbrain (ArbrainManos.app, Swift).
 *
 * La app firmada (identidad local de firma, ai.arbrain.manos) es la única dueña de los
 * permisos de Accesibilidad y Grabación de pantalla y sirve JSON por líneas en
 * `~/.config/arbrain/manos.sock`. Este adaptador abre UNA conexión persistente:
 * cada llamada cuesta décimas de milisegundo de transporte, no un proceso nuevo.
 *
 * Qué hace distinto de Cua (detalle en docs/builds/manos-casa-2026-10-02/RESULTADOS.md):
 *   - lee el árbol con un viaje IPC por nodo (lote de atributos), no 8–14;
 *   - asienta por notificaciones AX con salida temprana, no con un sondeo fijo de 1 s;
 *   - refs estables por identidad del elemento (sobreviven entre observaciones);
 *   - atajos ⌘ por el menú AX y Return/Escape por el botón por defecto: sin foco;
 *   - cursor fantasma de la casa que nunca se espera.
 *
 * Código fuente de la app: arbrain/server/manos-casa/. Instalar: ./scripts/package.sh
 *
 * Edición cliente (Arbrain 0.1.2, computer use del alumno en macOS; red team 3 M-10):
 *   - la app es la copia que viaja DENTRO de Arbrain.app (`Contents/Resources/manos/ArbrainManos.app`, bundle id
 *     `ai.arbrain.manos.cliente`, armada por arbrain/scripts/empaquetar-manos-mac.mjs). Nunca la de ~/Applications;
 *   - el socket vive en la carpeta de datos de la app (`DIR_ARBRAIN()/manos.sock`), nunca en ~/.config/arbrain;
 *   - cada conexión se presenta con el token de `DIR_ARBRAIN()/manos/casa.token` (0600; el sandbox del Bash de los
 *     agentes no lee esa carpeta ni abre sockets Unix). La app lo exige y rechaza `via: hid` (Edicion.swift).
 */
import { DIR_ARBRAIN, esEdicionCliente } from '../../edicion.js'
import { createConnection, type Socket } from 'node:net'
import { execFile } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { Adaptador, App, ContextoAccion, Elemento, Expectativa, Objetivo, Observacion, PedidoActuar, PedidoObservar, ResultadoAccion, ResultadoMedios, ResultadoVerificar, Ventana } from '../contrato.js'

/**
 * ArbrainManos.app empaquetada con la app del alumno: `<recursos>/manos/ArbrainManos.app`, al lado de
 * `<recursos>/daemon/dist/manos/adaptadores/casa.js` (este módulo compilado).
 */
export const APP_EMPAQUETADA = (): string => fileURLToPath(new URL('../../../../manos/ArbrainManos.app', import.meta.url))

/** Qué app abrir: `MANOS_CASA_APP` > (cliente) la empaquetada > (instalación original) ~/Applications. */
export function rutaAppCasa(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MANOS_CASA_APP) return env.MANOS_CASA_APP
  return esEdicionCliente(env) ? APP_EMPAQUETADA() : join(homedir(), 'Applications/ArbrainManos.app')
}

/** sun_path de macOS: 104 bytes con el nulo. Una carpeta de datos muy larga cae a un socket en la carpeta temporal del usuario. */
const MAX_SOCKET = 100

/** Socket: `MANOS_CASA_SOCKET` > la carpeta de Arbrain de esta edición (cliente: la de la app). */
export function rutaSocketCasa(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MANOS_CASA_SOCKET) return env.MANOS_CASA_SOCKET
  const ruta = join(DIR_ARBRAIN(), 'manos.sock')
  return Buffer.byteLength(ruta) <= MAX_SOCKET ? ruta : join(tmpdir(), 'arbrain-manos-cliente.sock')
}

/** Token de la conexión en la edición cliente (lo exige la app empaquetada). */
export const rutaTokenCasa = (): string => join(DIR_ARBRAIN(), 'manos', 'casa.token')

/** Lee el token; si no existe, lo crea (0600, carpeta 0700). Varios procesos de manos comparten el mismo archivo. */
export function asegurarTokenCasa(ruta = rutaTokenCasa()): string {
  const leer = () => { try { const t = readFileSync(ruta, 'utf8').trim(); return t.length >= 32 ? t : '' } catch { return '' } }
  const hay = leer()
  if (hay) return hay
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 })
  try { writeFileSync(ruta, randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' }) } catch { /* otro proceso lo creó primero */ }
  try { chmodSync(ruta, 0o600) } catch { /* sin cambio */ }
  const t = leer()
  if (!t) throw new Error(`No pude preparar el token de ArbrainManos en ${ruta}.`)
  return t
}

type Respuesta = { id: number; ok: boolean; r?: any; error?: string; ms?: number }

/** Cliente JSON-por-líneas sobre el socket de la app, con reconexión y arranque perezoso. */
export class ClienteCasa {
  private sock: Socket | null = null
  private conectando: Promise<Socket> | null = null
  private siguiente = 1
  private pendientes = new Map<number, { ok: (r: Respuesta) => void; mal: (e: Error) => void }>()
  private bufer = ''
  /** Milisegundos del último pedido medidos dentro de la app (sin transporte). */
  ultimoMsApp = 0

  /**
   * Sesión de este agente ante la app: la usa para los candados por ventana. Dos agentes
   * (dos procesos, o dos adaptadores) nunca comparten sesión; si otro opera la misma
   * ventana, el segundo espera o recibe «ocupada».
   */
  readonly sesion: string

  private readonly ruta: string
  private readonly app: string
  /** Edición cliente: la app empaquetada exige token por conexión y su socket propio. */
  private readonly cliente = esEdicionCliente()

  constructor(ruta?: string, app?: string, sesion?: string, private readonly quien = process.env.MANOS_QUIEN || 'manos') {
    this.ruta = ruta ?? rutaSocketCasa()
    this.app = app ?? rutaAppCasa()
    this.sesion = sesion ?? `${this.quien}-${process.pid}-${randomBytes(3).toString('hex')}`
  }

  /**
   * `open` de la app: en cliente, con su socket y su archivo de token (la app no adivina nada de la instalación
   * original) y salida sola tras 15 min sin pedidos: cerrar Arbrain no deja a ArbrainManos viva indefinidamente.
   */
  private argumentosOpen(): string[] {
    if (!this.cliente) return ['-g', this.app]
    return ['-g', '--env', `MANOS_CASA_SOCKET=${this.ruta}`, '--env', `MANOS_CASA_TOKEN_ARCHIVO=${rutaTokenCasa()}`, '--env', 'MANOS_SALIR_INACTIVA_S=900', this.app]
  }

  /** Edición cliente: la primera línea de cada conexión es el saludo con el token. */
  private saludar(s: Socket, token: string): Promise<void> {
    const id = this.siguiente++
    return new Promise((ok, mal) => {
      const t = setTimeout(() => { this.pendientes.delete(id); mal(new Error('ArbrainManos no respondió al saludo')) }, 5_000)
      this.pendientes.set(id, {
        ok: (r) => { clearTimeout(t); r.ok ? ok() : mal(new Error(r.error || 'ArbrainManos rechazó la conexión')) },
        mal: (e) => { clearTimeout(t); mal(e) },
      })
      s.write(JSON.stringify({ id, op: 'hola', token, quien: this.quien }) + '\n')
    })
  }

  private conectarUnaVez(): Promise<Socket> {
    return new Promise((ok, mal) => {
      const s = createConnection(this.ruta)
      s.once('connect', () => { s.setNoDelay(true); ok(s) })
      s.once('error', mal)
    })
  }

  private async conectar(): Promise<Socket> {
    if (this.sock && !this.sock.destroyed) return this.sock
    return (this.conectando ??= (async () => {
      try {
        if (this.cliente && !existsSync(this.app)) throw new Error(`Esta instalación de Arbrain no trae ArbrainManos (${this.app}). Computer use en macOS necesita la app de escritorio de Arbrain 0.1.2 o posterior.`)
        const token = this.cliente ? asegurarTokenCasa() : ''
        let s: Socket
        try { s = await this.conectarUnaVez() } catch {
          // La app no sirve: se abre por LaunchServices en segundo plano (-g), para que macOS
          // la trate como responsable de sus propios permisos. Sin -j: oculta, esconde al fantasma.
          // Cliente: la copia viaja dentro de Arbrain.app, que la persona ya aprobó al abrirla; la cuarentena del .dmg no
          // debe volver a frenar a su pieza interna al lanzarla por LaunchServices (mejor esfuerzo: si no se puede, sigue).
          if (this.cliente) await new Promise<void>((ok) => execFile('xattr', ['-dr', 'com.apple.quarantine', this.app], () => ok()))
          await new Promise<void>((ok) => execFile('open', this.argumentosOpen(), () => ok()))
          let ultimo: unknown
          for (let i = 0; i < 100; i++) {
            await new Promise(r => setTimeout(r, 50))
            try { s = await this.conectarUnaVez(); break } catch (e) { ultimo = e }
          }
          if (!s!) throw new Error(`ArbrainManos no respondió en ${this.ruta}: ${(ultimo as Error)?.message ?? 'sin socket'}. ¿Está instalada? (arbrain/server/manos-casa/scripts/package.sh)`)
        }
        s.setEncoding('utf8')
        s.on('data', (d: string) => this.recibir(d))
        s.on('close', () => { this.sock = null; for (const p of this.pendientes.values()) p.mal(new Error('ArbrainManos cerró la conexión')); this.pendientes.clear() })
        s.on('error', () => {})
        if (this.cliente) {
          try { await this.saludar(s, token) } catch (e) { s.destroy(); throw e }
        }
        this.sock = s
        return s
      } finally { this.conectando = null }
    })())
  }

  private recibir(d: string): void {
    this.bufer += d
    let i: number
    while ((i = this.bufer.indexOf('\n')) >= 0) {
      const linea = this.bufer.slice(0, i); this.bufer = this.bufer.slice(i + 1)
      if (!linea.trim()) continue
      let r: Respuesta
      try { r = JSON.parse(linea) } catch { continue }
      const p = this.pendientes.get(r.id)
      if (p) { this.pendientes.delete(r.id); p.ok(r) }
    }
  }

  async llamar(op: string, args: Record<string, unknown> = {}, tiempoMs = 60_000): Promise<any> {
    const s = await this.conectar()
    const id = this.siguiente++
    const r = await new Promise<Respuesta>((ok, mal) => {
      const t = setTimeout(() => { this.pendientes.delete(id); mal(new Error(`${op}: ArbrainManos no respondió en ${tiempoMs} ms`)) }, tiempoMs)
      this.pendientes.set(id, { ok: (x) => { clearTimeout(t); ok(x) }, mal: (e) => { clearTimeout(t); mal(e) } })
      s.write(JSON.stringify({ id, op, sesion: this.sesion, quien: this.quien, ...args }) + '\n')
    })
    this.ultimoMsApp = r.ms ?? 0
    if (!r.ok) throw new Error(r.error || `${op}: error sin detalle`)
    return r.r
  }

  cerrar(): void { this.sock?.end(); this.sock = null }
}

export class AdaptadorCasa implements Adaptador {
  readonly nombre = 'casa'
  readonly cliente: ClienteCasa
  /** `acotado` (crons): enviar/borrar/pagar/publicar exigen confirmación humana. */
  private readonly modo = process.env.MANOS_MODO || 'estandar'

  constructor(opts: { socket?: string; app?: string; sesion?: string; quien?: string } = {}) {
    this.cliente = new ClienteCasa(opts.socket, opts.app, opts.sesion, opts.quien)
  }

  private objetivo(o: Objetivo): Record<string, unknown> {
    return { ...(o.app ? { app: o.app } : {}), ...(o.pid ? { pid: o.pid } : {}), ...(o.ventana ? { ventana: o.ventana } : {}) }
  }

  async apps(): Promise<App[]> {
    return (await this.cliente.llamar('apps')).map((a: any) => ({ nombre: a.nombre, bundle: a.bundle, pid: a.pid, activa: !!a.activa }))
  }

  async abrir(app: string): Promise<{ pid: number; ventanas: Ventana[] }> {
    const r = await this.cliente.llamar('abrir', { app })
    return { pid: r.pid, ventanas: (r.ventanas ?? []).map(aVentana) }
  }

  async ventanas(p: { app?: string; pid?: number } = {}): Promise<Ventana[]> {
    return (await this.cliente.llamar('ventanas', this.objetivo(p))).map(aVentana)
  }

  async observar(p: PedidoObservar): Promise<Observacion & { cambios?: string; ms_app?: number }> {
    const captura = p.captura ? join(tmpdir(), `manos-casa-${Date.now()}.png`) : undefined
    const r = await this.cliente.llamar('observar', {
      ...this.objetivo(p),
      ...(p.consulta ? { consulta: p.consulta } : {}),
      ...(p.max_elementos ? { max_elementos: p.max_elementos } : {}),
      ...(p.tiempo_max_ms ? { tiempo_max_ms: p.tiempo_max_ms } : {}),
      ...(captura ? { captura: true, captura_ruta: captura } : {}),
      ...(p.ocr != null ? { ocr: p.ocr } : {}),
      ...(p.raiz_app ? { raiz_app: true } : {}),
    })
    const elementos: Elemento[] = (r.elementos ?? []).map((e: any) => ({
      ref: e.ref, rol: e.rol, etiqueta: e.etiqueta, valor: e.valor, acciones: e.acciones, marco: e.marco, profundidad: e.profundidad,
    }))
    return {
      app: r.app, pid: r.pid, ventana: r.ventana, titulo: r.titulo || undefined, elementos, texto: r.texto,
      captura: r.captura, total_elementos: r.total_elementos ?? elementos.length,
      aviso: [r.aviso, r.aviso_captura].filter(Boolean).join(' · ') || undefined,
      cambios: r.cambios, ms_app: r.ms, ...(r.url ? { url: r.url } : {}),
    }
  }

  async actuar(p: PedidoActuar): Promise<ResultadoAccion> {
    try {
      const r = await this.cliente.llamar('actuar', { ...this.objetivo(p), ...p, modo: this.modo })
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

  /** Segundos sin que Daniel toque ratón o teclado (ArbrainManos descuenta los eventos de la mano). */
  async inactividad(): Promise<number | undefined> {
    try {
      const r = await this.cliente.llamar('inactividad', {}, 3_000)
      return typeof r?.segundos === 'number' ? r.segundos : undefined
    } catch { return undefined }
  }

  async salud(): Promise<{ ok: boolean; detalle: string }> {
    try {
      const r = await this.cliente.llamar('salud')
      return { ok: !!r.ok, detalle: `ArbrainManos ${r.version} · Accesibilidad ${r.accesibilidad ? 'OK' : 'FALTA'} · Grabación de pantalla ${r.grabacion_pantalla ? 'OK' : 'FALTA'}` }
    } catch (e) {
      return { ok: false, detalle: (e as Error).message }
    }
  }

  async contexto(p: Objetivo & { ref?: string }): Promise<ContextoAccion> {
    return await this.cliente.llamar('contexto', { ...this.objetivo(p), ...(p.ref ? { ref: p.ref } : {}) }, 10_000)
  }

  async pagina(p: Objetivo): Promise<{ ventana: number; titulo?: string; url?: string }> {
    const r = await this.cliente.llamar('pagina', this.objetivo(p), 10_000)
    return { ventana: r.ventana, titulo: r.titulo_pagina || r.titulo || undefined, url: r.url || undefined }
  }

  async medios(p: Objetivo & { tope_ms?: number }): Promise<ResultadoMedios> {
    return await this.cliente.llamar('medios', { ...this.objetivo(p), ...(p.tope_ms ? { tope_ms: p.tope_ms } : {}) }, 30_000)
  }

  async mostrar(p: Objetivo): Promise<void> { await this.cliente.llamar('mostrar', this.objetivo(p), 10_000) }

  async soltar(): Promise<void> { await this.cliente.llamar('soltar').catch(() => {}) }

  async cerrar(): Promise<void> { this.cliente.cerrar() }
}

function aVentana(w: any): Ventana {
  return { id: w.id, pid: w.pid, app: w.app, titulo: w.titulo || undefined, marco: w.marco, en_pantalla: !!w.en_pantalla, z: w.z ?? null }
}
