/**
 * Finanzas es un espejo (6 nov 2026). Daniel: «quita lo de "le toca al SAT"», «no me espantes», «quiero ver la línea roja».
 *  · Lo que pinta Finanzas (sección y panel, acumulado y por día) no dice «SAT» ni «impuesto», aunque la lectura los traiga.
 *  · El GET no lee ni devuelve las filas de impuestos; el POST de la socia sigue escribiéndolas.
 *  · El acumulado al cierre de cada mes es la suma de los meses; las barras de un día son la suma de sus movimientos.
 * Cifras, cuentas y personas inventadas.
 */
import Module from 'node:module'
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { calcularV2 } from '../../src/features/finances/lib/agregados'
import { diasGrafica, fechaDelTotal } from '../../src/features/finances/lib/modelo'
import {
  cierresDeMes, compacto, concepto, diasConDinero, lineaCobertura, marcasX, movimientosDelDia, periodo, serieAcumulada, totalesDe,
} from '../../src/features/finances/lib/espejo'
import { tienesHoy } from '../../src/features/finances/lib/tienes'
import type { DiaGrafica } from '../../src/features/finances/lib/modelo'
import type { FinanceAccount, FinanceMovement, FinanceSnapshot, FinancesPayload, MonthTotal } from '../../src/features/finances/types/finances'

