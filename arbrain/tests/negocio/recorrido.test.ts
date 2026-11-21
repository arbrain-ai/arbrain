// Tu negocio › El pulso › El recorrido (17 nov 2026, Daniel: «esto me encanto no lo habia visto…» sobre «El nervio» de su
// lienzo, y «quiero que ya todo pase a ser terminal encendido asap»). Fija que las seis estaciones salen de embudo.json en
// el orden del embudo, que una etapa se ENCIENDE solo si opera hoy y ya tiene número (la regla del lienzo), que la apagada
// dice lo que le falta con las palabras de su fuente, que el cuello y el lazo vienen del archivo, y que sin embudo (la copia
// del alumno) quedan seis estaciones vacías, nunca un número inventado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { ETAPAS, RUTA_EMBUDO, validarEmbudo, type Embudo, type Etapa } from '../../src/features/negocio/embudo'
import { atrasada, cuandoToca, cuelloDelRecorrido, encendida, encendido, estaciones, estadoRutina, horarioEnPalabras, lazoDe, senalDeRutinas, TRAMOS } from '../../src/features/negocio/recorrido'
import type { CronSnapshot } from '../../src/features/planning/types'

const raiz = (p: string) => new URL(`../../../${p}`, import.meta.url)

const etapa = (id: string, columna: Etapa['etapa'], x: Partial<Etapa> & { hay?: boolean; como?: string } = {}): Etapa => ({
  id, orden: 1, embudo: id.split('.')[0], etapa: columna, nombre: id, que_pasa: '', opera_hoy: true, skills: [], rutinas: [], ejecuta: [],
  mide: { nombre: `mide ${id}`, fuente: 'x', frecuencia: 'en vivo', dueno: { tipo: 'levy' }, hay_numero: x.hay ?? true, valor: null, ...(x.como ? { como_medirlo: x.como } : {}) },
  cuello: { es: false }, ...x,
}) as Etapa

const embudo = (etapas: Etapa[], aristas: Embudo['aristas'] = []): Embudo => ({ esquema: 'arbrain.embudo/v1', negocio: 'N', generado: '2026-11-17', etapas, aristas, embudos: [{ id: 'sfc', nombre: 'SaaS Factory' }] })

test('seis estaciones en el orden del embudo, de Adquisición a Expansión', () => {
  assert.deepEqual(estaciones(null).map(s => s.columna), [...ETAPAS])
  assert.ok(estaciones(null).every(s => s.etapas.length === 0 && s.encendidas === 0), 'sin embudo: vacías, nada encendido')
  assert.deepEqual(encendido(estaciones(undefined)), { encendidas: 0, total: 0 })
})

test('encendida = opera hoy Y ya tiene número; la apagada dice lo que le falta con su fuente', () => {
  assert.equal(encendida({ opera_hoy: true, mide: { hay_numero: true } as Etapa['mide'] }), true)
  assert.equal(encendida({ opera_hoy: false, mide: { hay_numero: true } as Etapa['mide'] }), false, 'número de un embudo que no opera: apagada')
  assert.equal(encendida({ opera_hoy: true, mide: { hay_numero: false } as Etapa['mide'] }), false)
  const e = embudo([
    etapa('sfc.atraer', 'Adquisición'),
    etapa('gratis.entrar', 'Bienvenida', { opera_hoy: false }),
    etapa('lista.convertir', 'Conversión', { hay: false, como: 'Cada alta con su origen', cuello: { es: true, frase: 'aquí se van' } }),
  ])
  const es = estaciones(e)
  const [adq, , conv, bien] = es
  assert.equal(adq.etapas[0].encendida, true); assert.equal(adq.etapas[0].falta, null); assert.equal(adq.etapas[0].embudo, 'SaaS Factory')
  assert.deepEqual(bien.etapas[0].falta, { tipo: 'por-construir' })
  assert.deepEqual(conv.etapas[0].falta, { tipo: 'medir', como: 'Cada alta con su origen' })
  assert.equal(conv.cuello, true)
  assert.deepEqual(cuelloDelRecorrido(es)?.columna, 2)
  assert.equal(cuelloDelRecorrido(es)?.etapa.frase, 'aquí se van')
  assert.deepEqual(encendido(es), { encendidas: 1, total: 3 })
})

