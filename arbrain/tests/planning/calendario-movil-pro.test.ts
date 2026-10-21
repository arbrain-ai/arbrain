import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AJUSTES_BASE, VERSION_AJUSTES, ajustar, leerAjustes } from '../../src/features/planning/ajustes'
import { altoHora, diasAuto, diasVisibles, hhmm, lineasDeTitulo, lineasNecesarias, reencuadrar } from '../../src/features/planning/semana-horas'

// Ronda 3 del calendario, el teléfono (10 oct 2026, Daniel: «dame un diseño incluso mejor que el de Google… vamos a superarlos»):
// cabecera fija, días automáticos por ancho, títulos legibles, un solo engrane, Enfoque en Día y lo principal plegado.
const fuente = (f: string) => readFileSync(new URL(`../../src/features/planning/${f}`, import.meta.url), 'utf8')
// El ancho útil es el de la rejilla menos el canal de horas (38 px en angosto, 44 a tamaño completo).
const util = (ancho: number) => ancho - (ancho < 700 ? 38 : 44)

test('«Auto»: 3 en el teléfono vertical y en el panel angosto, 7 al girarlo y en ventana ancha, 4 o 5 en medio', () => {
  assert.equal(diasAuto(util(390)), 3, 'iPhone vertical')
  assert.equal(diasAuto(util(420)), 3, 'panel derecho angosto')
  assert.equal(diasAuto(util(520)), 4, 'panel ancho')
  assert.equal(diasAuto(util(600)), 5, 'media pantalla')
  assert.equal(diasAuto(util(700)), 5)
  assert.equal(diasAuto(util(844)), 7, 'iPhone horizontal')
  assert.equal(diasAuto(util(1440)), 7, 'escritorio')
  assert.equal(diasAuto(-44), 3, 'sin medir aún: lo más seguro')
  // Monótono: a más ancho, nunca menos días.
  let antes = 3
  for (let w = 300; w <= 1600; w += 10) { const n = diasAuto(util(w)); assert.ok(n >= antes, `${w}px`); antes = n }
})

test('«Auto» es el default y quien había fijado 7 antes de que existiera vuelve a «Auto» una sola vez', () => {
  assert.equal(AJUSTES_BASE.dias, null)
  assert.equal(leerAjustes(JSON.stringify({ ...AJUSTES_BASE, dias: 7, densidad: 'compacta' })).dias, null, 'guardado viejo (sin versión): días a Auto')
  assert.equal(leerAjustes(JSON.stringify({ ...AJUSTES_BASE, dias: 7, densidad: 'compacta' })).densidad, 'compacta', 'lo demás se respeta')
  assert.equal(leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: VERSION_AJUSTES, dias: 7 })).dias, 7, 'elegido después de Auto: se respeta')
  assert.equal(leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: VERSION_AJUSTES, dias: null })).dias, null)
  // Lo que se guarda lleva la versión: la migración no se repite.
  assert.match(fuente('ajustes.ts'), /JSON\.stringify\(\{ \.\.\.n, v: VERSION_AJUSTES \}\)/)
})

test('al rotar (o cambiar los días) la ventana no pierde hoy ni la posición', () => {
  const hoy = '2026-10-10' // sábado
  // Vertical (3 desde hoy) → horizontal (7): la semana de hoy desde su lunes; hoy sigue a la vista.
  const siete = reencuadrar('2026-10-10', 3, 7, hoy)
  assert.equal(siete, '2026-10-05'); assert.ok(diasVisibles(siete, 7).includes(hoy))
  // Horizontal (7 desde el lunes) → vertical (3): desde hoy, no desde el lunes.
  assert.equal(reencuadrar('2026-10-05', 7, 3, hoy), hoy)
  // Mirando otra semana (sin hoy): se conserva el primer día que se veía.
  assert.equal(reencuadrar('2026-10-21', 3, 4, hoy), '2026-10-21')
  assert.equal(reencuadrar('2026-10-21', 3, 7, hoy), '2026-10-19', 'y con la semana completa, su lunes')
  assert.equal(reencuadrar('2026-10-21', 7, 7, hoy), '2026-10-21', 'sin cambio, sin movimiento')
  // Sin fines de semana, cinco columnas son la semana completa: desde el lunes hábil.
  assert.equal(reencuadrar('2026-10-07', 3, 5, '2026-10-08', false), '2026-10-05')
  // El riel usa esta regla al cambiar de columnas (y solo después de medirse, para no saltar al llegar).
  const semana = fuente('SemanaHoras.tsx')
  assert.match(semana, /reencuadrar\(inicio, columnasPrevias\.current, porVista, hoy, finDeSemana\)/)
  assert.match(semana, /ancho > 0 && columnasPrevias\.current !== null/)
})

