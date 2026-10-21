'use client'
import { Fragment, useEffect, useRef } from 'react'
import {
  Trash2, Minimize2, Activity, CheckSquare, Bot, BarChart2, HelpCircle, Cpu,
  Sparkles, Brain, Plug, ListTodo, Gauge, Zap, Network, Coins, ClipboardList, Target, Repeat,
  SlidersHorizontal, Terminal, Puzzle, Users,
  type LucideIcon,
} from 'lucide-react'
import { ETIQUETA_SECCION, type ComandoCatalogo, type SeccionComando } from '../lib/command-catalog'

interface IconoDef { icon: LucideIcon; iconClass: string }

// Iconos de los comandos de siempre; el resto usa el genérico de su sección.
const ICONOS: Record<string, IconoDef> = {
  '/clear':   { icon: Trash2,      iconClass: 'bg-red-500/15 text-red-400' },
  '/compact': { icon: Minimize2,   iconClass: 'bg-orange-500/15 text-orange-400' },
  '/status':  { icon: Activity,    iconClass: 'bg-emerald-500/15 text-emerald-400' },
  '/skills':  { icon: Sparkles,    iconClass: 'bg-pink-500/15 text-pink-400' },
  '/memory':  { icon: Brain,       iconClass: 'bg-fuchsia-500/15 text-fuchsia-400' },
  '/mcp':     { icon: Plug,        iconClass: 'bg-teal-500/15 text-teal-400' },
  '/todos':   { icon: ListTodo,    iconClass: 'bg-lime-500/15 text-lime-400' },
  '/tasks':   { icon: CheckSquare, iconClass: 'bg-blue-500/15 text-blue-400' },
  '/agents':  { icon: Bot,         iconClass: 'bg-violet-500/15 text-violet-400' },
  '/context': { icon: BarChart2,   iconClass: 'bg-amber-500/15 text-amber-400' },
  '/model':   { icon: Cpu,         iconClass: 'bg-cyan-500/15 text-cyan-400' },
  '/effort':  { icon: Gauge,       iconClass: 'bg-amber-500/15 text-amber-400' },
  '/fast':    { icon: Zap,         iconClass: 'bg-yellow-500/15 text-yellow-400' },
  '/ultracode': { icon: Network,   iconClass: 'bg-violet-500/15 text-violet-400' },
  '/usage':   { icon: Coins,       iconClass: 'bg-emerald-500/15 text-emerald-400' },
  '/help':    { icon: HelpCircle,  iconClass: 'bg-card-active text-muted' },
  '/goal':    { icon: Target,      iconClass: 'bg-rose-500/15 text-rose-400' },
  '/loop':    { icon: Repeat,      iconClass: 'bg-indigo-500/15 text-indigo-400' },
}

const ICONO_SECCION: Record<SeccionComando, IconoDef> = {
  modos:   { icon: SlidersHorizontal, iconClass: 'bg-sky-500/15 text-sky-400' },
  arbrain: { icon: Sparkles,          iconClass: 'bg-card-active text-muted' },
  nativos: { icon: Terminal,          iconClass: 'bg-orange-500/15 text-orange-400' },
  skills:  { icon: Puzzle,            iconClass: 'bg-pink-500/15 text-pink-400' },
  agentes: { icon: Users,             iconClass: 'bg-violet-500/15 text-violet-400' },
}

export function iconoDeComando(c: Pick<ComandoCatalogo, 'name' | 'section'>): IconoDef {
  return ICONOS[c.name] ?? ICONO_SECCION[c.section]
}

interface Props {
  /** Ya filtrados con `filtrarComandos`: el mismo arreglo que usa el teclado. */
  comandos: ComandoCatalogo[]
  selectedIndex: number
  onSelect: (cmd: string) => void
  onClose: () => void
}

export function CommandPalette({ comandos, selectedIndex, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Scroll selected item into view on keyboard navigation
  useEffect(() => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll<HTMLElement>('[data-cmd]')
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, comandos])

  const conteo = new Map<SeccionComando, number>()
  for (const c of comandos) conteo.set(c.section, (conteo.get(c.section) ?? 0) + 1)

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-full bg-card/96 backdrop-blur-xl border border-border rounded-2xl shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.35),0_-16px_48px_rgba(0,0,0,0.75)] overflow-hidden z-50"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border-subtle bg-card/40">
        <div className="w-4 h-4 rounded-md bg-brand/15 flex items-center justify-center">
          <span className="text-[9px] font-bold text-brand-ink leading-none">/</span>
        </div>
        <span className="text-[10px] text-muted uppercase tracking-widest font-semibold">Comandos</span>
        <span className="text-[10px] text-muted/60 font-mono">{comandos.length}</span>
        <span className="ml-auto text-[9px] text-muted/60 hidden sm:block font-mono">
          ↑↓ · Tab/Enter · Esc
        </span>
      </div>

      {/* Command list */}
      <ul
        ref={listRef}
        role="listbox"
        aria-label="Comandos de Levy"
        className="py-1 max-h-[22rem] overflow-y-auto overscroll-contain"
      >
        {!comandos.length && (
          <li className="px-3.5 py-6 text-center text-[12px] text-muted" role="presentation">Sin coincidencias</li>
        )}
        {comandos.map((cmd, i) => {
          const { icon: Icon, iconClass } = iconoDeComando(cmd)
          const active = i === selectedIndex
          const primero = i === 0 || comandos[i - 1].section !== cmd.section
          return (
            <Fragment key={cmd.name}>
              {primero && (
                <li role="presentation" className="px-3.5 pt-2 pb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest font-semibold text-muted/70">
                  {ETIQUETA_SECCION[cmd.section]}
                  <span className="font-mono text-muted/50">{conteo.get(cmd.section)}</span>
                </li>
              )}
              <li data-cmd role="option" aria-selected={active}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); onSelect(cmd.name) }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                    active ? 'bg-violet-500/[0.10]' : 'hover:bg-card'
                  }`}
                >
                  {/* Icon bubble */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
                    <Icon size={15} strokeWidth={1.75} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <span className={`flex items-baseline gap-2 text-[13px] font-mono font-semibold transition-colors ${active ? 'text-foreground' : 'text-foreground/80'}`}>
                      <span className="truncate">{cmd.name}</span>
                      {cmd.argumentHint && (
                        <span className="text-[10px] font-normal text-muted/60 truncate">{cmd.argumentHint}</span>
                      )}
                    </span>
                    {cmd.description && (
                      <span className={`block text-[11px] truncate mt-0.5 transition-colors ${active ? 'text-muted' : 'text-muted/80'}`}>
                        {cmd.description}
                      </span>
                    )}
                  </div>

                  {/* Enter hint */}
                  {active && (
                    <span className="shrink-0 text-[9px] font-mono text-violet-400/60 bg-violet-500/10 px-1.5 py-0.5 rounded-md hidden sm:block">
                      Enter
                    </span>
                  )}
                </button>
              </li>
            </Fragment>
          )
        })}
      </ul>
    </div>
  )
}
