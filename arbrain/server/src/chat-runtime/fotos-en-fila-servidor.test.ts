import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatJournal, JournalCancelled, type TurnIdentity } from './journal.js'
import { ChatInjections } from './inyecciones.js'
import { ChatSupervisor, type JobRunner } from './supervisor.js'

// Opción B del reporte docs/builds/fila-mensajes-2026-11-01 (firmada el 1 nov, 08:46). Incidente de las 07:43: con
// Levy en un turno largo, el dueño mandó texto + 2 fotos y se fue a otra conversación; el turno cerró sin nadie
// mirando y el mensaje se quedó en la fila del dispositivo. Ahora el mensaje con fotos viaja al servidor en el acto
// (`inyectar: true`), espera ahí y sale solo al cerrar el turno, antes que los avisos, una sola vez.
const cleanup: Array<() => void> = []
afterEach(() => { while (cleanup.length) cleanup.pop()!() })
const id = (turnId: string): TurnIdentity => ({ owner: 'dueno', account: 'default', conversationId: 'hilo', turnId })
const FOTOS = { message: 'mira estas dos capturas', imageUrl: 'https://storage/chat-1.png\nhttps://storage/chat-2.png', source: 'desktop' }
const AVISO = { message: '[Aviso del motor s-1 · un subagente terminó]', despertador: { id: 's-1', texto: 'Subagente', programadoPara: 1, disparo: 1, tipo: 'subagente' } }

function montar() {
  let now = 1_000
  const db = new Database(':memory:')
  cleanup.push(() => db.close())
  const journal = new ChatJournal(db, () => ++now)
  const injections = new ChatInjections(db, journal, () => ++now)
  let seguir!: () => void
  const compuerta = new Promise<void>(resolve => { seguir = resolve })
  const corridas: Array<{ turnId: string; input: unknown }> = []
  const run: JobRunner = vi.fn(async (turn, emit) => {
    corridas.push({ turnId: turn.turnId, input: turn.input })
    emit({ type: 'text_delta', text: `respuesta a ${turn.turnId}` })
    if (turn.turnId === 'largo') await compuerta
    return { status: 'completed' as const, payload: { turnId: turn.turnId }, snapshot: { text: 'ok' } }
  })
  const inject = vi.fn(() => true)
  const entregas: string[] = []
  const worker = new ChatSupervisor(journal, { workerId: 'w', run, deliver: async p => { entregas.push(String((p as { turnId: string }).turnId)); return true }, workerConfirmedDead: () => false, injections, inject })
  cleanup.push(() => worker.stop())
  worker.start()
  return { db, journal, injections, worker, seguir, corridas, inject, entregas }
}

