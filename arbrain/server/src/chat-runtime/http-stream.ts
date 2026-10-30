import type { ServerResponse } from 'node:http'
import type { TurnRecord } from './journal.js'
import { etiquetaDespertador } from './despertadores.js'
import type { ChatSupervisor } from './supervisor.js'

/** HTTP is only an observer. Read durable pages on demand, never queue model
 * events in socket memory and never cancel a job when its observer disconnects. */
export function streamDurableTurn(res: ServerResponse, worker: ChatSupervisor, turn: TurnRecord, after = 0, pollMs = 1000, restoreSnapshot = false): void {
  // Validate scope/cursor before committing response headers.
  worker.journal.events(turn, after, 1)
  if (!worker.journal.get(turn)) throw new Error('Turn not found')
  const current = worker.journal.get(turn)!
  const snapshot = restoreSnapshot ? current.snapshot as { cursor?: number; state?: unknown } | null : null
  let cursor = typeof snapshot?.cursor === 'number' ? snapshot.cursor : after, closed = false, blocked = false
  let scheduled: ReturnType<typeof setImmediate> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let unsubscribe = () => {}
  const close = () => {
    if (closed) return
    closed = true
    unsubscribe()
    clearImmediate(scheduled)
    clearInterval(heartbeat)
    clearInterval(poll)
    res.off('drain', drained)
    res.off('close', close)
    res.off('error', close)
  }
  const finish = () => { close(); res.end('data: [DONE]\n\n') }
  let filaVista: string | null = null
  function frameFila(): string {
    const fila = worker.journal.filaDelante(turn)
    const visto = JSON.stringify(fila)
    if (!fila || visto === filaVista) return ''
    filaVista = visto
    return `data: ${JSON.stringify({ type: 'status', status: 'en_fila_turno', fila })}\n\n`
  }
  /** Mientras el turno sigue en fila, la descripción se mantiene al día (un aviso cedió, otro mensaje salió…). */
  function avisarFila() {
    if (filaVista === null) return
    const frame = frameFila()
    if (frame) write(frame)
  }
  const wake = () => {
    if (!closed && !blocked && !scheduled) scheduled = setImmediate(pump)
  }
  const drained = () => { blocked = false; wake() }
  const write = (frame: string) => { blocked = !res.write(frame) }
  function pump() {
    scheduled = undefined
    if (closed || blocked) return
    try {
      // Bound synchronous work and memory even when replaying a long tool run.
      const page = worker.journal.events(turn, cursor, 32)
      for (const row of page) {
        cursor = row.cursor
        write(`id: ${cursor}\ndata: ${JSON.stringify(row.event)}\n\n`)
        const type = (row.event as { type?: string }).type
        if (type === 'terminal' || type === 'execution_uncertain') { finish(); return }
        if (blocked) return
      }
      if (page.length === 32) { wake(); return }
      avisarFila()
      if (['completed', 'failed', 'interrupted', 'uncertain'].includes(worker.journal.get(turn)!.status)) {
        // A different process may have committed between the page and status
        // reads. Terminal status is durable before this final tail check.
        if (worker.journal.events(turn, cursor, 1).length) wake()
        else finish()
      }
    } catch {
      // A transport/storage read failure must not change execution ownership.
      close()
      res.destroy()
    }
  }
  res.on('close', close)
  res.on('error', close)
  res.on('drain', drained)
  // Subscribe first; notifications only wake the cursor reader. Any event
  // committed before, during or after replay is therefore delivered once.
  unsubscribe = worker.subscribe(turn, wake)
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  const input = turn.input as { message?: string; audioUrl?: string; imageUrl?: string; spontaneous?: { label?: string }; despertador?: { id?: string; texto?: string; tipo?: string } }
  // Chat vivo (3 oct 2026): un turno que Daniel no escribió dice de dónde vino; la web no le pinta burbuja suya.
  const origen = input.spontaneous ? { tipo: 'espontanea', etiqueta: input.spontaneous.label }
    : input.despertador ? { tipo: 'despertador', etiqueta: etiquetaDespertador({ texto: input.despertador.texto ?? '', tipo: input.despertador.tipo }), despertadorId: input.despertador.id } : undefined
  const meta = { type: 'resume_meta', protocol: 'durable-v1', turnId: turn.turnId, userMessage: input.message, audioUrl: input.audioUrl, imageUrl: input.imageUrl, startedAt: turn.createdAt, ...(origen ? { origen } : {}),
    // Lo que Daniel escribió con este turno vivo (7 oct 2026): el reenganche lo pinta dentro de la actividad.
    ...(() => { const inyectados = worker.injectionsOf(turn); return inyectados.length ? { inyectados } : {} })() }
  // One initial write keeps backpressure accounting intact for both frames.
  // Un turno formado detrás de otro de la misma conversación no emite nada hasta que aquel termina (2 oct 2026:
  // DeepSeek se veía «Preparando respuesta» 3 min). Se dice en claro; el `status` del motor lo reemplaza al arrancar.
  // Con `fila` (5 oct): qué hay delante (mensajes de Daniel, avisos de agentes, una pregunta abierta o un
  // aviso que cede su lugar), para que la web diga la verdad en lugar de una espera muda. Se re-emite si cambia.
  const enFila = current.status === 'queued' && worker.journal.waitsBehindAnother(turn)
  write(`data: ${JSON.stringify(meta)}\n\n` + (snapshot?.state ? `data: ${JSON.stringify({ type: 'resume_snapshot', cursor, state: snapshot.state, turnStatus: current.status })}\n\n` : '')
    + (enFila ? frameFila() : ''))
  heartbeat = setInterval(() => { if (!closed && !blocked) write(': ping\n\n') }, 25_000)
  heartbeat.unref()
  // Another live worker may own this turn. Its SQLite commits do not emit
  // notifications in our process, so keep a bounded polling fallback.
  poll = setInterval(wake, pollMs)
  poll.unref()
  wake()
}
