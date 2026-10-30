import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aplicarCambioDrip, DOC_VACIO, normalizarDoc, type DocDrip } from '../../src/features/planning/drip'
import { aplicarCambioSemana, diaIso, fantasmasDelDia, horasDePlantilla, leerDias, leerTramo, normalizarSemana } from '../../src/features/planning/semana-perfecta'
import { contarInterrupciones } from '../../src/features/planning/interrupciones'
import { enDias, piedrasPrecargadas, tipoDePiedra } from '../../src/features/planning/ano-precargado'
import { leerAjustes } from '../../src/features/planning/ajustes'
import { correrCliSemanaPerfecta } from '../../src/lib/planning/semana-perfecta-cli'

/* ── Semana Perfecta ─────────────────────────────────────────────────────────────────────────────────────────────── */

test('leerDias entiende rangos, listas, atajos y rangos que cruzan el domingo', () => {
  assert.deepEqual(leerDias('lun-vie'), [1, 2, 3, 4, 5])
  assert.deepEqual(leerDias('lun,mié,vie'), [1, 3, 5])
  assert.deepEqual(leerDias('todos'), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(leerDias('finde'), [6, 7])
  assert.deepEqual(leerDias('sab-lun'), [1, 6, 7])
  assert.equal(typeof leerDias('lunes-x'), 'string')
})

test('leerTramo: HH:MM-HH:MM, 24:00 vale, no cruza medianoche', () => {
  assert.deepEqual(leerTramo('06:00-08:30'), { desde: 360, hasta: 510 })
  assert.deepEqual(leerTramo('21:30-24:00'), { desde: 1290, hasta: 1440 })
  assert.equal(typeof leerTramo('22:00-06:00'), 'string')
  assert.equal(typeof leerTramo('6am'), 'string')
})

test('la plantilla vive en el documento DRIP: agregar, quitar, vaciar; infiere el cuadrante si falta', () => {
  let doc = aplicarCambioDrip(DOC_VACIO, { accion: 'semana', cambio: { op: 'agregar', dias: [1, 2, 3, 4, 5], desde: 360, hasta: 480, titulo: 'Deep work: grabar', cuadrante: 'producir' } }, '2026-10-25T13:00:00.000Z') as DocDrip
  assert.equal(doc.semana?.bloques.length, 5)
  doc = aplicarCambioDrip(doc, { accion: 'semana', cambio: { op: 'agregar', dias: [1, 3, 5], desde: 570, hasta: 660, titulo: 'GYM' } }) as DocDrip
  assert.equal(doc.semana?.bloques.filter(b => b.titulo === 'GYM')[0].cuadrante, 'invertir')
  assert.deepEqual(doc.semana!.bloques.slice(0, 2).map(b => b.titulo), ['Deep work: grabar', 'GYM'], 'en orden por día y hora')
  assert.equal(horasDePlantilla(doc.semana).producir, 10)
  assert.equal(typeof aplicarCambioDrip(doc, { accion: 'semana', cambio: { op: 'quitar', indices: [99] } }), 'string')
  doc = aplicarCambioDrip(doc, { accion: 'semana', cambio: { op: 'quitar', indices: [1] } }) as DocDrip
  assert.equal(doc.semana?.bloques.length, 7)
  // Sobrevive el viaje por JSON (Supabase / drip.json) y lo inválido se descarta.
  const vuelta = normalizarDoc(JSON.parse(JSON.stringify(doc)))
  assert.equal(vuelta.semana?.bloques.length, 7)
  assert.equal(normalizarSemana({ bloques: [{ dia: 9, desde: 0, hasta: 60, titulo: 'x' }, { dia: 1, desde: 60, hasta: 30, titulo: 'y' }] }), null)
  doc = aplicarCambioDrip(doc, { accion: 'semana', cambio: { op: 'vaciar' } }) as DocDrip
  assert.equal(doc.semana, null)
  assert.equal(normalizarDoc({}).semana, null, 'un documento viejo nace sin semana perfecta')
})

test('fantasmasDelDia: el día de la semana correcto, sin correrse por zona', () => {
  const s = normalizarSemana({ bloques: [{ dia: 1, desde: 360, hasta: 480, titulo: 'Lunes', cuadrante: 'producir' }, { dia: 7, desde: 600, hasta: 660, titulo: 'Domingo', cuadrante: 'invertir' }] })
  assert.equal(diaIso('2026-10-26'), 1)
  assert.equal(diaIso('2026-10-25'), 7)
  assert.deepEqual(fantasmasDelDia(s, '2026-10-26').map(b => b.titulo), ['Lunes'])
  assert.deepEqual(fantasmasDelDia(s, '2026-10-25').map(b => b.titulo), ['Domingo'])
  assert.deepEqual(fantasmasDelDia(null, '2026-10-25'), [])
})

test('el CLI escribe en el almacén forzado y nunca en el real', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'semana-perfecta-'))
  const archivo = join(dir, 'drip.json')
  const antes = process.env.ARBRAIN_DRIP_ARCHIVO
  process.env.ARBRAIN_DRIP_ARCHIVO = archivo
  const log = console.log; console.log = () => {}
  try {
    await correrCliSemanaPerfecta(['agregar', 'lun-vie', '06:00-08:00', 'Deep work', 'producir'])
    await correrCliSemanaPerfecta(['agregar', 'sab', '09:00-10:00', 'Revisión del domingo'])
  } finally { console.log = log; if (antes === undefined) delete process.env.ARBRAIN_DRIP_ARCHIVO; else process.env.ARBRAIN_DRIP_ARCHIVO = antes }
  const doc = normalizarDoc(JSON.parse(readFileSync(archivo, 'utf8')))
  assert.equal(doc.semana?.bloques.length, 6)
  assert.equal(doc.semana?.bloques.at(-1)?.dia, 6)
})

