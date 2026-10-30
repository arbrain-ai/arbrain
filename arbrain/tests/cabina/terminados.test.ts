import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { agenteTerminado, agenteVivo, partirInternas, partirTerminales, resumenInterna, resumenTerminal, unaLinea } from '../../src/features/cabina/terminados'
import type { TareaInterna, Terminal } from '../../src/features/cabina/trabajos-modelo'

const term = (extra: Partial<Terminal> = {}): Terminal => ({ id: 1, titulo: 'x', cwd: '/tmp', proc: 'claude', estado: 'trabajando', actividad: null, ultimaAccion: null, ultimas: [], ...extra })
const conv = (pregunta: boolean, texto = 'Listo.'): Terminal['conversacion'] => ({ harness: 'claude', modelo: null, ctxPct: null, turno: 'terminado', pregunta, tokens: null, titulo: null, mensajes: [{ rol: 'assistant', texto, herramientas: [] }] })
const interna = (extra: Partial<TareaInterna> = {}): TareaInterna => ({ id: 'a', tipo: 'subagente', descripcion: 'Revisar el build', estado: 'trabajando', desde: '2026-10-02T12:00:00Z', actualizado: '2026-10-02T12:10:00Z', conversacion: 'c', turno: 't', ...extra })

test('trabajando y «te pregunta algo» siguen vivos; esperando sin pregunta termina', () => {
  assert.ok(agenteVivo(term()))
  assert.ok(agenteVivo(term({ estado: 'esperando', conversacion: conv(true, '¿Sigo?') })))
  const t = term({ estado: 'esperando', conversacion: conv(false) })
  assert.ok(!agenteVivo(t) && agenteTerminado(t))
})
test('una shell no es agente: no va a Terminados', () => {
  assert.ok(!agenteTerminado(term({ estado: 'terminal', proc: 'zsh' })))
})
test('partirTerminales deja vivos arriba y terminados aparte', () => {
  const r = partirTerminales([term({ id: 1 }), term({ id: 2, estado: 'esperando', conversacion: conv(false) }), term({ id: 3, estado: 'terminal', proc: 'zsh' })])
  assert.deepEqual(r.vivos.map(x => x.id), [1, 3]); assert.deepEqual(r.terminados.map(x => x.id), [2])
})
test('el resumen es una línea limpia y acotada', () => {
  assert.equal(unaLinea('\n**Hecho:** arreglé `Foo`\nsegunda'), 'Hecho: arreglé Foo')
  assert.ok((unaLinea('a'.repeat(400)) ?? '').length <= 140)
  assert.equal(resumenTerminal(term({ estado: 'esperando', conversacion: conv(false, 'Quedó listo el panel.\nDetalle') })), 'Quedó listo el panel.')
  assert.equal(resumenTerminal(term({ estado: 'esperando', ultimaAccion: 'Edit(a.ts)' })), 'Edit(a.ts)')
})
test('partirInternas: terminadas (falladas y detenidas incluidas) más recientes primero', () => {
  const r = partirInternas([interna({ id: '1' }), interna({ id: '2', estado: 'completada', fin: '2026-10-02T13:00:00Z' }), interna({ id: '3', estado: 'falló', fin: '2026-10-02T14:00:00Z' }), interna({ id: '4', estado: 'detenida' })])
  assert.deepEqual(r.vivas.map(x => x.id), ['1']); assert.deepEqual(r.terminadas.map(x => x.id), ['3', '2', '4'])
  assert.equal(resumenInterna(interna({ estado: 'completada', resumen: 'Todo verde.' })), 'Todo verde.')
})
