import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { ChatJournal } from '../chat-runtime/journal.js'
import { Despertadores, dispararVencidos } from '../chat-runtime/despertadores.js'
import { decidirAviso, revisarSubagentes, type Observacion, type PuertoAviso } from './aviso-subagentes.js'
import type { Subagente } from './cuerpo.js'

const origen = { owner: 'daniel', account: 'default', conversationId: 'chat-levy' }
const T0 = Date.parse('2026-10-03T14:00:00Z')
const base: Subagente = { id: 7, nombre: 'qa', harness: 'claude', encargo: 'corre la QA', cwd: '/tmp/qa', creado: new Date(T0).toISOString(), motor: true, pid: 70, entrega: 'entregado', avisarA: origen }
const quieto: Observacion = { vivo: true, trabajando: false, ultimaActividad: T0, ultimaRespuesta: 'Listo: 12/12 en verde.', pregunta: null }

describe('aviso de subagentes del motor', () => {
  it('avisa una sola vez cuando queda quieto tras responder', () => {
    expect(decidirAviso(base, quieto, T0 + 5_000, 30_000)).toEqual({ avisar: false })
    expect(decidirAviso(base, { ...quieto, trabajando: true }, T0 + 60_000, 30_000)).toEqual({ avisar: false })
    const d = decidirAviso(base, quieto, T0 + 31_000, 30_000)
    expect(d).toMatchObject({ avisar: true, cambio: { avisadoHasta: T0 } })
    if (d.avisar) expect(d.texto).toMatch(/Subagente «qa» \(agenteId 7, claude\) · estado: TERMINÓ · quieto en su caja tras responder\.[\s\S]*12\/12 en verde/)
    expect(decidirAviso({ ...base, avisadoHasta: T0 }, quieto, T0 + 90_000, 30_000)).toEqual({ avisar: false })
    // retomado y vuelve a terminar: nuevo aviso
    expect(decidirAviso({ ...base, avisadoHasta: T0 }, { ...quieto, ultimaActividad: T0 + 60_000 }, T0 + 100_000, 30_000).avisar).toBe(true)
  })

  it('no avisa sin origen, cerrado, sin entrega o sin respuesta; avisa una vez si el proceso muere', () => {
    expect(decidirAviso({ ...base, avisarA: undefined }, quieto, T0 + 60_000, 30_000).avisar).toBe(false)
    expect(decidirAviso({ ...base, cerrado: 'x' }, quieto, T0 + 60_000, 30_000).avisar).toBe(false)
    expect(decidirAviso({ ...base, entrega: 'pendiente' }, quieto, T0 + 60_000, 30_000).avisar).toBe(false)
    expect(decidirAviso(base, { ...quieto, ultimaRespuesta: null }, T0 + 60_000, 30_000).avisar).toBe(false)
    const muerto = { vivo: false, trabajando: false, ultimaActividad: null, ultimaRespuesta: null, pregunta: null }
    expect(decidirAviso({ ...base, entrega: 'falló' }, muerto, T0, 30_000)).toMatchObject({ avisar: true, cambio: { avisadoFin: expect.any(String) } })
    expect(decidirAviso({ ...base, avisadoFin: 'ya' }, muerto, T0, 30_000).avisar).toBe(false)
    expect(decidirAviso({ ...base, entrega: 'pendiente' }, muerto, T0 + 10_000, 30_000).avisar).toBe(false)
    const fallo = decidirAviso({ ...base, entrega: 'falló' }, muerto, T0, 30_000)
    expect(fallo.avisar && fallo.texto).toMatch(/estado: FALLÓ/)
    const cerro = decidirAviso(base, muerto, T0, 30_000)
    expect(cerro.avisar && cerro.texto).toMatch(/estado: SE CERRÓ/)
    const error = decidirAviso(base, { ...quieto, error: 'API Error: 529 overloaded' }, T0 + 60_000, 30_000)
    expect(error.avisar && error.texto).toMatch(/estado: FALLÓ · su último turno cerró con error: API Error: 529/)
  })

  it('la pregunta abierta del subagente va en el aviso y se tachan secretos', () => {
    const d = decidirAviso(base, { ...quieto, pregunta: '¿Uso la rama A o la B?', ultimaRespuesta: 'API_KEY=abc123 listo' }, T0 + 60_000, 30_000)
    expect(d.avisar && d.texto).toMatch(/pregunta para ti[\s\S]*rama A o la B/)
    expect(d.avisar && d.texto).not.toMatch(/abc123/)
  })

  it('el aviso viaja por el camino del despertador: turno en la conversación que lo lanzó', async () => {
    const db = new Database(':memory:')
    let ahora = T0 + 60_000
    const clock = () => ahora
    const journal = new ChatJournal(db, clock), despertadores = new Despertadores(db, clock)
    journal.accept({ ...origen, turnId: 'previo' }, { message: 'lanza la QA', source: 'desktop', overrides: { model: 'claude-opus-5-5', effort: null, fast: false, ultracode: false } })
    const registro: Subagente[] = [base]
    const puerto: PuertoAviso = {
      registro: async () => registro,
      observar: async () => quieto,
      anotar: async (s, c) => { Object.assign(registro.find(x => x.id === s.id)!, c) },
      avisar: (o, texto) => { despertadores.avisar(o, texto) },
    }
    expect(await revisarSubagentes(puerto, ahora)).toBe(1)
    expect(await revisarSubagentes(puerto, ahora + 10_000)).toBe(0)
    ahora += 1
    expect(dispararVencidos(despertadores, journal, { info: () => {}, warn: () => {} })).toBe(1)
    const turno = journal.latest(origen.owner, origen.account, origen.conversationId)!
    const input = turno.input as { message: string; despertador: { tipo?: string; id: string }; overrides: { model: string } }
    expect(input.message).toMatch(/^\[Aviso del motor s-[0-9a-f]{8} · un subagente que lanzaste/)
    expect(input.despertador).toMatchObject({ tipo: 'subagente' })
    expect(input.overrides.model).toBe('claude-opus-5-5')
    expect(despertadores.listar(origen)).toEqual([])
  })
})
