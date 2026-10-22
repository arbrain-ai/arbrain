import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { carpetaDeFoco, carpetaPermitida, comandoAbrir, dentroDeRaiz, nombreDeHost, pedidoLocal } from '../../src/features/cabina/explorador/abrir-carpeta'

const LISTA = ['CLAUDE.md', 'docs/a.md', 'docs/sub/b.txt', 'arbrain/src/app.tsx']
const cab = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null })

test('carpeta a la vista: la carpeta con foco, la de un archivo o la raíz', () => {
  assert.equal(carpetaDeFoco(null, null), '')
  assert.equal(carpetaDeFoco('docs', 'carpeta'), 'docs')
  assert.equal(carpetaDeFoco('docs/sub/b.txt', 'archivo'), 'docs/sub')
  assert.equal(carpetaDeFoco('CLAUDE.md', 'archivo'), '')
  assert.equal(carpetaDeFoco('docs/sub', null), 'docs')
})

test('validación de ruta: nunca sube, nunca absoluta, nunca escondida, solo carpetas que existen', () => {
  for (const p of ['..', '../etc', 'docs/../..', '/etc', '/Users/x', '~', '~/.ssh', 'C:/Windows', 'C:\\Windows', 'docs\\..\\..', 'a\0b', '.git', 'node_modules', '.ssh', 'x/.aws']) {
    const r = carpetaPermitida(p, LISTA)
    assert.ok('error' in r && r.status === 403, `debió rechazar ${JSON.stringify(p)}`)
  }
  assert.deepEqual(carpetaPermitida(42, LISTA), { error: 'Ruta inválida.', status: 400 })
  const no = carpetaPermitida('docs/nada', LISTA)
  assert.ok('error' in no && no.status === 404)
  // Un archivo no es carpeta.
  assert.ok('error' in carpetaPermitida('CLAUDE.md', LISTA))
  assert.deepEqual(carpetaPermitida('', LISTA), { rel: '' })
  assert.deepEqual(carpetaPermitida(undefined, LISTA), { rel: '' })
  assert.deepEqual(carpetaPermitida('docs/sub', LISTA), { rel: 'docs/sub' })
  assert.deepEqual(carpetaPermitida('./docs/', LISTA), { rel: 'docs' })
})

test('dentro de la raíz ya resuelta (un enlace simbólico no saca del árbol)', () => {
  assert.ok(dentroDeRaiz('/Users/usuario/repo', '/Users/usuario/repo'))
  assert.ok(dentroDeRaiz('/Users/usuario/repo/docs', '/Users/usuario/repo/'))
  assert.ok(!dentroDeRaiz('/Users/usuario/repo-otro', '/Users/usuario/repo'))
  assert.ok(!dentroDeRaiz('/Users/usuario', '/Users/usuario/repo'))
  assert.ok(!dentroDeRaiz('/etc', '/Users/usuario/repo'))
  assert.ok(!dentroDeRaiz('/x', ''))
  // Windows: sin distinguir mayúsculas y con cualquier barra.
  assert.ok(dentroDeRaiz('C:\\Users\\A\\Repo\\docs', 'c:/users/a/repo', 'win32'))
  assert.ok(!dentroDeRaiz('C:\\Users\\A\\Repo2', 'C:\\Users\\A\\Repo', 'win32'))
})

test('comando por plataforma: con argumentos, sin shell, solo rutas absolutas', () => {
  assert.deepEqual(comandoAbrir('darwin', '/Users/usuario/repo/docs'), { cmd: 'open', args: ['/Users/usuario/repo/docs'] })
  assert.deepEqual(comandoAbrir('win32', 'C:\\Users\\a\\repo/docs'), { cmd: 'explorer.exe', args: ['C:\\Users\\a\\repo\\docs'] })
  assert.deepEqual(comandoAbrir('win32', '\\\\servidor\\comp\\x'), { cmd: 'explorer.exe', args: ['\\\\servidor\\comp\\x'] })
  assert.deepEqual(comandoAbrir('linux', '/home/a/repo', { DISPLAY: ':0' }), { cmd: 'xdg-open', args: ['/home/a/repo'] })
  assert.deepEqual(comandoAbrir('linux', '/home/a/repo', { WAYLAND_DISPLAY: 'wayland-0' }), { cmd: 'xdg-open', args: ['/home/a/repo'] })
  const sin = comandoAbrir('linux', '/home/a/repo', {})
  assert.ok('error' in sin && /entorno gráfico/.test(sin.error) && !sin.error.includes('\n'))
  // Nada que se lea como opción ni ruta relativa.
  for (const [pl, r] of [['darwin', '-a Terminal'], ['darwin', 'docs'], ['linux', '--help'], ['win32', '/select,C:\\x'], ['win32', 'docs'], ['darwin', ''], ['darwin', '/a\0b']] as const) {
    assert.ok('error' in comandoAbrir(pl, r, { DISPLAY: ':0' }), `debió rechazar ${pl} ${JSON.stringify(r)}`)
  }
})

test('solo desde esta computadora', () => {
  assert.equal(nombreDeHost('127.0.0.1:4795'), '127.0.0.1')
  assert.equal(nombreDeHost('[::1]:3000'), '[::1]')
  assert.ok(pedidoLocal(cab({ host: '127.0.0.1:4795' })))
  assert.ok(pedidoLocal(cab({ host: 'localhost:3000' })))
  assert.ok(pedidoLocal(cab({ host: '[::1]:3000', 'x-forwarded-for': '127.0.0.1' })))
  assert.ok(!pedidoLocal(cab({})))
  assert.ok(!pedidoLocal(cab({ host: 'estudio.ejemplo.ts.net' })))
  assert.ok(!pedidoLocal(cab({ host: '192.168.1.20:3000' })))
  assert.ok(!pedidoLocal(cab({ host: '127.0.0.1:3000', 'x-forwarded-for': '203.0.113.9' })))
  assert.ok(!pedidoLocal(cab({ host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1, 203.0.113.9' })))
})
