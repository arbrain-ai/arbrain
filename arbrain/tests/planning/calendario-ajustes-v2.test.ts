import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AJUSTES_BASE, ajustar, claveAjustes, leerAjustes, rechazado } from '../../src/features/planning/ajustes'
import { columnasDe, diasDelRiel, diasQueCaben, diasVisibles, esArrastre, esFinDeSemana, habil, inicioDeVentana, moverDias, semanaDeMayoria, sumarHabiles } from '../../src/features/planning/semana-horas'
import { accionDeEscala, tituloVentana } from '../../src/features/planning/accesos'

// Ronda 2 del calendario (10 oct 2026, Daniel tras probarlo): crear solo arrastrando, el engrane persistente y fines de semana.
const fuente = (f: string) => readFileSync(new URL(`../../src/features/planning/${f}`, import.meta.url), 'utf8')

test('crear es solo arrastrar: un clic suelto no crea; hay que recorrer unos píxeles con el botón apretado', () => {
  assert.equal(esArrastre(0, 0), false, 'un clic')
  assert.equal(esArrastre(3, 3), false, 'un temblor del ratón')
  assert.equal(esArrastre(0, 6), true, 'arrastrar hacia abajo')
  assert.equal(esArrastre(-4, -5), true, 'hacia arriba también')
  const semana = fuente('SemanaHoras.tsx')
  // Sin el fantasma «+ HH:MM» al pasar el ratón ni el clic que creaba 30 min: el clic de la columna no llama a crear.
  assert.doesNotMatch(semana, /setHueco|h\.hueco|\+ \{hhmm/, 'no queda el hueco fantasma')
  assert.match(semana, /onDoubleClick=\{e => crearEn\(e, d\)\}/, 'doble clic abre el editor de 30 min')
  assert.doesNotMatch(semana, /onClick=\{e => crearEn/, 'el clic simple ya no crea')
  assert.doesNotMatch(fuente('semana-horas.module.css'), /\.hueco\s*\{/)
  // La cuadrícula de FullCalendar (Día y Mes) tampoco crea con un clic: pide arrastrar.
  assert.match(fuente('PlanningCalendar.tsx'), /selectMinDistance=\{6\}/)
})

test('el engrane guarda sus ajustes y no confía en lo guardado', () => {
  assert.deepEqual(leerAjustes(null), AJUSTES_BASE)
  assert.equal(AJUSTES_BASE.desde, 5); assert.equal(AJUSTES_BASE.hasta, 22)
  assert.equal(AJUSTES_BASE.rechazados, false, 'los rechazados no se ven por defecto')
  const guardado = JSON.stringify({ ...AJUSTES_BASE, v: 2, dias: 7, vistaSemana: 'agenda', enfoque: true, finDeSemana: false, densidad: 'compacta', mesVista: 'cuadricula', mesSemanas: 4, zona: true })
  const a = leerAjustes(guardado)
  assert.deepEqual([a.dias, a.vistaSemana, a.enfoque, a.finDeSemana, a.densidad, a.mesVista, a.mesSemanas, a.zona], [7, 'agenda', true, false, 'compacta', 'cuadricula', 4, true])
  // Basura: cada campo inválido vuelve a su base sin tumbar los demás.
  const b = leerAjustes(JSON.stringify({ v: 2, dias: 5, vistaSemana: 'lista', enfoque: 'si', desde: 20, hasta: 21, densidad: 'x', mesSemanas: 3, finDeSemana: false }))
  assert.deepEqual([b.dias, b.vistaSemana, b.enfoque, b.desde, b.hasta, b.densidad, b.mesSemanas, b.finDeSemana], [null, 'horas', false, 5, 22, 'comoda', 0, false])
  assert.deepEqual(leerAjustes('{roto'), AJUSTES_BASE)
  assert.deepEqual(leerAjustes('[1,2]'), AJUSTES_BASE)
  assert.equal(claveAjustes('panel'), 'arbrain:planning:ajustes:panel', 'por superficie')
})

test('el engrane hereda lo que había en los botones sueltos (Enfoque, Horas/Agenda, cuadrícula del Mes); los días nacen en «Auto»', () => {
  const a = leerAjustes(null, { dias: '4', vista: 'agenda', enfoque: '1', rejillaMes: '1' })
  assert.deepEqual([a.dias, a.vistaSemana, a.enfoque, a.mesVista], [null, 'agenda', true, 'cuadricula'])
  const b = leerAjustes(null, { dias: '9', vista: null, enfoque: '0', rejillaMes: null })
  assert.deepEqual([b.dias, b.vistaSemana, b.enfoque, b.mesVista], [null, 'horas', false, 'recorrido'])
})

test('el rango de horas siempre deja al menos cuatro horas', () => {
  assert.deepEqual((({ desde, hasta }) => [desde, hasta])(ajustar(AJUSTES_BASE, { desde: 20 })), [20, 24])
  assert.deepEqual((({ desde, hasta }) => [desde, hasta])(ajustar(AJUSTES_BASE, { hasta: 6 })), [2, 6])
  assert.deepEqual((({ desde, hasta }) => [desde, hasta])(ajustar(AJUSTES_BASE, { desde: 7 })), [7, 22])
})

test('los eventos que rechazaste se reconocen por tu respuesta, no por la de otros', () => {
  assert.equal(rechazado({ attendees: [{ self: true, response: 'declined' }] }), true)
  assert.equal(rechazado({ attendees: [{ self: false, response: 'declined' }, { self: true, response: 'accepted' }] }), false)
  assert.equal(rechazado({}), false)
})

test('días a la vista: 1 · 3 · 4 · 7; lo automático nunca elige 1', () => {
  assert.equal(diasQueCaben(60), 3)
  assert.equal(diasQueCaben(352), 3)
  assert.equal(diasQueCaben(800), 7)
  assert.equal(columnasDe(7), 7); assert.equal(columnasDe(7, false), 5); assert.equal(columnasDe(3, false), 3)
})

test('sin fines de semana el riel salta de viernes a lunes y el título dice lo que se ve', () => {
  assert.equal(esFinDeSemana('2026-10-10'), true); assert.equal(esFinDeSemana('2026-10-12'), false)
  assert.equal(habil('2026-10-10'), '2026-10-12'); assert.equal(habil('2026-10-11', -1), '2026-10-09')
  assert.equal(sumarHabiles('2026-10-09', 1), '2026-10-12'); assert.equal(sumarHabiles('2026-10-12', -1), '2026-10-09')
  assert.equal(moverDias('2026-10-09', 1, false), '2026-10-12'); assert.equal(moverDias('2026-10-09', 1, true), '2026-10-10')
  assert.deepEqual(diasVisibles('2026-10-08', 3, false), ['2026-10-08', '2026-10-09', '2026-10-12'])
  assert.deepEqual(diasVisibles('2026-10-12', 5, false), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'])
  const riel = diasDelRiel('2026-10-12', 5, 7, false)
  assert.equal(riel.length, 19); assert.equal(riel.some(esFinDeSemana), false); assert.equal(riel[7], '2026-10-12')
  // Sábado 10 oct sin fines de semana: la ventana corta empieza en el lunes de esa semana, no en el sábado.
  assert.equal(inicioDeVentana('2026-10-10', '2026-10-10', 3, false), '2026-10-05')
  assert.equal(inicioDeVentana('2026-10-14', '2026-10-14', 3, false), '2026-10-14')
  assert.equal(inicioDeVentana('2026-10-14', '2026-10-14', 7, false), '2026-10-12')
  const v = diasVisibles('2026-10-15', 3, false)
  assert.equal(tituloVentana(v[0], v.length, new Date('2026-10-10T12:00:00'), v.at(-1)), '15 – 19 oct')
})

test('bug de la captura (09:00): con mar 13 – lun 19 a la vista, el título y el objetivo son de esa ventana, no de 5 – 11 oct', () => {
  const hoy = new Date('2026-10-10T12:00:00')
  const v = diasVisibles('2026-10-13', 7)
  assert.equal(tituloVentana(v[0], v.length, hoy, v.at(-1)), '13 – 19 oct')
  assert.equal(semanaDeMayoria(v), '2026-10-12', 'seis de siete días son de la semana del 12: manda su objetivo')
  // El título de la barra de la Semana sale de la ventana visible, nunca del título de FullCalendar.
  assert.match(fuente('PlanningCalendar.tsx'), /const tituloBarra = mode === 'week' \? tituloVentana\(visibles\[0\]/)
})

test('un solo engrane: sin botones sueltos de Enfoque, Horas/Agenda ni 3 · 4 · 7 en el calendario, y el Mes sin el botón de cuadrícula', () => {
  const clara = fuente('SemanaClara.tsx'), mes = fuente('MesClaro.tsx'), cal = fuente('PlanningCalendar.tsx')
  assert.doesNotMatch(clara, /<SelectorVista|c\.enfoque|setEnfoque/)
  assert.match(clara, /diasVista=\{(llenar \? 7 : )?diasVista\}/, 'los días los manda el engrane (en dos columnas, siempre 7): la rejilla no pinta su selector')
  assert.doesNotMatch(mes, /LayoutGrid|onRejilla/)
  assert.match(cal, /<Engrane /)
  assert.doesNotMatch(cal, /Calendarios y tareas/, 'los ajustes salieron del menú del título')
})

test('selector D · S · M: tocar la escala activa lleva a hoy; tocar otra cambia y conserva la fecha', () => {
  assert.equal(accionDeEscala('week', 'week'), 'hoy')
  assert.equal(accionDeEscala('day', 'day'), 'hoy')
  assert.equal(accionDeEscala('month', 'month'), 'hoy')
  assert.equal(accionDeEscala('week', 'day'), 'cambiar')
  assert.equal(accionDeEscala('month', 'week'), 'cambiar')
  assert.equal(accionDeEscala('day', 'month'), 'cambiar')
  // El mismo botón en escritorio y teléfono: la barra es una sola.
  assert.match(fuente('PlanningCalendar.tsx'), /onClick=\{\(\) => accionDeEscala\(mode, m\) === 'hoy' \? goToday\(\) : escala\(m\)\}/)

})

test('atajos D · S · M: repetir la tecla de la escala activa lleva a hoy, igual que el segundo toque del selector', () => {
  const cal = fuente('PlanningCalendar.tsx')
  assert.match(cal, /case 'mode': e\.preventDefault\(\); if \(accionDeEscala\(modeRef\.current, action\.mode\) === 'hoy'\) goToday\(\); else escala\(action\.mode\); break/)
  assert.doesNotMatch(cal, /case 'mode': e\.preventDefault\(\); escala\(action\.mode\); break/, 'la tecla ya no ignora la escala activa')
})

test('ronda 3: el objetivo sin globo de Levy, el Mes dice «Semana k de n» y hoy se marca en oro en el Mes', () => {
  const caja = fuente('ObjetivoCaja.tsx'), mes = fuente('MesClaro.tsx'), semana = fuente('SemanaClara.tsx')
  assert.doesNotMatch(caja, /MessageCircle|onConversar/, 'la tarjeta del objetivo ya no lleva el globo')
  assert.doesNotMatch(semana + mes, /onConversar=\{onConversar \? conversar/, 'ni Semana ni Mes se lo pasan')
  assert.match(mes, /marca=\{actual >= 0 \? `Semana \$\{actual \+ 1\} de \$\{semanas\.length\}` : null\}/)
  assert.doesNotMatch(mes, /unidad: 'semanas'/, '«1 de 5 semanas» se fue')
  const css = readFileSync(new URL('../../src/features/planning/planning.module.css', import.meta.url), 'utf8')
  assert.match(css, /\.fc-daygrid-day\.fc-day-today\) \{ background:linear-gradient\(180deg, rgba\(var\(--gold-rgb\)/)
})
