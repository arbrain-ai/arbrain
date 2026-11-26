import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { leerFuente, type UrlsApp } from '../../src/features/canvas/islas/fuentes'
import { finCuota, mrrDePolar, textoCuotas, usd } from '../../src/features/negocio/mrr'

// Una definición en todas partes (15 nov 2026): MRR recurrente = suscripciones de Polar que se renuevan (active/trialing),
// mensuales a su precio y anuales ÷ 12 hacia abajo, como el conciliador (serie `mrr` del BI). Las cuotas del Acompañamiento
// (metadata product_type: ht_membership, plan «3-pagos») no son recurrentes: van aparte, con cuándo terminan. Cifras sintéticas.

const cuota = (extra: Record<string, unknown> = {}) => ({ status: 'active', amount: 10000, recurring_interval: 'month', metadata: { product_type: 'ht_membership', plan: '3-pagos' }, started_at: '2026-10-17T15:00:00Z', ends_at: null, ...extra })

test('mrr · recurrente: mensuales a su precio, anuales ÷ 12 hacia abajo; solo active y trialing; sin cuotas', () => {
  const m = mrrDePolar([
    { status: 'active', amount: 2900, recurring_interval: 'month' },
    { status: 'trialing', amount: 1900, recurring_interval: 'month' },
    { status: 'active', amount: 19900, recurring_interval: 'year' },   // 1658.33 → 1658
    { status: 'past_due', amount: 2900, recurring_interval: 'month' },
    { status: 'canceled', amount: 2900, recurring_interval: 'month' },
    cuota(), cuota({ ends_at: '2026-11-18T15:00:00Z' }),
  ])
  assert.deepEqual(m.recurrente, { centavos: 2900 + 1900 + 1658, vivas: 3 })
  assert.deepEqual(m.cuotas, { centavos: 20000, n: 2, fin: { desde: '2026-11-18', hasta: '2027-01-17' } })
  assert.equal(usd(m.recurrente.centavos), '$64 USD')
})

test('mrr · cuándo termina una cuota: su ends_at; si no, N meses después de empezar; sin plan ni fecha, no se inventa', () => {
  assert.equal(finCuota(cuota({ ends_at: '2026-11-18T15:00:00Z' })), '2026-11-18')
  assert.equal(finCuota(cuota()), '2027-01-17')
  assert.equal(finCuota(cuota({ metadata: { product_type: 'ht_membership' } })), null)
  assert.equal(finCuota(cuota({ started_at: null })), null)
})

test('mrr · la línea aparte de las cuotas', () => {
  assert.equal(textoCuotas({ centavos: 40000, n: 4, fin: { desde: '2026-11-17', hasta: '2027-01-19' } }), '+ $400 USD/mes en cuotas del Acompañamiento (no recurrente, terminan entre nov y ene)')
  assert.equal(textoCuotas({ centavos: 10000, n: 1, fin: { desde: '2027-01-17', hasta: '2027-01-17' } }), '+ $100 USD/mes en cuotas del Acompañamiento (no recurrente, terminan en ene)')
  assert.equal(textoCuotas({ centavos: 0, n: 0, fin: null }), null, 'sin cuotas no hay línea')
})

const URLS: UrlsApp = { cohorte: '/c', finanzas: '/f', rutinas: '/r', trabajos: '/t', marketing: '/m', comprador: '/co', embudo: '/e', marcador: '/ml', bi: '/bi', bandeja: '/d', mrr: '/mrr' }
const RESP = { activo: true, recurrente: { centavos: 50000, cifra: '$500 USD', vivas: 3 }, cuotas: { centavos: 20000, n: 2, fin: null, texto: '+ $200 USD/mes en cuotas del Acompañamiento (no recurrente)' }, leidoEn: 'x' }

test('mrr · la fuente polar:mrr: recurrente y cuotas aparte; oculto en directo; error dicho (nunca 0); nada en la copia del alumno', async () => {
  const ctx = { directo: false, cliente: false }
  const ok = await leerFuente('polar:mrr', URLS, ctx, async u => (u === '/mrr' ? { data: RESP } : {}))
  assert.equal(ok.estado, 'ok')
  assert.deepEqual(ok.valor, { recurrente: RESP.recurrente, cuotas: RESP.cuotas, leidoEn: 'x' })
  let pedidas = 0
  const directo = await leerFuente('polar:mrr', URLS, { directo: true, cliente: false }, async () => { pedidas++; return {} })
  assert.equal(directo.estado, 'oculto'); assert.equal(pedidas, 0, 'en directo ni se pide')
  const fallo = await leerFuente('polar:mrr', URLS, ctx, async () => ({ data: { activo: true, error: 'Polar respondió 500' } }))
  assert.equal(fallo.estado, 'error'); assert.equal(fallo.valor, null); assert.equal(fallo.error, 'Polar respondió 500')
  const alumno = await leerFuente('polar:mrr', URLS, { directo: false, cliente: true }, async () => { pedidas++; return {} })
  assert.equal(alumno.estado, 'sin-dato'); assert.equal(pedidas, 0)
})
