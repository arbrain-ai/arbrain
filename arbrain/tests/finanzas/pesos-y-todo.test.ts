/**
 * Finanzas en tiempo real (5 nov 2026): cada movimiento vale en pesos lo que valió SU día, el rango «Todo» llega hasta el
 * primer movimiento sin el tope de 13 meses, y ninguna lectura de movimientos se trunca en las 1000 filas de PostgREST.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcularV2 } from '../../src/features/finances/lib/agregados'
import { clasificar, fuenteEstado, POLAR_EXACTO_DESDE } from '../../src/features/finances/lib/granularidad'
import { agruparMovimientos, mesesDelRango, mesesGrafica, mesAnterior } from '../../src/features/finances/lib/modelo'
import { esRango, pesosDe, RANGOS, urlFinanzas } from '../../src/features/finances/lib/finanzas'
import { tienesHoy } from '../../src/features/finances/lib/tienes'
import { leerTodas, type PaginaPostgrest } from '../../src/features/finances/lib/paginar'
import { incomeColor } from '../../src/features/finances/lib/financeColors'
import { INCOME_SOURCES, type FinanceAccount, type FinanceMovement, type FinanceSnapshot } from '../../src/features/finances/types/finances'

let id = 0
const mov = (o: Partial<FinanceMovement>): FinanceMovement => ({ id: `m${++id}`, date: '2026-09-01', type: 'gasto', account_id: 'a', counter_account_id: null, currency: 'MXN', amount: 100,
  counter_currency: null, counter_amount: null, category: 'otros', note: null, registered_by: 'levy', is_correction: false, corrects_movement_id: null, created_at: '', ...o })
const polar = (date: string, usd: number, mxn?: number) => mov({ date, type: 'ingreso', currency: 'USD', amount: usd, category: 'Polar', registered_by: 'polar-sync', account_id: 'polar',
  account_name: 'Polar', note: `Revenue Polar del día [polar-daily:${date}]`, ...(mxn != null ? { counter_currency: 'MXN', counter_amount: mxn } : {}) })
const fxDe = (usd_mxn: number) => ({ usd_mxn, eur_mxn: usd_mxn * 1.1, eur_usd: 1.1 })

describe('finanzas · pesos del día', () => {
  it('un movimiento con contraparte MXN vale esa cifra; sin ella, el tipo de cambio que se le pase', () => {
    assert.equal(pesosDe({ amount: 10, currency: 'USD', counter_currency: 'MXN', counter_amount: 171.5 }, fxDe(20)), 171.5)
    assert.equal(pesosDe({ amount: 10, currency: 'USD', counter_currency: 'MXN', counter_amount: '171.5' }, fxDe(20)), 171.5, 'numeric como texto')
    assert.equal(pesosDe({ amount: 10, currency: 'USD' }, fxDe(20)), 200)
    assert.equal(pesosDe({ amount: 10, currency: 'USD', counter_currency: 'EUR', counter_amount: 9 }, fxDe(20)), 200, 'solo la contraparte en pesos cuenta')
    assert.equal(pesosDe({ amount: 50, currency: 'MXN', counter_currency: 'MXN', counter_amount: 70 }, fxDe(20)), 50, 'lo que ya está en pesos es su monto')
    assert.equal(pesosDe({ amount: 10, currency: 'USD' }, (a, m) => (m === 'USD' ? a * 19 : a)), 190)
  })

  const movs = [
    polar('2026-09-10', 100, 1712.34), polar('2026-09-11', 50), // uno con sus pesos del día, otro sin ellos
    mov({ date: '2026-09-12', type: 'gasto', currency: 'USD', amount: 20, counter_currency: 'MXN', counter_amount: 350, category: 'suscripciones' }),
    // Un payout Polar → banco no es ni ingreso ni gasto, traiga los pesos que traiga.
    mov({ date: '2026-09-13', type: 'transferencia', currency: 'USD', amount: 100, counter_currency: 'MXN', counter_amount: 1700, counter_account_id: 'banco', account_id: 'polar' }),
  ]
  const v2 = (fx: number) => calcularV2({ context: movs, range: movs, days: 10, windowStart: new Date('2026-09-08T12:00:00Z'), fx: fxDe(fx), closeDate: null })

  it('el día, el mes y el acumulado usan los pesos de su día; la historia no se mueve con el dólar de hoy', () => {
    const a = v2(18), b = v2(21)
    assert.equal(a.daily_series.find(d => d.date === '2026-09-10')!.income_day_mxn, 1712)
    assert.equal(b.daily_series.find(d => d.date === '2026-09-10')!.income_day_mxn, 1712, 'mismo día con otro dólar de hoy: misma cifra')
    assert.equal(a.daily_series.find(d => d.date === '2026-09-11')!.income_day_mxn, 900, 'sin contraparte cae al FX vivo')
    assert.equal(a.daily_series.find(d => d.date === '2026-09-12')!.expense_day_mxn, 350)
    const sep = a.months.find(m => m.month === '2026-09')!
    assert.equal(sep.income_mxn, Math.round(1712.34 + 900))
    assert.equal(sep.expense_mxn, 350, 'la transferencia no suma como gasto')
    assert.equal(a.daily_series.find(d => d.date === '2026-09-13')!.income_day_mxn, 0, 'ni como ingreso')
  })

  it('los movimientos agrupados también', () => {
    const g = agruparMovimientos(movs, (a, m) => (m === 'USD' ? a * 21 : a), clasificar)
    const ventas = g.find(x => x.titulo === 'Ventas de Polar')!
    assert.equal(Math.round(ventas.monto), Math.round(1712.34 + 50 * 21))
    assert.equal(g.find(x => x.tipo === 'gasto')!.monto, -350)
  })

  it('«lo que tienes» suma el ingreso de Polar en sus pesos del día', () => {
    const accounts = [{ id: 'polar', name: 'Polar', kind: 'revenue' }, { id: 'banco', name: 'Banco', kind: 'banco' }] as FinanceAccount[]
    const cierre = { snapshot_date: '2026-09-01', balances: [{ account: 'Banco', currency: 'MXN', balance: 1000 }] } as unknown as FinanceSnapshot
    const t = tienesHoy(cierre, accounts, [polar('2026-09-10', 100, 1712.34)], fxDe(25), '2026-09-20')!
    assert.equal(t.mxn, 1000 + 1712)
  })

  it('el GET convierte cada gasto e ingreso con pesosDe, no con el dólar de hoy', () => {
    const src = readFileSync(join(__dirname, '../../src/app/api/finanzas/route.ts'), 'utf8')
    assert.ok(src.includes('const mxn = pesosDe(m, fx)'))
    assert.ok(!/toMxn\(m\.amount, m\.currency/.test(src), 'ningún movimiento al FX de hoy')
  })

  it('Skool es una fuente de ingreso con su color', () => {
    assert.ok((INCOME_SOURCES as readonly string[]).includes('Skool'))
    assert.equal(incomeColor('Skool'), '#0EA5E9')
    assert.notEqual(incomeColor('Skool'), incomeColor('Polar'))
  })
})

describe('finanzas · rango «Todo»', () => {
  it('es un rango válido del selector', () => {
    assert.ok(esRango('todo'))
    assert.equal(RANGOS.at(-1)!.label, 'Todo')
    assert.equal(urlFinanzas('todo'), '/api/finanzas?range=todo')
  })

  // 30 meses de historia: de mayo de 2024 a octubre de 2026.
  const hoy = '2026-10-20'
  const lista: string[] = []
  for (let ym = hoy.slice(0, 7), k = 0; k < 30; ym = mesAnterior(ym), k++) lista.unshift(ym)
  const movs = lista.flatMap(ym => [polar(`${ym}-10`, 10, 180), mov({ date: `${ym}-12`, amount: 90 })])
  const desde = movs[0].date
  const dias = Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1

  it('months no tiene tope de 13: llega al primer movimiento', () => {
    const v2 = calcularV2({ context: movs, range: movs, days: dias, windowStart: new Date(`${desde}T12:00:00Z`), fx: fxDe(18), closeDate: null })
    assert.equal(v2.months.length, 30)
    assert.equal(v2.months[0].month, lista[0])
    assert.equal(v2.daily_series.length, dias)
    assert.equal(v2.daily_series[0].date, desde)
  })

  it('la gráfica por mes dibuja los 30 meses, sin huecos en el eje', () => {
    const v2 = calcularV2({ context: movs, range: movs, days: dias, windowStart: new Date(`${desde}T12:00:00Z`), fx: fxDe(18), closeDate: null })
    const n = mesesDelRango(dias, desde, hoy)
    assert.equal(n, 30)
    const meses = mesesGrafica(v2.months, v2.coverage, hoy, n)
    assert.deepEqual(meses.map(m => m.mes), lista)
    assert.ok(meses.every(m => !m.sinDatos && m.entro === 180 && m.salio === 90))
  })

  it('los rangos fijos siguen igual', () => {
    assert.deepEqual([30, 90, 180, 365].map(d => mesesDelRango(d)), [3, 4, 7, 13])
    assert.equal(mesesDelRango(400, '2026-06-01', hoy), 13, 'nunca menos de 13 meses')
  })
})

describe('finanzas · ninguna lectura de movimientos se trunca', () => {
  /** Un PostgREST de mentira: corta en `max` filas por respuesta, tarda `ms` y cuenta cuántas consultas van en vuelo. */
  function servidor(total: number, { max = 1000, ms = 15, conteo = true } = {}) {
    const filas = Array.from({ length: total }, (_, i) => ({ id: `f${i}` }))
    const st = { llamadas: 0, enVuelo: 0, maxEnVuelo: 0 }
    const pedir = async (desde: number, hasta: number, contar: boolean): Promise<PaginaPostgrest<{ id: string }>> => {
      st.llamadas++; st.enVuelo++; st.maxEnVuelo = Math.max(st.maxEnVuelo, st.enVuelo)
      await new Promise(r => setTimeout(r, ms))
      st.enVuelo--
      return { data: filas.slice(desde, Math.min(hasta + 1, desde + max)), error: null, count: contar && conteo ? total : null }
    }
    return { pedir, st }
  }

  it('2,600 movimientos con PostgREST cortando en 1000: llegan los 2,600, sin repetir', async () => {
    const { pedir, st } = servidor(2600)
    const r = await leerTodas(pedir)
    assert.equal(r.error, null)
    assert.equal(r.data.length, 2600)
    assert.equal(new Set(r.data.map(f => f.id)).size, 2600)
    assert.equal(st.llamadas, 3)
  })

  it('rápido: después de la primera página, las demás van en paralelo (dos vueltas, no una por página)', async () => {
    const { pedir, st } = servidor(5200, { ms: 40 })
    const t0 = Date.now()
    const r = await leerTodas(pedir)
    const ms = Date.now() - t0
    assert.equal(r.data.length, 5200)
    assert.equal(st.llamadas, 6)
    assert.equal(st.maxEnVuelo, 5, 'las 5 páginas restantes salen juntas')
    assert.ok(ms < 40 * 6, `tardó ${ms} ms: en serie serían ≥ ${40 * 6}`)
  })

  it('si el servidor corta antes de lo pedido, ese corte es la página', async () => {
    const { pedir } = servidor(2600, { max: 500 })
    const r = await leerTodas(pedir)
    assert.equal(r.data.length, 2600)
    assert.equal(new Set(r.data.map(f => f.id)).size, 2600)
  })

  it('sin conteo, sigue en serie hasta una página corta', async () => {
    const { pedir } = servidor(2600, { conteo: false, ms: 1 })
    assert.equal((await leerTodas(pedir)).data.length, 2600)
  })

  it('una fila repetida entre páginas se queda una vez; un error no se esconde', async () => {
    const pedir = async (desde: number, hasta: number): Promise<PaginaPostgrest<{ id: string }>> =>
      ({ data: desde === 0 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'b' }, { id: 'c' }], error: null, count: 4 })
    assert.deepEqual((await leerTodas(pedir, { tam: 2, clave: f => f.id })).data.map(f => f.id), ['a', 'b', 'c'])
    const falla = async (desde: number): Promise<PaginaPostgrest<{ id: string }>> =>
      desde === 0 ? { data: [{ id: 'a' }], error: null, count: 3 } : { data: null, error: { message: 'se cayó' } }
    assert.equal((await leerTodas(falla, { tam: 1 })).error?.message, 'se cayó')
  })

  it('en el GET, cada select de finance_movements va paginado', () => {
    const src = readFileSync(join(__dirname, '../../src/app/api/finanzas/route.ts'), 'utf8')
    const usos = [...src.matchAll(/from\('finance_movements'\)/g)]
    assert.ok(usos.length > 0)
    for (const u of usos) {
      const cadena = src.slice(u.index!, u.index! + 400)
      assert.ok(/\.insert\(/.test(cadena.slice(0, 60)) || /\.range\(desde, hasta\)/.test(cadena), `select sin paginar: ${cadena.slice(0, 120)}`)
    }
    assert.ok(src.includes('leerTodas<FinanceMovement>('))
  })
})