test('el interruptor del engrane nace encendido y se recuerda', () => {
  assert.equal(leerAjustes(null).semanaPerfecta, true)
  assert.equal(leerAjustes(JSON.stringify({ v: 2, semanaPerfecta: false })).semanaPerfecta, false)
})

/* ── Interrupciones ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('interrupciones: cuenta los avisos que pidieron decisión y separa los de Reemplazar/Delegar', () => {
  const r = contarInterrupciones([
    { creado: '2026-10-20T10:00:00Z', decision: 'Publicar el anuncio hoy', rutina: 'morning briefing' },
    { creado: '2026-10-21T10:00:00Z', decision: 'Pagar la factura del dominio', rutina: null },
    { creado: '2026-10-22T10:00:00Z', decision: 'Grabar el VSL esta semana', rutina: null },
  ])
  assert.equal(r.total, 3)
  assert.equal(r.rd, 2)
  assert.deepEqual(r.ejemplos, ['Publicar el anuncio hoy', 'Pagar la factura del dominio'])
  assert.deepEqual(contarInterrupciones([]), { medido: true, total: 0, rd: 0, ejemplos: [] })
})

/* ── Año Precargado ──────────────────────────────────────────────────────────────────────────────────────────────── */

test('tipoDePiedra con títulos reales del calendario de Daniel (25 oct 2026)', () => {
  assert.equal(tipoDePiedra('🏆 Premio del monk mode · Oaxaca (Centro histórico)'), 'premio')
  assert.equal(tipoDePiedra('🏔️ Oaxaca · premio del monk mode (Centro, Jalatlaco)'), 'premio')
  assert.equal(tipoDePiedra('🤝 Reunión SaaS Factory en Monterrey (presencial)'), 'viaje')
  assert.equal(tipoDePiedra('🔓 Abre Supernova en el classroom (día 14)'), 'lanzamiento')
  assert.equal(tipoDePiedra('🎤 Demo day · Tu cerebro (viernes de S1)'), 'lanzamiento')
  assert.equal(tipoDePiedra('🚀 Fase 5 · Escala (S10–11)'), 'piedra')
  assert.equal(tipoDePiedra('🧭 Uno a uno · al cerrar la etapa · tu oferta (S3)'), 'piedra')
})

test('piedrasPrecargadas: premio → viaje → lanzamiento primero, sin lo que ya pasó ni lo que tiene hora', () => {
  const ev = [
    { id: 'a', title: '🧠 Fase 1 · Tu cerebro (S0–1)', start: '2026-10-21', end: '2026-11-02', allDay: true },
    { id: 'b', title: '🔓 Abre Supernova en el classroom (día 14)', start: '2026-10-31', end: '2026-11-04', allDay: true },
    { id: 'c', title: '🏆 Premio del monk mode · Monterrey', start: '2026-11-21', end: '2026-11-23', allDay: true },
    { id: 'd', title: '🤝 Reunión en Monterrey (presencial)', start: '2026-11-28', end: '2026-11-29', allDay: true },
    { id: 'e', title: 'Viejo', start: '2026-10-01', end: '2026-10-02', allDay: true },
    { id: 'f', title: 'GYM', start: '2026-10-26T09:30:00-06:00', end: '2026-10-26T11:00:00-06:00', allDay: false },
    { id: 'g', title: '🏆 Premio del monk mode · Monterrey', start: '2026-11-22', end: '2026-11-23', allDay: true },
  ]
  const p = piedrasPrecargadas(ev, '2026-10-25', '2027-02-22')
  assert.deepEqual(p.map(x => x.id), ['c', 'd', 'b', 'a'])
  assert.equal(p[0].hasta, '2026-11-22', 'el fin exclusivo de Google se vuelve el último día')
  assert.equal(enDias('2026-10-25', '2026-11-21'), 27)
  assert.equal(enDias('2026-10-25', '2026-10-21'), 0)
})
