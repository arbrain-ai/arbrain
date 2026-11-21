import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { acotarCss, huellaPieza, leerPieza, ligaPieza, rutaImagen } from '../../src/features/canvas/piezas/formato'
import { CSP_HOST, documentoHost } from '../../src/features/canvas/piezas/host-doc'
import { moverRecorrido, ocultosEnRecorrido, piezasDelCapitulo } from '../../src/features/canvas/piezas/recorrido'

const raiz = path.resolve(__dirname, '../../..')

test('piezas · formato: el ejemplo del contrato se lee entero', () => {
  const texto = readFileSync(path.join(raiz, 'docs/builds/lienzo-v17/piezas/ejemplo/pieza.html'), 'utf8')
  const r = leerPieza(texto)
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errores))
  if (!r.ok) return
  assert.equal(r.pieza.ficha.id, 'ejemplo')
  assert.equal(r.pieza.ficha.ancho, 1440)
  assert.equal(r.pieza.ficha.alto, 810)
  assert.equal(r.pieza.ficha.pasos, 2)
  assert.deepEqual(r.pieza.errores, [])
  assert.match(r.pieza.css, /^@scope \(\[data-pieza="ejemplo"\]\) \{/)
  assert.ok(r.pieza.js.includes('pieza.animar'))
  assert.ok(!r.pieza.html.includes('<script'), 'el marcado queda sin scripts')
  assert.ok(!r.pieza.html.includes('<style'), 'ni estilos')
  assert.ok(r.pieza.html.includes('data-ir="panel:estrategia"'))
})

test('piezas · formato: sin ficha o con ficha rota no es pieza; lo demás son avisos', () => {
  assert.equal(leerPieza('<div>hola</div>').ok, false)
  assert.equal(leerPieza('<script type="application/pieza+json">{ id: x }</script>').ok, false)
  assert.equal(leerPieza('<script type="application/pieza+json">{ "id": "Con Mayúsculas" }</script>').ok, false)
  const r = leerPieza(`<script type="application/pieza+json">{ "id": "a", "ancho": 5, "imagenes": ["../../.ssh/id", "contenido/x.png", "doc:contenido/y.webp", "notas.md"] }</script>
    <script src="https://cdn.algo/lib.js"></script><link rel="stylesheet" href="https://x/y.css"><div></div>
    <script type="text/plantilla"><b>{{x}}</b></script><script>console.log(1)</script>`)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.pieza.ficha.ancho, 1440, 'un ancho fuera de rango cae al de siempre')
  assert.deepEqual(r.pieza.ficha.imagenes, ['contenido/x.png', 'contenido/y.webp'])
  assert.equal(r.pieza.errores.length, 5, r.pieza.errores.join(' | '))   // ancho, 2 imágenes, script src, link
  assert.ok(r.pieza.html.includes('text/plantilla'), 'un <script> que no es JS se queda en el marcado')
  assert.equal(r.pieza.js.trim(), 'console.log(1)')
  assert.equal(r.pieza.ficha.fondo, 'propio')
  assert.equal(r.pieza.ficha.listo, 'auto')
})

test('piezas · formato: el CSS se acota a la pieza; keyframes y font-face salen; @import se cae', () => {
  const css = acotarCss(`/* nota { } */ @import url(x.css); :scope { color: red }
    h1 { content: "}{" }
    @keyframes late { from { opacity: 0 } to { opacity: 1 } }
    @media (min-width: 10px) { p { margin: 0 } }`, 'mi-pieza')
  assert.ok(!css.includes('@import'))
  assert.ok(!css.includes('nota'))
  const scope = css.indexOf('@scope ([data-pieza="mi-pieza"])')
  assert.ok(scope > 0)
  assert.ok(css.indexOf('@keyframes late') < scope, 'keyframes fuera del @scope')
  assert.ok(css.indexOf('@media') > scope, '@media dentro del @scope')
  assert.ok(css.includes('content: "}{"'), 'llaves dentro de cadenas intactas')
  assert.equal(acotarCss('', 'x'), '')
})

test('piezas · rutas e huellas', () => {
  assert.equal(rutaImagen('contenido/youtube/assets/library/a.png'), 'contenido/youtube/assets/library/a.png')
  assert.equal(rutaImagen('/etc/passwd'), null)
  assert.equal(rutaImagen('../fuera.png'), null)
  assert.equal(ligaPieza('doc:docs/builds/lienzo-v17/piezas/ejemplo/pieza.html'), 'docs/builds/lienzo-v17/piezas/ejemplo/pieza.html')
  assert.equal(ligaPieza('doc:docs/x.json'), null)
  assert.equal(ligaPieza('https://x.com/pieza.html'), null)
  assert.notEqual(huellaPieza('1-2', 'claro'), huellaPieza('1-2', 'oscuro'))
  assert.notEqual(huellaPieza('1-2', 'claro', 0), huellaPieza('1-2', 'claro'))
})

