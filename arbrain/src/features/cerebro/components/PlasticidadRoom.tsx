'use client'
// Sala "Plasticidad" del Artificial Brain — el cerebro que reescribe al dueño.
// Contesta con datos REALES: ¿qué patrón ve mi cerebro en mí que yo no veo?
// ¿qué decidí y no ejecuté? La lectura de patrones la ESCRIBE cada noche el
// órgano plasticidad-lectura (modo hipocampo); aquí solo se muestra. Rachas y
// cruces se computan server-side (/api/arbrain/plasticidad). Es ESPEJO
// (AI-first): la captura vive en /sistema y en el chat; cualquier acción se
// pide hablando con Levy. NUNCA fabrica patrones: con historia corta, decirlo
// ES la lectura correcta.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import {
  Brain,
  Loader2,
  MessageCircle,
  Moon,
  RefreshCw,
  Target,
} from 'lucide-react'

// ─── Tipos (espejo de /api/arbrain/plasticidad) ─────────────────────────────

interface Lectura {
  fecha: string
  lectura: string
  evidencia: unknown
  created_at: string
}

interface Objetivo {
  declaradaEl: string
  paraElDia: string
  objetivo: string
  estado: 'cumplido' | 'no_cumplido' | 'sin_registro' | 'pendiente'
}

interface DiaHabito { fecha: string; estado: 'hecho' | 'fallo' | 'sin_registro' }

interface HabitoStats {
  clave: string
  nombre: string
  icono: string | null
  registros: number
  hechos: number
  rachaActual: number
  mejorRacha: number
  ultimos14: DiaHabito[]
}

interface Reflexion {
  fecha: string
  prioridad_am: string | null
  respuesta_am: string | null
  respuesta_pm: string | null
}

