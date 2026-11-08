import { NextResponse } from 'next/server'
import { sameSecret } from '@/lib/desktop-auth'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole } from '@/lib/auth-utils'
import {
  EXPENSE_CATEGORIES,
  INCOME_SOURCES,
  type FinanceAccount,
  type FinanceFx,
  type FinanceMovement,
  type FinanceRecurring,
  type FinanceSnapshot,
  type CategoryTotal,
  type SeriesPoint,
  TAX_ESTADOS,
  type TaxEstado,
} from '@/features/finances/types/finances'
import { calcularV2 } from '@/features/finances/lib/agregados'
import { fuenteEstado } from '@/features/finances/lib/granularidad'
import { diasEntre, pesosDe, separarRetirados } from '@/features/finances/lib/finanzas'
import { leerTodas } from '@/features/finances/lib/paginar'
import { fotoVigente, tienesHoy } from '@/features/finances/lib/tienes'
import { vetoDirecto } from '@/lib/modo-directo/servidor'

/**
 * /api/finanzas — Finanzas personales el dueño + la socia
 *
 * GET  → payload completo (accounts, movements del rango, snapshots, recurring, summary, tienes).
 *        Es un espejo (6 nov 2026): lo que tienes, lo que entró y lo que salió. No lee ni devuelve las filas de impuestos.
 *        Query params: ?range=30d|3m|6m|12m|todo (default 30d; `todo` = desde el primer movimiento).
 *        `movements` trae solo los vivos; los retirados (is_correction) no cuentan en nada y solo se agregan
 *        al final con ?retirados=1 (el dedup de polar_income_sync.sh los necesita para no volver a postear un día).
 *        Los movimientos se leen paginados (PostgREST corta en 1000): ninguno se queda fuera.
 *        Cada gasto o ingreso vale en pesos su contraparte MXN (el tipo de cambio de su día); sin ella, el FX vivo.
 * POST → escritura para agentes (Levy) y UI:
 *        { action: 'add_movement', movement: {...} }
 *        { action: 'add_snapshot', snapshot: {...} }
 *        { action: 'add_recurring', recurring: {...} }
 *        { action: 'upsert_tax_period', period: { periodo: 'YYYY-MM', estado, ... } }   (un mes de impuestos; upsert por periodo)
 *        { action: 'add_tax_estimate', estimate: { fecha?, bajo, centro, alto, pagado?, nota? } } (solo se agregan)
 *
 * Auth (ambos métodos): sesión Supabase con rol owner/admin, O bearer
 * OPENCLAW_GATEWAY_TOKEN (agentes headless).
 */

async function isAuthorized(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.OPENCLAW_GATEWAY_TOKEN
  const token = authHeader?.replace('Bearer ', '')
  if (expectedToken && token && sameSecret(token, expectedToken)) {
    return true
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const role = await getUserRole(user.id)
  return role === 'owner' || role === 'admin'
}

function mexicoTodayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
}

function toMxn(amount: number, currency: string, fx: FinanceFx): number {
  if (currency === 'USD') return amount * fx.usd_mxn
  if (currency === 'EUR') return amount * fx.eur_mxn
  return amount
}

// FX de respaldo (actualizado 5 jul 2026). Solo se usa si el FX vivo falla Y no hay snapshot.
const FALLBACK_FX: FinanceFx = { usd_mxn: 17.47, eur_mxn: 19.98, eur_usd: 1.14 }

interface FxResult {
  fx: FinanceFx
  at: string | null // ISO del momento en que se obtuvo el FX vivo (null = respaldo)
  stale: boolean // true = no es FX vivo (se cayó a snapshot o fallback)
}

// FX vivo con cache de 1h en memoria; fallback al FX del último snapshot, luego a FALLBACK_FX.
let fxCache: { fx: FinanceFx; at: number } | null = null

