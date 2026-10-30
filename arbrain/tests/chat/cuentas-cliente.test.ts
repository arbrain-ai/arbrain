// Edición cliente (red team 3, A-7): las cuentas de la instalación original (segunda cuenta de Claude y las dos de
// OpenAI por el Codex CLI) no existen: ni selector, ni espacio válido en la API.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { espacioDisponible, ESPACIOS_SOLO_ORIGINAL } from '../../src/shared/lib/espacios-chat'
import { accountId, ChatAccessError } from '../../src/lib/chat-access-policy'

const previo = process.env.ARBRAIN_EDICION
afterEach(() => { if (previo === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = previo })

test('espacios: los de la instalación original no están disponibles en cliente', () => {
  for (const e of ESPACIOS_SOLO_ORIGINAL) {
    assert.equal(espacioDisponible(e, true), false, e)
    assert.equal(espacioDisponible(e, false), true, e)
  }
  assert.equal(espacioDisponible('default', true), true)
  assert.equal(espacioDisponible('deepseek', true), true)
  assert.equal(espacioDisponible('inventado', false), false)
})

test('API: en cliente pedir la cuenta alterna es 400; en la original sigue igual', () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  for (const e of ['bro', 'yt', 'codex']) assert.throws(() => accountId(e), (err: unknown) => err instanceof ChatAccessError && err.status === 400, e)
  assert.equal(accountId(undefined), 'default')
  process.env.ARBRAIN_EDICION = 'original'
  assert.equal(accountId('bro'), 'bro')
})

test('el selector de cuentas no se pinta con una sola cuenta', () => {
  const c = readFileSync(new URL('../../src/features/chat/components/ModelPicker.tsx', import.meta.url), 'utf8')
  assert.match(c, /cuentas && cuentas\.length > 1 && onCuenta/)
})
