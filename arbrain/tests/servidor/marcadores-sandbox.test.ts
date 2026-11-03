// Marcadores vacíos del aislamiento de Claude Code en Linux (VPS de pruebas, 1 nov 2026): con un package-lock.json y un
// package.json VACÍOS en la raíz de su Arbrain, `next build` dejaba server.js fuera de su lugar o no resolvía módulos y
// el modo servidor reintentaba sin fin. Mientras compila se apartan (solo los vacíos) y luego vuelven.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apartarMarcadoresVacios, MARCADORES } from '../../scripts/servidor/marcadores-sandbox.mjs'

test('aparta solo los marcadores VACÍOS de la raíz y los devuelve igual', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'marcadores-'))
  const aparte = join(raiz, '..', `${raiz.split('/').pop()}-aparte`)
  // Lo que dejó el sandbox en la demo del VPS (0 bytes, 0600).
  for (const n of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.npmrc', '.env']) writeFileSync(join(raiz, n), '', { mode: 0o600 })
  const r = apartarMarcadoresVacios(raiz, aparte)
  assert.deepEqual(r.apartados, ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])
  for (const n of r.apartados) { assert.ok(!existsSync(join(raiz, n)), `${n} fuera mientras compila`); assert.ok(existsSync(join(aparte, n))) }
  assert.ok(existsSync(join(raiz, '.npmrc')) && existsSync(join(raiz, '.env')), 'lo que Next no lee se queda donde está')
  r.devolver()
  for (const n of r.apartados) {
    assert.ok(existsSync(join(raiz, n)), `${n} de vuelta`)
    assert.equal(statSync(join(raiz, n)).size, 0)
    assert.equal(statSync(join(raiz, n)).mode & 0o777, 0o600)
  }
  assert.ok(!existsSync(aparte), 'la carpeta de paso no se queda vacía en programa/ (QA 1 nov 2026)')
})

test('un package.json con contenido es de la persona: nunca se toca', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'marcadores-'))
  writeFileSync(join(raiz, 'package.json'), '{ "name": "mi-proyecto" }\n')
  const r = apartarMarcadoresVacios(raiz, join(raiz, 'aparte'))
  assert.deepEqual(r.apartados, [])
  assert.match(readFileSync(join(raiz, 'package.json'), 'utf8'), /mi-proyecto/)
  r.devolver()
})

test('si mientras compilaba apareció otro archivo con ese nombre, no se pisa', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'marcadores-'))
  writeFileSync(join(raiz, 'package-lock.json'), '')
  const r = apartarMarcadoresVacios(raiz, join(raiz, 'aparte'))
  writeFileSync(join(raiz, 'package-lock.json'), '{"lockfileVersion":3}')
  r.devolver()
  assert.match(readFileSync(join(raiz, 'package-lock.json'), 'utf8'), /lockfileVersion/)
  assert.ok(existsSync(join(raiz, 'aparte', 'package-lock.json')), 'el apartado que no pudo volver se queda en su carpeta')
})

test('la lista cubre los que leen Next y webpack, y next.config.ts fija la raíz en arbrain/', () => {
  for (const n of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock']) assert.ok(MARCADORES.includes(n), n)
  const config = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8')
  assert.match(config, /outputFileTracingRoot: typeof __dirname === 'string' \? __dirname : process\.cwd\(\)/)
  const servidor = readFileSync(new URL('../../scripts/servidor.mjs', import.meta.url), 'utf8')
  const compilar = servidor.slice(servidor.indexOf('async function compilarWeb('), servidor.indexOf('async function compilarWeb(') + 4000)
  assert.ok(compilar.indexOf('apartarMarcadoresVacios(REPO') > 0 && compilar.indexOf('apartarMarcadoresVacios(REPO') < compilar.indexOf("'build', '--webpack'"), 'se apartan antes de next build')
  assert.ok(compilar.includes('marcadores.devolver()'), 'y vuelven al terminar')
})
