// Visor de video (8 nov 2026, Daniel: «no se adapta al 16:9, es tan grande que me toca hacer scroll y debería ser estático»; «esc salir
// pantalla completa, f full size, flechas adelantar y atrasar, space pausa y play»).
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { HOLGURA_GRANDE, MARGEN_INFERIOR_VISOR, SALTO_FLECHA_S, altoDeEscenario, espacioLibre, pasoDeFlecha } from '../../src/features/cabina/documento/medio'

const H = 16 / 9
const base = { grande: true, vertical: false, altoVentana: 1000, zoom: 1, hueco: 1500, proporciones: [H] }

test('zoom 1: el escenario es la ventana menos la holgura, como siempre', () => {
  assert.equal(altoDeEscenario(base), 1000 - HOLGURA_GRANDE)
})

test('con zoom de la interfaz el escenario NO se pasa de la ventana (lo que obligaba a hacer scroll)', () => {
  for (const zoom of [0.8, 1, 1.1, 1.25, 1.5, 1.8]) {
    const alto = altoDeEscenario({ ...base, zoom })
    // Lo que mide en pantalla: un alto en px se multiplica por el zoom de <html>. Piso de 260 px: un escenario menor no sirve y
    // a zoom 1.8 (ventana de 555 px de la interfaz) el piso manda; ahí no hay forma de que quepa y no es lo que se mide.
    assert.ok(alto === 260 || alto * zoom <= 1000 - HOLGURA_GRANDE * zoom + 1, `zoom ${zoom}: ${alto * zoom} px de pantalla, cabían ${1000 - HOLGURA_GRANDE * zoom}`)
  }
  // La fórmula de antes (ventana en px de pantalla, sin ÷ zoom) a 1.25 medía 875 en una ventana donde cabían 625.
  assert.equal(Math.max(260, 1000 - HOLGURA_GRANDE) * 1.25, 875)
  assert.equal(altoDeEscenario({ ...base, zoom: 1.25 }) * 1.25, 625)
})

test('espacio libre: la ventana desde donde empieza el visor, menos sus controles y un margen, en px de la interfaz', () => {
  // Ventana de 1000 px de pantalla, el visor empieza a 120, zoom 1.25, controles y huecos de 110 px de la interfaz.
  assert.equal(espacioLibre({ altoVentana: 1000, arriba: 120, zoom: 1.25, fijo: 110 }), 570)
  assert.equal(espacioLibre({ altoVentana: 1000, arriba: 120, zoom: 1, fijo: 110 }), 1000 - 120 - 110 - MARGEN_INFERIOR_VISOR)
  assert.equal(espacioLibre({ altoVentana: 100, arriba: 500, zoom: 1, fijo: 110 }), 0)                 // nunca negativo
  assert.equal(espacioLibre({ altoVentana: 1000, arriba: -300, zoom: 1, fijo: 100 }), 1000 - 100 - MARGEN_INFERIOR_VISOR)   // un panel con scroll no agranda de más
})

test('con el espacio medido, el visor entero llena el panel sin pasarse (nada de vacío debajo ni de scroll)', () => {
  for (const zoom of [0.9, 1, 1.25, 1.5]) {
    const altoVentana = 1000, arriba = 120, fijo = 110
    const libre = espacioLibre({ altoVentana, arriba, zoom, fijo })
    const escenario = altoDeEscenario({ ...base, altoVentana, zoom, libre, hueco: 4000 })
    assert.equal(escenario, libre, `zoom ${zoom}: el escenario toma todo el espacio libre`)
    // En pantalla: arriba + (escenario + controles + margen) × zoom = justo el borde de la ventana, sin pasarse.
    const finPantalla = arriba + (escenario + fijo + MARGEN_INFERIOR_VISOR) * zoom
    assert.ok(finPantalla <= altoVentana + zoom && finPantalla >= altoVentana - zoom, `zoom ${zoom}: termina en ${finPantalla} de ${altoVentana}`)
  }
  // Y mucho más grande que con la holgura fija de 300 px de antes (la captura que motivó esto).
  const antes = altoDeEscenario({ ...base, altoVentana: 1000, zoom: 1.25, hueco: 4000 })
  const ahora = altoDeEscenario({ ...base, altoVentana: 1000, zoom: 1.25, libre: espacioLibre({ altoVentana: 1000, arriba: 120, zoom: 1.25, fijo: 110 }), hueco: 4000 })
  assert.ok(ahora > antes + 50, `antes ${antes}, ahora ${ahora}`)
})

