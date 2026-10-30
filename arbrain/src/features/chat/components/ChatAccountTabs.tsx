'use client'
import type { TabOption, ChatTab } from '../stores/account-store'

export function ChatAccountTabs({ options, active, onSelect }: { options: TabOption[]; active?: ChatTab; onSelect: (tab: ChatTab) => void }) {
  return (
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-card/60 border border-border-subtle overflow-x-auto">
          {options.map((opt) => {
            const selected = opt.id === active
            return (
              <button
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                title={opt.sublabel}
                className={`min-h-11 min-w-11 shrink-0 flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  selected
                    ? opt.id === 'bro'
                      ? 'bg-brand/20 text-brand-ink shadow-depth-rest-soft'
                      : opt.id === 'codex'
                        ? 'bg-emerald-500/15 text-emerald-300 shadow-depth-rest-soft'
                        : opt.id === 'yt'
                          ? 'bg-cyan-500/15 text-cyan-300 shadow-depth-rest-soft'
                          : 'bg-card-hover text-foreground shadow-depth-rest-soft'
                    : 'text-muted/70 hover:text-foreground'
                }`}
              >
                {opt.id === 'bro' && <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-success' : 'bg-muted/40'}`} />}
                {opt.id === 'codex' && <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-emerald-400' : 'bg-muted/40'}`} />}
                {opt.id === 'yt' && <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-cyan-400' : 'bg-muted/40'}`} />}
                {opt.label}
              </button>
            )
          })}
        </div>
  )
}
