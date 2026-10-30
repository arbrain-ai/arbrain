import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { codigoDeError, MENSAJE_ERROR, PaginaError } from '../../src/components/PaginaError'

const APP = join(__dirname, '..', '..', 'src', 'app')

test('las tres páginas propias existen (sin ellas se ve la página por defecto de Next)', () => {
  for (const f of ['error.tsx', 'global-error.tsx', 'not-found.tsx']) assert.ok(existsSync(join(APP, f)), f)
  const global = readFileSync(join(APP, 'global-error.tsx'), 'utf8')
  assert.match(global, /<html lang="es">/)
  assert.match(global, /<body/)
  for (const f of ['error.tsx', 'global-error.tsx']) assert.match(readFileSync(join(APP, f), 'utf8'), /^'use client'/)
})

test('la página de error habla en español, ofrece Recargar e inicio y muestra el digest', () => {
  const h = renderToStaticMarkup(createElement(PaginaError, { titulo: 'Esta pantalla tuvo un problema', mensaje: MENSAJE_ERROR, codigo: 'abc123' }))
  assert.match(h, /Esta pantalla tuvo un problema/)
  assert.match(h, />Recargar</)
  assert.match(h, /href="\/"[^>]*>Ir al inicio</)
  assert.match(h, /Código para reportar: abc123/)
  assert.doesNotMatch(h, /Vercel|Application error|This page could not be found/i)
})

test('«no existe» no ofrece Recargar', () => {
  const h = renderToStaticMarkup(createElement(PaginaError, { titulo: 'Esta página no existe', mensaje: 'x', codigo: '404', sinRecargar: true }))
  assert.doesNotMatch(h, />Recargar</)
  assert.match(h, /Ir al inicio/)
})

test('codigoDeError: digest primero; sin digest, nombre y mensaje recortado', () => {
  assert.equal(codigoDeError(Object.assign(new Error('secreto interno'), { digest: '4242' })), '4242')
  assert.equal(codigoDeError(new TypeError('x is undefined')), 'TypeError: x is undefined')
  const largo = codigoDeError(new Error('a'.repeat(400)))!
  assert.ok(largo.length <= 160 && largo.endsWith('…'))
  assert.equal(codigoDeError(null), null)
})
