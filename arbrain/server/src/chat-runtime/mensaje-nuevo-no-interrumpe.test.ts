import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatJournal, type TurnIdentity } from './journal.js'
import { ChatSupervisor, type JobRunner } from './supervisor.js'

// Bug 1 oct 09:32 («solo el segundo mensaje se envía»): el hilo mostró
// «[Request interrupted by user]» y el mismo texto. El journal probó que la
// detención vino de una petición explícita del cliente (chat_runtime_cancellations),
// no del servidor. Esta prueba fija el contrato del servidor: una entrada nueva en
// la misma conversación ESPERA su turno; nunca cancela ni reemplaza el que corre.
const cleanup: Array<() => void> = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })
const id = (turnId: string): TurnIdentity => ({ owner: 'daniel', account: 'default', conversationId: 'sdk:hilo', turnId })

describe('mensaje nuevo con Levy trabajando', () => {
  it('queda en fila y sale después; el turno en curso termina completo, sin señal de abort', async () => {
    let soltar!: () => void
    const compuerta = new Promise<void>(resolve => { soltar = resolve })
    const abortados: string[] = []
    const orden: string[] = []
    const run: JobRunner = vi.fn(async (turn, emit, signal) => {
      signal.addEventListener('abort', () => abortados.push(turn.turnId), { once: true })
      orden.push(`inicio:${turn.turnId}`)
      if (turn.turnId === 'primero') await compuerta
      emit({ type: 'result', text: `listo ${turn.turnId}` })
      orden.push(`fin:${turn.turnId}`)
      return { status: 'completed' as const, payload: {}, snapshot: { text: 'ok' } }
    })
    const db = new Database(':memory:')
    const journal = new ChatJournal(db, () => Date.now())
    const worker = new ChatSupervisor(journal, { workerId: 'w', run, deliver: async () => true, workerConfirmedDead: () => false })
    cleanup.push(() => { worker.stop(); db.close() })
    worker.start()
    worker.accept(id('primero'), { message: 'Ahora fíjate esto…' })
    await vi.waitFor(() => expect(journal.get(id('primero'))?.status).toBe('running'))
    // Daniel escribe mientras Levy trabaja: entra, no interrumpe.
    worker.accept(id('segundo'), { message: 'Y otra cosa' })
    await worker.pump()
    expect(journal.get(id('segundo'))?.status).toBe('queued')
    expect(journal.get(id('primero'))?.status).toBe('running')
    soltar()
    await vi.waitFor(() => expect(journal.get(id('segundo'))?.status).toBe('completed'))
    expect(journal.get(id('primero'))?.status).toBe('completed')
    expect(abortados).toEqual([])
    expect(orden).toEqual(['inicio:primero', 'fin:primero', 'inicio:segundo', 'fin:segundo'])
  })
  it('reenviar el mismo turnId no crea un segundo turno (sin duplicados)', () => {
    const db = new Database(':memory:'); cleanup.push(() => db.close())
    const journal = new ChatJournal(db, () => 1)
    expect(journal.accept(id('t'), { message: 'hola' }).created).toBe(true)
    expect(journal.accept(id('t'), { message: 'hola' }).created).toBe(false)
  })
})
