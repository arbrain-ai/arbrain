/**
 * Windows: documentos, piezas y recetas del lienzo (16 nov 2026, un fundador en Windows: «algún panel acá, me quedó en
 * blanco y era porque solamente funcionaba para Mac»; «los lienzos todavía no los puedo usar mucho»).
 *
 * En Windows `realpath` devuelve `C:\Users\…`. Antes, la validación comparaba como texto POSIX y todo documento salía
 * «fuera de la carpeta»: la pieza HTML del lienzo y el visor quedaban en blanco. Estas pruebas corren en cualquier
 * sistema con rutas de Windows escritas a mano; la CI de Windows las corre además con rutas reales.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { alcanceDeAssets, pareceSecreto, resolverRuta, rutaPermitida, tipoDocumento } from '../../src/features/cabina/documento/ruta'
import { dentroDeRaiz } from '../../src/features/canvas/model/doc'
import { conBarras, debajoDe, dentroDe, esAbsolutaPortable, rutaAUrl, urlARuta } from '../../src/lib/ruta-portable'

const WS = 'C:\\Users\\alumno\\Arbrain'
const win = { repo: WS, home: WS }

test('Windows: un documento del cerebro se permite (relativo, con «\\» y absoluto)', () => {
  assert.deepEqual(resolverRuta('docs/plan.md', win), { abs: 'C:/Users/alumno/Arbrain/docs/plan.md' })
  assert.deepEqual(resolverRuta('docs\\lienzos\\pieza.html', win), { abs: 'C:/Users/alumno/Arbrain/docs/lienzos/pieza.html' })
  assert.deepEqual(resolverRuta('C:\\Users\\alumno\\Arbrain\\docs\\a.md', win), { abs: 'C:/Users/alumno/Arbrain/docs/a.md' })
  assert.deepEqual(resolverRuta('~/docs/a.md', win), { abs: 'C:/Users/alumno/Arbrain/docs/a.md' })
  // El Explorador pide `${raiz}/${rel}` (features/cabina/explorador/arbol.ts): mezcla `\\` y `/`.
  assert.deepEqual(resolverRuta('C:\\Users\\alumno\\Arbrain/notas/a.md', win), { abs: 'C:/Users/alumno/Arbrain/notas/a.md' })
  // realpath de Windows puede traer la unidad en otra caja que ARBRAIN_HOME: el sistema no distingue mayúsculas.
  assert.equal(rutaPermitida('c:\\users\\alumno\\arbrain\\docs\\a.md', win), null)
  assert.equal(rutaPermitida('C:\\Users\\alumno\\Arbrain\\docs\\a.md', win), null)
})

test('Windows: lo de fuera, «..» y credenciales siguen negados', () => {
  assert.ok('error' in resolverRuta('C:\\Windows\\System32\\drivers\\etc\\hosts', win))
  assert.ok('error' in resolverRuta('docs\\..\\..\\secreto.md', win))
  assert.ok('error' in resolverRuta('C:\\Users\\alumno\\Arbrain-gemelo\\a.md', win))
  assert.ok(rutaPermitida('C:\\Users\\alumno\\Arbrain\\.ssh\\x.md', win))
  assert.ok(rutaPermitida('C:\\Users\\alumno\\Arbrain\\.env.local', win))
  assert.ok(pareceSecreto('C:\\Users\\alumno\\Arbrain\\.aws\\config'))
  assert.equal(tipoDocumento('C:\\Users\\alumno\\Arbrain\\docs\\pieza.HTML'), 'html')
})

test('Windows: los assets de una página HTML se sirven desde su carpeta, sin salir del cerebro', () => {
  assert.equal(alcanceDeAssets('C:\\Users\\alumno\\Arbrain\\docs\\lienzos\\mapa\\index.html', win), 'C:/Users/alumno/Arbrain/docs')
  assert.equal(alcanceDeAssets('C:\\Users\\alumno\\Arbrain\\index.html', win), 'C:/Users/alumno/Arbrain')
})

test('Windows: la pieza, el documento y la receta del lienzo están dentro del cerebro', () => {
  assert.equal(dentroDeRaiz('C:\\Users\\alumno\\Arbrain\\docs\\pieza.html', WS), true)
  assert.equal(dentroDeRaiz('C:\\Users\\alumno\\Arbrain\\docs\\pieza.html', 'C:\\Users\\alumno\\Arbrain\\'), true)
  assert.equal(dentroDeRaiz('c:\\users\\alumno\\arbrain\\docs\\pieza.html', WS), true)
  assert.equal(dentroDeRaiz(WS, WS), false)                                        // la raíz misma no es un documento
  assert.equal(dentroDeRaiz('C:\\Users\\alumno\\Arbrain-gemelo\\a.html', WS), false) // prefijo engañoso
  assert.equal(dentroDeRaiz('D:\\otra\\a.html', WS), false)
  // El Taller (api/cabina/archivos) usa la misma regla: `path.join` de Windows contra la raíz resuelta.
  assert.equal(debajoDe('C:\\Users\\alumno\\Arbrain\\.claude\\memory\\MEMORY.md', WS), true)
  assert.equal(debajoDe(WS, WS), false)
})

test('Windows: la URL firmada del visor ida y vuelta conserva la ruta', () => {
  const real = 'C:\\Users\\alumno\\Arbrain\\docs\\mi pieza.html'
  const url = rutaAUrl(real)
  assert.equal(url, '/C%3A/Users/alumno/Arbrain/docs/mi%20pieza.html')
  const vuelta = urlARuta('/' + url.split('/').filter(Boolean).map(decodeURIComponent).join('/'))
  assert.equal(vuelta, 'C:/Users/alumno/Arbrain/docs/mi pieza.html')
  assert.ok(dentroDe(vuelta, alcanceDeAssets(real, win)))
})

test('Mac y Linux no cambian: POSIX tal cual, «\\» es parte del nombre', () => {
  const r = { repo: '/Users/x/Arbrain', home: '/Users/x/Arbrain' }
  assert.deepEqual(resolverRuta('docs/a.md', r), { abs: '/Users/x/Arbrain/docs/a.md' })
  assert.equal(rutaAUrl('/Users/x/Arbrain/docs/a b.html'), '/Users/x/Arbrain/docs/a%20b.html')
  assert.equal(urlARuta('/Users/x/a.html'), '/Users/x/a.html')
  assert.equal(conBarras('/tmp/a\\b'), '/tmp/a\\b')
  assert.equal(dentroDe('/Users/alumno/ARBRAIN/a', '/Users/alumno/Arbrain'), false) // POSIX distingue mayúsculas
  assert.equal(esAbsolutaPortable('docs/a.md'), false)
  assert.equal(dentroDeRaiz('/r/repo/docs/a.html', '/r/repo'), true)
  assert.equal(dentroDeRaiz('/r/repo-gemelo/a.html', '/r/repo'), false)
})
