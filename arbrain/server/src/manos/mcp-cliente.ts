/**
 * Cliente MCP mínimo por stdio (JSON-RPC delimitado por líneas).
 *
 * Lo usan los adaptadores cuya tecnología ya habla MCP (Cua hoy). Un solo
 * proceso hijo vive mientras viva el adaptador: así cada acción cuesta una ida
 * y vuelta por el pipe y no el arranque de un binario.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface RespuestaHerramienta { texto: string; estructurado?: any; error: boolean; imagenes: { data: string; mimeType: string }[] }

export class ClienteMcpStdio {
  private hijo: ChildProcessWithoutNullStreams | null = null
  private siguienteId = 1
  private pendientes = new Map<number, { ok: (v: any) => void; mal: (e: Error) => void }>()
  private listo: Promise<void> | null = null

  constructor(private readonly comando: string, private readonly args: string[], private readonly env: Record<string, string> = {}, private readonly timeoutMs = 60_000) {}

  private arrancar(): Promise<void> {
    if (this.listo) return this.listo
    this.listo = (async () => {
      const hijo = spawn(this.comando, this.args, { env: { ...process.env, ...this.env }, stdio: ['pipe', 'pipe', 'pipe'] })
      this.hijo = hijo
      hijo.stderr.on('data', () => {}) // el driver escribe diagnóstico; no se mezcla con la respuesta
      createInterface({ input: hijo.stdout }).on('line', linea => {
        if (!linea.trim()) return
        let msg: any
        try { msg = JSON.parse(linea) } catch { return }
        const p = typeof msg.id === 'number' ? this.pendientes.get(msg.id) : undefined
        if (!p) return
        this.pendientes.delete(msg.id)
        if (msg.error) p.mal(new Error(msg.error.message ?? 'error MCP')); else p.ok(msg.result)
      })
      hijo.on('exit', code => {
        for (const p of this.pendientes.values()) p.mal(new Error(`el proceso MCP terminó (código ${code})`))
        this.pendientes.clear(); this.hijo = null; this.listo = null
      })
      await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'arbrain-manos', version: '1.0.0' } })
      hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    })()
    return this.listo
  }

  private rpc(method: string, params: unknown): Promise<any> {
    const hijo = this.hijo
    if (!hijo) return Promise.reject(new Error('proceso MCP no iniciado'))
    const id = this.siguienteId++
    return new Promise((ok, mal) => {
      const timer = setTimeout(() => { this.pendientes.delete(id); mal(new Error(`${method}: sin respuesta en ${this.timeoutMs} ms`)) }, this.timeoutMs)
      this.pendientes.set(id, { ok: v => { clearTimeout(timer); ok(v) }, mal: e => { clearTimeout(timer); mal(e) } })
      hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  async llamar(nombre: string, args: Record<string, unknown> = {}): Promise<RespuestaHerramienta> {
    await this.arrancar()
    const r = await this.rpc('tools/call', { name: nombre, arguments: args })
    const contenido: any[] = Array.isArray(r?.content) ? r.content : []
    return {
      texto: contenido.filter(c => c.type === 'text').map(c => c.text).join('\n'),
      estructurado: r?.structuredContent,
      error: !!r?.isError,
      imagenes: contenido.filter(c => c.type === 'image').map(c => ({ data: c.data, mimeType: c.mimeType })),
    }
  }

  async cerrar(): Promise<void> {
    const hijo = this.hijo
    if (!hijo) return
    hijo.stdin.end()
    await new Promise<void>(r => { const t = setTimeout(() => { hijo.kill(); r() }, 2000); hijo.once('exit', () => { clearTimeout(t); r() }) })
  }
}
