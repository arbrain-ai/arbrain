'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  CloudDownload,
  Database,
  FolderOpen,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import {
  isLocalhostRuntime,
  listSyncQueue,
  openLocalWorkspace,
  prepareOfflinePack,
  retrySyncQueueItem,
  syncAndPullLocalMirror,
  syncNow,
  useRuntimeStatus,
  type SyncQueueItem,
} from '@/lib/local-first'

function statusCopy(mode: 'cloud' | 'hybrid' | 'offline', online: boolean) {
  const dotClassName = online
    ? 'border-emerald-300/80 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]'
    : 'border-zinc-500/70 bg-zinc-500'
  if (mode === 'offline') return { label: 'Offline', className: 'text-amber-300 border-amber-400/30 bg-amber-500/12', dotClassName }
  if (mode === 'hybrid') return { label: 'Hybrid', className: 'text-cyan-200 border-cyan-400/25 bg-cyan-500/10', dotClassName }
  return { label: 'Cloud', className: 'text-emerald-200 border-emerald-400/25 bg-emerald-500/10', dotClassName }
}

function rel(value?: string | null) {
  if (!value) return 'never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function RuntimeStatusPill() {
  const { status, refresh } = useRuntimeStatus()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'sync' | 'mirror' | 'pack' | null>(null)
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [queueMode, setQueueMode] = useState<'recent' | 'conflicts'>('recent')
  const [message, setMessage] = useState<string | null>(null)
  const autoMirrorRunning = useRef(false)

  const copy = statusCopy(status.mode, status.online)

  const visibleQueue = useMemo(() => {
    const source = queueMode === 'conflicts'
      ? queue.filter((item) => item.status === 'conflict')
      : queue
    return source.slice(0, 5)
  }, [queue, queueMode])

  useEffect(() => {
    if (!open) return
    listSyncQueue().then(setQueue).catch(() => setQueue([]))
  }, [open, status.pendingCount, status.failedCount, status.conflictCount])

  useEffect(() => {
    if (!isLocalhostRuntime() || !status.online || autoMirrorRunning.current) return
    const last = Number(window.localStorage.getItem('mission-control:last-mirror-pull') ?? 0)
    if (Date.now() - last < 5 * 60_000) return

    let cancelled = false
    autoMirrorRunning.current = true
    // Views own their analytics reads; do not fan out seven unrelated queries at startup.
    syncAndPullLocalMirror(false)
      .then(() => {
        window.localStorage.setItem('mission-control:last-mirror-pull', String(Date.now()))
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Local mirror pull failed')
      })
      .finally(() => {
        autoMirrorRunning.current = false
        if (!cancelled) refresh(false)
      })

    return () => { cancelled = true }
  }, [refresh, status.online])

  const handleSync = async () => {
    setBusy('sync')
    setMessage(null)
    try {
      const result = await syncNow()
      await refresh(false)
      setQueue(await listSyncQueue())
      setMessage(`Sync processed ${result.processed}; synced ${result.synced}, failed ${result.failed}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setBusy(null)
    }
  }

  const handleMirror = async () => {
    setBusy('mirror')
    setMessage(null)
    try {
      const result = await syncAndPullLocalMirror()
      window.localStorage.setItem('mission-control:last-mirror-pull', String(Date.now()))
      await refresh(false)
      setQueue(await listSyncQueue())
      setMessage(
        `Mirror ready: ${result.pull.tasks} tasks, ${result.pull.events} events, ${result.pull.drawings} canvases, ${result.pull.snapshots} snapshots. Sync uploaded ${result.sync.synced}/${result.sync.processed}.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Local mirror pull failed')
    } finally {
      setBusy(null)
    }
  }

  const handlePack = async () => {
    setBusy('pack')
    setMessage(null)
    try {
      const mirror = status.online ? await syncAndPullLocalMirror() : null
      const result = await prepareOfflinePack({
        name: `mission-control-pack-${new Date().toISOString().slice(0, 10)}`,
        notes: 'Generated from Arbrain runtime status menu.',
        snapshots: {
          route: typeof window !== 'undefined' ? window.location.pathname : '/',
          generatedFrom: status.desktop ? 'desktop' : 'web-fallback',
          mirror,
        },
      })
      await refresh(false)
      setMessage(`Offline pack ready: ${result.packPath}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pack generation failed')
    } finally {
      setBusy(null)
    }
  }

  const handleOpenWorkspace = async () => {
    const path = await openLocalWorkspace().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Could not open workspace')
      return null
    })
    if (path) setMessage(`Workspace: ${path}`)
  }

  const handleViewQueue = async () => {
    setQueueMode('recent')
    setQueue(await listSyncQueue())
  }

  const handleResolveConflicts = async () => {
    const items = await listSyncQueue()
    const conflicts = items.filter((item) => item.status === 'conflict')
    setQueueMode('conflicts')
    setQueue(items)
    setMessage(conflicts.length > 0 ? `${conflicts.length} conflict item(s) need review.` : 'No conflicts in the sync queue.')
  }

  const handleRetryItem = async (item: SyncQueueItem) => {
    await retrySyncQueueItem(item.id)
    await refresh(false)
    setQueue(await listSyncQueue())
    setMessage(`${item.entityType} queued for retry.`)
  }

  return (
    <div className="fixed right-1.5 top-[calc(env(safe-area-inset-top,0px)+0.375rem)] z-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`block size-2.5 rounded-full border transition-transform hover:scale-125 ${copy.dotClassName}`}
        title="Arbrain runtime status"
        aria-label="Arbrain runtime status"
      />

      {open && (
        <div className="absolute right-0 mt-2 w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-surface/95 shadow-elevation-lg backdrop-blur-xl">
          <div className="border-b border-border-subtle px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Arbrain Runtime</p>
                <p className="truncate text-[10px] text-muted">
                  {status.desktop ? status.workspacePath ?? 'Desktop workspace' : 'Web fallback cache'}
                </p>
              </div>
              <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${copy.className}`}>
                {copy.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-border-subtle p-3 text-[11px]">
            <Metric label="Queued" value={status.pendingCount} />
            <Metric label="Failed" value={status.failedCount} intent={status.failedCount > 0 ? 'bad' : 'neutral'} />
            <Metric label="Conflicts" value={status.conflictCount} intent={status.conflictCount > 0 ? 'bad' : 'neutral'} />
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            <button type="button" onClick={handlePack} disabled={busy !== null} className="btn-secondary justify-start text-xs">
              {busy === 'pack' ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
              Prepare Offline Pack
            </button>
            <button type="button" onClick={handleSync} disabled={busy !== null} className="btn-secondary justify-start text-xs">
              {busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Sync Now
            </button>
            <button type="button" onClick={handleMirror} disabled={busy !== null || !status.online} className="btn-secondary justify-start text-xs disabled:opacity-50">
              {busy === 'mirror' ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />}
              Pull Local Mirror
            </button>
            <button type="button" onClick={handleOpenWorkspace} disabled={!status.desktop} className="btn-secondary justify-start text-xs disabled:opacity-50">
              <FolderOpen size={13} />
              Open Workspace
            </button>
            <button type="button" onClick={handleViewQueue} className="btn-secondary justify-start text-xs">
              <ShieldAlert size={13} />
              View Sync Queue
            </button>
            <button type="button" onClick={handleResolveConflicts} className="btn-secondary justify-start text-xs">
              <GitBranch size={13} />
              Resolve Conflicts
            </button>
          </div>

          <div className="border-t border-border-subtle px-3 py-2 text-[11px] text-muted">
            <div className="flex items-center justify-between gap-3">
              <span>Last sync</span>
              <span className="text-foreground/75">{rel(status.lastSyncedAt)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span>Connectivity</span>
              <span className={status.online ? 'text-emerald-300' : 'text-amber-300'}>
                {status.online ? 'online' : 'offline'}
              </span>
            </div>
            {status.server && (
              <div className="mt-1 flex items-center justify-between gap-3">
                <span>Local server</span>
                <span className={status.server.ready ? 'text-emerald-300' : 'text-amber-300'}>
                  {status.server.mode}
                </span>
              </div>
            )}
          </div>

          {visibleQueue.length > 0 && (
            <div className="max-h-48 overflow-y-auto border-t border-border-subtle p-2">
              {visibleQueue.map((item) => (
                <div key={item.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-card-hover">
                  {item.status === 'synced' ? <CheckCircle2 size={12} className="mt-0.5 text-emerald-300" /> : item.status === 'conflict' ? <GitBranch size={12} className="mt-0.5 text-amber-300" /> : <RefreshCw size={12} className="mt-0.5 text-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground/80">{item.entityType} · {item.operation}</p>
                    <p className="truncate text-muted">{item.status} · {rel(item.updatedAt)}{item.lastError ? ` · ${item.lastError}` : ''}</p>
                    {(item.status === 'failed' || item.status === 'conflict') && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => handleRetryItem(item)} className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-foreground/80 hover:bg-card-hover">
                          Retry
                        </button>
                        {item.entityType === 'drawing' && (
                          <a href={`/draw3/${encodeURIComponent(item.entityId)}`} className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-foreground/80 hover:bg-card-hover">
                            Open canvas
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {message && (
            <div className="border-t border-border-subtle px-3 py-2 text-[11px] text-muted">
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, intent = 'neutral' }: { label: string; value: number; intent?: 'neutral' | 'bad' }) {
  return (
    <div className={`rounded-md border px-2 py-2 ${intent === 'bad' ? 'border-amber-400/25 bg-amber-500/10' : 'border-border-subtle bg-card/60'}`}>
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
