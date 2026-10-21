import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { trabajandoAhora, trabajandoEn, type TareaInterna, type Terminal, type Trabajos } from '../../src/features/cabina/trabajos-modelo'

// La píldora del encabezado del chat cuenta solo lo de ESTA conversación (Daniel, 5 oct 2026).
const ahora = new Date().toISOString()
const agente = (id: number, origen: string | null, estado: Terminal['estado'] = 'trabajando'): Terminal => ({
  id, titulo: `a${id}`, cwd: '/tmp', proc: 'claude', estado, actividad: null, ultimaAccion: null, ultimas: [],
  subagente: { id, nombre: `a${id}`, harness: 'claude', encargo: 'e', cwd: '/tmp', creado: ahora, origen },
})
const interna = (id: string, conversacion: string, estado: TareaInterna['estado'] = 'trabajando'): TareaInterna =>
  ({ id, tipo: 'subagente', descripcion: id, estado, desde: ahora, actualizado: ahora, conversacion, turno: 't' })
const datos = (terminales: Terminal[], internas: TareaInterna[]): Trabajos => ({ terminales, internas, servidores: [], servicios: [], sfterm: false, leidoEn: ahora })

test('cuenta agentes lanzados desde la conversación y tareas internas de sus turnos, nada de otras', () => {
  const d = datos(
    [agente(1, 'esta'), agente(2, 'otra'), agente(3, null), agente(4, 'esta', 'esperando'), { ...agente(5, null), subagente: undefined }],
    [interna('i1', 'sdk:esta'), interna('i2', 'otra'), interna('i3', 'esta', 'completada')],
  )
  assert.equal(trabajandoEn(d, 'esta'), 2)
  assert.equal(trabajandoEn(d, 'sdk:otra'), 2)
})

test('sin conversación abierta o sin lectura, cero', () => {
  assert.equal(trabajandoEn(datos([agente(1, 'esta')], []), null), 0)
  assert.equal(trabajandoEn(undefined, 'esta'), 0)
})

test('los comandos en segundo plano son procesos: no cuentan como agentes (14 oct 2026)', () => {
  const comando = (id: string, conversacion: string): TareaInterna => ({ ...interna(id, conversacion), tipo: 'comando' })
  const d = datos([agente(1, 'esta')], [interna('i1', 'esta'), comando('b1', 'esta'), comando('b2', 'esta'), comando('b3', 'otra')])
  assert.equal(trabajandoEn(d, 'esta'), 2)
  assert.deepEqual(trabajandoAhora(d), { agentes: 2, procesos: 3, total: 5 })
})
