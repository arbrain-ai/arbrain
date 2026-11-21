// Gestos de brazos de Live «Como en YouTube» (19 nov 2026): el puño del catálogo de los videos, horneado con su mismo motor. El
// cuerpo estático y el clip se cambian en el reposo, idéntico en los dos (regla firmada: nada doble).
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { AgendaBrazos, DISPARADORES, disparaA, REGLAS_BRAZOS, type ManifiestoBrazos } from '../../src/features/chat/lib/levy-brazos.ts'

const publico = (url: string) => new URL(`../../public${url}`, import.meta.url)
const MAN = JSON.parse(readFileSync(publico('/levy-face/medio/gestos/gestos.json'), 'utf8')) as ManifiestoBrazos & Record<string, { reposo_inicio_dif?: number; reposo_final_dif?: number }>

test('el manifiesto trae el puño, su MP4 existe y empieza y termina en el reposo de cuerpo.webp', () => {
  const c = MAN.puno!
  assert.ok(existsSync(publico(`/levy-face/medio/gestos/${c.archivo}`)))
  assert.ok(statSync(publico(`/levy-face/medio/gestos/${c.archivo}`)).size < 4e6)
  assert.equal(c.cps, 30); assert.ok(c.llega > 0 && c.llega < c.cuadros)
  // diferencia de lo visible contra la imagen estática: solo la compresión (≈ 1 de 255)
  assert.ok((MAN.puno as { reposo_inicio_dif?: number }).reposo_inicio_dif! < 2, 'el primer cuadro es el reposo')
  assert.ok((MAN.puno as { reposo_final_dif?: number }).reposo_final_dif! < 2, 'el último también')
  assert.ok(!('abiertas' in MAN) && !('enfasis' in MAN), 'en el encuadre de Live las manos en reposo quedan bajo la barra: solo el puño')
})

test('disparadores del catálogo, sin acentos ni puntuación y con raíces', () => {
  assert.equal(disparaA('Importante,'), 'puno'); assert.equal(disparaA('NUNCA'), 'puno'); assert.equal(disparaA('garantía'), 'puno')
  assert.equal(disparaA('explicarte'), 'abiertas', 'raíz explic*')
  assert.equal(disparaA('doble.'), 'enfasis'); assert.equal(disparaA('hola'), null); assert.equal(disparaA('…'), null)
  for (const lista of Object.values(DISPARADORES)) for (const d of lista) assert.equal(d, d.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
})

test('la agenda: la pose llega en la palabra, nada encimado, y un gesto que ya no llega no le quita el turno al siguiente', () => {
  const a = new AgendaBrazos(MAN)
  const pal = (w: string, s: number) => ({ w, s, e: s + 0.3 })
  const c = MAN.puno!
  // «importante» a 1,0 s de una frase que empieza en 100 → arranca en 100 + 1 − llega/cps
  a.frase('f', 100, [pal('Lo', 0), pal('importante', 1.0), pal('es', 1.6), pal('nunca', 2.0)], 100)
  const t = 100 + 1.0 - c.llega / c.cps
  assert.equal(a.toca(t - 0.01), null); assert.equal(a.toca(t), 'puno')
  assert.equal(a.pendientes, 0, '«nunca» a 1 s quedaba encimado: no se agendó')
  // la primera palabra de una frase no alcanza (llegaría tarde) y NO bloquea a la que sí alcanza
  const b = new AgendaBrazos(MAN)
  b.frase('g', 200, [pal('Nunca', 0.0), pal('pienses', 0.4), pal('en', 0.9), pal('nada', 1.2), pal('más', 1.6), pal('que', 2.2), pal('en', 2.5), pal('la', 2.8), pal('clave', 3.2)], 200)
  assert.equal(b.pendientes, 1, 'solo «clave»: «Nunca» ya no llegaba a tiempo')
  assert.equal(b.toca(200 + 3.2 - c.llega / c.cps), 'puno')
  // un gesto que se quedó atrás más de lo tolerado se olvida
  const d = new AgendaBrazos(MAN)
  d.frase('h', 300, [pal('x', 0), pal('y', 0.5), pal('importante', 1.5)], 300)
  assert.equal(d.toca(300 + 1.5 - c.llega / c.cps + REGLAS_BRAZOS.tardeMax + 0.05), null)
})

test('LevyFace: el lienzo de brazos va debajo de la cabeza y el rig sigue siendo el primer canvas de la cara', () => {
  const f = readFileSync(new URL('../../src/features/chat/components/LevyFace.tsx', import.meta.url), 'utf8')
  const iRig = f.indexOf('ref={canvasRef} width={720}', f.indexOf("if (encuadre === 'medio')"))
  const iBrazos = f.indexOf('ref={brazosRef}')
  assert.ok(iRig > 0 && iBrazos > iRig, 'en el DOM el rig va antes (las herramientas leen el primer canvas)')
  assert.ok(f.includes('className="absolute z-[2]"'), 'la cabeza encima')
  assert.ok(f.includes("lienzoBrazos.style.visibility = v ? 'visible' : 'hidden'; cuerpoImg.style.visibility = v ? 'hidden' : 'visible'"), 'se ve el clip o el cuerpo, nunca los dos')
})
