import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { ENTER, PAUSA_ENTER_MS, enviarRespuesta, lineaParaAgente } from '../../src/features/cabina/panel/responder-terminal'

test('la respuesta es una sola línea limpia: sin saltos ni caracteres de control', () => {
  assert.equal(lineaParaAgente('  sí\n\n dale\tya \x1b[31m '), 'sí dale ya [31m')
  assert.equal(lineaParaAgente('\r\n'), '')
})

test('manda el texto, espera y luego el Enter por separado', async () => {
  const orden: string[] = []
  const r = await enviarRespuesta('  opción B  ', async d => { orden.push(`w:${JSON.stringify(d)}`); return { ok: true } }, async ms => { orden.push(`pausa:${ms}`) })
  assert.deepEqual(r, { ok: true })
  assert.deepEqual(orden, ['w:"opción B"', `pausa:${PAUSA_ENTER_MS}`, `w:${JSON.stringify(ENTER)}`])
})

test('respuesta vacía: no escribe nada', async () => {
  let llamadas = 0
  const r = await enviarRespuesta('   \n ', async () => { llamadas++; return { ok: true } }, async () => {})
  assert.equal(r.ok, false)
  assert.equal(llamadas, 0)
})

test('si el motor rechaza el texto no manda el Enter y dice por qué', async () => {
  const datos: string[] = []
  const r = await enviarRespuesta('hola', async d => { datos.push(d); return { ok: false, error: 'La terminal es de solo lectura.' } }, async () => {})
  assert.deepEqual(r, { ok: false, error: 'La terminal es de solo lectura.' })
  assert.deepEqual(datos, ['hola'])
})

test('si falla el Enter se avisa (el texto quedó en la caja del agente)', async () => {
  let n = 0
  const r = await enviarRespuesta('hola', async () => ++n === 1 ? { ok: true } : { ok: false }, async () => {})
  assert.equal(r.ok, false)
})
