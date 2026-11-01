// Primitiva de los popovers de la barra de escribir (1 nov 2026, Daniel: «sigue saliendo de pantalla… asegúrate de que
// ambos sean bien responsivos»). Geometría pura: lado, altura, hoja móvil y el zoom de la app. La prueba en la app real
// (selector y contexto en inicio, conversación, panel derecho, 900x600, 900x480 y teléfono) es scripts/qa/popovers-composer.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALTO_MIN_UTIL, MARGEN, SEPARACION, aCss, colocarPopover, vistaCompleta, type Caja, type Colocacion, type Vista } from '../../src/shared/lib/popover-anclado'

/** La caja más grande que puede ocupar el popover (con su altura máxima), en px CSS. */
function cajaMaxima(c: Colocacion, vista: Vista): Caja {
  if (c.modo === 'hoja') return { left: 0, right: vista.ancho, bottom: vista.alto - c.bottom, top: vista.alto - c.bottom - c.maxHeight }
  const top = c.top ?? vista.alto - (c.bottom ?? 0) - c.maxHeight
  return { left: c.left, right: c.left + c.width, top, bottom: top + c.maxHeight }
}

function dentro(c: Colocacion, vista: Vista, etiqueta = '') {
  const k = cajaMaxima(c, vista), v = vista.visible
  const margen = c.modo === 'hoja' ? 0 : MARGEN
  assert.ok(k.left >= v.left + margen - 0.5 && k.right <= v.right - margen + 0.5, `${etiqueta} horizontal ${k.left}..${k.right} en ${v.left}..${v.right}`)
  assert.ok(k.top >= v.top + margen - 0.5 && k.bottom <= v.bottom - margen + 0.5, `${etiqueta} vertical ${k.top}..${k.bottom} en ${v.top}..${v.bottom}`)
  assert.ok(c.maxHeight >= 0 && (c.modo === 'hoja' || c.width >= 0), `${etiqueta} medidas no negativas`)
}

const chip = (top: number, left: number, alto = 32, ancho = 120): Caja => ({ top, bottom: top + alto, left, right: left + ancho })

test('conversación, ventana grande: arriba del chip, alineado a su borde y con el tope estético', () => {
  const vista = vistaCompleta(1800, 1160)
  const c = colocarPopover(chip(1100, 520), vista, { ancho: 392, altoMax: 520, altoNatural: 640 })
  assert.deepEqual(c, { modo: 'flotante', lado: 'arriba', left: 520, width: 392, maxHeight: 520, bottom: 1160 - 1100 + SEPARACION })
  dentro(c, vista)
})

test('inicio con la caja a media altura: si arriba no cabe y abajo sí, abre hacia abajo', () => {
  // Captura de Daniel: chip a media pantalla, aire de sobra abajo.
  const vista = vistaCompleta(1440, 900)
  const c = colocarPopover(chip(420, 300), vista, { ancho: 392, altoNatural: 460 })
  assert.equal(c.modo === 'flotante' && c.lado, 'abajo')
  assert.equal(c.modo === 'flotante' && c.top, 452 + SEPARACION)
  dentro(c, vista)
})

test('si cabe arriba, arriba aunque abajo sobre más aire (sale de la barra de escribir)', () => {
  const vista = vistaCompleta(1440, 900)
  const c = colocarPopover(chip(420, 300), vista, { ancho: 392, altoNatural: 300 })
  assert.equal(c.modo === 'flotante' && c.lado, 'arriba')
  dentro(c, vista)
})

test('no cabe en ningún lado: el de más aire, con altura = espacio y scroll interno', () => {
  const vista = vistaCompleta(900, 480)
  const c = colocarPopover(chip(300, 300), vista, { ancho: 392, altoNatural: 900 })
  assert.ok(c.modo === 'flotante' && c.lado === 'arriba' && c.maxHeight === 300 - SEPARACION - MARGEN)
  dentro(c, vista)
})

test('el caso del 1 nov: zoom 1.4 de la app, la caja medida en px de pantalla se convierte antes de colocar', () => {
  // Ventana del webview de Daniel (px de pantalla) y el chip del composer a media altura.
  const zoom = 1.4, pantalla = { ancho: 1911, alto: 1017 }
  const chipPantalla = chip(517, 540, 45, 170)
  const vista = vistaCompleta(pantalla.ancho / zoom, pantalla.alto / zoom)
  const c = colocarPopover(aCss(chipPantalla, zoom), vista, { ancho: 392, altoMax: 520, altoNatural: 700 })
  dentro(c, vista, 'px css')
  // De vuelta a pantalla (lo que el navegador pinta: todo ×zoom) sigue dentro de los 1017 px.
  const k = cajaMaxima(c, vista)
  assert.ok(k.top * zoom >= 0 && k.bottom * zoom <= pantalla.alto, `pantalla ${k.top * zoom}..${k.bottom * zoom}`)
  // Lo que hacía la versión anterior: medir en pantalla y escribir esos números como px CSS, que el navegador pinta ×1.4.
  const ingenuo = colocarPopover(chipPantalla, vistaCompleta(pantalla.ancho, pantalla.alto), { ancho: 392, altoMax: 520, altoNatural: 700 })
  assert.ok(ingenuo.modo === 'flotante' && ingenuo.lado === 'arriba' && ingenuo.bottom != null)
  const topPintado = pantalla.alto - (ingenuo.bottom + ingenuo.maxHeight) * zoom
  assert.ok(topPintado < -350, `la versión anterior se cortaba arriba (${Math.round(topPintado)} px), como en la captura`)
})

