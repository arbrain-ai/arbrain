import test from 'node:test'
import assert from 'node:assert/strict'
import { TRAMO, columnaCercana, columnaEntera, diaEnHoras, escalaVisual, diasDelRiel, estirar, hhmm, inicioDeVentana, lunesDe, primerDiaVisible, rangoCrear, ranura, semanaDeMayoria, soltar, sumarDia, diasDesde, type Bloque } from '../../src/features/planning/semana-horas'
import { tituloVentana } from '../../src/features/planning/accesos'

// Fechas en hora local: la rejilla vive en la zona del equipo, igual que el resto del calendario.
const at = (dia: string, h: number, m = 0) => { const [y, mo, d] = dia.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime() }
const b = (id: string, dia: string, h0: number, h1: number, extra: Partial<Bloque> = {}): Bloque =>
  ({ id, titulo: id, inicio: at(dia, Math.floor(h0), (h0 % 1) * 60), fin: at(dia, Math.floor(h1), (h1 % 1) * 60), color: null, movible: true, ...extra })
const D = '2026-10-14'

test('el tramo despierto es de 05:00 a 22:00 y cada bloque cae a su altura en minutos', () => {
  assert.deepEqual([TRAMO.desde, TRAMO.hasta], [5, 22])
  const { piezas } = diaEnHoras([b('gym', D, 12, 13.5)], D)
  assert.equal(piezas.length, 1)
  assert.deepEqual([piezas[0].desde, piezas[0].hasta, piezas[0].col, piezas[0].cols], [720, 810, 0, 1])
})

test('lo que queda fuera del tramo no se pierde: se cuenta antes o después de su columna', () => {
  const r = diaEnHoras([b('madrugada', D, 3, 4), b('noche', D, 22.5, 23.5), b('cruza', D, 4.5, 6), b('tarde', D, 21, 23)], D)
  assert.deepEqual(r.antes.map(x => x.id), ['madrugada'])
  assert.deepEqual(r.despues.map(x => x.id), ['noche'])
  const cruza = r.piezas.find(p => p.bloque.id === 'cruza')!, tarde = r.piezas.find(p => p.bloque.id === 'tarde')!
  assert.deepEqual([cruza.desde, cruza.hasta, cruza.sigueArriba, cruza.sigueAbajo], [300, 360, true, false])
  assert.deepEqual([tarde.desde, tarde.hasta, tarde.sigueAbajo], [1260, 1320, true])
})

test('los solapes van lado a lado y comparten el ancho de su grupo; lo que no se toca recupera el ancho completo', () => {
  const { piezas } = diaEnHoras([b('a', D, 9, 11), b('b', D, 10, 12), b('c', D, 10.5, 11.5), b('d', D, 13, 14)], D)
  const por = Object.fromEntries(piezas.map(p => [p.bloque.id, [p.col, p.cols]]))
  assert.deepEqual(por, { a: [0, 3], b: [1, 3], c: [2, 3], d: [0, 1] })
  // `c` termina antes de que empiece otro: su columna se reusa dentro del mismo grupo.
  const r2 = diaEnHoras([b('x', D, 9, 12), b('y', D, 9, 10), b('z', D, 10, 11)], D).piezas
  assert.deepEqual(Object.fromEntries(r2.map(p => [p.bloque.id, [p.col, p.cols]])), { x: [0, 2], y: [1, 2], z: [1, 2] })
})

test('un evento que cruza la medianoche se pinta en los dos días, recortado', () => {
  const noche = b('vuelo', D, 20, 20); noche.fin = at('2026-10-15', 7)
  const hoy = diaEnHoras([noche], D).piezas[0], manana = diaEnHoras([noche], '2026-10-15').piezas[0]
  assert.deepEqual([hoy.desde, hoy.hasta, hoy.sigueAbajo], [1200, 1320, true])
  assert.deepEqual([manana.desde, manana.hasta, manana.sigueArriba], [300, 420, true])
})

test('un bloque sin duración ocupa un paso para poder tocarlo', () => {
  const { piezas } = diaEnHoras([b('recordatorio', D, 9, 9)], D)
  assert.deepEqual([piezas[0].desde, piezas[0].hasta], [540, 555])
})

