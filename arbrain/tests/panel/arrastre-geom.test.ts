import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { RADIO_IMAN, RESORTE_CSS, imanDeRanura, ranuraEnTira } from '../../src/features/cabina/panel/arrastre-geom'
import {
  DESVIO_X, DESVIO_Y, UMBRAL, dentroDeLaVentana, desplazamientos, esquinaDeVentana, indiceDeInsercion, pasoElUmbral, puntoEnElPanel, puntoEnRect, rectEnPantalla,
  type GeomVentana, type Rect,
} from '../../src/features/cabina/panel/arrastre-geom'

// Ventana principal de 1400x900 con barra de título de 28 px, en (100, 50) de la pantalla.
const principal: GeomVentana = { screenX: 100, screenY: 50, outerWidth: 1400, outerHeight: 928, innerWidth: 1400, innerHeight: 900 }
// El panel ocupa la columna derecha: x 1000..1400, y 0..900 en px de cliente.
const panel: Rect = { left: 1000, top: 0, right: 1400, bottom: 900 }

test('un clic no es arrastre: hace falta pasar el umbral', () => {
  assert.equal(pasoElUmbral({ x: 10, y: 10 }, { x: 13, y: 12 }), false)
  assert.equal(pasoElUmbral({ x: 10, y: 10 }, { x: 10 + UMBRAL, y: 10 }), true)
  assert.equal(pasoElUmbral({ x: 10, y: 10 }, { x: 14, y: 14 }), false) // 5.66 px
  assert.equal(pasoElUmbral({ x: 10, y: 10 }, { x: 15, y: 15 }), true) // 7.07 px
})

test('puntoEnRect incluye el borde', () => {
  assert.equal(puntoEnRect({ x: 1000, y: 0 }, panel), true)
  assert.equal(puntoEnRect({ x: 999, y: 10 }, panel), false)
  assert.equal(puntoEnRect({ x: 1200, y: 901 }, panel), false)
})

test('el puntero fuera de su ventana: a la izquierda, arriba, abajo y a otro monitor', () => {
  assert.equal(dentroDeLaVentana({ x: 500, y: 400 }, principal), true)
  assert.equal(dentroDeLaVentana({ x: -1, y: 400 }, principal), false)
  assert.equal(dentroDeLaVentana({ x: 500, y: -20 }, principal), false)
  assert.equal(dentroDeLaVentana({ x: 1400, y: 400 }, principal), false)
  assert.equal(dentroDeLaVentana({ x: 3000, y: 400 }, principal), false)
})

test('rectEnPantalla: sin zoom, el origen de cliente cae bajo la barra de título', () => {
  const r = rectEnPantalla(principal, panel)
  assert.deepEqual(r, { left: 1100, top: 78, right: 1500, bottom: 978 })
})

test('rectEnPantalla con zoom de página 80%: las medidas de cliente se escalan a puntos de pantalla', () => {
  // Con zoom 80% el viewport CSS mide 1/0.8 más: innerWidth 1750 en una ventana de 1400 pt.
  const zoom: GeomVentana = { screenX: 0, screenY: 0, outerWidth: 1400, outerHeight: 928, innerWidth: 1750, innerHeight: 1125 }
  const r = rectEnPantalla(zoom, { left: 1250, top: 0, right: 1750, bottom: 1125 })
  assert.equal(r.left, 1000)
  assert.equal(r.right, 1400)
  assert.equal(r.top, 28)
  assert.equal(r.bottom, 928)
})

test('soltar sobre el panel de la ventana principal lo toma; fuera de él, no', () => {
  // Punto de pantalla: la mitad del panel (x 1100..1500, y 78..978).
  assert.equal(puntoEnElPanel({ x: 1300, y: 400 }, principal, panel), true)
  // Sobre el chat (a la izquierda del panel).
  assert.equal(puntoEnElPanel({ x: 600, y: 400 }, principal, panel), false)
  // Sobre la barra de título: arriba del panel.
  assert.equal(puntoEnElPanel({ x: 1300, y: 60 }, principal, panel), false)
  // Otro monitor.
  assert.equal(puntoEnElPanel({ x: -800, y: 400 }, principal, panel), false)
  assert.equal(puntoEnElPanel({ x: 2100, y: 400 }, principal, panel), false)
})

