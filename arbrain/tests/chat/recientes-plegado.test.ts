import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { alternarDia, diaAbierto, filasVisibles, type DiasAbiertos } from '../../src/features/chat/lib/recientes-plegado'
import { agruparPorDia } from '../../src/features/chat/lib/recientes-lista'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

const AHORA = new Date(2026, 9, 2, 7, 0).getTime() // viernes 2 oct 2026
const hace = (dias: number, h = 12) => new Date(2026, 9, 2 - dias, h).getTime()
let n = 0
const ses = (cuando: number, id = `s${++n}`): ChatSession => {
  const iso = new Date(cuando).toISOString()
  return { id, title: `conversación ${id}`, is_favorite: false, profile_id: null, created_at: iso, updated_at: iso, last_message_at: iso }
}
const grupos = () => agruparPorDia([ses(hace(0, 9), 'a'), ses(hace(0, 8), 'b'), ses(hace(1), 'c'), ses(hace(2), 'd')], AHORA)

test('al abrir la app todo arranca plegado: sin entradas, ningún día está abierto', () => {
  const vacio: DiasAbiertos = {}
  for (const g of grupos()) assert.equal(diaAbierto(vacio, g.clave), false)
  assert.deepEqual(grupos().map((g) => g.etiqueta), ['Hoy', 'Ayer', 'Hace 2 días'])
})

test('abrir a mano se recuerda y plegar de nuevo lo olvida; no muta el estado anterior', () => {
  const g = grupos()
  const base: DiasAbiertos = {}
  const conHoy = alternarDia(base, g[0].clave)
  assert.equal(diaAbierto(conHoy, g[0].clave), true)
  assert.equal(diaAbierto(conHoy, g[1].clave), false, 'abrir Hoy no abre Ayer')
  assert.deepEqual(base, {}, 'el original no cambia')
  const otraVez = alternarDia(conHoy, g[0].clave)
  assert.equal(diaAbierto(otraVez, g[0].clave), false)
  assert.deepEqual(otraVez, {})
  assert.deepEqual(conHoy, { [g[0].clave]: true }, 'tampoco muta el que se pasó')
})

test('lo abierto sigue abierto tras la medianoche porque la llave es la fecha, no la etiqueta', () => {
  const abiertos = alternarDia({}, grupos()[0].clave) // abierto cuando era «Hoy» (2 oct)
  const manana = new Date(2026, 9, 3, 0, 30).getTime()
  const g = agruparPorDia([ses(hace(0, 9), 'a'), ses(hace(0, 8), 'b')], manana)
  assert.equal(g[0].etiqueta, 'Ayer')
  assert.equal(diaAbierto(abiertos, g[0].clave), true)
})

test('día abierto: todas sus filas; plegado: ninguna', () => {
  const [hoy] = grupos()
  assert.deepEqual(filasVisibles(hoy, true).map((s) => s.id), ['a', 'b'])
  assert.deepEqual(filasVisibles(hoy, false), [])
})
