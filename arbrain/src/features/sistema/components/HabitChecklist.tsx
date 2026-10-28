'use client'

// Checklist de hábitos interactivo embebido en el chat, en el mensaje del cron
// evening-reflection (la sección /sistema desapareció; el ritual vive en los
// mensajes). Tap funciona en móvil y desktop (es un <button> con
// touch-manipulation). Va por /api/sistema (server-side + service client) para
// que funcione IGUAL en web y en la app de escritorio Tauri, cuyo cliente
// browser de Supabase no tiene sesión.

import { useCallback, useEffect, useState } from 'react'
import { type Seccion, SECCION_LABEL, SECCION_ORDER, localDate } from '../types'
import { useHabitRecords } from '../useHabitRecords'
import { NombreHabito } from '../NombreHabito'
import { esHabitoPrivado } from '../privacidad-habitos'

interface HabitRow {
  clave: string
  nombre: string
  seccion: Seccion
  icono: string | null
  orden: number
}

const SECCION_ICON: Record<Seccion, string> = {
  ancla: '⚓',
  cuerpo: '🏋️',
  mente: '🧠',
  nutricion: '🍽️',
}

function nextDay(fecha: string): string {
  return new Date(new Date(`${fecha}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10)
}

export function HabitChecklist({ date }: { date?: string }) {
  const fecha = date ?? localDate()
  const manana = nextDay(fecha)

  const records = useHabitRecords({ date: fecha, from: fecha, to: fecha })
  const habitos = records.data?.habitos ?? []
  const done = new Set(habitos.filter(h => records.record(fecha, h.clave)?.hecho === true).map(h => h.clave))
  const loading = records.loading
  // Objetivo #1 de mañana: input directo → sistema_reflexion.prioridad_am de
  // MAÑANA. Sin agente de por medio: es captura pura, no necesita un modelo.
  const [objetivo, setObjetivo] = useState('')
  const [objetivoEstado, setObjetivoEstado] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    let alive = true
    fetch(`/api/sistema?date=${manana}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { reflexion?: { prioridad_am?: string } } | null) => {
        if (!alive || !d?.reflexion?.prioridad_am) return
        setObjetivo(d.reflexion.prioridad_am)
        setObjetivoEstado('saved')
      })
      .catch(() => {})
    return () => { alive = false }
  }, [fecha, manana])

  const guardarObjetivo = useCallback(async () => {
    const valor = objetivo.trim()
    if (!valor) return
    setObjetivoEstado('saving')
    try {
      const r = await fetch('/api/sistema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'reflexion', campo: 'prioridad_am', date: manana, valor }),
      })
      setObjetivoEstado(r.ok ? 'saved' : 'error')
    } catch {
      setObjetivoEstado('error')
    }
  }, [objetivo, manana])

  const toggle = (clave: string) => records.toggle(fecha, clave)

  if (loading) return <div className="text-xs text-muted/60 py-2">Cargando hábitos…</div>
  if (!habitos.length) return null

  const doneCount = done.size
  const total = habitos.length

  return (
    <div className="rounded-xl border border-border-subtle bg-card/40 p-3 my-1 max-w-md">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">🌙 Cierre del día</span>
        <span className="text-[11px] font-mono text-muted">{doneCount}/{total}</span>
      </div>

      {SECCION_ORDER.map((sec) => {
        const items = habitos.filter((h) => h.seccion === sec)
        if (!items.length) return null
        return (
          <div key={sec} className="mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted/60 italic mb-0.5">
              {SECCION_ICON[sec]} {SECCION_LABEL[sec]}
            </p>
            {items.map((h) => {
              const checked = done.has(h.clave)
              return (
                <button
                  key={h.clave}
                  type="button"
                  onClick={() => toggle(h.clave)}
                  className="flex items-center gap-2.5 w-full text-left px-2 py-2 rounded-lg hover:bg-card-hover active:bg-card-active transition-colors touch-manipulation select-none"
                >
                  <span
                    className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-[12px] leading-none transition-colors ${
                      checked ? 'bg-primary border-primary text-white' : 'border-border text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className={`text-sm ${checked ? 'text-muted line-through' : 'text-foreground'}`}>
                    {h.icono && !esHabitoPrivado(h.clave) ? `${h.icono} ` : ''}<NombreHabito clave={h.clave} nombre={h.nombre} tocable={false} />
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}

      <div aria-live="polite" className="text-xs text-muted">
        {records.error ?? records.notice}
        {!!records.pending.length && !records.saving && <button onClick={() => void records.retry()}>Reintentar marca</button>}
        {records.canUndo && <button onClick={records.undoLast}>Deshacer</button>}
      </div>
      <div className="mt-2 pt-2 border-t border-border-subtle text-xs text-muted">
        <p className="mb-1.5">☀️ ¿Cuál es tu objetivo #1 de mañana?</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={objetivo}
            onChange={(e) => { setObjetivo(e.target.value); setObjetivoEstado('idle') }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardarObjetivo() } }}
            placeholder="Escríbelo y queda registrado…"
            className="flex-1 min-w-0 bg-card/60 border border-border-subtle rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/60"
          />
          <button
            type="button"
            onClick={() => void guardarObjetivo()}
            disabled={!objetivo.trim() || objetivoEstado === 'saving' || objetivoEstado === 'saved'}
            className="shrink-0 px-2.5 py-1.5 rounded-lg text-sm bg-primary/90 text-white disabled:opacity-40 hover:bg-primary transition-colors touch-manipulation"
          >
            {objetivoEstado === 'saved' ? '✓' : objetivoEstado === 'saving' ? '…' : 'Guardar'}
          </button>
        </div>
        {objetivoEstado === 'saved' && (
          <p className="text-[11px] text-muted/60 italic mt-1">🎯 Registrado como tu prioridad de mañana.</p>
        )}
        {objetivoEstado === 'error' && (
          <p className="text-[11px] text-red-400 mt-1">No se pudo guardar — reintenta.</p>
        )}
      </div>
    </div>
  )
}
