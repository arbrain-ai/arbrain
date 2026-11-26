import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { decidirVida, enPantalla, MAX_VIVAS } from '../../src/features/canvas/islas/vida'
import { PuenteIslas, FRENO_ACCIONES_MS, type Ventana } from '../../src/features/canvas/islas/puente'
import { leerFuente, type LecturaFuente, type UrlsApp } from '../../src/features/canvas/islas/fuentes'
import type { FichaIsla } from '../../src/features/canvas/islas/protocolo'
import type { DestinoIsla } from '../../src/features/canvas/islas/destinos'

const VP = { width: 1600, height: 1000 }
// Seis islas de 1440×900 en una fila, separadas 200.
const ISLAS = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, caja: { x: i * 1640, y: 0, width: 1440, height: 900 } }))
const sobre = (i: number, zoom = 1) => ({ x: i * 1640 + 720, y: 450, zoom })

test('islas · vida: en movimiento todas duermen y nada se monta ni desmonta', () => {
  const d = decidirVida(['i0', 'i1'], ISLAS, sobre(0), VP, true)
  assert.deepEqual(d, { lru: ['i0', 'i1'], despiertas: [] })
})

test('islas · vida: en reposo despierta la que ocupa la vista; de lejos, ninguna', () => {
  const cerca = decidirVida([], ISLAS, sobre(2), VP, false)
  assert.deepEqual(cerca.despiertas, ['i2'])
  assert.ok(cerca.lru.includes('i2'))
  // De lejos (todo el mapa en pantalla) cada isla mide ~150 px: fotos, nadie despierta.
  const lejos = decidirVida([], ISLAS, { x: 4800, y: 450, zoom: 0.1 }, VP, false)
  assert.deepEqual(lejos.despiertas, [])
})

test('islas · vida: nunca más de MAX_VIVAS montadas; la menos reciente se va y una despierta nunca', () => {
  let lru: string[] = []
  for (const i of [0, 1, 2, 3, 4, 5]) {
    const d = decidirVida(lru, ISLAS, sobre(i), VP, false)
    lru = d.lru
    assert.ok(lru.length <= MAX_VIVAS)
    for (const id of d.despiertas) assert.ok(lru.includes(id))
  }
  assert.equal(lru.at(-1), 'i5')
  assert.ok(!lru.includes('i0'), 'la primera visitada salió del LRU')
})

test('islas · vida: con varias a la vista despiertan las que más cubren (máximo 4)', () => {
  const muchas = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, caja: { x: (i % 4) * 400, y: Math.floor(i / 4) * 260, width: 380, height: 237 } }))
  const d = decidirVida([], muchas, { x: 790, y: 250, zoom: 1 }, VP, false)
  assert.ok(d.despiertas.length <= 4)
  assert.ok(d.lru.length <= 4)
  const p = enPantalla(muchas[0].caja, { x: 790, y: 250, zoom: 1 }, VP)
  assert.ok(p.cubre > 0 && p.cubre < 1)
})

test('islas · vida: una isla que ya no existe sale del LRU', () => {
  const d = decidirVida(['fantasma', 'i1'], ISLAS, sobre(1), VP, false)
  assert.ok(!d.lru.includes('fantasma'))
})

// ── el puente ──

class VentanaFalsa implements Ventana {
  recibidos: Array<Record<string, unknown>> = []
  postMessage(m: unknown) { this.recibidos.push(m as Record<string, unknown>) }
  de(tipo: string) { return this.recibidos.filter(m => m.tipo === tipo) }
}
const FICHA: FichaIsla = { id: 'ej', titulo: 'Ejemplo', ancho: 1440, alto: 900, fuentes: ['pulso:venta'], acciones: [] }
const espera = () => new Promise(r => setTimeout(r, 0))

function armar(lecturas: Record<string, LecturaFuente>) {
  const abiertos: DestinoIsla[] = []
  const fotos: string[] = []
  const medidas: Array<[string, Record<string, unknown>]> = []
  let t = 1000
  let lecturasHechas = 0
  const p = new PuenteIslas({
    leerFuente: async f => { lecturasHechas++; return lecturas[f] ?? { estado: 'desconocida', valor: null, fecha: null } },
    abrir: d => { abiertos.push(d) },
    quiereFoto: () => true,
    alFoto: (_i, _b, h) => { fotos.push(h) },
    medir: (e, d) => { medidas.push([e, d]) },
    ahora: () => t,
  })
  return { p, abiertos, fotos, medidas, avanzar: (ms: number) => { t += ms }, lecturas: () => lecturasHechas }
}

test('islas · puente: un mensaje de una ventana que no es isla se ignora', () => {
  const { p } = armar({})
  assert.equal(p.recibir({}, { tipo: 'accion', destino: 'panel:finanzas' }), false)
})

