import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicar, enQue, relativa, urlActividad, vacia, type Lectura } from '../src/features/cabina/panel/actividad-modelo'

const lectura = (o: Partial<Lectura>): Lectura => ({ pasos: [], offset: 10, recortado: false, turnoBase: 1, corriendo: true, harness: 'claude', ...o })

test('el resultado y el progreso se enlazan a su herramienta aunque lleguen en otra lectura', () => {
  let a = aplicar(vacia(), lectura({ pasos: [{ k: 'herramienta', id: 'x', nombre: 'Bash', que: 'Corre', detalle: 'ls' }] }), 1)
  assert.equal(enQue(a).tipo, 'herramienta')
  a = aplicar(a, lectura({ offset: 20, pasos: [{ k: 'progreso', id: 'x', seg: 30 }, { k: 'resultado', id: 'x', ok: true, salida: 'a', lineas: 1 }] }), 2)
  assert.equal(a.pasos.length, 1)
  assert.equal(a.progreso.x, 30)
  assert.equal(a.resultados.x.salida, 'a')
  assert.equal(enQue(a).tipo, 'escribiendo')
})

test('pensar se funde entre lecturas y una herramienta repetida no se duplica', () => {
  let a = aplicar(vacia(), lectura({ pasos: [{ k: 'pensando', tokens: 10 }] }))
  a = aplicar(a, lectura({ pasos: [{ k: 'pensando', tokens: 90 }, { k: 'herramienta', id: 'y', nombre: 'Edit', que: 'Edita', detalle: 'a' }, { k: 'herramienta', id: 'y', nombre: 'Edit', que: 'Edita', detalle: 'a' }] }))
  assert.deepEqual(a.pasos.map(p => p.k), ['pensando', 'herramienta'])
  assert.equal(a.pasos[0].k === 'pensando' && a.pasos[0].tokens, 90)
})

test('la primera lectura reemplaza y una lectura vacía no mueve el reloj de novedad', () => {
  let a = aplicar(vacia(), lectura({ pasos: [{ k: 'texto', texto: 'hola' }] }), 100)
  a = aplicar(a, lectura({ pasos: [] }), 900)
  assert.equal(a.ultimoCambio, 100)
  assert.equal(urlActividad(5, a), '/api/cabina/actividad?agente=5&desde=10&turno=1')
  assert.equal(urlActividad(5, vacia()), '/api/cabina/actividad?agente=5')
})

test('rutas relativas a la carpeta del agente', () => {
  assert.equal(relativa('~/Developer/wt-x/arbrain/a.ts', '~/Developer/wt-x'), 'arbrain/a.ts')
  assert.equal(relativa('/otra/b.ts', '~/Developer/wt-x'), '/otra/b.ts')
})
