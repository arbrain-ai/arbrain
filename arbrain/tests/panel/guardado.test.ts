import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { entradaDe } from '../../src/features/cabina/panel/guardado'
import type { MostrarInput } from '../../src/features/cabina/model'

const doc = (ruta: string) => ({ vista: 'documento', ruta } as MostrarInput)
const entradas = [
  { id: 'g-1', input: doc('docs/business-os/cerebro-artificial-pergamino/index.html') },
  { id: 'g-2', input: doc('docs/guardados/nota.md'), rutaOriginal: '/tmp/nota.md' },
]

describe('entradaDe: ¿la pestaña está en el archivero? (guardar ↔ quitar en sitio)', () => {
  it('por la clave de la vista, aunque la pestaña no se haya reabierto desde Guardadas', () => {
    assert.equal(entradaDe(entradas, { id: 'levy-9', input: doc('docs/business-os/cerebro-artificial-pergamino/index.html') })?.id, 'g-1')
  })
  it('por el id con que se reabrió', () => {
    assert.equal(entradaDe(entradas, { id: 'guardada-g-2', input: doc('docs/guardados/nota.md') })?.id, 'g-2')
  })
  it('un documento de /tmp se reconoce por su ruta de antes', () => {
    assert.equal(entradaDe(entradas, { id: 'levy-1', input: doc('/tmp/nota.md') })?.id, 'g-2')
  })
  it('quitada del archivero, la pestaña reabierta ya no cuenta como guardada', () => {
    assert.equal(entradaDe([entradas[1]], { id: 'guardada-g-1', input: doc('docs/business-os/cerebro-artificial-pergamino/index.html') }), undefined)
  })
})
