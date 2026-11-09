import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { consultaEn } from '../../src/features/bi/catalogo'
import { catalogoGenerico, CONSULTA_DEL_ORGANO, PLANTILLAS, RUTA_FUENTES, validarFuentes, type ArchivoFuentes, type Fuente } from '../../src/features/bi/generico'
import { calcular, fechaCivil, numero, type Lote } from '../../src/features/bi/calculo'
import { adivinarSeparador, parsearCsv } from '../../src/features/bi/fuentes/csv'
import { leerLlaves } from '../../src/features/bi/fuentes/leer'
import { ejecutarGenerico } from '../../src/features/bi/motor'
import { ESQUEMA_BI, leer, RUTA_BI, validarBI } from '../../src/features/bi/modelo'
import { pulsoDeConsulta, pulsoSistemasCliente } from '../../src/features/negocio/pulso-cliente'
import { validarEmbudo } from '../../src/features/negocio/embudo'
import { leerVoz } from '../../src/features/negocio/pulso'

// El kit de Business Intelligence del alumno (8 nov 2026): el catálogo genérico, el archivo de fuentes, los adaptadores de
// archivo, la cuenta y el pulso, contra el café de ejemplo de docs/bi/ejemplo. Viaja a la copia del alumno.

const EJEMPLO = path.join(__dirname, '..', '..', 'docs', 'bi', 'ejemplo')
const leerJson = (f: string) => JSON.parse(readFileSync(path.join(EJEMPLO, f), 'utf8'))

/** Un cerebro de prueba con el café de ejemplo sembrado (lo mismo que hace `bi -- ejemplo`). */
function cerebroEjemplo(): string {
  const raiz = mkdtempSync(path.join(tmpdir(), 'bi-alumno-'))
  mkdirSync(path.join(raiz, '.claude', 'memory', 'project', 'mi-negocio'), { recursive: true })
  writeFileSync(path.join(raiz, '.claude', 'memory', 'MEMORY.md'), '#')
  cpSync(path.join(EJEMPLO, 'datos'), path.join(raiz, 'mi-negocio', 'datos', 'ejemplo'), { recursive: true })
  for (const f of ['bi-fuentes.json', 'bi.json']) cpSync(path.join(EJEMPLO, f), path.join(raiz, '.claude', 'memory', 'project', 'mi-negocio', f))
  return raiz
}

test('CSV: comas, punto y coma, comillas con saltos de línea, BOM y celdas vacías', () => {
  assert.equal(adivinarSeparador('fecha;concepto;monto\n1;2;3'), ';')
  assert.equal(adivinarSeparador('"a,b";c;d'), ';')
  const t = parsearCsv('﻿Fecha,Nota,Total\r\n01/11/2026,"hola, ""mundo""\nsegunda línea",12.5\r\n02/11/2026,,\n\n')
  assert.deepEqual(t.columnas, ['Fecha', 'Nota', 'Total'])
  assert.equal(t.filas.length, 2)
  assert.equal(t.filas[0][1], 'hola, "mundo"\nsegunda línea')
  assert.deepEqual(t.filas[1], ['02/11/2026', null, null])
})

test('fechas: día/mes de Latinoamérica, ISO con zona en el día del negocio, serie de Excel ya convertida', () => {
  assert.equal(fechaCivil('08/11/2026 21:30'), '2026-11-08')
  assert.equal(fechaCivil('8/11/26'), '2026-11-08')
  assert.equal(fechaCivil('11/08/2026', 'mm/dd/aaaa'), '2026-11-08')
  assert.equal(fechaCivil('11/25/2026'), '2026-11-25') // el 25 no es mes: el autodetector lo voltea
  assert.equal(fechaCivil('2026-11-08T03:00:00Z', 'auto', 'America/Mexico_City'), '2026-11-07')
  assert.equal(fechaCivil('2026-11-08 03:00:00+00', 'auto', 'America/Mexico_City'), '2026-11-07')
  assert.equal(fechaCivil('2026-11-08T03:00:00'), '2026-11-08')
  assert.equal(fechaCivil('31/02/2026'), null)
  assert.equal(fechaCivil('mañana'), null)
  assert.equal(fechaCivil(null), null)
})

