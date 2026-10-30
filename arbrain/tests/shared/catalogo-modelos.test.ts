import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cabeEnConversacion, catalogoDeRespaldo, esModeloActual, formatoUsd, modelosDelSelector, precioPorMillon, type ModeloCatalogo } from '../../src/features/modelo/catalogo-modelos'

const m = (id: string, extra: Partial<ModeloCatalogo>): ModeloCatalogo => ({
  id, nombre: id, laboratorio: '', descripcion: '', puesto: null, via: 'openrouter', cuenta: id, modelo: id,
  openrouter: { id, existe: true, precio: null }, disponible: true, motivo: null, habilitado: true, ...extra,
})
const opus = m('opus-5.5', { nombre: 'Opus 5.5', via: 'suscripcion', cuenta: 'default', modelo: 'opus[1m]' })
const sonnet = m('sonnet-5.5', { nombre: 'Sonnet 5.5', via: 'suscripcion', cuenta: 'default', modelo: 'sonnet' })
const luna = m('gpt-6-luna', { nombre: 'GPT-6 Luna', cuenta: 'gpt-luna', modelo: 'openai/gpt-6-luna', openrouter: { id: 'openai/gpt-6-luna', existe: true, precio: { entrada: 0.1, salida: 0.5 } } })
const deepseek = m('deepseek-v4.1-flash', { nombre: 'DeepSeek V4.1 Flash', cuenta: 'deepseek', modelo: 'deepseek/deepseek-v4.1-flash' })

test('Claude cambia de modelo dentro de una conversación de Claude; otro motor abre una nueva', () => {
  assert.equal(cabeEnConversacion(sonnet, 'default'), true)
  assert.equal(cabeEnConversacion(sonnet, 'bro'), true)
  assert.equal(cabeEnConversacion(sonnet, 'deepseek'), false)
  assert.equal(cabeEnConversacion(luna, 'default'), false)
  assert.equal(cabeEnConversacion(luna, 'deepseek'), false)
  assert.equal(cabeEnConversacion(luna, 'gpt-luna'), true)
})

test('el modelo activo: por espacio en OpenRouter y por nombre en Claude', () => {
  assert.equal(esModeloActual(luna, 'gpt-luna', 'openai/gpt-6-luna'), true)
  assert.equal(esModeloActual(deepseek, 'gpt-luna', null), false)
  assert.equal(esModeloActual(opus, 'default', 'claude-opus-5-5[1m]'), true)
  assert.equal(esModeloActual(opus, 'default', 'opus[1m]'), true)
  assert.equal(esModeloActual(sonnet, 'default', 'claude-opus-5-5[1m]'), false)
  assert.equal(esModeloActual(opus, 'deepseek', 'claude-opus-5-5[1m]'), false)
})

test('el selector muestra solo lo encendido y disponible, Claude arriba', () => {
  const apagado = m('glm-5.3', { habilitado: false })
  const sinRuta = m('gemini-4-argon', { disponible: false, habilitado: true })
  const g = modelosDelSelector({ consultadoEn: '', errorOpenRouter: null, modelos: [opus, deepseek, apagado, sinRuta, sonnet, luna] })
  assert.deepEqual(g.claude.map(x => x.id), ['opus-5.5', 'sonnet-5.5'])
  assert.deepEqual(g.openrouter.map(x => x.id), ['deepseek-v4.1-flash', 'gpt-6-luna'])
})

test('precio por millón legible', () => {
  assert.equal(precioPorMillon(luna), '$0.10 / $0.50')
  assert.equal(precioPorMillon(deepseek), null)
  assert.equal(formatoUsd(0.015), '$0.015')
  assert.equal(formatoUsd(0.677), '$0.68')
  assert.equal(formatoUsd(4), '$4.00')
  assert.equal(formatoUsd(20), '$20')
})

test('sin catálogo en el servidor, el respaldo deja Opus y Sonnet y quita alias, Haiku y Fable', () => {
  const c = catalogoDeRespaldo([
    { value: 'opus[1m]', displayName: 'Opus (1M context)' }, { value: 'claude-fable-5-1[1m]', displayName: 'Fable' },
    { value: 'sonnet', displayName: 'Sonnet' }, { value: 'haiku', displayName: 'Haiku' }, { value: 'opus', displayName: 'Opus' }, { value: 'default', displayName: 'Default' },
  ])
  assert.deepEqual(c.modelos.map(x => [x.nombre, x.modelo]), [['Opus 5.5', 'opus[1m]'], ['Sonnet 5.5', 'sonnet']])
})
