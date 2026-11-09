import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consultaEn } from '../../src/features/bi/catalogo'
import { catalogoGenerico } from '../../src/features/bi/generico'
import {
  aplicar, corredor, ESQUEMA_BI, excepcion, exceso, idDePregunta, leer, mensajeParaLevy, sumarDias, titularDe, tonoDe, validarBI,
  type Grafica, type Leida, type Punto,
} from '../../src/features/bi/modelo'

// El estándar de Business Intelligence (corredor p10–p90, la señal de Beer, la excepción y las acciones del panel) contra el
// catálogo genérico: lo mismo que viaja a la copia del alumno. El catálogo del autor se prueba en tests/bi/autor/.

const CAT = catalogoGenerico(null)
const c = (id: string) => consultaEn(CAT, id)!
const HASTA = '2026-11-06'
const serie = (vals: (number | null)[], hasta = HASTA): Punto[] => vals.map((v, i) => ({ fecha: sumarDias(hasta, i - vals.length + 1), valor: v }))
const g = (id: string, consulta: string, extra: Partial<Grafica> = {}): Grafica => ({ id, pregunta: `¿${id}?`, consulta: { id: consulta, ventana: 30 }, tipo: c(consulta).tipo, fuente: 'x', creada: '2026-11-07T10:00:00-06:00', por: 'Levy', estado: 'fijada', ...extra })
const base = Array.from({ length: 58 }, (_, i) => 40 + ((i * 7) % 12))

test('validar contra el catálogo vigente: errores en palabras; lo válido se conserva aunque otra falle', () => {
  const v = validarBI({ esquema: ESQUEMA_BI, graficas: [g('buena-uno', 'ventas'), { ...g('mala-uno', 'ventas'), consulta: { id: 'select * from', ventana: 30 } }, { ...g('mala-dos', 'lo-que-entro'), consulta: { id: 'lo-que-entro', ventana: 7 } }, g('buena-uno', 'bajas')] }, CAT)
  assert.equal(v.graficas.length, 1)
  assert.equal(v.errores.length, 3)
  assert.match(v.errores.join(' '), /catálogo/)
  assert.match(v.errores.join(' '), /ventana/)
  assert.match(v.errores.join(' '), /repetido/)
  assert.deepEqual(validarBI(null, CAT).graficas, [])
  // Una consulta del autor no existe en el catálogo genérico.
  assert.equal(validarBI({ esquema: ESQUEMA_BI, graficas: [g('visitas-x', 'ventas', { consulta: { id: 'visitas', ventana: 30 } })] }, CAT).graficas.length, 0)
})

test('el corredor sale de los 28 días anteriores; con menos de 14 medidos, aprende', () => {
  assert.equal(corredor([1, 2, 3], 3), null)
  const vals = Array.from({ length: 30 }, (_, i) => 10 + (i % 5))
  const k = corredor(vals, 29)!
  assert.ok(k.lo >= 10 && k.hi <= 14 && k.lo < k.hi)
  assert.equal(k.n, 28)
  // Los nulos no cuentan como cero.
  assert.equal(corredor([...Array(20).fill(null), ...Array(10).fill(5)], 30), null)
})

test('exceso y tono: salir hacia donde es bueno es placer; en contra, dolor', () => {
  const k = { lo: 10, hi: 20, med: 15, n: 28 }
  assert.deepEqual(exceso(15, k), { exceso: 0, lado: null })
  assert.equal(exceso(30, k).lado, 'arriba')
  assert.equal(exceso(30, k).exceso, 1)
  assert.equal(tonoDe('arriba', 'arriba'), 'placer')
  assert.equal(tonoDe('abajo', 'arriba'), 'dolor')
  assert.equal(tonoDe('arriba', 'abajo'), 'dolor')
  assert.equal(tonoDe('arriba', null), 'atencion')
})

test('leer una serie: calma, aprendiendo, y una caída fuera del corredor es dolor con récord', () => {
  const ventas = c('ventas')
  const calma = leer(ventas, 'linea', 30, { forma: 'serie', puntos: serie(base) })
  assert.equal(calma.estado, 'calma')
  assert.equal(calma.puntos!.length, 30)
  assert.match(calma.frase, /Dentro de lo normal/)
  assert.match(calma.frase, /ventas/)
  const nuevo = leer(ventas, 'linea', 30, { forma: 'serie', puntos: serie(base.slice(-10)) })
  assert.equal(nuevo.estado, 'aprendiendo')
  assert.equal(nuevo.aprendiendo!.faltan, 14 - 9)
  const caida = leer(ventas, 'linea', 30, { forma: 'serie', puntos: serie([...base.slice(0, -1), 8]) })
  assert.equal(caida.estado, 'fuera')
  assert.equal(caida.senal!.tono, 'dolor')
  assert.equal(caida.senal!.record, true)
  assert.match(caida.frase, /más bajo/)
  // En bajas y gastos, subir es dolor.
  const bajas = leer(c('bajas'), 'linea', 30, { forma: 'serie', puntos: serie([...Array(57).fill(2).map((v, i) => v + (i % 3)), 14]) })
  assert.equal(bajas.senal?.tono, 'dolor')
  // El dinero se dice en la moneda del dueño.
  const ingresos = leer({ ...c('ingresos'), moneda: 'COP' }, 'linea', 30, { forma: 'serie', puntos: serie(base.map(v => v * 1000)) })
  assert.match(ingresos.frase, /\$[\d,]+ COP/)
})