test('las encendidas van primero dentro de su estación, y el lazo es la arista que vuelve', () => {
  const e = embudo([etapa('a.uno', 'Entrega', { hay: false, como: 'x' }), etapa('b.dos', 'Entrega')], [
    { desde: 'b.dos', hacia: 'a.uno', tipo: 'volante', estado: 'por construir', accion: 'casos → tu show' },
  ])
  assert.deepEqual(estaciones(e)[4].etapas.map(x => x.id), ['b.dos', 'a.uno'])
  assert.equal(lazoDe(e)?.accion, 'casos → tu show')
  assert.equal(lazoDe(embudo([])), null)
})

test('los órganos cubren las seis columnas, como en «El nervio» del lienzo', () => {
  const cubiertas = TRAMOS.flatMap(t => Array.from({ length: t.hasta - t.desde + 1 }, (_, k) => t.desde + k))
  assert.deepEqual(cubiertas, [0, 1, 2, 3, 4, 5])
  assert.deepEqual(TRAMOS.map(t => t.organo), ['marketing', 'venta', 'entrega', 'finanzas'])
})

test('el embudo real (si está en este checkout) da estaciones con su encendido y su cuello', () => {
  const real = raiz(RUTA_EMBUDO)
  if (!existsSync(real)) return
  const v = validarEmbudo(JSON.parse(readFileSync(real, 'utf8')))
  if (!v.ok) return
  const es = estaciones(v.embudo)
  const { encendidas, total } = encendido(es)
  assert.equal(total, v.embudo.etapas.length, 'ninguna etapa se pierde ni se inventa')
  assert.equal(encendidas, v.embudo.etapas.filter(et => et.opera_hoy && et.mide.hay_numero).length)
  for (const s of es) for (const et of s.etapas) if (!et.encendida) assert.ok(et.falta, `${et.id}: la apagada dice qué le falta`)
})

// ── Fase 2 (17 nov 2026): tocar una estación abre sus etapas y sus rutinas con su estado real ──
// Daniel: «darle clic a las rutinas debería ser mejor la UX… más dinámico, no tan estático». La ficha lee lo que ya leen
// el Taller y El sistema; estas pruebas fijan que ninguna rutina inventa estado ni hora.

test('fase 2: cada estación cuelga de un solo órgano (la ficha dice quién la mide)', () => {
  for (let i = 0; i < ETAPAS.length; i++) {
    const de = TRAMOS.filter(t => i >= t.desde && i <= t.hasta)
    assert.equal(de.length, 1, `la estación ${i + 1} cuelga de un solo tramo`)
  }
})

test('fase 2: la ficha de cada estación trae sus rutinas tal como vienen en embudo.json', () => {
  const ru = { id: 'job-1', que_hace: 'Lee las vistas', activa: true, motor: 'scheduler' }
  const e = embudo([etapa('sfc.atraer', 'Adquisición', { rutinas: [ru] }), etapa('sfc.nutrir', 'Nutrición')])
  const [adq, nut] = estaciones(e)
  assert.deepEqual(adq.etapas[0].rutinas, [ru])
  assert.deepEqual(nut.etapas[0].rutinas, [], 'sin rutinas: lista vacía, no una inventada')
  assert.ok(estaciones(null).every(s => s.etapas.every(et => et.rutinas.length === 0)), 'la copia vacía no trae rutinas')
})

