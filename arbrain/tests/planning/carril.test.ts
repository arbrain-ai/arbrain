import test from 'node:test'
import assert from 'node:assert/strict'
import { curvaCasa, destinoAlSoltar, destinoAlSoltarToque, diasAlSoltarRiel, ejeDeRueda, ejeDeToque, recentrar, UMBRAL_MAX, UMBRAL_TOQUE, velocidad } from '../../src/features/planning/carril-logica'
import { carriles, conMarca, eventoObjetivoDelDia, tituloCumplido, type Bloque } from '../../src/features/planning/dia-vivo'
import type { PlanEvent } from '../../src/features/planning/types'

test('soltar: la mitad de la hoja (o 240 px en pantalla grande) decide; la velocidad empuja', () => {
  assert.equal(destinoAlSoltar(-100, 520, 0), 0)
  assert.equal(destinoAlSoltar(-270, 520, 0), 1)
  assert.equal(destinoAlSoltar(270, 520, 0), -1)
  assert.equal(destinoAlSoltar(-UMBRAL_MAX, 2560, 0), 1, 'en 2560 px no hace falta media pantalla')
  assert.equal(destinoAlSoltar(-60, 520, -1), 1, 'un gesto rápido corto cruza')
  assert.equal(destinoAlSoltar(-200, 520, 1.5), 0, 'el regreso rápido lo devuelve')
  assert.equal(destinoAlSoltar(-300, 0, 0), 0)
})

test('dedo en el teléfono: cruza a los 90 px (ronda 2, menos sensible), con un deslizamiento rápido, y si no regresa', () => {
  const w = 390
  assert.equal(UMBRAL_TOQUE, 90)
  assert.equal(destinoAlSoltarToque(-89, w, 0), 0, 'a 89 px y quieto, regresa')
  assert.equal(destinoAlSoltarToque(-60, w, 0), 0, 'los 60 px de antes ya no cruzan')
  assert.equal(destinoAlSoltarToque(-UMBRAL_TOQUE, w, 0), 1, 'a 90 px cruza al día siguiente')
  assert.equal(destinoAlSoltarToque(UMBRAL_TOQUE, w, 0), -1, 'a la derecha, el día anterior')
  assert.equal(destinoAlSoltarToque(-120, w, -0.1), 1, 'lento pero pasado el umbral, cruza')
  assert.equal(destinoAlSoltarToque(-35, w, -0.8), 1, 'un deslizamiento rápido corto cruza')
  assert.equal(destinoAlSoltarToque(35, w, 0.8), -1)
  assert.equal(destinoAlSoltarToque(-25, w, -0.5), 0, 'un roce algo rápido ya no basta')
  assert.equal(destinoAlSoltarToque(-15, w, -2), 0, 'un roce de 15 px, por rápido que sea, no es un gesto')
  assert.equal(destinoAlSoltarToque(-150, w, 1.2), 0, 'el arrepentimiento rápido (sentido contrario) lo devuelve')
  assert.equal(destinoAlSoltarToque(-150, 0, 0), 0)
  assert.equal(destinoAlSoltarToque(-60, 100, 0), 1, 'en una hoja muy angosta basta con media')
})

test('dedo y trackpad: el vertical gana las diagonales; solo un gesto claramente horizontal cuenta', () => {
  assert.equal(ejeDeToque(5, 1), null, 'aún no decide')
  assert.equal(ejeDeToque(20, 4), 'x')
  assert.equal(ejeDeToque(-20, 4), 'x')
  assert.equal(ejeDeToque(20, 16), 'y', 'diagonal: es scroll, no cambia de día')
  assert.equal(ejeDeToque(18, 10), 'y', 'casi horizontal pero no el doble: scroll vertical')
  assert.equal(ejeDeToque(12, 10), 'y')
  assert.equal(ejeDeToque(3, 30), 'y')
  assert.equal(ejeDeRueda(0.5, 0.5), null)
  assert.equal(ejeDeRueda(10, 6), 'y', 'trackpad en diagonal: baja la página, no cambia de día')
  assert.equal(ejeDeRueda(12, 4), 'x')
  assert.equal(ejeDeRueda(3, 40), 'y')
})