test('importes: símbolo, miles, coma decimal y negativos entre paréntesis; lo ilegible es null, no cero', () => {
  assert.equal(numero('$1,234.50'), 1234.5)
  assert.equal(numero('1.234,50 MXN', ','), 1234.5)
  assert.equal(numero('(300)'), -300)
  assert.equal(numero(42), 42)
  assert.equal(numero('—'), null)
  assert.equal(numero(''), null)
})

test('el archivo de fuentes: errores en palabras, llaves solo por nombre, y lo válido se usa aunque otra línea falle', () => {
  const v = validarFuentes({
    esquema: 'arbrain.bi-fuentes/v1', moneda: 'mxn',
    fuentes: [
      { id: 'ventas', tipo: 'csv', ruta: 'mi-negocio/datos/ventas.csv', fecha: 'Fecha' },
      { id: 'base', tipo: 'postgres', conexion: 'postgres://usuario:secreto@host/db', tabla: 'public.ventas', fecha: 'creado' },
      { id: 'sb', tipo: 'supabase', url: 'BI_SB_URL', llave: 'BI_SB_LLAVE', tabla: 'ventas; drop table x', fecha: 'created_at' },
      { id: 'hoja', tipo: 'excel', ruta: 'datos.pdf', fecha: 'Fecha' },
    ],
    consultas: { ventas: { fuente: 'ventas' }, ingresos: { fuente: 'ventas' }, visitas: { fuente: 'ventas' }, 'lo-mas-vendido': { fuente: 'no-existe', por: 'x' } },
  })
  const e = v.errores.join('\n')
  assert.match(e, /moneda/)
  assert.match(e, /NOMBRE de una llave/)
  assert.match(e, /trae una URL/)
  assert.match(e, /«tabla»/)
  assert.match(e, /termina en \.xlsx/)
  assert.match(e, /falta «valor»/)
  assert.match(e, /«visitas»: no está en el catálogo/)
  assert.match(e, /«fuente» debe ser el id de una fuente declarada/)
  assert.ok(!e.includes('secreto'), 'un error nunca repite una llave')
  assert.deepEqual(v.archivo!.fuentes.map(f => f.id), ['ventas'])
  assert.deepEqual(Object.keys(v.archivo!.consultas), ['ventas'])
})

test('el catálogo genérico: doce preguntas de cualquier negocio, vacío sin fuentes y conectado con el ejemplo', () => {
  assert.equal(PLANTILLAS.length, 12)
  const vacio = catalogoGenerico(null)
  assert.ok(vacio.every(c => c.conectada === false && c.falta && c.fuente === 'Sin fuente todavía'))
  for (const c of vacio) {
    assert.ok(c.tipos.includes(c.tipo), c.id)
    assert.ok(c.ejemplos.length > 0, c.id)
    if (c.alarma) { assert.ok(c.propone?.dolor && c.propone.placer, `${c.id} sin propuesta`); assert.equal(c.tipo, 'linea') }
  }
  for (const id of Object.values(CONSULTA_DEL_ORGANO)) assert.ok(consultaEn(vacio, id!), id)
  const v = validarFuentes(leerJson('bi-fuentes.json'))
  assert.deepEqual(v.errores, [])
  const cat = catalogoGenerico(v.archivo)
  assert.deepEqual(cat.filter(c => !c.conectada).map(c => c.id).sort(), ['bajas', 'clientes-nuevos'])
  const entregas = consultaEn(cat, 'entregas')!
  assert.equal(entregas.nombre, 'Pedidos a domicilio')
  assert.deepEqual(entregas.palabras, ['pedido', 'pedidos'])
  assert.equal(consultaEn(cat, 'ingresos')!.moneda, 'MXN')
  assert.equal(consultaEn(cat, 'lo-mas-vendido')!.unidad, 'dinero')
  assert.match(consultaEn(cat, 'ventas')!.fuente, /Ventas del punto de venta · CSV/)
  // El tablero de ejemplo valida contra ese catálogo.
  assert.deepEqual(validarBI(leerJson('bi.json'), cat).errores, [])
  // Y el embudo y la voz del cliente de ejemplo son válidos para Tu negocio.
  assert.ok(validarEmbudo(leerJson('embudo.json')).ok)
  assert.equal(leerVoz(leerJson('voz-del-cliente.json')).errores.length, 0)
})