test('soltar conserva la duración, se ajusta a 15 min y no sale del tramo', () => {
  const x = b('guion', D, 9, 10.5)
  const r = soltar(x, '2026-10-16', 14 * 60 + 7)!
  assert.equal(r.inicio.getTime(), at('2026-10-16', 14, 0))
  assert.equal(r.fin.getTime() - r.inicio.getTime(), 90 * 60_000)
  assert.equal(soltar(x, D, 2 * 60)!.inicio.getTime(), at(D, 5))
  assert.equal(soltar(x, D, 23 * 60)!.inicio.getTime(), at(D, 21, 45))
  assert.equal(soltar(x, D, 9 * 60 + 5), null, 'mismo lugar: no escribe')
})

test('estirar el borde cambia solo el término, con un paso mínimo', () => {
  const x = b('edicion', D, 15, 16)
  assert.equal(estirar(x, D, 17 * 60 + 20)!.getTime(), at(D, 17, 15))
  assert.equal(estirar(x, D, 15 * 60)!.getTime(), at(D, 15, 15))
  assert.equal(estirar(x, D, 16 * 60), null)
})

test('un clic simple en un hueco crea la media hora tocada (lo mismo que se ve bajo el ratón)', () => {
  const r = ranura(D, 10 * 60 + 47)
  assert.deepEqual([r.inicio.getTime(), r.fin.getTime()], [at(D, 10, 30), at(D, 11)])
  assert.equal(ranura(D, 21 * 60 + 50).fin.getTime(), at(D, 22), 'no sale del tramo')
})

test('crear arrastrando: del hueco tomado al puntero, hacia abajo o hacia arriba, ajustado a 15 min y dentro del tramo', () => {
  assert.deepEqual(rangoCrear(9 * 60 + 7, 10 * 60 + 38), { desde: 540, hasta: 645 })
  assert.deepEqual(rangoCrear(11 * 60 + 2, 9 * 60 + 50), { desde: 585, hasta: 675 }, 'hacia arriba también')
  assert.deepEqual(rangoCrear(9 * 60, 9 * 60 + 1), { desde: 540, hasta: 555 }, 'al menos un paso')
  assert.deepEqual(rangoCrear(4 * 60, 23 * 60), { desde: 300, hasta: 1320 }, 'no sale de 05–22')
  assert.deepEqual(rangoCrear(21 * 60 + 59, 21 * 60 + 59), { desde: 1305, hasta: 1320 })
})