test('fase 2: el estado de una rutina sale de su motor y nunca se inventa', () => {
  const ahora = Date.UTC(2026, 10, 17, 18, 0)
  // Apagada o por construir: se dice por qué, sin hora.
  assert.deepEqual(estadoRutina({ id: null, que_hace: 'x', activa: false }, { ahora }), { tono: 'por-construir', texto: 'Por construir', toca: null })
  // launchd: lo que dice su lectura; sin lectura, «Sin dato aquí».
  const ld = { id: 'com.levy.x', que_hace: 'x', activa: true, motor: 'launchd', horario: '05:30' }
  assert.equal(estadoRutina(ld, { ahora }).tono, 'sin-dato')
  assert.equal(estadoRutina(ld, { ahora, launchd: { 'com.levy.x': { semaforo: 'rojo', texto: 'salió con error' } } }).tono, 'error')
  assert.equal(estadoRutina(ld, { ahora, launchd: { 'com.levy.x': { semaforo: 'verde', texto: 'hace 3 min' } } }).texto, 'Corrió hace 3 min')
  // Scheduler: sin la lectura todavía, «Leyendo…»; con la lectura pero sin ese trabajo, «Sin dato aquí».
  const sc = { id: 'job-9', que_hace: 'x', activa: true, motor: 'scheduler' }
  assert.deepEqual(estadoRutina(sc, { ahora }), { tono: 'sin-dato', texto: 'Leyendo…', toca: null })
  const vacio: CronSnapshot = { jobs: [], runs: [], timeZone: 'America/Mexico_City', loadedAt: '', scheduleError: null, historyError: null }
  assert.deepEqual(estadoRutina(sc, { ahora, crons: vacio }), { tono: 'sin-dato', texto: 'Sin dato aquí', toca: null })
  assert.deepEqual(estadoRutina(sc, { ahora, cronsError: 'sin red' }), { tono: 'sin-dato', texto: 'Sin dato aquí', toca: null })
})

test('fase 2: cuándo le toca, en palabras y en la zona del scheduler', () => {
  const tz = 'America/Mexico_City'
  const ahora = Date.UTC(2026, 10, 17, 18, 0) // 12:00 en Ciudad de México
  assert.equal(cuandoToca(ahora - 1000, ahora, tz), 'toca ya')
  assert.match(cuandoToca(Date.UTC(2026, 10, 17, 21, 30), ahora, tz), /^toca hoy 15:30$/)
  assert.match(cuandoToca(Date.UTC(2026, 10, 18, 11, 30), ahora, tz), /^toca mañana 05:30$/)
  assert.match(cuandoToca(Date.UTC(2026, 10, 20, 11, 30), ahora, tz), /^toca .+ · 05:30$/)
})

test('fase 2: el horario se dice como lo escribe el embudo («a las» solo si es una hora)', () => {
  assert.equal(horarioEnPalabras('05:30'), 'a las 05:30')
  assert.equal(horarioEnPalabras('cada 10 min'), 'cada 10 min', 'nunca «a las cada 10 min»')
  assert.equal(horarioEnPalabras('diario 02:40'), 'diario 02:40')
  assert.equal(horarioEnPalabras(''), null); assert.equal(horarioEnPalabras(null), null)
})

test('fase 2: el río marca la estación con una rutina que falló o que corre ahora', () => {
  assert.equal(senalDeRutinas(['ok', 'error', 'curso']), 'falla', 'la falla manda')
  assert.equal(senalDeRutinas(['ok', 'curso']), 'corre')
  assert.equal(senalDeRutinas(['ok', 'sin-dato']), null)
  assert.equal(senalDeRutinas([]), null, 'sin rutinas, sin señal')
})

test('fase 2: atrasada solo si launchd dice «hace N» y pasó tres veces la cadencia que escribe el embudo', () => {
  assert.equal(atrasada('cada 10 min', 'hace 29 días'), true)
  assert.equal(atrasada('cada 15 min', 'hace 26 h'), true)
  assert.equal(atrasada('cada 10 min', 'hace 20 min'), false)
  assert.equal(atrasada('05:30', 'hace 29 días'), false, 'sin cadencia escrita no se juzga')
  assert.equal(atrasada('cada 2 h', undefined), false, 'sin lectura no se juzga')
  const ru = { id: 'com.levy.r', que_hace: 'x', activa: true, motor: 'launchd', horario: 'cada 10 min' }
  const st = estadoRutina(ru, { ahora: 0, launchd: { 'com.levy.r': { semaforo: 'verde', texto: 'hace 29 días' } } })
  assert.equal(st.tono, 'atencion'); assert.match(st.texto, /^Corrió hace 29 días · más de 3 veces su cadencia$/)
})
