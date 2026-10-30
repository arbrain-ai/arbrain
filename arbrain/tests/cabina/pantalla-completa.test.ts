// Pantalla completa con Levy a la mano (5 oct 2026): qué abre cada destino, qué hace cada tecla y qué se recuerda.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { accionDeTecla, distanciaAlFondo, leerRecuerdo, scrollParaDistancia, vistaDeDestino, vistaDeRuta } from '../../src/features/cabina/panel/pantalla-completa'

const tecla = (o: Partial<{ code: string; key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented: boolean }>) =>
  ({ code: '', key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o })

test('⌘. entra y sale desde cualquier estado', () => {
  assert.equal(accionDeTecla(tecla({ code: 'Period', key: '.', metaKey: true }), { enfoque: false, focoEnLevy: false }), 'alternar')
  assert.equal(accionDeTecla(tecla({ code: 'Period', key: '.', metaKey: true }), { enfoque: true, focoEnLevy: true }), 'alternar')
  assert.equal(accionDeTecla(tecla({ code: 'Period', key: '.', metaKey: true, shiftKey: true }), { enfoque: false, focoEnLevy: false }), null)
})

test('⌘J trae a Levy solo a pantalla completa (fuera sigue siendo la terminal)', () => {
  assert.equal(accionDeTecla(tecla({ code: 'KeyJ', key: 'j', metaKey: true }), { enfoque: true, focoEnLevy: false }), 'levy')
  assert.equal(accionDeTecla(tecla({ code: 'KeyJ', key: 'j', metaKey: true }), { enfoque: false, focoEnLevy: false }), null)
})

test('Esc: con el foco en Levy lo esconde; si no, vuelve; lo ya atendido manda', () => {
  assert.equal(accionDeTecla(tecla({ key: 'Escape', code: 'Escape' }), { enfoque: true, focoEnLevy: true }), 'cerrar-levy')
  assert.equal(accionDeTecla(tecla({ key: 'Escape', code: 'Escape' }), { enfoque: true, focoEnLevy: false }), 'salir')
  assert.equal(accionDeTecla(tecla({ key: 'Escape', code: 'Escape', defaultPrevented: true }), { enfoque: true, focoEnLevy: false }), null)
  assert.equal(accionDeTecla(tecla({ key: 'Escape', code: 'Escape' }), { enfoque: false, focoEnLevy: false }), null)
})

test('Levy te lleva a la pestaña equivalente; un lienzo sin página sigue por su ruta', () => {
  assert.deepEqual(vistaDeDestino({ destino: 'calendario', fecha: '2026-10-05', alcance: 'dia' }), { vista: 'calendario', alcance: 'dia', fecha: '2026-10-05' })
  assert.deepEqual(vistaDeDestino({ destino: 'sfcal' }), { vista: 'calendario', alcance: 'semana', fecha: undefined })
  assert.deepEqual(vistaDeDestino({ destino: 'centro' }), { vista: 'finanzas' })
  assert.deepEqual(vistaDeDestino({ destino: 'hoy' }), { vista: 'objetivos', alcance: 'dia', fecha: undefined })
  assert.deepEqual(vistaDeDestino({ destino: 'sfmap', paginaId: 'claridad', zona: 'ht:op' }), { vista: 'lienzo', paginaId: 'claridad', zona: 'ht:op' })
  assert.equal(vistaDeDestino({ destino: 'lienzo' }), null)
  assert.deepEqual(vistaDeDestino({ destino: 'finanzas' }), { vista: 'finanzas' })
})

test('Ctrl+1…7: las secciones con pestaña; Chat y Artificial Brain siguen siendo rutas', () => {
  // Ctrl+1 = Hoy = el Calendario en su Día (retiro de /todotask/hoy, 5 oct 2026); la escala viaja en la ruta.
  assert.deepEqual(vistaDeRuta('/calendar?mode=day'), { vista: 'calendario', alcance: 'dia' })
  assert.equal(vistaDeRuta('/todotask/hoy'), null)
  assert.deepEqual(vistaDeRuta('/calendar'), { vista: 'calendario', alcance: 'semana' })
  assert.deepEqual(vistaDeRuta('/ml-dashboard'), { vista: 'finanzas' })
  assert.equal(vistaDeRuta('/chat'), null)
  assert.equal(vistaDeRuta('/segundo-cerebro'), null)
})

test('se recuerda entre recargas y tolera basura', () => {
  assert.deepEqual(leerRecuerdo('{"enfoque":true,"levy":true,"rutaPrevia":"/calendar?date=2026-10-05"}'), { enfoque: true, levy: true, rutaPrevia: '/calendar?date=2026-10-05' })
  assert.deepEqual(leerRecuerdo('{"enfoque":"si","rutaPrevia":"https://fuera.com"}'), { enfoque: false, levy: false, rutaPrevia: null })
  assert.deepEqual(leerRecuerdo('no es json'), { enfoque: false, levy: false, rutaPrevia: null })
  assert.deepEqual(leerRecuerdo(null), { enfoque: false, levy: false, rutaPrevia: null })
})

test('el scroll del chat vuelve a la misma distancia del fondo aunque cambie el ancho', () => {
  const d = distanciaAlFondo({ scrollHeight: 5000, scrollTop: 3800, clientHeight: 900 })
  assert.equal(d, 300)
  assert.equal(scrollParaDistancia({ scrollHeight: 6200, clientHeight: 700 }, d), 5200)
  assert.equal(scrollParaDistancia({ scrollHeight: 500, clientHeight: 700 }, d), 0)
})
