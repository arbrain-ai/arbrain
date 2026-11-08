import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarraDelLector } from '../../src/features/chat/components/ChatSpeechBar'
import type { SpeechState } from '../../src/features/chat/lib/chat-speech'
import { Seguimiento } from '../../src/features/chat/lib/seguimiento'

// 5 nov 2026, Daniel desde el iPhone: «ya no puedo seleccionar el texto para play donde yo quiero». Medido en Safari del
// simulador de iPhone con el motor y la barra reales (scripts/qa/arnes-wkwebview/toque-ios): el dedo sobre un párrafo
// suelta el seguimiento («la mano manda», 4 nov) y en ese mismo pointerdown la barra pintaba «Seguir». El WebKit de iOS
// toma lo que se vuelve visible durante el toque como respuesta tipo hover y NO entrega el clic: un toque sí y uno no, el
// lector seguía donde iba. Regla: tocar el texto no cambia nada de lo que se ve hasta que llega el clic.

const activo: SpeechState = { active: true, id: 'm1', paused: false, rate: 1, idx: 2, total: 9, despierto: true, resumen: false, siguiendo: true }
const barra = (s: Partial<SpeechState>) => renderToStaticMarkup(createElement(BarraDelLector, { state: { ...activo, ...s }, avisoGroq: false }))

test('la mano suelta el seguimiento y la barra del chat se pinta igual (nada aparece bajo el dedo)', () => {
  assert.equal(barra({ siguiendo: false }), barra({ siguiendo: true }))
  assert.equal(barra({ siguiendo: false, paused: true }), barra({ siguiendo: true, paused: true }))
})

test('sin botón «Seguir» en la barra del chat ni en la del documento', () => {
  assert.doesNotMatch(barra({ siguiendo: false }), /data-lector-seguir|Seguir/)
  const doc = readFileSync(new URL('../../src/features/cabina/panel/EscucharDocumento.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(doc, /data-lector-seguir|LocateFixed|\.seguir\(/)
})

test('el toque en un párrafo, aunque la mano haya movido el hilo, devuelve el scroll al lector', () => {
  const s = new Seguimiento()
  s.mano() // el pointerdown del mismo dedo
  s.retomar() // el clic: jumpTo lee desde ese párrafo
  assert.equal(s.lleva, true)
  assert.equal(s.decidir(false), 'mover')
})
