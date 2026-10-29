// El Mes resume cada semana sin nombres de personas (28 oct 2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumenSemana, tipoDe } from '../../src/features/planning/mes-resumen'

test('la S1 de la cohorte: los diagnósticos son uno a uno, el periodo no se cuenta, sin nombres', () => {
  const r = resumenSemana([
    { titulo: 'Uno a uno · al cerrar la etapa · tu cerebro (S1)', variosDias: true },
    { titulo: 'Diagnóstico · Persona Uno · Cerebro Artificial', variosDias: false },
    { titulo: '🎓 Demo day · Tu cerebro (viernes de S1)', variosDias: false },
    ...['Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete'].map(n => ({ titulo: `Diagnóstico · Persona ${n} · Cerebro Artificial`, variosDias: false })),
  ])
  assert.equal(r, '7 uno a uno · demo day')
  assert.ok(!/persona/i.test(r!))
})

test('tipos, vacío y tope', () => {
  assert.equal(tipoDe('✈️ Monterrey: premio del monk mode'), 'monterrey')
  assert.equal(tipoDe('Masterclass'), 'masterclass')
  assert.equal(resumenSemana([]), null)
  assert.equal(resumenSemana('abcdef'.split('').map(t => ({ titulo: t, variosDias: false }))), 'a · b · c · d · +2')
})