test('riel de la Semana: más resistencia; se asienta en días enteros y nunca más de una ventana', () => {
  const col = 117 // teléfono, 3 días
  assert.equal(diasAlSoltarRiel(-60, col, 0, 3), 0, 'a 60 px quieto, no cambia de día')
  assert.equal(diasAlSoltarRiel(-89, col, 0, 3), 0)
  assert.equal(diasAlSoltarRiel(-90, col, 0, 3), 1, 'a 90 px, un día')
  assert.equal(diasAlSoltarRiel(90, col, 0, 3), -1, 'hacia la derecha, el día anterior')
  assert.equal(diasAlSoltarRiel(-150, col, 0, 3), 1, 'pasado el primero, media columna más no basta: un día')
  assert.equal(diasAlSoltarRiel(-(90 + 0.7 * col), col, 0, 3), 2, 'la segunda columna también pide pasar más de la mitad')
  assert.equal(diasAlSoltarRiel(-2000, col, 0, 3), 3, 'nunca más de una ventana')
  assert.equal(diasAlSoltarRiel(-40, col, -0.9, 3), 1, 'un deslizamiento rápido corto cruza uno')
  assert.equal(diasAlSoltarRiel(-20, col, -0.9, 3), 0, 'un roce no')
  assert.equal(diasAlSoltarRiel(-150, col, 0.9, 3), 0, 'el regreso rápido lo devuelve')
  // Escritorio, siete días: una columna de 200 px pide 110 px (55 %), no la mitad.
  assert.equal(diasAlSoltarRiel(-105, 200, 0, 7), 0)
  assert.equal(diasAlSoltarRiel(-110, 200, 0, 7), 1)
  // Siete en el teléfono (columna de 50 px): una columna entera por el primer día.
  assert.equal(diasAlSoltarRiel(-45, 50, 0, 7), 0)
  assert.equal(diasAlSoltarRiel(-50, 50, 0, 7), 1)
  assert.equal(diasAlSoltarRiel(0, col, 0, 3), 0)
  assert.equal(diasAlSoltarRiel(-100, 0, 0, 3), 0)
})

test('recentrar: cruzar hojas enteras avanza el centro sin saltos', () => {
  assert.deepEqual(recentrar(-530, 520), { pasos: 1, desplazamiento: -10 })
  assert.deepEqual(recentrar(-1100, 520), { pasos: 2, desplazamiento: -60 })
  assert.deepEqual(recentrar(600, 520), { pasos: -1, desplazamiento: 80 })
  assert.deepEqual(recentrar(-200, 520), { pasos: 0, desplazamiento: -200 })
})

test('velocidad: solo las muestras recientes; una pausa al final frena', () => {
  const m = [{ t: 0, d: -20 }, { t: 16, d: -20 }, { t: 32, d: -20 }]
  assert.ok(velocidad(m, 40) < -1)
  assert.equal(velocidad(m, 400), 0)
})

test('eje de la rueda y curva de la casa', () => {
  assert.equal(ejeDeRueda(10, 2), 'x'); assert.equal(ejeDeRueda(3, 10), 'y'); assert.equal(ejeDeRueda(.5, .5), null); assert.equal(ejeDeRueda(10, 6), 'y')
  assert.equal(curvaCasa(0), 0); assert.equal(curvaCasa(1), 1); assert.ok(curvaCasa(.3) > .8)
})

const ev = (id: string, extra: Partial<PlanEvent>): PlanEvent => ({ id, externalId: id, kind: 'event', sourceId: 'obj', account: 'a', calendarId: 'obj', title: id, description: '', location: '',
  start: '2026-10-05', end: '2026-10-06', allDay: true, timeZone: 'America/Mexico_City', etag: null, recurringEventId: null, recurrence: [], editable: true, ...extra })

test('estrella: «✓ » al inicio del título, reversible y sin duplicarse', () => {
  assert.equal(conMarca('🎯 Cerrar el guion', true), '✓ 🎯 Cerrar el guion')
  assert.equal(conMarca('✓ 🎯 Cerrar el guion', true), '✓ 🎯 Cerrar el guion')
  assert.equal(conMarca('✓ 🎯 Cerrar el guion', false), '🎯 Cerrar el guion')
  assert.ok(tituloCumplido('✓ algo')); assert.ok(!tituloCumplido('algo ✓'))
})

test('el evento del objetivo: solo el calendario «Objetivo del dia», del día pedido, el editable primero', () => {
  const fuentes = [{ id: 'obj', title: 'Objetivo del dia', objective: true }, { id: 'sem', title: 'Objetivo de la semana', objective: true }]
  const eventos = [ev('semana', { sourceId: 'sem', start: '2026-10-05', end: '2026-10-12' }), ev('ayer', { start: '2026-10-04', end: '2026-10-05' }),
    ev('ajeno', { editable: false }), ev('hoy', {})]
  assert.equal(eventoObjetivoDelDia(eventos, fuentes, '2026-10-05')?.id, 'hoy')
  assert.equal(eventoObjetivoDelDia(eventos, fuentes, '2026-10-04')?.id, 'ayer')
  assert.equal(eventoObjetivoDelDia(eventos, fuentes, '2026-10-07'), null)
})

test('agenda mini: los empalmes se reparten en carriles, solo dentro de su grupo', () => {
  const b = (id: string, i: number, f: number) => ({ id, titulo: id, inicio: i, fin: f, color: null, evento: ev(id, {}) }) as Bloque
  const r = carriles([b('a', 0, 60), b('b', 30, 90), b('c', 60, 120), b('d', 200, 260)])
  assert.deepEqual(r.get('a'), { col: 0, cols: 2 })
  assert.deepEqual(r.get('b'), { col: 1, cols: 2 })
  assert.deepEqual(r.get('c'), { col: 0, cols: 2 })
  assert.deepEqual(r.get('d'), { col: 0, cols: 1 })
})
