import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { conEntregable, conNuevoEntregable, entregablesDe } from '../../src/features/planning/claridad'
import { casillasDelDia } from '../../src/features/planning/dia-vivo'
import type { PlanEvent, PlanTask } from '../../src/features/planning/types'

// El objetivo del día arriba, con la caja de la Semana (10 oct 2026, Daniel: «que se vea hasta arriba el objetivo del día. Y que
// yo al darle clic simplemente me aparezcan los checkbox… toma de referencia la de la semana»).
const fuente = (f: string) => readFileSync(new URL(`../../src/features/planning/${f}`, import.meta.url), 'utf8')
const tarea = { id: 'todoist:1', kind: 'task', title: 'Sábado de lectura', description: '- [ ] Leer 20 min al mediodía' } as PlanTask
const evento = (editable: boolean) => ({ id: 'google:e', kind: 'event', title: 'Sábado de lectura', description: 'Nota, 9 oct: «…»', editable }) as PlanEvent

test('agregar una casilla la pone al final sin mover las de arriba (prosa incluida)', () => {
  assert.equal(conNuevoEntregable('', '  Dormir   9 h '), '- [ ] Dormir 9 h')
  const t = conNuevoEntregable('Nota, 9 oct: «…»\n- [x] Gym\n\n', 'Leer 20 min')
  assert.equal(t, 'Nota, 9 oct: «…»\n- [x] Gym\n- [ ] Leer 20 min')
  const { items, resto } = entregablesDe(t)
  assert.deepEqual(items.map(e => [e.texto, e.hecho, e.linea]), [['Gym', true, 1], ['Leer 20 min', false, 2]])
  assert.equal(resto, 'Nota, 9 oct: «…»', 'la prosa se queda como contexto')
  assert.equal(conEntregable(t, 2, true).split('\n')[2], '- [x] Leer 20 min')
})

test('las casillas viven en la misma fuente que el título: tarea, registro o evento editable', () => {
  assert.deepEqual(casillasDelDia({ tarea }, { success: 'x' }, evento(true)), { origen: 'tarea', texto: tarea.description, tarea })
  assert.deepEqual(casillasDelDia(null, { success: '- [ ] A' }, evento(true)), { origen: 'plan', texto: '- [ ] A' })
  assert.equal(casillasDelDia(null, null, evento(true))?.origen, 'evento')
  assert.equal(casillasDelDia(null, null, evento(false)), null, 'un evento ajeno no se escribe')
  assert.equal(casillasDelDia(null, null, null), null)
})

test('Día: el objetivo va arriba con ObjetivoCaja, plegable, y tocarlo ya no abre «Crear tarea»', () => {
  const dia = fuente('DiaVivo.tsx'), semana = fuente('SemanaClara.tsx')
  const caja = dia.indexOf('<ObjetivoCaja'), agenda = dia.indexOf('<AgendaMini'), habitos = dia.indexOf('<HabitosHoy')
  assert.ok(caja > 0 && caja < agenda && agenda < habitos, 'objetivo → agenda | tareas → hábitos')
  assert.match(dia, /plegada=\{plegado \? !plegado\.objetivo : false\} onPlegar=\{plegado \? \(\) => plegado\.alternar\('objetivo'\) : undefined\}/)
  assert.match(dia, /<Entregables texto=\{casillas\?\.texto \?\? ''\} guardar=\{guardarCasillas\}/)
  assert.doesNotMatch(dia, /objLinea|abrirObjetivo|titulo: titulo \?\? ''/, 'sin la línea de abajo ni el atajo a la hoja de tarea')
  assert.match(dia, /: !leyendoObjetivo && <button className=\{d\.objVacio\} onClick=\{fijarObjetivo\}/, 'solo el vacío ofrece fijar uno')
  // Un solo componente para las tres escalas.
  assert.match(semana, /<Entregables texto=\{goal\.success\}/)
  assert.doesNotMatch(semana + dia, /function Entregables|function ObjetivoCaja/)
  assert.match(fuente('PlanningCalendar.tsx'), /onDescripcion=\{escribirDescripcion\}/)
})
