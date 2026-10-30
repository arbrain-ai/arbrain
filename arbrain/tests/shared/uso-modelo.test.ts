import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { lineaUso, nombreEsfuerzo, nombreModelo, usoDeTurno } from '../../src/shared/lib/uso-modelo'
import { consumoDe, lineaConsumo } from '../../src/features/cabina/panel/consumo'

test('nombre de modelo único para los tres orígenes', () => {
  assert.equal(nombreModelo('claude-opus-5-5[1m]'), 'Opus 5.5')
  assert.equal(nombreModelo('gpt-6-sol'), 'GPT-6 Sol')
  assert.equal(nombreModelo('gpt-5.3-codex-spark'), 'GPT-5.3 Codex Spark')
  assert.equal(nombreModelo('deepseek/deepseek-v4.1-flash'), 'DeepSeek V4.1 Flash')
  assert.equal(nombreModelo('otro/modelo-x'), 'modelo-x')
  assert.equal(nombreModelo(''), null)
})

test('esfuerzo en palabras; sin dato no se pinta', () => {
  assert.equal(nombreEsfuerzo('low'), 'bajo')
  assert.equal(nombreEsfuerzo('xhigh'), 'muy alto')
  assert.equal(nombreEsfuerzo(null), null)
})

test('el turno del chat (cualquier motor) y el agente del panel dan la MISMA línea', () => {
  const chat = usoDeTurno({ model: 'deepseek/deepseek-v4.1-flash', effort: 'low', inputTokens: 18_000, outputTokens: 1_000, contextUsed: 19_000, contextTotal: 1_000_000 })
  assert.equal(lineaUso(chat), 'DeepSeek V4.1 Flash · bajo · 19 K tokens · 2 % de 1M')
  const conv = { harness: 'codex', modelo: 'deepseek/deepseek-v4.1-flash', esfuerzo: 'low', ctxPct: 2, ctxVentana: 1_000_000, turno: null, pregunta: false, tokens: 19_000, mensajes: [], titulo: null }
  assert.equal(lineaConsumo(consumoDe({ conversacion: conv })), lineaUso(chat))
})

test('sin fuente real no se inventa: sin esfuerzo, sin tokens, sin ventana', () => {
  assert.equal(lineaUso(usoDeTurno({ model: 'claude-sonnet-5-5', inputTokens: 0, outputTokens: 0 })), 'Sonnet 5.5')
  assert.deepEqual(usoDeTurno({ inputTokens: 10, outputTokens: 5, contextUsed: 100 }).contexto, null)
  assert.equal(lineaUso(usoDeTurno({})), null)
})
