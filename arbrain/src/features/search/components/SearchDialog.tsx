'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { create } from 'zustand'
import {
  Search,
  FileText,
  CheckSquare,
  Activity,
  X,
  Plus,
  LayoutGrid,
  List,
  Calendar,
  BarChart2,
  Users,
  Settings,
  Archive,
  MessageSquare,
  Bot,
} from 'lucide-react'
import { useSearch } from '@/features/search/hooks/useSearch'
import type { SearchResult } from '@/features/search/hooks/useSearch'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useAlternarBarras } from '@/shared/hooks/useAlternarBarras'
import { useTasksStore } from '@/shared/stores/tasks-store'
import { formatDistanceToNow } from 'date-fns'

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SearchState {
  isOpen: boolean
  mode: 'search' | 'commands'
  open: () => void
  close: () => void
  toggle: () => void
  setMode: (mode: 'search' | 'commands') => void
}

export const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  mode: 'search',
  open: () => set({ isOpen: true, mode: 'search' }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen, mode: s.isOpen ? s.mode : 'search' })),
  setMode: (mode) => set({ mode }),
}))

// ---------------------------------------------------------------------------
// Command type
// ---------------------------------------------------------------------------

interface Command {
  id: string
  label: string
  description?: string
  icon: typeof Search
  shortcut?: string
  action: () => void
  category: 'navigation' | 'actions' | 'view'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESULT_TYPE_META: Record<
  SearchResult['type'],
  { icon: typeof Search; label: string }
> = {
  task: { icon: CheckSquare, label: 'Tasks' },
  agent: { icon: Bot, label: 'Agents' },
  message: { icon: MessageSquare, label: 'Messages' },
  document: { icon: FileText, label: 'Documents' },
  activity: { icon: Activity, label: 'Activities' },
  calendar: { icon: Calendar, label: 'Calendar' },
  canvas: { icon: BarChart2, label: 'Canvas' },
}

function groupResults(results: SearchResult[]) {
  const groups: { type: SearchResult['type']; items: SearchResult[] }[] = []
  const map = new Map<SearchResult['type'], SearchResult[]>()

  for (const r of results) {
    if (!map.has(r.type)) {
      const items: SearchResult[] = []
      map.set(r.type, items)
      groups.push({ type: r.type, items })
    }
    map.get(r.type)!.push(r)
  }

  return groups
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchDialog() {
  const { isOpen, mode, close, setMode } = useSearchStore()
  const { query, setQuery, results, loading, search } = useSearch()
  const router = useRouter()
  const selectTask = useTasksStore((s) => s.selectTask)
  const toggleArchived = useTasksStore((s) => s.toggleArchived)
  const setSelectedView = useLayoutStore((s) => s.setSelectedView)
  // Escritorio: las dos barras (iconos y conversaciones); teléfono: el cajón de secciones.
  const toggleLeftSidebar = useAlternarBarras()

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // -----------------------------------------------------------------------
  // Commands
  // -----------------------------------------------------------------------
  const commands: Command[] = useMemo(() => [
    {
      id: 'new-task',
      label: 'Pedir a Levy una tarea',
      description: 'Abre el chat con el draft de creación listo',
      icon: Plus,
      shortcut: 'C',
      action: () => {
        close()
        // AI-first: crear = conversación con Levy (nunca formulario)
        router.push(`/chat?draft=${encodeURIComponent('Crea una tarea: ')}`)
      },
      category: 'actions',
    },
    {
      id: 'go-kanban',
      label: 'Go to Kanban',
      description: 'View the Kanban board',
      icon: LayoutGrid,
      shortcut: 'G then K',
      action: () => { close(); setSelectedView('kanban'); router.push('/') },
      category: 'navigation',
    },
    {
      id: 'go-calendar',
      label: 'Go to Calendar',
      description: 'View the calendar',
      icon: Calendar,
      shortcut: 'G then C',
      action: () => { close(); setSelectedView('calendar'); router.push('/calendar') },
      category: 'navigation',
    },
    {
      id: 'go-agents',
      label: 'Go to Agents',
      description: 'View agent management',
      icon: Users,
      action: () => { close(); router.push('/agents') },
      category: 'navigation',
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      description: 'Show or hide the agents sidebar',
      icon: List,
      shortcut: '[',
      action: () => { close(); toggleLeftSidebar() },
      category: 'view',
    },
    {
      id: 'toggle-archived',
      label: 'Toggle Archived Tasks',
      description: 'Show or hide archived tasks',
      icon: Archive,
      action: () => { close(); toggleArchived() },
      category: 'view',
    },
  ], [close, router, setSelectedView, toggleLeftSidebar, toggleArchived])

  const filteredCommands = useMemo(() => {
    if (mode !== 'commands' || !query.startsWith('>')) return commands
    const filter = query.slice(1).trim().toLowerCase()
    if (!filter) return commands
    return commands.filter((c) =>
      c.label.toLowerCase().includes(filter) ||
      (c.description?.toLowerCase().includes(filter))
    )
  }, [commands, mode, query])

  // -----------------------------------------------------------------------
  // Global Cmd+K / Ctrl+K + ESC listener
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        useSearchStore.getState().toggle()
      }
      if (e.key === 'Escape' && useSearchStore.getState().isOpen) {
        e.preventDefault()
        useSearchStore.getState().close()
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // -----------------------------------------------------------------------
  // Focus input when dialog opens; reset state when closing
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setQuery('')
      setActiveIndex(-1)
    }
  }, [isOpen, setQuery])

  // -----------------------------------------------------------------------
  // Switch to commands mode when typing >
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (query.startsWith('>')) {
      setMode('commands')
    } else if (mode === 'commands' && !query.startsWith('>')) {
      setMode('search')
    }
  }, [query, mode, setMode])

  // -----------------------------------------------------------------------
  // Debounced search
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (mode === 'commands') return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      search(query)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search, mode])

  // -----------------------------------------------------------------------
  // Navigate to result
  // -----------------------------------------------------------------------
  const navigateToResult = useCallback(
    (result: SearchResult) => {
      if (result.type === 'task') {
        selectTask(result.id)
        router.push('/')
      } else if (result.type === 'message' && result.taskId) {
        selectTask(result.taskId)
        router.push('/')
      } else if (result.type === 'activity') {
        // Ops se retiró (5 oct 2026): el rastro de agentes vive en el Taller › Registro.
        router.push('/chat?panel=taller&taller=registro')
      } else if (result.type === 'calendar') {
        router.push('/calendar')
      } else if (result.type === 'canvas') {
        router.push(`/draw3/${result.id}`)
      } else {
        router.push('/')
      }
      close()
    },
    [router, close, selectTask],
  )

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------
  const itemCount = mode === 'commands' ? filteredCommands.length : results.length

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1))
      return
    }

    if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      if (mode === 'commands' && filteredCommands[activeIndex]) {
        filteredCommands[activeIndex].action()
      } else if (results[activeIndex]) {
        navigateToResult(results[activeIndex])
      }
    }
  }

  // -----------------------------------------------------------------------
  // Scroll active item into view
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const items = listRef.current.querySelectorAll('[data-search-item]')
    items[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!isOpen) return null

  const grouped = groupResults(results)
  const isCommandMode = mode === 'commands'

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
      onClick={close}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Glass panel */}
      <div
        className="mx-auto mt-[15vh] w-full max-w-xl rounded-2xl bg-card border border-border shadow-elevation-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Specular rim */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
          {isCommandMode ? (
            <Settings size={18} className="text-primary/70 shrink-0" />
          ) : (
            <Search size={18} className="text-muted shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(-1)
            }}
            placeholder={isCommandMode ? 'Type a command...' : 'Search tasks, docs... or type > for commands'}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted/80 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded hover:bg-card-active text-muted hover:text-foreground/70 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results area */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {/* Command mode */}
          {isCommandMode && (
            <>
              {(['actions', 'navigation', 'view'] as const).map((cat) => {
                const catCommands = filteredCommands.filter((c) => c.category === cat)
                if (catCommands.length === 0) return null
                return (
                  <div key={cat} className="mb-2 last:mb-0">
                    <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
                      {cat}
                    </p>
                    {catCommands.map((cmd) => {
                      const globalIdx = filteredCommands.indexOf(cmd)
                      const isActive = globalIdx === activeIndex
                      const Icon = cmd.icon
                      return (
                        <button
                          key={cmd.id}
                          data-search-item
                          onClick={() => cmd.action()}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                            isActive ? 'bg-card-active' : 'hover:bg-card-hover'
                          }`}
                        >
                          <Icon size={16} className="text-muted shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{cmd.label}</p>
                            {cmd.description && (
                              <p className="text-xs text-muted">{cmd.description}</p>
                            )}
                          </div>
                          {cmd.shortcut && (
                            <kbd className="text-[10px] text-muted/70 bg-card-hover px-1.5 py-0.5 rounded border border-border-subtle">
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}

          {/* Search mode */}
          {!isCommandMode && (
            <>
              {/* Loading */}
              {loading && (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-5 h-5 rounded bg-card-hover" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-3/4 rounded bg-card-hover" />
                        <div className="h-2.5 w-1/2 rounded bg-card" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!loading && !query && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted/80 mb-2">
                    Search tasks, documents, and activities
                  </p>
                  <p className="text-xs text-muted/60">
                    Type <kbd className="bg-card-hover px-1.5 py-0.5 rounded text-muted/80">&gt;</kbd> for commands
                  </p>
                </div>
              )}

              {/* No results */}
              {!loading && query.length >= 2 && results.length === 0 && (
                <p className="text-center text-sm text-muted/80 py-8">
                  No results for &ldquo;{query}&rdquo;
                </p>
              )}

              {/* Grouped results */}
              {!loading &&
                grouped.map((group) => {
                  const meta = RESULT_TYPE_META[group.type]
                  const Icon = meta.icon
                  return (
                    <div key={group.type} className="mb-2 last:mb-0">
                      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
                        {meta.label}
                      </p>

                      {group.items.map((item) => {
                        const globalIdx = results.indexOf(item)
                        const isActive = globalIdx === activeIndex

                        return (
                          <button
                            key={item.id}
                            data-search-item
                            onClick={() => navigateToResult(item)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                              isActive ? 'bg-card-active' : 'hover:bg-card-hover'
                            }`}
                          >
                            <Icon size={16} className="text-muted shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{item.title}</p>
                              <p className="text-xs text-muted truncate">{item.subtitle}</p>
                            </div>
                            {item.timestamp && (
                              <span className="text-[11px] text-muted/70 shrink-0">
                                {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border-subtle flex items-center justify-between text-[11px] text-muted/70">
          <div className="flex items-center gap-3">
            <span><kbd className="bg-card-hover px-1 py-0.5 rounded">ESC</kbd> close</span>
            <span><kbd className="bg-card-hover px-1 py-0.5 rounded">↑↓</kbd> navigate</span>
            <span><kbd className="bg-card-hover px-1 py-0.5 rounded">↵</kbd> select</span>
          </div>
          <span><kbd className="bg-card-hover px-1 py-0.5 rounded">⌘K</kbd></span>
        </div>
      </div>
    </div>
  )
}
