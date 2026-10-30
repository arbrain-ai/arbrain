// Red team 3, A-5 (11 oct 2026): en la edición cliente una imagen remota del Markdown del chat no se pide sola.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dominioDeImagenRemota, imagenRemotaBloqueada } from '../../src/features/chat/lib/imagen-remota'

test('reconoce imágenes remotas y su dominio', () => {
  assert.equal(dominioDeImagenRemota('https://evil.example/p?d=secreto'), 'evil.example')
  assert.equal(dominioDeImagenRemota('http://a.b.example:8080/x.png'), 'a.b.example')
  assert.equal(dominioDeImagenRemota('//cdn.example/x.png'), 'cdn.example')
  assert.equal(dominioDeImagenRemota('  HTTPS://Mayus.Example/x  '), 'mayus.example')
})

test('lo local, data: y blob: no son remotos', () => {
  for (const s of ['/brand/logo.svg', 'imagenes/x.png', './x.png', 'data:image/png;base64,AAAA', 'blob:http://127.0.0.1/abc', 'file:///tmp/x.png', 'javascript:alert(1)', '', undefined, null]) {
    assert.equal(dominioDeImagenRemota(s as string), null, String(s))
  }
})

test('solo se bloquea en cliente', () => {
  assert.equal(imagenRemotaBloqueada('https://evil.example/p', true), 'evil.example')
  assert.equal(imagenRemotaBloqueada('https://evil.example/p', false), null)
  assert.equal(imagenRemotaBloqueada('/local.png', true), null)
})

test('el chat usa la regla antes de pintar <img>', () => {
  const c = readFileSync(new URL('../../src/features/chat/components/MarkdownMessage.tsx', import.meta.url), 'utf8')
  const i = c.indexOf('const ChatImage = memo(')
  assert.ok(i > 0)
  const cuerpo = c.slice(i, c.indexOf('function ChatImageCargada', i))
  assert.match(cuerpo, /imagenRemotaBloqueada\(src, EDICION_CLIENTE\)/)
  assert.match(cuerpo, /<ImagenRemotaBloqueada/)
})
