import test from 'node:test'
import assert from 'node:assert/strict'
import { esMantenido, esReapertura, esSeccionCompleta, LARGA_MOVIMIENTO, LARGA_MS, REAPERTURA_MS, seQuedaAlReabrir, vistaTelefono } from '../../src/features/cabina/panel/telefono-logica'
import { nombreDeClave } from '../../src/features/cabina/panel/nombre-pestana'
import type { Fijada } from '../../src/features/cabina/panel/fijadas'

const claves = ['tareas', 'vista-1', 'vista-2', 'taller']

test('estado chat/pestaña: panel cerrado = el chat, aunque haya pestañas', () => {
  assert.deepEqual(vistaTelefono(false, claves, 'vista-1'), { tipo: 'chat' })
})

test('estado chat/pestaña: abierto muestra la activa; si ya no existe, la primera; sin pestañas, el chat', () => {
  assert.deepEqual(vistaTelefono(true, claves, 'vista-2'), { tipo: 'pestana', clave: 'vista-2' })
  assert.deepEqual(vistaTelefono(true, ['tareas', 'vista-1'], 'vista-9'), { tipo: 'pestana', clave: 'tareas' })
  assert.deepEqual(vistaTelefono(true, [], 'tareas'), { tipo: 'chat' })
})

test('reabrir la app: tras un rato en segundo plano vuelve al chat; un vistazo corto a otra app, no', () => {
  const t0 = 1_000_000
  assert.equal(esReapertura(null, t0), false, 'no estuvo oculta')
  assert.equal(esReapertura(t0, t0 + 5_000), false, 'copiar un código en otra app')
  assert.equal(esReapertura(t0, t0 + REAPERTURA_MS - 1), false)
  assert.equal(esReapertura(t0, t0 + REAPERTURA_MS), true)
  assert.equal(esReapertura(t0, t0 + 8 * 3_600_000), true, 'la mañana siguiente')
})

test('mantener presionado: quieto y con tiempo; moverse es desplazar', () => {
  assert.equal(esMantenido(LARGA_MS, 0, 0), true)
  assert.equal(esMantenido(LARGA_MS - 1, 0, 0), false, 'aún no')
  assert.equal(esMantenido(LARGA_MS + 200, LARGA_MOVIMIENTO, 0), true, 'un temblor de dedo no cancela')
  assert.equal(esMantenido(LARGA_MS + 200, LARGA_MOVIMIENTO + 3, 0), false, 'el dedo se movió: era un desplazamiento')
})

test('el nombre del centro de la cabecera: el de la pestaña', () => {
  const f = (id: string, input: Record<string, unknown>) => ({ id, input, en: 0 }) as unknown as Fijada
  const fijadas = [f('vista-1', { vista: 'calendario' }), f('vista-2', { vista: 'documento', ruta: 'notas/plan.md' })]
  assert.equal(nombreDeClave('tareas', fijadas), 'Tareas')
  assert.equal(nombreDeClave('taller', fijadas), 'Taller')
  assert.equal(nombreDeClave('vista-1', fijadas), 'Calendario')
  assert.equal(nombreDeClave('vista-9', fijadas), 'Pestaña')
})

test('reabrir no saca de Perro, Casa ni Hábitos (26 oct 2026: «Me reenvía aquí»)', () => {
  for (const r of ['/perro', '/casa', '/telefono/habitos', '/perro/x']) assert.equal(seQuedaAlReabrir(r), true, r)
  for (const r of ['/chat', '/calendar', '/perrogato', '/salud']) assert.equal(seQuedaAlReabrir(r), false, r)
  assert.equal(esSeccionCompleta('/perro'), true)
  assert.equal(esSeccionCompleta('/casa'), true)
  assert.equal(esSeccionCompleta('/chat'), false)
  assert.equal(esSeccionCompleta(null), false)
})
