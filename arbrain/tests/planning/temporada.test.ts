import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fijarTemporada, normalizarTemporada, sinTemporada, temporadaVigente, validarPeriodo, NOMBRE_POR_DEFECTO } from '../../src/features/planning/temporada'
import { dondeTemporada, escribirArchivoTemporada, leerArchivoTemporada, RUTA_TEMPORADA_LOCAL } from '../../src/lib/planning/temporada-store'
import { correrCliTemporada } from '../../src/lib/planning/temporada-cli'
import { INSTALACION as GENERICA } from '../../src/config/instalacion.plantilla'

const BASE = { desde: '2026-11-02', hasta: '2026-12-01', premio: 'Una semana en la playa', meta: 'Mis primeros 3 clientes', cumplir: ['Oferta lista'] }
const tmp = () => mkdtempSync(join(tmpdir(), 'temporada-'))

test('validarPeriodo: limpia lo bueno y explica lo malo en palabras de la persona', () => {
  assert.deepEqual(validarPeriodo(BASE), { ...BASE })
  assert.match(validarPeriodo({ ...BASE, desde: '2026-13-01' }) as string, /día 1/)
  assert.match(validarPeriodo({ ...BASE, hasta: '2026-11-02' }) as string, /después del día 1/)
  assert.match(validarPeriodo({ ...BASE, hasta: '2028-01-01' }) as string, /366/)
  assert.match(validarPeriodo({ ...BASE, premio: '  ' }) as string, /premio/)
  assert.match(validarPeriodo({ ...BASE, cumplir: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }) as string, /6/)
  assert.match(validarPeriodo({ ...BASE, viaje: { desde: '2026-12-05', hasta: '2026-12-01' } }) as string, /premio/)
  const v = validarPeriodo({ ...BASE, viaje: { desde: '2026-12-01', hasta: '2026-12-07', firmado: false } })
  assert.deepEqual(typeof v === 'string' ? v : v.viaje, { desde: '2026-12-01', hasta: '2026-12-07', firmado: false })
  assert.equal(typeof validarPeriodo({ ...BASE, meta: undefined }) === 'string', false, 'la meta es opcional')
})

test('fijarTemporada: arranque entre el día 1 y el cierre; nombre opcional', () => {
  const doc = fijarTemporada({ periodo: BASE, nombre: 'Modo enfoque' }, '2026-10-24T10:00:00.000Z')
  assert.equal(typeof doc, 'object')
  assert.equal((doc as { nombre: string }).nombre, 'Modo enfoque')
  assert.match(fijarTemporada({ periodo: BASE, arranque: '2026-10-01' }) as string, /arranque/)
  assert.match(fijarTemporada({ periodo: { ...BASE, premio: '' } }) as string, /premio/)
})

test('precedencia: documento guardado > instalación; «quitar» gana a la instalación', () => {
  // Una instalación con temporada propia en su configuración (como la original) y la plantilla del alumno (sin ninguna).
  const inst = { periodo: { desde: '2026-10-26', hasta: '2026-11-24', premio: 'El viaje', cumplir: [] as string[] }, temporadaHabitos: { nombre: 'Enfoque', arranque: '2026-10-26' } }
  // Sin documento: manda la instalación.
  assert.deepEqual(temporadaVigente(null, inst), inst)
  assert.deepEqual(temporadaVigente(null, { periodo: GENERICA.periodo, temporadaHabitos: GENERICA.temporadaHabitos }), { periodo: undefined, temporadaHabitos: undefined })
  // Con documento: manda entero; sin nombre ni arranque, los hábitos cuentan desde el día 1.
  const doc = fijarTemporada({ periodo: BASE }) as Exclude<ReturnType<typeof fijarTemporada>, string>
  assert.deepEqual(temporadaVigente(doc, inst), { periodo: BASE, temporadaHabitos: { nombre: NOMBRE_POR_DEFECTO, arranque: BASE.desde } })
  // Quitada: sin temporada aunque la instalación traiga una.
  assert.deepEqual(temporadaVigente(sinTemporada(), inst), {})
})

test('la plantilla del alumno nace sin periodo, sin temporada de hábitos y sin tarifa', () => {
  assert.equal(GENERICA.periodo, undefined)
  assert.equal(GENERICA.temporadaHabitos, undefined)
  assert.equal(GENERICA.recompra, undefined)
})

