// Juez separado al cerrar (27 oct 2026): otra llamada de modelo, sin el contexto del trabajador, contrasta el informe
// final con la Definición de Terminado. Aquí el modelo es simulado: se prueba qué recibe, cómo se lee y que nunca bloquea.
import { describe, it, expect, vi } from 'vitest'
import { extraerDoD, juzgar, leerVeredicto, promptJuez, type Llamar } from './juez.js'
import { revisarSubagentes, lineaJuicio, type Observacion, type PuertoAviso } from './aviso-subagentes.js'
import type { Subagente } from './cuerpo.js'

const ENCARGO = `NODO: qa del calendario.
QUÉ HACER:
  1. Corre la suite.
DoD (verificable hoy):
  - npm test en verde con 0 fallos.
  - Captura en /tmp/qa.png.
VALIDA: npm test
FRENO: no publicar.`

describe('juez: Definición de Terminado', () => {
  it('extrae la DoD hasta el siguiente encabezado del encargo', () => {
    const dod = extraerDoD(ENCARGO)!
    expect(dod).toMatch(/^DoD \(verificable hoy\):/)
    expect(dod).toMatch(/npm test en verde/)
    expect(dod).toMatch(/Captura en \/tmp\/qa\.png/)
    expect(dod).not.toMatch(/FRENO|VALIDA/)
  })
  it('reconoce «Definición de Terminado» y «Criterios de aceptación»; sin DoD devuelve null', () => {
    expect(extraerDoD('Haz X.\nDefinición de Terminado: el archivo existe y el test pasa.')).toMatch(/el archivo existe/)
    expect(extraerDoD('## Criterios de aceptación\n- responde 200 en /salud')).toMatch(/responde 200/)
    expect(extraerDoD('Investiga por qué falla el build y arréglalo.')).toBeNull()
    expect(extraerDoD(undefined)).toBeNull()
  })
})

describe('juez: veredicto con modelo simulado', () => {
  const T = () => Date.parse('2026-10-27T20:00:00Z')
  it('el juez recibe SOLO la DoD y el informe, en una llamada nueva con su propio sistema', async () => {
    const llamar = vi.fn<Llamar>(async () => '{"veredicto":"cumple","razon":"Muestra npm test 0 fallos y la ruta de la captura."}')
    const j = await juzgar({ dod: extraerDoD(ENCARGO), informe: 'npm test: 412 passed, 0 failed. Captura: /tmp/qa.png', turno: 2 }, { llamar, ahora: T, env: {} })
    expect(j).toEqual({ veredicto: 'cumple', razon: 'Muestra npm test 0 fallos y la ruta de la captura.', en: '2026-10-27T20:00:00.000Z', turno: 2, modelo: 'claude-sonnet-5-5' })
    expect(llamar).toHaveBeenCalledTimes(1)
    const [prompt, o] = llamar.mock.calls[0]
    expect(prompt).toBe(promptJuez(extraerDoD(ENCARGO)!, 'npm test: 412 passed, 0 failed. Captura: /tmp/qa.png'))
    expect(prompt).not.toMatch(/QUÉ HACER|FRENO/)
    expect(o.sistema).toMatch(/juez independiente/)
  })
  it('no cumple y no verificable se leen; formatos sucios se toleran; basura = null', () => {
    expect(leerVeredicto('```json\n{"veredicto":"no cumple","razon":"Admite 3 tests en rojo."}\n```')).toEqual({ veredicto: 'no-cumple', razon: 'Admite 3 tests en rojo.' })
    expect(leerVeredicto('{"veredicto":"No_Verificable","razon":"Dice que pasó — sin salida."}')).toEqual({ veredicto: 'no-verificable', razon: 'Dice que pasó, sin salida.' })
    expect(leerVeredicto('cumple, todo bien')).toBeNull()
    expect(leerVeredicto('{"veredicto":"quizá"}')).toBeNull()
  })
  it('sin DoD no llama al modelo: «sin-dod»; sin informe: «no-verificable»', async () => {
    const llamar = vi.fn<Llamar>()
    expect((await juzgar({ dod: null, informe: 'listo' }, { llamar, env: {} }))?.veredicto).toBe('sin-dod')
    expect((await juzgar({ dod: 'tests verdes', informe: '  ' }, { llamar, env: {} }))?.veredicto).toBe('no-verificable')
    expect(llamar).not.toHaveBeenCalled()
  })
  it('si el modelo falla, tarda o se apaga por config, devuelve null (nunca bloquea)', async () => {
    expect(await juzgar({ dod: 'x verde', informe: 'listo' }, { llamar: async () => { throw new Error('529') }, env: {} })).toBeNull()
    expect(await juzgar({ dod: 'x verde', informe: 'listo' }, { llamar: () => new Promise(() => {}), plazoMs: 30, env: {} })).toBeNull()
    expect(await juzgar({ dod: 'x verde', informe: 'listo' }, { llamar: async () => 'no sé', env: {} })).toBeNull()
    const llamar = vi.fn<Llamar>()
    expect(await juzgar({ dod: 'x verde', informe: 'listo' }, { llamar, env: { ARBRAIN_JUEZ: '0' } })).toBeNull()
    expect(llamar).not.toHaveBeenCalled()
  })
})

