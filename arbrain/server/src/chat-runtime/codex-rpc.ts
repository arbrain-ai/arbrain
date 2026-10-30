import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import type { Readable, Writable } from 'node:stream'

export type RpcId = number | string
export interface RpcNotification { method: string; params: Record<string, unknown> }
export interface RpcServerRequest extends RpcNotification { id: RpcId }
export interface RpcTransport {
  input: Writable
  output: Readable
  onClose: (listener: (reason: Error) => void) => () => void
  close: () => void
}

export class RpcError extends Error {
  constructor(message: string, readonly code: number, readonly data?: unknown) {
    super(message)
    this.name = 'RpcError'
  }
}

/** A timeout/disconnect is ambiguous for mutations. Callers must reconcile; never replay blindly. */
export class RpcConnectionError extends Error {
  constructor(message: string) { super(message); this.name = 'RpcConnectionError' }
}

interface Pending {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** One framed stdio connection. Own it per account; route notifications by native thread/turn id. */
export class CodexRpcClient {
  private nextId = 1
  private pending = new Map<RpcId, Pending>()
  private notifications = new Set<(event: RpcNotification) => void>()
  private requests = new Set<(event: RpcServerRequest) => void>()
  private disconnects = new Set<(reason: Error) => void>()
  private serverRequests = new Set<RpcId>()
  private decoder = new StringDecoder('utf8')
  private buffer = ''
  private failure?: Error
  private initialization?: Promise<void>
  private removeClose: () => void
  private readonly onData = (chunk: Buffer | string) => this.receive(typeof chunk === 'string' ? chunk : this.decoder.write(chunk))
  private readonly onError = () => this.fail(new RpcConnectionError('App Server transport failed; reconcile pending operations'))
  private readonly onEnd = () => this.fail(new RpcConnectionError('App Server output closed; reconcile pending operations'))

  constructor(private transport: RpcTransport, private options: {
    timeoutMs?: number
    maxPending?: number
    maxFrameBytes?: number
    onListenerError?: (error: unknown) => void
  } = {}) {
    transport.output.on('data', this.onData)
    transport.output.on('error', this.onError)
    transport.output.on('end', this.onEnd)
    transport.input.on('error', this.onError)
    this.removeClose = transport.onClose(reason => this.fail(reason))
  }

  get closed(): boolean { return !!this.failure }

