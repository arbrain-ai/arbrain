import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { absoluta, ancestros, buscar, claseDe, esCarpeta, hijosDe, lenguajeDe, relativaSegura, sinEnlacesInternos, visible } from '../../src/features/cabina/explorador/arbol'
import { inputArchivo, planApertura } from '../../src/features/cabina/explorador/abrir'
import { lineasHtml } from '../../src/features/cabina/explorador/codigo'
import { parseMostrar, seccionDe } from '../../src/features/cabina/model'
import { OCULTAS_POR_DEFECTO, SECCIONES_MENU, visibles } from '../../src/features/cabina/panel/menu-orden'

const LISTA = [
  'CLAUDE.md', 'README.md',
  'docs/a.md', 'docs/Árbol de decisión.md', 'docs/sub/b.txt', 'docs/sub/c.png',
  'arbrain/src/app.tsx', 'arbrain/package.json',
  'agent-server/src/server.ts',
]

test('rutas prohibidas: nunca sube, nunca absoluta, nunca a lo escondido ni a credenciales', () => {
  for (const p of [
    '..', '../etc/passwd', 'docs/../../x', 'docs/./../..', '/etc/passwd', '/Users/x/.ssh', '~/.ssh/id_rsa', '~', 'C:/Windows', 'docs\\..\\..\\x', 'a\0b',
    'node_modules', 'arbrain/node_modules/react', '.git', '.git/config', 'arbrain/.next/server', '.ssh', 'x/.aws/credentials', 'x/.kube/config', '.docker/config.json',
    '.env', 'agent-server/.env', 'arbrain/.env.local', 'x/id_rsa', 'x/id_ed25519.pub', 'x/server.pem', 'x/cert.key', 'x/llave.p12',
    '.claude/memory/reference/credenciales-operativas.md', 'docs/secret-plan.md', 'x/secrets/y.md', 'x/passwords.txt', '.netrc', '.npmrc',
  ]) assert.ok('error' in relativaSegura(p), `debió rechazar ${JSON.stringify(p)}`)
  assert.ok('error' in relativaSegura('a'.repeat(1001)))
})

test('rutas válidas: relativas a la raíz, limpias', () => {
  assert.deepEqual(relativaSegura(''), { rel: '' })
  assert.deepEqual(relativaSegura(null), { rel: '' })
  assert.deepEqual(relativaSegura('.'), { rel: '' })
  assert.deepEqual(relativaSegura('docs//sub/./'), { rel: 'docs/sub' })
  assert.deepEqual(relativaSegura(' arbrain/src '), { rel: 'arbrain/src' })
  // `.env.example` también se esconde: el patrón es conservador (mejor de más que una llave a la vista).
  assert.ok('error' in relativaSegura('agent-server/.env.example'))
})

test('visible: se esconde node_modules, .git, .next, .DS_Store y lo que parece llave', () => {
  assert.equal(visible('docs/a.md'), true)
  assert.equal(visible('.claude/skills/x/SKILL.md'), true)
  assert.equal(visible('.gitignore'), true)
  for (const p of ['node_modules/x.js', 'a/.git/HEAD', 'arbrain/.next/x', 'docs/.DS_Store', 'agent-server/.env', 'a/.ssh/known_hosts', 'k/id_rsa', 'z/tls.key'])
    assert.equal(visible(p), false, p)
})

test('hijosDe: carpetas primero con su cuenta, luego archivos, por nombre', () => {
  assert.deepEqual(hijosDe(LISTA, '').map(e => [e.tipo, e.nombre, e.n]), [
    ['carpeta', 'agent-server', 1], ['carpeta', 'arbrain', 2], ['carpeta', 'docs', 4], ['archivo', 'CLAUDE.md', undefined], ['archivo', 'README.md', undefined],
  ])
  assert.deepEqual(hijosDe(LISTA, 'docs').map(e => e.ruta), ['docs/sub', 'docs/a.md', 'docs/Árbol de decisión.md'])
  assert.deepEqual(hijosDe(LISTA, 'docs/sub').map(e => e.nombre), ['b.txt', 'c.png'])
  // Un prefijo no es una carpeta: «doc» no ve lo de «docs».
  assert.deepEqual(hijosDe(LISTA, 'doc'), [])
  assert.equal(esCarpeta(LISTA, 'docs/sub'), true)
  assert.equal(esCarpeta(LISTA, 'doc'), false)
  assert.equal(esCarpeta(LISTA, 'docs/a.md'), false)
  assert.equal(esCarpeta(LISTA, ''), true)
})

