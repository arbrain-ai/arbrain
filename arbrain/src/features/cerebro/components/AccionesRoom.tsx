'use client'
// Sala "Acciones" del Artificial Brain — interocepción del cerebro artificial.
// Contesta con datos REALES: ¿qué hizo mi cerebro por mí hoy/esta semana? ¿qué
// me cuesta? Órganos (crons) clasificados por función neurológica, actividad
// destilada (no logs crudos) y costo por órgano. Es ESPEJO (AI-first): cualquier
// acción se pide hablando con Levy — el deep-link prellena el chat, no hay
// botones de operación nuevos. Data 100% server-side (/api/arbrain/acciones).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Loader2,
  MessageCircle,
  RefreshCw,
} from 'lucide-react'
import {
  CRON_ANATOMIA_META,
  type CronAnatomia,
} from '@/shared/constants/cron-taxonomy'

// ─── Tipos (espejo de /api/arbrain/acciones) ────────────────────────────────

interface OrganRun {
  runId: string
  at: string
  status: string
  error: string | null
  snippet: string | null
  costUsd: number | null
  durationMs: number | null
  model: string | null
}

interface Organ {
  id: string
  anatomia: CronAnatomia
  funcion: string
  superficie: string
  sensor: boolean
  schedule: string | null
  status: string
  nextRun: number | null
  lastRun: number | null
  stats: { runs: number; errors: number; costUsd: number | null; runsWithCost: number }
  recentRuns: OrganRun[]
}

interface AccionesData {
  ok: boolean
  range: 'today' | '7d'
  tz: string
  daemonOffline: boolean
  from: string
  organs: Organ[]
  totals: {
    organsTotal: number
    organsRan: number
    runs: number
    errors: number
    costUsd: number
    runsWithCost: number
  }
  costPorAnatomia: Partial<Record<CronAnatomia, { costUsd: number; runsWithCost: number; runs: number }>>
}

// ─── Helpers de formato ──────────────────────────────────────────────────────

function fmtUsd(v: number): string {
  if (v === 0) return '$0.00'
  return v < 0.1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`
}

function haceCuanto(iso: string | null, epoch?: number | null): string {
  const t = iso ? new Date(iso).getTime() : epoch ? epoch * 1000 : null
  if (!t) return '—'
  const mins = Math.floor((Date.now() - t) / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  return `hace ${days} d`
}

function horaEnTz(epochSecs: number | null, tz: string): string {
  if (!epochSecs) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(epochSecs * 1000))
}

function horaRunEnTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

const DOW_ES: Record<string, string> = {
  '0': 'domingos', '1': 'lunes', '2': 'martes', '3': 'miércoles',
  '4': 'jueves', '5': 'viernes', '6': 'sábados', '7': 'domingos',
}

function humanizarCron(expr: string | null): string {
  if (!expr) return ''
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, mon, dow] = parts
  const at = (h: string, m: string) => `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*')
    return `diario · ${at(hour, min)}`
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && DOW_ES[dow])
    return `${DOW_ES[dow]} · ${at(hour, min)}`
  if (/^\d+$/.test(min) && hour.startsWith('*/') && dom === '*')
    return `cada ${hour.slice(2)} h`
  if (/^\d+$/.test(min) && /^\d+(,\d+)+$/.test(hour) && dom === '*')
    return `diario · ${hour.split(',').map((h) => at(h, min)).join(' y ')}`
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*')
    return `día ${dom} de cada mes · ${at(hour, min)}`
  return expr
}

