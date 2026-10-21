'use client'

import { useEffect, useState } from 'react'
import { useSistema } from '../hooks/useSistema'
import { useInteligencia } from '../hooks/useInteligencia'
import { Heatmap } from './Heatmap'
import { Inteligencia } from './Inteligencia'
import { SECCION_LABEL, SECCION_ORDER, type Seccion } from '../types'

const GOLD = '#ff9101'

export function SistemaPage() {
  const { loading, habitos, doneToday, toggle, reflexion, saveReflexion, history, streak, total, doneCount } = useSistema()
  const { runs: sensorRuns, loading: sensorLoading } = useInteligencia()

  // estado local de los campos de reflexion (se guarda on blur, no por tecla)
  const [pri, setPri] = useState('')
  const [am, setAm] = useState('')
  const [pm, setPm] = useState('')
  useEffect(() => {
    setPri(reflexion.prioridad_am); setAm(reflexion.respuesta_am); setPm(reflexion.respuesta_pm)
  }, [reflexion.prioridad_am, reflexion.respuesta_am, reflexion.respuesta_pm])

  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ background: '#09090b' }}>
      <div className="mx-auto max-w-3xl px-5 py-8 text-zinc-100">
        {/* Header */}
        <div className="mb-1 text-[13px] font-extrabold tracking-wide" style={{ color: GOLD }}>EL TEMPLO · EL SISTEMA</div>
        <h1 className="text-4xl font-black" style={{ fontFamily: 'Roboto Slab, serif' }}>El Sistema</h1>
        <p className="mt-2 text-sm italic text-zinc-400">Identidad → Disciplina → Ejecución. No lo optimices: llénalo todos los días, por años.</p>

        {loading && <div className="mt-8 text-zinc-500">Cargando…</div>}

        {!loading && (
          <>
            {/* ZONA HOY */}
            <section className="mt-8">
              <div className="flex items-end justify-between">
                <h2 className="text-lg font-extrabold" style={{ color: GOLD }}>HOY</h2>
                <div className="text-sm text-zinc-400">{doneCount}/{total} · racha {streak}🔥</div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: GOLD }} />
              </div>

              <div className="mt-5 space-y-5">
                {SECCION_ORDER.map((sec) => {
                  const items = habitos.filter((h) => h.seccion === sec)
                  if (!items.length) return null
                  return (
                    <div key={sec}>
                      <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: '#ffac3d' }}>{SECCION_LABEL[sec as Seccion]}</div>
                      <div className="space-y-2">
                        {items.map((h) => {
                          const done = doneToday.has(h.clave)
                          return (
                            <button
                              key={h.id}
                              onClick={() => void toggle(h.clave)}
                              className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
                              style={{
                                borderColor: done ? 'rgba(255,145,1,0.6)' : 'rgba(255,255,255,0.08)',
                                background: done ? 'rgba(255,145,1,0.10)' : 'rgba(18,19,27,0.6)',
                              }}
                            >
                              <span
                                className="flex h-6 w-6 flex-none items-center justify-center rounded-full border text-sm"
                                style={{ borderColor: done ? GOLD : 'rgba(255,255,255,0.25)', background: done ? GOLD : 'transparent', color: done ? '#09090b' : 'transparent' }}
                              >✓</span>
                              <span className="text-lg">{h.icono}</span>
                              <span className={done ? 'text-zinc-100' : 'text-zinc-300'}>{h.nombre}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reflexion */}
              <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">☀️ Prioridad de hoy</span>
                  <input
                    value={pri} onChange={(e) => setPri(e.target.value)} onBlur={() => void saveReflexion({ prioridad_am: pri })}
                    placeholder="¿Qué bien voy a hacer hoy?"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">🌙 Cierre del día</span>
                  <textarea
                    value={pm} onChange={(e) => setPm(e.target.value)} onBlur={() => void saveReflexion({ respuesta_pm: pm })}
                    placeholder="¿Avancé en mi cosa, o me escondí en algo que se sentía productivo?"
                    rows={3}
                    className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                  />
                </label>
              </div>
            </section>

            {/* ZONA STATS */}
            <section className="mt-10">
              <h2 className="mb-3 text-lg font-extrabold" style={{ color: GOLD }}>CONSISTENCIA</h2>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <Heatmap history={history} />
                <div className="mt-3 text-xs text-zinc-500">Últimos {history.length} días · cada cuadro es un día, más dorado = más hábitos cumplidos.</div>
              </div>
            </section>

            {/* ZONA INTELIGENCIA */}
            <Inteligencia runs={sensorRuns} loading={sensorLoading} />
          </>
        )}
      </div>
    </div>
  )
}
