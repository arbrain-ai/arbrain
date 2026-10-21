import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { motoresPorApi, opcionesNuevas, MOTOR_CLAUDE, type Registro } from '../../src/features/modelo/estado-motores'
import { filtrarAtajos, ATAJOS_SHELL } from '../../src/shared/navigation/atajos'

// Forma real de GET /modelos/registro del Studio (2 oct 2026, 10:21), recortada.
const registro = (motorApi: boolean, presente = true, disponible = motorApi && presente): Registro => ({
  motorApi,
  proveedores: [
    { id: 'anthropic', nombre: 'Claude (suscripción Max)', auth: { kind: 'suscripcion', cuentas: ['default', 'bro'] } },
    { id: 'openai', nombre: 'OpenAI (ChatGPT Pro)', auth: { kind: 'suscripcion', cuentas: ['codex', 'yt'] } },
    { id: 'openrouter', nombre: 'OpenRouter', auth: { kind: 'api-key', variable: 'OPENROUTER_API_KEY', presente } },
  ],
  rutas: [{ id: 'deepseek-v4.1-flash@openrouter', nombre: 'DeepSeek V4.1 Flash', modelId: 'deepseek/deepseek-v4.1-flash', cuenta: 'deepseek', proveedorId: 'openrouter', disponible, motivo: disponible ? null : 'Motor por API apagado (ARBRAIN_MOTOR_API).', estado: 'experimental' }],
})

test('interruptor apagado: DeepSeek bloqueado y dice en claro qué falta y quién lo hace', () => {
  const [ds] = motoresPorApi(registro(false), 'ok')
  assert.equal(ds.disponible, false)
  assert.equal(ds.etiqueta, 'Bloqueado')
  assert.match(ds.queFalta!, /ARBRAIN_MOTOR_API=1/)
  assert.match(ds.queFalta!, /Levy/)
  assert.deepEqual(ds.pasos.map((p) => p.ok), [true, true, false, true])
})

test('falta la llave: se dice antes que el interruptor', () => {
  const [ds] = motoresPorApi(registro(true, false), 'ok')
  assert.equal(ds.disponible, false)
  assert.match(ds.queFalta!, /OPENROUTER_API_KEY/)
})

test('todo en orden: DeepSeek activo, sin pendiente', () => {
  const [ds] = motoresPorApi(registro(true), 'ok')
  assert.equal(ds.disponible, true)
  assert.equal(ds.queFalta, null)
  assert.equal(ds.etiqueta, 'Activo · experimental')
})

test('servidor viejo (404): bloqueado por versión, no por el interruptor', () => {
  const [ds] = motoresPorApi(null, 'viejo')
  assert.equal(ds.disponible, false)
  assert.match(ds.pasos[0].texto, /versión anterior/)
  assert.match(ds.queFalta!, /reinicio/)
})

test('GPT no se ofrece; solo aparece si la preferencia guardada lo trae, y no se puede elegir', () => {
  const motores = [MOTOR_CLAUDE, ...motoresPorApi(registro(true), 'ok')]
  assert.deepEqual(opcionesNuevas(motores, null).map((o) => o.id), [null, 'default', 'deepseek'])
  const conGpt = opcionesNuevas(motores, 'codex')
  assert.equal(conGpt.at(-1)!.id, 'codex')
  assert.equal(conGpt.at(-1)!.disponible, false)
})

test('filtrar atajos ignora acentos y quita los grupos vacíos', () => {
  const r = filtrarAtajos(ATAJOS_SHELL, 'tarea anterior')
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 'board')
  assert.equal(filtrarAtajos(ATAJOS_SHELL, 'zzz').length, 0)
  assert.equal(filtrarAtajos(ATAJOS_SHELL, 'CALENDARIO')[0].id, 'areas')
})
