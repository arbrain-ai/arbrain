import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { consumoDe, lineaConsumo, nombreModelo, tokensCortos, tokensCreibles } from '../../src/features/cabina/panel/consumo'

test('modelo legible: Claude por familia y versión; GPT y DeepSeek con su nombre', () => {
  assert.equal(nombreModelo('claude-sonnet-5-5'), 'Sonnet 5.5')
  assert.equal(nombreModelo('claude-opus-5-5[1m]'), 'Opus 5.5')
  assert.equal(nombreModelo('claude-haiku-4-5-20251001'), 'Haiku 4.5')
  assert.equal(nombreModelo('gpt-5.5-codex'), 'GPT-5.5 Codex') // formato único chat y panel (2 oct 2026)
  assert.equal(nombreModelo(null), null)
})

test('tokens cortos', () => {
  assert.equal(tokensCortos(167_583), '168 K'); assert.equal(tokensCortos(1_250_000), '1.3 M'); assert.equal(tokensCortos(950), '950')
})

test('la conversación manda; sin fuente no se pinta nada; la ventana solo si la trae la fuente', () => {
  const conv = { harness: 'claude', modelo: 'claude-sonnet-5-5', ctxPct: 19.4, ctxVentana: 1_000_000, turno: null, pregunta: false, tokens: 167_583, mensajes: [], titulo: null }
  assert.equal(lineaConsumo(consumoDe({ conversacion: conv })), 'Sonnet 5.5 · 168 K tokens · 19 % de 1M')
  assert.equal(lineaConsumo(consumoDe({ conversacion: { ...conv, ctxVentana: null } })), 'Sonnet 5.5 · 168 K tokens · 19 % de contexto')
  const sub = { id: 1, nombre: 'x', harness: 'claude', encargo: '', cwd: '/tmp', creado: '', modelo: 'claude-opus-5-5', tokens: 0 }
  assert.equal(lineaConsumo(consumoDe({ subagente: sub })), 'Opus 5.5') // 0 tokens = sin medir, no «0 tokens»
  assert.equal(lineaConsumo(consumoDe({})), null)
})

test('tokens que contradicen al contexto no se pintan (la suma de un pedazo del transcript)', () => {
  assert.equal(tokensCreibles(7_830, 54, 'claude-opus-5-5', null), null)
  assert.equal(tokensCreibles(1_124_991, 54, 'claude-opus-5-5', null), 1_124_991)
  assert.equal(tokensCreibles(177_000, 25, 'claude-sonnet-5-5', null), null) // 250 K en contexto: faltan más de 60 K
  assert.equal(tokensCreibles(204_000, 18, 'claude-opus-5-5', null), 204_000)
  assert.equal(tokensCreibles(50_000, 30, 'gpt-5.5-codex', null), 50_000) // sin ventana conocida no se juzga
})
