import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contieneFirmas, firmaDeTexto } from '../../src/features/chat/lib/lector-bloques'
import { lineaRegistroLector } from '../../src/features/chat/lib/lector-registro'

// 12 nov 2026, Daniel (09:10): «wtf pongo pausa y desaparece la línea de audio… me ha hecho perder el foco dos veces».
// lector.jsonl, 08:15–08:21: cinco «Escuchar» seguidos sobre la MISMA respuesta (la de Ogilvy de las 08:10, primer tramo
// de 95 caracteres), la única de la mañana con listas anidadas. Causa: cuando React vuelve a montar el mensaje (su id
// local `a-…` pasa al de la base), el lector lo buscaba comparando la firma de cada párrafo leído contra la de cada
// `p, li…` del nodo nuevo; la prosa propia de un `<li>` con sub-lista se lee envuelta en un <span data-lector-propio>
// que el nodo recién pintado no tiene, su firma no casaba, relocate() fallaba y AudioButton suspendía: la barra se iba
// en pausa o leyendo. Banco con el motor real: scripts/qa/lector-pausa (docs/builds/lector-pausa-desaparece-2026-11-12).

const fuente = (r: string) => readFileSync(new URL(`../../src/features/chat/${r}`, import.meta.url), 'utf8')

// El mensaje de las 08:10 tal como lo pinta react-markdown (texto de cada nodo; los \n son los que deja entre bloques).
const P1 = '**Tu plan.** Son tres capas, en este orden:'.replace(/\*\*/g, '')
const CAPA = 'Capa uno, la base:' // prosa propia del <li> que tiene una sub-lista
const SUB1 = 'Primer paso: instalar el cerebro y conectar el calendario antes de la primera llamada.'
const SUB2 = 'Segundo paso: escribir la oferta con precio, garantía y bonos.'
const CIERRE = 'Una sola observación, y la suelto. Lo siguiente es un caso real.'
const LI_CAPA = `${CAPA}\n${SUB1}\n${SUB2}\n` // textContent del <li> de la capa en el nodo NUEVO (sin el span)
const NODO_NUEVO = `${P1}\n${LI_CAPA}\n${CIERRE}`

// Lo que el lector leía (bloquesLegibles sobre el nodo viejo, con el span de la prosa propia).
const firmasLeidas = [P1, CAPA, SUB1, SUB2, CIERRE].map(firmaDeTexto)

test('el mensaje vuelto a montar se reconoce aunque tenga un <li> con sub-lista (antes la barra se iba)', () => {
  // La regla vieja: firma contra firma de cada p/li del nodo nuevo. La del <li> de la capa lleva su sub-lista pegada.
  const bloquesNuevos = [P1, LI_CAPA, SUB1, SUB2, CIERRE].map(firmaDeTexto)
  assert.equal(firmasLeidas.every((f) => bloquesNuevos.includes(f)), false, 'la regla vieja no reconocía el mensaje')
  // La nueva: cada firma es un tramo contiguo del texto del mensaje.
  assert.equal(contieneFirmas(firmasLeidas, NODO_NUEVO), true)
})

test('otro mensaje, o uno al que le falta un párrafo leído, no se confunde con el que se leía', () => {
  assert.equal(contieneFirmas(firmasLeidas, `${P1}\n${CIERRE}`), false)
  assert.equal(contieneFirmas(firmasLeidas, 'Hay dos argumentos en esas capturas, y uno tiene una trampa de traducción.'), false)
  assert.equal(contieneFirmas([], NODO_NUEVO), false) // sin firmas (una selección) nunca casa por texto
})

test('los espacios del render (saltos, sangrías) no cambian la firma', () => {
  assert.equal(contieneFirmas([firmaDeTexto('  Capa   uno,\n quién eres:  ')], `x\n  Capa uno,\n\n   quién eres:\n  y`), true)
})

test('pausar no cierra: pauseResume no llama stop ni suspend; desmontar el botón reubica antes de suspender', () => {
  const motor = fuente('lib/chat-speech.ts')
  const pausa = motor.slice(motor.indexOf('  pauseResume() {'), motor.indexOf('  prev() {'))
  assert.ok(pausa.length > 100)
  assert.doesNotMatch(pausa, /\b(stop|suspend)\(/)
  const boton = fuente('components/AudioButton.tsx')
  assert.match(boton, /chatSpeech\.reubicarOSuspender\(messageId\)/)
  assert.doesNotMatch(boton, /!chatSpeech\.relocate\(\)\) chatSpeech\.suspend\(\)/)
  // Reintenta: un mensaje que aún no termina de pintarse (markdown diferido) no se da por ido al primer intento.
  assert.match(motor, /REUBICAR_INTENTOS = \d+/)
  assert.match(motor, /contieneFirmas\(this\.firma, el\.textContent\)/)
})

test('cada cierre de la barra llega a lector.jsonl con su motivo y si estaba en pausa', () => {
  const linea = lineaRegistroLector({ tipo: 'cierre', motivo: 'mensaje-fuera', en_pausa: true, parrafo: 3, total: 7 }, 'Mac', new Date('2026-11-12T14:17:30Z'))
  assert.ok(linea)
  const fila = JSON.parse(linea!)
  assert.equal(fila.tipo, 'cierre')
  assert.equal(fila.motivo, 'mensaje-fuera')
  assert.equal(fila.en_pausa, true)
  const motor = fuente('lib/chat-speech.ts')
  assert.match(motor, /registrarLector\(\{ tipo: 'cierre', motivo, en_pausa: this\.paused/)
  assert.match(fuente('components/LectorPosicion.tsx'), /suspend\('otra-conversacion'\)/)
})