test('piezas · host: aislado y sin red', () => {
  assert.match(CSP_HOST, /default-src 'none'/)
  assert.match(CSP_HOST, /connect-src 'none'/)
  assert.ok(!CSP_HOST.includes('unsafe-eval'), 'sin eval: la CSP heredada de la edición cliente no lo admite')
  assert.ok(!/https?:/.test(CSP_HOST), 'ningún origen de red')
  const doc = documentoHost('var a = "</script>"; ', '.x{}</style>')
  assert.equal(doc.match(/<\/script>/g)?.length, 1, 'el runtime no cierra su propio <script>')
  assert.equal(doc.match(/<\/style>/g)?.length, 2)
  assert.ok(doc.includes('Content-Security-Policy'))
  // El runtime real existe y es JS válido.
  const runtime = readFileSync(path.join(raiz, 'arbrain/public/piezas/host.js'), 'utf8')
  assert.doesNotThrow(() => new Function(runtime))
  assert.ok(!/\bfetch\(|XMLHttpRequest|new Function|eval\(/.test(runtime), 'el host no pide red ni evalúa texto')
})

test('piezas · recorrido: primero los pasos del capítulo, luego el capítulo; atrás deja completo', () => {
  const caps = [{ caja: { x: 0, y: 0, width: 1000, height: 1000 } }, { caja: { x: 2000, y: 0, width: 1000, height: 1000 } }]
  const piezas = [
    { elId: 'a', caja: { x: 100, y: 100, width: 400, height: 300 }, pasos: 2 },
    { elId: 'b', caja: { x: 2100, y: 100, width: 400, height: 300 }, pasos: 1 },
    { elId: 'c', caja: { x: 2100, y: 600, width: 400, height: 300 }, pasos: 0 },
  ]
  const pasos = new Map<string, number>()
  const pasoDe = (id: string) => pasos.get(id) ?? 0
  assert.deepEqual(moverRecorrido(1, null, caps, piezas, pasoDe), { tipo: 'capitulo', i: 0, pasos: [{ elId: 'a', paso: 0 }] })
  assert.deepEqual(moverRecorrido(1, 0, caps, piezas, pasoDe), { tipo: 'paso', elId: 'a', paso: 1 })
  pasos.set('a', 2)
  assert.deepEqual(moverRecorrido(1, 0, caps, piezas, pasoDe), { tipo: 'capitulo', i: 1, pasos: [{ elId: 'b', paso: 0 }] })
  pasos.set('b', 1)
  assert.deepEqual(moverRecorrido(1, 1, caps, piezas, pasoDe), { tipo: 'nada' })
  assert.deepEqual(moverRecorrido(-1, 1, caps, piezas, pasoDe), { tipo: 'paso', elId: 'b', paso: 0 })
  pasos.set('b', 0)
  assert.deepEqual(moverRecorrido(-1, 1, caps, piezas, pasoDe), { tipo: 'capitulo', i: 0, pasos: [{ elId: 'a', paso: 2 }] })
  assert.deepEqual(moverRecorrido(1, 0, [], piezas, pasoDe), { tipo: 'nada' })
  assert.deepEqual(piezasDelCapitulo(piezas, caps[1].caja).map(p => p.elId), ['b', 'c'])
})

test('piezas · recorrido: `aparece` esconde hasta su capítulo (por título sin acentos o por id)', () => {
  const caps = [{ id: 'm1', titulo: 'Mi porqué' }, { id: 'm2', titulo: 'El funnel' }]
  const els = [{ id: 'x', aparece: 'mi porque' }, { id: 'y', aparece: 'm2' }, { id: 'z' }, { id: 'w', aparece: 'no existe' }]
  assert.deepEqual([...ocultosEnRecorrido(els, caps, null)].sort(), ['x', 'y'])
  assert.deepEqual([...ocultosEnRecorrido(els, caps, 0)], ['y'])
  assert.deepEqual([...ocultosEnRecorrido(els, caps, 1)], [])
})

test('piezas · el lector del banco está al día con formato.ts', async () => {
  const { generar } = await import('../../scripts/piezas/banco-formato.mjs')
  const actual = readFileSync(path.join(raiz, 'docs/builds/lienzo-v17/banco-formato.mjs'), 'utf8')
  assert.equal(actual, generar(), 'regenéralo: cd arbrain && node scripts/piezas/banco-formato.mjs')
})