test('títulos legibles: envuelven en las líneas que caben, y un bloque de 30 min dice al menos su título', () => {
  const h = altoHora({ angosto: true })
  assert.equal(h, 42)
  assert.equal(altoHora({}), 44); assert.equal(altoHora({ amplia: true }), 58); assert.equal(altoHora({ compacta: true, angosto: true }), 32)
  // El título manda: la hora entra solo si el título completo cabe con ella.
  assert.deepEqual(lineasDeTitulo(2 * h - 2 - 7, 14, 13, 2), { lineas: 4, conHora: true }, 'dos horas, título de dos líneas: con hora')
  assert.deepEqual(lineasDeTitulo(1.5 * h - 2 - 7, 14, 13, 5), { lineas: 3, conHora: false }, 'título largo: todo el alto es suyo')
  assert.deepEqual(lineasDeTitulo(h - 2 - 7, 14, 13, 2), { lineas: 2, conHora: false }, 'una hora en tres columnas: dos líneas de título')
  // Siete columnas (letra de 10 px, líneas de 12): una hora son tres líneas; nada de nueve letras y puntos suspensivos.
  assert.deepEqual(lineasDeTitulo(h - 2 - 3, 12, 0), { lineas: 3, conHora: false })
  assert.deepEqual(lineasDeTitulo(44 - 2 - 7, 14, 13, 1), { lineas: 1, conHora: true }, 'columna ancha y título corto: cabe la hora')
  assert.deepEqual(lineasDeTitulo(4, 14, 13), { lineas: 0, conHora: false }, 'unos minutos: solo el color')
  // La estimación de líneas: palabras enteras y, las que no caben, partidas con guion.
  assert.equal(lineasNecesarias('Natación', 300, 11.5), 1)
  assert.equal(lineasNecesarias('Videollamada de comunidad · Producto y Arquitectura · Anfitrión', 90, 11.5), 5)
  assert.equal(lineasNecesarias('Contestar mensajes', 40, 10), 4, 'siete columnas: dos palabras partidas')
  assert.equal(lineasNecesarias('', 100, 11.5), 1)
  const semana = fuente('SemanaHoras.tsx'), css = fuente('semana-horas.module.css')
  // Lo corto (≤ 35 min) siempre lleva título; antes, en siete columnas, se escondía.
  assert.match(semana, /const diminuto = corto \? alto < 9 : lineas === 0/)
  assert.doesNotMatch(css, /\[data-minimo\] \.bloque\[data-corto\] strong/)
  // Se parte con guion en español (la página es lang="es") y ya no hay una sola línea forzada en columnas angostas.
  assert.match(css, /hyphens: auto/)
  assert.doesNotMatch(css, /\[data-denso\] \.cuerpo strong \{[^}]*nowrap/)
  assert.doesNotMatch(css, /\[data-minimo\] \.cuerpo strong \{[^}]*nowrap/)
})

