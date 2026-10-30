import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Daniel 21 oct 2026, 10:33: «mira el overflow en eventos mensuales como prospección con ia métele 2 o máximo 3 renglones
// al evento para que no se salga a la derecha». FullCalendar trae `.fc-daygrid-event { white-space: nowrap }` y los
// eventos con hora del Mes son flex: sin estas reglas el título va en un renglón y se sale de la celda.
const css = readFileSync(new URL('../../src/features/planning/planning.module.css', import.meta.url), 'utf8')
const regla = (selector: string) => {
  const i = css.indexOf(`${selector} {`)
  assert.ok(i >= 0, `falta la regla ${selector}`)
  return css.slice(i, css.indexOf('}', i))
}

test('Mes: el evento envuelve su título dentro de la pastilla, hasta 3 renglones', () => {
  const evento = regla('.root :global(.fc-daygrid-event)')
  assert.match(evento, /white-space:normal/)
  assert.match(evento, /overflow:hidden/)
  assert.match(evento, /min-width:0/)
  assert.match(regla('.root :global(.fc-daygrid-event) .eventContent'), /min-width:0/)
  assert.match(regla('.eventContent strong'), /-webkit-line-clamp:3/)
})