/** Nombre humano del órgano: "youtube-comments-respond" → "Youtube Comments Respond" */
function nombreOrgano(id: string): string {
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const ORDEN_ANATOMIA = (Object.keys(CRON_ANATOMIA_META) as CronAnatomia[])
  .sort((a, b) => CRON_ANATOMIA_META[a].orden - CRON_ANATOMIA_META[b].orden)

const ANATOMIA_COLOR: Record<CronAnatomia, string> = {
  sintesis: '#ff9101',   // oro — la voz
  sentidos: '#38bdf8',   // cielo — percepción
  reflejos: '#8C27F1',   // morado — acción
  aprendizaje: '#34d399', // verde — plasticidad
  centinelas: '#f87171', // rojo — vigilancia
  personal: '#e879f9',   // rosa — el dueño
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function AccionesRoom() {
  const [data, setData] = useState<AccionesData | null>(null)
  const [range, setRange] = useState<'today' | '7d'>('today')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async (r: 'today' | '7d') => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/arbrain/acciones?range=${r}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json() as AccionesData)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(range) }, [load, range])

  const pedirALevy = useAskLevy()

  // Agrupar órganos por sala anatómica (solo salas con órganos)
  const grupos = useMemo(() => {
    if (!data) return []
    const byAnatomia = new Map<CronAnatomia, Organ[]>()
    for (const o of data.organs) {
      const list = byAnatomia.get(o.anatomia) ?? []
      list.push(o)
      byAnatomia.set(o.anatomia, list)
    }
    return ORDEN_ANATOMIA
      .filter((a) => byAnatomia.has(a))
      .map((a) => ({ anatomia: a, organs: byAnatomia.get(a)! }))
  }, [data])

  // ── La lectura del día (síntesis arriba de todo) ──────────────────────────
  const lectura = useMemo(() => {
    if (!data) return null
    const { totals } = data
    const periodo = data.range === 'today' ? 'Hoy' : 'Esta semana'
    const frase: string[] = []
    frase.push(
      `${periodo} tu cerebro corrió ${totals.organsRan} órgano${totals.organsRan === 1 ? '' : 's'} en ${totals.runs} corrida${totals.runs === 1 ? '' : 's'}`,
    )
    frase.push(totals.errors > 0 ? `${totals.errors} con error` : 'sin errores')
    if (totals.runsWithCost > 0) {
      frase.push(`gastó ${fmtUsd(totals.costUsd)} medido en ${totals.runsWithCost} corrida${totals.runsWithCost === 1 ? '' : 's'}`)
    }

    // Lo más relevante: error primero; si no, la última síntesis; si no, el más caro
    let relevante: { texto: string; organId: string; esError: boolean } | null = null
    const conError = data.organs.find((o) => o.stats.errors > 0)
    if (conError) {
      const runError = conError.recentRuns.find((r) => r.status === 'error')
      relevante = {
        texto: `${nombreOrgano(conError.id)} falló: ${runError?.snippet ?? 'error sin detalle'}`,
        organId: conError.id,
        esError: true,
      }
    } else {
      const sintesis = data.organs
        .filter((o) => o.anatomia === 'sintesis' && o.recentRuns.length > 0 && o.recentRuns[0].snippet)
        .sort((a, b) => (b.recentRuns[0]?.at ?? '').localeCompare(a.recentRuns[0]?.at ?? ''))[0]
      if (sintesis) {
        relevante = {
          texto: `${nombreOrgano(sintesis.id)}: ${sintesis.recentRuns[0].snippet}`,
          organId: sintesis.id,
          esError: false,
        }
      }
    }
    return { frase: frase.join(' · '), relevante, sinCosto: totals.runsWithCost === 0 }
  }, [data])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-4">
        {/* Sub-toolbar de la sala */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border text-[11px] font-bold">
            {([['today', 'Hoy'], ['7d', '7 días']] as const).map(([r, label]) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 transition-colors ${
                  range === r ? 'bg-primary/20 text-accent-purple' : 'text-muted hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {data && (
            <span className="text-[10px] text-muted">
              zona horaria {data.tz}
              {data.daemonOffline && ' · ⚠️ daemon offline (solo historial)'}
            </span>
          )}
          <button
            onClick={() => load(range)}
            className="icon-btn ml-auto size-8"
            title="Actualizar"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-4 animate-spin text-accent-purple" />
              Leyendo la actividad del cerebro…
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-error/40 bg-card px-4 py-3 text-center text-xs text-error">
            {error}
          </div>
        )}

        {data && lectura && (
          <>
            {/* La lectura del día */}
            <div className="glass-panel mb-5 rounded-2xl border border-gold/25 px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gold">
                <Activity className="size-3.5" />
                La lectura {data.range === 'today' ? 'del día' : 'de la semana'}
              </div>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground">
                {lectura.frase}.
              </p>
              {lectura.relevante && (
                <button
                  onClick={() => setExpanded(lectura.relevante!.organId)}
                  className={`mt-2 block w-full rounded-lg border px-3 py-2 text-left text-xs leading-relaxed transition-colors ${
                    lectura.relevante.esError
                      ? 'border-error/40 bg-error/5 text-error hover:bg-error/10'
                      : 'border-border-subtle bg-card/60 text-muted hover:text-foreground'
                  }`}
                >
                  {lectura.relevante.esError && <AlertTriangle className="mr-1 inline size-3.5" />}
                  <span className="font-semibold">Lo más relevante:</span> {lectura.relevante.texto}
                </button>
              )}
              {lectura.sinCosto && (
                <p className="mt-2 text-[10px] text-muted">
                  Costo: sin dato en este rango — la medición por corrida arrancó el 6 jul 2026;
                  desde hoy cada corrida queda unida a su costo.
                </p>
              )}
            </div>

            {/* Salas anatómicas */}
            {grupos.map(({ anatomia, organs }) => {
              const meta = CRON_ANATOMIA_META[anatomia]
              const agg = data.costPorAnatomia[anatomia]
              const color = ANATOMIA_COLOR[anatomia]
              return (
                <section key={anatomia} className="mb-5">
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-foreground">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                      {meta.label}
                      <span className="font-normal text-muted">{organs.length}</span>
                    </h2>
                    <span className="text-[10px] text-muted">{meta.descripcion}</span>
                    <span className="ml-auto text-[10px] font-semibold text-muted">
                      {agg && agg.runs > 0 ? `${agg.runs} corrida${agg.runs === 1 ? '' : 's'}` : 'sin corridas'}
                      {' · '}
                      {agg && agg.runsWithCost > 0 ? fmtUsd(agg.costUsd) : 'costo sin dato'}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                    {organs.map((o, i) => {
                      const isOpen = expanded === o.id
                      const lastRun = o.recentRuns[0] ?? null
                      const dotColor = o.stats.errors > 0
                        ? '#f87171'
                        : o.stats.runs > 0
                          ? '#34d399'
                          : o.status === 'paused' ? '#666' : '#444'
                      return (
                        <div key={o.id} className={i > 0 ? 'border-t border-border-subtle' : ''}>
                          <button
                            onClick={() => setExpanded(isOpen ? null : o.id)}
                            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-card"
                          >
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: dotColor }}
                              title={o.stats.errors > 0 ? 'con error' : o.stats.runs > 0 ? 'corrió ok' : 'sin corridas en el rango'}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs font-bold text-foreground">
                                  {nombreOrgano(o.id)}
                                </span>
                                {o.sensor && (
                                  <span className="rounded-full border border-gold/40 px-1.5 text-[9px] font-bold text-gold" title="Te habla: llega al chat + push">
                                    te habla
                                  </span>
                                )}
                                {o.status === 'paused' && (
                                  <span className="rounded-full border border-border px-1.5 text-[9px] text-muted">pausado</span>
                                )}
                              </div>
                              <p className="truncate text-[11px] text-muted">{o.funcion}</p>
                            </div>
                            <div className="hidden shrink-0 text-right sm:block">
                              <p className="text-[11px] font-semibold text-foreground">
                                {o.stats.runs > 0 ? `${o.stats.runs}× · ${o.stats.costUsd != null ? fmtUsd(o.stats.costUsd) : 'costo s/d'}` : 'no corrió'}
                              </p>
                              <p className="text-[10px] text-muted">
                                {lastRun ? haceCuanto(lastRun.at) : o.lastRun ? haceCuanto(null, o.lastRun) : '—'}
                              </p>
                            </div>
                            <ChevronDown className={`size-3.5 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {isOpen && (
                            <div className="border-t border-border-subtle bg-background/40 px-3.5 py-3">
                              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
                                {o.schedule && <span>⏱ {humanizarCron(o.schedule)}</span>}
                                {o.nextRun && o.status === 'active' && (
                                  <span>próxima: {horaEnTz(o.nextRun, data.tz)}</span>
                                )}
                              </div>

                              {o.recentRuns.length > 0 ? (
                                <ul className="space-y-1.5">
                                  {o.recentRuns.map((r) => (
                                    <li key={r.runId} className="rounded-lg border border-border-subtle bg-card/60 px-2.5 py-1.5">
                                      <div className="flex items-center gap-2 text-[10px]">
                                        <span className={r.status === 'error' ? 'font-bold text-error' : 'text-muted'}>
                                          {r.status === 'error' ? '✗ error' : '✓ ok'}
                                        </span>
                                        <span className="text-muted">{horaRunEnTz(r.at, data.tz)}</span>
                                        <span className="ml-auto font-semibold text-foreground">
                                          {r.costUsd != null ? fmtUsd(r.costUsd) : 'costo s/d'}
                                        </span>
                                        {r.durationMs != null && (
                                          <span className="text-muted">{Math.round(r.durationMs / 1000)}s</span>
                                        )}
                                      </div>
                                      {r.snippet && (
                                        <p className={`mt-1 text-[11px] leading-relaxed ${r.status === 'error' ? 'text-error' : 'text-muted'}`}>
                                          {r.snippet}
                                        </p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-[11px] text-muted">Sin corridas en este rango.</p>
                              )}

                              {/* AI-first: el espejo termina en conversación, no en botones */}
                              <div className="mt-2.5 flex flex-wrap gap-2">
                                <button
                                  onClick={() => pedirALevy(
                                    o.stats.errors > 0
                                      ? `El órgano ${o.id} del Arbrain falló en su última corrida. Investiga el error y proponme el fix.`
                                      : `Sobre el órgano ${o.id} del Arbrain (${o.funcion.toLowerCase()}): `,
                                  )}
                                  className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[10px] font-bold text-gold transition-colors hover:bg-gold/10"
                                >
                                  <MessageCircle className="size-3" />
                                  Pídeselo a Levy
                                </button>
                                <a
                                  href={o.superficie}
                                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-semibold text-muted transition-colors hover:text-foreground"
                                >
                                  <ArrowUpRight className="size-3" />
                                  Ver su efecto
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