test('la esquina de la ventana nueva deja el cursor sobre su cabecera (mismos desvíos que Rust)', () => {
  assert.deepEqual(esquinaDeVentana({ x: 600, y: 200 }), { x: 600 - DESVIO_X, y: 200 - DESVIO_Y })
  assert.equal(DESVIO_X, 90)
  assert.equal(DESVIO_Y, 52)
})

test('reordenar: el índice de inserción cuenta los centros que quedaron a la izquierda (sin la arrastrada)', () => {
  const centros = [50, 150, 250]
  assert.equal(indiceDeInsercion(centros, 10, 1), 0)
  assert.equal(indiceDeInsercion(centros, 160, 0), 1)
  assert.equal(indiceDeInsercion(centros, 400, 0), 2)
  assert.equal(indiceDeInsercion(centros, 149, 1), 1)
})

test('reordenar: las vecinas se apartan el ancho de la arrastrada y ella va al hueco', () => {
  // Tres pestañas de 100 px con 2 px entre ellas: 0, 102, 204.
  const cajas = [{ left: 0, width: 100 }, { left: 102, width: 100 }, { left: 204, width: 100 }]
  assert.deepEqual(desplazamientos(cajas, 0, 0), [0, 0, 0])
  assert.deepEqual(desplazamientos(cajas, 0, 2), [204, -102, -102])
  assert.deepEqual(desplazamientos(cajas, 2, 0), [102, 102, -204])
  // Anchos distintos: «Calendario» (120) pasa antes de «Tareas» (80).
  assert.deepEqual(desplazamientos([{ left: 0, width: 80 }, { left: 82, width: 120 }], 1, 0), [122, -82])
})

// ── El fantasma que cruza monitores (5 oct 2026) ──
import { MARGEN_FANTASMA, esquinaDelFantasma, interpolar, pestanaEnFantasma, ranuraEnBlanco, suavizar, type Blanco } from '../../src/features/cabina/panel/arrastre-geom'

test('fantasma: su marco cae justo donde nacería la ventana al soltar ahí', () => {
  const cursor = { x: 2500, y: 400 }
  const e = esquinaDelFantasma(cursor), v = esquinaDeVentana(cursor)
  assert.deepEqual({ x: e.x + MARGEN_FANTASMA, y: e.y + MARGEN_FANTASMA }, v)
})

test('fantasma: sola, la pestaña queda bajo el cursor donde se tomó; como ventana, en su lugar de la cabecera', () => {
  const agarre = { x: 30, y: 12 }
  const sola = pestanaEnFantasma({ modo: 'pestana', agarre })
  // Esquina del fantasma + posición de la pestaña + agarre = cursor.
  const cursor = { x: 900, y: 300 }, e = esquinaDelFantasma(cursor)
  assert.deepEqual({ x: e.x + sola.x + agarre.x, y: e.y + sola.y + agarre.y }, cursor)
  const enVentana = pestanaEnFantasma({ modo: 'ventana', agarre })
  assert.ok(enVentana.x > MARGEN_FANTASMA && enVentana.y > MARGEN_FANTASMA + 28)
})

const blanco: Blanco = {
  ventana: 'ventana-1', foco: 1,
  area: { left: 2000, top: 0, right: 3000, bottom: 900 },
  tira: { left: 2010, top: 40, right: 2600, bottom: 70 },
  pestanas: [
    { clave: 'tareas', centro: 2050, izquierda: 2010, ancho: 80 },
    { clave: 'cal', centro: 2150, izquierda: 2092, ancho: 116 },
  ],
}

test('aterrizaje: la pestaña cae donde la otra tira le abrió el hueco', () => {
  // Entre las dos: el hueco empieza donde estaba la segunda (que se corrió a la derecha).
  assert.deepEqual(ranuraEnBlanco(blanco, 1, 'nueva', 30), { x: 2092, y: 40 })
  assert.deepEqual(ranuraEnBlanco(blanco, 0, 'nueva', 30), { x: 2010, y: 40 })
  // Al final: después de la última.
  assert.deepEqual(ranuraEnBlanco(blanco, 2, 'nueva', 30), { x: 2092 + 116 + 2, y: 40 })
  // Tira vacía: al principio de la tira.
  assert.deepEqual(ranuraEnBlanco({ ...blanco, pestanas: [] }, 0, 'nueva', 30), { x: 2010, y: 40 })
  // Una ventana con la web de antes no dice dónde están sus pestañas: no hay aterrizaje (el fantasma se desvanece).
  assert.equal(ranuraEnBlanco({ ...blanco, pestanas: [{ clave: 'tareas', centro: 2050 }] }, 0, 'nueva'), null)
  assert.equal(ranuraEnBlanco({ ...blanco, tira: null }, 0, 'nueva'), null)
})