describe('finanzas · cargos de las cuentas de débito y Polar por día', () => {
  // Nombres neutros: la regla vale para cualquier cuenta, no para un banco en particular.
  const cargo = (cuenta: string, date: string, periodo: string, type: FinanceMovement['type'] = 'gasto') =>
    mov({ date, type, amount: 120, account_name: cuenta, note: `Cargo de prueba [edo-cuenta-cargo:${cuenta}:${periodo}]` })
  const movs = [cargo('Banco-Debito-A', '2026-08-03', '2026-08'), cargo('Tarjeta-Debito-B', '2026-08-20', '2026-08'), cargo('Tarjeta-Debito-B', '2026-09-02', '2026-09')]
  const v2 = calcularV2({ context: movs, range: movs, days: 60, windowStart: new Date('2026-08-01T12:00:00Z'), fx: fxDe(18), closeDate: null })

  it('cuentan como cargo del día y cubren su mes, igual que la tarjeta de crédito', () => {
    for (const m of movs) assert.equal(clasificar(m).granularidad, 'dia')
    assert.equal(v2.aggregates.length, 0)
    assert.equal(v2.daily_series.find(d => d.date === '2026-08-03')!.expense_day_mxn, 120)
    assert.deepEqual(v2.coverage.statements.map(s => [s.account, s.periods]), [['Banco-Debito-A', ['2026-08']], ['Tarjeta-Debito-B', ['2026-08', '2026-09']]])
    assert.deepEqual(v2.coverage.sources, [{ account: 'Banco-Debito-A', last_date: '2026-08-03' }, { account: 'Tarjeta-Debito-B', last_date: '2026-09-02' }])
    assert.equal(fuenteEstado(movs[0].note), 'Banco-Debito-A')
  })

  it('Polar es exacto por día desde enero de 2026', () => {
    assert.equal(POLAR_EXACTO_DESDE, '2026-01-01')
    assert.equal(v2.coverage.polar_exact_from, '2026-01-01')
  })
})

