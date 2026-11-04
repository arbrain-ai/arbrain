import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chipModelo, chipModo, cuerpoAgregar, esRutinaLoop, estadoCorrida, esperaTuToque, pestanaInicial, porcentajeSolas, porDia, porPrioridad, ultimaLinea, ultimasDe,
  type CorridaVista, type PlantillaVista, type VistaLoops,
} from '../src/lib/loops'
import { cuandoRutina } from '../src/lib/rutinas-cliente'
import { apiPermitidaEnCliente } from '../src/lib/edicion'

// Loops de negocio (3 nov 2026, prototipo detrás de ARBRAIN_LOOPS=1): reglas puras de la vista.

const p = (o: Partial<PlantillaVista>): PlantillaVista => ({
  id: 'x', nombre: 'X', queVigila: '', teSube: '', prioridad: 1, icono: 'Star', schedule: '0 9 * * *', frecuencia: 'Diario',
  modelo: 'sonnet', esfuerzo: 'medium', para: 'ambos', modo: 'solo-revisa', agregado: null, ...o,
})
const c = (o: Partial<CorridaVista>): CorridaVista => ({ id: 1, rutina: 'loop-a', plantilla: 'a', nombre: 'A', icono: 'Star', corrida: 0, estado: 'en-orden', resumen: '', manual: false, ...o })

test('el chip dice el modelo y el esfuerzo con que de verdad corre', () => {
  assert.equal(chipModelo({ modelo: 'sonnet', esfuerzo: 'medium' }), 'Sonnet · medio')
  assert.equal(chipModelo({ modelo: 'haiku', esfuerzo: 'low' }), 'Haiku · bajo')
  assert.equal(chipModelo({ modelo: 'opus', esfuerzo: 'high' }), 'Opus · alto')
})

test('lo irreversible dice «Pregunta antes»; lo demás «Solo revisa»', () => {
  assert.equal(chipModo({ modo: 'pregunta-antes', toca: 'contactar' }), 'Pregunta antes de contactar')
  assert.equal(chipModo({ modo: 'pregunta-antes', toca: 'pagar' }), 'Pregunta antes de pagar')
  assert.equal(chipModo({ modo: 'solo-revisa' }), 'Solo revisa')
  assert.match(chipModo({ modo: 'lo-haces-tu', toca: 'pagar' }), /tú pagas/)
})

test('por prioridad: P1, P2, P3 en orden y sin grupos vacíos', () => {
  const g = porPrioridad([p({ id: 'c', prioridad: 3 }), p({ id: 'a', prioridad: 1 }), p({ id: 'b', prioridad: 1 })])
  assert.deepEqual(g.map(x => [x.prioridad, x.items.map(i => i.id)]), [[1, ['a', 'b']], [3, ['c']]])
})

test('la línea de tiempo agrupa por día civil, lo más nuevo primero', () => {
  const ahora = Date.parse('2026-11-03T18:00:00Z')
  const g = porDia([c({ id: 1, corrida: Date.parse('2026-11-02T16:00:00Z') }), c({ id: 2, corrida: Date.parse('2026-11-03T15:00:00Z') }), c({ id: 3, corrida: Date.parse('2026-10-30T16:00:00Z') })], ahora)
  assert.deepEqual(g.map(x => x.titulo).slice(0, 2), ['Hoy', 'Ayer'])
  assert.equal(g.length, 3)
  assert.deepEqual(g[0].items.map(i => i.id), [2])
})

test('cada corrida se dice como lo vive el dueño', () => {
  assert.deepEqual(estadoCorrida(c({ estado: 'en-orden' })), { tono: 'ok', texto: 'Se archivó sola' })
  const abierta = c({ estado: 'excepcion', tarjeta: { id: 'cf_1', estado: 'en_cola', tipo: 'decision', categoria: 'enviar', origen: 'cron', titulo: 't', creada: 1, irreversible: true } })
  assert.equal(esperaTuToque(abierta), true)
  assert.equal(estadoCorrida(abierta).texto, 'Espera tu toque')
  assert.equal(estadoCorrida(c({ estado: 'excepcion', respuesta: 'si' })).texto, 'Dijiste Sí')
  assert.equal(estadoCorrida(c({ estado: 'sin-contrato' })).tono, 'sin-dato')
})

