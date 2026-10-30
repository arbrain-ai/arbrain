import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inicioDeChatNuevo, espacioVigente } from '../../src/features/modelo/modelo-inicial'
import type { Catalogo, ModeloCatalogo } from '../../src/features/modelo/catalogo-modelos'

const m = (id: string, extra: Partial<ModeloCatalogo>): ModeloCatalogo => ({
  id, nombre: id, laboratorio: '', descripcion: '', puesto: null, via: 'openrouter', cuenta: id, modelo: id,
  openrouter: { id, existe: true, precio: null }, disponible: true, motivo: null, habilitado: true, ...extra,
})
const opus = m('opus-5.5', { nombre: 'Opus 5.5', via: 'suscripcion', cuenta: 'default', modelo: 'claude-opus-5-5[1m]' })
const sonnet = m('sonnet-5.5', { nombre: 'Sonnet 5.5', via: 'suscripcion', cuenta: 'default', modelo: 'claude-sonnet-5-5[1m]' })
const luna = m('gpt-6-luna', { nombre: 'GPT-6 Luna', cuenta: 'gpt-luna', modelo: 'openai/gpt-6-luna' })
const deepseek = (habilitado: boolean) => m('deepseek-v4.1-flash', { nombre: 'DeepSeek V4.1 Flash', cuenta: 'deepseek', habilitado })
const cat = (...modelos: ModeloCatalogo[]): Catalogo => ({ consultadoEn: '', errorOpenRouter: null, modelos })

test('nace con el último modelo usado', () => {
  const c = cat(opus, sonnet, luna, deepseek(false))
  assert.deepEqual(inicioDeChatNuevo(c, { motor: 'default', modelo: 'claude-opus-5-5[1m]' }), { cuenta: 'default', modelo: 'claude-opus-5-5[1m]', cayo: false })
  assert.deepEqual(inicioDeChatNuevo(c, { motor: 'gpt-luna', modelo: null }), { cuenta: 'gpt-luna', modelo: null, cayo: false })
})

test('un modelo deshabilitado jamás es el arranque: cae al primer habilitado del orden de Configuración', () => {
  const c = cat(opus, sonnet, luna, deepseek(false))
  const r = inicioDeChatNuevo(c, { motor: 'deepseek', modelo: null })
  assert.equal(r.cayo, true)
  assert.equal(r.cuenta, 'default')
})

test('sin Claude encendido, cae al primero de OpenRouter encendido, nunca al apagado', () => {
  const c = cat(m('opus-5.5', { via: 'suscripcion', cuenta: 'default', habilitado: false }), deepseek(false), luna)
  assert.equal(inicioDeChatNuevo(c, null).cuenta, 'gpt-luna')
  assert.equal(inicioDeChatNuevo(c, { motor: 'deepseek', modelo: null }).cuenta, 'gpt-luna')
})

test('un modelo de Claude apagado recordado cae al primer Claude encendido', () => {
  const c = cat(m('opus-5.5', { nombre: 'Opus 5.5', via: 'suscripcion', cuenta: 'default', modelo: 'claude-opus-5-5[1m]', habilitado: false }), sonnet, luna)
  const r = inicioDeChatNuevo(c, { motor: 'default', modelo: 'claude-opus-5-5[1m]' })
  assert.deepEqual(r, { cuenta: 'default', modelo: 'claude-sonnet-5-5[1m]', cayo: true })
})

test('sin catálogo no se decide nada; el espacio guardado apagado no es vigente', () => {
  assert.equal(inicioDeChatNuevo(null, { motor: 'deepseek', modelo: null }).cuenta, null)
  const c = cat(opus, deepseek(false))
  assert.equal(espacioVigente(c, 'deepseek'), false)
  assert.equal(espacioVigente(c, 'default'), true)
  assert.equal(espacioVigente(null, 'deepseek'), true)
})
