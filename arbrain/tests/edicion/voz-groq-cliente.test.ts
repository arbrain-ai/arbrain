// Voz en la edición cliente (21 oct 2026, carril VOZ; Daniel: «puedes pintar una interfaz de usuario para que el usuario
// utilice la llave de Groq»): la ruta de dictado existe en cliente y transcribe en SU daemon; la voz del servidor de
// Daniel no; la llave de Groq se valida antes de ir al llavero; el chat sabe si el daemon la tiene sin tocar el llavero.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { validarLlaveVoz } from '../../src/features/primer-arranque/lib/llaves'
import { transcribirEnDaemonCliente } from '../../src/features/live/server/transcribe-cliente'
import { daemonTieneLlaveVoz } from '../../src/features/chat/lib/voz-cliente'

const GROQ = 'gsk_' + 'A1b2'.repeat(12)
const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const audio = () => new Blob([new Uint8Array(2000)], { type: 'audio/webm' })

test('lista blanca: dictado sí, voz del servidor de Daniel no; la prueba de la llave vive bajo /api/llaves', () => {
  assert.equal(apiPermitidaEnCliente('/api/chat/transcribe'), true)
  assert.equal(apiPermitidaEnCliente('/api/chat/tts'), false)
  assert.equal(apiPermitidaEnCliente('/api/llaves/voz/probar'), true)
})

test('formato de la llave de Groq: gsk_ sí; llaves del chat o basura no, con mensaje que orienta', () => {
  assert.deepEqual(validarLlaveVoz(`  "${GROQ}"\n`), { ok: true })
  const chat = validarLlaveVoz('sk-or-v1-abcdefghijklmnopqrstuvwxyz')
  assert.equal(chat.ok, false)
  assert.match(!chat.ok ? chat.error : '', /Ajustes › Llaves/)
  assert.equal(validarLlaveVoz('').ok, false)
  assert.equal(validarLlaveVoz('gsk_corta').ok, false)
  assert.equal(validarLlaveVoz('gsk_abc def ghi jkl mno pqr stu').ok, false)
})

test('relevo al daemon: lleva el Bearer del daemon, devuelve su respuesta tal cual (503 sin llave incluido)', async () => {
  let visto: { url: string; auth: string; tieneAudio: boolean } | null = null
  const transport = (async (url: string, init: RequestInit) => {
    visto = { url, auth: new Headers(init.headers).get('Authorization') ?? '', tieneAudio: (init.body as FormData).get('audio') instanceof Blob }
    return Response.json({ error: 'La transcripción no está configurada en este servidor.', code: 'stt_not_configured' }, { status: 503 })
  }) as unknown as typeof fetch
  const r = await transcribirEnDaemonCliente(audio(), 'recording.webm', new AbortController().signal, { url: 'http://127.0.0.1:4999', token: 't'.repeat(64), transport })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).code, 'stt_not_configured')
  assert.deepEqual(visto, { url: 'http://127.0.0.1:4999/live/transcribe', auth: `Bearer ${'t'.repeat(64)}`, tieneAudio: true })

  const ok = await transcribirEnDaemonCliente(audio(), 'recording.webm', new AbortController().signal, {
    url: 'http://127.0.0.1:4999', token: 'x'.repeat(64), transport: (async () => Response.json({ text: 'hola', provider: 'groq' })) as unknown as typeof fetch,
  })
  assert.deepEqual(await ok.json(), { text: 'hola', provider: 'groq' })
})

test('relevo sin token o con el daemon caído: error claro, nunca transcribe en la web', async () => {
  let llamado = false
  const sin = await transcribirEnDaemonCliente(audio(), 'recording.webm', new AbortController().signal, { url: 'http://127.0.0.1:4999', token: '', transport: (async () => { llamado = true; return new Response() }) as unknown as typeof fetch })
  assert.equal(sin.status, 503); assert.equal(llamado, false)
  const caido = await transcribirEnDaemonCliente(audio(), 'recording.webm', new AbortController().signal, { url: 'http://127.0.0.1:4999', token: 'x', transport: (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch })
  assert.equal(caido.status, 502); assert.equal((await caido.json()).code, 'sin_daemon')
})

test('la ruta de transcripción en cliente va al daemon antes de cualquier respaldo local', () => {
  const r = fuente('src/app/api/chat/transcribe/route.ts')
  const cliente = r.indexOf('if (esEdicionCliente()) return await transcribirEnDaemonCliente')
  assert.ok(cliente > 0)
  assert.ok(cliente < r.indexOf('speechProviders(process.env)'))
})

test('el chat sabe si el daemon tiene la llave de voz (sin valores, sin llavero)', async () => {
  const con = (cuerpo: unknown, status = 200) => (async () => Response.json(cuerpo, { status })) as unknown as typeof fetch
  assert.equal(await daemonTieneLlaveVoz(con({ ok: true, voz: { groq: true } })), true)
  assert.equal(await daemonTieneLlaveVoz(con({ ok: true, voz: { groq: false } })), false)
  assert.equal(await daemonTieneLlaveVoz(con({ ok: true })), null)
  assert.equal(await daemonTieneLlaveVoz(con({ error: 'x' }, 502)), null)
})

test('ChatPanel: «Escuchar» con la voz del dispositivo en ambas ediciones; micrófono en cliente según la llave', () => {
  const c = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.ok(!c.includes('{!EDICION_CLIENTE && <AudioButton'))
  assert.match(c, /EDICION_CLIENTE && llaveVoz !== true \?/)
  assert.match(c, /soloTexto=\{EDICION_CLIENTE\}/)
  // AudioButton no usa el TTS del servidor: Web Speech del dispositivo.
  assert.ok(!fuente('src/features/chat/components/AudioButton.tsx').includes('/api/chat/tts'))
})
