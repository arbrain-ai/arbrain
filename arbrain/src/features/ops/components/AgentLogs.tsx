'use client'
import { useState, useMemo, useCallback } from 'react'
import { useOpsLogs, type OpsEvent, type OpsEventType } from '../hooks/useOpsLogs'
import { RefreshCw, WifiOff, Wifi, Filter } from 'lucide-react'

// ─── Event display config ──────────────────────────────────────────────────

const EVENT_CONFIG: Record<OpsEventType, { label: string; color: string; icon: string }> = {
  session_start:   { label: 'Session',  color: 'text-blue-400',   icon: '▶' },
  session_compact: { label: 'Compact',  color: 'text-yellow-400', icon: '◆' },
  tool_start:      { label: 'Tool',     color: 'text-primary', icon: '⚡' },
  tool_done:       { label: 'Tool',     color: 'text-green-400',  icon: '✓' },
  tool_error:      { label: 'Tool Err', color: 'text-red-400',    icon: '✗' },
  agent_text:      { label: 'Text',     color: 'text-muted',   icon: '·' },
  agent_result:    { label: 'Result',   color: 'text-emerald-400', icon: '●' },
  agent_error:     { label: 'Error',    color: 'text-red-400',    icon: '✗' },
  cron_start:      { label: 'Cron',     color: 'text-cyan-400',   icon: '⏱' },
  cron_done:       { label: 'Cron',     color: 'text-green-400',  icon: '✓' },
  cron_error:      { label: 'Cron Err', color: 'text-red-400',    icon: '✗' },
  stderr:          { label: 'Stderr',   color: 'text-orange-400', icon: '⚠' },
  rate_limit:      { label: 'Rate',     color: 'text-red-400',    icon: '⛔' },
}

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  web:      { label: 'WEB',  className: 'bg-blue-500/20 text-blue-400' },
  cron:     { label: 'CRON', className: 'bg-cyan-500/20 text-cyan-400' },
  system:   { label: 'SYS',  className: 'bg-card text-muted' },
}

type FilterSource = 'all' | 'web' | 'cron'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 1_000) return 'now'
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

function formatEventDetail(event: OpsEvent): string {
  const d = event.data
  switch (event.type) {
    case 'session_start':
      return `${d['model'] ?? 'unknown'} — ${String(d['prompt'] ?? '').slice(0, 80)}${String(d['prompt'] ?? '').length > 80 ? '...' : ''}`
    case 'session_compact':
      return `${d['tokensBefore'] ?? '?'} → ${d['tokensAfter'] ?? '?'} tokens`
    case 'tool_start':
      return String(d['toolName'] ?? '')
    case 'tool_done':
      return `${d['toolName']} — ${d['durationMs']}ms`
    case 'agent_result':
      return `$${Number(d['costUsd'] ?? 0).toFixed(4)} — ${d['inputTokens']}in/${d['outputTokens']}out — ${d['durationMs']}ms — ${d['numTurns']} turns`
    case 'agent_error':
      return String(d['error'] ?? '').slice(0, 120)
    case 'cron_start':
      return String(d['jobId'] ?? '')
    case 'cron_done':
      return `${d['jobId']} — ${d['resultLength']} chars`
    case 'cron_error':
      return `${d['jobId']} — ${String(d['error'] ?? '').slice(0, 80)}`
    default:
      return JSON.stringify(d).slice(0, 100)
  }
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex gap-2">
      <span className="text-muted/70 shrink-0 w-[80px] text-right">{label}</span>
      <span className="text-foreground/70 break-all whitespace-pre-wrap">{String(value)}</span>
    </div>
  )
}