test('cabecera fija: la barra y los días se quedan arriba al hacer scroll', () => {
  const semana = fuente('SemanaHoras.tsx'), css = fuente('semana-horas.module.css'), cal = fuente('PlanningCalendar.tsx'), pcss = fuente('planning.module.css')
  // Los días viven en su propia cabecera, fuera del riel (un overflow-x le quitaría lo pegajoso), y siguen su scrollLeft.
  const cab = semana.indexOf('className={h.rielCab}'), riel = semana.indexOf('className={h.riel}')
  assert.ok(cab > 0 && riel > cab, 'la cabecera va antes del riel y fuera de él')
  assert.ok(semana.slice(cab, riel).includes('role="columnheader"'), 'los encabezados de día están en la cabecera')
  assert.match(semana, /c\.scrollLeft = r\.scrollLeft/)
  assert.match(css, /\.rielCab \{ position: sticky; top: var\(--plan-pegado, 0px\)/)
  // La barra del calendario, pegada; su alto medido alimenta `--plan-pegado`.
  assert.match(pcss, /\.root\[data-unificada\] > \.barra \{ position:sticky; top:0/)
  assert.match(cal, /'--plan-pegado': `\$\{altoBarra\}px`/)
  // La cabecera también desliza los días (y PlanningCalendar no lo toma como cambio de periodo).
  assert.match(semana, /className=\{h\.rielCab\} data-carril=/)
})

test('un solo engrane: la misma hoja en Día, Semana y Mes', () => {
  const engrane = fuente('Engrane.tsx')
  assert.doesNotMatch(engrane, /\{(semana|mes) && <Seccion/, 'ninguna sección depende de la escala')
  assert.doesNotMatch(engrane, /mode/, 'el engrane ya no sabe en qué escala está')
  assert.match(engrane, /\{ v: 'auto' as const, t: 'Auto' \}/, '«Auto» es una opción de los días a la vista')
  assert.match(engrane, /poner\(\{ dias: n === 'auto' \? null/)
  assert.doesNotMatch(fuente('PlanningCalendar.tsx'), /<Engrane mode=/)
})

test('Enfoque también en Día: sin los chips de categorías', () => {
  assert.match(fuente('DiaVivo.tsx'), /\{leyenda && !enfoque && /)
  assert.match(fuente('PlanningCalendar.tsx'), /<DiaVivo [^>]*enfoque=\{ajustes\.enfoque\}/)
  assert.match(fuente('SemanaClara.tsx'), /const chips = leyenda && !enfoque/)
})

test('lo principal se pliega con un toque: cerrado por defecto, recordado y compartido por las tres vistas', () => {
  assert.equal(AJUSTES_BASE.abreObjetivo, false, 'el objetivo nace plegado')
  assert.equal(AJUSTES_BASE.abreTodoElDia, false, 'lo de día completo nace plegado')
  const a = leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: VERSION_AJUSTES, abreObjetivo: true, abreTodoElDia: 'si' }))
  assert.deepEqual([a.abreObjetivo, a.abreTodoElDia], [true, false], 'se recuerda; lo inválido vuelve a plegado')
  assert.equal(ajustar(AJUSTES_BASE, { abreObjetivo: true }).abreObjetivo, true)
  // Semana y Mes pliegan el objetivo con la misma pieza; Semana y Día pliegan lo de día completo con el mismo estado.
  for (const f of ['SemanaClara.tsx', 'MesClaro.tsx']) assert.match(fuente(f), /plegada=\{plegado \? !plegado\.objetivo : false\} onPlegar=\{plegado \? \(\) => plegado\.alternar\('objetivo'\)/, f)
  assert.match(fuente('SemanaClara.tsx'), /onTodoElDia=\{plegado \? \(\) => plegado\.alternar\('todoElDia'\)/)
  assert.match(fuente('DiaVivo.tsx'), /onTodoElDia=\{plegado \? \(\) => plegado\.alternar\('todoElDia'\)/)
  const cal = fuente('PlanningCalendar.tsx')
  for (const v of ['DiaVivo', 'MesClaro', 'SemanaClara']) assert.match(cal, new RegExp(`<${v} [^]*?plegado=\\{plegado\\}`), v)
  // El objetivo plegado es un botón con aria-expanded: un toque, no ir a configuraciones.
  assert.match(fuente('ObjetivoCaja.tsx'), /<button className=\{c\.cabeza\} onClick=\{onPlegar\} aria-expanded=\{!cerrada\}/)
})

test('la hora de «ahora» nunca dice «18:60»', () => {
  assert.equal(hhmm(18 * 60 + 59.6), '19:00')
  assert.equal(hhmm(9 * 60 + 30), '09:30')
  assert.equal(hhmm(23 * 60 + 59.7), '00:00')
})

test('al abrir, hoy: la fecha navegada solo vale dentro de la sesión viva', async () => {
  const { REAPERTURA_MS, fechaDeArranque, reabrirEnHoy, sesionViva } = await import('../../src/features/planning/apertura')
  const ahora = Date.parse('2026-10-10T18:30:00-06:00')
  // Apertura nueva (sin marca, o marca vieja): manda hoy aunque la URL o la pestaña digan «31 ago».
  assert.equal(sesionViva(null, ahora), false)
  assert.equal(sesionViva(String(ahora - REAPERTURA_MS - 1), ahora), false)
  assert.equal(sesionViva('basura', ahora), false)
  assert.equal(fechaDeArranque('2026-08-31', false, '2026-10-10'), '2026-10-10')
  // Dentro de la sesión (recargar, expandir desde el panel): se respeta.
  assert.equal(sesionViva(String(ahora - 60_000), ahora), true)
  assert.equal(fechaDeArranque('2026-08-31', true, '2026-10-10'), '2026-08-31')
  assert.equal(fechaDeArranque('31/08', true, '2026-10-10'), '2026-10-10', 'una fecha mal formada no ancla nada')
  assert.equal(fechaDeArranque(null, true, '2026-10-10'), '2026-10-10')
  // Volver a la app tras un rato en segundo plano es reabrirla.
  assert.equal(reabrirEnHoy(ahora - REAPERTURA_MS, ahora), true)
  assert.equal(reabrirEnHoy(ahora - 60_000, ahora), false)
  assert.equal(reabrirEnHoy(null, ahora), false)
  // El calendario usa la regla al montar (URL y pestaña del panel) y al volver a la app.
  const cal = fuente('PlanningCalendar.tsx')
  assert.match(cal, /const fecha = fechaDeArranque\(pedida, viva, hoy\)/)
  assert.match(cal, /const pedida = inicio \? inicio\.fecha : query\.get\('date'\)/)
  assert.match(cal, /if \(volver && modeRef\.current !== 'crons' && modeRef\.current !== 'year'\) irHoy\.current\(\)/)
})

test('una lectura colgada al volver a la app no deja la Semana en «Leyendo tu calendario…»', () => {
  const lectura = fuente('usePlanning.ts')
  // Al volver tras unos segundos fuera, la lectura en vuelo se abandona (nueva época) y se lee de nuevo.
  assert.match(lectura, /const abandonar = useCallback\(\(\)=>\{epoch\.current\+\+;inFlight\.current=\[\];fetching\.current=false;void refresh\(false\)\}/)
  assert.match(lectura, /if\(fetching\.current\)abandonar\(\);else void refresh\(false\)/)
  // Y la primera lectura que no llega se reintenta una vez.
  assert.match(lectura, /PRIMERA_LECTURA_MS = 25_000/)
  assert.match(lectura, /reintentado\.current=true;abandonar\(\)/)
  // Una respuesta de una época abandonada nunca pinta encima de la nueva.
  assert.match(lectura, /version !== epoch\.current/)
})
