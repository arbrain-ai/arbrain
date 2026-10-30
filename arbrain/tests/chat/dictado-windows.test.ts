import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  formatoGrabacion, mensajeFalloMicrofono, mensajeFalloTranscripcion, permisosFueraDeMac, plataformaDe, SIN_PERMISO_MAC, tipoDeGrabacion,
} from '../../src/features/chat/lib/voz-sistema'
import { audioFilename } from '../../src/features/live/server/transcribe'

// 29 oct 2026, un fundador en Windows 11 Pro (España). Antes el dictado fallaba mudo: el botón se ponía rojo 2 s y volvía.
const UA_WEBVIEW2 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const UA_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const err = (name: string, message = '') => Object.assign(new Error(message), { name })

test('plataforma por user agent: WebView2/Edge es Windows; Safari es Mac', () => {
  assert.equal(plataformaDe(UA_WEBVIEW2), 'windows')
  assert.equal(plataformaDe(UA_SAFARI), 'mac')
  assert.equal(plataformaDe('Mozilla/5.0 (X11; Linux x86_64)'), 'linux')
})

test('WebView2 graba webm/opus y el servidor lo acepta como .webm', () => {
  const chromium = new Set(['audio/webm;codecs=opus', 'audio/webm'])
  const mime = formatoGrabacion((t) => chromium.has(t))
  assert.equal(mime, 'audio/webm;codecs=opus')
  const g = tipoDeGrabacion('audio/webm;codecs=opus')
  assert.deepEqual(g, { tipo: 'audio/webm', nombre: 'grabacion.webm' })
  assert.equal(audioFilename(g.tipo), 'recording.webm')
})

test('Safari graba mp4: se manda como mp4 (antes iba etiquetado webm) y el servidor lo acepta', () => {
  const mime = formatoGrabacion((t) => t === 'audio/mp4')
  assert.equal(mime, 'audio/mp4')
  const g = tipoDeGrabacion('audio/mp4')
  assert.deepEqual(g, { tipo: 'audio/mp4', nombre: 'grabacion.m4a' })
  assert.equal(audioFilename(g.tipo), 'recording.m4a')
  // Sin isTypeSupported o sin ninguno conocido: el navegador elige; un tipo vacío se manda como webm.
  assert.equal(formatoGrabacion(undefined), undefined)
  assert.equal(formatoGrabacion(() => { throw new Error('x') }), undefined)
  assert.deepEqual(tipoDeGrabacion(''), { tipo: 'audio/webm', nombre: 'grabacion.webm' })
})

test('Windows bloquea el micrófono (Privacidad): se dice el camino de Configuración, no el de macOS', () => {
  const m = mensajeFalloMicrofono(err('NotAllowedError', 'Permission denied by system'), 'windows', true)
  assert.match(m, /Configuración › Privacidad y seguridad › Micrófono/)
  assert.match(m, /aplicaciones de escritorio/)
  assert.doesNotMatch(m, /macOS|Ajustes del Sistema/)
})

test('Windows, app de escritorio: aviso de WebView2 rechazado se explica con Permitir y Privacidad', () => {
  const m = mensajeFalloMicrofono(err('NotAllowedError', 'Permission denied'), 'windows', true)
  assert.match(m, /Permitir/)
  assert.match(m, /Privacidad y seguridad › Micrófono/)
})

test('Windows en navegador: el candado del sitio', () => {
  assert.match(mensajeFalloMicrofono(err('NotAllowedError', 'Permission denied'), 'windows', false), /candado/)
})

test('micrófono tomado por otro programa, ausente o sin MediaRecorder: una línea clara', () => {
  assert.match(mensajeFalloMicrofono(err('NotReadableError', 'Could not start audio source'), 'windows', true), /Teams, Zoom, Discord/)
  assert.match(mensajeFalloMicrofono(err('NotFoundError'), 'windows', true), /Sonido › Entrada/)
  assert.match(mensajeFalloMicrofono(new Error('Sin MediaRecorder o mediaDevices'), 'windows', false), /Chrome o Edge/)
  assert.match(mensajeFalloMicrofono(new Error(SIN_PERMISO_MAC), 'mac', true), /Privacidad y seguridad › Micrófono/)
})

test('fallo de la transcripción: la frase del servidor (sin secretos) o una genérica', () => {
  assert.equal(mensajeFalloTranscripcion(502, { error: 'Groq no reconoce esa llave.', code: 'stt_provider_failed' }), 'Groq no reconoce esa llave.')
  assert.match(mensajeFalloTranscripcion(500, null), /No se pudo transcribir/)
  assert.match(mensajeFalloTranscripcion(401, {}), /sesión/)
  assert.match(mensajeFalloTranscripcion(502, { error: 'x'.repeat(500) }), /No se pudo transcribir/)
})

test('Ajustes › Esta computadora en Windows: dice dónde decide Windows, sin «macOS»', () => {
  const w = permisosFueraDeMac('windows')
  assert.match(w.titulo, /Windows/)
  assert.match(w.texto, /Privacidad y seguridad › Micrófono/)
  assert.doesNotMatch(`${w.titulo} ${w.texto}`, /macOS|Mac\b/)
})
