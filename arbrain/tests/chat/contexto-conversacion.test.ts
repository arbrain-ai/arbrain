import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { contextoDeConversacion, detalleTurno, nivelPct, textoPct } from '../../src/features/chat/lib/contexto-conversacion'

const turno = { costUsd: 0.3253, inputTokens: 520, outputTokens: 4_000, durationMs: 39_600, contextUsed: 80_000, contextTotal: 1_000_000, model: 'claude-opus-5-5[1m]', effort: 'high' }

test('el contexto sale del último turno terminado que lo trae', () => {
  const viejo = { ...turno, contextUsed: 10_000 }
  const c = contextoDeConversacion([
    { role: 'user' }, { role: 'assistant', usage: viejo },
    { role: 'user' }, { role: 'assistant', usage: turno },
    { role: 'user' }, { role: 'assistant', streaming: true },
  ])
  assert.ok(c)
  assert.equal(c.pct, 8)
  assert.equal(c.ventana, 1_000_000)
  assert.equal(c.linea, 'Opus 5.5 · alto · 5 K tokens · 8 % de 1M')
})

test('un turno en curso no borra el dato anterior; sin turnos con dato, nada', () => {
  assert.equal(contextoDeConversacion([]), null)
  assert.equal(contextoDeConversacion([{ role: 'user' }, { role: 'assistant' }]), null)
  assert.equal(contextoDeConversacion([{ role: 'assistant', usage: {} }]), null)
  const enCurso = contextoDeConversacion([{ role: 'assistant', usage: turno }, { role: 'assistant', streaming: true, usage: { ...turno, contextUsed: 900_000 } }])
  assert.equal(enCurso?.pct, 8)
})

test('sin ventana reportada no se inventa el %', () => {
  const c = contextoDeConversacion([{ role: 'assistant', usage: { inputTokens: 30_000, outputTokens: 900, model: 'gpt-6-astra' } }])
  assert.equal(c?.pct, null)
  assert.equal(c?.linea, 'GPT-6 Astra · 31 K tokens')
})

test('porcentaje, semáforo y desglose del turno para la hora', () => {
  assert.equal(textoPct(0.4), '<1 %')
  assert.equal(textoPct(8.4), '8 %')
  assert.equal(nivelPct(null), 'sin-dato')
  assert.equal(nivelPct(75), 'aviso')
  assert.equal(nivelPct(92), 'alto')
  assert.equal(detalleTurno(turno), '520 entrada · 4 K salida · 39.6 s · $0.3253')
  assert.equal(detalleTurno({ inputTokens: 100, outputTokens: 0, costUsd: 0 }), '100 entrada')
  assert.equal(detalleTurno(undefined), null)
  assert.equal(detalleTurno({}), null)
})
