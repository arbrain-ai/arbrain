import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { agruparInternas } from '../../src/features/cabina/internas-por-conversacion'
import type { TareaInterna, Terminal } from '../../src/features/cabina/trabajos-modelo'

const ahora = new Date().toISOString()
const agente = (id: number, origen: string | null | undefined, estado: Terminal['estado'] = 'trabajando'): Terminal => ({
  id, titulo: `a${id}`, cwd: '/tmp', proc: 'claude', estado, actividad: null, ultimaAccion: null, ultimas: [],
  conversacion: { harness: 'claude', modelo: null, ctxPct: null, turno: estado === 'trabajando' ? 'trabajando' : 'terminado', pregunta: false, tokens: null, mensajes: [], titulo: null },
  subagente: { id, nombre: `a${id}`, harness: 'claude', encargo: 'e', cwd: '/tmp', creado: ahora, origen },
})
const interna = (id: string, conversacion: string): TareaInterna => ({ id, tipo: 'comando', descripcion: id, estado: 'trabajando', desde: ahora, actualizado: ahora, conversacion, turno: 't' } as TareaInterna)

test('los subagentes de delegar van bajo la conversación de la que salieron; la abierta primero; sin origen al final', () => {
  const { grupos } = agruparInternas([interna('bg1', 'otra')], {
    activaId: 'mejoras',
    agentes: [agente(1, 'otra'), agente(2, 'mejoras'), agente(3, null), agente(4, 'mejoras', 'esperando')],
  })
  assert.deepEqual(grupos.map(g => g.conversacion), ['mejoras', 'otra', ''])
  assert.equal(grupos[0].activa, true)
  assert.deepEqual(grupos[0].agentes.map(t => t.id), [2])
  assert.deepEqual(grupos[0].agentesTerminados.map(t => t.id), [4])
  assert.deepEqual(grupos[1].agentes.map(t => t.id), [1])
  assert.deepEqual(grupos[1].corriendo.map(t => t.id), ['bg1'])
  assert.deepEqual(grupos[2].agentes.map(t => t.id), [3])
})
