// Red team L1 (11 oct 2026): en edición cliente la web nunca cae al puerto del autor (3218); usa el que fijó la app.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { siteUrl } from '../../src/lib/site-url'

const previo = { ...process.env }
afterEach(() => {
  for (const k of ['ARBRAIN_EDICION', 'NEXT_PUBLIC_SITE_URL', 'PORT']) {
    if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k]
  }
})

test('cliente: sin NEXT_PUBLIC_SITE_URL usa el PORT que pasó la app, nunca 3218', () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  delete process.env.NEXT_PUBLIC_SITE_URL
  process.env.PORT = '41873'
  assert.equal(siteUrl(), 'http://127.0.0.1:41873')
})

test('cliente: sin origen ni puerto, error claro en vez del puerto del autor', () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  delete process.env.NEXT_PUBLIC_SITE_URL
  delete process.env.PORT
  assert.throws(() => siteUrl(), /Falta el origen/)
})

test('NEXT_PUBLIC_SITE_URL manda y se sanea (newline y barra final)', () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:5000/\n'
  assert.equal(siteUrl(), 'http://127.0.0.1:5000')
})
