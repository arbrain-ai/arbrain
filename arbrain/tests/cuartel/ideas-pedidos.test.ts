// Cuartel de YouTube · banco de ideas v2 (15 nov 2026): lo que la pestaña Ideas puede pedir. Fija que nada llega al proceso
// sin validar, que «a mi backlog» y la firma de «Tu tipo de contenido» solo aceptan lo que deben, y a qué script va cada cosa.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pedidoBanco, PEDIDO_BANCO } from '../../src/lib/cuartel/ideas-pedidos'

const ok = (p: ReturnType<typeof pedidoBanco>) => ('args' in p ? [p.guion, ...p.args] : null)
const error = (p: ReturnType<typeof pedidoBanco>) => ('error' in p ? p.error : null)
const ID = 'idea-20261115-1fBhLGhQQ2M'

test('leer el banco y generar desde un video van cada uno a su script', () => {
  assert.deepEqual(ok(PEDIDO_BANCO), ['ideas', 'banco'])
  assert.deepEqual(ok(pedidoBanco({ accion: 'generar', video_id: '1fBhLGhQQ2M' })), ['cerebro', 'ideas', '--video=1fBhLGhQQ2M'])
  assert.match(error(pedidoBanco({ accion: 'generar', video_id: 'a; ls -la ~' }))!, /Video/)
})

test('las tres decisiones: a mi backlog (con el título elegido), guardar y fuera (con su motivo)', () => {
  assert.deepEqual(ok(pedidoBanco({ accion: 'backlog', id: ID, titulo: 2 })), ['ideas', 'backlog', ID, '--titulo=2'])
  assert.deepEqual(ok(pedidoBanco({ accion: 'backlog', id: ID })), ['ideas', 'backlog', ID])
  assert.match(error(pedidoBanco({ accion: 'backlog', id: ID, titulo: '2; ls' }))!, /Título/)
  assert.match(error(pedidoBanco({ accion: 'backlog', id: '../../x' }))!, /Idea/)
  assert.deepEqual(ok(pedidoBanco({ accion: 'estado', id: ID, estado: 'guardada' })), ['ideas', 'estado', ID, 'guardada'])
  assert.deepEqual(ok(pedidoBanco({ accion: 'estado', id: ID, estado: 'descartada', motivo: 'no_es_mi_nicho' })), ['ideas', 'estado', ID, 'descartada', '--motivo=no_es_mi_nicho'])
  // un motivo que no existe, o en un estado que no es «fuera», se cae
  assert.deepEqual(ok(pedidoBanco({ accion: 'estado', id: ID, estado: 'descartada', motivo: '--x' })), ['ideas', 'estado', ID, 'descartada'])
  assert.deepEqual(ok(pedidoBanco({ accion: 'estado', id: ID, estado: 'nueva', motivo: 'ya_lo_hice' })), ['ideas', 'estado', ID, 'nueva'])
  assert.match(error(pedidoBanco({ accion: 'estado', id: ID, estado: 'publicada' }))!, /estado/)
})

test('la firma de «Tu tipo de contenido»: sí, ajustar (con nota) o no; nada más', () => {
  assert.deepEqual(ok(pedidoBanco({ accion: 'firmar', decision: 'si' })), ['ideas', 'firmar', 'si'])
  assert.deepEqual(ok(pedidoBanco({ accion: 'firmar', decision: 'ajustar', nota: '  más operar un negocio real  ' })), ['ideas', 'firmar', 'ajustar', '--nota=más operar un negocio real'])
  assert.match(error(pedidoBanco({ accion: 'firmar', decision: 'ajustar', nota: '   ' }))!, /qué cambiar/)
  assert.match(error(pedidoBanco({ accion: 'firmar', decision: 'firmada' }))!, /decisión/)
  assert.equal(ok(pedidoBanco({ accion: 'firmar', decision: 'no', nota: 'x'.repeat(2000) }))![3].length, '--nota='.length + 600)
  // una nota que empieza con guiones viaja pegada a su bandera: nunca se lee como opción
  assert.deepEqual(ok(pedidoBanco({ accion: 'firmar', decision: 'no', nota: '--rehacer' })), ['ideas', 'firmar', 'no', '--nota=--rehacer'])
})

test('rehacer la hipótesis y pedir más ideas; cualquier otra acción se rechaza', () => {
  assert.deepEqual(ok(pedidoBanco({ accion: 'tipo' })), ['ideas', 'tipo'])
  assert.deepEqual(ok(pedidoBanco({ accion: 'tipo', rehacer: true })), ['ideas', 'tipo', '--rehacer'])
  assert.deepEqual(ok(pedidoBanco({ accion: 'refrescar', n: 99 })), ['ideas', 'refrescar'])
  assert.match(error(pedidoBanco({ accion: 'borrar' }))!, /acción/)
  assert.match(error(pedidoBanco(null))!, /acción/)
})

test('«+ Idea»: la suya en una línea (escrita o dictada) y sus títulos; vacía o enorme se rechaza', () => {
  assert.deepEqual(ok(pedidoBanco({ accion: 'tuya', texto: '  ¿Quién quieres ser\n en un mundo donde la IA automatiza todo?  ' })), ['ideas', 'tuya', '--texto=¿Quién quieres ser en un mundo donde la IA automatiza todo?'])
  // un texto que empieza con guiones viaja pegado a su bandera
  assert.deepEqual(ok(pedidoBanco({ accion: 'tuya', texto: '--fuente=todoist' })), ['ideas', 'tuya', '--texto=--fuente=todoist'])
  assert.match(error(pedidoBanco({ accion: 'tuya', texto: '   ' }))!, /Escribe/)
  assert.match(error(pedidoBanco({ accion: 'tuya', texto: 'x'.repeat(601) }))!, /600/)
  assert.deepEqual(ok(pedidoBanco({ accion: 'titular', id: ID })), ['ideas', 'titular', ID])
  assert.match(error(pedidoBanco({ accion: 'titular', id: '../x' }))!, /Idea/)
})