function EventDetail({ event }: { event: OpsEvent }) {
  const d = event.data
  return (
    <div className="px-3 py-2 ml-[60px] border-l border-border-subtle flex flex-col gap-1 text-xs font-mono bg-card/40">
      <DetailField label="Event ID" value={event.id} />
      <DetailField label="Session" value={event.sessionId} />
      <DetailField label="Time" value={new Date(event.timestamp).toISOString()} />
      {event.type === 'session_start' && (
        <>
          <DetailField label="Model" value={d['model'] as string} />
          <div className="flex gap-2">
            <span className="text-muted/70 shrink-0 w-[80px] text-right">Prompt</span>
            <span className="text-foreground/70 break-all whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {String(d['prompt'] ?? '')}
            </span>
          </div>
        </>
      )}
      {event.type === 'session_compact' && (
        <>
          <DetailField label="Before" value={`${d['tokensBefore']} tokens`} />
          <DetailField label="After" value={`${d['tokensAfter']} tokens`} />
        </>
      )}
      {(event.type === 'tool_start' || event.type === 'tool_done') && (
        <>
          <DetailField label="Tool" value={d['toolName'] as string} />
          {d['durationMs'] !== undefined && <DetailField label="Duration" value={`${d['durationMs']}ms`} />}
          {d['input'] !== undefined && (
            <div className="flex gap-2">
              <span className="text-muted/70 shrink-0 w-[80px] text-right">Input</span>
              <pre className="text-muted break-all whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                {typeof d['input'] === 'string' ? d['input'] : JSON.stringify(d['input'], null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
      {event.type === 'agent_result' && (
        <>
          <DetailField label="Model" value={d['model'] as string} />
          <DetailField label="Cost" value={`$${Number(d['costUsd'] ?? 0).toFixed(4)}`} />
          <DetailField label="Tokens" value={`${d['inputTokens']} in / ${d['outputTokens']} out`} />
          <DetailField label="Duration" value={`${d['durationMs']}ms`} />
          <DetailField label="Turns" value={d['numTurns'] as number} />
          <DetailField label="Result" value={`${d['resultLength']} chars`} />
        </>
      )}
      {(event.type === 'agent_error' || event.type === 'tool_error' || event.type === 'cron_error') && (
        <div className="flex gap-2">
          <span className="text-muted/70 shrink-0 w-[80px] text-right">Error</span>
          <span className="text-red-400/80 break-all whitespace-pre-wrap">{String(d['error'] ?? d['message'] ?? JSON.stringify(d))}</span>
        </div>
      )}
      {(event.type === 'cron_start' || event.type === 'cron_done') && (
        <>
          <DetailField label="Job" value={d['jobId'] as string} />
          {d['resultLength'] !== undefined && <DetailField label="Output" value={`${d['resultLength']} chars`} />}
        </>
      )}
    </div>
  )
}

// ─── Event row ──────────────────────────────────────────────────────────────

function EventRow({ event, expanded, onToggle }: { event: OpsEvent; expanded: boolean; onToggle: () => void }) {
  const config = EVENT_CONFIG[event.type] ?? { label: event.type, color: 'text-muted/80', icon: '?' }
  const source = SOURCE_BADGES[event.source] ?? SOURCE_BADGES['system']

  return (
    <div>
      <div
        onClick={onToggle}
        className={`flex items-start gap-2 py-1.5 px-3 hover:bg-card/60 transition-colors group text-xs font-mono cursor-pointer select-none ${expanded ? 'bg-card/40' : ''}`}
      >
        {/* Timestamp */}
        <span className="text-muted/60 shrink-0 w-[60px]" title={new Date(event.timestamp).toISOString()}>
          {formatTime(event.timestamp)}
        </span>

        {/* Source badge */}
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${source.className}`}>
          {source.label}
        </span>

        {/* Event icon + label */}
        <span className={`shrink-0 w-[14px] text-center ${config.color}`}>{config.icon}</span>
        <span className={`shrink-0 w-[60px] ${config.color} font-medium`}>{config.label}</span>

        {/* Detail */}
        <span className="text-muted truncate min-w-0">
          {formatEventDetail(event)}
        </span>

        {/* Expand indicator + relative time */}
        <span className={`shrink-0 ml-auto text-muted/40 transition-opacity ${expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {expanded ? '▾' : '▸'} {formatAgo(event.timestamp)}
        </span>
      </div>
      {expanded && <EventDetail event={event} />}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function AgentLogs() {
  const { events, connected, error, reconnect } = useOpsLogs()
  const [filter, setFilter] = useState<FilterSource>('all')
  const [showTools, setShowTools] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const filtered = useMemo(() => {
    let result = events
    if (filter !== 'all') {
      result = result.filter((e) => e.source === filter)
    }
    if (!showTools) {
      result = result.filter((e) => e.type !== 'tool_start' && e.type !== 'tool_done')
    }
    return result
  }, [events, filter, showTools])

  // Stats
  const toolCount = useMemo(() => events.filter((e) => e.type === 'tool_start').length, [events])
  const errorCount = useMemo(() => events.filter((e) => e.type.includes('error')).length, [events])

  if (error && events.length === 0) {
    return (
      <div className="text-center py-12">
        <WifiOff size={24} className="mx-auto text-muted/60 mb-3" />
        <p className="text-sm text-muted">No se pudieron cargar los eventos</p>
        <p className="text-xs text-muted/70 mt-1">Los logs viven en Supabase (ops_events); reintenta</p>
        <button
          onClick={reconnect}
          className="mt-3 text-xs text-muted hover:text-foreground/75 flex items-center gap-1.5 mx-auto transition-colors"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5">
            {connected ? (
              <Wifi size={12} className="text-green-400" />
            ) : (
              <WifiOff size={12} className="text-muted/60" />
            )}
            <span className={`text-[10px] font-medium ${connected ? 'text-green-400' : 'text-muted/60'}`}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>

          {/* Stats */}
          <span className="text-[10px] text-muted/70">
            {events.length} events — {toolCount} tools — {errorCount} errors
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Source filter */}
          <div className="flex items-center gap-0.5">
            <Filter size={10} className="text-muted/60 mr-1" />
            {(['all', 'web', 'cron'] as FilterSource[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
                  ${filter === f ? 'bg-card-active text-foreground/70' : 'text-muted/60 hover:text-muted'}
                `}
              >
                {f === 'all' ? 'All' : f.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Toggle tool calls */}
          <button
            onClick={() => setShowTools(!showTools)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
              ${showTools ? 'bg-primary/20 text-primary' : 'text-muted/60 hover:text-muted'}
            `}
          >
            Tools
          </button>

        </div>
      </div>

      {/* Log stream */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted/80">Waiting for agent activity...</p>
            <p className="text-xs text-muted/40 mt-1">Send a message in Chat to see logs here</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {filtered.map((event) => (
              <EventRow key={event.id} event={event} expanded={expandedId === event.id} onToggle={() => toggleExpand(event.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
