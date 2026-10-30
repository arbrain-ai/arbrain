'use client'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { nombreEsfuerzo, nombreModelo, tokensCortos, ventanaCorta } from '@/shared/lib/uso-modelo'
import { nivelPct, textoPct, type ContextoConversacion } from '../lib/contexto-conversacion'
import { LimitesPlan } from './LimitesPlan'

// Contexto de la conversación en la barra de escribir (2 oct 2026): un anillo con «8 %» junto al
// modelo y el esfuerzo. Hover: la línea completa (title). Toque o clic: el detalle, también en el
// teléfono, donde no hay hover. Sin dato del motor no se pinta nada.

const COLOR = { ok: 'text-brand-ink', aviso: 'text-amber-500', alto: 'text-red-500', 'sin-dato': 'text-muted' } as const

export function ContextoChip({ contexto, open, onToggle }: { contexto: ContextoConversacion | null; open: boolean; onToggle: () => void }) {
  if (!contexto) return null
  const { pct, uso, linea } = contexto
  const r = 6.5, c = 2 * Math.PI * r
  return <button type="button" data-contexto-chip data-contexto-pct={pct == null ? '' : pct.toFixed(1)} onClick={onToggle}
    aria-label={`Contexto de la conversación: ${linea}`} aria-expanded={open} aria-haspopup="dialog" title={linea}
    className="shrink-0 flex items-center gap-1 min-h-11 md:min-h-8 rounded-full px-2 text-[11.5px] font-medium tabular-nums text-muted hover:text-foreground hover:bg-card-hover transition-colors select-none">
    {pct != null && <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={COLOR[nivelPct(pct)]}>
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth="2.25" />
      {/* Con uso real pero <1 % se pinta un trazo mínimo para que no parezca vacío. */}
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"
        strokeDasharray={`${Math.max(pct > 0 ? 1.2 : 0, (pct / 100) * c)} ${c}`} transform="rotate(-90 8 8)" />
    </svg>}
    <span>{pct != null ? textoPct(pct) : uso.tokens != null ? `${tokensCortos(uso.tokens)}` : nombreModelo(uso.modelo)}</span>
  </button>
}

function Fila({ k, v }: { k: string; v: string | null }) {
  if (!v) return null
  return <div className="flex items-baseline justify-between gap-4 text-sm"><dt className="text-muted">{k}</dt><dd className="text-right tabular-nums">{v}</dd></div>
}

/** Detalle del indicador. Lo monta ChatPanel arriba de la caja, como el dial de esfuerzo. */
export function ContextoDetalle({ contexto, account, onClose }: { contexto: ContextoConversacion; account: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-contexto-chip]') && ref.current && !ref.current.contains(t)) onClose()
    }
    document.addEventListener('pointerdown', fuera)
    ref.current?.focus()
    return () => document.removeEventListener('pointerdown', fuera)
  }, [onClose])
  const { uso, pct, usado, ventana } = contexto
  return <div ref={ref} role="dialog" aria-label="Contexto de la conversación" tabIndex={-1} data-contexto-detalle
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
    className="absolute bottom-full left-0 mb-2 w-full md:w-80 rounded-2xl border border-border bg-card p-4 shadow-xl z-50 outline-none max-h-[70dvh] overflow-y-auto">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">Contexto de la conversación</h2>
      <button type="button" aria-label="Cerrar" onClick={onClose} className="-mr-2 -mt-2 min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-foreground/5"><X size={18} /></button>
    </div>
    {pct != null && <div role="progressbar" aria-label="Ventana usada" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="mt-2 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
      <div className={`h-full rounded-full ${{ ok: 'bg-brand', aviso: 'bg-amber-500', alto: 'bg-red-500', 'sin-dato': '' }[nivelPct(pct)]}`} style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }} />
    </div>}
    <dl className="mt-3 space-y-1.5">
      <Fila k="Ventana" v={pct != null && ventana ? `${textoPct(pct)} de ${ventanaCorta(ventana)}` : null} />
      <Fila k="En uso" v={usado != null && ventana ? `${tokensCortos(usado)} de ${tokensCortos(ventana)} tokens` : null} />
      <Fila k="Modelo" v={nombreModelo(uso.modelo)} />
      <Fila k="Esfuerzo" v={nombreEsfuerzo(uso.esfuerzo)} />
      <Fila k="Último turno" v={uso.tokens != null ? `${tokensCortos(uso.tokens)} tokens` : null} />
    </dl>
    <p className="mt-3 text-[11px] text-muted/80">Lo reportó el motor al terminar la última respuesta.</p>
    <LimitesPlan account={account} />
  </div>
}