test('dondeTemporada: forzado > cerebro del alumno > instalación', () => {
  assert.deepEqual(dondeTemporada({ cliente: false }, {}), { tipo: 'instalacion' })
  assert.deepEqual(dondeTemporada({ cliente: true, raiz: () => '/c' }, {}), { tipo: 'archivo', ruta: join('/c', RUTA_TEMPORADA_LOCAL) })
  assert.deepEqual(dondeTemporada({ cliente: false }, { ARBRAIN_TEMPORADA_ARCHIVO: '/x/t.json' }), { tipo: 'archivo', ruta: '/x/t.json' })
  assert.throws(() => dondeTemporada({ cliente: false }, { ARBRAIN_TEMPORADA_ARCHIVO: 'rel.json' }), /absoluta/)
  assert.throws(() => dondeTemporada({ cliente: true }, {}), /raíz/)
})

test('almacén: sin archivo = null (manda la instalación); escribe atómico y relee igual; JSON roto = sin temporada', () => {
  const ruta = join(tmp(), '.claude', 'plan', 'temporada.json')
  assert.equal(leerArchivoTemporada(ruta), null)
  const doc = fijarTemporada({ periodo: BASE, nombre: 'Modo enfoque' }) as Exclude<ReturnType<typeof fijarTemporada>, string>
  escribirArchivoTemporada(ruta, doc)
  assert.equal(existsSync(`${ruta}.tmp`), false)
  assert.deepEqual(leerArchivoTemporada(ruta), doc)
  assert.match(readFileSync(ruta, 'utf8'), /_como_se_usa/)
  writeFileSync(ruta, '{roto', 'utf8')
  assert.equal(leerArchivoTemporada(ruta)?.periodo, null)
  // Un periodo inválido escrito a mano no rompe: queda sin temporada.
  writeFileSync(ruta, JSON.stringify({ periodo: { desde: 'mañana' } }), 'utf8')
  assert.equal(normalizarTemporada(JSON.parse(readFileSync(ruta, 'utf8'))).periodo, null)
})

test('CLI: fija, ve y quita en el cerebro del alumno; en la instalación original solo lee', async () => {
  const raiz = tmp(), antes = { ...process.env }
  const salida: string[] = [], log = console.log
  console.log = (...a: unknown[]) => { salida.push(a.join(' ')) }
  try {
    process.env.ARBRAIN_EDICION = 'cliente'; process.env.ARBRAIN_HOME = raiz; delete process.env.ARBRAIN_TEMPORADA_ARCHIVO
    await correrCliTemporada(['fijar', '--desde', '2026-11-02', '--hasta', '2026-12-01', '--premio', 'Una semana en la playa', '--meta', 'Mis primeros 3 clientes',
      '--premio-desde', '2026-12-01', '--premio-hasta', '2026-12-07', '--por-firmar', '--cumplir', 'Oferta lista', '--cumplir', 'Primer cliente'])
    const doc = leerArchivoTemporada(join(raiz, RUTA_TEMPORADA_LOCAL))!
    assert.deepEqual(doc.periodo?.cumplir, ['Oferta lista', 'Primer cliente'])
    assert.equal(doc.periodo?.viaje?.firmado, false)
    await correrCliTemporada(['ver'])
    assert.ok(salida.some(l => /Premio: Una semana en la playa/.test(l)))
    await correrCliTemporada(['quitar'])
    assert.equal(leerArchivoTemporada(join(raiz, RUTA_TEMPORADA_LOCAL))?.periodo, null)
    await assert.rejects(correrCliTemporada(['fijar', '--desde', '2026-11-02', '--hasta', '2026-11-01', '--premio', 'x']), /después del día 1/)
    await assert.rejects(correrCliTemporada(['fijar', '--desde', '2026-11-02', '--hasta', '2026-12-01', '--premio', 'x', '--premio-desde', '2026-12-01']), /juntas/)
    // Instalación original: no hay almacén; fijar no escribe nada.
    delete process.env.ARBRAIN_EDICION
    await assert.rejects(correrCliTemporada(['fijar', '--desde', '2026-11-02', '--hasta', '2026-12-01', '--premio', 'x']), /instalacion\.ts/)
  } finally {
    console.log = log
    for (const k of ['ARBRAIN_EDICION', 'ARBRAIN_HOME', 'ARBRAIN_TEMPORADA_ARCHIVO']) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k] }
  }
})