  initialize(): Promise<void> {
    this.initialization ??= this.requestRaw('initialize', {
      clientInfo: { name: 'arbrain', title: 'Arbrain', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    }).then(() => { this.write({ method: 'initialized', params: {} }) })
    return this.initialization
  }

  async request<T = unknown>(method: string, params: unknown = {}, timeoutMs?: number): Promise<T> {
    await this.initialize()
    return this.requestRaw(method, params, timeoutMs) as Promise<T>
  }

  onNotification(listener: (event: RpcNotification) => void): () => void {
    this.notifications.add(listener)
    return () => { this.notifications.delete(listener) }
  }

  onServerRequest(listener: (event: RpcServerRequest) => void): () => void {
    this.requests.add(listener)
    return () => { this.requests.delete(listener) }
  }

  onDisconnect(listener: (reason: Error) => void): () => void {
    if (this.failure) { listener(this.failure); return () => {} }
    this.disconnects.add(listener)
    return () => { this.disconnects.delete(listener) }
  }

  /** Returns false for a duplicate, expired or foreign request. No implicit approval. */
  respond(id: RpcId, result: unknown): boolean {
    if (this.closed || !this.serverRequests.has(id)) return false
    this.write({ id, result })
    this.serverRequests.delete(id)
    return true
  }

  reject(id: RpcId, message = 'This client does not handle this request', code = -32601): boolean {
    if (this.closed || !this.serverRequests.has(id)) return false
    this.write({ id, error: { code, message } })
    this.serverRequests.delete(id)
    return true
  }

  close(): void { this.fail(new RpcConnectionError('App Server connection closed')) }

  private requestRaw(method: string, params: unknown, timeoutMs = this.options.timeoutMs ?? 30_000): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure)
    if (this.pending.size >= (this.options.maxPending ?? 128)) {
      return Promise.reject(new RpcError('App Server request queue is full', -32001))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new RpcConnectionError(`App Server ${method} timed out; outcome may be unknown`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try { this.write({ id, method, params }) }
      catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  private write(message: unknown): void {
    if (this.failure) throw this.failure
    // Bound buffering if a child stops consuming stdin, rather than accumulating prompts forever.
    const frame = JSON.stringify(message) + '\n'
    if (this.transport.input.writableLength + Buffer.byteLength(frame) > (this.options.maxFrameBytes ?? 16 * 1024 * 1024)) {
      throw new RpcError('App Server input exceeds transport capacity', -32001)
    }
    this.transport.input.write(frame)
  }

  private receive(chunk: string): void {
    if (this.failure) return
    this.buffer += chunk
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (Buffer.byteLength(line) > (this.options.maxFrameBytes ?? 16 * 1024 * 1024)) {
        this.fail(new RpcConnectionError('App Server frame exceeds transport capacity')); return
      }
      if (!line.trim()) continue
      try { this.dispatch(JSON.parse(line)) }
      catch { this.fail(new RpcConnectionError('Invalid App Server protocol frame')); return }
      if (this.failure) return
    }
    if (Buffer.byteLength(this.buffer) > (this.options.maxFrameBytes ?? 16 * 1024 * 1024)) {
      this.fail(new RpcConnectionError('App Server frame exceeds transport capacity'))
    }
  }

  private dispatch(raw: unknown): void {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid frame')
    const message = raw as Record<string, unknown>
    const id = message.id
    if (typeof message.method === 'string') {
      const event = { method: message.method, params: (message.params ?? {}) as Record<string, unknown> }
      if (typeof id === 'number' || typeof id === 'string') {
        if (this.serverRequests.has(id)) return
        this.serverRequests.add(id)
        if (!this.requests.size) { this.reject(id); return }
        this.deliver(this.requests, { ...event, id })
      } else this.deliver(this.notifications, event)
      return
    }
    if (typeof id !== 'number' && typeof id !== 'string') throw new Error('Response without id')
    const pending = this.pending.get(id)
    if (!pending) return // Response after an observation timeout; caller must reconcile state.
    this.pending.delete(id)
    clearTimeout(pending.timer)
    if (message.error && typeof message.error === 'object') {
      const error = message.error as Record<string, unknown>
      pending.reject(new RpcError(String(error.message ?? 'App Server request failed'), Number(error.code ?? -32603), error.data))
    } else if ('result' in message) pending.resolve(message.result)
    else pending.reject(new RpcConnectionError('Malformed App Server response'))
  }

  private deliver<T>(listeners: Set<(event: T) => void>, event: T): void {
    for (const listener of listeners) {
      try { listener(event) } catch (error) { this.options.onListenerError?.(error) }
    }
  }

  private fail(reason: Error): void {
    if (this.failure) return
    this.failure = reason
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
    this.pending.clear()
    this.serverRequests.clear()
    this.deliver(this.disconnects, reason)
    this.notifications.clear()
    this.requests.clear()
    this.disconnects.clear()
    this.removeClose?.()
    this.transport.output.off('data', this.onData)
    this.transport.output.off('end', this.onEnd)
    this.transport.output.off('error', this.onError)
    // Keep the input error handler until the transport closes, to absorb late EPIPE.
    this.transport.close()
  }
}

export function spawnCodexRpc(options: { bin: string; cwd: string; home: string; env?: NodeJS.ProcessEnv }): CodexRpcClient {
  const env = { ...(options.env ?? process.env), CODEX_HOME: options.home, CLAUDECLAW_DAEMON: '1' }
  delete (env as NodeJS.ProcessEnv).OPENAI_API_KEY
  delete (env as NodeJS.ProcessEnv).CODEX_API_KEY
  const child: ChildProcessWithoutNullStreams = spawn(options.bin, ['app-server', '--stdio', '-c', 'notify=[]'], {
    cwd: options.cwd, env, stdio: ['pipe', 'pipe', 'pipe'],
  })
  // Diagnostics may contain prompts or secrets. Drain but never log raw stderr.
  child.stderr.resume()
  return new CodexRpcClient({
    input: child.stdin, output: child.stdout,
    onClose(listener) {
      const exit = () => listener(new RpcConnectionError('App Server process exited; reconcile pending operations'))
      const error = () => listener(new RpcConnectionError('Could not start App Server'))
      child.on('close', exit); child.on('error', error)
      return () => { child.off('close', exit); child.off('error', error) }
    },
    close() {
      child.stdin.end()
      if (child.exitCode === null) {
        child.kill('SIGTERM')
        const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 5_000)
        timer.unref()
      }
    },
  })
}
