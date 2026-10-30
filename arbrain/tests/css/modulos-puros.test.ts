// CSS Modules en modo puro (v0.2.13, 28 oct 2026): `next build` rechaza un selector sin clase local
// (`:global(html[x]) body *`) aunque `next dev` lo acepte. Pasó con el visor HTML a pantalla completa y tumbó el build de
// las tres plataformas. Este sensor corre el mismo plugin que usa Next sobre cada .module.css de src/.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const postcss = require('postcss')
const local = require('next/dist/compiled/postcss-modules-local-by-default')
const scope = require('next/dist/compiled/postcss-modules-scope')
const SRC = path.resolve(__dirname, '../../src')

function modulos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? modulos(p) : n.endsWith('.module.css') ? [p] : []
  })
}

test('cada .module.css de src/ compila en modo puro (como next build)', async () => {
  const malos: string[] = []
  const archivos = modulos(SRC)
  assert.ok(archivos.length > 20, 'no encontré los módulos CSS')
  for (const f of archivos) {
    try { await postcss([local({ mode: 'pure' }), scope()]).process(readFileSync(f, 'utf8'), { from: f }) }
    catch (e) { malos.push(`${path.relative(SRC, f)}: ${(e as Error).message.split('\n')[0].slice(0, 200)}`) }
  }
  assert.deepEqual(malos, [])
})

test('el sensor sí atrapa un selector sin clase local', async () => {
  await assert.rejects(postcss([local({ mode: 'pure' }), scope()]).process(':global(html[x]) body * { color: red }', { from: 'x.module.css' }), /not pure/)
})
