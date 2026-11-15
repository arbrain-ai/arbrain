import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { huellaDeDatos, leerFicha, leerMensaje, type EstadoDato } from '../../src/features/canvas/islas/protocolo'
import { buscarCapitulo, dominioPermitido, leerDestino, SECCIONES, vistasDeSecciones } from '../../src/features/canvas/islas/destinos'
import { esVistaConocida } from '../../src/features/cabina/model'

test('islas · protocolo: lo que manda una isla se valida; lo ajeno es null', () => {
  assert.deepEqual(leerMensaje({ tipo: 'accion', destino: ' panel:finanzas ' }), { tipo: 'accion', destino: 'panel:finanzas' })
  assert.deepEqual(leerMensaje({ tipo: 'pedir', fuente: 'pulso:venta' }), { tipo: 'pedir', fuente: 'pulso:venta' })
  assert.equal(leerMensaje({ tipo: 'pedir', fuente: '../../secreto' }), null)
  assert.equal(leerMensaje({ tipo: 'pedir', fuente: 'Pulso:Venta' }), null, 'fuentes en minúsculas')
  assert.equal(leerMensaje({ tipo: 'accion', destino: '' }), null)
  assert.equal(leerMensaje({ tipo: 'accion', destino: 'x'.repeat(700) }), null)
  // Los mensajes del script del tema y del lector (arbrain-*) no son del protocolo de islas.
  assert.equal(leerMensaje({ tipo: 'arbrain-rueda', dy: 3 }), null)
  assert.equal(leerMensaje('hola'), null)
  assert.equal(leerMensaje(null), null)
  assert.equal(leerMensaje([1, 2]), null)
})

test('islas · protocolo: la rueda llega acotada y el gesto con escala sana', () => {
  const r = leerMensaje({ tipo: 'rueda', x: 10, y: 20, deltaX: 0, deltaY: 99999, deltaMode: 7, ctrlKey: true, metaKey: 'sí' })
  assert.deepEqual(r, { tipo: 'rueda', x: 10, y: 20, deltaX: 0, deltaY: 4000, deltaMode: 0, ctrlKey: true, metaKey: false, shiftKey: false })
  assert.equal(leerMensaje({ tipo: 'rueda', x: NaN, y: 0, deltaX: 0, deltaY: 1 }), null)
  assert.deepEqual(leerMensaje({ tipo: 'gesto', fase: 'mov', escala: -2, x: 5, y: 6 }), { tipo: 'gesto', fase: 'mov', escala: 1, x: 5, y: 6 })
  assert.equal(leerMensaje({ tipo: 'gesto', fase: 'otra', escala: 1 }), null)
})

test('islas · protocolo: la foto sin bitmap llega con su error, no se inventa', () => {
  const m = leerMensaje({ tipo: 'foto', pedido: 3, bitmap: null, error: 'falló' })
  assert.deepEqual(m, { tipo: 'foto', pedido: 3, bitmap: null, ancho: 0, alto: 0, ms: undefined, error: 'falló' })
  assert.equal(leerMensaje({ tipo: 'foto' }), null)
})

test('islas · isla.json: tolera basura campo por campo; sin id no es isla', () => {
  assert.equal(leerFicha({ titulo: 'x' }), null)
  assert.equal(leerFicha({ id: 'Con Espacios' }), null)
  assert.deepEqual(leerFicha({ id: 'norte', ancho: 1440, alto: 50, fuentes: ['pulso:venta', 'MAL', 'pulso:venta', 3], acciones: ['panel:bi'] }),
    { id: 'norte', titulo: 'norte', ancho: 1440, alto: 900, fuentes: ['pulso:venta'], acciones: ['panel:bi'] })
})

test('islas · huella: cambia con el dato, el tema y el archivo; no con el orden de llegada', () => {
  const a = new Map<string, { valor: unknown; estado: EstadoDato }>([['pulso:venta', { valor: { cifra: '7' }, estado: 'ok' }], ['embudo', { valor: null, estado: 'sin-dato' }]])
  const b = new Map([...a].reverse())
  assert.equal(huellaDeDatos('h1', 'oscuro', a), huellaDeDatos('h1', 'oscuro', b))
  assert.notEqual(huellaDeDatos('h1', 'oscuro', a), huellaDeDatos('h1', 'claro', a))
  assert.notEqual(huellaDeDatos('h1', 'oscuro', a), huellaDeDatos('h2', 'oscuro', a))
  const c = new Map(a); c.set('pulso:venta', { valor: { cifra: '8' }, estado: 'ok' })
  assert.notEqual(huellaDeDatos('h1', 'oscuro', a), huellaDeDatos('h1', 'oscuro', c))
})