test('la cuenta: dentro de lo que cubre la fuente un día sin filas es 0; fuera, sin medir; el promedio sin ventas no existe', () => {
  const fuente: Fuente = { id: 'v', tipo: 'csv', ruta: 'x.csv', fecha: 'fecha' }
  const lote: Lote = { columnas: ['fecha', 'total', 'folio'], viva: false, filas: [
    ['2026-11-01', '100', 'A'], ['2026-11-01', '50', 'A'], ['2026-11-01', '30', 'B'], ['2026-11-03', 'n/d', 'C'], ['2026-11-04', '80', 'D'],
  ] }
  const corre = (forma: Parameters<typeof calcular>[0]['forma'], mapeo: Parameters<typeof calcular>[0]['mapeo']) =>
    calcular({ forma, mapeo, fuentes: [fuente], lotes: { v: lote }, ventana: 7, ayer: '2026-11-07', zona: 'America/Mexico_City' })
  const conteo = corre('conteo', { fuente: 'v', unico: 'folio' })
  assert.equal(conteo.hasta, '2026-11-04', 'un archivo llega hasta su último registro')
  assert.ok(conteo.datos.forma === 'serie')
  const por = Object.fromEntries(conteo.datos.puntos.map(p => [p.fecha, p.valor]))
  assert.equal(por['2026-11-01'], 2, 'dos folios distintos, no tres filas')
  assert.equal(por['2026-11-02'], 0, 'dentro de la cobertura, sin filas = 0')
  assert.equal(por['2026-10-31'], null, 'antes del primer registro = sin medir')
  const suma = corre('suma', { fuente: 'v', valor: 'total' })
  const s = Object.fromEntries((suma.datos as { puntos: { fecha: string; valor: number | null }[] }).puntos.map(p => [p.fecha, p.valor]))
  assert.equal(s['2026-11-01'], 180)
  assert.equal(s['2026-11-03'], null, 'un día con filas pero sin importe legible no es 0')
  const prom = corre('promedio', { fuente: 'v', valor: 'total', unico: 'folio' })
  const pr = Object.fromEntries((prom.datos as { puntos: { fecha: string; valor: number | null }[] }).puntos.map(p => [p.fecha, p.valor]))
  assert.equal(pr['2026-11-01'], 90, '180 entre dos ventas')
  assert.equal(pr['2026-11-02'], null, 'sin ventas no hay ticket')
  assert.throws(() => corre('suma', { fuente: 'v', valor: 'importe' }), /no tiene la columna «importe».*«total»/)
})