async function getLiveFx(latestSnapshotFx: FinanceFx | null): Promise<FxResult> {
  if (fxCache && Date.now() - fxCache.at < 3600_000) {
    return { fx: fxCache.fx, at: new Date(fxCache.at).toISOString(), stale: false }
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    const data = await res.json()
    const mxn = data?.rates?.MXN
    const eur = data?.rates?.EUR
    if (typeof mxn === 'number' && typeof eur === 'number' && mxn > 0 && eur > 0) {
      const fx: FinanceFx = {
        usd_mxn: Number(mxn.toFixed(2)),
        eur_mxn: Number((mxn / eur).toFixed(2)),
        eur_usd: Number((1 / eur).toFixed(2)),
      }
      fxCache = { fx, at: Date.now() }
      return { fx, at: new Date().toISOString(), stale: false }
    }
  } catch {
    // fall through
  }
  return { fx: latestSnapshotFx ?? FALLBACK_FX, at: null, stale: true }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Modo directo (7 nov 2026): con la transmisión prendida, Finanzas no entrega datos (lib/modo-directo/servidor.ts).
  { const veto = await vetoDirecto('Finanzas'); if (veto) return veto }
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  // Rango GLOBAL: recalcula toda la página (curva, KPIs, runway). Default: últimos 30 días. `todo`: desde el primer movimiento.
  const RANGE_DAYS: Record<string, number> = { '30d': 30, '3m': 90, '6m': 180, '12m': 365 }
  const rangeParam = searchParams.get('range') ?? '30d'
  const range = rangeParam === 'todo' || rangeParam in RANGE_DAYS ? rangeParam : '30d'
  const todo = range === 'todo'

  const service = createServiceClient()

  const todayISO = mexicoTodayISO()
  // Meses completos de contexto (13) sin importar el rango: el mes «de la lectura» no puede depender del botón 30D.
  // En `todo` no hay piso: se lee toda la historia.
  const [ty, tm] = todayISO.split('-').map(Number)
  const contextStart = new Date(Date.UTC(ty, tm - 1 - 12, 1, 12)).toISOString().slice(0, 10)
  const fijoDesde = (() => { const d = new Date(`${todayISO}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((RANGE_DAYS[range] ?? 30) - 1)); return d.toISOString().slice(0, 10) })()
  const queryFrom: string | null = todo ? null : contextStart < fijoDesde ? contextStart : fijoDesde

  // Movimientos paginados (PostgREST corta en 1000); la primera página trae el conteo y las demás van en paralelo.
  // El orden lleva `id` al final para que ninguna fila cambie de página entre una lectura y otra.
  const movimientosPromise = leerTodas<FinanceMovement>((desde, hasta, contar) => {
    let q = service.from('finance_movements').select('*', contar ? { count: 'exact' } : undefined)
    if (queryFrom) q = q.gte('date', queryFrom)
    return q.order('date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: true }).range(desde, hasta)
  }, { clave: (m) => m.id })

  // FX vivo en paralelo con la BD (26 sep 2026): antes esperaba a que terminaran
  // las 4 consultas y en lambda fría sumaba hasta 4 s de open.er-api en serie. El
  // snapshot solo aporta el FALLBACK, que se aplica abajo si el vivo falló.
  const liveFxPromise = getLiveFx(null)

  const [accountsRes, movementsRes, snapshotsRes, recurringRes] = await Promise.all([
    service.from('finance_accounts').select('*').order('created_at'),
    movimientosPromise,
    service.from('finance_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(24),
    service.from('finance_recurring').select('*').eq('is_active', true).order('charge_day'),
  ])

  const firstError = accountsRes.error || movementsRes.error || snapshotsRes.error || recurringRes.error
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  const accounts = (accountsRes.data ?? []) as FinanceAccount[]
  // Lo retirado (is_correction) se aparta aquí: ningún cálculo, lista ni conteo lo ve.
  const { vivos: contextMovements, retirados } = separarRetirados(movementsRes.data)
  const conRetirados = searchParams.get('retirados') === '1'
  // Ventana del rango: `days` días hacia atrás desde hoy (tz Mexico City). En `todo`, desde el primer movimiento
  // (vienen del más nuevo al más viejo: el último es el primero que se registró).
  const primero = contextMovements.at(-1)?.date
  const fromISO = todo ? (primero && primero < todayISO ? primero : todayISO) : fijoDesde
  const days = diasEntre(fromISO, todayISO) + 1
  const windowStart = new Date(`${fromISO}T12:00:00Z`)
  // `movements` del payload sigue siendo SOLO el rango (contrato del GET); el contexto (13 meses o todo) alimenta `months`.
  const rangeMovements = contextMovements.filter((m) => m.date >= fromISO)
  const snapshots = (snapshotsRes.data ?? []) as FinanceSnapshot[]
  const recurring = (recurringRes.data ?? []) as FinanceRecurring[]

  const nameById = new Map(accounts.map((a) => [a.id, a.name]))
  for (const m of contextMovements) {
    m.account_name = nameById.get(m.account_id)
    if (m.counter_account_id) m.counter_account_name = nameById.get(m.counter_account_id)
  }
  for (const r of recurring) {
    if (r.account_id) r.account_name = nameById.get(r.account_id)
  }

  const latestFx = snapshots[0]?.fx ?? null
  const liveFx = await liveFxPromise
  const fxResult: FxResult = liveFx.stale ? { fx: latestFx ?? FALLBACK_FX, at: null, stale: true } : liveFx
  const fx = fxResult.fx

  // Agregados del rango: totales + por categoría/fuente, y buckets diarios para la curva.
  const burnByCategory = new Map<string, CategoryTotal>()
  const incomeBySource = new Map<string, CategoryTotal>()
  const incomeByDay = new Map<string, number>()
  const expenseByDay = new Map<string, number>()
  let burnRange = 0
  let incomeRange = 0
  let expenseMovementCount = 0

  for (const m of rangeMovements) {
    if (m.is_correction) continue
    // En pesos de su día si trae contraparte MXN; si no, al FX vivo. Las transferencias no son ni ingreso ni gasto.
    const mxn = pesosDe(m, fx)
    if (m.type === 'gasto') {
      burnRange += mxn
      expenseMovementCount += 1
      expenseByDay.set(m.date, (expenseByDay.get(m.date) ?? 0) + mxn)
      const key = m.category ?? 'otros'
      const entry = burnByCategory.get(key) ?? { category: key, total_mxn: 0, count: 0 }
      entry.total_mxn += mxn
      entry.count += 1
      burnByCategory.set(key, entry)
    } else if (m.type === 'ingreso') {
      incomeRange += mxn
      incomeByDay.set(m.date, (incomeByDay.get(m.date) ?? 0) + mxn)
      const key = m.category ?? 'otros'
      const entry = incomeBySource.get(key) ?? { category: key, total_mxn: 0, count: 0 }
      entry.total_mxn += mxn
      entry.count += 1
      incomeBySource.set(key, entry)
    }
  }

  // Serie diaria ACUMULADA sobre la ventana: dos curvas suaves (ingresos vs gastos).
  const series: SeriesPoint[] = []
  let cumIncome = 0
  let cumExpense = 0
  for (let i = 0; i < days; i++) {
    const d = new Date(windowStart)
    d.setUTCDate(d.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    cumIncome += incomeByDay.get(key) ?? 0
    cumExpense += expenseByDay.get(key) ?? 0
    series.push({ date: key, income_mxn: Math.round(cumIncome), expense_mxn: Math.round(cumExpense) })
  }

  // ── Finanzas v2 (8 oct 2026): lo registrado POR DÍA contra los totales de periodo (lib/agregados.ts) ──
  const v2 = calcularV2({ context: contextMovements, range: rangeMovements, days, windowStart, fx, closeDate: snapshots[0]?.snapshot_date ?? null })

  // Recurrentes prorrateados a MXN/mes: la base FIJA del burn (renta, nómina, software).
  const recurringMonthlyMxn = recurring.reduce((sum, r) => {
    const mxn = toMxn(r.amount, r.currency, fx)
    return sum + (r.periodicity === 'anual' ? mxn / 12 : mxn)
  }, 0)

  // Burn mensual REAL = cobros fijos recurrentes + promedio de gastos ÚNICOS del rango.
  // (los recurrentes viven en finance_recurring, NO como movimientos, por eso se suman aparte).
  const monthsInRange = days / 30.44
  const oneoffMonthly = monthsInRange > 0 ? burnRange / monthsInRange : 0
  // Desde el 5 oct 2026 los gastos se cargan desde ESTADOS DE CUENTA (registered_by
  // 'estado-de-cuenta'): ya traen dentro los fijos que se cobran en esas cuentas. Sumar
  // además finance_recurring los contaría dos veces (deuda #4 de finance-os).
  // Los cargos individuales (`[edo-cuenta-cargo:…]`, 8 oct y 5 nov 2026) también vienen de un estado de cuenta.
  const statementBacked = rangeMovements.some(
    (m) => m.type === 'gasto' && !m.is_correction && (m.registered_by === 'estado-de-cuenta' || fuenteEstado(m.note) != null)
  )
  const monthlyBurn = statementBacked ? oneoffMonthly : recurringMonthlyMxn + oneoffMonthly
  // Poco confiable si el burn es casi puro presupuesto (sin estados) o si no hay datos.
  const runwayLowConfidence = statementBacked
    ? false
    : recurringMonthlyMxn === 0 || expenseMovementCount < 3
  const latestLiquidMxn = snapshots[0]?.liquid_mxn ?? null
  const runwayMonths =
    latestLiquidMxn && monthlyBurn > 0 ? Number((latestLiquidMxn / monthlyBurn).toFixed(1)) : null

  // Lo que tienes hoy: la última foto de saldos + lo que movió Polar después de ella (lib/tienes.ts).
  const tienes = tienesHoy(fotoVigente(snapshots, todayISO), accounts, contextMovements, fx, todayISO)

  return NextResponse.json({
    accounts,
    movements: conRetirados ? [...rangeMovements, ...retirados.filter((m) => m.date >= fromISO)] : rangeMovements,
    snapshots,
    recurring,
    summary: {
      range,
      days,
      desde: fromISO,
      fx,
      fx_at: fxResult.at,
      fx_stale: fxResult.stale,
      burn_range_mxn: Math.round(burnRange),
      income_range_mxn: Math.round(incomeRange),
      cashflow_range_mxn: Math.round(incomeRange - burnRange),
      burn_by_category: [...burnByCategory.values()].sort((a, b) => b.total_mxn - a.total_mxn),
      income_by_source: [...incomeBySource.values()].sort((a, b) => b.total_mxn - a.total_mxn),
      series,
      monthly_burn_mxn: Math.round(monthlyBurn),
      runway_months: runwayMonths,
      runway_low_confidence: runwayLowConfidence,
      recurring_monthly_mxn: Math.round(recurringMonthlyMxn),
      ...v2,
    },
    tienes,
  })
}

// ─── POST ────────────────────────────────────────────────────────────────────

interface AddMovementBody {
  date?: string
  type: string
  account: string
  counter_account?: string
  currency: string
  amount: number
  counter_currency?: string
  counter_amount?: number
  category?: string
  note?: string
  registered_by?: string
  is_correction?: boolean
  corrects_movement_id?: string
}

interface AddSnapshotBody {
  snapshot_date?: string
  balances: { account: string; currency?: string; balance: number }[]
  fx?: FinanceFx
  notes?: string
}

interface UpsertTaxPeriodBody {
  periodo: string
  ingreso?: number | null
  deducciones?: number | null
  isr?: number | null
  recargos_actualizacion?: number | null
  iva?: number | null
  total?: number | null
  estado?: string
  pagado_en?: string | null
  fuente?: string | null
  nota?: string | null
}

interface AddTaxEstimateBody {
  fecha?: string
  bajo: number
  centro: number
  alto: number
  pagado?: number | null
  nota?: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface AddRecurringBody {
  name: string
  category?: string
  periodicity?: 'mensual' | 'anual'
  charge_day: number
  charge_month?: number
  currency: string
  amount: number
  account?: string
  notes?: string
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    action?: string; movement?: AddMovementBody; snapshot?: AddSnapshotBody; recurring?: AddRecurringBody
    period?: UpsertTaxPeriodBody; estimate?: AddTaxEstimateBody
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: accountsData, error: accountsError } = await service
    .from('finance_accounts')
    .select('*')
  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 })
  }
  const accounts = (accountsData ?? []) as FinanceAccount[]
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]))

  // ── add_movement ──
  if (body.action === 'add_movement') {
    const mv = body.movement
    if (!mv) return NextResponse.json({ error: 'Missing movement' }, { status: 400 })

    const account = byName.get((mv.account ?? '').toLowerCase())
    if (!account) {
      return NextResponse.json(
        { error: `Cuenta desconocida: "${mv.account}". Cuentas válidas: ${accounts.map((a) => a.name).join(', ')}` },
        { status: 400 },
      )
    }
    let counterAccount: FinanceAccount | null = null
    if (mv.counter_account) {
      counterAccount = byName.get(mv.counter_account.toLowerCase()) ?? null
      if (!counterAccount) {
        return NextResponse.json({ error: `Cuenta destino desconocida: "${mv.counter_account}"` }, { status: 400 })
      }
    }

    const validTypes = ['gasto', 'ingreso', 'transferencia', 'prestamo', 'pago_deuda', 'ajuste']
    if (!validTypes.includes(mv.type)) {
      return NextResponse.json({ error: `Tipo inválido: "${mv.type}". Válidos: ${validTypes.join(', ')}` }, { status: 400 })
    }
    if (['transferencia', 'prestamo', 'pago_deuda'].includes(mv.type) && !counterAccount) {
      return NextResponse.json({ error: `Tipo "${mv.type}" requiere counter_account (destino)` }, { status: 400 })
    }
    if (!['MXN', 'USD', 'EUR'].includes(mv.currency)) {
      return NextResponse.json({ error: `Divisa inválida: "${mv.currency}"` }, { status: 400 })
    }
    if (!(typeof mv.amount === 'number' && mv.amount > 0)) {
      return NextResponse.json({ error: 'amount debe ser número > 0' }, { status: 400 })
    }
    // Contraparte (5 nov 2026): en un ingreso o gasto en dólares, `counter_currency: 'MXN'` + `counter_amount` es lo que valió
    // en pesos SU día; la vista usa esa cifra en vez del dólar de hoy. En una transferencia, lo que llegó a la otra cuenta.
    if ((mv.counter_currency == null) !== (mv.counter_amount == null)) {
      return NextResponse.json({ error: 'counter_currency y counter_amount van juntos (o ninguno)' }, { status: 400 })
    }
    if (mv.counter_currency != null && !['MXN', 'USD', 'EUR'].includes(mv.counter_currency)) {
      return NextResponse.json({ error: `counter_currency inválida: "${mv.counter_currency}"` }, { status: 400 })
    }
    if (mv.counter_amount != null && !(typeof mv.counter_amount === 'number' && Number.isFinite(mv.counter_amount) && mv.counter_amount > 0)) {
      return NextResponse.json({ error: 'counter_amount debe ser número > 0' }, { status: 400 })
    }
    if (mv.type === 'gasto' && mv.category && !(EXPENSE_CATEGORIES as readonly string[]).includes(mv.category)) {
      return NextResponse.json(
        { error: `Categoría inválida: "${mv.category}". Canónicas: ${EXPENSE_CATEGORIES.join(', ')}` },
        { status: 400 },
      )
    }
    if (mv.type === 'ingreso' && mv.category && !(INCOME_SOURCES as readonly string[]).includes(mv.category)) {
      return NextResponse.json(
        { error: `Fuente inválida: "${mv.category}". Canónicas: ${INCOME_SOURCES.join(', ')}` },
        { status: 400 },
      )
    }

    const { data, error } = await service
      .from('finance_movements')
      .insert({
        date: mv.date ?? mexicoTodayISO(),
        type: mv.type,
        account_id: account.id,
        counter_account_id: counterAccount?.id ?? null,
        currency: mv.currency,
        amount: mv.amount,
        counter_currency: mv.counter_currency ?? null,
        counter_amount: mv.counter_amount ?? null,
        category: mv.category ?? null,
        note: mv.note ?? null,
        registered_by: mv.registered_by ?? 'levy',
        is_correction: mv.is_correction ?? false,
        corrects_movement_id: mv.corrects_movement_id ?? null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, movement: data })
  }

  // ── add_snapshot ──
  if (body.action === 'add_snapshot') {
    const snap = body.snapshot
    if (!snap?.balances?.length) {
      return NextResponse.json({ error: 'Missing snapshot.balances' }, { status: 400 })
    }

    let balances: { account: string; currency: string; balance: number }[]
    try {
      balances = snap.balances.map((b) => {
        const account = byName.get((b.account ?? '').toLowerCase())
        if (!account) throw new Error(`Cuenta desconocida en balances: "${b.account}"`)
        return { account: account.name, currency: b.currency ?? account.currency, balance: b.balance }
      })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Balances inválidos' }, { status: 400 })
    }

    const { data: prevData } = await service
      .from('finance_snapshots')
      .select('snapshot_date, liquid_mxn, net_worth_mxn, fx')
      .order('snapshot_date', { ascending: false })
      .limit(1)
    const prev = prevData?.[0] as Pick<FinanceSnapshot, 'snapshot_date' | 'liquid_mxn' | 'net_worth_mxn' | 'fx'> | undefined

    const fx = snap.fx ?? (await getLiveFx(prev?.fx ?? null)).fx

    const kindByName = new Map(accounts.map((a) => [a.name, a.kind]))
    let liquidMxn = 0
    let porCobrarMxn = 0
    for (const b of balances) {
      const mxn = toMxn(b.balance, b.currency, fx)
      if (kindByName.get(b.account) === 'por_cobrar') porCobrarMxn += mxn
      else liquidMxn += mxn
    }
    const netWorthMxn = liquidMxn + porCobrarMxn

    const { data, error } = await service
      .from('finance_snapshots')
      .upsert(
        {
          snapshot_date: snap.snapshot_date ?? mexicoTodayISO(),
          balances,
          fx,
          liquid_mxn: Math.round(liquidMxn),
          liquid_usd: Math.round(liquidMxn / fx.usd_mxn),
          net_worth_mxn: Math.round(netWorthMxn),
          net_worth_usd: Math.round(netWorthMxn / fx.usd_mxn),
          delta_liquid_mxn: prev?.liquid_mxn != null ? Math.round(liquidMxn - prev.liquid_mxn) : null,
          delta_net_worth_mxn: prev?.net_worth_mxn != null ? Math.round(netWorthMxn - prev.net_worth_mxn) : null,
          notes: snap.notes ?? null,
        },
        { onConflict: 'snapshot_date' },
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, snapshot: data })
  }

  // ── add_recurring ──
  if (body.action === 'add_recurring') {
    const rec = body.recurring
    if (!rec?.name || !rec.charge_day || !rec.amount || !rec.currency) {
      return NextResponse.json({ error: 'Missing recurring fields (name, charge_day, amount, currency)' }, { status: 400 })
    }
    const account = rec.account ? byName.get(rec.account.toLowerCase()) : null

    const { data, error } = await service
      .from('finance_recurring')
      .insert({
        name: rec.name,
        category: rec.category ?? 'suscripciones',
        periodicity: rec.periodicity ?? 'mensual',
        charge_day: rec.charge_day,
        charge_month: rec.charge_month ?? null,
        currency: rec.currency,
        amount: rec.amount,
        account_id: account?.id ?? null,
        notes: rec.notes ?? null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, recurring: data })
  }

  // ── upsert_tax_period: un mes de impuestos. Solo se escriben los campos que vienen (lo demás se conserva). ──
  if (body.action === 'upsert_tax_period') {
    const p = body.period
    if (!p?.periodo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.periodo)) {
      return NextResponse.json({ error: 'period.periodo debe ser YYYY-MM' }, { status: 400 })
    }
    if (p.estado !== undefined && !TAX_ESTADOS.includes(p.estado as TaxEstado)) {
      return NextResponse.json({ error: `Estado inválido: "${p.estado}". Válidos: ${TAX_ESTADOS.join(', ')}` }, { status: 400 })
    }
    if (p.pagado_en != null && !ISO_DATE.test(p.pagado_en)) {
      return NextResponse.json({ error: 'pagado_en debe ser YYYY-MM-DD' }, { status: 400 })
    }
    if (p.estado === 'pagada' && !p.pagado_en) {
      return NextResponse.json({ error: 'Un mes pagado lleva pagado_en (YYYY-MM-DD)' }, { status: 400 })
    }
    const montos = ['ingreso', 'deducciones', 'isr', 'recargos_actualizacion', 'iva', 'total'] as const
    const fila: Record<string, unknown> = { periodo: p.periodo, updated_at: new Date().toISOString() }
    for (const k of montos) {
      const v = p[k]
      if (v === undefined) continue
      if (v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
        return NextResponse.json({ error: `${k} debe ser número ≥ 0 o null (sin dato)` }, { status: 400 })
      }
      fila[k] = v
    }
    for (const k of ['estado', 'pagado_en', 'fuente', 'nota'] as const) if (p[k] !== undefined) fila[k] = p[k]

    const { data, error } = await service.from('finance_tax_periods').upsert(fila, { onConflict: 'periodo' }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, period: data })
  }

  // ── add_tax_estimate: un estimado nuevo del total pendiente. Nunca se edita uno viejo: la tabla es la historia. ──
  if (body.action === 'add_tax_estimate') {
    const e = body.estimate
    const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
    if (!e || !ok(e.bajo) || !ok(e.centro) || !ok(e.alto)) {
      return NextResponse.json({ error: 'estimate necesita bajo, centro y alto (números ≥ 0, MXN)' }, { status: 400 })
    }
    if (!(e.bajo <= e.centro && e.centro <= e.alto)) {
      return NextResponse.json({ error: 'Debe cumplirse bajo ≤ centro ≤ alto' }, { status: 400 })
    }
    if (e.pagado != null && !ok(e.pagado)) return NextResponse.json({ error: 'pagado debe ser número ≥ 0' }, { status: 400 })
    if (e.fecha !== undefined && !ISO_DATE.test(e.fecha)) return NextResponse.json({ error: 'fecha debe ser YYYY-MM-DD' }, { status: 400 })

    const { data, error } = await service
      .from('finance_tax_estimates')
      .insert({ fecha: e.fecha ?? mexicoTodayISO(), bajo: e.bajo, centro: e.centro, alto: e.alto, pagado: e.pagado ?? null, nota: e.nota ?? null })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, estimate: data })
  }

  return NextResponse.json(
    { error: `Acción desconocida: "${body.action}". Válidas: add_movement, add_snapshot, add_recurring, upsert_tax_period, add_tax_estimate` },
    { status: 400 },
  )
}
