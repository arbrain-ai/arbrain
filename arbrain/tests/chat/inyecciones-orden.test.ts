import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  anclaDe, CIERRA_NOTAS, cerrarNotas, etiquetaVisible, filasInyectadas, partirEnNotas, plegarInyectadas, unirNotas, ubicarEnTexto,
  type NotaInyectada,
} from '../../src/features/chat/lib/inyecciones'
import type { ChatMessage } from '../../src/features/chat/hooks/useChat'

/**
 * El orden del hilo con un mensaje escrito mientras Levy responde (captura del 1 nov 2026, 08:13). El dueño escribió a
 * media respuesta; la web pintaba su mensaje ARRIBA de todo el texto, encima de lo que Levy ya había escrito antes de
 * leerlo, con «Escribiendo la respuesta» arriba de ambos. Bitácora real del turno: texto 08:13:10–19, user_injected
 * 08:13:15 (a media frase), init 08:13:19 (el motor lo toma), herramientas y el resto del texto 08:14:01.
 * Orden correcto: lo que Levy escribió antes de leerlo → el mensaje → lo que escribió después.
 */
const PRIMERO = '**Fulano de Tal.** Ingeniero con quince años de oficio.\n\n- Ingreso hoy: dos clientes.\n- Qué quiere: libertad.'
const SEGUNDO = 'Sí me acuerdo. Lo de la fila sigue en curso; te aviso al terminar.'
const FINAL = `${PRIMERO}\n\n${SEGUNDO}`   // el `result` del motor une los tramos con un renglón en blanco

/** Lo mismo que hace `useChat` con cada evento del stream, con las mismas funciones de la librería. */
function reproducir(eventos: Array<{ type: string; text?: string; injectionId?: string; message?: string }>) {
  let texto = '', notas: NotaInyectada[] = [], abiertas = false, fin = false
  for (const e of eventos) {
    if (abiertas && CIERRA_NOTAS.has(e.type)) { abiertas = false; notas = cerrarNotas(notas, texto) }
    if (e.type === 'text_delta') texto += e.text ?? ''
    if (e.type === 'user_injected') {
      abiertas = true
      notas = unirNotas(notas, [{ id: e.injectionId!, texto: e.message!, estado: 'leido', at: 1, trasTexto: texto.length, ancla: anclaDe(texto), abierta: true }])
    }
    if (e.type === 'result') { texto = (e.text || texto).trim(); fin = true }
  }
  return { texto, notas, vivo: !fin }
}
const orden = (p: ReturnType<typeof partirEnNotas>) => p.tramos.flatMap(t => [...(t.texto ? [`texto:${t.texto.slice(0, 8)}`] : []), ...t.notas.map(n => `nota:${n.id}`)])

const ANTES = [
  { type: 'init' }, { type: 'tool_start' }, { type: 'tool_result' },
  { type: 'text_delta', text: PRIMERO.slice(0, 30) },
  { type: 'user_injected', injectionId: 'nota', message: 'pregunta aparte' },
  { type: 'text_delta', text: PRIMERO.slice(30) },
]

test('en vivo, recién tomada a media frase: el mensaje va DEBAJO de lo que Levy ya escribió, nunca arriba', () => {
  const r = reproducir(ANTES)
  const p = partirEnNotas(r.texto, r.notas, r.vivo)
  assert.deepEqual(p.arriba, [])
  assert.deepEqual(orden(p), ['texto:**Fulano', 'nota:nota'])
})

test('en vivo, después de que el motor lo toma: texto anterior → mensaje → lo que Levy escribe después', () => {
  const r = reproducir([...ANTES, { type: 'init' }, { type: 'tool_start' }, { type: 'tool_result' }, { type: 'text_delta', text: SEGUNDO }])
  const p = partirEnNotas(r.texto, r.notas, r.vivo)
  assert.deepEqual(orden(p), ['texto:**Fulano', 'nota:nota', 'texto:Sí me ac'])
  assert.equal(p.tramos[0].texto, PRIMERO, 'el primer tramo es entero lo que escribió antes de leerlo')
})

