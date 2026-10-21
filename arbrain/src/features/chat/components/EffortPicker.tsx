'use client'
import { useEffect, useRef, useState } from 'react'
import { Gauge, Loader2, RotateCcw } from 'lucide-react'

interface EffortInfo {
  value: string
  displayName: string
  description: string
}

interface Props {
  onSelect: (effortValue: string) => void
  onClose: () => void
  /** Dónde está anclado el dropdown: 'composer' (default) abre HACIA ARRIBA con
   *  el ancho del composer; 'header' abre HACIA ABAJO centrado bajo el chip;
   *  'toolbar' abre HACIA ARRIBA anclado al chip de esfuerzo del composer. */
  anchor?: 'composer' | 'header' | 'toolbar'
}

// Sentinel value used by the "Default" row — the backend interprets it as a reset.
const DEFAULT_VALUE = 'default'

export function EffortPicker({ onSelect, onClose, anchor = 'composer' }: Props) {
  const [efforts, setEfforts] = useState<EffortInfo[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Fetch effort modes from ClaudeClaw
  useEffect(() => {
    fetch('/api/chat/efforts')
      .then((r) => r.json())
      .then((data) => {
        setEfforts(data.efforts ?? [])
        setCurrent(data.current ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // The selectable rows = effort modes + a trailing "Default" reset row.
  const rows: EffortInfo[] = [
    ...efforts,
    { value: DEFAULT_VALUE, displayName: 'Default', description: 'Resetea al esfuerzo por defecto del modelo (high).' },
  ]

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(rows.length - 1, i + 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const row = rows[selectedIndex]
        if (row) onSelect(row.value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rows, selectedIndex, onSelect, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll<HTMLElement>('[data-effort]')
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div
      ref={ref}
      className={`absolute bg-card/96 backdrop-blur-xl border border-border rounded-2xl overflow-hidden z-50 ${
        anchor === 'header'
          ? 'top-full mt-2 left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] shadow-[0_4px_6px_-2px_rgba(0,0,0,0.35),0_16px_48px_rgba(0,0,0,0.75)]'
          : anchor === 'toolbar'
          ? 'bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.35),0_-16px_48px_rgba(0,0,0,0.75)]'
          : 'bottom-full left-0 mb-2 w-full shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.35),0_-16px_48px_rgba(0,0,0,0.75)]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border-subtle bg-card/40">
        <div className="w-4 h-4 rounded-md bg-amber-500/20 flex items-center justify-center">
          <Gauge size={9} className="text-amber-400" />
        </div>
        <span className="text-[10px] text-muted uppercase tracking-widest font-semibold">Esfuerzo</span>
        <span className="ml-auto text-[9px] text-muted/60 hidden sm:block font-mono">
          ↑↓ · Enter · Esc
        </span>
      </div>

      {/* Effort list */}
      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-muted/80">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Cargando modos...</span>
        </div>
      ) : (
        <ul ref={listRef} className="py-1 max-h-64 overflow-y-auto overscroll-contain">
          {rows.map((effort, i) => {
            const active = i === selectedIndex
            const isCurrent = effort.value === (current ?? '') || (effort.value === DEFAULT_VALUE && !current)
            const isReset = effort.value === DEFAULT_VALUE
            return (
              <li key={effort.value} data-effort>
                <button
                  onMouseDown={(e) => { e.preventDefault(); onSelect(effort.value) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-amber-500/[0.10]' : 'hover:bg-card'
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/15 text-amber-400">
                    {isReset ? <RotateCcw size={15} strokeWidth={1.75} /> : <Gauge size={15} strokeWidth={1.75} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`block text-[13px] font-mono font-semibold transition-colors ${active ? 'text-foreground' : 'text-foreground/80'}`}>
                      {effort.displayName}
                    </span>
                    <span className={`block text-[11px] truncate mt-0.5 transition-colors ${active ? 'text-muted' : 'text-muted/80'}`}>
                      {effort.description}
                    </span>
                  </div>
                  {isCurrent && (
                    <span className="shrink-0 text-[8px] font-mono text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded-md uppercase">
                      activo
                    </span>
                  )}
                  {active && (
                    <span className="shrink-0 text-[9px] font-mono text-amber-400/60 bg-amber-500/10 px-1.5 py-0.5 rounded-md hidden sm:block">
                      Enter
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
