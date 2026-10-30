import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { metaVigente, resumenMeta, condicionCorta, type MetaTurno } from '../../src/features/chat/lib/meta'
import { delegadosDe, textoDelegados } from '../../src/features/chat/lib/rastro'
import { snapshotMessage } from '../../src/features/chat/lib/durable-recovery'
import { sinEcoDeDelegar, invocacionesDe } from '../../src/features/cabina/model'
import type { ToolCall } from '../../src/features/chat/hooks/useChat'

/**
 * Goal UX (27 oct 2026). En una conversación real se pidió una respuesta filosófica con un `/goal` del perro
 * activo; la respuesta quedó enterrada debajo de 6 vueltas de «el perro sigue apagado». Y al delegar, el chat pintó la
 * tarjeta grande de Trabajos en vez de una línea.
 */
const CONDICION = 'ok yo lo cartgue y si lo movi al comedor pero no pares hasta llegar a la cocina'
const meta = (extra: Partial<MetaTurno> = {}): MetaTurno => ({ condicion: CONDICION, revisiones: 4, estado: 'esperando', frenada: 'repeticion', vueltas: [
  { motivo: 'Condition not satisfied: the dog never reached the kitchen.', texto: 'El perro no llegó a la cocina. Lo apagaste tú…', herramientas: 0 },
  { motivo: 'The condition requires the dog to reach the kitchen.', texto: 'El perro sigue apagado y no llegó a la cocina.', herramientas: 0 },
  { motivo: 'The transcript shows the dog never reached the kitchen.', texto: 'El perro no llegó a la cocina, y hoy ya no hay forma.', herramientas: 1 },
], ...extra })

test('el resumen plegado dice revisiones, si se cumplió y a quién espera', () => {
  assert.match(resumenMeta(meta()), /^Meta: 4 revisiones · sin cumplir · espera a \S+/)
  assert.equal(resumenMeta(meta({ estado: 'cumplida', revisiones: 1, frenada: undefined })), 'Meta: 1 revisión · cumplida')
  assert.equal(resumenMeta(meta({ estado: 'en_curso' }), true), 'Meta: 4 revisiones · revisando')
  assert.equal(resumenMeta(meta({ estado: 'pausada' })), 'Meta: 4 revisiones · sin cumplir · en pausa')
})

test('la respuesta del turno persistido es la principal y la meta viaja aparte (snapshot del daemon)', () => {
  const m = snapshotMessage({ text: 'Te explicas perfecto. El perro queda en paz…', status: 'completed', goal: meta() })
  assert.equal(m.content, 'Te explicas perfecto. El perro queda en paz…')
  assert.equal(m.meta?.vueltas.length, 3)
  assert.equal(snapshotMessage({ text: 'hola', status: 'completed' }).meta, undefined)
})

test('chip: la meta vigente sale del último marcador del hilo', () => {
  const u = (content: string) => ({ role: 'user' as const, content })
  const a = (content: string, m?: MetaTurno, streaming = false) => ({ role: 'assistant' as const, content, meta: m, streaming })
  // Fijada por comando y aún sin turno que la reporte.
  assert.deepEqual(metaVigente([u('/goal llegar a la cocina')]), { condicion: 'llegar a la cocina', estado: 'en_curso', enVivo: false })
  // El turno del daemon manda: esperando a Daniel tras el freno.
  assert.equal(metaVigente([u('/goal x'), a('resp', meta())])?.estado, 'esperando')
  // En vivo, la revisión en curso.
  assert.deepEqual(metaVigente([a('resp', meta({ estado: 'en_curso' }), true)]), { condicion: CONDICION, estado: 'en_curso', enVivo: true })
  // Pausa por comando: conserva la condición anterior.
  assert.deepEqual(metaVigente([a('resp', meta()), u('/goal pause')]), { condicion: CONDICION, estado: 'pausada', enVivo: false })
  // Quitada: no hay chip.
  assert.equal(metaVigente([a('resp', meta()), u('/goal clear')]), null)
  assert.equal(metaVigente([a('resp', meta({ estado: 'quitada' }))]), null)
  // Sin meta en el hilo: no hay chip, ni con un `/goal status`.
  assert.equal(metaVigente([u('hola'), a('qué tal'), u('/goal status')]), null)
  // La pausa del chip (daemon) gana; quitar desde el chip lo oculta antes de que `/goal clear` salga de la fila.
  assert.equal(metaVigente([a('resp', meta())], { estado: 'pausada' })?.estado, 'pausada')
  assert.equal(metaVigente([a('resp', meta())], { estado: 'quitada' }), null)
})

test('condición corta en una línea', () => {
  assert.equal(condicionCorta('a\n  b   c'), 'a b c')
  assert.equal(condicionCorta('x'.repeat(100), 10), `${'x'.repeat(9)}…`)
})

// ── Punto 6: la delegación es una línea del razonamiento ────────────────────────────────────────────────────────────

const delegar = (toolId: string, nombre: string, status: ToolCall['status'] = 'done'): [ToolCall, string] =>
  [{ toolId, toolName: 'mcp__cabina__delegar', status }, JSON.stringify({ nombre, harness: 'claude', encargo: 'Para la persona. Español…' })]
const mostrarTrabajos: [ToolCall, string] = [{ toolId: 'm1', toolName: 'mcp__cabina__mostrar', status: 'done' }, JSON.stringify({ vista: 'trabajos', enfoque: '900296 arregla la UX de la meta' })]
const turno = (...pares: [ToolCall, string][]) => ({
  toolCalls: pares.map(p => p[0]),
  toolInputs: Object.fromEntries(pares.map(p => [p[0].toolId, p[1]])),
  toolOutputs: {},
})

test('«Lanzó 2 subagentes · Goal UX, Harness en la frontera»: nombres cortos, encargo en el Taller', () => {
  const t = turno(delegar('d1', 'Goal UX: que la meta no entierre respuestas'), delegar('d2', 'Harness en la frontera: evolución y brecha vs Anthropic'))
  const d = delegadosDe(t)!
  assert.equal(d.estado, 'listo')
  assert.equal(textoDelegados(d), 'Lanzó 2 subagentes · Goal UX, Harness en la frontera')
  assert.equal(textoDelegados(delegadosDe(turno(delegar('d1', 'Perro: dolor y modo pasillo', 'running')))!), 'Lanzando un subagente · Perro')
  assert.equal(delegadosDe(turno(mostrarTrabajos)), null)
})

test('tras delegar, `mostrar trabajos` no pinta la tarjeta; pedida sola, o fijada en el panel, sí', () => {
  const conDelegar = turno(delegar('d1', 'Goal UX'), mostrarTrabajos)
  assert.equal(sinEcoDeDelegar(conDelegar, invocacionesDe(conDelegar)).length, 0)
  const pedida = turno(mostrarTrabajos)
  assert.equal(sinEcoDeDelegar(pedida, invocacionesDe(pedida)).length, 1)
  const fijada = turno(delegar('d1', 'Goal UX'), [{ toolId: 'm2', toolName: 'mcp__cabina__mostrar', status: 'done' }, JSON.stringify({ vista: 'trabajos', fijar: true })])
  assert.equal(sinEcoDeDelegar(fijada, invocacionesDe(fijada)).length, 1)
  const calendario = turno(delegar('d1', 'Goal UX'), [{ toolId: 'c1', toolName: 'mcp__cabina__mostrar', status: 'done' }, JSON.stringify({ vista: 'calendario', alcance: 'dia' })])
  assert.equal(sinEcoDeDelegar(calendario, invocacionesDe(calendario)).length, 1)
})
