import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { anchoVisible, asiento, columnaEntera, diasDelRiel } from '../../src/features/planning/semana-horas'

// 2 nov 2026, 11:59 (captura de la app a zoom 1.4): «ptm sigue pasándose para atrás la línea amarilla acá en gym wey
// debería sobreponerse a todas las secciones». El título decía «2 – 4 nov» y las columnas eran el 26, 27 y 28 de oct; la línea no se
// veía. Reproducido en WKWebView (docs/builds/linea-hora-v2-2026-11-02): ir al Taller y volver al Calendario.

const fuente = (ruta: string) => readFileSync(new URL(`../../src/${ruta}`, import.meta.url), 'utf8')
const HOY = '2026-11-02'
// El panel de la captura: 3 días a la vista, riel con colchón de 7 a cada lado (26 oct … 11 nov), canal de 38 px, 118 px por día.
const dias = diasDelRiel(HOY, 3)
const COL = 118, bordes = dias.map((_, i) => i * COL), HOY_I = dias.indexOf(HOY)

test('el riel de la captura: hoy es la columna 7 y la primera es el 26 oct (el colchón)', () => {
  assert.equal(dias[0], '2026-10-26')
  assert.equal(HOY_I, 7)
})

test('una pestaña oculta mide 0 y eso no es un ancho: se conserva el último real', () => {
  // Antes: `setAncho(0)` y cada columna medía 1 px (`columnaEntera(0, …)`); al volver, WebKit restauraba el scroll sobre ese
  // lienzo enano y lo recortaba (14 px medidos), y el riel se asentaba en el 26 oct.
  assert.equal(columnaEntera(0, 38, 3), 1)
  assert.equal(anchoVisible(392.4, 0), 392.4)
  assert.equal(anchoVisible(392.4, 410), 410)
  assert.equal(anchoVisible(0, 0), 0)
})

test('un riel oculto no se asienta: sus columnas y su scroll miden 0 y no es un gesto de nadie', () => {
  assert.equal(asiento({ dias, bordes: dias.map(() => 0), scroll: 0, pintado: false }), null)
})

test('al volver con el scroll recortado, el riel espera a llegar a hoy en vez de asentarse 7 días atrás', () => {
  // El código mandó el riel a hoy (Hoy, o el objetivo que cambió mientras estaba oculto) y el primer cuadro aún lee 14 px.
  assert.deepEqual(asiento({ dias, bordes, scroll: 14, pintado: true, destino: bordes[HOY_I] }), { tipo: 'esperar' })
  // Ya llegó: se asienta en hoy, no en el 26 oct.
  assert.deepEqual(asiento({ dias, bordes, scroll: bordes[HOY_I], pintado: true, destino: bordes[HOY_I] }), { tipo: 'asentar', dia: HOY })
  // Un gesto de la persona (sin destino del código) sí se lleva a la columna más cercana, como siempre.
  assert.deepEqual(asiento({ dias, bordes, scroll: 14, pintado: true }), { tipo: 'ajustar', borde: 0 })
  assert.deepEqual(asiento({ dias, bordes, scroll: 0, pintado: true }), { tipo: 'asentar', dia: '2026-10-26' })
})

test('la Semana vuelve a medir y a encuadrar al reaparecer, y un deslizamiento que no llega salta', () => {
  const src = fuente('features/planning/SemanaHoras.tsx')
  assert.match(src, /setAncho\(a => anchoVisible\(a, /)
  assert.match(src, /if \(!r\.offsetWidth\) \{ forma\.current = ''; return \}/)
  assert.match(src, /if \(w > 0 && antes === 0\) setVuelta\(n => n \+ 1\)/)
  assert.match(src, /:\$\{vuelta\}`/)
  assert.match(src, /llegada\.current = setTimeout\(\(\) => \{/)
  assert.match(src, /pintado: r\.offsetWidth > 0/)
})

test('la línea de la hora cruza todas las columnas visibles, encima de bloques y bandas, y nunca sobre la cabecera pegada', () => {
  const src = fuente('features/planning/SemanaHoras.tsx'), css = fuente('features/planning/semana-horas.module.css')
  // Vive en el canal (pegajoso, sobre todas las columnas), no dentro de la columna de hoy: cada columna aísla sus capas y su
  // z-index no sale de ella.
  const canal = src.slice(src.indexOf('<div ref={canal} className={h.canal}'), src.indexOf('{dias.map((d, i) => { const { piezas'))
  assert.match(canal, /<i className=\{h\.ahora\} data-ahora-linea/)
  const columnas = src.slice(src.indexOf('{dias.map((d, i) => { const { piezas'))
  assert.doesNotMatch(columnas, /data-ahora-linea/)
  assert.match(css, /\.columna \{[^}]*isolation: isolate/)
  // Nace en el borde del canal y mide lo que se ve del riel; la pastilla de la hora queda encima de la línea.
  assert.match(css, /\.ahora \{ position: absolute; left: 100%; width: calc\(var\(--ancho\) - var\(--canal\) - 1px\); z-index: 1;/)
  assert.match(css, /\.ahoraHora \{[^}]*z-index: 2;/)
  assert.match(css, /\.canal \{ position: sticky; left: 0; z-index: 3;/)
  // El riel aísla sus capas: nada de la rejilla pinta sobre la cabecera pegada (z-index 8) ni sobre la franja del objetivo.
  assert.match(css, /\.riel \{[^}]*isolation: isolate;/)
  assert.match(css, /\.rielCab \{ position: sticky;[^}]*z-index: 8;/)
})

test('la pastilla y la línea salen juntas, solo con hoy a la vista', () => {
  const src = fuente('features/planning/SemanaHoras.tsx')
  assert.match(src, /const conLinea = hoyALaVista && ahoraMin >= tramo\.desde \* 60 && ahoraMin <= tramo\.hasta \* 60/)
  assert.match(src, /\{conLinea && <i className=\{h\.ahora\} data-ahora-linea/)
  assert.match(src, /\{conLinea && <time className=\{h\.ahoraHora\} data-ahora-hora/)
})
