// Seguridad noche 21→22 oct 2026 (carril 2-APP-ALUMNO): la vista HTML del chat en la edición cliente no saca datos por
// los canales que la CSP de la página no cubre (WebRTC, DNS anticipado) y no corre sola (ver HtmlPreview).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CABEZA_BLINDADA, CSP_VISTA, blindarSrcDoc } from '../../src/features/chat/lib/html-blindado'

const antesDeTodo = (doc: string) => {
  const b = doc.indexOf(CABEZA_BLINDADA)
  const s = doc.search(/<script(?![^>]*>\(function\(\)\{try\{for\(var k of \["RTCPeerConnection")/i)
  return b >= 0 && (s < 0 || b < s)
}

test('la cabeza blindada va antes de cualquier script de la vista, con y sin <head>/<html>/doctype', () => {
  for (const doc of [
    '<!doctype html><html><head><script>new RTCPeerConnection()</script></head><body></body></html>',
    '<html lang="es"><body><script>x()</script></body></html>',
    '<!DOCTYPE html><script>x()</script>',
    '<div>fragmento</div><script>x()</script>',
    '<HTML><HEAD data-x="1"><SCRIPT>x()</SCRIPT></HEAD></HTML>',
  ]) {
    const b = blindarSrcDoc(doc)
    assert.ok(antesDeTodo(b), doc)
    assert.ok(!/^\s*<head>/i.test(b) || !/<!doctype/i.test(doc), 'el doctype sigue primero')
  }
})

test('la CSP propia no deja salir: sin connect, sin frames, sin imágenes remotas, WebRTC bloqueado', () => {
  assert.match(CSP_VISTA, /default-src 'none'/)
  assert.match(CSP_VISTA, /connect-src 'none'/)
  assert.match(CSP_VISTA, /frame-src 'none'/)
  assert.match(CSP_VISTA, /img-src data: blob:(;|$)/)
  assert.match(CSP_VISTA, /webrtc 'block'/)
  assert.match(CABEZA_BLINDADA, /x-dns-prefetch-control" content="off"/)
  assert.match(CABEZA_BLINDADA, /RTCPeerConnection/)
})

test('HtmlPreview: en la edición cliente la vista no se monta sola y usa el documento blindado', () => {
  const fuente = readFileSync(join(__dirname, '../../src/features/chat/components/HtmlPreview.tsx'), 'utf8')
  assert.match(fuente, /useState\(!EDICION_CLIENTE\)/)
  assert.match(fuente, /srcDoc && !encendida \?/)
  assert.match(fuente, /EDICION_CLIENTE \? blindarSrcDoc\(doc\) : doc/)
})

test('next.config: X-DNS-Prefetch-Control apagado en la edición cliente', () => {
  const fuente = readFileSync(join(__dirname, '../../next.config.ts'), 'utf8')
  assert.match(fuente, /X-DNS-Prefetch-Control', value: EDICION_CLIENTE \? 'off' : 'on'/)
})
