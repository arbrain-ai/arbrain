// Humo de instaladores (13 oct 2026), hallazgo 2: la llave rechazada en el chat del alumno ya no es «Failed to
// authenticate. API Error: 401» a los 3 minutos; es un aviso en español con el atajo a Ajustes › Llaves.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esLlaveRechazada, mensajeFalloDeCuenta, turnoSinCredito } from '../../src/features/primer-arranque/lib/sin-saldo'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

test('chat: el aviso del daemon por llave rechazada se reconoce; el de sin crédito sigue yendo a «Recargar»', () => {
  const llave = mensajeFalloDeCuenta('llave_invalida', 'openrouter', 'API Error: 401 (authentication_failed)')
  assert.ok(esLlaveRechazada({ error: true, diagnostic: llave }))
  assert.ok(!turnoSinCredito({ error: true, diagnostic: llave, content: llave }), 'una llave rechazada no es falta de crédito')
  const saldo = mensajeFalloDeCuenta('sin_saldo', 'openrouter', 'API Error: 402 (billing_error)')
  assert.ok(turnoSinCredito({ error: true, diagnostic: saldo, content: saldo }))
  assert.ok(!esLlaveRechazada({ error: true, diagnostic: saldo }))
  assert.ok(!esLlaveRechazada({ error: false, diagnostic: llave }), 'sin error no hay aviso')
  assert.ok(!esLlaveRechazada({ error: true, diagnostic: 'El turno murió del lado del agente: Failed to authenticate. API Error: 401' }), 'solo el aviso del daemon nuevo, no el texto crudo')
})

// 22 oct 2026 (prueba en Windows, punto 11): sin llave ni sesión también va al mismo aviso con atajo a Ajustes › Llaves.
test('chat: solo en la edición cliente y después del caso «sin crédito»', () => {
  const chat = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.match(chat, /msg\.error && EDICION_CLIENTE && turnoSinCredito\(msg\) \? \([\s\S]*?\) : msg\.error && EDICION_CLIENTE && \(esLlaveRechazada\(msg\) \|\| esFaltaLlave\(msg\)\) \? \(\s*\/\/[^\n]*\n\s*<LlaveEnChat diagnostico=/)
  const c = fuente('src/features/primer-arranque/components/LlaveEnChat.tsx')
  assert.match(c, /useAjustes\.getState\(\)\.abrir\('llaves'\)/)
  assert.match(c, /Abrir Ajustes › Llaves/)
  assert.match(c, /Detalle técnico/)
})
