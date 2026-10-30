import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { agruparInternas, separarProcesos, sinTitulo, tituloDe, tituloLimpio } from '../../src/features/cabina/internas-por-conversacion'
import type { EstadoInterna, TareaInterna } from '../../src/features/cabina/trabajos-modelo'

// «Hoy» de las pruebas: las terminadas del 1 oct cuentan; las del 30 sept no (sin depender del reloj ni de la zona).
const esHoy = (iso: string) => iso.startsWith('2026-10-01')
const a = (min: number) => `2026-10-01T${String(Math.floor(min / 60) + 12).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00.000Z`

let n = 0
function tarea(conversacion: string, estado: EstadoInterna, actualizado: string, extra: Partial<TareaInterna> = {}): TareaInterna {
  return { id: `t${++n}`, tipo: 'subagente', descripcion: `tarea ${n}`, estado, desde: actualizado, actualizado, conversacion, turno: 'turno-1', ...extra }
}

test('agrupa por conversación y cuenta por grupo y en total', () => {
  const r = agruparInternas([
    tarea('A', 'trabajando', a(10)), tarea('A', 'trabajando', a(12)), tarea('A', 'completada', a(5)),
    tarea('B', 'completada', a(20)), tarea('B', 'falló', a(21)), tarea('B', 'trabajando', a(1)),
  ], { esHoy })
  assert.deepEqual(r.grupos.map(g => g.conversacion).sort(), ['A', 'B'])
  const A = r.grupos.find(g => g.conversacion === 'A')!, B = r.grupos.find(g => g.conversacion === 'B')!
  assert.deepEqual([A.corriendo.length, A.terminadas.length, A.fallaron], [2, 1, 0])
  assert.deepEqual([B.corriendo.length, B.terminadas.length, B.fallaron], [1, 2, 1])
  assert.deepEqual([r.corriendo, r.terminadas, r.fallaron], [3, 3, 1], 'los totales suman los grupos')
})

test('la conversación abierta va primero aunque otra tenga actividad más reciente', () => {
  const r = agruparInternas([tarea('A', 'trabajando', a(5)), tarea('B', 'trabajando', a(50)), tarea('C', 'trabajando', a(30))], { activaId: 'A', esHoy })
  assert.deepEqual(r.grupos.map(g => g.conversacion), ['A', 'B', 'C'])
  assert.deepEqual(r.grupos.map(g => g.activa), [true, false, false])
})

test('sin conversación abierta (fuera de /chat) nadie es «Esta conversación» y se ordena por actividad', () => {
  const lista = [tarea('A', 'trabajando', a(5)), tarea('B', 'trabajando', a(50))]
  for (const activaId of [null, undefined, 'otra-que-no-tiene-tareas']) {
    const r = agruparInternas(lista, { activaId, esHoy })
    assert.deepEqual(r.grupos.map(g => g.conversacion), ['B', 'A'])
    assert.ok(r.grupos.every(g => !g.activa))
  }
})

test('sdk:<id> y <id> son la misma conversación para marcar la abierta', () => {
  assert.equal(agruparInternas([tarea('sdk:abc', 'trabajando', a(1))], { activaId: 'abc', esHoy }).grupos[0].activa, true)
  assert.equal(agruparInternas([tarea('abc', 'trabajando', a(1))], { activaId: 'sdk:abc', esHoy }).grupos[0].activa, true)
})

test('las demás: primero las que tienen algo corriendo, luego la actividad más reciente', () => {
  const r = agruparInternas([
    tarea('solo-terminadas-reciente', 'completada', a(90)),
    tarea('corre-vieja', 'trabajando', a(10)),
    tarea('corre-nueva', 'trabajando', a(40)),
    tarea('solo-terminadas-vieja', 'completada', a(20)),
  ], { esHoy })
  assert.deepEqual(r.grupos.map(g => g.conversacion), ['corre-nueva', 'corre-vieja', 'solo-terminadas-reciente', 'solo-terminadas-vieja'])
  assert.deepEqual(r.grupos.map(g => g.corriendo.length === 0), [false, false, true, true], 'las que solo tienen terminadas son las plegables')
})

test('dentro de un grupo: corriendo, falló, detenida y terminada; a igualdad lo más reciente primero', () => {
  const r = agruparInternas([
    tarea('A', 'completada', a(30), { descripcion: 'ok-nueva' }), tarea('A', 'falló', a(10), { descripcion: 'fallo' }),
    tarea('A', 'detenida', a(20), { descripcion: 'detenida' }), tarea('A', 'completada', a(5), { descripcion: 'ok-vieja' }),
    tarea('A', 'trabajando', a(1), { descripcion: 'corre-vieja' }), tarea('A', 'trabajando', a(2), { descripcion: 'corre-nueva' }),
  ], { esHoy })
  const [g] = r.grupos
  assert.deepEqual(g.corriendo.map(t => t.descripcion), ['corre-nueva', 'corre-vieja'])
  assert.deepEqual(g.terminadas.map(t => t.descripcion), ['fallo', 'detenida', 'ok-nueva', 'ok-vieja'])
})

