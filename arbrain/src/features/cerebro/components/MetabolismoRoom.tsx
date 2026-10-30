'use client'
// Sala "Metabolismo" del Artificial Brain — el cerebro que se mide, se poda y
// se consolida a sí mismo (SELF-REGULATE). Contesta con datos REALES: ¿qué me
// cuesta y qué me rinde? ¿qué se está muriendo? La lectura metabólica + el
// libro de rentas los ESCRIBE cada noche el órgano `metabolismo` (el puente
// local→Supabase); la tasa viva se agrega server-side (/api/arbrain/
// metabolismo). CONTRATO SAGRADO: el órgano PROPONE, Daniel FIRMA hablando con
// Levy, Levy ejecuta — esta sala no tiene ni un botón que mate algo. Renta sin
// señal = "sin dato"; los centinelas jamás se juzgan por frecuencia.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import {
  Activity,
  BookOpen,
  Flame,
  Loader2,
  MessageCircle,
  PenLine,
  RefreshCw,
  TrendingDown,
} from 'lucide-react'
import { CRON_ANATOMIA_META, type CronAnatomia } from '@/shared/constants/cron-taxonomy'

// ─── Tipos (espejo de /api/arbrain/metabolismo; el libro lo escribe el órgano
//     → parsear DEFENSIVO, nunca asumir shape perfecto) ─────────────────────

interface Lectura {
  fecha: string
  lectura: string
  tasa: unknown
  libro: unknown
  muriendo: unknown
  created_at: string
}

interface Propuesta {
  id: string
  clave: string
  tipo: string
  clase: string
  neurona: string
  titulo: string
  propuesta: string
  evidencia: unknown
  ahorro_estimado: string | null
  riesgo: string | null
  estado: 'propuesta' | 'firmada' | 'rechazada' | 'ejecutada'
  decision_nota: string | null
  decided_at: string | null
  created_at: string
}

// TOKENS, NO DÓLARES (15 jul 2026). Con suscripción (tarifa plana) el costUsd del
// SDK es precio NOCIONAL de API, dinero que no sale de la cuenta. Esta sala llegó a
// mostrarlo como fracción de los ingresos: ficción dividida por un número real. Lo escaso bajo Max es la CUOTA de rate limit, y eso son tokens.
// El dólar no vuelve a esta pantalla salvo que se vuelva a pagar por API.
interface TasaViva {
  hoyTokens: number
  ultimos7dTokens: number
  ultimos30dTokens: number
  promedioDiarioTokens: number | null
  proyeccionMesTokens: number | null
  runsMedidos7d: number
  runsMedidos30d: number
  runsSinMedir30d: number
  primeraMedicion: string | null
  diasMedidos: number
  serie14d: Array<{ fecha: string; tokens: number; runs: number; errores: number }>
  porAnatomia: Partial<Record<CronAnatomia, { tokens: number; runs: number; errores: number }>>
}

/** Salud = primera clase: un órgano que falla quema cuota sin producir nada. */
interface Salud {
  corridas7d: number
  errores7d: number
  tasaErrorPct: number | null
  enfermos: Array<{ id: string; runs: number; errores: number; tokens: number; tasaError: number }>
}