describe('finanzas · compras en línea', () => {
  it('es una categoría de gasto con su color y su nombre', async () => {
    const { EXPENSE_CATEGORIES } = await import('../../src/features/finances/types/finances')
    const { categoryColor } = await import('../../src/features/finances/lib/financeColors')
    const { nombreCategoria } = await import('../../src/features/finances/lib/modelo')
    assert.ok(EXPENSE_CATEGORIES.includes('compras'))
    assert.equal(categoryColor('compras'), '#E879F9')
    assert.equal(nombreCategoria('compras'), 'Compras en línea')
  })
})

describe('finanzas · lo retirado (is_correction) no existe para la vista', () => {
  const vivos = [mov({ date: '2026-10-01', amount: 100 }), mov({ date: '2026-10-02', type: 'transferencia', amount: 500, counter_account_id: 'b' })]
  const retirados = [mov({ date: '2026-10-01', amount: 999, is_correction: true }), mov({ date: '2026-10-03', type: 'transferencia', amount: 7, counter_account_id: 'b', is_correction: true })]
  const todos = [...vivos, ...retirados]

  it('se separan una vez: vivos y retirados', async () => {
    const { separarRetirados } = await import('../../src/features/finances/lib/finanzas')
    const s = separarRetirados(todos)
    assert.deepEqual(s.vivos.map(m => m.id), vivos.map(m => m.id))
    assert.deepEqual(s.retirados.map(m => m.id), retirados.map(m => m.id))
  })

  it('el pliegue «Movimientos» cuenta solo los vivos y la lista no los trae', async () => {
    const { resumenMovimientos } = await import('../../src/features/finances/lib/modelo')
    assert.equal(resumenMovimientos(todos, 2, 'toda la historia'), '2 en toda la historia')
    const big = [...Array.from({ length: 2183 }, () => mov({})), ...Array.from({ length: 287 }, () => mov({ is_correction: true }))]
    assert.equal(resumenMovimientos(big, 900, 'toda la historia'), '2,183 en toda la historia · 900 renglones')
    const g = agruparMovimientos(todos, (a) => a, clasificar)
    assert.ok(!g.some(x => x.monto === -999), 'el gasto retirado no aparece')
  })

  it('ni las sumas ni «después de la foto» los ven', () => {
    const v2 = calcularV2({ context: todos, range: todos, days: 5, windowStart: new Date('2026-09-30T12:00:00Z'), fx: fxDe(18), closeDate: '2026-09-30' })
    assert.equal(v2.months.find(m => m.month === '2026-10')!.expense_mxn, 100)
    assert.deepEqual(v2.post_close.map(e => e.amount), [500])
  })

  it('el GET manda solo los vivos; los retirados solo con ?retirados=1 (el dedup del sync de Polar)', () => {
    const src = readFileSync(join(__dirname, '../../src/app/api/finanzas/route.ts'), 'utf8')
    assert.ok(src.includes('const { vivos: contextMovements, retirados } = separarRetirados(movementsRes.data)'))
    assert.ok(src.includes("movements: conRetirados ? [...rangeMovements, ...retirados.filter((m) => m.date >= fromISO)] : rangeMovements"))
    const sync = readFileSync(join(__dirname, '../../server/scripts/analytics/polar_income_sync.sh'), 'utf8')
    assert.ok(sync.includes('/api/finanzas?range=todo&retirados=1'))
  })
})
