/**
 * Terminal inferior en Windows (16 nov 2026). El motor de terminales no existe en Windows (src-tauri/src/motor.rs); antes la
 * terminal enseñaba «El motor no responde: connect ENOENT …». Ahora dice qué pasa y qué hacer, y Mac/Linux no cambian.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { avisoSinMotor } from '../../src/lib/motor-plataforma'

test('Windows: la terminal dice en una frase que no está y qué sí puede hacer la persona', () => {
  const aviso = avisoSinMotor('win32')
  assert.ok(aviso)
  assert.match(aviso, /todavía no funciona en Windows/)
  assert.match(aviso, /Levy/)
  assert.doesNotMatch(aviso, /ENOENT|socket|motor/i)
  assert.equal(avisoSinMotor('darwin'), null)
  assert.equal(avisoSinMotor('linux'), null)
})

test('el motor revisa el sistema antes de conectarse (todas las terminales pasan por ConexionMotor.abrir)', () => {
  const s = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/motor.ts'), 'utf8')
  const abrir = s.slice(s.indexOf('async abrir('), s.indexOf('connect(motorSock())'))
  assert.match(abrir, /avisoSinMotor\(process\.platform\)/)
})
