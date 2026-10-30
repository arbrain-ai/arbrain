import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { restoreTurnPair } from '../../src/features/chat/lib/durable-recovery'
import { resumenDespertadores } from '../../src/features/chat/components/DespertadoresAviso'
import { esRecomendada, etiquetaVisible } from '../../src/features/chat/components/QuestionCard'
import type { ChatMessage } from '../../src/features/chat/hooks/useChat'

const previo: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'lanza un sleep 20 en segundo plano', timestamp: new Date(0), metadata: { turnId: 't1' } },
  { id: 'a1', role: 'assistant', content: 'Listo, te aviso cuando termine.', timestamp: new Date(1), metadata: { turnId: 't1' } },
]

test('respuesta espontánea: se pinta solo la respuesta de Levy, sin burbuja inventada de Daniel', () => {
  const out = restoreTurnPair(previo, { turnId: 't2', userMessage: 'Aviso: «sleep 20» terminó', startedAt: 5, protocol: 'durable-v1', origen: { tipo: 'espontanea', etiqueta: 'Aviso: «sleep 20» terminó' } }, 'a-2', 'u-2')
  assert.equal(out.length, 3)
  assert.equal(out[2].role, 'assistant')
  assert.equal(out[2].metadata?.origen?.tipo, 'espontanea')
  assert.equal(out.filter(m => m.role === 'user').length, 1)
})

test('despertador: el mensaje que lo dispara queda marcado como del despertador', () => {
  const out = restoreTurnPair(previo, { turnId: 't3', userMessage: '[Despertador d-1] corre la QA', startedAt: 5, protocol: 'durable-v1', origen: { tipo: 'despertador', etiqueta: 'corre la QA', despertadorId: 'd-1' } }, 'a-3', 'u-3')
  assert.equal(out.length, 4)
  assert.equal(out[2].role, 'user')
  assert.equal(out[2].metadata?.origen?.tipo, 'despertador')
})

test('aviso de despertadores: cuenta los pendientes y dice el próximo', () => {
  assert.equal(resumenDespertadores([]), null)
  const base = Date.parse('2026-10-03T20:05:00Z') // 14:05 México
  const r = resumenDespertadores([
    { id: 'b', texto: 'luego', dueAt: base + 3600_000, cadaMs: null, restantes: null, estado: 'pendiente' },
    { id: 'a', texto: 'primero', dueAt: base, cadaMs: null, restantes: null, estado: 'pendiente' },
    { id: 'c', texto: 'viejo', dueAt: base - 1, cadaMs: null, restantes: null, estado: 'hecho' },
  ])
  assert.match(r ?? '', /^2 despertadores · el próximo a las 0?2:05/)
})

test('opción recomendada: insignia sin tocar la etiqueta que viaja al modelo', () => {
  assert.equal(esRecomendada('Verde (Recommended)'), true)
  assert.equal(esRecomendada('Verde (recomendada)'), true)
  assert.equal(esRecomendada('Verde'), false)
  assert.equal(etiquetaVisible('Verde (Recommended)'), 'Verde')
})