// Las pruebas corren en Node: los CSS modules se vuelven un objeto que devuelve el nombre de la clase.
const extensiones = (Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions
extensiones['.css'] = m => { m.exports = new Proxy({}, { get: (_, k) => (k === '__esModule' ? false : String(k)) }) }

/** Lo que Daniel pidió no ver en Finanzas. «SAT» como palabra (no «satisfies»); «impuesto» en cualquier forma. */
const PROHIBIDO = /\bSAT\b|impuest/i

// ── Una historia inventada: tres meses, dos cuentas, Polar en dólares ──────────────────────────────────────────────────
const FX = { usd_mxn: 18, eur_mxn: 20, eur_usd: 1.1 }
const HOY = '2026-03-20'
let n = 0
const mov = (o: Partial<FinanceMovement>): FinanceMovement => ({
  id: `m${++n}`, date: '2026-01-10', type: 'gasto', account_id: 'banco', counter_account_id: null, currency: 'MXN', amount: 100, counter_currency: null,
  counter_amount: null, category: 'comida', note: null, registered_by: 'levy', is_correction: false, corrects_movement_id: null, created_at: '', account_name: 'Banco-A', ...o,
})
const polar = (date: string, usd: number, mxn: number) => mov({ date, type: 'ingreso', currency: 'USD', amount: usd, counter_currency: 'MXN', counter_amount: mxn,
  category: 'Polar', registered_by: 'polar-sync', account_id: 'polar', account_name: 'Polar', note: `Revenue Polar del día (3 órdenes pagadas incl. renovaciones). [polar-daily:${date}]` })
const MOVS: FinanceMovement[] = [
  polar('2026-01-05', 100.33, 1805.94), polar('2026-01-20', 50.5, 909.25), polar('2026-02-03', 77.77, 1399.86), polar('2026-03-18', 12.12, 218.16),
  mov({ date: '2026-01-07', amount: 333.33, note: 'Banco A: Tacos del centro [edo-cuenta-cargo:Banco-A:2026-01]', registered_by: 'estado-de-cuenta' }),
  mov({ date: '2026-01-07', amount: 120.4, category: 'despensa', note: 'Banco A: Mercado [edo-cuenta-cargo:Banco-A:2026-01]', registered_by: 'estado-de-cuenta' }),
  mov({ date: '2026-02-14', amount: 1250.55, category: 'vivienda', note: 'Renta de febrero en efectivo. Fecha aproximada.', account_id: 'efectivo', account_name: 'Efectivo-MXN' }),
  mov({ date: '2026-02-14', type: 'ingreso', amount: 5000, category: 'HT-cierre', note: 'Pago de Cliente Uno, programa (cohorte). Llegó al banco; fecha por confirmar.' }),
  mov({ date: '2026-03-02', amount: 80.8, note: 'Banco A: Café [edo-cuenta-cargo:Banco-A:2026-03]', registered_by: 'estado-de-cuenta' }),
  mov({ date: '2026-03-03', amount: 999, is_correction: true, note: 'Retirado: no cuenta' }),
  mov({ date: '2026-03-04', type: 'transferencia', amount: 700, counter_account_id: 'efectivo', note: 'Retiro a efectivo' }),
]
const DESDE = '2026-01-05'
const DIAS = 75 // del 5 ene al 20 mar
const v2 = calcularV2({ context: MOVS, range: MOVS, days: DIAS, windowStart: new Date(`${DESDE}T12:00:00Z`), fx: FX, closeDate: '2026-03-10' })
const vivos = MOVS.filter(m => !m.is_correction)
const ingreso = vivos.filter(m => m.type === 'ingreso').reduce((s, m) => s + (m.counter_amount ?? m.amount), 0)
const gasto = vivos.filter(m => m.type === 'gasto').reduce((s, m) => s + m.amount, 0)
const CUENTAS: FinanceAccount[] = [
  { id: 'banco', name: 'Banco-A', owner: 'pareja', kind: 'banco', currency: 'MXN', is_active: true, notes: null, created_at: '', updated_at: '' },
  { id: 'polar', name: 'Polar', owner: 'pareja', kind: 'revenue', currency: 'USD', is_active: true, notes: null, created_at: '', updated_at: '' },
  { id: 'efectivo', name: 'Efectivo-MXN', owner: 'pareja', kind: 'efectivo', currency: 'MXN', is_active: true, notes: null, created_at: '', updated_at: '' },
]
const FOTO: FinanceSnapshot = { id: 'f1', snapshot_date: '2026-03-10', balances: [{ account: 'Banco-A', currency: 'MXN', balance: 10_000 }, { account: 'Polar', currency: 'USD', balance: 10 }],
  fx: FX, liquid_mxn: 10_180, liquid_usd: null, net_worth_mxn: null, net_worth_usd: null, delta_liquid_mxn: null, delta_net_worth_mxn: null, notes: null, created_at: '' }

function payload(): FinancesPayload & { impuestos: unknown } {
  return {
    accounts: CUENTAS, movements: vivos, snapshots: [FOTO], recurring: [],
    summary: {
      range: 'todo', days: DIAS, desde: DESDE, fx: FX, fx_at: null, fx_stale: false, burn_range_mxn: Math.round(gasto), income_range_mxn: Math.round(ingreso),
      cashflow_range_mxn: Math.round(ingreso - gasto), burn_by_category: [{ category: 'comida', total_mxn: 414, count: 2 }], income_by_source: [{ category: 'Polar', total_mxn: 4333, count: 4 }],
      series: [], monthly_burn_mxn: 0, runway_months: null, runway_low_confidence: true, recurring_monthly_mxn: 0, ...v2,
    },
    tienes: tienesHoy(FOTO, CUENTAS, vivos, FX, HOY),
    // Una lectura vieja que todavía trajera el bloque de impuestos: la vista no debe pintar nada de esto.
    impuestos: { resumen: { sat: { centro: 123_456, nota: 'Le toca al SAT' }, queda: { centro: 1 } }, periods: [{ periodo: '2026-01', nota: 'impuestos de enero' }] },
  }
}

// ── Lo que pinta ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe('finanzas · el espejo no dice SAT ni impuestos', () => {
  let pintar: (o: Record<string, unknown>) => string
  before(async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { VistaFinanzas } = await import('../../src/features/finances/components/Finanzas')
    pintar = o => renderToStaticMarkup(createElement(VistaFinanzas, { data: payload(), hoy: HOY, donde: 'seccion', ...o } as never))
  })

  it('el detector atrapa lo que se quitó (control)', () => {
    assert.match('Le toca al SAT', PROHIBIDO)
    assert.match('Después de impuestos', PROHIBIDO)
    assert.doesNotMatch('satisfies · lo que tienes', PROHIBIDO)
  })

  for (const donde of ['seccion', 'panel'] as const) for (const modoInicial of ['acum', 'dia'] as const) {
    it(`${donde}, ${modoInicial === 'acum' ? 'acumulado' : 'por día'}: pinta lo que tienes, entró y salió, sin SAT ni impuestos`, () => {
      const html = pintar({ donde, modoInicial })
      assert.ok(html.includes('Lo que tienes') && html.includes('Entró') && html.includes('Salió'), 'no se pintó el espejo')
      if (modoInicial === 'dia') assert.ok(html.includes('Ventas de Polar · 3 órdenes'), 'el día elegido muestra sus movimientos')
      const hallazgo = PROHIBIDO.exec(html)
      assert.equal(hallazgo, null, `Finanzas pinta «${hallazgo?.[0]}»: …${html.slice(Math.max(0, (hallazgo?.index ?? 0) - 80), (hallazgo?.index ?? 0) + 80)}…`)
    })
  }

  it('ningún texto de la vista ni de su cálculo dice SAT o impuestos', () => {
    const base = join(__dirname, '../../src/features/finances')
    const archivos = ['components', 'lib'].flatMap(d => readdirSync(join(base, d)).filter(f => /\.(tsx?|css)$/.test(f)).map(f => join(base, d, f)))
    const con = archivos.filter(f => PROHIBIDO.test(readFileSync(f, 'utf8')))
    assert.deepEqual(con.map(f => f.slice(base.length + 1)), [])
  })
})

