import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  detectar, fotoAgentes, fotoCohorte, fotoMovimientos, fotoRutinas, fotoVideos, impulsosDe, islaDeOrgano, puntoEn, type Foto,
} from '../../src/features/canvas/islas/eventos'

const crons = (runs: Array<[string, string, string]>) => ({ jobs: [{ id: 'j1', name: 'Reporte de la mañana' }], runs: runs.map(([id, job_id, status]) => ({ id, job_id, status, created_at: '' })) })

test('islas · eventos: la primera lectura es línea base; sin foto previa no hay impulsos', () => {
  const ahora: Foto = { rutinas: fotoRutinas(crons([['r1', 'j1', 'ok']])), cohorte: fotoCohorte({ numeros: { cuposPagados: 7 }, fundadores: [] }) }
  assert.deepEqual(detectar({}, ahora, 1), [])
})

test('islas · eventos: una corrida nueva es un impulso de sistemas; si falló, duele', () => {
  const a: Foto = { rutinas: fotoRutinas(crons([['r1', 'j1', 'ok']])) }
  const b: Foto = { rutinas: fotoRutinas(crons([['r1', 'j1', 'ok'], ['r2', 'j1', 'error'], ['r3', 'j1', 'running']])) }
  const e = detectar(a, b, 5)
  assert.equal(e.length, 1, 'la corrida en curso no cuenta hasta terminar')
  assert.deepEqual(e[0], { tipo: 'rutina', organo: 'sistemas', texto: 'Falló: Reporte de la mañana', fuente: 'Taller · rutinas', en: 5, dolor: true })
})

test('islas · eventos: un cobro sube los lugares pagados; un cerebro conectado es entrega', () => {
  const a: Foto = { cohorte: fotoCohorte({ numeros: { cuposPagados: 7 }, fundadores: [{ cerebro: true }, { cerebro: null }] }) }
  const b: Foto = { cohorte: fotoCohorte({ numeros: { cuposPagados: 8 }, fundadores: [{ cerebro: true }, { cerebro: true }] }) }
  assert.deepEqual(detectar(a, b, 9).map(x => [x.tipo, x.organo, x.fuente]), [['cobro', 'venta', 'Polar · cohorte'], ['cerebro', 'entrega', 'La plataforma · cohorte']])
  // Polar sin respuesta (null) no es «bajaron a cero» ni un cobro.
  assert.deepEqual(detectar(a, { cohorte: fotoCohorte({ numeros: { cuposPagados: null }, fundadores: [] }) }, 9), [])
})

test('islas · eventos: agentes que empiezan y terminan; videos y movimientos nuevos', () => {
  const ag = (estado: string) => fotoAgentes({ terminales: [{ id: 3, titulo: 'mapa v16', estado, subagente: {} }], internas: [] })
  assert.match(detectar({ agentes: new Map() }, { agentes: ag('trabajando') }, 1)[0].texto, /Empezó: mapa v16/)
  assert.match(detectar({ agentes: ag('trabajando') }, { agentes: ag('lista') }, 1)[0].texto, /Terminó: mapa v16/)
  const v = (ids: string[]) => fotoVideos({ activo: true, videos: ids.map(id => ({ id, estado: 'publico' })) })
  assert.deepEqual(detectar({ videos: v(['a']) }, { videos: v(['a', 'b']) }, 1).map(x => x.texto), ['Salió un video'])
  const m = (ids: string[]) => fotoMovimientos({ movements: ids.map(id => ({ id })) })
  assert.deepEqual(detectar({ movimientos: m(['x']) }, { movimientos: m(['x', 'y', 'z']) }, 1).map(x => [x.organo, x.texto]), [['finanzas', '2 movimientos nuevos']])
})

test('islas · eventos: una avalancha se resume en un impulso por órgano', () => {
  const a: Foto = { rutinas: fotoRutinas(crons([])) }
  const b: Foto = { rutinas: fotoRutinas(crons(Array.from({ length: 20 }, (_, i) => [`r${i}`, 'j1', 'ok'] as [string, string, string]))) }
  const e = detectar(a, b, 1)
  assert.equal(e.length, 1)
  assert.match(e[0].texto, /y más$/)
})

test('islas · impulsos: viajan por los hilos de la isla del órgano, alejándose de ella', () => {
  const islas = [{ elId: 'isla-venta', id: 'venta' }, { elId: 'otra', organo: 'finanzas' }]
  assert.equal(islaDeOrgano('venta', islas), 'isla-venta')
  assert.equal(islaDeOrgano('finanzas', islas), 'otra')
  assert.equal(islaDeOrgano('marketing', islas), null)
  const conectores = [{ id: 'h1', fromId: 'isla-marketing', toId: 'isla-venta' }, { id: 'h2', fromId: 'isla-venta', toId: 'isla-entrega' }, { id: 'h3', fromId: 'a', toId: 'b' }]
  const ev = { tipo: 'cobro' as const, organo: 'venta', texto: 'x', fuente: 'Polar', en: 0 }
  assert.deepEqual(impulsosDe(ev, 'isla-venta', conectores, 10).map(i => [i.conector, i.reverso]), [['h1', true], ['h2', false]])
  assert.deepEqual(puntoEn([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 0.75), { x: 10, y: 5 })
  assert.deepEqual(puntoEn([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0), { x: 0, y: 0 })
})
