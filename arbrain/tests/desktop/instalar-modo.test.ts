/**
 * `desktop:install` (14 nov 2026): con la app abierta NUNCA reemplaza al momento salvo `--ahora`. La trampa que se cerró:
 * `--no-open` (solo «no la abras al terminar») se saltaba el camino «pendiente en reposo» y cortaba la app en caliente.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { modoDeInstalar } from '../../scripts/instalar-modo.mjs'

const abierta = { abierta: true, sabeAplicar: true }

test('desktop:install · --no-open con la app abierta ya no reemplaza en caliente: queda pendiente', () => {
  assert.equal(modoDeInstalar(['node', 'desktop-install.mjs', '--no-open'], abierta), 'pendiente')
  assert.equal(modoDeInstalar(['node', 'desktop-install.mjs'], abierta), 'pendiente')
  assert.equal(modoDeInstalar(['node', 'desktop-install.mjs', '--no-open', '--nueva-identidad'], abierta), 'pendiente', 'ninguna bandera distinta de --ahora cambia el modo')
})

test('desktop:install · solo --ahora explícito reemplaza la app abierta; cerrada no hay nada que cortar', () => {
  assert.equal(modoDeInstalar(['node', 'desktop-install.mjs', '--ahora'], abierta), 'reemplazar')
  assert.equal(modoDeInstalar(['node', 'desktop-install.mjs', '--no-open', '--ahora'], abierta), 'reemplazar')
  assert.equal(modoDeInstalar(['node', 'desktop-install.mjs', '--no-open'], { abierta: false, sabeAplicar: true }), 'reemplazar')
})

test('desktop:install · una app abierta que no sabe aplicar en reposo no se corta: espera (antes se reemplazaba)', () => {
  assert.equal(modoDeInstalar(['node', 'desktop-install.mjs', '--no-open'], { abierta: true, sabeAplicar: false }), 'esperar')
  assert.equal(modoDeInstalar(['node', 'desktop-install.mjs', '--ahora'], { abierta: true, sabeAplicar: false }), 'reemplazar')
})

test('desktop:install · el script decide con modoDeInstalar y el camino pendiente ya no depende de abrir la app', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../../scripts/desktop-install.mjs'), 'utf8')
  assert.match(src, /modoDeInstalar\(process\.argv,/)
  assert.doesNotMatch(src, /shouldOpen\s*&&\s*appAbierta\(\)/, 'la condición vieja (que --no-open saltaba) no vuelve')
  // Antes de matar instancias y mover la app, el modo ya se decidió: lo pendiente sale con exit(0) y lo que espera lanza.
  const decide = src.indexOf('modoDeInstalar(process.argv'), mata = src.indexOf('stopDebugAndInstalledInstances();', decide)
  assert.ok(decide > 0 && mata > decide, 'la decisión va antes de detener la app')
  assert.match(src.slice(decide, mata), /modo === 'pendiente'[\s\S]*process\.exit\(0\)/)
  assert.match(src.slice(decide, mata), /modo === 'esperar'[\s\S]*throw new Error/)
})
