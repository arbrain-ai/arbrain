// Selector de modelo (1 nov 2026): el punto de cada cuenta no inventa estado. Que nunca salga de la ventana lo prueba
// la primitiva de toda la barra (tests/chat/popover-anclado.test.ts) y, en la app real, scripts/qa/popovers-composer.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoDeCuenta } from '../../src/features/chat/lib/selector-modelo'
import type { LimitesPlan } from '../../src/features/chat/lib/limites-plan'

const limites = (over: Partial<LimitesPlan>): LimitesPlan => ({ account: 'default', engine: 'claude', plan: 'max', available: true, reason: null, windows: [], reached: null, observedAt: '2026-11-01T12:00:00Z', source: 'test', ...over })
const ventana = (percent: number | null, label = '5 h') => ({ id: label, label, percent, resetsAt: null, windowMinutes: 300 })

test('estado de cuenta: verde solo con lectura; ámbar cerca; rojo agotada; sin dato es sin dato', () => {
  assert.equal(estadoDeCuenta(null).estado, 'sin-dato')
  assert.equal(estadoDeCuenta(limites({ available: false, reason: 'Sin sesión' })).detalle, 'Sin sesión')
  assert.equal(estadoDeCuenta(limites({ windows: [ventana(12), ventana(40, 'semana')] })).estado, 'lista')
  assert.match(estadoDeCuenta(limites({ windows: [ventana(12), ventana(40, 'semana')] })).detalle, /40 % usado \(semana\)/)
  assert.equal(estadoDeCuenta(limites({ windows: [ventana(91)] })).estado, 'cerca')
  assert.equal(estadoDeCuenta(limites({ windows: [ventana(100)] })).estado, 'agotada')
  assert.equal(estadoDeCuenta(limites({ windows: [ventana(20)], reached: 'five_hour' })).estado, 'agotada')
  assert.equal(estadoDeCuenta(limites({ windows: [ventana(null)] })).detalle, 'Sesión activa')
})

test('el selector usa la primitiva anclada al chip, con lista de scroll interno y pista única de otro motor', () => {
  const picker = readFileSync(new URL('../../src/features/chat/components/ModelPicker.tsx', import.meta.url), 'utf8')
  assert.match(picker, /<PopoverAnclado[\s\S]*ancla=\{ancla\}/)
  assert.match(picker, /className=\{css\.lista\} data-popover-scroll/)
  assert.ok(!/w-full bg-card\/96/.test(picker), 'ya no ocupa todo el ancho del chat')
  assert.equal(picker.match(/Otro motor: abre una conversación nueva<\/p>/g)?.length, 1)
  const chat = readFileSync(new URL('../../src/features/chat/components/ChatPanel.tsx', import.meta.url), 'utf8')
  assert.match(chat, /ancla=\{modelChipRef\}/)
  assert.match(chat, /ref=\{modelChipRef\}/)
})
