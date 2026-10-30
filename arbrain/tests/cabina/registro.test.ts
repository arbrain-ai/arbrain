import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrar, lineaEvento, nombreEvento } from '../../src/features/cabina/panel/registro-eventos'
import type { OpsEvent } from '../../src/features/ops/hooks/useOpsLogs'

const ev = (type: OpsEvent['type'], data: Record<string, unknown> = {}, source: OpsEvent['source'] = 'web'): OpsEvent => ({ id: `${type}-${Math.random()}`, type, timestamp: 0, source, data })

test('los filtros del registro separan turnos, errores y rutinas; las herramientas solo en Todo', () => {
  const todos = [ev('session_start'), ev('tool_start'), ev('tool_done'), ev('agent_result'), ev('tool_error'), ev('cron_start', {}, 'cron'), ev('cron_error', {}, 'cron'), ev('rate_limit')]
  assert.deepEqual(filtrar(todos, 'turnos').map(e => e.type), ['session_start', 'agent_result', 'rate_limit'])
  assert.deepEqual(filtrar(todos, 'errores').map(e => e.type), ['tool_error', 'cron_error', 'rate_limit'])
  assert.deepEqual(filtrar(todos, 'rutinas').map(e => e.type), ['cron_start', 'cron_error'])
  assert.equal(filtrar(todos, 'todo').length, todos.length)
})

test('cada evento se dice en español y sin ceros inventados', () => {
  assert.deepEqual(nombreEvento({ type: 'agent_result' }), ['Terminó el turno', 'bien'])
  assert.equal(lineaEvento(ev('agent_result', { costUsd: 0.4321, inputTokens: 12500, outputTokens: 800, durationMs: 42000, numTurns: 6 })), 'US$0.43 · 12.5 k entrada · 800 salida · 42.0 s · 6 pasos')
  assert.equal(lineaEvento(ev('agent_result', {})), '')
  assert.equal(lineaEvento(ev('tool_done', { toolName: 'Bash', durationMs: 350 })), 'Bash · 350 ms')
  assert.equal(lineaEvento(ev('cron_error', { jobId: 'p2', error: 'timeout' })), 'p2 · timeout')
})

test('el modelo se dice como lo dice el dueño: Opus 5.5, no claude-opus-5-5', async () => {
  const { modeloLegible, lineaEvento } = await import('../../src/features/cabina/panel/registro-eventos')
  assert.equal(modeloLegible('claude-opus-5-5'), 'Opus 5.5')
  assert.equal(modeloLegible('claude-sonnet-5-5'), 'Sonnet 5.5')
  assert.equal(modeloLegible('gpt-5'), 'gpt-5')
  assert.equal(lineaEvento({ type: 'session_start', data: { model: 'claude-opus-5-5', prompt: 'hola' } }), 'Opus 5.5 · hola')
})
