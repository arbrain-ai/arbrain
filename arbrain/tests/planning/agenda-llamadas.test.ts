import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bloquesDelDia } from '../../src/features/planning/dia-vivo'
import { esVentana, nombreDeBrief, nombreDeLlamada, ordenarAgenda } from '../../src/features/planning/agenda-llamadas'
import type { PlanEvent } from '../../src/features/planning/types'

// Lun 19 oct 2026, la semana de llamadas del HT (Daniel 18 oct: la rejilla del Día ilegible en tres columnas).
const dia = new Date(2026, 9, 19)
const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m).toISOString()
const ev = (id: string, title: string, start: string, end: string): PlanEvent => ({ id, externalId: id, kind: 'event', sourceId: 'cal', account: 'a', calendarId: 'cal', title, description: '', location: '', start, end, allDay: false, timeZone: null, etag: null, recurringEventId: null, recurrence: [], editable: true } as unknown as PlanEvent)

test('lee el nombre de la llamada y del brief, y reconoce las ventanas de disponibilidad', () => {
  assert.equal(nombreDeLlamada('📞 Llamada · Persona Uno · Cerebro Artificial'), 'Persona Uno')
  assert.equal(nombreDeLlamada('📞 Llamada · Persona  Dos · Cerebro Artificial'), 'Persona Dos')
  assert.equal(nombreDeLlamada('📞 Llamadas con aplicantes'), null)
  assert.equal(nombreDeLlamada('GYM'), null)
  assert.equal(nombreDeBrief('📋 Brief · Persona Uno'), 'Persona Uno')
  assert.ok(esVentana('📞 Llamadas con aplicantes'))
  assert.ok(esVentana('📞 Ventana de venta HT · llamadas con aplicantes (17–20 oct)'))
  assert.ok(!esVentana('📞 Llamada · Persona Uno · Cerebro Artificial'))
})

test('la ventana va de fondo, el brief se pliega en su llamada y la tarjeta dice el nombre', () => {
  const eventos = [
    ev('v1', '📞 Llamadas con aplicantes', at(10), at(14, 30)),
    ev('v2', '📞 Llamadas con aplicantes', at(15, 15), at(19, 45)),
    ev('l1', '📞 Llamada · Persona Uno · Cerebro Artificial', at(10), at(10, 45)),
    ev('b1', '📋 Brief · Persona Uno', at(10), at(10, 45)),
    ev('l2', '📞 Llamada · Persona  Dos · Cerebro Artificial', at(13), at(13, 45)),
    ev('b2', '📋 Brief · Persona Dos', at(13), at(13, 45)),
    ev('b3', '📋 Brief · Sin Llamada', at(16), at(16, 30)),
    ev('g', 'GYM', at(7), at(9)),
  ]
  const { conHora } = bloquesDelDia(eventos, dia, () => true, () => null)
  const { bloques, bandas } = ordenarAgenda(conHora)
  assert.deepEqual(bandas.map(b => b.id).sort(), ['v1', 'v2'])
  assert.deepEqual(bloques.map(b => b.id), ['g', 'l1', 'l2', 'b3'])
  const l1 = bloques.find(b => b.id === 'l1')!
  assert.equal(l1.corto, 'Persona Uno')
  assert.equal(l1.brief?.id, 'b1')
  assert.equal(l1.titulo, '📞 Llamada · Persona Uno · Cerebro Artificial')
  assert.equal(bloques.find(b => b.id === 'l2')!.brief?.id, 'b2')
  assert.equal(bloques.find(b => b.id === 'b3')!.brief, undefined)
})

test('un brief de otra persona o a otra hora no se pliega', () => {
  const { conHora } = bloquesDelDia([
    ev('l1', '📞 Llamada · Persona Cinco · Cerebro Artificial', at(10), at(10, 45)),
    ev('b1', '📋 Brief · Persona Seis', at(10), at(10, 45)),
    ev('b2', '📋 Brief · Persona Cinco', at(12), at(12, 30)),
  ], dia, () => true, () => null)
  assert.deepEqual(ordenarAgenda(conHora).bloques.map(b => b.id), ['l1', 'b1', 'b2'])
})

test('la agenda del Día no es una caja con scroll propio con ningún puntero (Daniel 18 oct: «desde el móvil no puedo bajar»; 21 oct: «sigue sin funcionar el scroll solo si agarro la scrollbar»)', () => {
  const css = readFileSync(new URL('../../src/features/planning/dia-vivo.module.css', import.meta.url), 'utf8')
  const caja = css.match(/\.miniCaja \{([^}]*)\}/g) ?? []
  assert.ok(caja.length > 0, 'existe la regla .miniCaja')
  // Una caja anidada con overflow y overscroll-behavior: contain se queda con la rueda aunque no tenga nada que desplazar.
  for (const regla of caja) {
    assert.doesNotMatch(regla, /overflow(-y)?:\s*(auto|scroll)/, regla)
    assert.doesNotMatch(regla, /overscroll-behavior:\s*(contain|none)/, regla)
    assert.doesNotMatch(regla, /max-height/, regla)
  }
})

test('la línea de ahora del Día es la de «Tu día» (compuesta, no copiada)', () => {
  const css = readFileSync(new URL('../../src/features/planning/dia-vivo.module.css', import.meta.url), 'utf8')
  assert.match(css, /\.mini > \.miniAhora \{ position: absolute;/)
  assert.doesNotMatch(css, /\.miniAhora[^{]*\{[^}]*(border-top|background)/, 'sin trazo propio: el trazo es el de lineaAhora')
  const tsx = readFileSync(new URL('../../src/features/planning/AgendaMini.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /import luz from '@\/features\/cabina\/luz\.module\.css'/)
  assert.match(tsx, /className=\{`\$\{luz\.lineaAhora\} \$\{d\.miniAhora\}`\}/)
  const luz = readFileSync(new URL('../../src/features/cabina/luz.module.css', import.meta.url), 'utf8')
  assert.match(luz, /\.lineaAhora::after \{[^}]*linear-gradient\(90deg, var\(--gold\), rgba\(var\(--gold-rgb\), 0\)\)/)
})