test('el motor sobre el café de ejemplo: series, barras, embudo y la caída del último día como señal de dolor', async () => {
  const raiz = cerebroEjemplo()
  const ahora = new Date('2026-11-08T18:00:00-06:00')
  const cat = catalogoGenerico(validarFuentes(leerJson('bi-fuentes.json')).archivo)
  const ventas = await ejecutarGenerico(raiz, 'ventas', 30, { ahora })
  assert.equal(ventas.hasta, '2026-11-07')
  const l = leer(consultaEn(cat, 'ventas')!, 'linea', 30, ventas.datos)
  assert.equal(l.estado, 'fuera')
  assert.equal(l.senal!.tono, 'dolor')
  assert.match(l.frase, /^Sáb 7 nov: 9 ventas, el día más bajo/)
  const ticket = leer(consultaEn(cat, 'ticket-promedio')!, 'linea', 30, (await ejecutarGenerico(raiz, 'ticket-promedio', 30, { ahora })).datos)
  assert.notEqual(ticket.estado, 'fuera', 'el ticket no se movió: se cayeron las ventas, no lo que deja cada una')
  const mes = leer(consultaEn(cat, 'lo-que-entro')!, 'acumulado', 30, (await ejecutarGenerico(raiz, 'lo-que-entro', 30, { ahora })).datos)
  assert.match(mes.frase, /Llevas \$[\d,]+ MXN cobrados en noviembre; a estas alturas de octubre llevabas/)
  const top = await ejecutarGenerico(raiz, 'lo-mas-vendido', 30, { ahora })
  assert.ok(top.datos.forma === 'barras')
  assert.equal(top.datos.barras.length, 7)
  assert.equal(top.datos.barras[0].etiqueta, 'Café americano')
  assert.match(leer(consultaEn(cat, 'lo-mas-vendido')!, 'barras', 30, top.datos).frase, /^Café americano va primero con \$[\d,]+ MXN \(/)
  const canal = await ejecutarGenerico(raiz, 'de-donde-llegan', 30, { ahora })
  assert.ok(canal.datos.forma === 'barras' && canal.datos.resto?.etiqueta === 'Sin dato en la fuente', 'lo que no dice su canal va aparte')
  const embudo = await ejecutarGenerico(raiz, 'embudo', 30, { ahora })
  assert.ok(embudo.datos.forma === 'embudo')
  const [a, b, c] = embudo.datos.pasos.map(p => p.valor)
  assert.ok(a > b && b > c && c > 0)
  assert.match(leer(consultaEn(cat, 'embudo')!, 'embudo', 30, embudo.datos).frase, /^De \d+ que preguntaron, \d+ compraron\. El paso más estrecho/)
  const gastos = await ejecutarGenerico(raiz, 'gastos', 30, { ahora })
  assert.ok(gastos.datos.forma === 'serie')
  // «18.500,00» de la renta del 1 de noviembre se lee como 18500, no como 18.5.
  assert.ok(gastos.datos.puntos.some(p => p.fecha === '2026-11-01' && (p.valor ?? 0) >= 18500 && (p.valor ?? 0) < 21000), 'la coma decimal y el punto de miles se leen bien')
  await assert.rejects(() => ejecutarGenerico(raiz, 'clientes-nuevos', 30, { ahora }), /todavía no tiene fuente/)
  await assert.rejects(() => ejecutarGenerico(raiz, 'visitas', 30, { ahora }), /no está en el catálogo/)
})

test('las llaves de una base: solo BI_, del entorno o de .claude/bi.env, y el entorno manda', async () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'bi-llaves-'))
  mkdirSync(path.join(raiz, '.claude'), { recursive: true })
  writeFileSync(path.join(raiz, '.claude', 'bi.env'), 'BI_POSTGRES_URL="postgres://a:b@c/d"\nANTHROPIC_API_KEY=no-se-lee\nexport BI_SB_LLAVE=xyz\n')
  const ll = await leerLlaves(raiz, { BI_SB_LLAVE: 'del-entorno', OTRA: 'x' })
  assert.deepEqual(ll, { BI_POSTGRES_URL: 'postgres://a:b@c/d', BI_SB_LLAVE: 'del-entorno' })
})