test('buscar por nombre: sin acentos, lo que empieza igual primero, carpetas incluidas y la marca donde coincide', () => {
  const r = buscar(LISTA, 'arbol')
  assert.equal(r.resultados[0].ruta, 'docs/Árbol de decisión.md')
  assert.deepEqual(r.resultados[0].marca, [0, 5])
  assert.deepEqual(buscar(LISTA, 'SUB').resultados.map(x => [x.tipo, x.ruta]), [['carpeta', 'docs/sub']])
  assert.deepEqual(buscar(LISTA, 'md').resultados.map(x => x.ruta), ['CLAUDE.md', 'README.md', 'docs/a.md', 'docs/Árbol de decisión.md'])
  assert.deepEqual(buscar(LISTA, '   ').resultados, [])
  // Con «/», contra la ruta entera.
  assert.deepEqual(buscar(LISTA, 'sub/c').resultados.map(x => x.ruta), ['docs/sub/c.png'])
  // Tope de resultados con el total real.
  const muchos = Array.from({ length: 100 }, (_, i) => `x/f${i}.md`)
  const t = buscar(muchos, 'f', 10)
  assert.equal(t.resultados.length, 10)
  assert.equal(t.total, 100)
})

test('ancestros, absoluta, clases e idiomas', () => {
  assert.deepEqual(ancestros('a/b/c.md'), ['a', 'a/b'])
  assert.deepEqual(ancestros('c.md'), [])
  assert.equal(absoluta('/r/', 'a/b'), '/r/a/b')
  assert.equal(absoluta('/r', ''), '/r')
  assert.deepEqual(['a.md', 'b.tsx', 'c.json', 'd.png', 'e.mov', 'f.pdf', 'g.html', '.gitignore', 'h.bin', 'Makefile'].map(claseDe),
    ['md', 'codigo', 'datos', 'imagen', 'video', 'pdf', 'html', 'config', 'otro', 'config'])
  assert.equal(lenguajeDe('x.tsx'), 'typescript')
  assert.equal(lenguajeDe('x.py'), 'python')
  assert.equal(lenguajeDe('Dockerfile'), 'dockerfile')
  assert.equal(lenguajeDe('x.desconocido'), undefined)
})

test('abrir: un clic reusa la vista previa; doble clic la fija; lo ya abierto se trae', () => {
  const md = '/r/docs/a.md', ts = '/r/src/x.ts'
  assert.deepEqual(planApertura([], md, 'previa'), { tipo: 'nueva' })
  const previa = { id: 'p1', input: inputArchivo(md, 'a.md', 'previa') }
  assert.deepEqual(planApertura([previa], ts, 'previa'), { tipo: 'reemplazar', id: 'p1' })
  assert.deepEqual(planApertura([previa], ts, 'fija'), { tipo: 'nueva' })
  assert.deepEqual(planApertura([previa], md, 'previa'), { tipo: 'traer', id: 'p1', fijar: false })
  assert.deepEqual(planApertura([previa], md, 'fija'), { tipo: 'traer', id: 'p1', fijar: true })
  // Una previa que Daniel guardó ya no se reemplaza.
  assert.deepEqual(planApertura([{ ...previa, guardada: true }], ts, 'previa'), { tipo: 'nueva' })
  // Un documento que abrió Levy (sin marca del explorador) se trae y pasa a enseñar el código.
  assert.deepEqual(planApertura([{ id: 'l1', input: { vista: 'documento', ruta: ts } }], ts, 'previa'), { tipo: 'traer', id: 'l1', fijar: true })
  // Nunca toca pestañas que no son documento.
  assert.deepEqual(planApertura([{ id: 'c', input: { vista: 'calendario' } }], md, 'previa'), { tipo: 'nueva' })
})

