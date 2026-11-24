// Dependencias al día con el package-lock.json (23 nov 2026): al pasar una copia que compila (con ajustes propios) de
// 0.2.26 a 0.2.30, el arranque no reinstaló (`next` y `typescript` ya estaban) y `next build` habría fallado sin
// `docx-preview`, `dompurify` y `fflate`. Ahora la última instalación deja la huella del lockfile en node_modules y, si
// cambia, el arranque corre `npm ci` antes de compilar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  anotarInstalacion, asegurarDependencias, directasDesfasadas, estadoDependencias, huellaBloqueo, MARCA,
} from '../../scripts/servidor/dependencias.mjs'

const escribir = (ruta: string, datos: unknown) => { mkdirSync(join(ruta, '..'), { recursive: true }); writeFileSync(ruta, JSON.stringify(datos, null, 2)) }

/** Copia falsa: package.json, lockfile y lo instalado (nombre → versión), sin npm. */
function copia({ deps = {}, dev = {}, lock = {}, instalados = {} }: {
  deps?: Record<string, string>, dev?: Record<string, string>, lock?: Record<string, { version?: string, optional?: boolean, link?: boolean }>, instalados?: Record<string, string>
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deps-'))
  escribir(join(dir, 'package.json'), { name: 'copia', version: '1.0.0', dependencies: deps, devDependencies: dev })
  const packages: Record<string, unknown> = { '': { name: 'copia' } }
  for (const [n, e] of Object.entries(lock)) packages[`node_modules/${n}`] = e
  escribir(join(dir, 'package-lock.json'), { name: 'copia', lockfileVersion: 3, packages })
  for (const [n, v] of Object.entries(instalados)) escribir(join(dir, 'node_modules', n, 'package.json'), { name: n, version: v })
  return dir
}

const BASE = {
  deps: { next: '^16.4.3', 'docx-preview': '^0.3.7' },
  dev: { typescript: '^5.9.0' },
  lock: { next: { version: '16.4.3' }, 'docx-preview': { version: '0.3.7' }, typescript: { version: '5.9.3' } },
}

test('si falta algo imprescindible se instala, como antes', () => {
  const dir = copia({ ...BASE, instalados: { typescript: '5.9.3' } })
  const e = estadoDependencias(dir, ['next', 'typescript'])
  assert.equal(e.instalar, true)
  assert.equal(e.motivo, 'faltan')
  assert.equal(e.detalle, 'next')
})

test('la marca coincide con el lockfile: no se reinstala', () => {
  const dir = copia({ ...BASE, instalados: { next: '16.4.3', 'docx-preview': '0.3.7', typescript: '5.9.3' } })
  assert.ok(anotarInstalacion(dir, huellaBloqueo(dir)))
  const e = estadoDependencias(dir, ['next', 'typescript'])
  assert.equal(e.instalar, false)
  assert.equal(e.adoptar, false)
})

test('el lockfile cambió desde la última instalación: se reinstala aunque estén next y typescript', () => {
  const dir = copia({ ...BASE, instalados: { next: '16.4.3', 'docx-preview': '0.3.7', typescript: '5.9.3' } })
  anotarInstalacion(dir, huellaBloqueo(dir))
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'))
  lock.packages['node_modules/fflate'] = { version: '0.8.2' } // una versión nueva trae una dependencia nueva (también transitiva)
  escribir(join(dir, 'package-lock.json'), lock)
  const e = estadoDependencias(dir, ['next', 'typescript'])
  assert.equal(e.instalar, true)
  assert.equal(e.motivo, 'cambio')
})

test('instalación de antes de la marca con una dependencia directa nueva (el caso de 0.2.26 → 0.2.30): se reinstala', () => {
  const dir = copia({ ...BASE, instalados: { next: '16.4.3', typescript: '5.9.3' } })
  const e = estadoDependencias(dir, ['next', 'typescript'])
  assert.equal(e.instalar, true)
  assert.equal(e.motivo, 'desfasadas')
  assert.equal(e.detalle, 'falta docx-preview')
})

test('instalación de antes de la marca con otra versión de una directa: se reinstala', () => {
  const dir = copia({ ...BASE, instalados: { next: '16.4.1', 'docx-preview': '0.3.7', typescript: '5.9.3' } })
  assert.deepEqual(directasDesfasadas(dir), ['next 16.4.1 → 16.4.3'])
  assert.equal(estadoDependencias(dir, ['next', 'typescript']).motivo, 'desfasadas')
})

test('instalación de antes de la marca que cuadra: se adopta sin reinstalar (sin red no se rompe nada)', () => {
  const dir = copia({ ...BASE, instalados: { next: '16.4.3', 'docx-preview': '0.3.7', typescript: '5.9.3' } })
  let llamadas = 0
  const r = asegurarDependencias(dir, { imprescindibles: ['next', 'typescript'], cual: 'de la web', instalar: () => { llamadas++; return { orden: 'ci', codigo: 0 } } })
  assert.equal(llamadas, 0)
  assert.equal(r.codigo, 0)
  assert.equal(JSON.parse(readFileSync(join(dir, 'node_modules', MARCA), 'utf8')).huella, huellaBloqueo(dir))
})

test('las opcionales y los enlaces no se exigen (pueden no instalarse en esta plataforma)', () => {
  const dir = copia({
    deps: { next: '^16.4.3', fsevents: '^2.3.3', propio: 'file:../propio' },
    lock: { next: { version: '16.4.3' }, fsevents: { version: '2.3.3', optional: true }, propio: { link: true } },
    instalados: { next: '16.4.3' },
  })
  assert.deepEqual(directasDesfasadas(dir), [])
})

test('sin lockfile no hay con qué comparar: solo instala si falta algo', () => {
  const dir = copia({ ...BASE, instalados: { next: '16.4.3', typescript: '5.9.3' } })
  rmSync(join(dir, 'package-lock.json'))
  const e = estadoDependencias(dir, ['next', 'typescript'])
  assert.equal(e.instalar, false)
  assert.equal(e.adoptar, false)
})

test('si la instalación falla no se anota la marca (el siguiente arranque lo vuelve a intentar)', () => {
  const dir = copia({ ...BASE, instalados: { next: '16.4.3', typescript: '5.9.3' } })
  const avisos: string[] = []
  const r = asegurarDependencias(dir, { imprescindibles: ['next', 'typescript'], cual: 'de la web', instalar: () => ({ orden: 'ci', codigo: 1 }), registrar: (m: string) => avisos.push(m) })
  assert.equal(r.codigo, 1)
  assert.ok(!existsSync(join(dir, 'node_modules', MARCA)))
  assert.match(avisos[0], /Las dependencias de la web cambiaron con esta versión \(falta docx-preview\); las reinstalo/)
  const bien = asegurarDependencias(dir, { imprescindibles: ['next', 'typescript'], cual: 'de la web', instalar: () => ({ orden: 'ci', codigo: 0 }) })
  assert.equal(bien.codigo, 0)
  assert.ok(existsSync(join(dir, 'node_modules', MARCA)))
})

test('el arranque usa la comprobación para la web y para el daemon', () => {
  const s = readFileSync(new URL('../../scripts/servidor.mjs', import.meta.url), 'utf8')
  assert.match(s, /asegurarDependencias\(ARBRAIN, \{ imprescindibles: \['next', 'typescript'\]/)
  assert.match(s, /asegurarDependencias\(SERVER, \{ imprescindibles: \['typescript'\]/)
})

// Con npm de verdad y sin red: paquetes locales empaquetados (.tgz), como una versión que agrega una dependencia.
test('con npm real: una versión nueva agrega una dependencia y el arranque la instala con npm ci', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'deps-npm-'))
  const npm = (args: string[], cwd: string) => {
    const r = spawnSync('npm', [...args, '--offline', '--no-audit', '--no-fund', '--loglevel=error'], { cwd, encoding: 'utf8', shell: process.platform === 'win32' })
    assert.equal(r.status, 0, `npm ${args.join(' ')}: ${r.stderr}`)
    return r
  }
  for (const n of ['pieza-a', 'pieza-b']) {
    const d = join(raiz, n)
    escribir(join(d, 'package.json'), { name: n, version: '1.0.0', main: 'index.js' })
    writeFileSync(join(d, 'index.js'), `module.exports = '${n}'\n`)
    npm(['pack', '--pack-destination', raiz], d)
  }
  const app = join(raiz, 'app')
  escribir(join(app, 'package.json'), { name: 'app', version: '1.0.0', dependencies: { 'pieza-a': 'file:../pieza-a-1.0.0.tgz' } })
  npm(['install', '--package-lock-only'], app)
  const instalar = (dir: string) => ({ orden: 'ci', codigo: npm(['ci', '--include=dev'], dir).status ?? 1 })

  // Primera instalación: falta pieza-a.
  let r = asegurarDependencias(app, { imprescindibles: ['pieza-a'], cual: 'de la web', instalar })
  assert.equal(r.motivo, 'faltan')
  assert.ok(existsSync(join(app, 'node_modules', MARCA)))
  // Mismo lockfile: nada que hacer.
  r = asegurarDependencias(app, { imprescindibles: ['pieza-a'], cual: 'de la web', instalar: () => { throw new Error('no debía instalar') } })
  assert.equal(r.instalar, false)

  // La versión nueva agrega pieza-b (cambia package.json y package-lock.json; node_modules es el viejo).
  escribir(join(app, 'package.json'), { name: 'app', version: '1.0.1', dependencies: { 'pieza-a': 'file:../pieza-a-1.0.0.tgz', 'pieza-b': 'file:../pieza-b-1.0.0.tgz' } })
  npm(['install', '--package-lock-only'], app)
  assert.ok(!existsSync(join(app, 'node_modules', 'pieza-b')), 'antes del arranque falta la pieza nueva')
  r = asegurarDependencias(app, { imprescindibles: ['pieza-a'], cual: 'de la web', instalar })
  assert.equal(r.motivo, 'cambio')
  assert.equal(r.codigo, 0)
  assert.ok(existsSync(join(app, 'node_modules', 'pieza-b', 'index.js')), 'npm ci trajo la pieza nueva')
  assert.equal(JSON.parse(readFileSync(join(app, 'node_modules', MARCA), 'utf8')).huella, huellaBloqueo(app))
})