test('el pulso del alumno: sin fuente dice «conecta tu fuente»; con el ejemplo, el total de 30 días y cómo cerró el último', async () => {
  const vacio = pulsoDeConsulta('marketing', catalogoGenerico(null), {})
  assert.equal(vacio.estado, 'sin-sensor')
  assert.equal(vacio.conecta, true)
  assert.match(vacio.falta!, /interesado/)
  assert.equal(pulsoDeConsulta('venta', undefined, {}).estado, 'leyendo')
  const raiz = cerebroEjemplo()
  const archivo = validarFuentes(leerJson('bi-fuentes.json')).archivo as ArchivoFuentes
  const cat = catalogoGenerico(archivo)
  const ahora = new Date('2026-11-08T18:00:00-06:00')
  const venta = pulsoDeConsulta('venta', cat, { data: await ejecutarGenerico(raiz, 'ventas', 30, { ahora }) })
  assert.equal(venta.estado, 'numero')
  assert.match(venta.unidad!, /ventas en 30 días/)
  assert.match(venta.detalle![0], /fuera de lo normal/)
  const finanzas = pulsoDeConsulta('finanzas', cat, { data: await ejecutarGenerico(raiz, 'ingresos', 30, { ahora }) }, { c: consultaEn(cat, 'gastos'), l: { data: await ejecutarGenerico(raiz, 'gastos', 30, { ahora }) } })
  assert.match(finanzas.cifra!, /^\$[\d,]+ MXN$/)
  assert.match(finanzas.detalle!.join(' '), /Salió \$[\d,]+ MXN/)
  assert.equal(pulsoDeConsulta('entrega', cat, { data: await ejecutarGenerico(raiz, 'entregas', 30, { ahora }) }).pregunta, '¿Le cumples a tus clientes?')
  assert.equal(pulsoSistemasCliente({ data: { tasks: [] } }).estado, 'sin-sensor')
  const s = pulsoSistemasCliente({ data: { tasks: [
    { id: 'a', prompt: 'x', schedule: '0 9 * * *', status: 'active', next_run: null, last_run: 1, last_result: 'listo' },
    { id: 'b', prompt: 'y', schedule: '0 9 * * *', status: 'active', next_run: null, last_run: 1, last_result: 'Error: sin llave' },
    { id: 'c', prompt: 'z', schedule: '0 9 * * *', status: 'paused', next_run: null, last_run: null, last_result: null },
  ] } })
  assert.equal(s.cifra, '1')
  assert.match(s.detalle!.join(' '), /De 2 rutinas activas.*1 falló/)
})

test('la CLI del alumno: siembra el ejemplo, dice qué tiene fuente, lee una consulta y responde con una gráfica', () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'bi-cli-'))
  mkdirSync(path.join(raiz, '.claude', 'memory'), { recursive: true })
  writeFileSync(path.join(raiz, '.claude', 'memory', 'MEMORY.md'), '#')
  const cli = (...a: string[]) => execFileSync('npx', ['--yes', 'tsx', path.join(__dirname, '..', '..', 'scripts', 'bi.ts'), ...a], { env: { ...process.env, BI_RAIZ: raiz, ARBRAIN_EDICION: 'cliente' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.match(cli('fuentes'), /el motor está vacío/)
  assert.match(cli('ejemplo'), /Sembré/)
  assert.match(cli('ejemplo'), /No toqué los que ya tenías/)
  assert.match(cli('fuentes'), /■ ventas · Ventas ← Ventas del punto de venta · CSV/)
  assert.match(cli('catalogo'), /clientes-nuevos · Clientes nuevos \[SIN FUENTE\]/)
  assert.match(cli('leer', '--consulta', 'lo-mas-vendido', '--ventana', '7'), /va primero con \$[\d,]+ MXN/)
  assert.match(cli('validar'), /Fuentes OK/)
  cli('responder', '--pregunta', '¿Cuánto gasté esta semana?', '--consulta', 'gastos', '--ventana', '7')
  const v = validarBI(JSON.parse(readFileSync(path.join(raiz, RUTA_BI), 'utf8')), catalogoGenerico(validarFuentes(JSON.parse(readFileSync(path.join(raiz, RUTA_FUENTES), 'utf8'))).archivo))
  assert.deepEqual(v.errores, [])
  assert.equal(v.graficas.at(-1)!.estado, 'respuesta')
  assert.equal(v.graficas.at(-1)!.fuente, 'Hoja de gastos · CSV')
  assert.throws(() => cli('responder', '--pregunta', '¿x?', '--consulta', 'visitas'))
  assert.equal(JSON.parse(readFileSync(path.join(raiz, RUTA_BI), 'utf8')).esquema, ESQUEMA_BI)
})
