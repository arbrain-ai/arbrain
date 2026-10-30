import test from 'node:test'
import assert from 'node:assert/strict'
import { audioFilename, speechProviders, transcribe } from '../../src/features/live/server/transcribe.ts'

test('uses already configured Lemonfox when Groq is absent (desktop failure)', () => {
  assert.deepEqual(speechProviders({ LEMONFOX_API_KEY: 'test' }).map(p => p.name), ['lemonfox'])
  assert.equal(audioFilename('audio/mp4;codecs=mp4a.40.2'), 'recording.m4a')
})
test('sends actual MIME filename, returns text and selected provider', async () => {
  let file: File | undefined
  const transport: typeof fetch = async (_url, init) => {
    file = (init?.body as FormData).get('file') as File
    return Response.json({ text: '  Compara las ventas anuales.  ' })
  }
  const r = await transcribe(new Blob(['audio'], { type: 'audio/mp4' }), speechProviders({ LEMONFOX_API_KEY: 'test' }), new AbortController().signal, transport)
  assert.equal(file?.name, 'recording.m4a')
  assert.deepEqual(r, { text: 'Compara las ventas anuales.', provider: 'lemonfox' })
})
test('authentication failure falls through to configured provider without leaking provider body', async () => {
  let n = 0
  const transport: typeof fetch = async () => ++n === 1 ? new Response('secret-provider-detail', { status: 401 }) : Response.json({ text: 'hola' })
  const r = await transcribe(new Blob(['audio'], { type: 'audio/webm' }), speechProviders({ GROQ_API_KEY: 'test', LEMONFOX_API_KEY: 'test' }), new AbortController().signal, transport)
  assert.equal(r.provider, 'lemonfox')
  assert.equal(n, 2)
})
test('empty, unknown-format and oversized recordings never reach provider', async () => {
  const transport: typeof fetch = async () => { throw new Error('must not call') }
  for (const audio of [new Blob([],{type:'audio/wav'}),new Blob(['x'],{type:'text/plain'}),new Blob([new Uint8Array(26*1024*1024)],{type:'audio/wav'})]) {
    await assert.rejects(transcribe(audio, speechProviders({LEMONFOX_API_KEY:'test'}), new AbortController().signal, transport), /grabación|formato/i)
  }
})
test('aborted transcription does not run fallback', async () => {
  const ac = new AbortController();ac.abort()
  await assert.rejects(transcribe(new Blob(['x'],{type:'audio/wav'}),speechProviders({LEMONFOX_API_KEY:'test'}),ac.signal), {name:'AbortError'})
})
