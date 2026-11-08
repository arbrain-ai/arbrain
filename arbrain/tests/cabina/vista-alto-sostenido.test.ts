import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GRACIA_MS, MANO_MS, SostenAlto, altoConocido, recordarAlto } from '../../src/features/cabina/alto-sostenido'

// 5 nov 2026, Daniel 07:47: «cuando me muestras esto del negocio al volverse a cargar me regresa arriba!». Medido en WebKit
// (tests/cabina/e2e/vista-scroll, docs/builds/chat-vista-scroll-2026-11-05): leyendo «Tu negocio» a media vista, una
// relectura con el embudo a medio escribir encogía la vista y el hilo terminaba en scrollTop 0; al volver a la
// conversación la vista renacía midiendo 160 px y el scroll restaurado se recortaba. El marco sostiene su alto real.

test('la relectura llega corta y luego bien: el marco nunca baja de su alto', () => {
  const s = new SostenAlto()
  assert.equal(s.medir(2400, 0), 2400)
  assert.equal(s.medir(180, 100), 2400, 'el archivo a medio escribir: «detalles por corregir» no encoge el hilo')
  assert.ok(s.vence > 100, 'se vuelve a medir al vencer la gracia aunque nada cambie')
  assert.equal(s.medir(2400, 500), 2400, 'la siguiente lectura trae el embudo completo')
  assert.equal(s.vence, 0)
})

test('si sigue corta al vencer la gracia, era de verdad y se suelta', () => {
  const s = new SostenAlto()
  s.medir(2400, 0)
  assert.equal(s.medir(600, 100), 2400)
  assert.equal(s.medir(600, 100 + GRACIA_MS), 600)
  assert.equal(s.estable, 600)
  assert.equal(s.vence, 0)
})

test('lo que encoge la mano de Daniel (cambiar de pestaña, plegar) no se sostiene', () => {
  const s = new SostenAlto()
  s.medir(2400, 0)
  s.mano(1000)
  assert.equal(s.medir(900, 1100), 900)
  // Pasado el gesto, un encogimiento solo vuelve a sostenerse.
  assert.equal(s.medir(300, 1100 + MANO_MS + 1), 900)
})

test('crecer nunca se frena', () => {
  const s = new SostenAlto(800)
  assert.equal(s.medir(1200, 0), 1200)
  assert.equal(s.estable, 1200)
})

test('una vista que renace (remonte) usa el alto que ya tenía, no 160 px', () => {
  recordarAlto('toolu_prueba', 2465)
  const s = new SostenAlto(altoConocido('toolu_prueba'))
  assert.equal(s.estable, 2465, 'la dormida reserva el alto real desde el primer cuadro')
  s.montar(0)
  assert.equal(s.medir(320, 10), 2465, 'mientras el cuerpo monta corto, el marco sostiene')
  assert.equal(s.medir(2465, 40), 2465)
  assert.equal(s.vence, 0)
})

test('lo que nunca se midió no inventa alto', () => {
  assert.equal(altoConocido('toolu_nunca'), 0)
  recordarAlto('toolu_chico', 12)
  assert.equal(altoConocido('toolu_chico'), 0, 'un alto de placeholder no se recuerda')
  const s = new SostenAlto(0)
  s.montar(0)
  assert.equal(s.vence, 0)
})
