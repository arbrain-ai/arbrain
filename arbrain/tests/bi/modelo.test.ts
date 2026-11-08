import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { CATALOGO, consultaDe } from '../../src/features/bi/catalogo'
import {
  aplicar, corredor, ESQUEMA_BI, excepcion, exceso, idDePregunta, leer, mensajeParaLevy, sumarDias, titularDe, tonoDe, validarBI,
  RUTA_BI, type Grafica, type Leida, type Punto,
} from '../../src/features/bi/modelo'
import { INICIALES } from '../../src/features/bi/iniciales'
import { datosSimulados } from '../../src/features/bi/simulado'

const HASTA = '2026-11-06'
const serie = (vals: (number | null)[], hasta = HASTA): Punto[] => vals.map((v, i) => ({ fecha: sumarDias(hasta, i - vals.length + 1), valor: v }))
const g = (id: string, consulta: string, extra: Partial<Grafica> = {}): Grafica => ({ id, pregunta: `¿${id}?`, consulta: { id: consulta, ventana: 30 }, tipo: consultaDe(consulta)!.tipo, fuente: 'x', creada: '2026-11-07T10:00:00-06:00', por: 'Levy', estado: 'fijada', ...extra })

test('el catálogo es coherente: tipo por defecto permitido, ejemplos, y propuesta en todo lo que puede sonar', () => {
  const ids = new Set<string>()
  for (const c of CATALOGO) {
    assert.ok(!ids.has(c.id), `id repetido ${c.id}`); ids.add(c.id)
    assert.ok(c.tipos.includes(c.tipo), c.id)
    assert.ok(c.ejemplos.length > 0, c.id)
    assert.ok(c.ventanas.length > 0, c.id)
    if (c.alarma) { assert.ok(c.propone?.dolor && c.propone.placer, `${c.id} sin propuesta`); assert.equal(c.tipo, 'linea') }
  }
  // Nunca dinero de community_purchases ni payment_verified como venta: el dinero es de Polar.
  for (const c of CATALOGO.filter(x => x.unidad === 'usd' || x.unidad === 'pagos')) assert.match(c.fuente, /Polar/)
})

test('la siembra del tablero valida y responde preguntas distintas (≥ 6)', () => {
  const v = validarBI({ esquema: ESQUEMA_BI, graficas: INICIALES })
  assert.deepEqual(v.errores, [])
  assert.ok(v.graficas.length >= 6)
  assert.equal(new Set(INICIALES.map(x => x.consulta.id)).size, INICIALES.length)
})

test('el archivo de la memoria es la siembra válida', () => {
  const crudo = JSON.parse(readFileSync(path.join(__dirname, '..', '..', '..', RUTA_BI), 'utf8'))
  const v = validarBI(crudo)
  assert.deepEqual(v.errores, [])
  assert.ok(v.graficas.filter(x => x.estado === 'fijada').length >= 6)
})

test('validar: errores en palabras; lo válido se conserva aunque otra falle', () => {
  const v = validarBI({ esquema: ESQUEMA_BI, graficas: [g('buena-uno', 'visitas'), { ...g('mala-uno', 'visitas'), consulta: { id: 'sql libre', ventana: 30 } }, { ...g('mala-dos', 'cobrado'), consulta: { id: 'cobrado', ventana: 7 } }, g('buena-uno', 'bajas')] })
  assert.equal(v.graficas.length, 1)
  assert.equal(v.errores.length, 3)
  assert.match(v.errores.join(' '), /catálogo/)
  assert.match(v.errores.join(' '), /ventana/)
  assert.match(v.errores.join(' '), /repetido/)
  assert.deepEqual(validarBI(null).graficas, [])
})

test('el corredor sale de los 28 días anteriores; con menos de 14 medidos, aprende', () => {
  assert.equal(corredor([1, 2, 3], 3), null)
  const vals = Array.from({ length: 30 }, (_, i) => 10 + (i % 5))
  const c = corredor(vals, 29)!
  assert.ok(c.lo >= 10 && c.hi <= 14 && c.lo < c.hi)
  assert.equal(c.n, 28)
  // Los nulos no cuentan como cero.
  assert.equal(corredor([...Array(20).fill(null), ...Array(10).fill(5)], 30), null)
})

