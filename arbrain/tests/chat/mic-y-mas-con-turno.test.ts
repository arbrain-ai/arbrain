// Mic y «+» mientras Levy trabaja: el micrófono va siempre (y montado, para no cortar una grabación si arranca un turno
// o se escribe) junto al botón de detener o enviar, y el «+» no se deshabilita durante la respuesta. Lo que se manda
// entra al turno en curso o a la fila. Detrás de Ajustes › Mejoras › «Micrófono y + mientras trabaja»: apagada, el «+»
// espera y el micrófono solo sale cuando no hay detener ni enviar (como antes).
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(__dirname, '..', '..', 'src/features/chat/components/ChatPanel.tsx'), 'utf8')

test('lee su interruptor en Ajustes › Mejoras', () => {
  assert.match(src, /const micConTurno = useMejora\('mic-con-turno'\)/)
})

test('prendida: el «+» no se deshabilita con Levy trabajando; apagada: sí, como antes', () => {
  const menu = src.slice(src.indexOf('<MenuAdjuntar'), src.indexOf('/>', src.indexOf('<MenuAdjuntar')))
  assert.match(menu, /disabled=\{\(loading && !micConTurno\) \|\| loadingSession \|\| uploadingImage\}/)
})

test('prendida: el micrófono va antes del botón de detener o enviar', () => {
  const accion = src.slice(src.indexOf('composerUI.action'))
  const mic = accion.indexOf('{micConTurno && microfono}')
  const detener = accion.indexOf("boton === 'detener' ?")
  assert.ok(mic > 0 && detener > 0 && mic < detener, 'el micrófono se pinta primero')
  assert.match(src, /etiqueta=\{micConTurno && loading \? trMarca\('Dictar: entra a la fila mientras Levy trabaja'\)/)
})

test('apagada: el micrófono es la alternativa al final, como antes', () => {
  const accion = src.slice(src.indexOf('composerUI.action'))
  assert.match(accion, /<ArrowUp[\s\S]{0,120}\) : micConTurno \? null : microfono\}/)
})

test('lo dictado con un turno vivo entra al turno o a la fila', () => {
  const nota = src.slice(src.indexOf('const handleVoiceNote'), src.indexOf('const handleVoiceNote') + 900)
  assert.match(nota, /cola\.encolar\(nota\)/)
  assert.match(nota, /inyectar\(nota\)/)
})
