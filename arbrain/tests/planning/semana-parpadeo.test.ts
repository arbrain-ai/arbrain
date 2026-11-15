import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HOLGURA_ANGOSTO, altoHora, esAngosto } from '../../src/features/planning/semana-horas'

// El parpadeo de la Semana (12 nov 2026, Daniel 06:05: «parpadea y se mueve bien raro… solo a ese tamaño»). Reproducido en el banco
// (tests/planning/fixture.tsx, panel de 760 px, barras clásicas): la rejilla medía 702 px sin barra y 691 con ella y saltaba de
// ancha a angosta ~150 veces por segundo. Aquí, el mismo ciclo en pequeño: angosto → alto de la hora → ¿desborda? → barra → ancho.
const ANGOSTO = 700, BARRA = 11, SIN_BARRA = 702, VISIBLE = 17 * 43 // el alto que cabe: entre 17 horas de 42 y 17 de 44
function ciclo(decide: (ancho: number, antes: boolean) => boolean, pasos = 40) {
  let barra = false, angosto = false
  const modos: boolean[] = []
  for (let i = 0; i < pasos; i++) {
    angosto = decide(SIN_BARRA - (barra ? BARRA : 0), angosto)
    barra = 17 * altoHora({ angosto }) > VISIBLE
    modos.push(angosto)
  }
  return modos.slice(-10)
}

test('el umbral sin holgura entra en bucle con la barra de scroll (lo que vio Daniel)', () => {
  const ultimos = ciclo(ancho => ancho > 0 && ancho < ANGOSTO)
  assert.ok(ultimos.includes(true) && ultimos.includes(false), 'sin holgura alterna ancha ↔ angosta')
})

test('con holgura la Semana se asienta y no vuelve a cambiar', () => {
  const ultimos = ciclo((ancho, antes) => esAngosto(ancho, antes, ANGOSTO))
  assert.equal(new Set(ultimos).size, 1)
})

test('esAngosto: entra bajo el umbral, sale solo pasando la holgura, y un ancho de 0 (oculta) no es angosto', () => {
  assert.ok(HOLGURA_ANGOSTO > 17, 'más que cualquier barra de scroll clásica')
  assert.equal(esAngosto(699, false), true)
  assert.equal(esAngosto(702, false), false)
  assert.equal(esAngosto(702, true), true)
  assert.equal(esAngosto(700 + HOLGURA_ANGOSTO, true), false)
  assert.equal(esAngosto(0, true), false)
})

test('el contenedor que desplaza la Semana reserva el canal de la barra: su ancho no depende de si hay scroll', () => {
  const css = readFileSync(new URL('../../src/features/planning/planning.module.css', import.meta.url), 'utf8')
  assert.match(css, /\.root\[data-unificada\] \{[^}]*overflow-y:auto[^}]*scrollbar-gutter:stable/)
})