test('exceso y tono: salir hacia donde es bueno es placer; en contra, dolor', () => {
  const c = { lo: 10, hi: 20, med: 15, n: 28 }
  assert.deepEqual(exceso(15, c), { exceso: 0, lado: null })
  assert.equal(exceso(30, c).lado, 'arriba')
  assert.equal(exceso(30, c).exceso, 1)
  assert.equal(tonoDe('arriba', 'arriba'), 'placer')
  assert.equal(tonoDe('abajo', 'arriba'), 'dolor')
  assert.equal(tonoDe('arriba', 'abajo'), 'dolor')
  assert.equal(tonoDe('arriba', null), 'atencion')
})

test('leer una serie: calma, aprendiendo, y una caída fuera del corredor es dolor con récord', () => {
  const visitas = consultaDe('visitas')!
  const base = Array.from({ length: 58 }, (_, i) => 400 + ((i * 37) % 60))
  const calma = leer(visitas, 'linea', 30, { forma: 'serie', puntos: serie(base) })
  assert.equal(calma.estado, 'calma')
  assert.equal(calma.puntos!.length, 30)
  assert.match(calma.frase, /Dentro de lo normal/)
  const nuevo = leer(visitas, 'linea', 30, { forma: 'serie', puntos: serie(base.slice(-10)) })
  assert.equal(nuevo.estado, 'aprendiendo')
  assert.equal(nuevo.aprendiendo!.faltan, 14 - 9)
  const caida = leer(visitas, 'linea', 30, { forma: 'serie', puntos: serie([...base.slice(0, -1), 120]) })
  assert.equal(caida.estado, 'fuera')
  assert.equal(caida.senal!.tono, 'dolor')
  assert.equal(caida.senal!.record, true)
  assert.match(caida.frase, /más bajo/)
  // En bajas, subir es dolor.
  const bajas = leer(consultaDe('bajas')!, 'linea', 30, { forma: 'serie', puntos: serie([...Array(57).fill(2).map((v, i) => v + (i % 3)), 14]) })
  assert.equal(bajas.senal?.tono, 'dolor')
})

test('un día sin medir no es cero: no enciende alarma ni se pinta como caída', () => {
  const visitas = consultaDe('visitas')!
  const vals: (number | null)[] = Array.from({ length: 58 }, (_, i) => 400 + ((i * 37) % 60))
  vals[57] = null
  const l = leer(visitas, 'linea', 30, { forma: 'serie', puntos: serie(vals) })
  assert.notEqual(l.estado, 'fuera')
  assert.equal(l.puntos![29].valor, null)
})

test('la excepción: sube UNA, el dolor pesa más que el placer, y dice qué más se movió ese día', () => {
  const leidas: Leida[] = ['visitas', 'clics', 'altas', 'comunidad', 'bajas', 'suscriptores'].map(id => {
    const c = consultaDe(id)!
    return { grafica: g(id, id), consulta: c, lectura: leer(c, 'linea', 30, datosSimulados(id, 30, HASTA, 'alarma')!) }
  })
  const ex = excepcion(leidas)!
  assert.ok(ex)
  // Ayer no entró nadie (dolor, lo más cerca del dinero) y el porqué encuentra el eco: las visitas también cayeron.
  assert.equal(ex.principal.consulta.id, 'altas')
  assert.equal(ex.principal.lectura.senal!.tono, 'dolor')
  assert.match(ex.porque.join(' '), /visitas a la página de venta/i)
  assert.ok(ex.otras.some(o => o.consulta.id === 'visitas'))
  assert.ok(ex.propone.length > 10)
  const t = titularDe(leidas, ex)
  assert.equal(t.palabra, 'Algo se salió')
  // En calma no sube nada y el titular lo dice.
  const calma = leidas.map(l => ({ ...l, lectura: leer(l.consulta, 'linea', 30, datosSimulados(l.consulta.id, 30, HASTA, 'calma')!) }))
  assert.equal(excepcion(calma), null)
  assert.equal(titularDe(calma, null).palabra, 'En calma')
  // Una respuesta sin fijar no enciende la alarma del tablero.
  assert.equal(excepcion(leidas.map(l => ({ ...l, grafica: { ...l.grafica, estado: 'respuesta' as const } }))), null)
})

