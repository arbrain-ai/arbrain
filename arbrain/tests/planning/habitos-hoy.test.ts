import test from 'node:test'
import assert from 'node:assert/strict'
import { casillaDeTecla, cuentaRegresiva, diasTira, estadoCelda, noSeRompe, porcentajeSemana, rachaActual, semanasTemporada, semanaDeHoy, textoRacha } from '../../src/features/planning/habitos-hoy'
import { tomarPedidoHabitos, pedirHabitos } from '../../src/features/planning/habitos-pedido'
import { aliasPorDefecto, aplicarCambio, conPropuesta, nombrePublico } from '../../src/lib/sistema/atomicos'

const marcas = (m: Record<string, boolean | null>) => (f: string) => m[f]
const INICIO = '2026-10-23'

test('la racha cuenta hasta hoy si ya se marcó, o hasta ayer si el día sigue abierto', () => {
  const m = marcas({ '2026-10-23': true, '2026-10-24': true, '2026-10-25': true })
  assert.equal(rachaActual(m, '2026-10-25', INICIO), 3)
  assert.equal(rachaActual(m, '2026-10-26', INICIO), 3, 'hoy sin marcar no la rompe todavía')
  assert.equal(rachaActual(m, '2026-10-27', INICIO), 0, 'un día entero sin marca sí')
})

test('la historia arranca el 23 oct: nada de antes cuenta para la racha', () => {
  const m = marcas({ '2026-10-20': true, '2026-10-21': true, '2026-10-22': true, '2026-10-23': true })
  assert.equal(rachaActual(m, '2026-10-23', INICIO), 1)
  assert.equal(rachaActual(m, '2026-10-22', INICIO), 0)
})

test('nunca falles dos veces: ayer sin cumplir y hoy sin marcar = hoy es el día que no se rompe', () => {
  assert.equal(noSeRompe(marcas({ '2026-10-24': true }), '2026-10-25', INICIO), false, 'ayer cumplido')
  assert.equal(noSeRompe(marcas({ '2026-10-24': false }), '2026-10-25', INICIO), true, 'ayer fallado')
  assert.equal(noSeRompe(marcas({}), '2026-10-25', INICIO), true, 'ayer sin marca también cuenta como fallo aquí')
  assert.equal(noSeRompe(marcas({ '2026-10-24': false, '2026-10-25': true }), '2026-10-25', INICIO), false, 'hoy ya se marcó: salvado')
  assert.equal(noSeRompe(marcas({}), '2026-10-23', INICIO), false, 'el primer día no hay un ayer que contar')
  assert.equal(noSeRompe(marcas({}), '2026-10-22', INICIO), false)
})

test('las celdas: fuera antes del arranque, futuro sin pintar, hoy vacío no es fallo', () => {
  assert.equal(estadoCelda(undefined, '2026-10-20', '2026-10-25', INICIO), 'fuera')
  assert.equal(estadoCelda(true, '2026-10-20', '2026-10-25', INICIO), 'fuera', 'las marcas viejas no rellenan la historia')
  assert.equal(estadoCelda(undefined, '2026-10-26', '2026-10-25', INICIO), 'futuro')
  assert.equal(estadoCelda(undefined, '2026-10-25', '2026-10-25', INICIO), 'vacio')
  assert.equal(estadoCelda(false, '2026-10-24', '2026-10-25', INICIO), 'fallado')
  assert.equal(estadoCelda(true, '2026-10-24', '2026-10-25', INICIO), 'hecho')
  assert.equal(diasTira('2026-10-25').length, 30)
  assert.equal(diasTira('2026-10-25').at(-1), '2026-10-25')
})

test('la temporada 22 oct a 21 nov cabe en 5 semanas de lunes a domingo', () => {
  const sem = semanasTemporada('2026-10-22', '2026-11-21')
  assert.equal(sem.length, 5)
  assert.deepEqual(sem[0].slice(0, 4), [null, null, null, '2026-10-22'], 'el 22 oct es jueves')
  assert.equal(sem[4][5], '2026-11-21')
  assert.equal(sem[4][6], null, 'el domingo 22 nov ya no es temporada')
  assert.equal(semanaDeHoy(sem, '2026-10-28'), sem[1])
})

