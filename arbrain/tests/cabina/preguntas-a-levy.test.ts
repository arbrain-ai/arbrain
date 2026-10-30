import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { esperaALevy, estadoEnPalabras, preguntaAlgo, type Terminal } from '../../src/features/cabina/trabajos-modelo'
import { pideRevision } from '../../src/features/cabina/panel/pendientes'

const ahora = new Date().toISOString()
const term = (extra: Partial<Terminal> = {}, pregunta = true): Terminal => ({
  id: 100091, titulo: 'Lienzo', cwd: '~/Developer/wt-lienzo-rendimiento', proc: 'claude', estado: 'esperando', actividad: null, ultimaAccion: null, ultimas: [],
  conversacion: { harness: 'claude', modelo: null, ctxPct: null, turno: 'terminado', pregunta, tokens: null, mensajes: [], titulo: null }, ...extra,
})
const sub = { id: 100091, nombre: 'Lienzo', harness: 'claude', encargo: 'e', cwd: '/tmp', creado: ahora }

test('la pregunta de un subagente de Levy NO enciende «Espera tu decisión» mientras Levy la tiene', () => {
  const t = term({ subagente: sub })
  assert.equal(preguntaAlgo(t), true)
  assert.equal(esperaALevy(t), true)
  assert.equal(pideRevision(t), false)
  assert.equal(estadoEnPalabras(t), 'Le preguntó a Levy')
})

test('subida a Daniel (escalado) sí la enciende', () => {
  const t = term({ subagente: { ...sub, escalado: ahora, escaladoPor: 'Levy no la atendió en 10 min' } })
  assert.equal(esperaALevy(t), false)
  assert.equal(pideRevision(t), true)
  assert.equal(estadoEnPalabras(t), 'Te pregunta algo')
})

test('un diálogo (AskUserQuestion) cuenta como pregunta aunque el turno siga «trabajando»', () => {
  const t = term({ estado: 'trabajando', subagente: { ...sub, pregunta: { texto: '¿Quadtree o rejilla?', tipo: 'dialogo', desde: Date.now() }, escalado: ahora } }, false)
  assert.equal(preguntaAlgo(t), true)
  assert.equal(pideRevision(t), true)
})

test('una terminal propia de Daniel sigue pidiendo su revisión como antes', () => {
  assert.equal(pideRevision(term()), true)
  assert.equal(pideRevision(term({}, false)), false)
})
