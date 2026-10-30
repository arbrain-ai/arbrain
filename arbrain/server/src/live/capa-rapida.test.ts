import { describe, expect, it } from 'vitest'
import { acuseDe, clasificarLive, esfuerzoParaOpus, type VeredictoLive } from './capa-rapida.js'

const v = (ruta: VeredictoLive['ruta'], confianza = 1, esfuerzo: VeredictoLive['esfuerzo'] = 'low'): VeredictoLive => ({ ruta, confianza, esfuerzo, ms: 200 })
const respuesta = (ruta: string, p: number, esf = 'low', pe = 1) => async () => new Response(JSON.stringify({ result: { answers: { ruta: { type: 'choice', choice: ruta, probabilities: { [ruta]: p } }, esfuerzo: { type: 'choice', choice: esf, probabilities: { [esf]: pe } } } } }))
const env = { OPENROUTER_API_KEY: 'k' } as NodeJS.ProcessEnv

describe('capa rápida de Live', () => {
  it('lee ruta y esfuerzo de Jev', async () => {
    expect(await clasificarLive('hola', { env, fetchFn: respuesta('trivial', 1) as never })).toMatchObject({ ruta: 'trivial', esfuerzo: 'low', confianza: 1 })
  })
  it('con duda en el esfuerzo asume el más alto', async () => {
    expect((await clasificarLive('x', { env, fetchFn: respuesta('consulta', 1, 'low', 0.5) as never }))?.esfuerzo).toBe('high')
  })
  it('falla en silencio: sin llave, HTTP malo, opción fuera de catálogo o red caída', async () => {
    expect(await clasificarLive('hola', { env: {} as never })).toBeNull()
    expect(await clasificarLive('hola', { env, fetchFn: (async () => new Response('{}', { status: 500 })) as never })).toBeNull()
    expect(await clasificarLive('hola', { env, fetchFn: respuesta('otra', 1) as never })).toBeNull()
    expect(await clasificarLive('hola', { env, fetchFn: (async () => { throw new Error('red') }) as never })).toBeNull()
  })
  it('no hay acuse para trivial seguro y sí con duda; nunca repite la misma frase seguida', () => {
    expect(acuseDe(v('trivial'))).toBeNull()
    expect(acuseDe(v('trivial', 0.5))).not.toBeNull()
    expect(acuseDe(null)).not.toBeNull()
    const a = acuseDe(v('trabajo'), () => 0)!.text, b = acuseDe(v('trabajo'), () => 0)!.text
    expect(a).not.toBe(b)
  })
  it('el esfuerzo solo baja, solo con confianza alta y nunca en razonar o trabajo', () => {
    expect(esfuerzoParaOpus(v('trivial'), 'max')).toBe('low')
    expect(esfuerzoParaOpus(v('consulta', 1, 'medium'), 'high')).toBe('medium')
    expect(esfuerzoParaOpus(v('consulta', 1, 'medium'), 'low')).toBeNull()
    expect(esfuerzoParaOpus(v('trivial', 0.85), 'max')).toBeNull()
    expect(esfuerzoParaOpus(v('razonar'), 'max')).toBeNull()
    expect(esfuerzoParaOpus(v('trabajo'), 'max')).toBeNull()
    expect(esfuerzoParaOpus(v('consulta', 1, 'high'), 'max')).toBeNull()
  })
})