test('ancla pegada al borde derecho: se corre a la izquierda; alinear al fin usa el borde derecho del ancla', () => {
  const vista = vistaCompleta(900, 600)
  const c = colocarPopover(chip(500, 820, 32, 60), vista, { ancho: 320, altoNatural: 200 })
  assert.equal(c.modo === 'flotante' && c.left, 900 - 320 - MARGEN)
  const fin = colocarPopover(chip(500, 400, 32, 100), vista, { ancho: 240, altoNatural: 200, alinear: 'fin' })
  assert.equal(fin.modo === 'flotante' && fin.left, 500 - 240)
  dentro(c, vista); dentro(fin, vista)
})

test('ancho del ancla (comandos sobre la caja) y nunca más ancho que lo visible', () => {
  const vista = vistaCompleta(900, 600)
  const c = colocarPopover({ top: 420, bottom: 560, left: 40, right: 860 }, vista, { ancho: 'ancla', altoNatural: 300, altoMax: 390 })
  assert.ok(c.modo === 'flotante' && c.width === 820 && c.left === 40)
  const ancho = colocarPopover({ top: 420, bottom: 560, left: -20, right: 2000 }, vista, { ancho: 'ancla', altoNatural: 300 })
  dentro(ancho, vista)
})

test('ventana diminuta o zoom alto: si ningún lado deja aire útil, se monta sobre el ancla dentro de lo visible', () => {
  const vista = vistaCompleta(700, 260)
  const c = colocarPopover(chip(110, 100, 40), vista, { ancho: 392, altoNatural: 500 })
  assert.equal(c.modo === 'flotante' && c.lado, 'sobre')
  assert.ok(c.maxHeight > ALTO_MIN_UTIL)
  dentro(c, vista)
})

test('teléfono: hoja inferior; con teclado virtual queda sobre él y deja aire arriba', () => {
  const vista = vistaCompleta(390, 844)
  assert.deepEqual(colocarPopover(chip(780, 60), vista, { ancho: 392, altoNatural: 600, hojaEnMovil: true }), { modo: 'hoja', bottom: 0, maxHeight: 717 })
  const conTeclado: Vista = { ...vista, visible: { top: 0, left: 0, right: 390, bottom: 844 - 336 } }
  const c = colocarPopover(chip(400, 60), conTeclado, { ancho: 392, altoNatural: 600, hojaEnMovil: true })
  assert.deepEqual(c, { modo: 'hoja', bottom: 336, maxHeight: Math.floor(Math.min(508 * 0.85, 508 - 24)) })
  dentro(c, conTeclado)
  // Los comandos no son hoja: se escribe con la paleta abierta.
  assert.equal(colocarPopover(chip(780, 10, 40, 370), vista, { ancho: 'ancla', altoNatural: 300, hojaEnMovil: false }).modo, 'flotante')
})

test('barrido: cualquier ancla, ventana, teclado y zoom; el popover nunca sale de lo visible', () => {
  let semilla = 7
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  for (let i = 0; i < 4000; i++) {
    const zoom = [1, 1.1, 1.25, 1.4, 1.8, 0.6][i % 6]
    const pantalla = { ancho: 320 + azar() * 2400, alto: 240 + azar() * 1400 }
    const teclado = azar() < 0.2 ? azar() * pantalla.alto * 0.5 : 0
    const v = vistaCompleta(pantalla.ancho / zoom, pantalla.alto / zoom)
    const vista: Vista = { ...v, visible: { ...v.visible, bottom: (pantalla.alto - teclado) / zoom } }
    const top = -200 + azar() * (pantalla.alto + 400)
    const left = -200 + azar() * (pantalla.ancho + 400)
    const ancla = azar() < 0.05 ? null : aCss({ top, bottom: top + 20 + azar() * 160, left, right: left + 20 + azar() * 900 }, zoom)
    const c = colocarPopover(ancla, vista, {
      ancho: azar() < 0.2 ? 'ancla' : 200 + azar() * 400, altoNatural: azar() * 1200, altoMax: azar() < 0.5 ? 300 + azar() * 400 : undefined,
      hojaEnMovil: azar() < 0.7, alinear: azar() < 0.3 ? 'fin' : 'inicio',
    })
    dentro(c, vista, `caso ${i} zoom ${zoom}`)
  }
})

test('los cinco popovers de la barra usan la primitiva y ninguno conserva bottom-full ni alturas en vh', () => {
  const leer = (f: string) => readFileSync(new URL(`../../src/features/chat/components/${f}`, import.meta.url), 'utf8')
  for (const f of ['ModelPicker.tsx', 'ContextoChip.tsx', 'EffortSlider.tsx', 'CommandPalette.tsx']) {
    const src = leer(f)
    assert.match(src, /<PopoverAnclado\b/, `${f} usa PopoverAnclado`)
    assert.ok(!/bottom-full|max-h-\[\d+d?vh\]/.test(src), `${f} sin bottom-full ni max-h en vh`)
  }
  const chat = leer('ChatPanel.tsx')
  const menu = chat.slice(chat.indexOf('function MenuAdjuntar'), chat.indexOf('// ─── File attachment card'))
  assert.match(menu, /<PopoverAnclado ancla=\{boton\}/)
  assert.ok(!/bottom-full/.test(menu))
  for (const ancla of ['ancla={modelChipRef}', 'ancla={effortChipRef}', 'ancla={contextoChipRef}', 'ancla={composerCajaRef}']) assert.ok(chat.includes(ancla), ancla)
})