test('porcentaje semanal: solo días vividos desde el arranque; sin días, null (nunca un 0 inventado)', () => {
  const m = (f: string, c: string) => ({ '2026-10-23|a': true, '2026-10-23|b': true, '2026-10-24|a': true } as Record<string, boolean>)[`${f}|${c}`]
  const semana = semanasTemporada('2026-10-22', '2026-11-21')[0]
  assert.equal(porcentajeSemana(semana, ['a', 'b', 'c'], m, '2026-10-22', INICIO), null)
  assert.deepEqual(porcentajeSemana(semana, ['a', 'b', 'c'], m, '2026-10-24', INICIO), { hechos: 3, posibles: 6, pct: 50 })
})

test('la cuenta regresiva a Monterrey', () => {
  const t = { arranque: INICIO, hasta: '2026-11-21', premio: 'Monterrey' }
  assert.equal(cuentaRegresiva('2026-10-22', t).texto, 'Empieza mañana · 30 días para Monterrey')
  assert.deepEqual(cuentaRegresiva('2026-10-23', t), { dia: 1, total: 30, texto: 'Día 1 de 30 · faltan 29 días para Monterrey' })
  assert.equal(cuentaRegresiva('2026-11-20', t).texto, 'Día 29 de 30 · falta 1 día para Monterrey')
  assert.equal(cuentaRegresiva('2026-11-21', t).texto, 'Día 30 de 30 · hoy es Monterrey')
  assert.equal(textoRacha(1), '1 día')
})

test('teclas 1 · 2 · 3 marcan por lugar; con modificadores o fuera de rango, nada', () => {
  const k = (code: string, extra = {}) => ({ code, key: code.slice(-1), ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, ...extra })
  assert.equal(casillaDeTecla(k('Digit1'), 3), 0)
  assert.equal(casillaDeTecla(k('Numpad3'), 3), 2)
  assert.equal(casillaDeTecla(k('Digit3'), 2), null, 'en modo presentación hay menos casillas')
  assert.equal(casillaDeTecla(k('Digit1', { ctrlKey: true }), 3), null)
  assert.equal(casillaDeTecla(k('Digit0'), 3), null)
})

test('el pedido de Ctrl+H se toma una sola vez y caduca', () => {
  pedirHabitos(1000)
  assert.equal(tomarPedidoHabitos(2000), true)
  assert.equal(tomarPedidoHabitos(2001), false)
  pedirHabitos(1000)
  assert.equal(tomarPedidoHabitos(10_000), false)
})

test('privados: nombre neutro por lugar o el que se elija; el real solo al revelar', () => {
  assert.equal(aliasPorDefecto(3), '🔒 Hábito 3')
  assert.equal(nombrePublico('Real', { senal: '', dosMinutos: '', privado: true }, 3), '🔒 Hábito 3')
  assert.equal(nombrePublico('Real', { senal: '', dosMinutos: '', privado: true, alias: 'Noche limpia' }, 3), 'Noche limpia')
  assert.equal(nombrePublico('Real', { senal: '', dosMinutos: '', privado: true }, 3, true), 'Real')
  assert.equal(nombrePublico('Real', undefined, 3), 'Real')
})

test('lo guardado manda sobre la propuesta, también para la privacidad', () => {
  const propuesta = { identidad: 'Soy alguien que cumple', habitos: { x: { senal: '5:30', dosMinutos: '10 abs', privado: true } } }
  assert.equal(conPropuesta(null, propuesta).habitos.x.privado, true)
  const guardado = conPropuesta({ habitos: { x: { senal: '6:00', dosMinutos: '10 abs', privado: false } } }, propuesta)
  assert.equal(guardado.habitos.x.privado, false)
  assert.equal(guardado.habitos.x.senal, '6:00')
  assert.equal(guardado.identidad, 'Soy alguien que cumple')
})

test('los cambios se validan: texto corto, clave limpia, privado sí o no', () => {
  const base = conPropuesta(null, { identidad: '', habitos: {} })
  const a = aplicarCambio(base, { identidad: '  Soy   alguien que entrena  ' })
  assert.ok(typeof a !== 'string' && a.identidad === 'Soy alguien que entrena')
  const b = aplicarCambio(base, { clave: 'rutina_matutina', senal: '5:30', privado: true, alias: 'Uno' })
  assert.ok(typeof b !== 'string' && b.habitos.rutina_matutina.privado === true && b.habitos.rutina_matutina.alias === 'Uno')
  assert.equal(typeof aplicarCambio(base, { clave: 'Mal Clave' }), 'string')
  assert.equal(typeof aplicarCambio(base, { clave: 'x', privado: 'si' }), 'string')
  assert.equal(typeof aplicarCambio(base, {}), 'string')
  const largo = aplicarCambio(base, { identidad: 'a'.repeat(500) })
  assert.ok(typeof largo !== 'string' && largo.identidad.length === 140)
})