describe('juez en el aviso de cierre', () => {
  const origen = { owner: 'daniel', account: 'default', conversationId: 'chat-levy' }
  const T0 = Date.parse('2026-10-27T20:00:00Z')
  const sub: Subagente = { id: 900400, nombre: 'qa', harness: 'claude', encargo: ENCARGO, cwd: '/tmp/qa', creado: new Date(T0 - 600_000).toISOString(), modo: 'sin-pantalla', pid: 1, entrega: 'entregado', avisarA: origen }
  const terminado: Observacion = { vivo: true, trabajando: false, ultimaActividad: T0, ultimaRespuesta: 'npm test 0 fallos', pregunta: null, turno: 1 }
  const puerto = (obs: Observacion, juzgar?: PuertoAviso['juzgar']) => {
    const registro = [{ ...sub }], avisos: string[] = []
    const p: PuertoAviso = { registro: async () => registro, observar: async () => obs, anotar: async (s, c) => { Object.assign(registro[0], c) }, avisar: (_o, t) => { avisos.push(t) }, ...(juzgar ? { juzgar } : {}) }
    return { p, registro, avisos }
  }
  it('el veredicto va en el aviso a Levy y queda en el registro para el tablero', async () => {
    const j = { veredicto: 'no-cumple' as const, razon: 'Falta la captura.', en: 'x', modelo: 'claude-sonnet-5-5' }
    const { p, registro, avisos } = puerto(terminado, async () => j)
    expect(await revisarSubagentes(p, T0 + 1000)).toBe(1)
    expect(avisos[0]).toMatch(/estado: TERMINÓ/)
    expect(avisos[0]).toContain(lineaJuicio(j))
    expect(avisos[0]).toMatch(/Juez separado \(claude-sonnet-5-5, sin el contexto del agente\): NO CUMPLE · Falta la captura\. No lo reportes como hecho/)
    expect(registro[0].juicio).toEqual(j)
  })
  it('si el juez truena, el aviso sale igual y sin veredicto', async () => {
    const { p, registro, avisos } = puerto(terminado, async () => { throw new Error('boom') })
    expect(await revisarSubagentes(p, T0 + 1000)).toBe(1)
    expect(avisos[0]).not.toMatch(/Juez separado/)
    expect(registro[0].juicio).toBeUndefined()
    expect(registro[0].avisadoHasta).toBe(T0)
  })
  it('no se juzga un turno que falló o cerró con pregunta', async () => {
    const juzgar = vi.fn(async () => null)
    await revisarSubagentes(puerto({ ...terminado, error: 'API 529' }, juzgar).p, T0 + 1000)
    await revisarSubagentes(puerto({ ...terminado, pregunta: '¿Sigo?' }, juzgar).p, T0 + 1000)
    expect(juzgar).not.toHaveBeenCalled()
  })
})
