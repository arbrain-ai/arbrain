// Teléfono en horizontal (8 nov 2026, Daniel: «el mucho espacio debajo de la input bar y el duplicado del header»).
// Un iPhone girado mide ≥ 768 px de ancho: lo que el CSS decide con `min-width: 768px` / `md:` creía que era escritorio, mientras el
// shell (CONSULTA_TELEFONO: táctil con alto ≤ 600) pintaba el Header de teléfono. Resultado: cabecera doble y el campo del chat
// subido 30vh. Estas pruebas atan los dos arreglos al mismo criterio de teléfono.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONSULTA_TELEFONO } from '../../src/shared/hooks/useMediaQuery'

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8')
const css = leer('src/app/globals.css')
const chat = leer('src/features/chat/components/ChatPanel.tsx')

test('la cabecera interna del chat se apaga con el criterio de teléfono del shell', () => {
  const linea = chat.split('\n').find(l => l.includes('data-cabecera-chat'))
  assert.ok(linea, 'no se encontró la cabecera interna del chat')
  assert.match(linea!, /\bsolo-escritorio\b/)
  // Y esa clase se apaga con la misma consulta que usa el shell para pintar el Header de teléfono.
  const bloque = css.match(/@media ([^{]+)\{\s*\.solo-escritorio \{ display: none !important; \}/)
  assert.ok(bloque, 'falta la regla .solo-escritorio')
  assert.equal(bloque![1].trim(), CONSULTA_TELEFONO)
})

test('el campo del estado vacío no sube en teléfono horizontal', () => {
  const sube = css.indexOf('.chat-input-toolbar[data-vacio] { margin-bottom: clamp(')
  assert.ok(sube > 0, 'falta la regla que sube el campo en escritorio')
  const baja = css.indexOf('@media (pointer: coarse) and (max-height: 600px) {\n    .chat-input-toolbar[data-vacio] { margin-bottom: 0; }', sube)
  assert.ok(baja > sube, 'la regla de teléfono horizontal debe ir DESPUÉS de la que sube el campo (gana por orden)')
  assert.ok(CONSULTA_TELEFONO.includes('(pointer: coarse) and (max-height: 600px)'))
})