test('sin corridas, el porcentaje es «sin dato», no 100 %', () => {
  assert.equal(porcentajeSolas({ corridas: 0, solas: 0 }), null)
  assert.equal(porcentajeSolas({ corridas: 4, solas: 3 }), 75)
})

test('abre en Plantillas sin loops, en Revisar si algo espera, si no en Tus loops', () => {
  const agregado = { rutina: 'loop-a', activa: true, proxima: null, ultima: null, resultado: null, agregado: 1 }
  const v = (o: Partial<VistaLoops>): VistaLoops => ({ activo: true, plantillas: [], ...o })
  assert.equal(pestanaInicial(v({ plantillas: [p({})] })), 'plantillas')
  assert.equal(pestanaInicial(v({ plantillas: [p({ agregado })], resumen: { loops: 1, corridas: 1, solas: 0, enBandeja: 1, fallas: 0 } })), 'revisar')
  assert.equal(pestanaInicial(v({ plantillas: [p({ agregado })], resumen: { loops: 1, corridas: 1, solas: 1, enBandeja: 0, fallas: 0 } })), 'tus')
})

test('la última línea de un loop y sus últimas corridas', () => {
  assert.equal(ultimaLinea('En orden: nadie debe.')!.tono, 'ok')
  assert.equal(ultimaLinea('Subió a tu bandeja: ¿Le cobro a X?')!.tono, 'excepcion')
  assert.deepEqual(ultimaLinea('Error: timeout'), { tono: 'fallo', texto: 'Falló: timeout' })
  assert.equal(ultimaLinea(null), null)
  const largo = ultimaLinea(`En orden: ${'Revisé los eventos de mañana y no hay choques. '.repeat(8)}Objetivo principal (propuesta`)!
  assert.match(largo.texto, /choques\.…$/)
  const lista = Array.from({ length: 12 }, (_, i) => c({ id: i, corrida: i * 1000 }))
  assert.deepEqual(ultimasDe(lista, 'loop-a', 10).map(x => x.id), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
})

test('agregar solo acepta un id de plantilla', () => {
  assert.deepEqual(cuerpoAgregar({ plantilla: 'cobranza-pendiente' }), { plantilla: 'cobranza-pendiente' })
  assert.ok('error' in cuerpoAgregar({ plantilla: '../../etc' }))
  assert.ok('error' in cuerpoAgregar({ prompt: 'haz lo que quieras', schedule: '* * * * *' }))
  assert.equal(esRutinaLoop('loop-cobranza-pendiente-abc'), true)
  assert.equal(esRutinaLoop('rutina-x'), false)
})

test('los horarios de las plantillas se dicen en palabras, también si los loops se apagan y quedan como rutinas', () => {
  assert.equal(cuandoRutina('0 18 * * 0-4'), 'De domingo a jueves a las 18:00')
  assert.equal(cuandoRutina('0 9,12,15,18 * * 1-5'), 'De lunes a viernes, 4 veces al día: 9:00, 12:00, 15:00 y 18:00')
  assert.equal(cuandoRutina('0 9 * * 1-5'), 'De lunes a viernes a las 9:00')
  assert.equal(cuandoRutina('0 9 * * 1,4'), 'Lunes y jueves a las 9:00')
})

test('la app del alumno abre /api/loops y /api/decisiones (la bandeja donde se decide la excepción)', () => {
  assert.equal(apiPermitidaEnCliente('/api/loops'), true)
  assert.equal(apiPermitidaEnCliente('/api/decisiones'), true)
})