test('barras, embudo, proporción y acumulado: la frase sale de los números y dice lo parcial', () => {
  const v = leer(consultaDe('ventas-por-video')!, 'barras', 30, datosSimulados('ventas-por-video', 30, HASTA)!)
  assert.match(v.frase, /no traen video: la atribución es parcial/)
  const e = leer(consultaDe('embudo-web')!, 'embudo', 30, datosSimulados('embudo-web', 30, HASTA)!)
  assert.match(e.frase, /El paso más estrecho/)
  assert.ok(e.anotacion && e.anotacion.indice >= 1)
  const p = leer(consultaDe('dispositivo')!, 'proporcion', 30, datosSimulados('dispositivo', 30, HASTA)!)
  assert.match(p.frase, /Teléfono: \d+ %/)
  const a = leer(consultaDe('cobrado')!, 'acumulado', 30, datosSimulados('cobrado', 30, HASTA)!)
  assert.equal(a.meses!.dia, 6)
  assert.match(a.frase, /Llevas \$[\d,]+ USD cobrados en noviembre; a estas alturas de octubre/)
})

test('acciones del panel: fijar sube al tablero, soltar quita, mover reordena solo lo fijado', () => {
  const a = { esquema: ESQUEMA_BI, graficas: [g('uno-x', 'visitas'), g('dos-x', 'bajas'), g('tres-x', 'altas', { estado: 'respuesta' })] } as const
  const f = aplicar({ ...a, graficas: [...a.graficas] }, { accion: 'fijar', id: 'tres-x' })
  assert.ok('archivo' in f && f.archivo.graficas[0].id === 'tres-x' && f.archivo.graficas[0].estado === 'fijada')
  const s = aplicar({ ...a, graficas: [...a.graficas] }, { accion: 'soltar', id: 'uno-x' })
  assert.ok('archivo' in s && s.archivo.graficas.length === 2)
  const m = aplicar({ ...a, graficas: [...a.graficas] }, { accion: 'mover', id: 'dos-x', a: 0 })
  assert.ok('archivo' in m && m.archivo.graficas.map(x => x.id).join() === 'dos-x,uno-x,tres-x')
  assert.ok('error' in aplicar({ ...a, graficas: [...a.graficas] }, { accion: 'fijar', id: 'no-existe' }))
})

test('ids legibles y únicos a partir de la pregunta', () => {
  assert.equal(idDePregunta('¿Qué video trajo más pagos?', []), 'que-video-trajo-mas-pagos')
  assert.equal(idDePregunta('¿Qué video trajo más pagos?', ['que-video-trajo-mas-pagos']), 'que-video-trajo-mas-pagos-2')
  assert.match(idDePregunta('¿?', []), /^grafica/)
})

test('el mensaje a Levy lleva la pregunta tal cual y el contrato', () => {
  const m = mensajeParaLevy('  ¿Cuánto entró hoy?  ')
  assert.match(m, /«¿Cuánto entró hoy\?»/)
  assert.match(m, /run bi -- responder/)
  assert.match(m, /docs\/bi\/README\.md/)
})

test('la CLI de Levy escribe una respuesta válida, reemplaza la anterior y respeta lo fijado', () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'bi-'))
  mkdirSync(path.join(raiz, '.claude', 'memory', 'project', 'mi-negocio'), { recursive: true })
  writeFileSync(path.join(raiz, '.claude', 'memory', 'MEMORY.md'), '#')
  writeFileSync(path.join(raiz, RUTA_BI), JSON.stringify({ esquema: ESQUEMA_BI, graficas: [g('fija-una', 'visitas')] }))
  const cli = (...a: string[]) => execFileSync('npx', ['--yes', 'tsx', path.join(__dirname, '..', '..', 'scripts', 'bi.ts'), ...a], { env: { ...process.env, BI_RAIZ: raiz }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  cli('responder', '--pregunta', '¿De qué países me visitan?', '--consulta', 'paises', '--lectura', 'México va primero.')
  cli('responder', '--pregunta', '¿Cuántos se van?', '--consulta', 'bajas', '--ventana', '7')
  const v = validarBI(JSON.parse(readFileSync(path.join(raiz, RUTA_BI), 'utf8')))
  assert.deepEqual(v.errores, [])
  assert.deepEqual(v.graficas.map(x => `${x.id}:${x.estado}`), ['fija-una:fijada', 'cuantos-se-van:respuesta'])
  assert.equal(v.graficas[1].consulta.ventana, 7)
  assert.throws(() => cli('responder', '--pregunta', '¿x?', '--consulta', 'select * from'))
})