interface MetabolismoData {
  ok: boolean
  lectura: Lectura | null
  propuestas: Propuesta[]
  tasaViva: TasaViva
  salud: Salud
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Tokens legibles: 1.2M / 348K / 940. Nunca un 0 fabricado. */
function tok(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return 'sin dato'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return `${Math.round(n)}`
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

function fechaLarga(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

/** Chip de veredicto del libro (texto libre del órgano → color razonable). */
function veredictoCls(v: string): string {
  const t = v.toLowerCase()
  if (t.includes('paga') && !t.includes('no')) return 'border-success/40 bg-success/10 text-success'
  if (t.includes('no-paga') || t.includes('no paga')) return 'border-error/40 bg-error/10 text-error'
  if (t.includes('dieta') || t.includes('podar')) return 'border-gold/40 bg-gold/10 text-gold'
  if (t.includes('vigente')) return 'border-success/40 bg-success/10 text-success'
  return 'border-border text-muted'
}

const ESTADO_PROPUESTA: Record<Propuesta['estado'], { label: string; cls: string }> = {
  propuesta: { label: 'espera tu firma', cls: 'border-gold/40 bg-gold/10 text-gold' },
  firmada: { label: 'firmada', cls: 'border-success/40 bg-success/10 text-success' },
  ejecutada: { label: 'ejecutada', cls: 'border-success/40 bg-success/10 text-success' },
  rechazada: { label: 'rechazada', cls: 'border-border text-muted' },
}

const TIPO_LABEL: Record<string, string> = {
  poda: 'Poda',
  consolidacion: 'Consolidación',
  dieta: 'Dieta',
  'test-centinela': 'Test de centinela',
  instrumentacion: 'Instrumentación',
  auditoria: 'Auditoría',
}

const CLASE_LABEL: Record<string, string> = {
  reflejo: 'reflejo (cron)',
  programa_motor: 'programa motor (skill)',
  memoria: 'memoria',
  centinela: 'centinela',
  sistema: 'sistema',
}

// Shapes defensivos del libro jsonb (escrito por el órgano)
// `tokens30d` es el campo nuevo (15 jul 2026). `costo30dUsd` sobrevive solo para
// no romper las lecturas ya escritas — NO se muestra: era precio nocional de API
// bajo tarifa plana. Lectura vieja = "sin dato", que es la verdad.
interface LibroReflejo { id?: string; tokens30d?: number; costo30dUsd?: number; corridas30d?: number; errores7d?: number; veredicto?: string; nota?: string }
interface LibroSkills { total?: number; masViejasSinTocar?: Array<{ skill?: string; ultimoToque?: string }>; veredicto?: string }
interface LibroMemorias { archivos?: number; concepts?: number; connections?: number; compiladorUltimaCorrida?: string; dailySinCompilar?: number; veredicto?: string }
interface LibroCentinela { id?: string; riesgo?: string; ultimoDisparo?: string; veredicto?: string }
interface Muriendo { que?: string; evidencia?: string; desde?: string }

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}
function asObj<T>(v: unknown): T | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function MetabolismoRoom() {
  const [data, setData] = useState<MetabolismoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/arbrain/metabolismo')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json() as MetabolismoData)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const pedirALevy = useAskLevy()

  const libro = useMemo(() => {
    const raw = asObj<Record<string, unknown>>(data?.lectura?.libro ?? null)
    return {
      reflejos: asArray<LibroReflejo>(raw?.reflejos),
      skills: asObj<LibroSkills>(raw?.programas_motores ?? null),
      memorias: asObj<LibroMemorias>(raw?.memorias ?? null),
      centinelas: asArray<LibroCentinela>(raw?.centinelas),
    }
  }, [data])

  const muriendo = useMemo(() => asArray<Muriendo>(data?.lectura?.muriendo ?? null), [data])

  const pendientes = useMemo(() => (data?.propuestas ?? []).filter((p) => p.estado === 'propuesta'), [data])
  const historial = useMemo(() => (data?.propuestas ?? []).filter((p) => p.estado !== 'propuesta'), [data])

  const maxSerie = useMemo(() => {
    const vals = data?.tasaViva.serie14d.map((d) => d.tokens) ?? []
    return Math.max(1, ...vals)
  }, [data])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-4">
        {/* Sub-toolbar de la sala */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {data && (
            <span className="text-[10px] text-muted">
              {data.tasaViva.primeraMedicion
                ? `medido desde el ${fechaCorta(data.tasaViva.primeraMedicion)} · ${data.tasaViva.runsMedidos30d} corridas medidas`
                : 'aún sin corridas medidas'}
              {pendientes.length > 0 && ` · ${pendientes.length} propuesta${pendientes.length === 1 ? '' : 's'} espera${pendientes.length === 1 ? '' : 'n'} tu firma`}
            </span>
          )}
          <button onClick={() => load()} className="icon-btn ml-auto size-8" title="Actualizar">
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-4 animate-spin text-accent-purple" />
              Midiendo el metabolismo de tu cerebro…
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-error/40 bg-card px-4 py-3 text-center text-xs text-error">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── La lectura metabólica (escrita por el órgano auditor) ── */}
            <div className="glass-panel mb-5 rounded-2xl border border-gold/25 px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gold">
                <Activity className="size-3.5" />
                La lectura metabólica
                {data.lectura && (
                  <span className="font-normal normal-case tracking-normal text-muted">
                    · {fechaLarga(data.lectura.fecha)}
                  </span>
                )}
              </div>
              {data.lectura ? (
                <>
                  <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-foreground">
                    {data.lectura.lectura}
                  </p>
                  <p className="mt-2 text-[10px] text-muted">
                    Escrita por el órgano <span className="font-semibold">metabolismo</span> (auditor
                    nocturno, 04:45 — propone, tú firmas; se audita a sí mismo).
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    El auditor nocturno aún no escribe su primera lectura. Corre cada noche a las
                    04:45: mide qué órgano paga renta, qué se está muriendo, y deja propuestas de
                    poda que TÚ firmas — nada se mata solo.
                  </p>
                  <button
                    onClick={() => pedirALevy('Dispara una corrida del órgano metabolismo del Arbrain para que escriba mi primera lectura metabólica y sus propuestas.')}
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[10px] font-bold text-gold transition-colors hover:bg-gold/10"
                  >
                    <MessageCircle className="size-3" />
                    Pídesela a Levy ahora
                  </button>
                </>
              )}
            </div>

            {/* ── Tasa metabólica (viva, server-side) ── */}
            <section className="mb-5">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-foreground">
                  <Flame className="size-3.5 text-gold" />
                  Tasa metabólica
                </h2>
                <span className="text-[10px] text-muted">
                  cuota que quema tu cerebro — tokens, no dólares (Max = tarifa plana)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'hoy', value: tok(data.tasaViva.hoyTokens) },
                  { label: 'últimos 7 días', value: tok(data.tasaViva.ultimos7dTokens) },
                  {
                    label: 'proyección / mes',
                    value: data.tasaViva.proyeccionMesTokens != null
                      ? tok(data.tasaViva.proyeccionMesTokens)
                      : data.tasaViva.diasMedidos > 0
                        ? `midiendo (día ${data.tasaViva.diasMedidos})`
                        : 'sin dato',
                  },
                ].map((t) => (
                  <div key={t.label} className="rounded-xl border border-border-subtle bg-card/50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-widest text-muted">{t.label}</p>
                    <p className="mt-0.5 text-lg font-extrabold tracking-tight text-foreground">{t.value}</p>
                  </div>
                ))}
              </div>
              {/* Serie 14 días — barra = tokens, punto rojo = hubo errores ese día */}
              <div className="mt-2 rounded-xl border border-border-subtle bg-card/50 px-3.5 py-2.5">
                <div className="flex h-14 items-end gap-1" title="Tokens por día, últimos 14 días (UTC)">
                  {data.tasaViva.serie14d.map((d) => (
                    <div key={d.fecha} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-sm ${d.errores > 0 ? 'bg-red-500/70' : 'bg-gold/70'}`}
                        style={{ height: `${Math.max(d.tokens > 0 ? 8 : 2, (d.tokens / maxSerie) * 44)}px`, opacity: d.tokens > 0 ? 1 : 0.25 }}
                        title={`${fechaCorta(d.fecha)}: ${tok(d.tokens)} tokens · ${d.runs} corridas${d.errores > 0 ? ` · ${d.errores} con error` : ''}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-muted">
                  <span>{fechaCorta(data.tasaViva.serie14d[0]?.fecha ?? '')}</span>
                  <span>{fechaCorta(data.tasaViva.serie14d.at(-1)?.fecha ?? '')}</span>
                </div>
              </div>
              {/* Por anatomía */}
              <div className="mt-2 overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                {(Object.entries(data.tasaViva.porAnatomia) as Array<[CronAnatomia, { tokens: number; runs: number; errores: number }]>)
                  .sort((a, b) => b[1].tokens - a[1].tokens)
                  .map(([anatomia, v], i) => (
                    <div key={anatomia} className={`flex items-center justify-between px-3.5 py-1.5 text-[11px] ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                      <span className="text-foreground">{CRON_ANATOMIA_META[anatomia]?.label ?? anatomia}</span>
                      <span className="text-muted">
                        {v.runs} corridas
                        {v.errores > 0 && <span className="text-red-400"> · {v.errores} err</span>}
                        {' · '}<span className="font-bold text-foreground">{tok(v.tokens)}</span>
                      </span>
                    </div>
                  ))}
                {data.tasaViva.runsSinMedir30d > 0 && (
                  <p className="border-t border-border-subtle px-3.5 py-1.5 text-[10px] text-muted">
                    {data.tasaViva.runsSinMedir30d} corridas de los últimos 30 días sin tokens medidos
                    (anteriores a la instrumentación) — sin dato, no 0.
                  </p>
                )}
              </div>
            </section>

            {/* ── Salud: un órgano que falla quema cuota sin producir ── */}
            {data.salud && (
              <section className="mt-3">
                <div className="mb-1.5 flex items-baseline gap-2">
                  <h3 className="text-sm font-bold text-foreground">Salud</h3>
                  <span className="text-[10px] text-muted">
                    corridas que fallan — queman cuota y no producen nada
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                  <div className="flex items-center justify-between px-3.5 py-2 text-[11px]">
                    <span className="text-foreground">últimos 7 días</span>
                    <span className="text-muted">
                      {data.salud.corridas7d} corridas ·{' '}
                      <span className={`font-bold ${(data.salud.tasaErrorPct ?? 0) > 20 ? 'text-red-400' : 'text-foreground'}`}>
                        {data.salud.tasaErrorPct != null ? `${data.salud.tasaErrorPct.toFixed(0)}% error` : 'sin dato'}
                      </span>
                    </span>
                  </div>
                  {data.salud.enfermos.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 border-t border-border-subtle px-3.5 py-1.5 text-[11px]">
                      <span className="truncate text-foreground">{e.id}</span>
                      <span className="shrink-0 text-red-400">
                        {e.errores}/{e.runs} fallan · {tok(e.tokens)} quemados
                      </span>
                    </div>
                  ))}
                  {data.salud.enfermos.length === 0 && (
                    <p className="border-t border-border-subtle px-3.5 py-1.5 text-[10px] text-muted">
                      Ningún órgano enfermo (≥60% de fallos con ≥3 corridas).
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* ── El libro de rentas (escrito por el órgano) ── */}
            <section className="mb-5">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-foreground">
                  <BookOpen className="size-3.5 text-accent-purple" />
                  El libro de rentas
                </h2>
                <span className="text-[10px] text-muted">
                  renta = cambió una decisión · alimenta otro órgano · produjo contenido · ahorró minutos
                </span>
              </div>

              {!data.lectura && (
                <p className="rounded-xl border border-border-subtle bg-card/50 px-3.5 py-3 text-[11px] text-muted">
                  El libro lo escribe el auditor nocturno en su primera corrida.
                </p>
              )}

              {/* Reflejos (crons) */}
              {libro.reflejos.length > 0 && (
                <div className="mb-3">
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
                    Reflejos y demás órganos (crons) · costo real 30d
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                    {libro.reflejos.map((r, i) => (
                      <div key={r.id ?? i} className={`flex items-center gap-3 px-3.5 py-2 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{r.id ?? '—'}</p>
                          <p className="text-[10px] text-muted">
                            {r.corridas30d != null ? `${r.corridas30d} corridas` : 'corridas sin dato'}
                            {r.errores7d != null && r.errores7d > 0 && ` · ${r.errores7d} errores 7d`}
                            {r.nota && ` · ${r.nota}`}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold text-foreground">{r.tokens30d != null ? tok(r.tokens30d) : 'sin dato'}</span>
                        {r.veredicto && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${veredictoCls(r.veredicto)}`}>
                            {r.veredicto}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Programas motores (skills) */}
              {libro.skills && (
                <div className="mb-3">
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
                    Programas motores (skills)
                  </h3>
                  <div className="rounded-xl border border-border-subtle bg-card/50 px-3.5 py-2.5">
                    <p className="text-xs text-foreground">
                      {libro.skills.total ?? '—'} skills · <span className="text-muted">{libro.skills.veredicto ?? 'sin dato de invocación'}</span>
                    </p>
                    {(libro.skills.masViejasSinTocar?.length ?? 0) > 0 && (
                      <p className="mt-1 text-[10px] leading-relaxed text-muted">
                        Sin tocar desde hace más tiempo:{' '}
                        {libro.skills.masViejasSinTocar!.map((s) => `${s.skill ?? '—'} (${s.ultimoToque ?? '—'})`).join(' · ')}
                        <span className="block">Viejo ≠ muerto: no hay tracking de invocación todavía — el proxy es el último commit.</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Memorias */}
              {libro.memorias && (
                <div className="mb-3">
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
                    Memorias · se consolidan, jamás se borran
                  </h3>
                  <div className="rounded-xl border border-border-subtle bg-card/50 px-3.5 py-2.5">
                    <p className="text-xs text-foreground">
                      {libro.memorias.archivos ?? '—'} memorias · {libro.memorias.concepts ?? '—'} concepts · {libro.memorias.connections ?? '—'} connections
                    </p>
                    <p className="mt-1 text-[10px] text-muted">
                      {libro.memorias.compiladorUltimaCorrida
                        ? `Compilador de knowledge: última corrida ${libro.memorias.compiladorUltimaCorrida}`
                        : 'Compilador de knowledge: sin dato'}
                      {libro.memorias.dailySinCompilar != null && ` · ${libro.memorias.dailySinCompilar} daily logs sin destilar`}
                      {libro.memorias.veredicto && ` · ${libro.memorias.veredicto}`}
                    </p>
                  </div>
                </div>
              )}

              {/* Centinelas */}
              {libro.centinelas.length > 0 && (
                <div className="mb-1">
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
                    Centinelas · lógica de seguro: riesgo vigente, nunca frecuencia
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                    {libro.centinelas.map((c, i) => (
                      <div key={c.id ?? i} className={`flex items-center gap-3 px-3.5 py-2 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{c.id ?? '—'}</p>
                          <p className="text-[10px] text-muted">
                            {c.riesgo ? `riesgo: ${c.riesgo}` : 'riesgo sin dato'}
                            {c.ultimoDisparo && ` · último disparo: ${c.ultimoDisparo}`}
                          </p>
                        </div>
                        {c.veredicto && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${veredictoCls(c.veredicto)}`}>
                            {c.veredicto}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ── Qué se está muriendo ── */}
            <section className="mb-5">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-foreground">
                  <TrendingDown className="size-3.5 text-error" />
                  Qué se está muriendo
                </h2>
                <span className="text-[10px] text-muted">con evidencia — sin evidencia no se declara</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                {muriendo.length > 0 ? (
                  muriendo.map((m, i) => (
                    <div key={i} className={`px-3.5 py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                      <p className="text-xs font-semibold text-foreground">{m.que ?? '—'}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {m.evidencia ?? ''}
                        {m.desde && ` · desde ${m.desde}`}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="px-3.5 py-3 text-[11px] text-muted">
                    {data.lectura
                      ? 'Nada muriéndose según la última auditoría. Buen signo.'
                      : 'El auditor nocturno reporta aquí lo que encuentra muriéndose (errores repetidos, órganos sin correr, compiladores pausados).'}
                  </p>
                )}
              </div>
              {muriendo.length > 0 && (
                <button
                  onClick={() => pedirALevy('Viendo "qué se está muriendo" en mi sala Metabolismo: dame tu lectura y qué harías con cada uno.')}
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[10px] font-bold text-gold transition-colors hover:bg-gold/10"
                >
                  <MessageCircle className="size-3" />
                  Pídeselo a Levy
                </button>
              )}
            </section>

            {/* ── Propuestas: el órgano propone, tú firmas, Levy ejecuta ── */}
            <section className="mb-5">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-foreground">
                  <PenLine className="size-3.5 text-gold" />
                  Propuestas de poda y consolidación
                </h2>
                <span className="text-[10px] text-muted">
                  el órgano propone · tú firmas hablando con Levy · nada se ejecuta solo
                </span>
              </div>

              {pendientes.length > 0 ? (
                pendientes.map((p) => (
                  <div key={p.id} className="mb-2 rounded-xl border border-gold/25 bg-card/50 px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-accent-purple/40 bg-accent-purple/10 px-2 py-0.5 text-[10px] font-bold text-accent-purple">
                        {TIPO_LABEL[p.tipo] ?? p.tipo}
                      </span>
                      <span className="text-[10px] text-muted">{CLASE_LABEL[p.clase] ?? p.clase} · {p.neurona}</span>
                      <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold ${ESTADO_PROPUESTA[p.estado].cls}`}>
                        {ESTADO_PROPUESTA[p.estado].label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-foreground">{p.titulo}</p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/90">{p.propuesta}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {p.ahorro_estimado && `ahorro estimado: ${p.ahorro_estimado}`}
                      {p.ahorro_estimado && p.riesgo && ' · '}
                      {p.riesgo && `riesgo de firmarla: ${p.riesgo}`}
                    </p>
                    <button
                      onClick={() => pedirALevy(`Propuesta del Metabolismo "${p.titulo}" (clave ${p.clave}): ${p.propuesta} — ¿me la recomiendas? Si la firmo, ejecútala tú y actualiza su estado en metabolismo_propuestas con la nota de decisión.`)}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[10px] font-bold text-gold transition-colors hover:bg-gold/10"
                    >
                      <MessageCircle className="size-3" />
                      Revisarla con Levy
                    </button>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-border-subtle bg-card/50 px-3.5 py-3 text-[11px] text-muted">
                  {data.lectura
                    ? 'Cero propuestas esperando firma. El cerebro no ve nada que podar hoy.'
                    : 'Aquí aparecen las propuestas del auditor con su evidencia. Firmar = decírselo a Levy en el chat; una poda equivocada es cara, por eso nada se ejecuta solo.'}
                </p>
              )}

              {/* Historial = tombstones con motivo */}
              {historial.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-muted hover:text-foreground">
                    Historial de firmas ({historial.length}) — por qué murió (o sobrevivió) cada órgano
                  </summary>
                  <div className="mt-1.5 overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                    {historial.map((p, i) => (
                      <div key={p.id} className={`px-3.5 py-2 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-foreground">{p.titulo}</p>
                          <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold ${ESTADO_PROPUESTA[p.estado].cls}`}>
                            {ESTADO_PROPUESTA[p.estado].label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {p.neurona}
                          {p.decided_at && ` · ${fechaCorta(p.decided_at)}`}
                          {p.decision_nota && ` · ${p.decision_nota}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
