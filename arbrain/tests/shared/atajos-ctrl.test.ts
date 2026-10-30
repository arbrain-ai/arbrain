import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { accionCtrl, cedeAlCampo, type TeclaCtrl } from '../../src/shared/navigation/atajos-ctrl'
import { ATAJOS_SHELL, filtrarAtajos } from '../../src/shared/navigation/atajos'
import { calendarAction } from '../../src/features/planning/shortcuts'

const ctrl = (code: string, extra: Partial<TeclaCtrl> = {}): TeclaCtrl => ({ code, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...extra })

test('Ctrl+D/X/W/M van al Calendario en Día, 4 días, Semana y Mes; Ctrl+Q cierra la pestaña', () => {
  assert.deepEqual(accionCtrl(ctrl('KeyD')), { tipo: 'calendario', modo: 'day' })
  assert.equal(accionCtrl(ctrl('KeyX')), null, 'Ctrl+X quedó libre al retirar 4 días')
  assert.deepEqual(accionCtrl(ctrl('KeyW')), { tipo: 'calendario', modo: 'week' })
  assert.deepEqual(accionCtrl(ctrl('KeyM')), { tipo: 'calendario', modo: 'month' })
  assert.deepEqual(accionCtrl(ctrl('KeyQ')), { tipo: 'cerrar-pestana' })
})

test('solo Ctrl a secas: ⌘D (duplicar en el lienzo), ⌘X (cortar), ⌃⇧D y ⌃⌥D no son estos atajos', () => {
  assert.equal(accionCtrl(ctrl('KeyD', { ctrlKey: false, metaKey: true })), null)
  assert.equal(accionCtrl(ctrl('KeyX', { metaKey: true })), null)
  assert.equal(accionCtrl(ctrl('KeyD', { shiftKey: true })), null)
  assert.equal(accionCtrl(ctrl('KeyD', { altKey: true })), null)
  assert.equal(accionCtrl(ctrl('KeyD', { isComposing: true })), null)
  assert.equal(accionCtrl(ctrl('KeyA')), null)
  assert.equal(accionCtrl(ctrl('KeyE')), null)
  assert.equal(accionCtrl(ctrl('KeyK')), null)
  assert.equal(accionCtrl(ctrl('Digit1')), null)
})

test('Ctrl+D cede al campo solo si borraría algo: selección o texto delante del cursor', () => {
  const dia = accionCtrl(ctrl('KeyD'))!
  assert.equal(cedeAlCampo(dia, null), false)
  assert.equal(cedeAlCampo(dia, { inicio: 0, fin: 0, largo: 0 }), false)
  assert.equal(cedeAlCampo(dia, { inicio: 5, fin: 5, largo: 5 }), false)
  assert.equal(cedeAlCampo(dia, { inicio: 2, fin: 2, largo: 5 }), true)
  assert.equal(cedeAlCampo(dia, { inicio: 1, fin: 5, largo: 5 }), true)
  for (const code of ['KeyW', 'KeyM', 'KeyQ']) assert.equal(cedeAlCampo(accionCtrl(ctrl(code))!, { inicio: 2, fin: 4, largo: 9 }), false, code)
})

test('las teclas sueltas del Calendario (D·4·S·M) no reaccionan a Ctrl+letra', () => {
  for (const key of ['d', 'x', 'w', 'm', 'q']) assert.equal(calendarAction({ key, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), null, key)
})

test('la hoja de atajos y Configuración › Atajos los muestran', () => {
  const g = ATAJOS_SHELL.find(x => x.id === 'calendario-ctrl')!
  assert.deepEqual(g.atajos.map(a => a.teclas.join('+')), ['Ctrl+D', 'Ctrl+W', 'Ctrl+M', 'Ctrl+Q', 'Ctrl+L', 'Ctrl+H'], 'Ctrl+X quedó libre')
  assert.ok(filtrarAtajos(ATAJOS_SHELL, 'cerrar la pestaña activa').some(x => x.id === 'calendario-ctrl'))
})

test('Ctrl+L abre el selector de lienzos; con ⌘, ⌥ o ⇧ no; y nunca cede a un campo (no borra nada)', () => {
  assert.deepEqual(accionCtrl(ctrl('KeyL')), { tipo: 'selector-lienzo' })
  assert.equal(accionCtrl(ctrl('KeyL', { metaKey: true })), null, '⌘L es la barra de direcciones del navegador')
  assert.equal(accionCtrl(ctrl('KeyL', { shiftKey: true })), null)
  assert.equal(accionCtrl(ctrl('KeyL', { altKey: true })), null)
  assert.equal(cedeAlCampo(accionCtrl(ctrl('KeyL'))!, { inicio: 2, fin: 4, largo: 9 }), false)
})

test('Ctrl+H abre Hábitos de hoy; cede al campo solo si borraría algo hacia atrás', () => {
  const h = accionCtrl(ctrl('KeyH'))!
  assert.deepEqual(h, { tipo: 'habitos' })
  assert.equal(accionCtrl(ctrl('KeyH', { metaKey: true })), null, '⌘⌃H y ⌘H siguen siendo de la barra y de macOS')
  assert.equal(accionCtrl(ctrl('KeyH', { shiftKey: true })), null)
  assert.equal(cedeAlCampo(h, null), false)
  assert.equal(cedeAlCampo(h, { inicio: 0, fin: 0, largo: 0 }), false, 'campo vacío: gana el atajo')
  assert.equal(cedeAlCampo(h, { inicio: 0, fin: 0, largo: 7 }), false, 'cursor al inicio: no hay nada que borrar')
  assert.equal(cedeAlCampo(h, { inicio: 3, fin: 3, largo: 7 }), true)
  assert.equal(cedeAlCampo(h, { inicio: 1, fin: 4, largo: 7 }), true)
  assert.equal(calendarAction({ key: 'h', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), null)
})
