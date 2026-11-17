/**
 * La sección Lienzo nunca queda en blanco ni miente (16 nov 2026, un fundador en Windows: «los lienzos todavía no los
 * puedo usar mucho»). Si la lista no llega, dice qué pasó y qué hacer; y la skill con la que Levy dibuja en la copia del
 * alumno entra por la web local de SU Arbrain con su pase (antes: `localhost:3000` sin credencial → 401 en todo sistema).
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { avisoNoCreeLienzo, avisoNoLeiLienzos } from '../../src/features/canvas/ui/lienzo-avisos'

const WEB = path.resolve(import.meta.dirname, '../..')
const leer = (rel: string) => readFileSync(path.join(WEB, rel), 'utf8')

test('si la lista de lienzos no llega, la sección lo dice en una frase y dice qué hacer', () => {
  const a = avisoNoLeiLienzos(new Error('error 500'))
  assert.match(a.titulo, /^No pude leer tus lienzos \(error 500\)\.$/)
  assert.match(a.que, /vuelve a abrir Arbrain/)
  assert.match(a.que, /Levy/)
  assert.equal(avisoNoLeiLienzos(undefined).titulo, 'No pude leer tus lienzos.')
  assert.match(avisoNoCreeLienzo(new Error('no autorizado')).titulo, /^No pude crear el lienzo \(no autorizado\)\.$/)
})

test('LienzoSeccion pinta el aviso y ya no confunde «no pude leer» con «no hay lienzos»', () => {
  const s = leer('src/features/canvas/ui/LienzoSeccion.tsx')
  assert.match(s, /setAviso\(avisoNoLeiLienzos\(e\)\)/)
  assert.match(s, /setAviso\(avisoNoCreeLienzo\(e\)\)/)
  assert.doesNotMatch(s, /\.catch\(\(\) => \{ if \(vivo\) setVacio\(true\) \}\)/)
  assert.doesNotMatch(s, /\.catch\(\(\) => \{\}\)/)
})

test('la skill de lienzos del alumno usa la web de SU Arbrain y su pase, en cualquier sistema', () => {
  // En el repo original la skill del alumno vive en empaquetado/plantillas/skills; en la copia del alumno ya es la
  // .claude/skills de la raíz (el Windows real de la CI corre sobre la copia: ahí la primera ruta no existe).
  const enRepo = 'empaquetado/plantillas/skills/canvas/SKILL.md'
  const s = leer(existsSync(path.join(WEB, enRepo)) ? enRepo : '../.claude/skills/canvas/SKILL.md')
  assert.doesNotMatch(s, /localhost:3000/)
  assert.match(s, /\$MISSION_CONTROL_ORIGIN\/api\/canvas/)
  assert.match(s, /Authorization: Bearer \$ARBRAIN_PASE_AGENTE/)
})
