import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { leerConReintento, ESPERAS_REINTENTO_MS } from '../../src/features/chat/lib/leer-con-reintento'
import { turnoSinEnganchar } from '../../src/features/chat/lib/turno-sin-enganchar'

// 5 nov 2026, Daniel: «tarda en cargar el tiempo pensando, a veces no lo veo… tuve que reiniciar la app».
const sinDormir = async () => {}
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })

test('un 503 se reintenta con la conversación abierta, sin reiniciar la app', async () => {
  const respuestas = [() => json({}, 503), () => { throw new TypeError('sin red') }, () => json({ model: 'opus' })]
  const esperas: number[] = []
  const dato = await leerConReintento(async () => respuestas.shift()!(), new AbortController().signal, async (ms) => { esperas.push(ms) })
  assert.deepEqual(dato, { model: 'opus' })
  assert.deepEqual(esperas, ESPERAS_REINTENTO_MS.slice(0, 2))
})

test('un fallo definitivo no insiste', async () => {
  let pedidos = 0
  assert.equal(await leerConReintento(async () => { pedidos++; return json({}, 403) }, new AbortController().signal, sinDormir), null)
  assert.equal(pedidos, 1)
})

test('cambiar de conversación corta los reintentos', async () => {
  const c = new AbortController()
  let pedidos = 0
  const dato = await leerConReintento(async () => { pedidos++; c.abort(); return json({}, 503) }, c.signal, sinDormir)
  assert.equal(dato, null)
  assert.equal(pedidos, 1)
})

test('con el journal trabajando y el hilo sin respuesta, la pantalla lo dice', () => {
  assert.equal(turnoSinEnganchar({ estado: 'working', siguiendo: false, ultimo: { role: 'user' } }), true)
  assert.equal(turnoSinEnganchar({ estado: 'working', siguiendo: false, ultimo: undefined }), true)
  assert.equal(turnoSinEnganchar({ estado: 'working', siguiendo: false, ultimo: { role: 'assistant', streaming: true } }), true)
})

test('no estorba: enganchado, en espera de tu respuesta o con el turno ya contestado', () => {
  assert.equal(turnoSinEnganchar({ estado: 'working', siguiendo: true, ultimo: { role: 'user' } }), false)
  assert.equal(turnoSinEnganchar({ estado: 'waiting', siguiendo: false, ultimo: { role: 'user' } }), false)
  assert.equal(turnoSinEnganchar({ estado: undefined, siguiendo: false, ultimo: { role: 'user' } }), false)
  assert.equal(turnoSinEnganchar({ estado: 'working', siguiendo: false, ultimo: { role: 'assistant' } }), false)
})

test('resumeStream: un reenganche lento no bloquea otra conversación y tiene plazo para su primer evento', () => {
  const fuente = readFileSync('src/features/chat/hooks/useChat.ts', 'utf8')
  const cuerpo = fuente.slice(fuente.indexOf('const resumeStream = useCallback'), fuente.indexOf('const sendMessage = useCallback'))
  assert.match(cuerpo, /resumingRef\.current\?\.target === targetSessionId/)
  assert.match(cuerpo, /resumingRef\.current\?\.ac\.abort\(\)/)
  assert.match(cuerpo, /if \(!attached\) ac\.abort\(\), ?|if \(!attached\) ac\.abort\(\)/)
  assert.match(cuerpo, /clearTimeout\(plazoPrimerEvento\)/)
})
