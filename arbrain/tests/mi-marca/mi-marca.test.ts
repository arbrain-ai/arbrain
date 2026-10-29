// Mi marca (29 oct 2026): colores, logo y nombre del dueño desde `<cerebro>/mi-marca/`, servidos en tiempo de ejecución
// (lib/mi-marca.ts). Carpetas temporales; nunca el cerebro real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dirMiMarca, leerMiMarca, leerTema, MAX_TEMA, nombreValido } from '../../src/lib/mi-marca'
import { tituloConMarca } from '../../src/lib/mi-marca-titulo'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { decidirCliente } from '../../src/lib/proxy-cliente'

const RAIZ = join(__dirname, '..', '..')
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

function cerebro(archivos: Record<string, string | Buffer> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'mi-marca-'))
  for (const [rel, c] of Object.entries(archivos)) {
    mkdirSync(join(home, 'mi-marca'), { recursive: true })
    writeFileSync(join(home, 'mi-marca', rel), c)
  }
  return home
}

async function conCliente<T>(home: string, f: () => Promise<T>): Promise<T> {
  const antes = { e: process.env.ARBRAIN_EDICION, h: process.env.ARBRAIN_HOME }
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_HOME = home
  try { return await f() } finally {
    if (antes.e === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = antes.e
    if (antes.h === undefined) delete process.env.ARBRAIN_HOME; else process.env.ARBRAIN_HOME = antes.h
  }
}

test('dirMiMarca: <ARBRAIN_HOME>/mi-marca en cliente; null si la instalación no sabe dónde está su cerebro', () => {
  assert.equal(dirMiMarca({ ARBRAIN_EDICION: 'cliente', ARBRAIN_HOME: '/x/cerebro' }), '/x/cerebro/mi-marca')
  assert.equal(dirMiMarca({ ARBRAIN_EDICION: 'cliente' }), null)
})

test('leer: tema tal cual, nombre y logo con versión; sin carpeta, nada; tema demasiado grande, ignorado', async () => {
  const home = cerebro({ 'tema.css': 'html:root:not(.dark) { --primary: #0E7C66; }\n', 'marca.json': '{ "nombre": "  Acme  " }', 'logo.png': Buffer.from([0x89, 0x50]) })
  const dir = join(home, 'mi-marca')
  assert.equal(await leerTema(dir), 'html:root:not(.dark) { --primary: #0E7C66; }\n')
  const m = await leerMiMarca(dir)
  assert.equal(m.nombre, 'Acme')
  assert.match(m.logo ?? '', /^\/api\/mi-marca\/logo\?v=\d+$/)
  assert.deepEqual(await leerMiMarca(join(cerebro(), 'mi-marca')), { nombre: null, logo: null })
  assert.equal(await leerTema(join(cerebro({ 'tema.css': 'a'.repeat(MAX_TEMA + 1) }), 'mi-marca')), '')
  assert.equal((await leerMiMarca(join(cerebro({ 'marca.json': '{roto' }), 'mi-marca'))).nombre, null)
})

test('nombre: texto corto de una línea; título con la marca', () => {
  for (const no of [undefined, 3, '', '   ', 'x'.repeat(41), 'a\nb', '<script>']) assert.equal(nombreValido(no), null, String(no))
  assert.equal(tituloConMarca('Panel · Arbrain', 'Acme'), 'Panel · Acme')
  assert.equal(tituloConMarca('Tu Arbrain', 'Acme'), 'Acme')
  assert.equal(tituloConMarca('Panel · Arbrain', null), 'Panel · Arbrain')
})

test('rutas: /api/mi-marca/tema sirve el CSS del dueño (o una hoja vacía), el logo y el JSON', async () => {
  const { GET: tema } = await import('../../src/app/api/mi-marca/tema/route')
  const { GET: logo } = await import('../../src/app/api/mi-marca/logo/route')
  const { GET: marca } = await import('../../src/app/api/mi-marca/route')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
  await conCliente(cerebro({ 'tema.css': 'html:root:not(.dark) { --primary: #ff0066; }\n', 'logo.svg': svg, 'marca.json': '{"nombre":"Acme"}' }), async () => {
    const r = await tema()
    assert.equal(r.headers.get('content-type'), 'text/css; charset=utf-8')
    assert.match(await r.text(), /--primary: #ff0066/)
    const l = await logo()
    assert.equal(l.status, 200)
    assert.equal(l.headers.get('content-type'), 'image/svg+xml')
    assert.match(l.headers.get('content-security-policy') ?? '', /default-src 'none'.*sandbox/, 'un SVG con script no corre')
    assert.equal((await marca().then((x) => x.json())).nombre, 'Acme')
  })
  await conCliente(cerebro(), async () => {
    const r = await tema()
    assert.equal(r.status, 200, 'sin tema, hoja vacía: nunca un 404 en la consola')
    assert.doesNotMatch(await r.text(), /--/)
    assert.equal((await logo()).status, 404)
  })
})

test('proxy: /api/mi-marca existe en cliente y pasa sin sesión (la pantalla de entrada también lleva la marca)', () => {
  for (const r of ['/api/mi-marca', '/api/mi-marca/tema', '/api/mi-marca/logo']) {
    assert.ok(apiPermitidaEnCliente(r), r)
    assert.deepEqual(decidirCliente(r, false, true), { tipo: 'pasa' }, r)
  }
  assert.ok(!apiPermitidaEnCliente('/api/mi-marcas'))
})

test('layout: en cliente enlaza el tema DESPUÉS de las hojas del autor y monta MiMarca', () => {
  const l = leer('src/app/layout.tsx')
  const enlace = l.indexOf('href="/api/mi-marca/tema"')
  assert.ok(enlace > 0)
  assert.ok(enlace > l.indexOf("import './globals.css'") && enlace > l.lastIndexOf('rel="preload"'), 'después de los estilos del autor')
  assert.match(l, /\{CLIENTE && <link rel="stylesheet" href="\/api\/mi-marca\/tema" \/>\}/)
  assert.match(l, /\{CLIENTE && <MiMarca \/>\}/)
})

// Especificidad (a, b, c) de un selector simple de los que usan globals.css y lenguaje.css.
function especificidad(sel: string): [number, number, number] {
  let s = sel.replace(/:where\([^)]*\)/g, '').replace(/:(not|is)\(([^)]*)\)/g, ' $2')
  const ids = (s.match(/#[\w-]+/g) ?? []).length
  const clases = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length
  s = s.replace(/\[[^\]]*\]/g, '').replace(/::?[\w-]+/g, '').replace(/[.#][\w-]+/g, '')
  const tipos = (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return [ids, clases, tipos]
}
const mayor = (x: number[], y: number[]) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]

test('override: los selectores de la plantilla de tema.css igualan o superan a todo selector del autor que define esas variables', () => {
  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  const plantilla = readFileSync(join(RAIZ, 'empaquetado/plantillas/mi-marca/tema.css'), 'utf8')
  const variables = new Set([...plantilla.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]))
  assert.ok(variables.has('--primary') && variables.has('--primary-rgb'))
  const propios = [...sinComentarios(plantilla).matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim())
  assert.deepEqual(propios, ['html:root:not(.dark)', 'html.dark:root'])
  const piso = propios.map(especificidad).sort(mayor)[0]
  let revisados = 0
  for (const archivo of ['src/app/globals.css', 'src/app/lenguaje.css']) {
    for (const m of sinComentarios(leer(archivo)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const cuerpo = m[2]
      if (![...variables].some((v) => new RegExp(`(^|[;\\s])${v}\\s*:`).test(cuerpo))) continue
      for (const sel of (m[1].split(';').pop() ?? '').split(',').map((x) => x.trim()).filter((x) => x && !x.startsWith('@'))) {
        revisados++
        assert.ok(mayor(especificidad(sel), piso) <= 0, `${archivo}: «${sel}» ${especificidad(sel)} le ganaría a mi-marca/tema.css ${piso}`)
      }
    }
  }
  assert.ok(revisados >= 4, `revisó ${revisados} selectores del autor`)
})