test('la ventana deslizante: los días se suman como fechas y el riel lleva colchón a cada lado', () => {
  assert.equal(sumarDia('2026-10-31', 1), '2026-11-01')
  assert.equal(sumarDia('2026-11-01', -1), '2026-10-31')
  assert.equal(sumarDia('2026-12-31', 1), '2027-01-01')
  assert.equal(lunesDe('2026-10-10'), '2026-10-05'); assert.equal(lunesDe('2026-10-12'), '2026-10-12'); assert.equal(lunesDe('2026-10-18'), '2026-10-12')
  assert.deepEqual(diasDesde('2026-10-30', 3), ['2026-10-30', '2026-10-31', '2026-11-01'])
  const riel = diasDelRiel('2026-10-14', 3)
  assert.equal(riel.length, 3 + 7 * 2)
  assert.equal(riel[7], '2026-10-14', 'la ventana empieza después del colchón')
  assert.equal(diasDelRiel('2026-10-14', 7).length, 7 + 14 * 2)
  // Avanzar un día es mover el primer día visible uno: la ventana de 7 deja de empezar en lunes.
  assert.deepEqual(diasDesde(sumarDia('2026-10-05', 3), 7), ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
  assert.equal(columnaCercana([0, 120.4, 240.8, 361.2], 170), 1)
  assert.equal(columnaCercana([0, 120.4, 240.8, 361.2], 190), 2)
})

test('al llegar a una semana: con 7 a la vista, el lunes; con 3 o 4, hoy si cae en ella', () => {
  assert.equal(inicioDeVentana('2026-10-10', '2026-10-10', 7), '2026-10-05')
  assert.equal(inicioDeVentana('2026-10-10', '2026-10-10', 3), '2026-10-10')
  assert.equal(inicioDeVentana('2026-10-14', '2026-10-10', 4), '2026-10-12', 'otra semana: su lunes')
})

test('el objetivo de la semana sigue a la mayoría de los días visibles (semana ISO)', () => {
  // 8 – 14 oct: jueves a domingo (4) son de la semana del 5; lunes a miércoles (3), de la del 12.
  assert.equal(semanaDeMayoria(diasDesde('2026-10-08', 7)), '2026-10-05')
  // 9 – 15 oct: 3 y 4: manda la siguiente.
  assert.equal(semanaDeMayoria(diasDesde('2026-10-09', 7)), '2026-10-12')
  assert.equal(semanaDeMayoria(diasDesde('2026-10-10', 3)), '2026-10-05', 'sáb, dom, lun: 2 a 1')
  assert.equal(semanaDeMayoria(diasDesde('2026-10-11', 3)), '2026-10-12', 'dom, lun, mar: 1 a 2')
  assert.equal(semanaDeMayoria(diasDesde('2026-10-10', 4)), '2026-10-05', 'empate 2 y 2: la primera')
  assert.equal(semanaDeMayoria(diasDesde('2026-10-12', 7)), '2026-10-12')
})

test('el título dice el rango que se ve de verdad', () => {
  const hoy = new Date(2026, 9, 10)
  assert.equal(tituloVentana('2026-10-08', 7, hoy), '8 – 14 oct')
  assert.equal(tituloVentana('2026-09-29', 7, hoy), '29 sep – 5 oct')
  assert.equal(tituloVentana('2026-10-10', 3, hoy), '10 – 12 oct')
  assert.equal(tituloVentana('2026-12-30', 4, hoy), '30 dic – 2 ene 2027')
})

test('en el teléfono la semana abre en hoy; fuera de la semana, en el lunes', () => {
  const dias = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
  assert.equal(primerDiaVisible(dias, '2026-10-15'), 3)
  assert.equal(primerDiaVisible(dias, '2026-10-20'), 0)
  assert.equal(hhmm(5 * 60), '05:00'); assert.equal(hhmm(21 * 60 + 30), '21:30')
})

/**
 * El riel deslizado bajo zoom (10 oct 2026, capturas de Daniel: rejilla en jue 8 – mié 14 y título «29 sep – 5 oct»). Simula lo
 * que hace SemanaHoras: medir las columnas en pantalla, convertirlas a px del riel, asentar el scroll en una columna y sacar de
 * esa columna el título y el objetivo. Lo que se ve (scroll ÷ columna) y lo que se titula deben ser el mismo día.
 */
test('deslizar la Semana con zoom: el título y el objetivo salen de las columnas que se ven completas', () => {
  const dias = diasDelRiel('2026-10-05', 7)
  for (const zoom of [1, 0.8, 1.25, 1.6]) {
    const col = columnaEntera(1148, 44, 7)
    const rielPropio = 44 + col * 7, rielPantalla = rielPropio * zoom
    const escala = escalaVisual(rielPantalla, rielPropio)
    // Columna i en pantalla (getBoundingClientRect) → px del riel (scrollLeft).
    const bordes = dias.map((_, i) => (i * col * zoom) / escala)
    for (const pasos of [3, -9, 5, 12, -14]) {
      const i = 14 + pasos, scroll = bordes[i]
      const primera = Math.round(scroll / col), visibles = dias.slice(primera, primera + 7)
      const asentado = dias[columnaCercana(bordes, scroll)]
      assert.equal(asentado, visibles[0], `zoom ${zoom}, ${pasos} días: asienta en el primer día visible`)
      assert.equal(tituloVentana(asentado, 7, new Date('2026-10-10T12:00:00')), tituloVentana(visibles[0], 7, new Date('2026-10-10T12:00:00'), visibles[6]))
      assert.equal(semanaDeMayoria(diasDesde(asentado, 7)), semanaDeMayoria(visibles))
      assert.ok(Math.abs(scroll - Math.round(scroll)) < 1e-6 && Math.abs(scroll / col - primera) < 1e-9, 'el asiento cae en el borde exacto de una columna: ningún día partido')
    }
    // Lo de antes: medir en pantalla y mover en px del riel adelantaba la rejilla `zoom` veces (14 columnas → 17.5 a 1.25).
    if (zoom !== 1) assert.notEqual((14 * col * zoom) / col, 14)
  }
})

test('cada día a la vista mide px enteros y N de ellos caben justo en el riel', () => {
  assert.equal(columnaEntera(1148, 44, 7), 157)
  assert.equal(columnaEntera(390, 38, 3), 117)
  assert.equal(columnaEntera(520, 38, 4), 120)
  assert.ok(44 + columnaEntera(1148, 44, 7) * 7 <= 1148)
  assert.equal(columnaEntera(30, 44, 7), 1)
  assert.equal(escalaVisual(1435, 1148), 1.25)
  assert.equal(escalaVisual(0, 0), 1)
})
