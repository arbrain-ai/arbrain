/**
 * Lienzo · piezas vivas fuera de su caja y parpadeo (17 nov 2026). Puro, sin navegador.
 *
 * Cada escenario corre DOS veces: con `crearConfirmadas` (el arreglo, debe cumplir el invariante) y con `ingenua`, una
 * copia fiel de las reglas que tenía `usePiezas` antes (mostrar con el `colocado` del último pedido, quitar el póster de
 * toda viva pedida con el host visible, la vista no invalidaba nada, reenviar siempre). La ingenua DEBE romperlo: así la
 * prueba demuestra que falla sin el arreglo.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { colocacion, crearConfirmadas, siguientePresupuesto, medidaFiel, type Colocacion, type Confirmadas, type Medida } from '../../src/features/canvas/piezas/confirmadas'

/** Las reglas de antes (usePiezas, commit 67273127d), con la misma interfaz. */
function ingenua(): Confirmadas {
  let ultimo = 0, vivas: string[] = [], visible = false
  return {
    invalidar() { const h = visible; visible = false; return h },   // solo la cámara llamaba aquí; la vista, no
    olvidar() {},
    pedir(lista, pedido) { ultimo = pedido; vivas = lista.map(c => c.id); if (!lista.length) visible = false; return { pedido } },
    confirmar(pedido) { if (pedido !== ultimo || !vivas.length) return { mostrar: false, malas: [] }; visible = true; return { mostrar: true, malas: [] } },
    confirmada: id => visible && vivas.includes(id),
    visible: () => visible,
    pedidas: () => vivas,
  }
}

const FICHA = { ancho: 1600 }
const CAJA = { x: 3820, y: 0, width: 5700, height: 1880 }
const anchos = () => FICHA.ancho
const vp = (width: number) => ({ width, height: 1050, dpr: 2 })
const col = (id: string, cam: { x: number; y: number; zoom: number }, w = 2048): Colocacion => ({ id, ...colocacion(CAJA, FICHA, cam, vp(w)) })
/** El host, fiel: mide la raíz con la colocación que APLICÓ. */
const medir = (c: Colocacion[]): Medida[] => c.map(x => ({ id: x.id, x: x.x, y: x.y, ancho: FICHA.ancho * x.escala }))

/** Escenario A (la captura de la Oferta): una viva confirmada; la vista cambia (plegar la barra) sin mover la cámara. */
function vistaCambia(v: Confirmadas) {
  const cam = { x: 6000, y: 900, zoom: 0.2097 }
  const a = [col('pieza-escalera', cam, 1800)]
  v.pedir(a, 1); v.confirmar(1, medir(a), anchos)
  assert.equal(v.confirmada('pieza-escalera'), true)
  // La vista pasa de 1800 a 2048 de ancho: la caja correcta se corre 124 px. Lo mostrado ya no está en su caja.
  v.invalidar()  // el arreglo lo llama al cambiar la vista (useLayoutEffect); la ingenua no lo recibía: se simula como no-op
  return { mostrada: v.confirmada('pieza-escalera') }
}

/** Escenario B (el marco vacío): con el host ya visible, entra una viva nueva que el host aún no colocó (máquina lenta). */
function entraOtra(v: Confirmadas) {
  const cam = { x: 6000, y: 900, zoom: 0.3 }
  const a = [col('a', cam)]
  v.pedir(a, 1); v.confirmar(1, medir(a), anchos)
  const b = [col('a', cam), col('b', cam)]
  v.pedir(b, 2)
  return { bSinPoster: v.confirmada('b'), aSigue: v.confirmada('a') }
}

/** Escenario C: una confirmación tardía de un pedido anterior a la cámara de ahora. */
function confirmacionTardia(v: Confirmadas) {
  const vieja = [col('a', { x: 6000, y: 900, zoom: 0.25 })]
  v.pedir(vieja, 1)
  v.invalidar()                                         // la cámara se mueve
  const nueva = [col('a', { x: 6000, y: 900, zoom: 0.2097 })]
  v.pedir(nueva, 2)
  const r1 = v.confirmar(1, medir(vieja), anchos)       // llega tarde el colocado 1
  return { mostroVieja: r1.mostrar }
}

