import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { filasInyectadas, leerDesenlace, notaDelHost, plegarInyectadas, puedeInyectar, trasTerminar, ubicarNotas, unirNotas, type NotaInyectada } from '../../src/features/chat/lib/inyecciones'
import type { ChatMessage } from '../../src/features/chat/hooks/useChat'

// Inyección a mitad de turno (7 oct 2026): Daniel escribe con Levy trabajando y el mensaje entra al turno
// en curso, pintado dentro de su actividad. Estas son las reglas puras que usan useChat y ChatPanel.

const nota = (id: string, estado: NotaInyectada['estado'], extra: Partial<NotaInyectada> = {}): NotaInyectada => ({ id, texto: id, estado, at: 1, ...extra })

test('unirNotas: un estado nunca retrocede (un replay viejo no deshace «leído») y se ordena por llegada', () => {
  const leida = unirNotas([], [nota('a', 'leido', { afterToolId: 't2', at: 5 })])
  const tras = unirNotas(leida, [nota('a', 'entrando', { at: 5 }), nota('b', 'enviando', { at: 2 })])
  assert.deepEqual(tras.map(n => [n.id, n.estado]), [['b', 'enviando'], ['a', 'leido']])
  assert.equal(tras.find(n => n.id === 'a')?.afterToolId, 't2')
  // enviando → entrando → leído avanza
  assert.equal(unirNotas([nota('c', 'enviando')], [nota('c', 'entrando')])[0].estado, 'entrando')
})

test('notaDelHost: pending = entrando, sent = leído; unread y requeued no se pintan dentro del turno', () => {
  const base = { message: 'hola', afterToolId: 'tool-1', at: 9 }
  assert.deepEqual(notaDelHost({ injectionId: 'x', status: 'pending', ...base }), { id: 'x', texto: 'hola', estado: 'entrando', afterToolId: 'tool-1', at: 9 })
  assert.equal(notaDelHost({ injectionId: 'x', status: 'sent', ...base })?.estado, 'leido')
  assert.equal(notaDelHost({ injectionId: 'x', status: 'unread', ...base }), null)
  assert.equal(notaDelHost({ injectionId: 'x', status: 'requeued', ...base }), null)
})

test('leerDesenlace: inyectado, aceptado como turno normal o rechazado (fallback a la fila del dispositivo)', () => {
  assert.deepEqual(leerDesenlace(202, { accepted: true, injected: true, turnId: 'n', into: 'vivo', status: 'pending' }), { tipo: 'inyectado', into: 'vivo' })
  assert.deepEqual(leerDesenlace(202, { accepted: true, turnId: 'n', status: 'queued' }), { tipo: 'en_fila_servidor', turnId: 'n' })
  assert.equal(leerDesenlace(409, { error: 'Turn conflict' }).tipo, 'rechazado')
  assert.equal(leerDesenlace(503, null).tipo, 'rechazado')
})

test('puedeInyectar: solo Claude, en línea, texto, sin editar, con turno vivo y conversación', () => {
  const ok = { enLinea: true, motorCodex: false, conAdjuntos: false, esComando: false, editando: false, turnoVivo: true, conversacion: 'c' }
  assert.equal(puedeInyectar(ok), true)
  for (const cambio of [{ enLinea: false }, { motorCodex: true }, { conAdjuntos: true }, { esComando: true }, { editando: true }, { turnoVivo: false }, { conversacion: null }]) {
    assert.equal(puedeInyectar({ ...ok, ...cambio }), false, JSON.stringify(cambio))
  }
})

test('trasTerminar: lo leído se queda en el turno; lo que no entró se va a su propio turno', () => {
  const { quedan, aSuTurno } = trasTerminar([nota('a', 'leido'), nota('b', 'entrando'), nota('c', 'en_fila')])
  assert.deepEqual(quedan.map(n => n.id), ['a'])
  assert.deepEqual(aSuTurno.map(n => n.id), ['b', 'c'])
})

test('ubicarNotas: tras su herramienta si está a la vista; si no (o sin herramienta), al final de la actividad', () => {
  const { tras, alFinal } = ubicarNotas([nota('a', 'leido', { afterToolId: 't1' }), nota('b', 'leido', { afterToolId: 'oculta' }), nota('c', 'entrando')], ['t1', 't2'])
  assert.deepEqual(tras.get('t1')?.map(n => n.id), ['a'])
  assert.deepEqual(alFinal.map(n => n.id), ['b', 'c'])
})

const msg = (id: string, role: 'user' | 'assistant', extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role, content: id, timestamp: new Date(1_000), ...extra })

test('plegarInyectadas: la fila guardada de Daniel se pinta dentro de la respuesta de su turno, sin duplicar la nota en memoria', () => {
  const hilo = [
    msg('u1', 'user', { metadata: { turnId: 'T' } }),
    msg('iny', 'user', { content: 'y esto', timestamp: new Date(2_000), metadata: { turnId: 'I', injectedInto: 'T', afterToolId: 'tool-1' } }),
    msg('a1', 'assistant', { metadata: { turnId: 'T' }, inyectados: [nota('I', 'leido', { texto: 'y esto', at: 2_000 })] }),
  ]
  const plegado = plegarInyectadas(hilo)
  assert.deepEqual(plegado.map(m => m.id), ['u1', 'a1'])
  assert.equal(plegado[1].inyectados?.length, 1)
  assert.equal(plegado[1].inyectados?.[0].afterToolId, 'tool-1')
  // Sin la respuesta del turno a la vista, la fila queda como burbuja normal (no se esconde nada).
  assert.deepEqual(plegarInyectadas(hilo.slice(0, 2)).map(m => m.id), ['u1', 'iny'])
  // Sin inyecciones, el mismo arreglo (sin trabajo extra en cada render).
  const limpio = [msg('u', 'user'), msg('a', 'assistant')]
  assert.equal(plegarInyectadas(limpio), limpio)
})

test('filasInyectadas: una fila de Daniel por inyección leída, con su turnId, injectedInto y la hora en que entró', () => {
  const ahora = 1_800_000_000_000
  const filas = filasInyectadas([
    { turnId: 'I1', message: 'uno', sentAt: ahora - 5_000, afterToolId: 't1' },
    { turnId: 'I2', message: '   ' },
    { turnId: '', message: 'sin id' },
    { turnId: 'I3', message: 'tres', sentAt: 12 },
  ], 'sesion', 'T', ahora)
  assert.equal(filas.length, 2)
  assert.deepEqual(filas[0].metadata, { turnId: 'I1', injectedInto: 'T', afterToolId: 't1', startedAt: ahora - 5_000 })
  assert.equal(filas[0].created_at, new Date(ahora - 5_000).toISOString())
  assert.equal(filas[0].role, 'user')
  // Hora inverosímil: se ignora y manda el created_at de la base.
  assert.equal('created_at' in filas[1], false)
  assert.deepEqual(filasInyectadas(null, 's', 'T'), [])
})