describe('fotos en fila por el servidor (opción B)', () => {
  it('turno largo, el dueño se va a otra conversación: texto + 2 fotos salen solos al cerrar, antes del aviso y una sola vez', async () => {
    const { db, journal, injections, worker, seguir, corridas, inject, entregas } = montar()
    worker.accept(id('largo'), { message: 'revisa todo el repo' })
    await vi.waitFor(() => expect(corridas.map(c => c.turnId)).toEqual(['largo']))
    // Un aviso de subagente llega mientras tanto (es anterior al mensaje del dueño).
    journal.accept(id('aviso'), AVISO)
    // El mensaje con fotos llega al servidor en el acto. Las fotos ya están subidas: viajan sus URLs.
    const r = injections.tryInject(id('fotos'), FOTOS)
    expect(r).toMatchObject({ into: { turnId: 'largo' }, injection: { status: 'pending' } })
    await worker.pump()
    // El motor no toma fotos a media vuelta: ni se intenta; espera al cierre.
    expect(inject).not.toHaveBeenCalled()
    expect(injections.get('fotos')?.status).toBe('pending')
    // Lo que el reenganche ve: su id y sus fotos (la web lo pinta en la fila, no como nota dentro del turno).
    expect(worker.injectionsOf(id('largo'))).toEqual([expect.objectContaining({ injectionId: 'fotos', status: 'pending', imageUrl: FOTOS.imageUrl })])
    // El dispositivo reintenta con el mismo id (red inestable): es la misma, no otra.
    expect(injections.tryInject(id('fotos'), FOTOS)?.injection.id).toBe('fotos')
    // Nadie mira la conversación: el turno cierra solo.
    seguir()
    await vi.waitFor(() => expect(new Set(entregas)).toEqual(new Set(['largo', 'fotos', 'aviso'])))
    // Salió con su identidad, sus dos fotos intactas y antes que el aviso (lo humano va primero).
    expect(corridas.map(c => c.turnId)).toEqual(['largo', 'fotos', 'aviso'])
    expect(corridas[1].input).toMatchObject({ message: FOTOS.message, imageUrl: FOTOS.imageUrl })
    expect(injections.get('fotos')?.status).toBe('requeued')
    // El dueño vuelve y su dispositivo pregunta otra vez con el mismo id: no nace un segundo turno.
    expect(injections.tryInject(id('fotos'), FOTOS)).toBeNull()
    expect(journal.accept(id('fotos'), FOTOS)).toMatchObject({ created: false, turn: { turnId: 'fotos', status: 'completed' } })
    const veces = db.prepare(`SELECT COUNT(*) AS n FROM chat_runtime_turns WHERE json_extract(input_json, '$.imageUrl') = ?`).get(FOTOS.imageUrl) as { n: number }
    expect(veces.n).toBe(1)
    expect(corridas.filter(c => c.turnId === 'fotos')).toHaveLength(1)
  })

  it('lo que el dueño escribe después de las fotos no se les adelanta: sale detrás, en orden', async () => {
    const { injections, worker, seguir, corridas, inject } = montar()
    worker.accept(id('largo'), { message: 'turno largo' })
    await vi.waitFor(() => expect(corridas).toHaveLength(1))
    injections.tryInject(id('fotos'), FOTOS)
    injections.tryInject(id('texto'), { message: 'y otra cosa' })
    await worker.pump()
    expect(inject).not.toHaveBeenCalled()
    seguir()
    await vi.waitFor(() => expect(corridas.map(c => c.turnId)).toEqual(['largo', 'fotos', 'texto']))
  })

  it('quitar o editar mientras espera: se retira, no sale sola y vuelve a ser del dispositivo', async () => {
    const { injections, worker, seguir, corridas, entregas } = montar()
    worker.accept(id('largo'), { message: 'turno largo' })
    await vi.waitFor(() => expect(corridas).toHaveLength(1))
    injections.tryInject(id('fotos'), FOTOS)
    expect(injections.retirar(id('fotos'))).toEqual({ retirada: true, estado: 'unread' })
    // Retirar dos veces es lo mismo.
    expect(injections.retirar(id('fotos'))).toEqual({ retirada: true, estado: 'unread' })
    seguir()
    await vi.waitFor(() => expect(entregas).toEqual(['largo']))
    await worker.pump()
    expect(corridas.map(c => c.turnId)).toEqual(['largo'])
    // Ya salió: retirar no lo toca (ni detiene nada).
    worker.accept(id('otro'), { message: 'siguiente' })
    await vi.waitFor(() => expect(entregas).toContain('otro'))
    expect(injections.retirar(id('otro'))).toEqual({ retirada: false, estado: 'requeued' })
  })

  it('retirar antes de que llegue el envío deja lápida: el envío tardío no se inyecta ni crea turno, y no tumba a los demás', async () => {
    const { journal, injections, worker, seguir, corridas } = montar()
    worker.accept(id('largo'), { message: 'turno largo' })
    await vi.waitFor(() => expect(corridas).toHaveLength(1))
    expect(injections.retirar(id('tarde'))).toEqual({ retirada: true, estado: 'desconocida' })
    expect(injections.tryInject(id('tarde'), FOTOS)).toBeNull()
    expect(() => journal.accept(id('tarde'), FOTOS)).toThrow(JournalCancelled)
    // Carrera inversa: ya esperaba y la lápida cae encima. El cierre la salta sin tirar la transacción.
    injections.tryInject(id('a'), FOTOS)
    injections.tryInject(id('b'), { message: 'detrás' })
    journal.requestCancellation(id('a'))
    seguir()
    await vi.waitFor(() => expect(corridas.map(c => c.turnId)).toEqual(['largo', 'b']))
    expect(injections.get('a')?.status).toBe('unread')
  })
})
