import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://ejemplo.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon'

test('escritorio de Daniel: POST de otra página a 127.0.0.1 negado; el webview (same-origin) pasa', async () => {
  const { updateSession } = await import('../../src/lib/supabase/proxy')
  const ajena = new NextRequest('http://127.0.0.1:3218/api/chat', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' }, body: '{}' })
  assert.equal((await updateSession(ajena)).status, 403)
  const propia = new NextRequest('http://127.0.0.1:3218/api/chat', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: '{}' })
  assert.notEqual((await updateSession(propia)).status, 403)
  const lectura = new NextRequest('http://127.0.0.1:3218/api/chat', { headers: { 'sec-fetch-site': 'cross-site' } })
  assert.notEqual((await updateSession(lectura)).status, 403)
})
