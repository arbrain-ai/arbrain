import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatJournal, type TurnIdentity } from './journal.js'
import { ChatInjections, posicionesEnTexto } from './inyecciones.js'
import { ChatSupervisor, type JobRunner } from './supervisor.js'

// Captura del 1 nov 2026, 08:13: el dueño escribió mientras Levy redactaba su respuesta. El motor tomó el mensaje en
// su siguiente llamada (evento `init` 4 s después), pero la web lo pintaba ARRIBA de toda la respuesta, encima de lo
// que Levy ya llevaba escrito. Bitácora real del turno: text_delta 08:13:10–08:13:19, user_injected 08:13:15 (a media
// frase), init 08:13:19, herramientas, y el resto del texto 08:14:01. La nota va entre los dos tramos.

const PRIMERO = '**Fulano de Tal.** Ingeniero con quince años de oficio.\n\n- Ingreso hoy: dos clientes.'
const SEGUNDO = 'Sí me acuerdo. Lo de la fila sigue en curso.'

describe('lugar de una inyección en el texto de la respuesta', () => {
  it('la que llega a media frase queda al final de ese tramo, antes de lo que Levy escribe después de leerla', () => {
    const corte = 20
    const lugar = posicionesEnTexto([
      { type: 'init' },
      { type: 'tool_start', toolId: 't1' }, { type: 'tool_result', toolId: 't1' },
      { type: 'text_delta', text: PRIMERO.slice(0, corte) },
      { type: 'user_injected', injectionId: 'nota' },
      { type: 'text_delta', text: PRIMERO.slice(corte) },
      { type: 'init' },
      { type: 'tool_start', toolId: 't2' }, { type: 'tool_result', toolId: 't2' },
      { type: 'text_delta', text: SEGUNDO },
      { type: 'result', text: `${PRIMERO}\n\n${SEGUNDO}` },
    ]).get('nota')
    expect(lugar).toEqual({ trasTexto: PRIMERO.length, ancla: PRIMERO.slice(-60), abierta: false })
  })

  it('con una herramienta corriendo se fija en el texto de ese momento; sin cierre aún, queda abierta', () => {
    const lugar = posicionesEnTexto([
      { type: 'text_delta', text: 'Reviso.' }, { type: 'tool_start', toolId: 't1' },
      { type: 'user_injected', injectionId: 'a' },
      { type: 'tool_result', toolId: 't1' },
      { type: 'text_delta', text: ' Listo, ya con tu mensaje.' },
      { type: 'user_injected', injectionId: 'b' },
      { type: 'text_delta', text: ' Sigo.' },
    ])
    expect(lugar.get('a')).toMatchObject({ trasTexto: 'Reviso.'.length, abierta: false })
    expect(lugar.get('b')).toMatchObject({ trasTexto: 'Reviso. Listo, ya con tu mensaje. Sigo.'.length, abierta: true })
  })

  it('el texto de una vuelta de la meta no mueve el lugar (vive aparte, como en el snapshot)', () => {
    const lugar = posicionesEnTexto([
      { type: 'text_delta', text: 'Principal.' },
      { type: 'goal', meta: { vueltas: [{ texto: '' }] } },
      { type: 'text_delta', text: ' de la vuelta' },
      { type: 'user_injected', injectionId: 'a' }, { type: 'result' },
    ])
    expect(lugar.get('a')?.trasTexto).toBe('Principal.'.length)
  })
})

const cleanup: Array<() => void> = []
afterEach(() => { while (cleanup.length) cleanup.pop()!() })
const id = (turnId: string): TurnIdentity => ({ owner: 'dueno', account: 'default', conversationId: 'hilo', turnId })

describe('el lugar viaja con la entrega (lo que se guarda y se ve al recargar)', () => {
  it('injectedMessages lleva trasTexto y ancla; el reenganche (injectionsOf) también', async () => {
    let now = 1_000
    const db = new Database(':memory:')
    cleanup.push(() => db.close())
    const journal = new ChatJournal(db, () => ++now)
    const injections = new ChatInjections(db, journal, () => ++now)
    let seguir!: () => void
    const compuerta = new Promise<void>(resolve => { seguir = resolve })
    const run: JobRunner = vi.fn(async (turn, emit) => {
      emit({ type: 'text_delta', text: PRIMERO.slice(0, 20) })
      await compuerta
      emit({ type: 'text_delta', text: PRIMERO.slice(20) })
      emit({ type: 'init', sessionId: 's' })
      emit({ type: 'text_delta', text: SEGUNDO })
      emit({ type: 'result', text: `${PRIMERO}\n\n${SEGUNDO}` })
      return { status: 'completed' as const, payload: { turnId: turn.turnId }, snapshot: { text: `${PRIMERO}\n\n${SEGUNDO}` } }
    })
    const entregas: unknown[] = []
    const worker = new ChatSupervisor(journal, { workerId: 'w', run, deliver: async p => { entregas.push(p); return true }, workerConfirmedDead: () => false, injections, inject: () => true })
    cleanup.push(() => worker.stop())
    worker.start()
    worker.accept(id('t'), { message: 'recuérdame el perfil' })
    await vi.waitFor(() => expect(journal.events(id('t')).some(e => (e.event as { type: string }).type === 'text_delta')).toBe(true))
    expect(injections.tryInject(id('nota'), { message: 'pregunta aparte' })).not.toBeNull()
    await worker.pump()
    // Recién tomada, a media frase: abierta, al final de lo escrito.
    expect(worker.injectionsOf(id('t'))).toEqual([expect.objectContaining({ injectionId: 'nota', trasTexto: 20, abierta: true })])
    seguir()
    await vi.waitFor(() => expect(entregas).toHaveLength(1))
    expect(entregas[0]).toMatchObject({ injectedMessages: [{ turnId: 'nota', message: 'pregunta aparte', trasTexto: PRIMERO.length, ancla: PRIMERO.slice(-60) }] })
  })
})
