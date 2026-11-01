// Taller › Rutinas › «De Arbrain» (1 nov 2026): las precargadas se separan de las del dueño, llevan su para qué, se
// activan en un clic y marcan «Nuevo» cuando llega un reporte que no ha visto (la edición cliente no tiene campana).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reporteNuevo, separarRutinas, vistaRutina, type ListaRutinas } from '../../src/lib/rutinas-cliente'

const ahora = Date.UTC(2026, 10, 2, 15, 0)
const t = (id: string, over: Partial<ListaRutinas['tasks'][number]> = {}) => ({ id, prompt: `${id}\n\ntexto`, schedule: '0 7 * * 1-5', status: 'paused' as const, next_run: ahora / 1000 + 3600, last_run: null, last_result: null, ...over })
const meta = {
  'arbrain-reporte-manana': { nombre: 'Reporte de la mañana', paraQue: 'Tu día en una página.', carpeta: '.claude/reportes/diario/', reporte: '.claude/reportes/diario/2026-11-02-manana.md' },
  'arbrain-cierre-dia': { nombre: 'Cierre del día', paraQue: 'Lo planeado contra lo que pasó.', carpeta: '.claude/reportes/diario/', reporte: null },
}

test('separa las del dueño de las «De Arbrain», estas en el orden del catálogo y con su ficha', () => {
  const l: ListaRutinas = { tasks: [t('arbrain-cierre-dia'), t('rutina-mia-1', { status: 'active' }), t('arbrain-reporte-manana')], precargadas: meta }
  const { propias, deArbrain } = separarRutinas(l, ahora)
  assert.deepEqual(propias.map(r => r.id), ['rutina-mia-1'])
  assert.deepEqual(deArbrain.map(r => r.id), ['arbrain-reporte-manana', 'arbrain-cierre-dia'])
  assert.equal(deArbrain[0].titulo, 'Reporte de la mañana')
  assert.equal(deArbrain[0].paraQue, 'Tu día en una página.')
  assert.equal(deArbrain[0].carpeta, '.claude/reportes/diario/')
  assert.equal(deArbrain[0].reporte, '.claude/reportes/diario/2026-11-02-manana.md')
  assert.equal(deArbrain[1].reporte, null)
  assert.equal(deArbrain[0].deArbrain, true)
  assert.equal(deArbrain[0].proxima, 'en pausa')
  assert.equal(propias[0].deArbrain, false)
  assert.equal(propias[0].paraQue, null)
})

test('sin ficha del daemon (versión vieja), todas son del dueño como antes', () => {
  const { propias, deArbrain } = separarRutinas({ tasks: [t('arbrain-reporte-manana')] }, ahora)
  assert.equal(propias.length, 1); assert.equal(deArbrain.length, 0)
  assert.equal(vistaRutina(t('arbrain-reporte-manana'), ahora).titulo, 'arbrain-reporte-manana')
})

test('«Nuevo»: corrió bien después de la última vez que lo vio; un fallo o «Sin novedad» no cuentan', () => {
  const corrida = ahora / 1000 - 60
  assert.equal(reporteNuevo(t('a', { last_run: corrida, last_result: 'Hoy: 2 reuniones' }), {}), true)
  assert.equal(reporteNuevo(t('a', { last_run: corrida, last_result: 'Hoy: 2 reuniones' }), { a: corrida }), false)
  assert.equal(reporteNuevo(t('a', { last_run: corrida + 10, last_result: 'otro' }), { a: corrida }), true)
  assert.equal(reporteNuevo(t('a', { last_run: corrida, last_result: 'Error: sin saldo' }), {}), false)
  assert.equal(reporteNuevo(t('a', { last_run: corrida, last_result: 'Sin novedad' }), {}), false)
  assert.equal(reporteNuevo(t('a'), {}), false)
})

test('la pestaña: sección «De Arbrain», Activar en un clic, probar sin activar y aviso de la suscripción', () => {
  const vista = readFileSync(join(__dirname, '../../src/features/rutinas/RutinasCliente.tsx'), 'utf8')
  assert.match(vista, />De Arbrain</)
  assert.match(vista, /Vienen en pausa: actívalas en un clic/)
  assert.match(vista, /'Activar'/)
  assert.match(vista, /'Probar una vez'/)
  assert.match(vista, /data\.suscripcion && .*no corren solas/)
  assert.match(vista, /No volverá a aparecer/)
})

test('varios días sueltos se dicen en palabras: «Martes y jueves a las 9:00»', async () => {
  const { cuandoRutina } = await import('../../src/lib/rutinas-cliente')
  assert.equal(cuandoRutina('0 9 * * 2,4'), 'Martes y jueves a las 9:00')
  assert.equal(cuandoRutina('30 8 * * 1,3,5'), 'Lunes, miércoles y viernes a las 8:30')
  assert.equal(cuandoRutina('0 7 * * 1-5'), 'De lunes a viernes a las 7:00')
})

test('resumen acorta una ruta relativa a su nombre, sin pegar el primer tramo («.claude2026…», captura del 1 nov)', async () => {
  const { resumen } = await import('../../src/features/rutinas/model')
  assert.equal(resumen('Quedó en .claude/reportes/diario/2026-11-01-manana.md'), 'Quedó en 2026-11-01-manana.md')
  assert.equal(resumen('Quedó en /Users/usuario/Arbrain/x.md'), 'Quedó en x.md')
  assert.doesNotMatch(resumen('ver .claude/reportes/diario/2026-11-01-manana.md') ?? '', /\.claude\d/)
})

test('«Lo que hizo» muestra la ruta exacta que anotó el daemon, no una carpeta armada en la web', () => {
  const vista = readFileSync(join(__dirname, '../../src/features/rutinas/RutinasCliente.tsx'), 'utf8')
  assert.match(vista, /title=\{r\.reporte\}>Reporte completo en \{lugarReporte\(r\.reporte\)\}/)
  assert.doesNotMatch(vista, /\{r\.carpeta\}\//)
})

test('al dueño se le dice «tus reportes», nunca «.claude/reportes/» (Daniel, 1 nov)', async () => {
  const { lugarReporte } = await import('../../src/lib/rutinas-cliente')
  assert.equal(lugarReporte('.claude/reportes/diario/'), 'tus reportes › diario')
  assert.equal(lugarReporte('.claude/reportes/diario/2026-11-01-manana.md'), 'tus reportes › diario › 2026-11-01-manana')
  assert.equal(lugarReporte('.claude\\reportes\\semanal\\2026-11-01.md'), 'tus reportes › semanal › 2026-11-01')
  assert.equal(lugarReporte('otra/carpeta/x.md'), 'otra/carpeta/x.md')
  const vista = readFileSync(join(__dirname, '../../src/features/rutinas/RutinasCliente.tsx'), 'utf8')
  assert.match(vista, /Su reporte quedará en \$\{lugarReporte\(r\.carpeta\)\}/)
})