describe('finanzas · el GET es un espejo; el POST de la socia sigue', () => {
  const ruta = readFileSync(join(__dirname, '../../src/app/api/finanzas/route.ts'), 'utf8')
  const get = ruta.slice(ruta.indexOf('export async function GET'), ruta.indexOf('export async function POST'))
  const post = ruta.slice(ruta.indexOf('export async function POST'))
  it('el GET no lee las tablas de impuestos ni devuelve el bloque', () => {
    assert.ok(get.length > 1000, 'no se encontró el GET')
    assert.doesNotMatch(get, /finance_tax_|impuestos|calcularImpuestos/)
    assert.match(get, /tienes,\n {2}\}\)/, 'el GET devuelve lo que tienes')
  })
  it('el POST conserva upsert_tax_period y add_tax_estimate', () => {
    assert.match(post, /action === 'upsert_tax_period'[\s\S]*from\('finance_tax_periods'\)/)
    assert.match(post, /action === 'add_tax_estimate'[\s\S]*from\('finance_tax_estimates'\)/)
  })
})

// ── Lo que dicen los números ───────────────────────────────────────────────────────────────────────────────────────────
describe('finanzas · acumulado y por día', () => {
  const dias = diasGrafica(v2)

  it('al cierre de cada mes el acumulado es la suma de los meses, al peso', () => {
    const serie = serieAcumulada(dias, v2.months, true), cierres = cierresDeMes(serie)
    let e = 0, s = 0
    for (const m of v2.months) {
      e += m.income_mxn; s += m.expense_mxn
      assert.deepEqual(cierres.get(m.month), { entro: e, salio: s }, m.month)
    }
    assert.deepEqual(totalesDe(serie), { entro: e, salio: s })
  })

  it('la diferencia de redondeo va al último día con dinero del mes; una diferencia grande no se toca', () => {
    const d = (fecha: string, entro: number, salio = 0): DiaGrafica => ({ fecha, entro, salio, usd: 0, agrEntro: [], agrSalio: [] })
    const mes = (month: string, income_mxn: number, expense_mxn: number): MonthTotal => ({ month, income_mxn, expense_mxn, income_polar_mxn: 0, expense_card_payment_mxn: 0, has_daily_expense: true })
    const ds = [d('2026-01-01', 101, 50), d('2026-01-15', 101), d('2026-01-31', 0), d('2026-02-01', 10, 5)]
    const s = serieAcumulada(ds, [mes('2026-01', 203, 50), mes('2026-02', 500, 5)], true)
    assert.deepEqual(s.entro, [101, 203, 203, 213], 'enero: +1 peso en su último día con dinero; febrero: 490 de más no es redondeo')
    assert.equal(s.finEntro, 3); assert.equal(s.finSalio, 3)
    // Un rango que empieza a medio mes no concilia ese mes (le falta lo de antes), salvo «Todo».
    assert.deepEqual(serieAcumulada([d('2026-01-15', 101)], [mes('2026-01', 300, 0)], false).entro, [101])
  })

  it('cada línea termina en su último movimiento: después no hay dato, no un cero', () => {
    const s = serieAcumulada(dias, v2.months, true)
    assert.equal(s.fechas[s.finEntro], '2026-03-18')
    assert.equal(s.fechas[s.finSalio], '2026-03-02')
  })

  it('un total de periodo se suma dentro de su mes', () => {
    assert.equal(fechaDelTotal({ date: '2026-10-05', period: '2026-09' }, '2026-01-01'), '2026-09-30')
    assert.equal(fechaDelTotal({ date: '2026-10-05', period: '2026-09' }, '2026-10-01'), '2026-10-05', 'antes del rango: en su fecha')
    assert.equal(fechaDelTotal({ date: '2026-09-27', period: '2026-09' }, '2026-01-01'), '2026-09-27')
  })

  it('por día: solo los días con dinero, y la lista de cada día suma su barra', () => {
    const con = diasConDinero(dias)
    assert.deepEqual(con.map(c => c.fecha), ['2026-01-05', '2026-01-07', '2026-01-20', '2026-02-03', '2026-02-14', '2026-03-02', '2026-03-18'])
    for (const c of con) {
      const ms = movimientosDelDia(vivos, c.fecha, FX)
      const e = ms.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.mxn, 0), g = ms.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.mxn, 0)
      assert.ok(Math.abs(e - c.entro) <= 0.5 && Math.abs(g - c.salio) <= 0.5, c.fecha)
    }
    const feb14 = movimientosDelDia(vivos, '2026-02-14', FX)
    assert.deepEqual(feb14.map(m => [m.tipo, m.concepto, m.mxn]), [['ingreso', 'Pago de Cliente Uno, programa (cohorte)', 5000], ['gasto', 'Renta de febrero en efectivo', 1250.55]])
    assert.deepEqual(movimientosDelDia(vivos, '2026-01-05', FX)[0].original, { monto: 100.33, moneda: 'USD' })
    assert.deepEqual(movimientosDelDia(vivos, '2026-03-03', FX), [], 'lo retirado no aparece')
    assert.deepEqual(movimientosDelDia(vivos, '2026-03-04', FX), [], 'una transferencia no es entrada ni salida')
  })
})

