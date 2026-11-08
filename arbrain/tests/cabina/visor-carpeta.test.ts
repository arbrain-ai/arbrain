/**
 * La carpeta de entrega y el visor de video no te sacan (6 nov 2026, Daniel 18:10: «doy clic a un video y luego me saca no
 * puedo he podido ver ninguno aun»; 18:20: «doy clic a pantalla completa y me saca»).
 *
 * Causa medida en WebKit (tests/cabina/e2e/visor-carpeta): abrir una pieza encogía la vista de la carpeta y la pantalla
 * completa sacaba el video del flujo; en los dos casos la vista quedaba fuera de la pantalla, el hilo la dormía
 * (useALaVista desmonta lo que se aleja) y lo abierto, que vivía solo en el componente, se perdía.
 * Aquí, la parte pura y el contrato del código; el arnés de navegador lo comprueba de punta a punta.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abiertaEnCarpeta, hayQueTraer, ordenarEntrega, recordarAbiertaEnCarpeta, type ItemEntrega } from '../../src/features/cabina/documento/medio'

const fuente = (r: string) => readFileSync(join(__dirname, '../..', r), 'utf8')
const it = (relativa: string, clase: ItemEntrega['clase']): ItemEntrega => ({ nombre: relativa.split('/').pop()!, ruta: `/c/${relativa}`, relativa, clase, bytes: 1, mtime: '' })

test('sin entrega.json ni nombres de final: video y audio son finales; hojas, .md y lo demás, piezas', () => {
  // La carpeta del reporte: 6 cortos, sus hojas y un .md. Antes: «0 finales · 13 piezas».
  const cortos = ['bonos-1', 'bonos-2', 'garantia-1', 'garantia-2', 'mensualidad-1', 'mensualidad-2']
  const items = [...cortos.flatMap(n => [it(`${n}.mp4`, 'video'), it(`${n}.hoja.jpg`, 'imagen')]), it('CORTOS.md', 'documento')]
  const { finales, piezas } = ordenarEntrega(items)
  assert.equal(finales.length, 6)
  assert.ok(finales.every(f => f.clase === 'video'))
  assert.equal(piezas.length, 7)
  assert.ok(!piezas.some(p => p.clase === 'video'))
  const conAudio = ordenarEntrega([it('voz.m4a', 'audio'), it('guion.md', 'documento'), it('portada.png', 'imagen')])
  assert.deepEqual(conAudio.finales.map(f => f.nombre), ['voz.m4a'])
})

test('con nombres de final (finales/, final-*, export-*), mandan los nombres: los demás videos son piezas', () => {
  const { finales, piezas } = ordenarEntrega([it('final-vertical.mp4', 'video'), it('crudos/toma-1.mp4', 'video'), it('notas.md', 'documento')])
  assert.deepEqual(finales.map(f => f.nombre), ['final-vertical.mp4'])
  assert.deepEqual(piezas.map(p => p.nombre).sort(), ['notas.md', 'toma-1.mp4'])
})

test('lo abierto de una carpeta sobrevive al remonte de la vista, y «volver» lo olvida', () => {
  const carpeta = '/Users/x/Developer/labs/cortos/final'
  assert.equal(abiertaEnCarpeta(carpeta), null)
  recordarAbiertaEnCarpeta(carpeta, { input: { vista: 'documento', ruta: `${carpeta}/bonos-1.mp4` }, desde: `${carpeta}/bonos-1.mp4` })
  // La vista se durmió y renace: nace con lo que estaba abierto.
  assert.deepEqual(abiertaEnCarpeta<{ desde: string }>(carpeta)?.desde, `${carpeta}/bonos-1.mp4`)
  assert.equal(abiertaEnCarpeta('/otra/carpeta'), null)
  recordarAbiertaEnCarpeta(carpeta, null)
  assert.equal(abiertaEnCarpeta(carpeta), null)
})

test('al abrir o volver, la vista se trae a la pantalla solo si quedó fuera o muy abajo', () => {
  assert.ok(hayQueTraer(-400, 660), 'quedó arriba, fuera de la pantalla (el caso del reporte)')
  assert.ok(hayQueTraer(600, 660), 'su borde de arriba quedó en la parte baja')
  assert.ok(!hayQueTraer(80, 660), 'ya está a la vista: no se mueve nada')
})

test('VisorEntrega: el estado abierto vive en medio.ts, se trae a la vista antes de pintar y «volver» es explícito', () => {
  const s = fuente('src/features/cabina/vistas/visor/VisorEntrega.tsx')
  assert.match(s, /useState<Abierta \| null>\(\(\) => abiertaEnCarpeta<Abierta>\(data\.ruta\)\)/, 'nace con lo que estaba abierto')
  assert.match(s, /recordarAbiertaEnCarpeta\(data\.ruta, a\)/)
  assert.match(s, /useLayoutEffect\(/, 'se trae a la pantalla antes de que el hilo la duerma')
  assert.match(s, /data-volver-carpeta/)
  assert.match(s, /Volver a la carpeta/)
})

test('una vista en uso no se duerme: el hilo respeta data-en-uso y la pantalla completa', () => {
  const c = fuente('src/features/cabina/Cabina.tsx')
  assert.match(c, /setVisible\(e\.isIntersecting \|\| enUso\(nodo\)\)/)
  assert.match(c, /querySelector\('\[data-en-uso\]'\)/)
  assert.match(c, /nodo\.contains\(lleno\)/)
  const v = fuente('src/features/cabina/vistas/visor/VisorVideo.tsx')
  // Se marca ANTES de entrar (si no, el hilo la duerme en el mismo cuadro en que sale del flujo) y se suelta al salir.
  const marca = v.indexOf('enUso(true)'), nativa = v.indexOf('m.webkitEnterFullscreen!()'), api = v.indexOf('await el.requestFullscreen()')
  assert.ok(marca > 0 && marca < nativa && marca < api, 'data-en-uso antes de cualquier pantalla completa')
  assert.match(v, /addEventListener\('webkitendfullscreen', fin\)/, 'la nativa del teléfono avisa al salir')
  // El <video> no se remonta: un solo <video> por versión, con key estable.
  assert.match(v, /<figure key=\{x\.ruta\}/)
})

test('visor de video: controles mínimos y la tecla de reproducir es la del botón de enviar', () => {
  const v = fuente('src/features/cabina/vistas/visor/VisorVideo.tsx')
  assert.match(v, /import tecla from '@\/features\/chat\/components\/boton-enviar\.module\.css'/)
  assert.match(v, /className=\{`\$\{tecla\.enviar\} \$\{v\.tecla\}`\}/)
  for (const fuera of ['Marcar aquí', 'Fotograma anterior', 'Fotograma siguiente', 'v.formato', 'v.ayuda']) assert.ok(!v.includes(fuera), `sin «${fuera}» a la vista`)
  for (const dentro of ['aria-label="Posición"', '<BotonVelocidad ', "'Activar sonido'", "'Pantalla completa'"]) assert.ok(v.includes(dentro), `con ${dentro}`)
  // La barra se arrastra con el dedo: captura del puntero y sin gesto del navegador encima.
  assert.match(v, /setPointerCapture\(e\.pointerId\)/)
  assert.match(fuente('src/features/cabina/vistas/visor/visor.module.css'), /\.barraTiempo \{[^}]*touch-action: none/)
  // Un 9:16 se encuadra entero (object-fit), no a lo ancho y recortado.
  assert.match(fuente('src/features/cabina/vistas/visor/visor.module.css'), /\.cuadro video \{[^}]*object-fit: contain/)
})
