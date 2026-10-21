import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { cuentasDeLimites, limitesDeRespuesta, textoObservado, textoReinicio } from '../../src/features/chat/lib/limites-plan'

// Forma real de GET /limits en el daemon aislado (2 oct 2026, 16:28).
const real = { account: 'default', engine: 'claude', plan: 'Max', reached: null, observedAt: '2026-10-02T22:28:27.273Z', source: 'claude-usage', available: true, reason: null,
  windows: [
    { id: 'session', label: 'Ventana de 5 h', percent: 4, resetsAt: '2026-10-02T23:10:00.164639+00:00', windowMinutes: 300 },
    { id: 'weekly_all', label: 'Semanal', percent: 66, resetsAt: '2026-10-04T23:00:00.164668+00:00', windowMinutes: 10080 },
  ] }

test('respuesta real: filas, % y fechas válidas', () => {
  const l = limitesDeRespuesta(real)
  assert.equal(l.available, true)
  assert.deepEqual(l.windows.map(w => [w.label, w.percent]), [['Ventana de 5 h', 4], ['Semanal', 66]])
  assert.notEqual(l.windows[0].resetsAt, null)
})

test('sin dato sigue sin dato: percent null, fecha inválida null, nada en cero', () => {
  const l = limitesDeRespuesta({ ...real, available: false, reason: 'x', windows: [{ id: 'session', label: 'Ventana de 5 h', percent: null, resetsAt: 'basura' }, { id: 'w', label: 'Semanal', percent: 140, resetsAt: null }] })
  assert.equal(l.available, false)
  assert.equal(l.windows[0].percent, null)
  assert.equal(l.windows[0].resetsAt, null)
  assert.equal(l.windows[1].percent, 100)
  assert.equal(limitesDeRespuesta({ ...real, windows: [] }).available, false)
  assert.throws(() => limitesDeRespuesta(null))
  assert.throws(() => limitesDeRespuesta({ windows: 'x' }))
})

test('reinicio con hora: menos de 24 h lleva hora y cuenta regresiva; más, día y hora', () => {
  const ahora = new Date('2026-10-02T22:28:00.000Z')
  assert.equal(textoReinicio('2026-10-02T23:10:00.164639+00:00', ahora, 'America/Mexico_City'), 'Reinicia 17:10 · en 43 min')
  assert.equal(textoReinicio('2026-10-03T01:30:00Z', ahora, 'America/Mexico_City'), 'Reinicia 19:30 · en 3 h 2 min')
  assert.equal(textoReinicio('2026-10-04T23:00:00Z', ahora, 'America/Mexico_City'), 'Reinicia dom 17:00')
  assert.equal(textoReinicio('2026-10-02T20:00:00Z', ahora), 'Reinicia ahora')
  assert.equal(textoReinicio(null, ahora), null)
  assert.equal(textoReinicio('no-es-fecha', ahora), null)
})

test('cuentas: Claude de la conversación o la de Daniel; Codex obligatorio solo si la conversación corre ahí', () => {
  assert.deepEqual(cuentasDeLimites('default'), { claude: 'default', codex: 'codex', codexEsLaConversacion: false })
  assert.deepEqual(cuentasDeLimites('bro'), { claude: 'bro', codex: 'codex', codexEsLaConversacion: false })
  assert.deepEqual(cuentasDeLimites('yt'), { claude: 'default', codex: 'yt', codexEsLaConversacion: true })
  assert.deepEqual(cuentasDeLimites('deepseek'), { claude: 'default', codex: 'codex', codexEsLaConversacion: false })
})

test('lectura vieja se nombra como vieja', () => {
  assert.equal(textoObservado('2026-10-02T22:00:00Z', new Date('2026-10-02T22:00:30Z')), 'Actualizado ahora')
  assert.equal(textoObservado('2026-10-02T22:00:00Z', new Date('2026-10-02T22:10:00Z')), 'Actualizado hace 10 min')
})
