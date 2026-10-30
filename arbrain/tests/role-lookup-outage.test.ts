import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 12 oct 2026: PostgREST murió y Arbrain contestó «Forbidden» 8 horas. Base caída ≠ sin permiso.
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('getUserRole distingue perfil inexistente de base caída', () => {
  const s = src('src/lib/auth-utils.ts')
  assert.match(s, /\.maybeSingle\(\)/)
  assert.match(s, /if \(error\) throw new RoleLookupError/)
  assert.doesNotMatch(s, /if \(error \|\| !data\)[\s\S]{0,80}return null/)
})

test('chat y calendario traducen la base caída a 503, nunca a 403', () => {
  assert.match(src('src/lib/chat-access.ts'), /RoleLookupError\) throw new ChatAccessError\([^)]*, 503\)/)
  assert.match(src('src/lib/calendar/api-auth.ts'), /RoleLookupError\)\) throw error[\s\S]{0,160}status: 503/)
})
