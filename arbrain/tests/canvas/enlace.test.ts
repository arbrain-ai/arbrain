import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { destinoDeEnlace, pastillasDe, pastillaEn } from '../../src/features/canvas/model/enlace'
import type { CanvasElement } from '../../src/features/canvas/model/element'

// Un Studio ficticio por Tailscale (todo *.ts.net cuenta como Arbrain propio).
const STUDIO = 'https://estudio.ejemplo.ts.net:10000'

test('enlace: las vistas de Arbrain abren como pestaña del panel, nunca en el navegador', () => {
  assert.deepEqual(destinoDeEnlace(`${STUDIO}/masterclass`), { tipo: 'panel', input: { vista: 'masterclass' }, etiqueta: 'Ver masterclass ↗' })
  assert.deepEqual(destinoDeEnlace(`${STUDIO}/calendar?date=2026-10-17&mode=week`),
    { tipo: 'panel', input: { vista: 'calendario', fecha: '2026-10-17', alcance: 'semana' }, etiqueta: 'Ver en calendario ↗' })
  assert.deepEqual(destinoDeEnlace('/lienzo?p=abc&z=of1'), { tipo: 'panel', input: { vista: 'lienzo', paginaId: 'abc', zona: 'of1' }, etiqueta: 'Abrir lienzo ↗' })
  assert.deepEqual(destinoDeEnlace('page:d98f487a'), { tipo: 'panel', input: { vista: 'lienzo', paginaId: 'd98f487a' }, etiqueta: 'Abrir lienzo ↗' })
  const doc = destinoDeEnlace('doc:docs/a/plan.md')
  assert.equal(doc?.tipo, 'panel')
  assert.deepEqual(doc?.tipo === 'panel' && doc.input, { vista: 'documento', ruta: 'docs/a/plan.md', titulo: 'plan.md' })
  assert.equal(doc?.etiqueta, 'Abrir documento ↗')
})

test('enlace: solo un sitio de fuera sale al navegador; una ruta homónima de otro dominio no se confunde', () => {
  assert.deepEqual(destinoDeEnlace('https://google.com/calendar'), { tipo: 'fuera', url: 'https://google.com/calendar', etiqueta: 'Abrir ↗' })
  assert.equal(destinoDeEnlace('javascript:alert(1)'), null)
  assert.equal(destinoDeEnlace('doc:../secreto.md'), null)
  assert.equal(destinoDeEnlace(''), null)
})

const caja = (id: string, x: number, y: number, width: number, height: number, link?: string, type = 'shape') =>
  ({ id, type, x, y, width, height, link, zIndex: 0, rotation: 0, opacity: 1, locked: false,
     ...(type === 'text' ? { text: 'Título', lines: ['Título'], style: { size: 30, weight: 600, family: 'montserrat' }, align: 'left' } : {}) }) as unknown as CanvasElement

test('pastilla: dentro de la esquina, una por tarjeta, y nada si a ese zoom no cabe', () => {
  const els = [
    caja('card', 0, 0, 1000, 300, `${STUDIO}/calendar`),
    caja('card:t', 30, 40, 900, 100, `${STUDIO}/calendar`, 'text'),
    caja('card:chip', 30, 200, 500, 46, `${STUDIO}/calendar`),
    caja('suelto', 0, 1000, 600, 200, 'doc:docs/x.md'),
  ]
  const p = pastillasDe(els, 0.5)
  assert.deepEqual(p.map(q => q.id), ['card', 'suelto'])
  const c = p[0]
  assert.ok(c.x > 0 && c.x + c.width < 1000 && c.y > 0 && c.y + c.height < 300, 'dentro del borde')
  assert.equal(Math.round(c.height * 0.5), 22, 'alto constante en pantalla')
  assert.equal(pastillaEn(p, { x: c.x + 1, y: c.y + 1 })?.id, 'card')
  assert.equal(pastillaEn(p, { x: 10, y: 10 }), null)
  // Vista de pájaro: la tarjeta mide 50 px de ancho en pantalla; la pastilla no se pinta.
  assert.deepEqual(pastillasDe(els, 0.05), [])
})

