import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sinLenguaje } from '../diseno/sin-lenguaje'
import { AJUSTES_BASE, VERSION_AJUSTES, leerAjustes } from '../../src/features/planning/ajustes'
import { colorDePiedra, DRIP, inferirDrip } from '../../src/features/planning/drip'

// 25 oct 2026, Daniel: el Recorrido es el default del Mes en todas las pantallas, y el color de un evento es siempre su DRIP.
const fuente = (f: string) => sinLenguaje(readFileSync(new URL(`../../src/features/planning/${f}`, import.meta.url), 'utf8'))

// 17 nov 2026, Daniel: «prefiero un calendario mensual normal» (mes-calendario.test.ts): el default vuelve a la cuadrícula, ahora la de
// MesCalendario a pantalla completa. El Recorrido sigue en el engrane y en lo angosto como estaba.
test('el Recorrido sigue a un toque en el engrane: elegido después de la versión 4 se respeta', () => {
  assert.equal(AJUSTES_BASE.mesVista, 'cuadricula')
  assert.equal(VERSION_AJUSTES, 4)
  const v2 = leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: 2, mesVista: 'recorrido', dias: 7 }))
  assert.equal(v2.mesVista, 'cuadricula')
  assert.equal(v2.dias, 7, 'los días elegidos en v2 se respetan')
  assert.equal(leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: 4, mesVista: 'recorrido' })).mesVista, 'recorrido')
})

test('la pantalla ancha muestra el Mes nuevo; la rejilla de FullCalendar del Mes queda para lo angosto', () => {
  const cal = fuente('PlanningCalendar.tsx')
  assert.match(cal, /const rejillaOculta = esViva\(mode\) && \(mode === 'week' \|\| mode === 'day' \|\| !rejilla \|\| mesEntero\)/)
  assert.match(cal, /cuadricula=\{rejilla\}/)
  assert.match(cal, /data-dos-columnas=\{dosColumnasVista \? mode : undefined\}/)
})

test('el recorrido abre en la semana actual, compacta las pasadas y su ceja lleva a la Semana', () => {
  const mes = fuente('MesClaro.tsx')
  assert.match(mes, /querySelector<HTMLElement>\('\[data-actual\]'\)/)
  assert.match(mes, /scrollIntoView\(\{ block: 'start' \}\)/)
  assert.match(mes, /<button type="button" className=\{c\.mesCeja\} onClick=\{onSemana \? \(\) => onSemana\(w\.lunes\)/)
  assert.match(mes, /\{pasada \|\| !abierta \? null : <>/, 'las semanas pasadas quedan en su ceja; las demás se pliegan (28 oct 2026)')
  // Sin nombres de personas en el Mes: el resumen de la semana, no la lista de marcas.
  assert.doesNotMatch(mes, /className=\{c\.mesMarcas\}/)
  assert.match(mes, /resumenSemana\(/)
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
