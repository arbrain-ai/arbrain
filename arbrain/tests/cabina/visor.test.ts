import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { buscarEnPiezas, formatoTiempo, fotogramaDe, leerTiempo, mensajeMarca, mensajeMarcas, mensajePdf, modoPorDefecto, ordenarEntrega, pasoDeFotograma, pasoVolumen, siguienteVelocidad, tiempoEnOtra, versionesDe, viaPantallaCompleta, volumenAlOir, type ItemEntrega } from '../../src/features/cabina/documento/medio'
import { tipoDocumento, resolverRuta } from '../../src/features/cabina/documento/ruta'

test('tiempo: formato y lectura son inversos', () => {
  assert.equal(formatoTiempo(130.4), '2:10')
  assert.equal(formatoTiempo(3723), '1:02:03')
  assert.equal(formatoTiempo(83.4, { fps: 30, fotogramas: true }), '1:23.12')
  assert.equal(leerTiempo('2:10'), 130)
  assert.equal(leerTiempo('1:02:03'), 3723)
  assert.equal(leerTiempo('130,4'), 130.4)
  assert.equal(leerTiempo('hola'), null)
})
test('fotogramas: el paso cae en el medio del fotograma y no se sale del video', () => {
  assert.equal(fotogramaDe(1, 30), 30)
  assert.equal(fotogramaDe(pasoDeFotograma(1, 30, 1, 10), 30), 31)
  assert.equal(fotogramaDe(pasoDeFotograma(1, 30, -1, 10), 30), 29)
  assert.equal(pasoDeFotograma(0, 30, -5, 10), 0.5 / 30)
  assert.ok(pasoDeFotograma(9.99, 30, 50, 10) < 10)
})
test('L acelera 1 → 1.5 → 2 → 3 y se queda', () => {
  assert.deepEqual([0.5, 1, 1.5, 2, 3].map(siguienteVelocidad), [1, 1.5, 2, 3, 3])
})
test('dos versiones: mismo tiempo o mismo avance', () => {
  assert.equal(tiempoEnOtra(5, 20, 10, 'tiempo'), 5)
  assert.equal(tiempoEnOtra(5, 20, 10, 'avance'), 2.5)
  assert.equal(tiempoEnOtra(15, 20, 10, 'tiempo'), 10)
  assert.equal(modoPorDefecto(18.4, 18.5), 'tiempo')
  assert.equal(modoPorDefecto(18, 12), 'avance')
})
test('la marca viaja como texto con forma fija: el tiempo es de la versión mirada', () => {
  const m = { tiempo: 130.4, nota: 'quita esto', version: 'v2.mp4', ruta: '/abs/v2.mp4' }
  assert.equal(mensajeMarca(m), '⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=/abs/v2.mp4\nquita esto')
  assert.equal(mensajeMarca({ ...m, nota: '' }), '⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=/abs/v2.mp4')
  assert.match(mensajeMarca(m, 'Audio'), /^⏱ Audio «v2.mp4»/)
  const varias = mensajeMarcas([{ ...m, tiempo: 50, nota: 'b' }, { ...m, tiempo: 10, nota: 'a' }])
  assert.deepEqual(varias.split('\n\n').map(b => b.split('\n')[1]), ['a', 'b'])
})
test('cita de PDF lleva archivo, página y ruta', () => {
  assert.equal(mensajePdf({ archivo: 'g.pdf', ruta: '/x/g.pdf', pagina: 3, seleccion: ' la  ley\nde Ashby ', pregunta: '' }), '📄 PDF «g.pdf» · p. 3 · ruta=/x/g.pdf\n«la ley de Ashby»\nExplícame esto.')
})
test('búsqueda en PDF: sin acentos ni mayúsculas, une trozos de una palabra y cruza piezas', () => {
  const r = buscarEnPiezas([{ texto: 'La Acci' }, { texto: 'ón correctiva', junto: true }, { texto: 'debe' }], 'accion')
  assert.equal(r.length, 1)
  assert.deepEqual(r[0].map(t => [t.pieza, t.ini, t.fin]), [[0, 3, 7], [1, 0, 2]])
  assert.equal(buscarEnPiezas([{ texto: 'a b' }], 'zzz').length, 0)
  assert.equal(buscarEnPiezas([{ texto: 'uno dos' }, { texto: 'tres' }], 'dos tres').length, 1)
  assert.equal(buscarEnPiezas([{ texto: 'abab' }], 'ab').length, 2)
})
const it = (relativa: string, clase: ItemEntrega['clase'] = 'video'): ItemEntrega => ({ nombre: relativa.split('/').pop()!, ruta: '/' + relativa, relativa, clase, bytes: 1, mtime: '' })
test('entrega: finales primero; versiones ordenadas v1 < v2 < v2.1 < v10', () => {
  const { finales, piezas } = ordenarEntrega([it('versiones/v10.mp4'), it('versiones/v2.1.mp4'), it('finales/h.mp4'), it('versiones/v2.mp4'), it('versiones/v1.mp4'), it('notas.pdf', 'pdf'), it('final-vertical.mp4')])
  assert.deepEqual(finales.map(i => i.nombre).sort(), ['final-vertical.mp4', 'h.mp4'])
  assert.deepEqual(piezas.map(i => i.nombre), ['v1.mp4', 'v2.mp4', 'v2.1.mp4', 'v10.mp4', 'notas.pdf'])
  assert.equal(versionesDe(piezas).length, 4)
})
test('rutas: pdf, audio y las carpetas del dueño se abren; las credenciales no', () => {
  assert.equal(tipoDocumento('a.pdf'), 'pdf'); assert.equal(tipoDocumento('a.m4a'), 'audio'); assert.equal(tipoDocumento('a.mov'), 'video')
  const r = { repo: '/Users/x/Developer/artificial-brain', home: '/Users/x' }
  assert.deepEqual(resolverRuta('~/Movies/p/final.mp4', r), { abs: '/Users/x/Movies/p/final.mp4' })
  assert.ok('error' in resolverRuta('~/Documents/.ssh/x.pdf', r))
  assert.ok('error' in resolverRuta('~/Library/x.pdf', r))
})
test('pantalla completa: el video nativo (sin controles en el escritorio) solo en el teléfono', () => {
  assert.equal(viaPantallaCompleta({ elemento: false, escritorio: true, tactil: false, videoNativo: true }), 'ventana')
  assert.equal(viaPantallaCompleta({ elemento: true, escritorio: true, tactil: false, videoNativo: true }), 'ventana')
  assert.equal(viaPantallaCompleta({ elemento: true, escritorio: false, tactil: false, videoNativo: true }), 'elemento')
  assert.equal(viaPantallaCompleta({ elemento: false, escritorio: false, tactil: true, videoNativo: true }), 'video')
  assert.equal(viaPantallaCompleta({ elemento: false, escritorio: false, tactil: false, videoNativo: true }), 'ventana')
})
test('volumen: pasos de 10 % dentro de 0–1, y quitar el silencio en cero suena', () => {
  assert.equal(pasoVolumen(0.95, 1), 1)
  assert.equal(pasoVolumen(0.05, -1), 0)
  assert.equal(pasoVolumen(0.5, 1), 0.6)
  assert.equal(volumenAlOir(0), 0.5)
  assert.equal(volumenAlOir(0.3), 0.3)
})