/** Escenario D: el host confirma el pedido vigente pero su raíz quedó en otra parte (colocación vieja aplicada después). */
function hostDesfasado(v: Confirmadas) {
  const cam = { x: 6000, y: 900, zoom: 0.2097 }
  const pedida = [col('a', cam)]
  v.pedir(pedida, 3)
  const real = [col('a', { ...cam, zoom: cam.zoom * 1.213 })]   // la razón medida en la captura de Daniel
  const r = v.confirmar(3, medir(real), anchos)
  return { mostro: r.mostrar, confirmada: v.confirmada('a') }
}

/** Escenario E: decidir otra vez con la cámara quieta y lo mismo pedido no manda nada (sin reinicios ni parpadeo). */
function mismaDecision(v: Confirmadas) {
  const cam = { x: 6000, y: 900, zoom: 0.3 }
  const a = [col('a', cam)]
  v.pedir(a, 1); v.confirmar(1, medir(a), anchos)
  let mandados = 0
  for (let i = 0; i < 10; i++) if (v.pedir([col('a', cam)], 2 + i)) mandados++
  return { mandados, sigue: v.confirmada('a') }
}

test('arreglo · la vista cambia: lo confirmado deja de valer (vuelve el póster hasta la nueva confirmación)', () => {
  assert.equal(vistaCambia(crearConfirmadas()).mostrada, false)
})
test('sin arreglo · la vista cambia y la viva sigue mostrada con su caja vieja', () => {
  // Antes nada invalidaba al cambiar la vista: la viva quedaba visible fuera de su caja hasta el siguiente colocado.
  const v = ingenua()
  const cam = { x: 6000, y: 900, zoom: 0.2097 }
  const a = [col('pieza-escalera', cam, 1800)]
  v.pedir(a, 1); v.confirmar(1, medir(a), anchos)
  const correcta = col('pieza-escalera', cam, 2048)
  assert.ok(Math.abs(correcta.x - a[0].x) >= 1, 'la caja correcta se movió más de 1 px')
  assert.equal(v.confirmada('pieza-escalera'), true, 'la ingenua la sigue dando por buena: rompe el invariante')
})

test('arreglo · una viva nueva conserva su póster hasta que el host la confirma; la que ya estaba sigue viva', () => {
  const r = entraOtra(crearConfirmadas())
  assert.equal(r.bSinPoster, false)
  assert.equal(r.aSigue, true)
})
test('sin arreglo · la viva nueva pierde su póster antes de que el host la coloque (marco vacío)', () => {
  assert.equal(entraOtra(ingenua()).bSinPoster, true)
})

test('arreglo · un colocado de un pedido anterior a la cámara de ahora no muestra nada', () => {
  assert.equal(confirmacionTardia(crearConfirmadas()).mostroVieja, false)
})

test('arreglo · si el host mide su raíz a 1 px o más de la caja pedida, se oculta y queda el póster', () => {
  const r = hostDesfasado(crearConfirmadas())
  assert.equal(r.mostro, false)
  assert.equal(r.confirmada, false)
})
test('sin arreglo · el host desfasado (1.213×) se mostraba igual', () => {
  assert.equal(hostDesfasado(ingenua()).mostro, true)
})

test('arreglo · la misma decisión con la cámara quieta no se vuelve a mandar', () => {
  const r = mismaDecision(crearConfirmadas())
  assert.equal(r.mandados, 0)
  assert.equal(r.sigue, true)
})
test('sin arreglo · cada decisión reenviaba el colocar (y reiniciaba la medida de ritmo del host)', () => {
  assert.equal(mismaDecision(ingenua()).mandados, 10)
})

test('arreglo · una pieza rehecha estando viva vuelve a pedirse y espera su confirmación', () => {
  const v = crearConfirmadas()
  const cam = { x: 6000, y: 900, zoom: 0.3 }
  const a = [col('a', cam)]
  v.pedir(a, 1); v.confirmar(1, medir(a), anchos)
  v.olvidar('a')
  assert.equal(v.confirmada('a'), false)
  assert.ok(v.pedir([col('a', cam)], 2), 'se vuelve a mandar aunque la colocación sea la misma')
  assert.equal(v.confirmar(2, medir(a), anchos).mostrar, true)
})

test('medidaFiel: 0.5 px pasa, 1 px no; sin medida de una viva pedida, no pasa', () => {
  const c: Colocacion[] = [{ id: 'a', x: 100, y: 50, escala: 0.5 }]
  assert.deepEqual(medidaFiel(c, [{ id: 'a', x: 100.5, y: 50, ancho: 800.4 }], anchos), [])
  assert.deepEqual(medidaFiel(c, [{ id: 'a', x: 101, y: 50, ancho: 800 }], anchos), ['a'])
  assert.deepEqual(medidaFiel(c, [], anchos), ['a'])
})

