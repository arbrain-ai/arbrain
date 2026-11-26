/** Stats Royale · la lógica de pantalla de «Tu canal» (coronas, arenas, ligas, fecha de cálculo) y el contrato que pinta. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DUENO } from '../../src/config'
import { anchoMedidor, CARTAS, casillas, coronasDe, lecturaDelJuego, marcarTuyo, nombreFormato, ordenarMazos, posicionArena, resumenCoronas, textoVeredicto, ventanaLiga, type Arena, type FilaRanking, type Juego } from '../../src/features/contenido/juego'

const ARENAS: Arena[] = [[0, 'Sin partidas'], [1, 'Bronce'], [10_000, 'Plata'], [50_000, 'Oro'], [150_000, 'Platino'], [400_000, 'Diamante'], [1_000_000, 'Maestro'], [2_500_000, 'Leyenda']]
  .map(([desde, nombre], numero) => ({ desde: desde as number, nombre: nombre as string, numero }))

const fila = (lugar: number, o: Partial<FilaRanking> = {}): FilaRanking => ({ lugar, channel_id: `UC${lugar}`, nombre: `Canal ${lugar}`, trofeos: 1000 * (100 - lugar), largos_28d: 4, arena: 3, tuyo: false, ...o })

test('coronas: 0 a 3 tal como vienen; null es «en juego» (menos de 24 h)', () => {
  assert.equal(coronasDe({ coronas: 2 }), 2)
  assert.equal(coronasDe({ coronas: 0 }), 0)
  assert.equal(coronasDe({ coronas: null }), null)
  assert.equal(coronasDe({ coronas: 7 }), 3)
  const r = resumenCoronas([{ coronas: 3 }, { coronas: 3 }, { coronas: 2 }, { coronas: 1 }, { coronas: 0 }, { coronas: null }])
  assert.deepEqual(r, { total: 9, tres: 2, dos: 1, una: 1, cero: 1, enJuego: 1 })
})

test('arenas: cada una ocupa el mismo tramo de la escalera y Leyenda la llena', () => {
  assert.equal(posicionArena(0, ARENAS), 0)
  // Justo en el corte de una arena = el inicio de su tramo (8 tramos de 1/8).
  assert.equal(posicionArena(10_000, ARENAS), 2 / 8)
  assert.equal(posicionArena(150_000, ARENAS), 4 / 8)
  assert.equal(posicionArena(5_000_000, ARENAS), 1)
  // Dentro de Plata (10 K a 50 K) avanza en escala log, siempre dentro de su tramo y en orden.
  const a = posicionArena(20_000, ARENAS), b = posicionArena(40_000, ARENAS)
  assert.ok(a > 2 / 8 && a < b && b < 3 / 8, `${a} ${b}`)
  // El orden de las arenas no importa.
  assert.equal(posicionArena(150_000, [...ARENAS].reverse()), 4 / 8)
})

test('liga: el podio y la vecindad del dueño, con el hueco marcado', () => {
  const filas = Array.from({ length: 30 }, (_, i) => fila(i + 1, i === 19 ? { tuyo: true, nombre: 'Fulano' } : {}))
  const v = ventanaLiga(filas, 2)
  const lugares = v.map(x => ('hueco' in x ? `·${x.hueco}` : x.lugar))
  assert.deepEqual(lugares, [1, 2, 3, '·14', 18, 19, 20, 21, 22])
  // El dueño en el podio: sin hueco ni repetidos.
  const arriba = ventanaLiga(Array.from({ length: 10 }, (_, i) => fila(i + 1, i === 1 ? { tuyo: true } : {})), 2)
  assert.deepEqual(arriba.map(x => ('hueco' in x ? 'h' : x.lugar)), [1, 2, 3, 4])
  // Empates comparten lugar (el cuartel los manda así) y no se pierden filas.
  const empate = [fila(1), fila(2), fila(3, { trofeos: 0 }), fila(3, { trofeos: 0, channel_id: 'UCd', tuyo: true })]
  assert.equal(ventanaLiga(empate, 3).filter(x => !('hueco' in x)).length, 4)
})

test('fecha de cálculo: «hoy HH:MM» en hora de México y viejo después de 30 h', () => {
  const ahora = Date.parse('2026-11-19T18:00:00Z')
  assert.deepEqual(lecturaDelJuego('2026-11-19T15:47:09Z', ahora), { texto: 'hoy 09:47', viejo: false })
  assert.equal(lecturaDelJuego('2026-11-18T06:00:00Z', ahora).viejo, true)
  assert.equal(lecturaDelJuego(null, ahora).viejo, true)
})

test('veredicto y cartas: el orden del árbol del PLAN 80/20', () => {
  assert.deepEqual(CARTAS.map(c => c.carta), ['tema', 'empaque', 'gancho', 'cuerpo', 'promesa'])
  assert.equal(textoVeredicto({ veredicto: 'tema' }).titulo, 'Se quedó corto en tema')
  assert.equal(textoVeredicto({ veredicto: 'ninguna' }).titulo, 'Ninguna métrica abajo')
  assert.match(textoVeredicto({ veredicto: 'sin_datos' }).titulo, /Sin datos/)
  assert.equal(anchoMedidor(1), 0.5)
  assert.equal(anchoMedidor(5), 1)
  assert.equal(anchoMedidor(null), 0)
})

test('la fila del dueño: se marca por la clave de la instalación, sin nombres en el código', () => {
  const j = { rankings: { hispana: [{ ...fila(1), tuyo: undefined, es_fulano: true }, { ...fila(2), tuyo: undefined }] } } as unknown as Juego
  const m = marcarTuyo(j, 'fulano')
  assert.deepEqual(m.rankings.hispana!.map(f => f.tuyo), [true, false])
  assert.deepEqual(marcarTuyo(j, 'mengano').rankings.hispana!.map(f => f.tuyo), [false, false])
})

test('mazos: por tasa de coronas y, a igual tasa, el de más videos; nombres en español', () => {
  const m = (formato: string, tasa_coronas: number, videos: number) => ({ formato, tasa_coronas, videos, con_corona: 0, coronas: 0, coronas_por_video: 0 })
  assert.deepEqual(ordenarMazos([m('a', 0.5, 2), m('b', 0.75, 4), m('c', 0.5, 8)]).map(x => x.formato), ['b', 'c', 'a'])
  assert.equal(nombreFormato('explicacion'), 'Explicación')
  assert.equal(nombreFormato(null), 'Sin formato')
  assert.deepEqual(casillas(2, 3), [true, true, false])
})

// El archivo vivo del Studio, si esta máquina lo tiene: lo que la pantalla lee existe con la forma del contrato.
const vivo = [process.env.BUSINESS_OS_ROOT, path.join(process.cwd(), '..'), path.join(process.env.HOME ?? '', 'Developer/artificial-brain')]
  .filter(Boolean).map(r => path.join(r as string, 'arbrain/server/store/cuartel/vistas/juego.json')).find(existsSync)
test('contrato cuartel.juego/1: el archivo vivo trae lo que la pantalla pinta', { skip: !vivo && 'sin juego.json en esta máquina' }, () => {
  const j = marcarTuyo(JSON.parse(readFileSync(vivo!, 'utf8')) as Juego, DUENO())
  assert.match(j.esquema, /^cuartel\.juego\//)
  assert.equal(typeof j.perfil.trofeos, 'number')
  assert.ok(j.perfil.ligas.hispana && j.perfil.ligas.mundial)
  assert.ok(j.arenas.length >= 2)
  for (const p of j.partidas) assert.ok(p.coronas === null || (p.coronas >= 0 && p.coronas <= 3))
  for (const l of ['hispana', 'mundial'] as const) {
    const xs = j.rankings[l] ?? []
    assert.ok(xs.some(f => f.tuyo), `el dueño en la liga ${l}`)
    assert.equal(xs.find(f => f.tuyo)!.lugar, j.perfil.ligas[l]!.lugar)
  }
  if (j.repeticion) for (const m of j.repeticion.medidores) assert.ok(CARTAS.some(c => c.carta === m.carta))
})