test('pastilla: no tapa el chip ni los renglones; busca el rincón libre', () => {
  const texto = (id: string, x: number, y: number, width: number, height: number, lines: string[]) =>
    ({ ...caja(id, x, y, width, height, undefined, 'text'), text: lines.join(' '), lines, style: { size: 30, weight: 600, family: 'montserrat' }, align: 'left', zIndex: 1 }) as unknown as CanvasElement
  const els = [
    caja('t', 0, 0, 1200, 400, 'doc:docs/x.md'),
    { ...caja('t:e', 1030, 18, 142, 46), zIndex: 4 } as CanvasElement,      // chip FIRMADO arriba a la derecha
    texto('t:b', 28, 80, 1144, 300, ['una línea larga que llega casi al borde derecho de la tarjeta', 'corta']),
  ]
  const [p] = pastillasDe(els, 0.4)
  assert.ok(p, 'hay pastilla')
  assert.ok(p.y > 200, 'no va arriba: ahí está el chip')
  assert.ok(p.x + p.width <= 1200 && p.y + p.height <= 400, 'dentro de la tarjeta')
})

test('pastilla de imagen: nunca encima del contenido; debajo, pegada a su marco y bajo el pie (el QR de /aplicar, 14 oct)', () => {
  const img = (id: string, x: number, y: number, s: number, link?: string) =>
    ({ ...caja(id, x, y, s, s, link), type: 'image', src: 'qr.png', naturalWidth: 41, naturalHeight: 41, zIndex: 2 }) as unknown as CanvasElement
  const pie = { ...caja('qr:pie', 2386, 1216, 204, 44, undefined, 'text'), text: 'Escanéalo: ejemplo.mx/aplicar',
    lines: ['Escanéalo:', 'ejemplo.mx/aplicar'], style: { size: 17, weight: 700, family: 'montserrat' }, align: 'left', zIndex: 3 } as unknown as CanvasElement
  const els = [
    caja('etapa', 1500, 0, 1200, 3000),                                   // la superficie de la etapa: contiene, no estorba
    { ...caja('qr:marco', 2386, 1000, 204, 204), zIndex: 1 } as CanvasElement,
    img('qr', 2400, 1014, 176, 'https://ejemplo.mx/aplicar'),
    pie,
  ]
  for (const zoom of [0.47, 0.73, 1, 2]) {
    const p = pastillasDe(els, zoom).find(q => q.id === 'qr')
    assert.ok(p, `hay pastilla a zoom ${zoom}`)
    assert.ok(p.y >= 1014 + 176, `a zoom ${zoom} no toca la imagen (y=${p.y})`)
    assert.ok(p.y >= 1000 + 204, `a zoom ${zoom} va bajo el marco ceñido`)
    ;['Escanéalo:', 'ejemplo.mx/aplicar'].forEach((l, i) => {
      const r = { x: 2386, y: 1216 + i * 22, width: l.length * 17 * 0.56, height: 22 }
      const cruza = p.x < r.x + r.width && r.x < p.x + p.width && p.y < r.y + r.height && r.y < p.y + p.height
      assert.ok(!cruza, `a zoom ${zoom} no tapa el renglón «${l}» del pie`)
    })
    assert.ok(p.x + p.width <= 2386 + 204 + 0.01, 'alineada a la derecha del marco')
    assert.equal(p.etiqueta, 'Abrir ↗')
    assert.equal(pastillaEn([p], { x: 2400 + 88, y: 1014 + 88 }), null, 'el centro del QR no es botón')
  }
  // Sin nada debajo, queda pegada (a 6 px de pantalla) al borde inferior.
  const sola = pastillasDe([img('suelta', 0, 0, 300, 'https://ejemplo.mx/aplicar')], 1)[0]
  assert.equal(sola.y, 306)
  // Demasiado chica en pantalla: sin pastilla (⌘+clic sigue abriendo la liga).
  assert.deepEqual(pastillasDe([img('mini', 0, 0, 300, 'https://ejemplo.mx/aplicar')], 0.1), [])
})
