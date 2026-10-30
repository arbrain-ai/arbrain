import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { alcanceDeAssets, resolverRuta, tipoDocumento } from '../../src/features/cabina/documento/ruta'
import { partirFrontmatter, postDelFeed, enUnaLinea, parrafos } from '../../src/features/cabina/documento/frontmatter'
import { contarCambios, diffPalabras, plegar } from '../../src/features/cabina/documento/diff'
import { parseMostrar } from '../../src/features/cabina/model'
import { claveDe } from '../../src/features/cabina/panel/fijadas'

const r = { repo: '/Users/x/Developer/artificial-brain', home: '/Users/x' }

test('rutas: repo, ~/Developer y /tmp; nunca subir, salir ni credenciales', () => {
  assert.deepEqual(resolverRuta('docs/a.md', r), { abs: '/Users/x/Developer/artificial-brain/docs/a.md' })
  assert.deepEqual(resolverRuta('~/Developer/p/./b.txt', r), { abs: '/Users/x/Developer/p/b.txt' })
  assert.ok('error' in resolverRuta('docs/../../../etc/passwd', r))
  assert.ok('error' in resolverRuta('/etc/hosts', r))
  assert.ok('error' in resolverRuta('~/Library/a.md', r))
  for (const p of ['~/Developer/p/.ssh/x.md', '~/Developer/p/.aws/c.txt', '~/Developer/p/.env.local', '~/Developer/p/id_ed25519', '/tmp/k.pem', 'credenciales-operativas.md'])
    assert.ok('error' in resolverRuta(p, r), p)
})

test('tipo por extensión: el código nunca se pinta', () => {
  assert.deepEqual(['a.MD', 'b.txt', 'c.htm', 'd.mermaid', 'e.webp', 'f.mov', 'g.tsx', 'h.py', 'i.bin'].map(tipoDocumento), ['md', 'txt', 'html', 'mermaid', 'imagen', 'video', 'codigo', 'codigo', 'otro'])
})

test('assets de un pergamino: dos carpetas arriba, sin salir del proyecto', () => {
  assert.equal(alcanceDeAssets('/Users/x/Developer/artificial-brain/biblioteca/pergaminos/mapa/index.html', r), '/Users/x/Developer/artificial-brain/biblioteca')
  assert.equal(alcanceDeAssets('/Users/x/Developer/artificial-brain/a/index.html', r), '/Users/x/Developer/artificial-brain')
  assert.equal(alcanceDeAssets('/Users/x/Developer/otro/index.html', r), '/Users/x/Developer/otro')
  assert.equal(alcanceDeAssets('/tmp/demo/x/index.html', r), '/tmp/demo')
})

test('frontmatter y post del feed: título de **Título:**, cuerpo tras el primer ---', () => {
  const md = '---\ndestino: feed-sfc\nimagen: "portada/p3.png"\n---\n# Post demo\n\n> notas\n\n---\n\n**Título:** Clase especial\n\nComunidad!\n\n🚨 Sábado **17**\nlínea 2\n'
  const { datos, cuerpo } = partirFrontmatter(md)
  assert.deepEqual(datos, { destino: 'feed-sfc', imagen: 'portada/p3.png' })
  const p = postDelFeed(datos, cuerpo)
  assert.equal(p.titulo, 'Clase especial')
  assert.equal(p.contenido, 'Comunidad!\n\n🚨 Sábado **17**\nlínea 2')
  assert.equal(p.categoria.nombre, 'ANUNCIOS')
  assert.equal(enUnaLinea(p.contenido), 'Comunidad! 🚨 Sábado 17 línea 2')
  assert.deepEqual(parrafos(p.contenido)[1], [{ texto: '🚨 Sábado ' }, { texto: '17', negrita: true }, { salto: true }, { texto: 'línea 2' }])
  assert.deepEqual(partirFrontmatter('# sin fm').datos, {})
})

test('el POST-DEMO real se lee igual que lo que verá el feed', { skip: !safeRead() }, () => {
  const { datos, cuerpo } = partirFrontmatter(safeRead()!)
  const p = postDelFeed(datos, cuerpo)
  assert.match(p.titulo, /Clase especial en vivo/)
  assert.match(p.contenido, /^Comunidad!/)
  assert.ok(!p.contenido.includes('Título'))
})
// Relativo al repo (arbrain/tests/cabina → raíz): en una copia sin ese documento, la prueba se salta.
function safeRead() { try { return readFileSync(path.join(__dirname, '../../../docs/business-os/POST-DEMO.md'), 'utf8') } catch { return null } }

test('cambios por palabras: solo lo tocado, y se pliega lo largo', () => {
  const p = diffPalabras('Hola mi gente, hoy grabamos el video', 'Hola gente, hoy grabamos el video largo')
  assert.deepEqual(p.filter(x => x.tipo !== 'igual'), [{ tipo: 'quitado', texto: 'mi ' }, { tipo: 'agregado', texto: ' largo' }])
  assert.equal(contarCambios(p), 2)
  assert.equal(contarCambios(diffPalabras('a b c', 'a b c')), 0)
  const largo = 'palabra '.repeat(200)
  assert.ok(plegar(diffPalabras(largo + 'fin', largo + 'final')).some(x => x.tipo === 'pliegue'))
  const reemplazo = diffPalabras('el perro come', 'el gato duerme')
  assert.equal(reemplazo.map(x => x.texto).filter((_, i) => reemplazo[i].tipo !== 'quitado').join(''), 'el gato duerme')
})

test('mostrar documento: ruta obligatoria; una pestaña por archivo', () => {
  assert.equal(parseMostrar(JSON.stringify({ vista: 'documento' })), null)
  const a = parseMostrar(JSON.stringify({ vista: 'documento', ruta: 'docs/a.md', titulo: 'Post demo', fijar: true }))!
  const b = parseMostrar(JSON.stringify({ vista: 'documento', ruta: 'docs/a.md', compararCon: 'HEAD' }))!
  assert.equal(a.titulo, 'Post demo')
  assert.equal(claveDe(a), claveDe(b))
  assert.notEqual(claveDe(a), claveDe({ ...a, ruta: 'docs/b.md' }))
  assert.equal(parseMostrar(JSON.stringify({ vista: 'documento', ruta: 'x.md', soltar: true }))!.soltar, true)
})
