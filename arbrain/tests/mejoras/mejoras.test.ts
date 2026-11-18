// Ajustes › Mejoras: un interruptor por mejora opcional, guardado en el daemon y copiado en este dispositivo.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DEF_MEJORAS, guardarMejorasLocal, leerMejorasLocal, MEJORAS, MEJORAS_DE_FABRICA, mejoraActiva, normalizarMejoras } from '../../src/features/mejoras/lib/mejoras'
import { buscarAjustes, SECCIONES } from '../../src/features/configuracion/secciones'
import { fuente, memoria } from './ayuda'

test('cada mejora tiene su interruptor en la lista, con nombre y detalle', () => {
  assert.deepEqual(DEF_MEJORAS.map((d) => d.id), [...MEJORAS])
  for (const d of DEF_MEJORAS) assert.ok(d.nombre && d.detalle)
})

test('sin nada guardado, todas como de fábrica', () => {
  const s = memoria()
  assert.deepEqual(leerMejorasLocal(s), MEJORAS_DE_FABRICA)
  assert.deepEqual(leerMejorasLocal(null), MEJORAS_DE_FABRICA)
})

test('prender y apagar cada una en este dispositivo', () => {
  const s = memoria()
  for (const id of MEJORAS) {
    guardarMejorasLocal({ ...leerMejorasLocal(s), [id]: true }, s)
    assert.equal(mejoraActiva(id, s), true)
    guardarMejorasLocal({ ...leerMejorasLocal(s), [id]: false }, s)
    assert.equal(mejoraActiva(id, s), false)
  }
})

test('lo guardado con ids desconocidos o valores raros no rompe nada', () => {
  assert.deepEqual(normalizarMejoras({ inventada: true, 'mic-con-turno': 'si' }), MEJORAS_DE_FABRICA)
  const s = memoria(); s.setItem('arbrain:mejoras', '{roto')
  assert.deepEqual(leerMejorasLocal(s), MEJORAS_DE_FABRICA)
})

test('Ajustes › Mejoras existe en la navegación, se encuentra con el buscador y se pinta', () => {
  assert.ok(SECCIONES.some((s) => s.id === 'mejoras'))
  assert.ok(buscarAjustes('mejoras').some((g) => g.secciones.some((s) => s.seccion.id === 'mejoras')))
  assert.match(fuente('src/features/configuracion/components/ModalAjustes.tsx'), /seccion === 'mejoras' && <SeccionMejoras \/>/)
  assert.match(fuente('server/src/server.ts'), /parsed\.que === 'mejoras'/)
})
