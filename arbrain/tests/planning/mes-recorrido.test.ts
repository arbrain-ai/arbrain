import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sinLenguaje } from '../diseno/sin-lenguaje'
import { AJUSTES_BASE, VERSION_AJUSTES, leerAjustes } from '../../src/features/planning/ajustes'
import { colorDePiedra, DRIP, inferirDrip } from '../../src/features/planning/drip'

// 25 oct 2026, Daniel: el Recorrido es el default del Mes en todas las pantallas, y el color de un evento es siempre su DRIP.
const fuente = (f: string) => sinLenguaje(readFileSync(new URL(`../../src/features/planning/${f}`, import.meta.url), 'utf8'))

test('el Mes abre en Recorrido: default, y lo guardado antes de la versión 3 vuelve a Recorrido una vez', () => {
  assert.equal(AJUSTES_BASE.mesVista, 'recorrido')
  assert.equal(VERSION_AJUSTES, 3)
  // Antes la pantalla ancha mostraba la cuadrícula siempre: lo guardado en v2 no dice qué prefiere.
  const v2 = leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: 2, mesVista: 'cuadricula', dias: 7 }))
  assert.equal(v2.mesVista, 'recorrido')
  assert.equal(v2.dias, 7, 'los días elegidos en v2 se respetan')
  // Elegida en el engrane después de la v3, la cuadrícula se respeta.
  assert.equal(leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: 3, mesVista: 'cuadricula' })).mesVista, 'cuadricula')
})

test('la pantalla ancha ya no fuerza la cuadrícula: solo el engrane la muestra', () => {
  const cal = fuente('PlanningCalendar.tsx')
  assert.match(cal, /const rejillaOculta = esViva\(mode\) && \(mode === 'week' \|\| mode === 'day' \|\| !rejilla\)/)
  assert.match(cal, /cuadricula=\{rejilla\}/)
  assert.match(cal, /data-dos-columnas=\{dosColumnasVista \? mode : undefined\}/)
})

test('el recorrido abre en la semana actual, compacta las pasadas y su ceja lleva a la Semana', () => {
  const mes = fuente('MesClaro.tsx')
  assert.match(mes, /querySelector<HTMLElement>\('\[data-actual\]'\)/)
  assert.match(mes, /scrollIntoView\(\{ block: 'start' \}\)/)
  assert.match(mes, /<button type="button" className=\{c\.mesCeja\} onClick=\{onSemana \? \(\) => onSemana\(w\.lunes\)/)
  assert.match(mes, /\{pasada \? null : <>/, 'las semanas pasadas quedan en su ceja')
  const css = fuente('claridad.module.css')
  assert.match(css, /\.mesCeja:focus-visible \{/)
  assert.match(css, /\.mesCeja \{[^}]*cursor: pointer/)
})

test('GYM, Comida, Despertar y A dormir son Invertir (morado), sin importar el calendario de origen', () => {
  const titulos = ['GYM', '🏋️ GYM', 'Gym · pierna', 'Comida', '🍽️ Comida', 'Despertar', '⏰ Despertar',
    '🌅 5:30 Despierto · rutina matutina: abs + mis 3 casillas (Ctrl+H)', 'A dormir', '🌙 A dormir 21:30 · monk mode']
  for (const title of titulos) for (const calendario of ['Trabajo Duro', null]) {
    const e = { id: title, title, start: '2026-10-25T09:30:00-06:00', end: '2026-10-25T10:30:00-06:00' }
    const c = inferirDrip(e, calendario).cuadrante
    assert.equal(c, 'invertir', `${title} (${calendario})`)
    assert.equal(colorDePiedra(e, c), DRIP.invertir.color)
  }
})

test('el detalle del evento toma el color de su DRIP; el calendario de origen es texto neutro', () => {
  const hoja = fuente('PlanEditor.tsx')
  assert.doesNotMatch(hoja, /colorFuente/, 'el calendario de origen ya no colorea la hoja')
  assert.match(hoja, /\['--hoja-acento' as string\]: colorEvento/)
  assert.match(hoja, /className=\{styles\.calendarioOrigen\}/)
  assert.match(fuente('PlanningCalendar.tsx'), /acento=\{selection\.item\?\.kind === 'event' \? colorEvento\(selection\.item\) : null\}/)
  // «Ahora» es un anillo ámbar: el riel sigue siendo su DRIP en la Semana y en el Día.
  assert.match(fuente('semana-horas.module.css'), /\.bloque\[data-ahora\] \{[^}]*inset 3px 0 0 var\(--drip\)/)
  assert.match(fuente('dia-vivo.module.css'), /\.enCurso \{[^}]*inset 4px 0 0 var\(--c, var\(--gold\)\)/)
  assert.match(fuente('dia-vivo.module.css'), /\.miniBloques button\[data-vivo\] \{[^}]*inset 3px 0 0 var\(--drip\)/)
})
