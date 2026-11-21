// Cuartel de YouTube · CEREBRO (15 nov 2026): lo que la pantalla puede pedirle al algoritmo. Fija dos cosas: nada llega
// al proceso sin validar, y el voto no puede llevar tiempo visto (el algoritmo aprende de «me sirvió», no de la retención).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jsonDeSalida, pedidoIdeas, pedidoPreguntar, pedidoVoto } from '../../src/lib/cuartel/cerebro-pedidos'

const args = (p: ReturnType<typeof pedidoVoto>) => ('args' in p ? p.args : null)
const error = (p: ReturnType<typeof pedidoVoto>) => ('error' in p ? p.error : null)

test('el voto solo lleva video, voto, desde y nota; el tiempo visto se cae', () => {
  const p = pedidoVoto({ video_id: 'BMbg9SvJuc8', voto: 'sirvio', desde: 'radar', nota: '  buena plantilla  ', segundos_vistos: 1800, watch_time: 99 })
  assert.deepEqual(args(p), ['voto', '--video=BMbg9SvJuc8', '--voto=sirvio', '--desde=radar', '--nota=buena plantilla'])
  assert.deepEqual(args(pedidoVoto({ video_id: 'BMbg9SvJuc8', voto: 'saltado', desde: 'otro' })), ['voto', '--video=BMbg9SvJuc8', '--voto=saltado', '--desde=dosis'])
  // PULSO: el feed Inicio vota como «inicio» (enseña preferencias aunque el video aún no se lea completo)
  assert.deepEqual(args(pedidoVoto({ video_id: 'BMbg9SvJuc8', voto: 'no_sirvio', desde: 'inicio' })), ['voto', '--video=BMbg9SvJuc8', '--voto=no_sirvio', '--desde=inicio'])
})

test('rechaza votos y videos que no son', () => {
  assert.match(error(pedidoVoto({ video_id: 'BMbg9SvJuc8', voto: 'me_encanto' }))!, /voto/)
  // un id que empieza con guion es válido en YouTube: viaja pegado a su bandera y nunca se lee como opción
  assert.deepEqual(args(pedidoVoto({ video_id: '-modelo_x12', voto: 'sirvio' }))!.slice(0, 2), ['voto', '--video=-modelo_x12'])
  assert.match(error(pedidoVoto({ video_id: 'a; rm -rf ~', voto: 'sirvio' }))!, /Video/)
  assert.match(error(pedidoVoto(null))!, /Video/)
})

test('pregúntale al video: pregunta obligatoria, historial acotado a cuatro turnos', () => {
  assert.match(error(pedidoPreguntar({ video_id: 'BMbg9SvJuc8', pregunta: '   ' }))!, /pregunta/)
  const historial = Array.from({ length: 9 }, (_, i) => ({ pregunta: `p${i}`, respuesta: `r${i}` }))
  const a = args(pedidoPreguntar({ video_id: 'BMbg9SvJuc8', pregunta: '¿cómo cobra el piloto?', historial: [...historial, { pregunta: 1 }, null] }))!
  assert.deepEqual(a.slice(0, 3), ['preguntar', '--video=BMbg9SvJuc8', '--pregunta=¿cómo cobra el piloto?'])
  assert.deepEqual(JSON.parse(a[3].slice('--historial='.length)).map((h: { pregunta: string }) => h.pregunta), ['p5', 'p6', 'p7', 'p8'])
  assert.equal(args(pedidoPreguntar({ video_id: 'BMbg9SvJuc8', pregunta: 'x'.repeat(5000) }))![2].length, '--pregunta='.length + 1500)
  assert.equal(args(pedidoPreguntar({ video_id: 'BMbg9SvJuc8', pregunta: 'hola' }))!.length, 3)
})

test('ideas: generar desde un video o mover de estado', () => {
  assert.deepEqual(args(pedidoIdeas({ accion: 'generar', video_id: '1fBhLGhQQ2M' })), ['ideas', '--video=1fBhLGhQQ2M'])
  assert.deepEqual(args(pedidoIdeas({ accion: 'estado', id: 'idea-20261115-1fBhLGhQQ2M', estado: 'aplicada' })), ['ideas', '--estado', 'idea-20261115-1fBhLGhQQ2M', 'aplicada'])
  assert.match(error(pedidoIdeas({ accion: 'estado', id: 'idea-20261115-1fBhLGhQQ2M', estado: 'publicada' }))!, /estado/)
  assert.match(error(pedidoIdeas({ accion: 'estado', id: '../../x', estado: 'aplicada' }))!, /Idea/)
  assert.match(error(pedidoIdeas({ accion: 'borrar' }))!, /acción/)
})

test('lee el JSON final aunque antes haya renglones de avance', () => {
  assert.deepEqual(jsonDeSalida('  leído · Canal · Título {raro}\n{\n "leidos": 1\n}\n'), { leidos: 1 })
  assert.deepEqual(jsonDeSalida('{"a": {"b": 2}}'), { a: { b: 2 } })
  assert.throws(() => jsonDeSalida('nada que leer'))
})