test('presupuesto: con la cámara quieta solo baja, nunca sube, y no baja con una medida sin confirmar', () => {
  let p = 4
  const serie: number[] = []
  const fps = [40, 70, 30, 80, 20, 90, 10]
  for (const f of fps) { p = siguientePresupuesto(p, { fps: f, vivas: Math.min(p, 4), minimo: 56, confirmado: true }); serie.push(p) }
  for (let i = 1; i < serie.length; i++) assert.ok(serie[i] <= serie[i - 1], `subió: ${serie.join(',')}`)
  assert.equal(serie.at(-1), 1)
  assert.equal(siguientePresupuesto(3, { fps: 10, vivas: 3, minimo: 56, confirmado: false }), 3)
})

// ── La causa raíz (17 nov, tarde): el ZOOM DE INTERFAZ. El host va neutralizado (zoom 1/--ui-zoom, tamaño × --ui-zoom):
//    sus px son px de pantalla, y una colocación en px del lienzo hay que pasarla a los suyos. Medido en un WKWebView real:
//    sin esto, a zoom 1.2 aplicado tras cargar, la viva quedaba a 537 px de su caja (razón 0.834). ──
import { aHost, deHost, escalaDelHost } from '../../src/features/canvas/piezas/confirmadas'

/** El host, fiel: aplica la colocación EN SUS PX; su raíz se ve en pantalla a px del host × (px de pantalla por px del host). */
function enPantalla(c: Colocacion, pxPantallaPorPxHost: number) {
  return { x: c.x * pxPantallaPorPxHost, y: c.y * pxPantallaPorPxHost, ancho: FICHA.ancho * c.escala * pxPantallaPorPxHost }
}
for (const z of [0.8, 1, 1.2, 1.5]) for (const ancho of [2048, 1440]) {
  test(`zoom de interfaz ${z} a ${ancho}: la viva cae a < 1 px de su caja en pantalla`, () => {
    const vp = { width: Math.round(ancho / z), height: 900, dpr: 2 }
    const cam = { x: 6000, y: 900, zoom: 0.2097 * 1.3 }
    const lienzo = { id: 'a', ...colocacion(CAJA, FICHA, cam, vp) }          // px de layout del lienzo
    const esperada = { x: lienzo.x * z, y: lienzo.y * z, ancho: CAJA.width * cam.zoom * z } // el lienzo, en pantalla, × zoom
    const anchoHost = vp.width * z                                            // el host neutralizado: tamaño × zoom
    const k = escalaDelHost(vp.width, Math.round(anchoHost), z)               // innerWidth llega entero
    const real = enPantalla(aHost(lienzo, k), 1)                              // px del host = px de pantalla
    assert.ok(Math.abs(real.x - esperada.x) < 1 && Math.abs(real.y - esperada.y) < 1 && Math.abs(real.ancho - esperada.ancho) < 1, JSON.stringify({ real, esperada }))
    // Y el lienzo lo comprueba con la medida que el host le devuelve:
    assert.deepEqual(medidaFiel([lienzo], [deHost({ id: 'a', ...real }, k)], anchos), [])
    if (z !== 1) {
      // SIN el arreglo (colocar en px del lienzo tal cual): fuera de su caja, y la comprobación lo ataja.
      const sin = enPantalla(lienzo, 1)
      assert.ok(Math.abs(sin.ancho - esperada.ancho) >= 1 || Math.abs(sin.x - esperada.x) >= 1)
      assert.deepEqual(medidaFiel([lienzo], [deHost({ id: 'a', ...sin }, k)], anchos), ['a'])
    }
  })
}
test('escalaDelHost: usa 1/--ui-zoom exacto si la medida del host lo confirma; si no, la medida', () => {
  assert.equal(escalaDelHost(1365, 2048, 1.5), 1 / 1.5)          // 1365 × 1.5 = 2047.5 → innerWidth 2048
  assert.equal(escalaDelHost(1000, 1000, 1), 1)
  assert.equal(escalaDelHost(1000, null, 1.2), 1 / 1.2)
  assert.equal(escalaDelHost(1000, 1000, 1.2), 1)                // el host no quedó neutralizado: manda lo medido
})
