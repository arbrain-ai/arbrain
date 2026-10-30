// Botón Play (harness-noche 27 oct 2026): lo que decide dónde aparece la tarjeta y qué viaja al daemon con el clic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cuerpoDecision, vaEnElHilo, vivasParaLaPersona, type Confirmacion } from '../../src/features/permisos/lib/confirmacion'

const c = (over: Partial<Confirmacion>): Confirmacion => ({ id: 'cf_000000000001', estado: 'pendiente', categoria: 'otra', origen: 'agente', resumen: 'x', creada: 1, expira: Date.now() + 60_000, creadaPor: 'guardia', ...over })

test('en el hilo va lo que pidió Levy en la conversación; rutinas y manos de computer use siguen en el diálogo', () => {
  assert.equal(vaEnElHilo(c({})), true)
  assert.equal(vaEnElHilo(c({ origen: 'cron' })), false)
  assert.equal(vaEnElHilo(c({ origen: 'manos', creadaPor: 'peticion' })), false)
})

test('vivas: pendientes y «Córrelo tú» corriendo; lo resuelto o vencido no', () => {
  const l = vivasParaLaPersona([c({ id: 'a', creada: 3 }), c({ id: 'b', estado: 'corriendo', creada: 2 }), c({ id: 'd', estado: 'corrida' }), c({ id: 'e', expira: 0 })])
  assert.deepEqual(l.map(x => x.id), ['b', 'a'])
})

test('el clic manda decisión, alcance y comentario; nunca comando ni patrón', () => {
  assert.deepEqual(cuerpoDecision('cf_1', 'permitir'), { id: 'cf_1', decision: 'permitir', alcance: 'una' })
  assert.deepEqual(cuerpoDecision('cf_1', 'permitir', { alcance: 'siempre', comentario: '  sí,\n  pero rápido ' }), { id: 'cf_1', decision: 'permitir', alcance: 'siempre', comentario: 'sí, pero rápido' })
  assert.deepEqual(cuerpoDecision('cf_1', 'rechazar', { alcance: 'siempre' }), { id: 'cf_1', decision: 'rechazar' })
  assert.deepEqual(cuerpoDecision('cf_1', 'correr', { comentario: 'x'.repeat(900) }).comentario?.length, 500)
  for (const k of ['literal', 'patron', 'command']) assert.equal(k in cuerpoDecision('cf_1', 'permitir', { alcance: 'siempre' }), false)
})

test('la ruta de la web solo reenvía decisión, alcance y comentario al daemon', () => {
  const ruta = readFileSync(new URL('../../src/app/api/confirmaciones/resolver/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /JSON\.stringify\(\{ id: body\.id, decision: body\.decision, alcance, \.\.\.\(comentario \? \{ comentario \} : \{\}\) \}\)/)
  assert.doesNotMatch(ruta, /body\.(literal|patron|command)/)
})

test('el chat pinta la tarjeta solo en la edición cliente y en el turno vivo', () => {
  const panel = readFileSync(new URL('../../src/features/chat/components/ChatPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /\{EDICION_CLIENTE && msg\.streaming && <TarjetasDelTurno \/>\}/)
})
