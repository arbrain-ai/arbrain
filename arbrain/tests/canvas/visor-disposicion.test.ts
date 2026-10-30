import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  ANGOSTO, BISEL, TELEFONO, disposicionVisor, encajarEscritorio, encajarTelefono,
} from '../../src/features/canvas/model/visor-disposicion'

const ANCHOS = [360, 520, 830, 1440, 2000]
const ALTOS = [640, 900, 1250]

test('visor: a ningún ancho ni alto el panel se sale del lienzo', () => {
  for (const width of ANCHOS) for (const height of ALTOS) for (const accion of ['medio', 'previa', 'estado'] as const) {
    for (const modo of ['telefono', 'escritorio'] as const) {
      const d = disposicionVisor({ width, height }, accion, modo)
      const k = `${width}x${height} ${accion} ${modo}`
      assert.ok(d.left >= 0 && d.left + d.width <= width, `horizontal ${k}`)
      const top = d.top ?? height - 8 - d.maxHeight
      assert.ok(top >= 0 && top + (d.height ?? d.maxHeight) <= height, `vertical ${k}`)
      assert.equal(d.forma, width < ANGOSTO ? 'hoja' : 'acoplado', k)
    }
  }
})

test('visor: en ancho grande se acopla a la derecha; en chico es hoja a todo el ancho', () => {
  const g = disposicionVisor({ width: 1440, height: 900 }, 'medio')
  assert.equal(g.left + g.width, 1440 - 16)
  const c = disposicionVisor({ width: 360, height: 780 }, 'previa')
  assert.deepEqual([c.forma, c.left, c.width], ['hoja', 8, 344])
  assert.equal(disposicionVisor({ width: 520, height: 780 }, 'medio').top, null, 'medio en hoja se ancla abajo')
})

test('visor: el teléfono cabe ENTERO y nunca crece por encima de 1:1', () => {
  for (const cuerpo of [{ width: 344, height: 600 }, { width: 400, height: 820 }, { width: 2000, height: 2000 }, { width: 200, height: 300 }]) {
    const t = encajarTelefono(cuerpo)
    assert.ok(t.escala <= 1)
    assert.ok(t.marcoAncho <= cuerpo.width && t.marcoAlto <= cuerpo.height, JSON.stringify(cuerpo))
    assert.ok(Math.abs(t.marcoAlto - 2 * BISEL - TELEFONO.alto * t.escala) < 1e-9)
  }
  assert.equal(encajarTelefono({ width: 2000, height: 2000 }).escala, 1)
})

test('visor: el escritorio es de 1280 px escalado al ancho, nunca cortado', () => {
  const e = encajarEscritorio({ width: 600, height: 800 })
  assert.ok(Math.abs(1280 * e.escala - e.ventanaAncho) < 1e-9)
  assert.ok(e.ventanaAncho <= 600 - 24)
  assert.equal(e.iframeAlto, Math.round(e.ventanaAlto / e.escala))
  // En el panel acoplado, el modo escritorio es más ancho que el teléfono.
  const tel = disposicionVisor({ width: 1440, height: 900 }, 'previa', 'telefono')
  const esc = disposicionVisor({ width: 1440, height: 900 }, 'previa', 'escritorio')
  assert.ok(esc.width > tel.width)
})
