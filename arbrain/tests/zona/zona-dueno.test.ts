/**
 * T7 de la cohorte (29 oct 2026): la app del alumno usa SU zona horaria; la original sigue en México.
 * Hábitos (`civilToday`), el «hoy» del panel (`hoyCivil`), el tema por hora y los rangos del calendario.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { zonaDueno, zonaValida, ZONA_ORIGINAL } from '../../src/shared/lib/zona-dueno'
import { civilToday, civilMidnight, habitRange } from '../../src/features/sistema/calendar-days'
import { hoyCivil, isoMx } from '../../src/features/cabina/model'
import { horaMexico } from '../../src/shared/lib/tema-por-hora'

const CLIENTE = { ARBRAIN_EDICION: 'cliente' }
const ORIGINAL = { ARBRAIN_EDICION: 'original' }

/** Corre `fn` con la edición y la zona pedidas en `process.env` (lo que leen los valores por defecto). */
function con(env: Record<string, string | undefined>, fn: () => void) {
  const antes = { ARBRAIN_EDICION: process.env.ARBRAIN_EDICION, ARBRAIN_TZ: process.env.ARBRAIN_TZ }
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  try { fn() } finally {
    for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  }
}

test('Instalación original: siempre America/Mexico_City, aunque su sistema o ARBRAIN_TZ digan otra cosa', () => {
  assert.equal(zonaDueno(ORIGINAL, 'Europe/Madrid'), ZONA_ORIGINAL)
  assert.equal(zonaDueno({ ...ORIGINAL, ARBRAIN_TZ: 'America/Santiago' }, 'Europe/Madrid'), ZONA_ORIGINAL)
  assert.equal(zonaDueno({}, 'Asia/Tokyo'), ZONA_ORIGINAL)
})

test('Alumno: ARBRAIN_TZ válida > zona del sistema > UTC', () => {
  assert.equal(zonaDueno(CLIENTE, 'Europe/Madrid'), 'Europe/Madrid')
  assert.equal(zonaDueno({ ...CLIENTE, ARBRAIN_TZ: 'America/Santiago' }, 'Europe/Madrid'), 'America/Santiago')
  assert.equal(zonaDueno({ ...CLIENTE, ARBRAIN_TZ: 'Marte/Olimpo' }, 'Europe/Madrid'), 'Europe/Madrid')
  assert.equal(zonaDueno(CLIENTE, 'no/es-zona'), 'UTC')
  assert.equal(zonaDueno(CLIENTE, ''), 'UTC')
  assert.ok(zonaValida('America/Mexico_City'))
  assert.ok(!zonaValida(''))
})

test('Madrid: el «hoy» cambia a su medianoche, no a la de México', () => {
  // 29 oct 2026 23:30 en Madrid (CET, UTC+1) = 22:30Z; en México aún es 29 a las 16:30.
  const antes = new Date('2026-10-29T22:59:00Z'), despues = new Date('2026-10-29T23:01:00Z')
  con({ ...CLIENTE, ARBRAIN_TZ: 'Europe/Madrid' }, () => {
    assert.equal(civilToday(undefined, antes), '2026-10-29')
    assert.equal(civilToday(undefined, despues), '2026-10-30')
    assert.equal(hoyCivil(antes), '2026-10-29')
    assert.equal(hoyCivil(despues), '2026-10-30')
    assert.equal(habitRange(new URLSearchParams(), despues).today, '2026-10-30')
    assert.equal(habitRange(new URLSearchParams(), despues).timeZone, 'Europe/Madrid')
    // La medianoche del 30 en Madrid es 23:00Z del 29; el rango del calendario arranca ahí.
    assert.equal(civilMidnight('2026-10-30').toISOString(), '2026-10-29T23:00:00.000Z')
    assert.equal(isoMx('2026-10-30'), '2026-10-29T23:00:00.000Z')
    // Tema por hora: 07:00 en Madrid es de día aunque en México sean las 00:00.
    assert.equal(horaMexico(new Date('2026-10-30T06:00:00Z')), 7)
  })
})

test('Santiago: el «hoy» cambia a su medianoche (UTC-3 en verano austral)', () => {
  // Santiago en octubre está en horario de verano (UTC-3): su medianoche del 30 es 03:00Z.
  con({ ...CLIENTE, ARBRAIN_TZ: 'America/Santiago' }, () => {
    assert.equal(civilToday(undefined, new Date('2026-10-30T02:59:00Z')), '2026-10-29')
    assert.equal(civilToday(undefined, new Date('2026-10-30T03:01:00Z')), '2026-10-30')
    assert.equal(hoyCivil(new Date('2026-10-30T03:01:00Z')), '2026-10-30')
    assert.equal(civilMidnight('2026-10-30').toISOString(), '2026-10-30T03:00:00.000Z')
  })
})

test('Edición original: el «hoy» y los rangos siguen en México, con el mismo texto de siempre', () => {
  con({ ...ORIGINAL, ARBRAIN_TZ: 'Europe/Madrid' }, () => {
    // 05:59Z del 30 = 23:59 del 29 en México; 06:01Z = 00:01 del 30.
    assert.equal(civilToday(undefined, new Date('2026-10-30T05:59:00Z')), '2026-10-29')
    assert.equal(civilToday(undefined, new Date('2026-10-30T06:01:00Z')), '2026-10-30')
    assert.equal(hoyCivil(new Date('2026-10-30T05:59:00Z')), '2026-10-29')
    assert.equal(isoMx('2026-10-30'), '2026-10-30T00:00:00-06:00')
    assert.equal(habitRange(new URLSearchParams(), new Date('2026-10-30T06:01:00Z')).timeZone, 'America/Mexico_City')
    assert.equal(horaMexico(new Date('2026-10-05T01:00:00Z')), 19)
  })
})

test('Alumno en México: mismo resultado que la original', () => {
  con({ ...CLIENTE, ARBRAIN_TZ: 'America/Mexico_City' }, () => {
    assert.equal(civilToday(undefined, new Date('2026-10-30T05:59:00Z')), '2026-10-29')
    assert.equal(civilToday(undefined, new Date('2026-10-30T06:01:00Z')), '2026-10-30')
  })
})

test('Las claves de hábitos guardadas (AAAA-MM-DD) no cambian de significado', () => {
  // Una petición con su zona explícita (como la manda useHabitRecords) gana sobre la del dueño.
  con({ ...ORIGINAL }, () => {
    const r = habitRange(new URLSearchParams({ timeZone: 'Europe/Madrid', date: '2026-10-26', days: '7' }), new Date('2026-10-29T12:00:00Z'))
    assert.deepEqual([r.from, r.to, r.timeZone], ['2026-10-20', '2026-10-26', 'Europe/Madrid'])
  })
})