test('islas · destinos: paneles por su nombre en palabras de Daniel', () => {
  assert.deepEqual(leerDestino('panel:finanzas'), SECCIONES.finanzas)
  assert.deepEqual(leerDestino('panel:Tu negocio › El pulso'), SECCIONES.pulso)
  assert.deepEqual(leerDestino('panel:BI'), SECCIONES.bi)
  assert.deepEqual(leerDestino('panel:taller'), { tipo: 'casa', casa: 'taller', clave: 'taller' })
  assert.deepEqual(leerDestino('panel:taller/rutinas'), { tipo: 'casa', casa: 'taller', segmento: 'rutinas', clave: 'taller:rutinas' })
  assert.equal(leerDestino('panel:borrar-todo'), null)
  assert.equal(leerDestino('panel:'), null)
})

test('islas · destinos: cada sección abre una vista que el panel sabe pintar', () => {
  for (const v of vistasDeSecciones()) assert.ok(esVistaConocida(v), `vista desconocida: ${v}`)
})

test('islas · destinos: doc valida igual que las ligas del lienzo', () => {
  assert.deepEqual(leerDestino('doc:docs/plan.md#hoy'), { tipo: 'doc', ruta: 'docs/plan.md', fragmento: 'hoy' })
  assert.equal(leerDestino('doc:../../.ssh/id_rsa'), null)
  assert.equal(leerDestino('doc:/etc/passwd')?.tipo, 'doc', 'la / inicial es cortesía: queda relativa al repo')
  assert.equal((leerDestino('doc:/etc/passwd') as { ruta: string }).ruta, 'etc/passwd')
  assert.equal(leerDestino('doc:~/x'), null)
})

test('islas · destinos: url solo https y solo dominios de la lista; lo propio se abre dentro', () => {
  assert.deepEqual(leerDestino('url:https://polar.sh/dashboard/mi-organizacion'), { tipo: 'url', url: 'https://polar.sh/dashboard/mi-organizacion' })
  assert.deepEqual(leerDestino('url:https://studio.youtube.com/'), { tipo: 'url', url: 'https://studio.youtube.com/' })
  assert.equal(leerDestino('url:http://polar.sh/'), null, 'http no')
  assert.equal(leerDestino('url:https://polar.sh.malo.com/'), null, 'sufijo engañoso')
  assert.equal(leerDestino('url:https://user:pw@polar.sh/'), null)
  assert.equal(leerDestino('url:javascript:alert(1)'), null)
  assert.equal(leerDestino('url:https://ejemplo.com'), null)
  const propia = (u: URL) => u.hostname === 'localhost'
  assert.deepEqual(leerDestino('url:http://localhost:3000/finanzas', propia), { tipo: 'url', url: 'http://localhost:3000/finanzas' })
  assert.ok(dominioPermitido('www.skool.com'))
  assert.ok(!dominioPermitido('skool.com.evil.io'))
  // Un dominio propio de la instalación no está en la lista: lo abre el host como suyo.
  const deLaCasa = (u: URL) => u.hostname === 'mi-negocio.example'
  assert.deepEqual(leerDestino('url:https://app.mi-negocio.example/x', u => deLaCasa(new URL(u.href.replace('app.', '')))), { tipo: 'url', url: 'https://app.mi-negocio.example/x' })
  assert.equal(leerDestino('url:https://mi-negocio.example/x'), null)
})

test('islas · destinos: lienzo vuela a un capítulo o abre otra página', () => {
  assert.deepEqual(leerDestino('lienzo:El sistema nervioso'), { tipo: 'capitulo', capitulo: 'El sistema nervioso' })
  assert.deepEqual(leerDestino('lienzo:page:63eb4870-aaaa'), { tipo: 'pagina', paginaId: '63eb4870-aaaa' })
  assert.equal(leerDestino('lienzo:page:x/../y'), null)
  assert.equal(leerDestino('fuego:algo'), null)
  const caps = [{ id: 'f1', titulo: 'Mi norte' }, { id: 'f2', titulo: 'El sistema nervioso' }, { id: 'f3', titulo: 'La oferta' }]
  assert.equal(buscarCapitulo(caps, 'f3'), 2)
  assert.equal(buscarCapitulo(caps, 'el SISTEMA nervioso'), 1)
  assert.equal(buscarCapitulo(caps, 'Mí nórte'), 0)
  assert.equal(buscarCapitulo(caps, 'La of'), 2)
  assert.equal(buscarCapitulo(caps, 'nada'), -1)
})