test('un día sin medir no es cero: no enciende alarma ni se pinta como caída', () => {
  const vals: (number | null)[] = [...base]
  vals[57] = null
  const l = leer(c('ventas'), 'linea', 30, { forma: 'serie', puntos: serie(vals) })
  assert.notEqual(l.estado, 'fuera')
  assert.equal(l.puntos![29].valor, null)
})

test('la excepción: sube UNA, el dolor pesa más, dice qué más se movió ese día y que la fuente puede estar incompleta', () => {
  const caen = (id: string, v: number) => ({ grafica: g(id, id), consulta: c(id), lectura: leer(c(id), 'linea', 30, { forma: 'serie', puntos: serie([...base.slice(0, -1), v]) }) })
  const calmas = (id: string) => ({ grafica: g(id, id), consulta: c(id), lectura: leer(c(id), 'linea', 30, { forma: 'serie', puntos: serie(base) }) })
  const leidas: Leida[] = [caen('ventas', 6), caen('ingresos', 25), calmas('interesados')]
  const ex = excepcion(leidas)!
  assert.ok(ex)
  assert.equal(ex.principal.lectura.senal!.tono, 'dolor')
  assert.equal(ex.otras.length, 1)
  assert.match(ex.porque.join(' '), /Ese mismo día también se salieron/)
  const sola = excepcion([caen('ventas', 6), calmas('interesados')])!
  assert.match(sola.porque.join(' '), /fuente traiga ese día completo/)
  assert.match(sola.propone, /antes de bajar precios/)
  assert.equal(titularDe(leidas, ex).palabra, 'Algo se salió')
  // En calma no sube nada; una respuesta sin fijar no enciende la alarma del tablero.
  assert.equal(excepcion([calmas('ventas'), calmas('interesados')]), null)
  assert.equal(titularDe([calmas('ventas')], null).palabra, 'En calma')
  assert.equal(excepcion(leidas.map(l => ({ ...l, grafica: { ...l.grafica, estado: 'respuesta' as const } }))), null)
})

test('acciones del panel: fijar sube al tablero, soltar quita, mover reordena solo lo fijado', () => {
  const a = { esquema: ESQUEMA_BI, graficas: [g('uno-x', 'ventas'), g('dos-x', 'bajas'), g('tres-x', 'interesados', { estado: 'respuesta' })] } as const
  const f = aplicar({ ...a, graficas: [...a.graficas] }, { accion: 'fijar', id: 'tres-x' })
  assert.ok('archivo' in f && f.archivo.graficas[0].id === 'tres-x' && f.archivo.graficas[0].estado === 'fijada')
  const s = aplicar({ ...a, graficas: [...a.graficas] }, { accion: 'soltar', id: 'uno-x' })
  assert.ok('archivo' in s && s.archivo.graficas.length === 2)
  const m = aplicar({ ...a, graficas: [...a.graficas] }, { accion: 'mover', id: 'dos-x', a: 0 })
  assert.ok('archivo' in m && m.archivo.graficas.map(x => x.id).join() === 'dos-x,uno-x,tres-x')
  assert.ok('error' in aplicar({ ...a, graficas: [...a.graficas] }, { accion: 'fijar', id: 'no-existe' }))
})

test('ids legibles y únicos a partir de la pregunta', () => {
  assert.equal(idDePregunta('¿Qué es lo que más vendo?', []), 'que-es-lo-que-mas-vendo')
  assert.equal(idDePregunta('¿Qué es lo que más vendo?', ['que-es-lo-que-mas-vendo']), 'que-es-lo-que-mas-vendo-2')
  assert.match(idDePregunta('¿?', []), /^grafica/)
})

test('el mensaje a Levy lleva la pregunta tal cual, el contrato y cómo conectar una fuente', () => {
  const m = mensajeParaLevy('  ¿Cuánto entró hoy?  ')
  assert.match(m, /«¿Cuánto entró hoy\?»/)
  assert.match(m, /run bi -- responder/)
  assert.match(m, /docs\/bi\/README\.md/)
  assert.match(m, /bi -- fuentes/)
})