describe('finanzas · cómo se dice', () => {
  it('el concepto: sin etiquetas, sin la cuenta repetida y en una frase', () => {
    const c = (note: string, account_name = 'Banco-A', type: 'gasto' | 'ingreso' = 'gasto') => concepto({ type, note, category: 'comida', registered_by: 'x', account_name })
    assert.equal(c('Banco A: Tacos del centro [edo-cuenta-cargo:Banco-A:2026-01]'), 'Tacos del centro')
    assert.equal(c('Proveedor: dos recibos.'), 'Proveedor: dos recibos')
    assert.equal(c('Retiro de 22.9 USDT; destino sin confirmar.'), 'Retiro de 22.9 USDT')
    assert.equal(c('Algo incl. otra cosa. Siguiente frase'), 'Algo incl. otra cosa')
    assert.equal(c(''), 'Comida')
  })
  it('valores al final de la línea, periodo y cobertura', () => {
    assert.deepEqual([3_761_234, 2_887_100, 487_612, 48_800, 950, 1_000_000].map(compacto), ['$3.76 M', '$2.89 M', '$488 mil', '$48.8 mil', '$950', '$1 M'])
    assert.equal(periodo('2024-01-04', HOY), '4 ene 2024 – 20 mar 2026')
    assert.equal(periodo('2026-02-19', HOY), '19 feb – 20 mar')
    assert.deepEqual(lineaCobertura({ sources: [{ account: 'Tarjeta-B', last_date: '2026-03-10' }, { account: 'Banco-A', last_date: '2025-12-23' }], statements: [], polar_months: [], polar_last_day: null, polar_exact_from: '' }, HOY),
      { titulo: 'Estados de cuenta hasta:', cortes: ['Banco A 23 dic 2025', 'Tarjeta B 10 mar'] })
    assert.equal(lineaCobertura(undefined, HOY), null)
  })
  it('el eje del tiempo: el año en enero y en la primera etiqueta; con poco espacio, solo años', () => {
    const fechas: string[] = []
    for (let t = Date.parse('2024-01-04T12:00:00Z'); t <= Date.parse('2026-11-06T12:00:00Z'); t += 86_400_000) fechas.push(new Date(t).toISOString().slice(0, 10))
    const ancho = marcasX(fechas, 1300).map(m => m.texto)
    assert.match(ancho[0], /^[a-z]{3} 2024$/); assert.ok(ancho.includes('ene 2025') && ancho.includes('ene 2026'))
    assert.deepEqual(marcasX(fechas, 280).map(m => m.texto), ['2024', '2025', '2026'], 'el primer tramo lleva su año')
  })
  it('abre con toda la historia', async () => {
    const { RANGO_INICIAL } = await import('../../src/features/finances/components/Finanzas')
    assert.equal(RANGO_INICIAL, 'todo')
  })
})