test('al terminar (el texto final trae separadores que el vivo no tenía) el orden se sostiene', () => {
  const r = reproducir([...ANTES, { type: 'init' }, { type: 'text_delta', text: SEGUNDO }, { type: 'result', text: FINAL }])
  const p = partirEnNotas(r.texto, r.notas, false)
  assert.deepEqual(orden(p), ['texto:**Fulano', 'nota:nota', 'texto:Sí me ac'])
  assert.equal(p.tramos[0].texto, PRIMERO)
  assert.equal(p.tramos.at(-1)!.texto, SEGUNDO)
})

test('al recargar (fila guardada por el servidor con su lugar) se pinta igual que en vivo', () => {
  const filas = filasInyectadas([{ turnId: 'nota', message: 'pregunta aparte', sentAt: Date.now() - 1_000, trasTexto: PRIMERO.length, ancla: anclaDe(PRIMERO) }], 'hilo', 'T')
  assert.equal(filas[0].metadata.trasTexto, PRIMERO.length)
  const msg = (id: string, role: 'user' | 'assistant', extra: Partial<ChatMessage>): ChatMessage => ({ id, role, content: '', timestamp: new Date(1_000), ...extra })
  const plegado = plegarInyectadas([
    msg('u', 'user', { content: 'recuérdame el perfil', metadata: { turnId: 'T' } }),
    msg('a', 'assistant', { content: FINAL, timestamp: new Date(3_000), metadata: { turnId: 'T' } }),
    msg('n', 'user', { content: 'pregunta aparte', timestamp: new Date(2_000), metadata: filas[0].metadata as ChatMessage['metadata'] }),
  ])
  assert.equal(plegado.length, 2, 'la fila inyectada se pliega dentro de la respuesta')
  const p = partirEnNotas(plegado[1].content, plegado[1].inyectados, false)
  assert.deepEqual(orden(p), ['texto:**Fulano', 'nota:nota', 'texto:Sí me ac'])
})

test('filas guardadas antes del arreglo (sin lugar) se pintan como siempre, arriba de la respuesta', () => {
  const p = partirEnNotas(FINAL, [{ id: 'vieja', texto: 'x', estado: 'leido', at: 1 }], false)
  assert.deepEqual(p.arriba.map(n => n.id), ['vieja'])
  assert.deepEqual(orden(p), ['texto:**Fulano'])
})

test('sin ancla que lo confirme, un lugar a media línea se corre al final de esa línea (nunca parte una frase)', () => {
  const texto = 'Primera línea completa.\nSegunda.'
  assert.equal(ubicarEnTexto(texto, 8, null), 'Primera línea completa.'.length)
  assert.equal(ubicarEnTexto(texto, 999, null), texto.length)
  // Con el ancla repetida, gana la ocurrencia más cercana al número.
  assert.equal(ubicarEnTexto('ok. ok. ok.', 7, 'ok.'), 7)
})

test('«leído» ya no se escribe en la burbuja; lo pendiente sí se dice', () => {
  assert.equal(etiquetaVisible('leido'), null)
  assert.equal(etiquetaVisible('enviando'), 'enviando…')
  assert.equal(etiquetaVisible('entrando'), 'entrando…')
  assert.match(etiquetaVisible('en_fila') ?? '', /en fila/)
})

test('un replay no reabre un lugar ya cerrado', () => {
  const cerrada: NotaInyectada = { id: 'a', texto: 'a', estado: 'leido', at: 1, trasTexto: 40, ancla: 'x', abierta: false }
  const replay: NotaInyectada = { id: 'a', texto: 'a', estado: 'leido', at: 1, trasTexto: 10, ancla: 'y', abierta: true }
  assert.deepEqual(unirNotas([cerrada], [replay])[0], { ...cerrada, afterToolId: null })
})