interface PlasticidadData {
  ok: boolean
  lectura: Lectura | null
  decididoVsEjecutado: Objetivo[]
  consistencia: Array<{ seccion: string; habitos: HabitoStats[] }>
  reflexiones: Reflexion[]
  meta: { hoy: string; desde: string | null; diasConRegistro: number; historiaCorta: boolean }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

const SECCION_META: Record<string, { label: string; color: string }> = {
  ancla: { label: 'Ancla', color: '#ff9101' },
  cuerpo: { label: 'Cuerpo', color: '#38bdf8' },
  mente: { label: 'Mente', color: '#8C27F1' },
  nutricion: { label: 'Nutrición', color: '#34d399' },
}

const ESTADO_OBJETIVO: Record<Objetivo['estado'], { label: string; cls: string }> = {
  cumplido: { label: '✓ cumplido', cls: 'border-success/40 bg-success/10 text-success' },
  no_cumplido: { label: '✗ no cumplido', cls: 'border-error/40 bg-error/10 text-error' },
  pendiente: { label: 'en juego', cls: 'border-gold/40 bg-gold/10 text-gold' },
  sin_registro: { label: 'sin registro', cls: 'border-border text-muted' },
}

const DIA_COLOR: Record<DiaHabito['estado'], string> = {
  hecho: '#34d399',
  fallo: '#f87171',
  sin_registro: '#333',
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function PlasticidadRoom() {
  const [data, setData] = useState<PlasticidadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/arbrain/plasticidad')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json() as PlasticidadData)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const pedirALevy = useAskLevy()

  const reflexionesConContenido = useMemo(
    () => (data?.reflexiones ?? []).filter((r) =>
      (r.respuesta_am ?? '').trim() || (r.respuesta_pm ?? '').trim() || (r.prioridad_am ?? '').trim(),
    ),
    [data],
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-4">
        {/* Sub-toolbar de la sala */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {data && (
            <span className="text-[10px] text-muted">
              {data.meta.desde
                ? `historia desde el ${fechaCorta(data.meta.desde)} · ${data.meta.diasConRegistro} día${data.meta.diasConRegistro === 1 ? '' : 's'} con registro`
                : 'sin historia todavía'}
              {data.meta.historiaCorta && ' · historia corta: el cerebro apenas te está conociendo'}
            </span>
          )}
          <button
            onClick={() => load()}
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
              Leyendo lo que tu cerebro ve en ti…
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
            {/* ── La lectura de patrones (escrita por el órgano nocturno) ── */}
            <div className="glass-panel mb-5 rounded-2xl border border-gold/25 px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gold">
                <Brain className="size-3.5" />
                La lectura de tu cerebro
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
                    Escrita por el órgano <span className="font-semibold">plasticidad-lectura</span> (corre
                    cada noche a las 04:15 — modo hipocampo).
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    El órgano nocturno aún no escribe su primera lectura. Corre cada noche a las
                    04:15 y deja aquí lo que observó de ti — sin inventar: un patrón solo se
                    declara con evidencia repetida.
                  </p>
                  <button
                    onClick={() => pedirALevy('Dispara una corrida del órgano plasticidad-lectura del Arbrain para que escriba mi primera lectura de patrones.')}
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[10px] font-bold text-gold transition-colors hover:bg-gold/10"
                  >
                    <MessageCircle className="size-3" />
                    Pídesela a Levy ahora
                  </button>
                </>
              )}
            </div>

            {/* ── Decidido vs ejecutado ── */}
            <section className="mb-5">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-foreground">
                  <Target className="size-3.5 text-gold" />
                  Decidido vs ejecutado
                </h2>
                <span className="text-[10px] text-muted">
                  lo que declaraste en la noche ⟷ si lo cumpliste al día siguiente
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                {data.decididoVsEjecutado.length > 0 ? (
                  data.decididoVsEjecutado.map((o, i) => (
                    <div
                      key={o.declaradaEl}
                      className={`flex items-start gap-3 px-3.5 py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}
                    >
                      <div className="w-16 shrink-0 pt-0.5 text-[10px] text-muted">
                        <p>noche del</p>
                        <p className="font-bold text-foreground">{fechaCorta(o.declaradaEl)}</p>
                      </div>
                      <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                        “{o.objetivo}”
                        <span className="mt-0.5 block text-[10px] text-muted">
                          para el {fechaCorta(o.paraElDia)}
                        </span>
                      </p>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${ESTADO_OBJETIVO[o.estado].cls}`}>
                        {ESTADO_OBJETIVO[o.estado].label}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="px-3.5 py-3 text-[11px] text-muted">
                    Todavía no hay objetivos declarados en tus cierres de noche. El
                    evening-reflection (21:00) te pregunta el objetivo #1 de mañana — responderlo
                    es lo que alimenta este cruce.
                  </p>
                )}
              </div>
              {data.decididoVsEjecutado.some((o) => o.estado === 'sin_registro') && (
                <p className="mt-1.5 text-[10px] text-muted">
                  “Sin registro” = ese día no marcaste el hábito 🎯 “Cumplí mi objetivo del día”, así
                  que el cerebro no sabe si lo ejecutaste. No lo inventa.
                </p>
              )}
              <button
                onClick={() => pedirALevy('Viendo mi sala Plasticidad: ¿qué decidí y no ejecuté últimamente, y qué hago con eso?')}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[10px] font-bold text-gold transition-colors hover:bg-gold/10"
              >
                <MessageCircle className="size-3" />
                Pídeselo a Levy
              </button>
            </section>

            {/* ── Consistencia del carácter (rachas server-side) ── */}
            <section className="mb-5">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 className="text-sm font-extrabold tracking-tight text-foreground">
                  Consistencia del carácter
                </h2>
                <span className="text-[10px] text-muted">
                  rachas reales — un día sin registro rompe la racha, no se inventa
                </span>
              </div>
              {data.consistencia.map(({ seccion, habitos }) => {
                const meta = SECCION_META[seccion] ?? { label: seccion, color: '#888' }
                return (
                  <div key={seccion} className="mb-3">
                    <h3 className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
                      <span className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
                      {meta.label}
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                      {habitos.map((h, i) => (
                        <div
                          key={h.clave}
                          className={`flex items-center gap-3 px-3.5 py-2 ${i > 0 ? 'border-t border-border-subtle' : ''}`}
                        >
                          <span className="w-6 shrink-0 text-center text-sm">{h.icono ?? '·'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">{h.nombre}</p>
                            <p className="text-[10px] text-muted">
                              {h.registros > 0
                                ? `${h.hechos}/${h.registros} días registrados · mejor racha ${h.mejorRacha}`
                                : 'sin registros aún'}
                            </p>
                          </div>
                          {/* Últimos 14 días como puntos */}
                          <div className="hidden shrink-0 items-center gap-[3px] sm:flex" title="Últimos 14 días">
                            {h.ultimos14.map((d) => (
                              <span
                                key={d.fecha}
                                className="size-[7px] rounded-full"
                                style={{ backgroundColor: DIA_COLOR[d.estado] }}
                                title={`${fechaCorta(d.fecha)}: ${d.estado === 'hecho' ? 'hecho' : d.estado === 'fallo' ? 'no hecho' : 'sin registro'}`}
                              />
                            ))}
                          </div>
                          <span className={`w-12 shrink-0 text-right text-xs font-bold ${h.rachaActual > 0 ? 'text-gold' : 'text-muted'}`}>
                            {h.rachaActual > 0 ? `🔥 ${h.rachaActual}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {data.meta.historiaCorta && (
                <p className="mt-1.5 text-[10px] text-muted">
                  Historia corta ({data.meta.diasConRegistro} día{data.meta.diasConRegistro === 1 ? '' : 's'} con
                  registro desde el {data.meta.desde ? fechaCorta(data.meta.desde) : '—'}): las rachas
                  todavía no significan tendencia. Cada noche que cierras el día, esta sala aprende.
                </p>
              )}
            </section>

            {/* ── Timeline de reflexiones nocturnas ── */}
            <section className="mb-5">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-foreground">
                  <Moon className="size-3.5 text-accent-purple" />
                  Tus cierres de noche
                </h2>
                <span className="text-[10px] text-muted">lo que le dijiste a tu cerebro al final del día</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border-subtle bg-card/50">
                {reflexionesConContenido.length > 0 ? (
                  reflexionesConContenido.map((r, i) => (
                    <div key={r.fecha} className={`px-3.5 py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                        {fechaLarga(r.fecha)}
                      </p>
                      {(r.respuesta_am ?? '').trim() && (
                        <p className="mt-1 text-xs leading-relaxed text-foreground">
                          <span className="text-muted">objetivo para mañana → </span>
                          “{(r.respuesta_am ?? '').trim()}”
                        </p>
                      )}
                      {(r.prioridad_am ?? '').trim() && (
                        <p className="mt-1 text-xs leading-relaxed text-foreground">
                          <span className="text-muted">prioridad → </span>
                          “{(r.prioridad_am ?? '').trim()}”
                        </p>
                      )}
                      {(r.respuesta_pm ?? '').trim() && (
                        <p className="mt-1 text-xs leading-relaxed text-foreground">
                          <span className="text-muted">reflexión → </span>
                          “{(r.respuesta_pm ?? '').trim()}”
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="px-3.5 py-3 text-[11px] text-muted">
                    Aún no hay reflexiones con contenido. El ritual vive en el chat: cada noche a
                    las 21:00 el evening-reflection te hace UNA pregunta — tu respuesta aterriza aquí.
                  </p>
                )}
              </div>
              <button
                onClick={() => pedirALevy('Léeme mis últimos cierres de noche (sala Plasticidad) y dime qué tema se repite.')}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[10px] font-bold text-gold transition-colors hover:bg-gold/10"
              >
                <MessageCircle className="size-3" />
                Pídeselo a Levy
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
