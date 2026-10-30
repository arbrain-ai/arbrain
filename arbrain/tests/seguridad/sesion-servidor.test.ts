// Seguridad noche 21→22 oct 2026 (M2): la cookie del modo servidor es un token derivado de la contraseña, no la
// contraseña; cambiar la contraseña o la generación cierra las sesiones. HMAC/SHA256 puro = node:crypto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { sha256, hmacSha256Hex } from '../../src/lib/sha256-puro'
import { esCookieDeSesion, tokenSesionServidor } from '../../src/lib/desktop-auth'

const EDC = { ARBRAIN_EDICION: 'cliente', ARBRAIN_MODO_SERVIDOR: '1' }
const SEC = 'a'.repeat(40)

test('sha256 y hmac coinciden con node:crypto', () => {
  for (const s of ['', 'hola', 'a'.repeat(100), 'ñ€🔒', SEC]) {
    assert.equal(Buffer.from(sha256(new TextEncoder().encode(s))).toString('hex'), createHash('sha256').update(s).digest('hex'))
    assert.equal(hmacSha256Hex(SEC, s), createHmac('sha256', SEC).update(s).digest('hex'))
  }
})

test('el token no es la contraseña y cambia con la generación', () => {
  const t0 = tokenSesionServidor({ ...EDC, ARBRAIN_DESKTOP_SECRET: SEC })!
  assert.ok(t0.startsWith('s1.') && !t0.includes(SEC))
  const t1 = tokenSesionServidor({ ...EDC, ARBRAIN_DESKTOP_SECRET: SEC, ARBRAIN_SESION_GENERACION: '1' })!
  assert.notEqual(t0, t1)
  assert.equal(tokenSesionServidor({ ARBRAIN_EDICION: 'cliente', ARBRAIN_DESKTOP_SECRET: 'corta' }), null)
})

test('esCookieDeSesion acepta el token y rechaza la contraseña en claro', () => {
  const env = { ...EDC, ARBRAIN_DESKTOP_SECRET: SEC, MISSION_CONTROL_DESKTOP_EMBED: '1' }
  assert.equal(esCookieDeSesion(tokenSesionServidor(env), env), true)
  assert.equal(esCookieDeSesion(SEC, env), false) // la contraseña en claro ya no abre sesión
  assert.equal(esCookieDeSesion(tokenSesionServidor({ ...env, ARBRAIN_SESION_GENERACION: '9' }), env), false) // otra generación
})
