/**
 * Cliente del puente web: lo usa cada proceso de manos para hablar con la extensión.
 * Si el puente no corre, lo arranca como proceso suelto (sobrevive a esta sesión)
 * y vuelve a intentar.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { puertoWeb, token } from './puente.js'

export interface CanalWeb { llamar<T = any>(metodo: string, args?: Record<string, unknown>, tope_ms?: number): Promise<T>; cerrar(): Promise<void> }

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

export class ClienteWeb implements CanalWeb {
  private ws: WebSocket | null = null
  private abriendo: Promise<WebSocket> | null = null
  private siguiente = 1
  private pendientes = new Map<number, { ok: (v: any) => void; mal: (e: Error) => void }>()

  constructor(private readonly op: { puerto?: number; token?: string; arrancar?: boolean; esperaExtensionMs?: number } = {}) {}

  private get puerto() { return this.op.puerto ?? puertoWeb() }

  private abrirUna(): Promise<WebSocket> {
    return new Promise((ok, mal) => {
      const ws = new WebSocket(`ws://127.0.0.1:${this.puerto}/agente`, { headers: { 'x-arbrain-token': this.op.token ?? token() } })
      ws.once('open', () => ok(ws))
      ws.once('error', mal)
      ws.once('unexpected-response', (_r, res) => mal(new Error(`el puente rechazó la conexión (${res.statusCode})`)))
    })
  }

  private conectar(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve(this.ws)
    if (this.abriendo) return this.abriendo
    this.abriendo = (async () => {
      let ws: WebSocket
      try {
        ws = await this.abrirUna()
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ECONNREFUSED' || this.op.arrancar === false) throw e
        arrancarPuente()
        let ultimo: unknown = e
        for (let i = 0; i < 30; i++) {
          await dormir(200)
          try { ws = await this.abrirUna(); ultimo = null; break } catch (x) { ultimo = x }
        }
        if (ultimo) throw new Error(`no pude arrancar el puente web: ${(ultimo as Error).message}`)
      }
      ws = ws!
      ws.on('message', datos => {
        let m: any
        try { m = JSON.parse(String(datos)) } catch { return }
        const p = this.pendientes.get(m.id)
        if (!p) return
        this.pendientes.delete(m.id)
        if (m.ok) p.ok(m.r); else p.mal(new Error(m.error || 'error de la extensión'))
      })
      ws.on('close', () => {
        if (this.ws === ws) this.ws = null
        for (const p of this.pendientes.values()) p.mal(new Error('se cerró el canal con el puente web'))
        this.pendientes.clear()
      })
      this.ws = ws
      return ws
    })().finally(() => { this.abriendo = null })
    return this.abriendo
  }

  async llamar<T = any>(metodo: string, args: Record<string, unknown> = {}, tope_ms = 45_000): Promise<T> {
    try {
      return await this.llamarUna<T>(metodo, args, tope_ms)
    } catch (e) {
      // Recién arrancado el puente, la extensión tarda hasta ~20 s en volver a llamar: se la espera en vez de fallar.
      if (!/^SIN_EXTENSION/.test((e as Error).message) || this.op.esperaExtensionMs === 0) throw e
      const fin = Date.now() + (this.op.esperaExtensionMs ?? 25_000)
      while (Date.now() < fin) {
        await dormir(1000)
        const est = await this.llamarUna<{ extensiones: { perfil?: string }[] }>('estado', {}, 5000).catch(() => ({ extensiones: [] }))
        const q = typeof args.perfil === 'string' ? args.perfil.trim().toLowerCase() : ''
        if (q ? est.extensiones.some(e => (e.perfil ?? '').includes(q)) : est.extensiones.length) return this.llamarUna<T>(metodo, args, tope_ms)
      }
      throw e
    }
  }

  private async llamarUna<T>(metodo: string, args: Record<string, unknown>, tope_ms: number): Promise<T> {
    const ws = await this.conectar()
    const id = this.siguiente++
    return new Promise<T>((ok, mal) => {
      const timer = setTimeout(() => { this.pendientes.delete(id); mal(new Error(`${metodo}: sin respuesta en ${tope_ms + 2000} ms`)) }, tope_ms + 2000)
      this.pendientes.set(id, { ok: v => { clearTimeout(timer); ok(v) }, mal: e => { clearTimeout(timer); mal(e) } })
      // `perfil` es de enrutado del puente (qué Chrome): no viaja a la extensión.
      const { perfil, ...resto } = args as { perfil?: unknown } & Record<string, unknown>
      ws.send(JSON.stringify({ id, metodo, args: resto, tope_ms, ...(typeof perfil === 'string' && perfil.trim() ? { perfil: perfil.trim() } : {}) }))
    })
  }

  async cerrar(): Promise<void> { this.ws?.close(); this.ws = null }
}

/** Lanza el puente como proceso suelto con el mismo runtime (node o tsx) que este proceso. */
export function arrancarPuente(): void {
  const aqui = fileURLToPath(import.meta.url)
  const archivo = aqui.replace(/cliente\.(ts|js)$/, (_m, ext) => `puente.${ext}`)
  const hijo = spawn(process.execPath, [...process.execArgv, archivo], { detached: true, stdio: 'ignore', env: process.env })
  hijo.unref()
}
