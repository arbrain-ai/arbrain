// Resiliencia (12 oct 2026): una dependencia caída responde 503 con su causa; nunca permiso, vacío ni «no existe».
// Incidente: PostgREST murió el 11 oct a las 21:41 y Arbrain dijo «Forbidden», «Sin conversaciones en los últimos tres
// días» y «Mensaje guardado · Reintentar este envío» durante 8 horas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esFallaDeAuth, msjMotorCaido, respuestaServicioCaido, MSJ_BASE_CAIDA } from '../../src/lib/infra-errores'
import { motivoDeFalla } from '../../src/features/chat/hooks/useChatHistory'

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

test('Auth caído (red o 5xx) es falla de infraestructura; «sin sesión» no lo es', () => {
  assert.equal(esFallaDeAuth({ name: 'AuthRetryableFetchError', status: 0 }), true)
  assert.equal(esFallaDeAuth({ name: 'AuthApiError', status: 503 }), true)
  assert.equal(esFallaDeAuth({ name: 'AuthSessionMissingError', status: 400 }), false)
  assert.equal(esFallaDeAuth({ name: 'AuthApiError', status: 401 }), false)
  assert.equal(esFallaDeAuth(null), false)
})

test('el alumno nunca lee «Mac Studio», «ngrok» ni «túnel» cuando su motor se cae', () => {
  const alumno = msjMotorCaido(true)
  assert.doesNotMatch(alumno, /Studio|ngrok|t[uú]nel|ClaudeClaw|daemon/i)
  assert.match(alumno, /reiniciando solo/)
  assert.match(alumno, /mensaje queda guardado/)
  assert.match(msjMotorCaido(false), /Studio/)
})

test('respuestaServicioCaido: 503 JSON reintentable con Retry-After', async () => {
  const r = respuestaServicioCaido()
  assert.equal(r.status, 503)
  assert.equal(r.headers.get('Retry-After'), '5')
  const j = await r.json() as { error: string; reintentable: boolean }
  assert.equal(j.error, MSJ_BASE_CAIDA)
  assert.equal(j.reintentable, true)
})

test('motivoDeFalla trae la causa del servidor o el código, nunca vacío', async () => {
  assert.equal(await motivoDeFalla(Response.json({ error: MSJ_BASE_CAIDA }, { status: 503 })), MSJ_BASE_CAIDA)
  assert.equal(await motivoDeFalla(new Response('<html>', { status: 502 })), 'el servidor respondió 502')
})

test('chat: Auth caído → 503 (no 401) y la base caída en la puerta del chat usa el texto común', () => {
  const s = src('src/lib/chat-access.ts')
  assert.match(s, /if \(!user && esFallaDeAuth\(authError\)\) throw new ChatAccessError\(MSJ_BASE_CAIDA, 503\)/)
  assert.match(s, /RoleLookupError\) throw new ChatAccessError\(MSJ_BASE_CAIDA, 503\)/)
})

test('answer, ack, title y /api/chat pasan por la misma puerta (antes: RoleLookupError → 500 y la respuesta se perdía)', () => {
  for (const r of ['answer', 'ack', 'title', '']) {
    const s = src(`src/app/api/chat/${r ? `${r}/` : ''}route.ts`)
    assert.match(s, /try \{ await requireChatPrincipal\(\) \} catch \(error\) \{ return chatAccessResponse\(error\) \}/, r || 'chat')
    assert.doesNotMatch(s, /hasRole\(/, r || 'chat')
  }
})

test('una conversación con la base caída es 503, no «Session not found»', () => {
  const s = src('src/app/api/chat/sessions/[sessionId]/route.ts')
  assert.doesNotMatch(s, /if \(error \|\| !session\) return Response\.json\(\{ error: 'Session not found' \}/)
  assert.doesNotMatch(s, /sessionRes\.error \|\| !sessionRes\.data/)
  assert.match(s, /respuestaServicioCaido\(\)/)
})

test('historial: una lectura fallida nunca se pinta vacía ni pisa la caché', () => {
  const h = src('src/features/chat/hooks/useChatHistory.ts')
  assert.doesNotMatch(h, /if \(!res\.ok\) return \{ messages: \[\], hasMore: false \}/)
  assert.doesNotMatch(h, /if \(!opts\?\.silent\) setSessions\(\[\]\)/)
  assert.match(h, /if \(!mcRes\.ok\) \{ setLoading\(false\); if \(!opts\?\.silent\) setLoadError/)
  const p = src('src/features/chat/components/ChatPanel.tsx')
  assert.match(p, /if \(errorCarga\) \{\s*showChatError\(`No pude cargar esta conversación ahora/)
  const r = src('src/features/chat/components/RecientesNav.tsx')
  assert.match(r, /if \(!r\.ok\) throw new Error/)
  assert.match(r, /\{!falla && grupos\.length === 0 && fijadas\.length === 0 && \(/)
})