test('abrir: la previa que se reemplaza es la de la ventana destino', () => {
  const previaOtra = { id: 'p1', input: inputArchivo('/r/a.md', 'a.md', 'previa') }
  const previaDestino = { id: 'p2', input: inputArchivo('/r/b.md', 'b.md', 'previa') }
  const enIzq = (id: string) => id === 'p2'
  assert.deepEqual(planApertura([previaOtra, previaDestino], '/r/c.ts', 'previa', enIzq), { tipo: 'reemplazar', id: 'p2' })
  assert.deepEqual(planApertura([previaOtra], '/r/c.ts', 'previa', enIzq), { tipo: 'nueva' })
})

test('código: el HTML resaltado se parte por línea sin dejar spans abiertos', () => {
  const html = 'const <span class="hljs-string">"a\nb"</span>;\n<span class="hljs-comment">/* x\n<span class="hljs-doctag">y</span>\nz */</span>'
  const l = lineasHtml(html)
  assert.equal(l.length, 5)
  assert.equal(l[0], 'const <span class="hljs-string">"a</span>')
  assert.equal(l[1], '<span class="hljs-string">b"</span>;')
  assert.equal(l[3], '<span class="hljs-comment"><span class="hljs-doctag">y</span></span>')
  for (const x of l) assert.equal((x.match(/<span/g) ?? []).length, (x.match(/<\/span>/g) ?? []).length, x)
  assert.deepEqual(lineasHtml('a &lt; b'), ['a &lt; b'])
})

test('sección del «+»: visible por defecto, opcional en Ajustes › Panel, y la misma lista que el servidor', () => {
  assert.ok(SECCIONES_MENU.includes('explorador'))
  assert.ok(!OCULTAS_POR_DEFECTO.includes('explorador'))
  assert.ok(visibles(SECCIONES_MENU, OCULTAS_POR_DEFECTO).includes('explorador'))
  assert.ok(!visibles(SECCIONES_MENU, ['explorador']).includes('explorador'))
  const servidor = readFileSync(join(process.cwd(), 'server/src/cabina/panel-ajustes.ts'), 'utf8')
  assert.match(servidor, /explorador: 'Archivos'/)
  const tools = readFileSync(join(process.cwd(), 'server/src/cabina/tools.ts'), 'utf8')
  assert.match(/export const VISTAS = \[([^\]]*)\]/.exec(tools)![1], /'explorador'/)
})

test('mostrar {vista:"explorador"} es una vista de Levy sin sección a la cual expandir', () => {
  assert.deepEqual(parseMostrar(JSON.stringify({ vista: 'explorador', fijar: true }))?.vista, 'explorador')
  assert.equal(seccionDe({ vista: 'explorador' }), null)
  // Lo que pide Levy nunca trae la marca del explorador (el código sigue sin enseñarse en sus documentos).
  assert.equal(parseMostrar(JSON.stringify({ vista: 'documento', ruta: 'a.ts', explorador: 'fija' }))?.explorador, undefined)
})

test('sinEnlacesInternos: oculta enlaces cuyo destino cae dentro de la raíz y deja los que salen', () => {
  const destinos = new Map([['ext', '/r/arbrain/extension'], ['AGENTS.md', '/r/CLAUDE.md'], ['fuera', '/otro/lugar']])
  assert.deepEqual(sinEnlacesInternos(['ext', 'AGENTS.md', 'fuera', 'a.md'], destinos, '/r/'), ['fuera', 'a.md'])
  assert.deepEqual(sinEnlacesInternos(['x'], new Map([['x', '/rr/y']]), '/r'), ['x'])
})