test('islas · puente: hola → bienvenida con tema y vida; pedir → leyendo y luego el dato', async () => {
  const { p } = armar({ 'pulso:venta': { estado: 'ok', valor: { cifra: '7' }, fecha: '2026-11-14T10:00:00Z' } })
  const w = new VentanaFalsa()
  p.ponerTema('claro')
  p.registrar('ej', 'docs/x/index.html', 'h1', FICHA, w, false)
  p.recibir(w, { tipo: 'hola', v: 1 })
  assert.deepEqual(w.de('bienvenida')[0], { tipo: 'bienvenida', v: 1, id: 'ej', despierta: false, modo: 'claro' })
  p.recibir(w, { tipo: 'pedir', fuente: 'pulso:venta' })
  assert.equal(w.de('datos')[0].estado, 'leyendo')
  await espera()
  const ultimo = w.de('datos').at(-1)!
  assert.equal(ultimo.estado, 'ok')
  assert.deepEqual(ultimo.valor, { cifra: '7' })
})

test('islas · puente: un canal con caché — dos islas, una lectura; refrescar solo re-envía lo que cambió', async () => {
  const lect: Record<string, LecturaFuente> = { 'pulso:venta': { estado: 'ok', valor: { cifra: '7' }, fecha: null } }
  const { p, lecturas } = armar(lect)
  const a = new VentanaFalsa(), b = new VentanaFalsa()
  p.registrar('a', 'a.html', 'h', FICHA, a, true); p.registrar('b', 'b.html', 'h', FICHA, b, true)
  for (const w of [a, b]) { p.recibir(w, { tipo: 'hola' }); p.recibir(w, { tipo: 'pedir', fuente: 'pulso:venta' }) }
  await espera()
  assert.equal(lecturas(), 1, 'la segunda isla comparte la lectura en vuelo')
  const antes = a.de('datos').length
  await p.refrescar()
  assert.equal(a.de('datos').length, antes, 'mismo valor: no se re-envía')
  lect['pulso:venta'] = { estado: 'ok', valor: { cifra: '8' }, fecha: null }
  await p.refrescar()
  assert.deepEqual(a.de('datos').at(-1)!.valor, { cifra: '8' })
  assert.deepEqual(b.de('datos').at(-1)!.valor, { cifra: '8' })
})

test('islas · puente: un error de lectura no borra el último dato bueno', async () => {
  const lect: Record<string, LecturaFuente> = { 'pulso:venta': { estado: 'ok', valor: { cifra: '7' }, fecha: null } }
  const { p } = armar(lect)
  const w = new VentanaFalsa()
  p.registrar('a', 'a.html', 'h', FICHA, w, true); p.recibir(w, { tipo: 'hola' }); p.recibir(w, { tipo: 'pedir', fuente: 'pulso:venta' })
  await espera()
  lect['pulso:venta'] = { estado: 'error', valor: null, fecha: null, error: 'sin red' }
  await p.refrescar()
  assert.equal(w.de('datos').at(-1)!.estado, 'ok')
})

test('islas · puente: acciones solo de una isla despierta, en lista blanca y con freno', () => {
  const { p, abiertos, medidas, avanzar } = armar({})
  const w = new VentanaFalsa()
  p.registrar('a', 'a.html', 'h', FICHA, w, false)
  p.recibir(w, { tipo: 'hola' })
  p.recibir(w, { tipo: 'accion', destino: 'panel:finanzas' })
  assert.equal(abiertos.length, 0, 'dormida no abre nada')
  p.vida('a', true)
  p.recibir(w, { tipo: 'accion', destino: 'panel:finanzas' })
  p.recibir(w, { tipo: 'accion', destino: 'panel:finanzas' })
  assert.equal(abiertos.length, 1, 'el doble disparo se frena')
  avanzar(FRENO_ACCIONES_MS + 1)
  p.recibir(w, { tipo: 'accion', destino: 'url:https://sitio-malo.example/' })
  assert.equal(abiertos.length, 1)
  assert.ok(medidas.some(([e]) => e === 'accion-rechazada'))
  avanzar(FRENO_ACCIONES_MS + 1)
  p.recibir(w, { tipo: 'accion', destino: 'url:https://polar.sh/dashboard/mi-organizacion' })
  assert.deepEqual(abiertos.at(-1), { tipo: 'url', url: 'https://polar.sh/dashboard/mi-organizacion' })
})

