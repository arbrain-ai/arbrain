import test from 'node:test'
import assert from 'node:assert/strict'
import { compromisosDelDia, conEntregable, diasHasta, entregablesDe, estadoSemana, hitosDelRegistro } from '../../src/features/planning/claridad'
import type { Bloque } from '../../src/features/planning/dia-vivo'
import type { PlanEvent, PlanTask } from '../../src/features/planning/types'

test('entregables: casillas del «cómo se comprueba», el resto queda como prosa', () => {
  const t = 'Intro\n- [ ] Guion v1\n- [x] Cobro en Polar\n* [X] 60 invitaciones'
  const { items, resto } = entregablesDe(t)
  assert.deepEqual(items.map(e => [e.texto, e.hecho, e.linea]), [['Guion v1', false, 1], ['Cobro en Polar', true, 2], ['60 invitaciones', true, 3]])
  assert.equal(resto, 'Intro')
  assert.equal(conEntregable(t, 1, true), 'Intro\n- [x] Guion v1\n- [x] Cobro en Polar\n* [X] 60 invitaciones')
  assert.equal(conEntregable(t, 2, false), 'Intro\n- [ ] Guion v1\n- [ ] Cobro en Polar\n* [X] 60 invitaciones')
})

test('hitos del registro: día suelto y ventana, en orden', () => {
  const h = hitosDelRegistro('Notas libres\n◆ 2026-10-17..2026-10-20 · Ventana de llamadas\n◆ 2026-10-17 · Masterclass 12:00\n◆ mal')
  assert.deepEqual(h, [{ dia: '2026-10-17', hasta: '2026-10-20', titulo: 'Ventana de llamadas' }, { dia: '2026-10-17', hasta: null, titulo: 'Masterclass 12:00' }].sort((a, b) => a.dia.localeCompare(b.dia)))
  assert.equal(diasHasta('2026-10-06', '2026-10-17'), 11)
})

test('estado de la semana: lo cierra el registro, no el reloj', () => {
  assert.equal(estadoSemana({ status: 'completed' }, '2026-09-28', '2026-10-06'), 'hecha')
  assert.equal(estadoSemana({ status: 'agreed' }, '2026-09-28', '2026-10-06'), 'sin-cerrar')
  assert.equal(estadoSemana({ status: 'agreed' }, '2026-10-05', '2026-10-06'), 'en-curso')
  assert.equal(estadoSemana({ status: 'draft' }, '2026-10-12', '2026-10-06'), 'pendiente')
  assert.equal(estadoSemana(null, '2026-10-12', '2026-10-06'), 'sin-objetivo')
})

const ev = (id: string, title: string, extra: Partial<PlanEvent> = {}) => ({ id, title, start: '', end: '', ...extra }) as PlanEvent
const bloque = (id: string, titulo: string, h: number, min: number, rutina = false): Bloque => {
  const inicio = new Date(2026, 9, 6, h).getTime()
  return { id, titulo, inicio, fin: inicio + min * 60e3, color: null, evento: ev(id, titulo, rutina ? { recurringEventId: 'r' } : {}) }
}

test('compromisos: sin rutinas, lo corto al final, sin duplicar entre calendarios y sin el objetivo', () => {
  const dia = { conHora: [bloque('a', 'Abdomen · ducha fría', 5, 30), bloque('b', '🧭 Estudiar el macro', 6, 180), bloque('c', 'Gym', 12, 90, true), bloque('d', 'Masterclass', 12, 120), bloque('e', '🚀 Masterclass', 12, 120)], todoElDia: [] }
  const tareas = [{ id: 't', title: 'Firmar el sistema de venta', priority: 1 } as PlanTask]
  const { lista, resto } = compromisosDelDia(dia, tareas, 2, t => t === 'Firmar el sistema de venta')
  assert.deepEqual(lista.map(x => x.id), ['b', 'd'])
  assert.equal(resto, 1)
})
