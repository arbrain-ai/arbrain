import test from 'node:test'
import assert from 'node:assert/strict'
import { escrituraEntreSitios } from '../../src/lib/guarda-sitio'

const cab = (secFetchSite: string | null, extra: Partial<{ authorization: string | null; conCookieDeSesion: boolean }> = {}) =>
  ({ secFetchSite, authorization: null, conCookieDeSesion: true, ...extra })

test('POST con cookie desde otro sitio o desde otro puerto de ts.net: negado', () => {
  assert.equal(escrituraEntreSitios('POST', '/api/chat', cab('same-site')), true)
  assert.equal(escrituraEntreSitios('POST', '/api/chat', cab('cross-site')), true)
  assert.equal(escrituraEntreSitios('DELETE', '/api/tasks', cab('cross-site')), true)
})

test('misma app, navegación directa o navegador viejo: pasa', () => {
  assert.equal(escrituraEntreSitios('POST', '/api/chat', cab('same-origin')), false)
  assert.equal(escrituraEntreSitios('POST', '/api/chat', cab('none')), false)
  assert.equal(escrituraEntreSitios('POST', '/api/chat', cab(null)), false)
})

test('lecturas, rutas que no son /api, bearer y peticiones sin cookie: pasan', () => {
  assert.equal(escrituraEntreSitios('GET', '/api/chat', cab('cross-site')), false)
  assert.equal(escrituraEntreSitios('POST', '/login', cab('cross-site')), false)
  assert.equal(escrituraEntreSitios('POST', '/api/openclaw/event', cab('cross-site', { authorization: 'Bearer x' })), false)
  assert.equal(escrituraEntreSitios('POST', '/api/canvas/x', cab('cross-site', { conCookieDeSesion: false })), false)
})
