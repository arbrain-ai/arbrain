// Zonas de mi vida (28 oct 2026): encender, apagar, mover y recolorear cada zona, guardado como ajustes sobre las de fábrica.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarCambioZonas, DOC_ZONAS_VACIO, normalizarZonas, zonasEfectivas, zonasEncendidas, type DocZonas } from '../../src/features/planning/zonas'
import { INSTALACION } from '../../src/config/instalacion'

const FABRICA = INSTALACION.camposFondo
const AHORA = '2026-10-28T15:00:00.000Z'
const aplicar = (doc: DocZonas, c: unknown) => { const r = aplicarCambioZonas(doc, c, FABRICA, AHORA); assert.notEqual(typeof r, 'string', String(r)); return r as DocZonas }

test('sin ajustes, todas encendidas y como en fábrica', () => {
  const z = zonasEfectivas(FABRICA, null)
  assert.equal(z.length, FABRICA.length)
  assert.ok(z.every(x => x.activa && !x.tocada))
  assert.equal(zonasEncendidas(z).length, FABRICA.length)
})

test('apagar, recolorear y mover una zona; lo igual a fábrica no se guarda', () => {
  let doc = aplicar(DOC_ZONAS_VACIO, { accion: 'zona', clave: 'gym', activa: false })
  assert.deepEqual(doc.zonas, { gym: { activa: false } })
  assert.ok(!zonasEncendidas(zonasEfectivas(FABRICA, doc)).some(z => z.clave === 'gym'))
  doc = aplicar(doc, { accion: 'zona', clave: 'profundo', categoria: 'crear', franjas: [['6:00', '09:30'], ['13:00', '15:00']] })
  const p = zonasEfectivas(FABRICA, doc).find(z => z.clave === 'profundo')!
  assert.equal(p.categoria, 'crear'); assert.deepEqual(p.franjas, [['06:00', '09:30'], ['13:00', '15:00']]); assert.ok(p.tocada)
  doc = aplicar(doc, { accion: 'zona', clave: 'gym', activa: true })
  assert.ok(!('gym' in doc.zonas), 'volver a encender = seguir a fábrica')
  doc = aplicar(doc, { accion: 'zona', clave: 'profundo', categoria: 'construir', franjas: [['06:00', '09:00'], ['13:00', '15:00'], ['15:30', '18:30']] })
  assert.deepEqual(doc.zonas, {})
})

test('el sueño puede cruzar la medianoche; lo inválido se rechaza con su motivo', () => {
  assert.ok(aplicar(DOC_ZONAS_VACIO, { accion: 'zona', clave: 'sueno', franjas: [['21:30', '05:30']] }).zonas.sueno)
  for (const malo of [
    { accion: 'zona', clave: 'nada', activa: false },
    { accion: 'zona', clave: 'gym', categoria: 'rosa' },
    { accion: 'zona', clave: 'gym', franjas: [['09:00', '09:00']] },
    { accion: 'zona', clave: 'gym', franjas: [['25:00', '09:00']] },
    { accion: 'zona', clave: 'gym', activa: 'no' },
    { accion: 'borrar' },
  ]) assert.equal(typeof aplicarCambioZonas(DOC_ZONAS_VACIO, malo, FABRICA, AHORA), 'string', JSON.stringify(malo))
})

test('restablecer una o todas, y leer lo guardado sin confiar en ello', () => {
  let doc = aplicar(DOC_ZONAS_VACIO, { accion: 'zona', clave: 'gym', activa: false })
  doc = aplicar(doc, { accion: 'zona', clave: 'noche', categoria: 'ensenar' })
  assert.deepEqual(Object.keys(aplicar(doc, { accion: 'restablecer', clave: 'gym' }).zonas), ['noche'])
  assert.deepEqual(aplicar(doc, { accion: 'restablecer' }).zonas, {})
  const leido = normalizarZonas({ actualizado: AHORA, zonas: { gym: { activa: false, categoria: 'rosa' }, 'MAL CLAVE': { activa: false }, noche: 7 } })
  assert.deepEqual(leido.zonas, { gym: { activa: false } })
  assert.deepEqual(normalizarZonas('basura'), DOC_ZONAS_VACIO)
})
