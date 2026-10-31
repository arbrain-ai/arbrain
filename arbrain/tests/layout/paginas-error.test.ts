import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { codigoDeError, MENSAJE_ERROR, PaginaError } from '../../src/components/PaginaError'
import { CSS_PANTALLA_SISTEMA, temaPantallaSistema } from '../../src/components/PantallaSistema'

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
  // Sin «Recargar», el inicio es la única acción: lleva la tecla ámbar.
  assert.match(h, /<a[^>]*class="ps-tecla"[^>]*>Ir al inicio</)
})

test('codigoDeError: digest primero; sin digest, nombre y mensaje recortado', () => {
  assert.equal(codigoDeError(Object.assign(new Error('secreto interno'), { digest: '4242' })), '4242')
  assert.equal(codigoDeError(new TypeError('x is undefined')), 'TypeError: x is undefined')
  const largo = codigoDeError(new Error('a'.repeat(400)))!
  assert.ok(largo.length <= 160 && largo.endsWith('…'))
  assert.equal(codigoDeError(null), null)
})

test('el material de la bienvenida (31 oct 2026): oscuro por defecto, Recargar es la tecla ámbar, inicio la tapa discreta', () => {
  const h = renderToStaticMarkup(createElement(PaginaError, { titulo: 'Esta pantalla tuvo un problema', mensaje: MENSAJE_ERROR, codigo: 'abc123' }))
  assert.match(h, /<main[^>]*data-pantalla-sistema="oscuro"[^>]*class="dark"|<main[^>]*class="dark"[^>]*data-pantalla-sistema="oscuro"/)
  assert.match(h, /<button[^>]*class="ps-tecla"[^>]*>.*Recargar<\/button>/)
  assert.match(h, /<a[^>]*href="\/"[^>]*class="ps-discreta"|<a[^>]*class="ps-discreta"[^>]*href="\/"/)
  // Nada de morado plano en los botones: el violeta queda para la marca y el halo.
  assert.doesNotMatch(h, /background:\s*var\(--brand,/)
  // El <style> va en la página (global-error no tiene hoja) y cada token trae su respaldo.
  assert.match(h, /<style>[\s\S]*\.ps-tecla::before/)
  assert.match(CSS_PANTALLA_SISTEMA, /var\(--gold-rgb, 255, 145, 1\)/)
  assert.doesNotMatch(CSS_PANTALLA_SISTEMA.replace(/var\(--[\w-]+, [^)]+\)/g, ''), /var\(--(gold|l-|card|background|brand)[\w-]*\)/)
})

test('temaPantallaSistema: claro solo si se eligió a mano y sigue vigente; el tramo de la hora no decide', () => {
  const ahora = Date.UTC(2026, 9, 31, 18)
  assert.equal(temaPantallaSistema(null, null, ahora), 'oscuro')
  assert.equal(temaPantallaSistema('auto', null, ahora), 'oscuro')
  assert.equal(temaPantallaSistema('dark', String(ahora + 1000), ahora), 'oscuro')
  assert.equal(temaPantallaSistema('light', String(ahora + 1000), ahora), 'claro')
  assert.equal(temaPantallaSistema('light', String(ahora - 1000), ahora), 'oscuro')
  assert.equal(temaPantallaSistema('light', null, ahora), 'oscuro')
})

test('sin-sesion usa el mismo material: «Entrar» es la tecla ámbar, no el morado plano', () => {
  const f = readFileSync(join(APP, 'sin-sesion', 'page.tsx'), 'utf8')
  assert.match(f, /<PantallaSistema/)
  assert.match(f, /className="ps-tecla w-full">Entrar</)
  assert.doesNotMatch(f, /bg-brand/)
})
