'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cacheSnapshot, getCachedSnapshot } from '@/lib/local-first'
import {
  Bot, User, Pin, Search, X, ArrowUp, ArrowDown,
  ChevronsUpDown, Loader2,
} from 'lucide-react'
import type { ChatMessage } from '@/types/database'

// AI-first (11 jul 2026): se podó el panel de "reglas de auto-clasificación"
// (filtros efímeros que se reseteaban al recargar y fingían una clasificación
// de agente que no existe — la columna "Agente" era un string hardcodeado).
// Queda: búsqueda, favoritos (toggle REAL vía PATCH /api/chat/sessions), sort
// y el modal de lectura. Para análisis profundo de sesiones: pedírselo a Levy.

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string
  title: string
  is_favorite: boolean
  created_at: string
  updated_at: string
  message_count: number
}

type SortColumn = 'title' | 'message_count' | 'created_at' | 'updated_at'
type SortDir = 'asc' | 'desc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rel(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  if (d < 7) return `${d}d`
  return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

function sessionId(dateStr: string): string {
  const d = new Date(dateStr)
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `#${yy}${mm}${dd}-${hh}${min}`
}

function SortIcon({ col, active, dir }: { col: SortColumn; active: SortColumn; dir: SortDir }) {
  if (col !== active) return <ChevronsUpDown size={10} className="text-muted/60 shrink-0" />
  return dir === 'asc'
    ? <ArrowUp size={10} className="text-violet-400 shrink-0" />
    : <ArrowDown size={10} className="text-violet-400 shrink-0" />
}

// ─── Record modal ─────────────────────────────────────────────────────────────