test('lo terminado de otro día no cuenta y una conversación sin nada de hoy ni corriendo desaparece', () => {
  const r = agruparInternas([
    tarea('vieja', 'completada', '2026-09-30T18:00:00.000Z'), tarea('vieja', 'falló', '2026-09-30T19:00:00.000Z'),
    tarea('mixta', 'completada', '2026-09-30T18:00:00.000Z'), tarea('mixta', 'completada', a(3)),
    // Lo que corre cuenta aunque su última señal sea vieja: sigue corriendo.
    tarea('larga', 'trabajando', '2026-09-30T08:00:00.000Z'),
  ], { esHoy })
  assert.deepEqual(r.grupos.map(g => g.conversacion).sort(), ['larga', 'mixta'])
  assert.equal(r.grupos.find(g => g.conversacion === 'mixta')!.terminadas.length, 1)
  assert.deepEqual([r.corriendo, r.terminadas, r.fallaron], [1, 1, 0])
})

test('sin tareas no hay grupos', () => {
  assert.deepEqual(agruparInternas([], { esHoy }), { grupos: [], corriendo: 0, terminadas: 0, fallaron: 0 })
})

test('una tarea sin conversación (registro viejo) no se pierde: queda en un grupo sin id', () => {
  const sin = { ...tarea('x', 'trabajando', a(1)), conversacion: undefined as unknown as string }
  const r = agruparInternas([sin, tarea('A', 'trabajando', a(2))], { activaId: 'A', esHoy })
  assert.deepEqual(r.grupos.map(g => g.conversacion), ['A', ''])
  assert.equal(r.grupos[1].activa, false)
  assert.equal(r.corriendo, 2)
})

test('no modifica la lista que recibe', () => {
  const lista = [tarea('A', 'completada', a(1)), tarea('A', 'trabajando', a(2))]
  const copia = lista.map(t => t.id)
  agruparInternas(lista, { esHoy })
  assert.deepEqual(lista.map(t => t.id), copia)
})

test('título: busca en todas las listas, por id, por sdk: y por sdkSessionId', () => {
  const traidas = [{ id: 'uno', title: 'Primera' }, { id: 'sdk:dos', title: 'Segunda' }]
  const fijadas = [{ id: 'tres', title: 'Tercera', sdkSessionId: 'sdk-real' }]
  assert.equal(tituloDe('uno', [[], traidas, fijadas]), 'Primera')
  assert.equal(tituloDe('dos', [traidas]), 'Segunda')
  assert.equal(tituloDe('sdk:uno', [traidas]), 'Primera')
  assert.equal(tituloDe('sdk-real', [traidas, fijadas]), 'Tercera')
  assert.equal(tituloDe('desconocida', [traidas, fijadas]), null)
  assert.equal(tituloDe('', [traidas]), null)
})

test('título: la publicada gana si viene antes y un título vacío cae a la siguiente lista', () => {
  assert.equal(tituloDe('x', [[{ id: 'x', title: 'En vivo' }], [{ id: 'x', title: 'Vieja' }]]), 'En vivo')
  assert.equal(tituloDe('x', [[{ id: 'x', title: '   ' }], [{ id: 'x', title: 'Vieja' }]]), 'Vieja')
})

test('título: quita los adjuntos de texto pegados al mensaje y los saltos de línea', () => {
  const crudo = 'Revisa  este\nplan\n\n[Archivo de texto adjunto · arbrain/v1 {"name":"a.txt","characters":5}]\nhola\n[Fin del archivo de texto adjunto]'
  assert.equal(tituloLimpio(crudo), 'Revisa este plan')
  assert.equal(tituloLimpio('[Archivo de texto adjunto · arbrain/v1 {"name":"a.txt","characters":5}]\nhola\n[Fin del archivo de texto adjunto]'), 'Texto adjunto')
  assert.equal(tituloLimpio(null), null)
  assert.equal(tituloLimpio('  '), null)
})

test('sin título: «Otra conversación» con el inicio del id para distinguirlas', () => {
  assert.equal(sinTitulo('3f2a1b9c-aaaa'), 'Otra conversación · 3f2a1b')
  assert.equal(sinTitulo('sdk:3f2a1b9c'), 'Otra conversación · 3f2a1b')
  assert.equal(sinTitulo(''), 'Otra conversación')
})

test('separa agentes de procesos y cuelga cada comando de su agente padre si sigue corriendo', () => {
  const ag = tarea('A', 'trabajando', a(1), { id: 'ag' })
  const hijo = tarea('A', 'trabajando', a(2), { tipo: 'comando', padre: 'ag' })
  const deLevy = tarea('A', 'trabajando', a(3), { tipo: 'comando' })
  const huerfano = tarea('A', 'trabajando', a(4), { tipo: 'comando', padre: 'ya-termino' })
  const r = separarProcesos([ag, hijo, deLevy, huerfano])
  assert.deepEqual(r.agentes.map(t => t.id), ['ag'])
  assert.deepEqual(r.procesosDe.get('ag')?.map(t => t.id), [hijo.id])
  assert.deepEqual(r.sueltos.map(t => t.id), [deLevy.id, huerfano.id])
  assert.equal(r.procesos, 3)
})
