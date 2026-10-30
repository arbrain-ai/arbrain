import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { controlesIniciales, guardarPreferencia, leerPreferencia, normalizar } from './preferencia.js'
import { ScopedControls } from '../chat-runtime/scoped-controls.js'

function db() {
  const d = new Database(':memory:')
  d.exec('CREATE TABLE chat_overrides (session_key TEXT PRIMARY KEY, model TEXT, effort TEXT, fast INTEGER, ultracode INTEGER, updated_at INTEGER)')
  return d
}
const fuente = (key: string) => ({ key, verifiedConversation: true })

describe('preferencia del motor de conversaciones nuevas', () => {
  it('vacía por defecto: nada cambia', () => {
    const d = db()
    expect(leerPreferencia(d)).toEqual({ motor: null, modelo: null, esfuerzo: null })
    expect(controlesIniciales(d, 'default')).toBeNull()
    const row = new ScopedControls(d).read({ owner: 'o', account: 'default', conversationId: 'c1' }, fuente('c1'))
    expect(row).toMatchObject({ model: null, effort: null })
  })

  it('una conversación nueva del motor elegido nace con su modelo y esfuerzo; otro motor no cambia', () => {
    const d = db()
    guardarPreferencia(d, { motor: 'deepseek', modelo: 'deepseek/deepseek-v4.1-flash', esfuerzo: 'low' })
    const controls = new ScopedControls(d)
    expect(controls.read({ owner: 'o', account: 'deepseek', conversationId: 'c1' }, fuente('c1'))).toMatchObject({ model: 'deepseek/deepseek-v4.1-flash', effort: 'low' })
    expect(controls.read({ owner: 'o', account: 'codex', conversationId: 'c2' }, fuente('c2'))).toMatchObject({ model: null, effort: null })
  })

  it('una conversación existente nunca cambia', () => {
    const d = db()
    const controls = new ScopedControls(d)
    controls.read({ owner: 'o', account: 'codex', conversationId: 'vieja' }, fuente('vieja'))
    guardarPreferencia(d, { motor: 'codex', modelo: 'gpt-6-sol', esfuerzo: 'high' })
    expect(controls.read({ owner: 'o', account: 'codex', conversationId: 'vieja' }, fuente('vieja'))).toMatchObject({ model: null, effort: null })
  })

  it('el «chat nuevo» sigue la preferencia salvo que tenga una elección manual pendiente', () => {
    const d = db()
    const controls = new ScopedControls(d)
    controls.read({ owner: 'o', account: 'codex', conversationId: null }, fuente(''))
    controls.read({ owner: 'p', account: 'codex', conversationId: null }, fuente(''))
    controls.patch({ owner: 'p', account: 'codex', conversationId: null }, fuente(''), { model: 'gpt-5.5' })
    guardarPreferencia(d, { motor: 'codex', modelo: 'gpt-6-sol', esfuerzo: 'high' })
    expect(controls.read({ owner: 'o', account: 'codex', conversationId: null }, fuente(''))).toMatchObject({ model: 'gpt-6-sol', effort: 'high' })
    expect(controls.read({ owner: 'p', account: 'codex', conversationId: null }, fuente(''))).toMatchObject({ model: 'gpt-5.5' })
    // Volver a «como estaba» devuelve el chat nuevo a lo de la cuenta.
    guardarPreferencia(d, { motor: null, modelo: null, esfuerzo: null })
    expect(controls.read({ owner: 'o', account: 'codex', conversationId: null }, fuente(''))).toMatchObject({ model: null, effort: null })
  })

  it('un JSON dañado o un motor desconocido se leen como vacío', () => {
    expect(normalizar({ motor: 'inexistente', modelo: 'x' })).toEqual({ motor: null, modelo: null, esfuerzo: null })
    expect(normalizar('basura')).toEqual({ motor: null, modelo: null, esfuerzo: null })
    expect(normalizar({ motor: 'default', modelo: 'default', esfuerzo: 'xhigh' })).toEqual({ motor: 'default', modelo: null, esfuerzo: 'xhigh' })
  })
})