test('si la medición no existe o es absurda, vale la holgura de siempre; y el ancho sigue limitando (16:9)', () => {
  for (const libre of [null, undefined, 0, -5, NaN]) assert.equal(altoDeEscenario({ ...base, libre }), 1000 - HOLGURA_GRANDE)
  assert.equal(altoDeEscenario({ ...base, libre: 900, hueco: 800 }), Math.round(800 / H))
  assert.equal(altoDeEscenario({ ...base, libre: 100 }), 260)                       // el piso del escenario
})

test('el escenario se adapta al 16:9: nunca más alto que el ancho disponible', () => {
  assert.equal(altoDeEscenario({ ...base, hueco: 800 }), Math.round(800 / H))
})

test('un vertical (9:16) toma la pantalla menos sus controles, sin pasar de 720', () => {
  // Fuera del panel principal (en `grande` manda la ventana menos la holgura, también para un vertical).
  const v = { ...base, grande: false, vertical: true, proporciones: [9 / 16], hueco: 1500 }
  assert.equal(altoDeEscenario(v), 720)
  assert.equal(altoDeEscenario({ ...v, altoVentana: 700 }), 490)
  assert.equal(altoDeEscenario({ ...v, grande: true }), 700)
})

test('en la hoja del chat: 55 % de la ventana entre 220 y 520', () => {
  const c = { ...base, grande: false, hueco: 4000 }
  assert.equal(altoDeEscenario({ ...c, altoVentana: 1000 }), 520)
  assert.equal(altoDeEscenario({ ...c, altoVentana: 600 }), 330)
  assert.equal(altoDeEscenario({ ...c, altoVentana: 300 }), 220)
})

test('dos versiones lado a lado: el alto lo pide la que más lo necesita, y nunca baja de 160', () => {
  // 16:9 en 600 px pide 338; el 9:16 pide 1067 y lo frena el tope (1000 - 300 = 700): gana el que más pide.
  assert.equal(altoDeEscenario({ ...base, hueco: 600, proporciones: [H, 9 / 16] }), 700)
  assert.equal(altoDeEscenario({ ...base, hueco: 100, proporciones: [H] }), 160)
})

test('proporción rota (0) no rompe el cálculo: cae a 16:9', () => {
  assert.equal(altoDeEscenario({ ...base, hueco: 800, proporciones: [0] }), Math.round(800 / H))
})

test('flechas: ← → saltan 5 s sin parar; con Shift, un fotograma', () => {
  assert.deepEqual(pasoDeFlecha('ArrowRight', false), { segundos: SALTO_FLECHA_S })
  assert.deepEqual(pasoDeFlecha('ArrowLeft', false), { segundos: -SALTO_FLECHA_S })
  assert.deepEqual(pasoDeFlecha('ArrowRight', true), { fotogramas: 1 })
  assert.deepEqual(pasoDeFlecha('ArrowLeft', true), { fotogramas: -1 })
  assert.equal(pasoDeFlecha('ArrowUp', false), null)
  assert.equal(pasoDeFlecha('f', false), null)
})

const visor = readFileSync(new URL('../../src/features/cabina/vistas/visor/VisorVideo.tsx', import.meta.url), 'utf8')

test('el visor ata las teclas que pidió Daniel: F, Esc (en cualquier pantalla completa), flechas y foco al tocar', () => {
  assert.match(visor, /k === 'f'\) void alternarPantalla\(\)/)
  assert.match(visor, /e\.key === 'Escape' && pantalla\) void salirPantalla\(\)/)
  assert.match(visor, /pasoDeFlecha\(e\.key, e\.shiftKey\)/)
  // Safari no enfoca un botón al hacer clic: el visor se enfoca solo al tocarlo.
  assert.match(visor, /onPointerDownCapture=\{e => \{ tocar\(\); focoAlTocar\(e\)/)
  // En pantalla completa las teclas se oyen en la ventana aunque el foco se haya ido.
  assert.match(visor, /addEventListener\('keydown', oir, true\)/)
})

test('el visor mide con el zoom de la interfaz y vuelve a medir cuando cambia', () => {
  assert.match(visor, /z = zoomUI\(\)/)
  assert.match(visor, /setZoom\(z\)/)
  assert.match(visor, /addEventListener\('arbrain:ui-zoom', medir\)/)
  assert.match(visor, /altoDeEscenario\(\{ grande: !!grande, vertical, altoVentana, zoom, libre,/)
  assert.match(visor, /espacioLibre\(\{ altoVentana: alto, arriba: r\.getBoundingClientRect\(\)\.top, zoom: z, fijo: r\.offsetHeight - el\.offsetHeight \}\)/)
})