test('aterrizaje: curva que llega exacto', () => {
  assert.equal(suavizar(0), 0); assert.equal(suavizar(1), 1); assert.equal(suavizar(2), 1)
  assert.ok(suavizar(0.5) > 0.5)
  assert.deepEqual(interpolar({ x: 0, y: 0 }, { x: 100, y: -50 }, 1), { x: 100, y: -50 })
})

test('ranura en la tira: el ancho real de la pestaña, en el lugar donde caerá', () => {
  const cajas = [{ left: 10, width: 80, top: 5 }, { left: 92, width: 116, top: 5 }, { left: 210, width: 60, top: 5 }]
  // La primera, arrastrada al final: ocupa lo que ocupan las otras dos antes que ella.
  assert.deepEqual(ranuraEnTira(cajas, 0, 2), { left: 10 + 116 + 2 + 60 + 2, width: 80, top: 5 })
  // Sin moverse queda en su lugar.
  assert.deepEqual(ranuraEnTira(cajas, 1, 1), { left: 92, width: 116, top: 5 })
  assert.equal(ranuraEnTira(cajas, 7, 0), null)
})

test('imán: fuera del radio sigue al cursor, dentro se atrae y al centro queda alineada', () => {
  const ranura = { x: 100, y: 40 }
  const lejos = imanDeRanura({ x: 100 + RADIO_IMAN, y: 40 }, ranura)
  assert.equal(lejos.atrapada, false); assert.deepEqual(lejos.pos, { x: 100 + RADIO_IMAN, y: 40 })
  const mitad = imanDeRanura({ x: 100 + RADIO_IMAN / 2, y: 40 }, ranura)
  assert.equal(mitad.fuerza, 1); assert.deepEqual(mitad.pos, ranura)
  const borde = imanDeRanura({ x: 100 + RADIO_IMAN - 1, y: 40 }, ranura)
  assert.ok(borde.atrapada && borde.fuerza > 0 && borde.fuerza < 0.05)
  // Más cerca de la ranura que el cursor, nunca más lejos; y continuo (sin saltos grandes entre px vecinos).
  let antes = imanDeRanura({ x: 100 + RADIO_IMAN, y: 40 }, ranura).pos.x
  for (let dx = RADIO_IMAN - 1; dx >= 0; dx--) {
    const m = imanDeRanura({ x: 100 + dx, y: 40 }, ranura).pos.x
    assert.ok(m <= 100 + dx + 1e-9 && Math.abs(m - antes) <= 3.5, `dx=${dx}`)
    antes = m
  }
  // Sin ranura (otra ventana sin medidas): no hay imán.
  assert.deepEqual(imanDeRanura({ x: 5, y: 5 }, null).pos, { x: 5, y: 5 })
  // El imán también atrae en vertical.
  assert.equal(imanDeRanura({ x: 100, y: 40 + 10 }, ranura).pos.y, 40)
})

test('resorte: sale de 0, llega a 1 y rebasa poco', () => {
  const v = RESORTE_CSS.slice(7, -1).split(', ').map(Number)
  assert.equal(v[0], 0); assert.equal(v[v.length - 1], 1)
  assert.ok(Math.max(...v) > 1 && Math.max(...v) < 1.05, `rebase ${Math.max(...v)}`)
  assert.ok(v[10] > 0.8)
})

test('resorte: el CSS del panel lleva exactamente la curva que calcula la geometría', () => {
  const css = readFileSync(new URL('../../src/features/cabina/panel/panel.module.css', import.meta.url), 'utf8')
  assert.ok(css.includes(RESORTE_CSS), 'panel.module.css debe llevar RESORTE_CSS (arrastre-geom.ts)')
})