test('islas · puente: despertar mide su latencia; listo con datos pide la foto con su huella', async () => {
  const { p, medidas, fotos, avanzar } = armar({ 'pulso:venta': { estado: 'ok', valor: { cifra: '7' }, fecha: null } })
  const w = new VentanaFalsa()
  p.registrar('a', 'a.html', 'h', FICHA, w, false)
  p.recibir(w, { tipo: 'hola' })
  p.vida('a', true)
  const pedido = w.de('despertar').at(-1)!.pedido
  avanzar(23)
  p.recibir(w, { tipo: 'despierta', pedido })
  assert.deepEqual(medidas.find(([e]) => e === 'despertar')![1], { isla: 'a', ms: 23 })
  p.recibir(w, { tipo: 'pedir', fuente: 'pulso:venta' })
  p.recibir(w, { tipo: 'listo' })
  assert.equal(w.de('foto').length, 0, 'aún leyendo: no es su estado final')
  await espera()
  p.recibir(w, { tipo: 'listo' })
  const pf = w.de('foto').at(-1)!.pedido
  p.recibir(w, { tipo: 'foto', pedido: pf, bitmap: { width: 1440, height: 900 }, ancho: 1440, alto: 900 })
  assert.equal(fotos.length, 1)
  assert.equal(fotos[0], p.huella('a'))
})

test('islas · puente: cambiar el tema avisa a todas y cambia la huella', () => {
  const { p } = armar({})
  const w = new VentanaFalsa()
  p.registrar('a', 'a.html', 'h', FICHA, w, true); p.recibir(w, { tipo: 'hola' })
  const h1 = p.huella('a')
  p.ponerTema('claro')
  assert.deepEqual(w.de('tema').at(-1), { tipo: 'tema', modo: 'claro' })
  assert.notEqual(p.huella('a'), h1)
})

// ── las fuentes ──

const URLS: UrlsApp = { cohorte: '/c', finanzas: '/f', rutinas: '/r', trabajos: '/t', marketing: '/m', comprador: '/co', embudo: '/e', marcador: '/ml', bi: '/bi', bandeja: '/d', mrr: '/mrr' }

test('islas · fuentes: un Pulso sin sensor llega como sin-dato, con su valor (qué falta), nunca 0', async () => {
  const r = await leerFuente('pulso:entrega', URLS, { directo: false, cliente: false }, async () => ({ data: { cupo: 10, numeros: { cuposPagados: 3, llamadas: null }, fundadores: [] } }))
  assert.equal(r.estado, 'sin-dato')
  assert.equal((r.valor as { estado: string }).estado, 'sin-sensor')
  assert.equal(r.fecha, null)
})

test('islas · fuentes: modo directo no pide cohorte ni finanzas', async () => {
  const pedidas: string[] = []
  const leer = async (u: string) => { pedidas.push(u); return { data: {} } }
  const v = await leerFuente('pulso:venta', URLS, { directo: true, cliente: false }, leer)
  const f = await leerFuente('finanzas:resumen', URLS, { directo: true, cliente: false }, leer)
  assert.equal(v.estado, 'oculto'); assert.equal(f.estado, 'oculto')
  assert.deepEqual(pedidas, [])
})

test('islas · fuentes: cohorte:resumen cuenta sin nombres; error de red es error, no cero', async () => {
  const datos = { cupo: 10, numeros: { cuposPagados: 7, llamadas: { total: 9, presento: 6, noLlego: 1, canceladas: 2, porVenir: 0, sinMarca: 0 } },
    fundadores: [{ cerebro: true, atorado: null, nombre: 'Fulano' }, { cerebro: null, atorado: 'paso 2', nombre: 'Mengano' }] }
  const r = await leerFuente('cohorte:resumen', URLS, { directo: false, cliente: false }, async () => ({ data: datos }))
  assert.deepEqual(r.valor, { cupo: 10, cuposPagados: 7, llamadas: { total: 9, presento: 6 }, fundadores: 2, conectados: 1, atorados: 1, semana1: null })
  assert.ok(!JSON.stringify(r.valor).includes('Fulano'))
  const e = await leerFuente('cohorte:resumen', URLS, { directo: false, cliente: false }, async () => ({ error: 'La fuente respondió 500.' }))
  assert.deepEqual([e.estado, e.valor, e.error], ['error', null, 'La fuente respondió 500.'])
})

test('islas · fuentes: sistemas lee rutinas y trabajos; una fuente inexistente es «desconocida»', async () => {
  const pedidas: string[] = []
  await leerFuente('pulso:sistemas', URLS, { directo: false, cliente: false }, async u => { pedidas.push(u); return { data: { jobs: [], runs: [] } } })
  assert.deepEqual(pedidas.sort(), ['/r', '/t'])
  const d = await leerFuente('pulso:inventado', URLS, { directo: false, cliente: false }, async () => ({ data: 1 }))
  assert.equal(d.estado, 'desconocida')
})
