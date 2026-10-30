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
} from '@/features/finances/types/finances'
import { calcularV2 } from '@/features/finances/lib/agregados'

/**
 * /api/finanzas — Finanzas personales el dueño + la socia
 *
 * GET  → payload completo (accounts, movements del mes, snapshots, recurring, summary).
 *        Query params: ?month=YYYY-MM (default mes actual, tz Mexico City)
 * POST → escritura para agentes (Levy) y UI:
 *        { action: 'add_movement', movement: {...} }
 *        { action: 'add_snapshot', snapshot: {...} }
 *        { action: 'add_recurring', recurring: {...} }
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
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  // Rango GLOBAL: recalcula toda la página (curva, KPIs, runway). Default: últimos 30 días.
  const RANGE_DAYS: Record<string, number> = { '30d': 30, '3m': 90, '6m': 180, '12m': 365 }
  const rangeParam = searchParams.get('range') ?? '30d'
  const range = rangeParam in RANGE_DAYS ? rangeParam : '30d'
  const days = RANGE_DAYS[range]

  const service = createServiceClient()

  // Ventana del rango: `days` días hacia atrás desde hoy (tz Mexico City).
  const todayISO = mexicoTodayISO()
  const windowStart = new Date(`${todayISO}T12:00:00Z`)
  windowStart.setUTCDate(windowStart.getUTCDate() - (days - 1))
  const fromISO = windowStart.toISOString().slice(0, 10)
  // Meses completos de contexto (13) sin importar el rango: el mes «de la lectura» no puede depender del botón 30D.
  const [ty, tm] = todayISO.split('-').map(Number)
  const contextStart = new Date(Date.UTC(ty, tm - 1 - 12, 1, 12)).toISOString().slice(0, 10)
  const queryFrom = contextStart < fromISO ? contextStart : fromISO

  // FX vivo en paralelo con la BD (26 sep 2026): antes esperaba a que terminaran
  // las 4 consultas y en lambda fría sumaba hasta 4 s de open.er-api en serie. El
  // snapshot solo aporta el FALLBACK, que se aplica abajo si el vivo falló.
  const liveFxPromise = getLiveFx(null)

  const [accountsRes, movementsRes, snapshotsRes, recurringRes] = await Promise.all([
    service.from('finance_accounts').select('*').order('created_at'),
    service
      .from('finance_movements')
      .select('*')
      .gte('date', queryFrom)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    service.from('finance_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(24),
    service.from('finance_recurring').select('*').eq('is_active', true).order('charge_day'),
  ])

  const firstError = accountsRes.error || movementsRes.error || snapshotsRes.error || recurringRes.error
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  const accounts = (accountsRes.data ?? []) as FinanceAccount[]
  const contextMovements = (movementsRes.data ?? []) as FinanceMovement[]
  // `movements` del payload sigue siendo SOLO el rango (contrato del GET); el contexto de 13 meses alimenta `months`.
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
    const mxn = toMxn(m.amount, m.currency, fx)
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
  const statementBacked = rangeMovements.some(
    (m) => m.type === 'gasto' && !m.is_correction && m.registered_by === 'estado-de-cuenta'
  )
  const monthlyBurn = statementBacked ? oneoffMonthly : recurringMonthlyMxn + oneoffMonthly
  // Poco confiable si el burn es casi puro presupuesto (sin estados) o si no hay datos.
  const runwayLowConfidence = statementBacked
    ? false
    : recurringMonthlyMxn === 0 || expenseMovementCount < 3
  const latestLiquidMxn = snapshots[0]?.liquid_mxn ?? null
  const runwayMonths =
    latestLiquidMxn && monthlyBurn > 0 ? Number((latestLiquidMxn / monthlyBurn).toFixed(1)) : null

  return NextResponse.json({
    accounts,
    movements: rangeMovements,
    snapshots,
    recurring,
    summary: {
      range,
      days,
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

  let body: { action?: string; movement?: AddMovementBody; snapshot?: AddSnapshotBody; recurring?: AddRecurringBody }
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

  return NextResponse.json(
    { error: `Acción desconocida: "${body.action}". Válidas: add_movement, add_snapshot, add_recurring` },
    { status: 400 },
  )
}