function RecordModal({ session, onClose }: { session: SessionRow; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('chat_messages')
        .select('id, session_id, role, content, created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true })
      setMsgs((data as ChatMessage[]) ?? [])
      setLoading(false)
    }
    load()
  }, [session.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[82vh] flex flex-col rounded-2xl bg-surface border border-border-subtle shadow-elevation-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-start gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-mono text-violet-400/60 shrink-0">{sessionId(session.created_at)}</span>
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug truncate">{session.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] text-muted/80">{session.message_count} mensajes</span>
              <span className="text-[10px] text-muted/40">·</span>
              <span className="text-[10px] text-muted/80">activo {rel(session.updated_at)}</span>
              {session.is_favorite && <Pin size={10} className="text-foreground/80" />}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg text-muted/80 hover:text-foreground/70 hover:bg-card-hover transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={16} className="text-muted/70 animate-spin" /></div>
          ) : msgs.length === 0 ? (
            <p className="text-center py-10 text-muted/70 text-sm">Sin mensajes</p>
          ) : (
            msgs.map((msg) => {
              const isUser = msg.role === 'user'
              return (
                <div key={msg.id} className={`flex gap-2.5 items-end ${isUser ? 'flex-row-reverse' : ''}`}>
                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                    ${isUser ? 'bg-card-active' : 'bg-violet-500/20 border border-violet-400/20'}`}>
                    {isUser ? <User size={11} className="text-muted" /> : <Bot size={11} className="text-violet-300" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                    ${isUser ? 'rounded-br-sm bg-card-active text-foreground' : 'rounded-bl-sm bg-card-hover border border-border-subtle text-foreground/85'}`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={`text-[9px] mt-1 ${isUser ? 'text-muted/70 text-right' : 'text-muted/60'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SessionsMonitor() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SessionRow | null>(null)
  const [search, setSearch] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [sortCol, setSortCol] = useState<SortColumn>('updated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    let active = true
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('chat_sessions')
        .select('id, title, is_favorite, created_at, updated_at, chat_messages(count)')
        .limit(200)
      if (!active) return
      if (data) {
        const nextSessions = data.map((s) => ({
            id: s.id as string,
            title: s.title as string,
            is_favorite: s.is_favorite as boolean,
            created_at: s.created_at as string,
            updated_at: s.updated_at as string,
            message_count: ((s.chat_messages as Array<{ count: number }>)?.[0]?.count ?? 0),
          }))
        setSessions(nextSessions)
        cacheSnapshot('ops', 'ops:sessions', nextSessions).catch(() => {})
      } else {
        const cached = await getCachedSnapshot<SessionRow[]>('ops:sessions').catch(() => null)
        if (cached) setSessions(cached)
      }
      setLoading(false)
    }
    // Stale-while-revalidate: pinta las sesiones cacheadas al instante, refresca en background.
    getCachedSnapshot<SessionRow[]>('ops:sessions')
      .then((cached) => { if (active && cached) { setSessions(cached); setLoading(false) } })
      .catch(() => {})
      .finally(() => { if (active) load() })
    return () => { active = false }
  }, [])

  const toggleSort = useCallback((col: SortColumn) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return col }
      setSortDir('desc')
      return col
    })
  }, [])

  // Favorito real: misma API que el sidebar del chat (chat_sessions.is_favorite).
  const toggleFavorite = useCallback(async (s: SessionRow) => {
    const next = !s.is_favorite
    setSessions((prev) => prev.map((x) => x.id === s.id ? { ...x, is_favorite: next } : x))
    await fetch('/api/chat/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: s.id, is_favorite: next }),
    })
  }, [])

  const rows = useMemo(() => {
    const list = sessions.filter((s) => {
      if (favOnly && !s.is_favorite) return false
      if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    return [...list].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol]
      if (typeof va === 'string' && typeof vb === 'string') {
        const cmp = va.localeCompare(vb, 'es')
        return sortDir === 'asc' ? cmp : -cmp
      }
      const cmp = (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [sessions, search, favOnly, sortCol, sortDir])

  if (loading && sessions.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-9 rounded-lg bg-card animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/70" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-44 bg-card border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-foreground placeholder-white/25 outline-none focus:border-border-accent transition-colors"
          />
        </div>

        <button
          onClick={() => setFavOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors
            ${favOnly ? 'bg-amber-400/10 border-amber-400/20 text-amber-400' : 'bg-card border-border text-muted hover:text-foreground/70 hover:bg-card-hover'}`}
        >
          <Pin size={11} className={favOnly ? 'text-amber-400' : ''} />
          Fijadas
        </button>

        <span className="ml-auto text-[10px] text-muted/70">
          {rows.length}{rows.length !== sessions.length ? ` / ${sessions.length}` : ''} sesiones
        </span>
      </div>

      {/* ── Grid ── */}
      <div className="rounded-xl border border-border-subtle overflow-hidden">

        {/* Headers */}
        <div className="grid grid-cols-[28px_92px_1fr_52px_32px_68px_68px] border-b border-border-subtle bg-card/40">
          <div className="px-2 py-2 text-[9px] text-muted/60 font-semibold uppercase tracking-wider text-center">#</div>
          <div className="px-3 py-2 text-[9px] text-muted/80 font-semibold uppercase tracking-wider">ID</div>
          <button onClick={() => toggleSort('title')} className="flex items-center gap-1 px-3 py-2 text-[9px] text-muted font-semibold uppercase tracking-wider hover:text-foreground/70 transition-colors text-left">
            Título <SortIcon col="title" active={sortCol} dir={sortDir} />
          </button>
          <button onClick={() => toggleSort('message_count')} className="flex items-center justify-center gap-1 px-2 py-2 text-[9px] text-muted font-semibold uppercase tracking-wider hover:text-foreground/70 transition-colors">
            Msg <SortIcon col="message_count" active={sortCol} dir={sortDir} />
          </button>
          <div className="px-1 py-2 flex items-center justify-center"><Pin size={9} className="text-muted/60" /></div>
          <button onClick={() => toggleSort('created_at')} className="flex items-center justify-center gap-1 px-2 py-2 text-[9px] text-muted font-semibold uppercase tracking-wider hover:text-foreground/70 transition-colors">
            Creado <SortIcon col="created_at" active={sortCol} dir={sortDir} />
          </button>
          <button onClick={() => toggleSort('updated_at')} className="flex items-center justify-center gap-1 px-2 py-2 text-[9px] text-muted font-semibold uppercase tracking-wider hover:text-foreground/70 transition-colors">
            Activo <SortIcon col="updated_at" active={sortCol} dir={sortDir} />
          </button>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border-subtle max-h-[540px] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="py-14 text-center text-muted/60 text-xs">Sin resultados</div>
          ) : (
            rows.map((s, i) => (
              <div
                key={s.id}
                onClick={() => setSelected(s)}
                className="w-full grid grid-cols-[28px_92px_1fr_52px_32px_68px_68px] items-center hover:bg-card transition-colors group cursor-pointer"
              >
                <span className="px-2 py-2.5 text-[10px] text-muted/40 text-center tabular-nums">{i + 1}</span>
                <span className="px-3 py-2.5 text-[10px] font-mono text-violet-400/50 truncate group-hover:text-violet-400/70 transition-colors">
                  {sessionId(s.created_at)}
                </span>
                <span className="px-3 py-2.5 text-xs text-foreground/70 truncate group-hover:text-foreground/85 transition-colors text-left">
                  {s.title}
                </span>
                <span className="px-2 py-2.5 text-[10px] text-muted text-center tabular-nums">{s.message_count}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(s) }}
                  title={s.is_favorite ? 'Desfijar' : 'Fijar'}
                  className="px-1 py-2.5 flex items-center justify-center"
                >
                  <Pin
                    size={11}
                    className={s.is_favorite
                      ? 'text-foreground/80'
                      : 'text-muted/30 opacity-0 group-hover:opacity-100 hover:text-amber-400/70 transition-all'}
                  />
                </button>
                <span className="px-2 py-2.5 text-[10px] text-muted/70 text-center tabular-nums">{rel(s.created_at)}</span>
                <span className="px-2 py-2.5 text-[10px] text-muted/70 text-center tabular-nums">{rel(s.updated_at)}</span>
              </div>
            ))
          )}
        </div>

        {rows.length > 0 && (
          <div className="px-3 py-2 border-t border-border-subtle bg-card/30 flex items-center justify-between">
            <span className="text-[9px] text-muted/40">{rows.reduce((a, s) => a + s.message_count, 0)} mensajes totales</span>
            <span className="text-[9px] text-muted/40">↵ click en fila para abrir</span>
          </div>
        )}
      </div>

      {selected && <RecordModal session={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
