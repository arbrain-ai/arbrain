'use client'

/**
 * Sincronización, para Levy y diagnóstico (4 nov 2026). Era el panel del punto verde de arriba a la derecha («Arbrain Runtime»);
 * Daniel lo quitó de su vista («nunca lo veo… que sea la ia quien se encargue»). Lo de todos los días corre solo en
 * `SyncAutonomo` (reintentos, conflictos por regla, espejo y paquete diario); aquí quedan las mismas acciones a mano, en
 * Ajustes › Mac y sistema › Sincronización.
 */
import { useEffect, useMemo, useState } from 'react'
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
  listSyncQueue,
  openLocalWorkspace,
  prepareOfflinePack,
  retrySyncQueueItem,
  syncAndPullLocalMirror,
  syncNow,
  useRuntimeStatus,
  type SyncQueueItem,
} from '@/lib/local-first'
import { NOMBRE_PAQUETE } from '@/lib/local-first/sync-autonomo'

function statusCopy(mode: 'cloud' | 'hybrid' | 'offline') {
  if (mode === 'offline') return { label: 'Sin red', className: 'text-amber-600 dark:text-amber-300 border-amber-400/30 bg-amber-500/12' }
  if (mode === 'hybrid') return { label: 'Híbrido', className: 'text-cyan-700 dark:text-cyan-200 border-cyan-400/25 bg-cyan-500/10' }
  return { label: 'Nube', className: 'text-emerald-700 dark:text-emerald-200 border-emerald-400/25 bg-emerald-500/10' }
}

function rel(value?: string | null) {
  if (!value) return 'nunca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'desconocida'
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'ahora'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

export function SincronizacionAvanzada() {
  const { status, refresh } = useRuntimeStatus()
  const [busy, setBusy] = useState<'sync' | 'mirror' | 'pack' | null>(null)
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [queueMode, setQueueMode] = useState<'recent' | 'conflicts'>('recent')
  const [message, setMessage] = useState<string | null>(null)
  const copy = statusCopy(status.mode)

  const visibleQueue = useMemo(() => {
    const source = queueMode === 'conflicts'
      ? queue.filter((item) => item.status === 'conflict')
      : queue
    return source.slice(0, 5)
  }, [queue, queueMode])

  useEffect(() => {
    listSyncQueue().then(setQueue).catch(() => setQueue([]))
  }, [status.pendingCount, status.failedCount, status.conflictCount])

  const handleSync = async () => {
    setBusy('sync')
    setMessage(null)
    try {
      const result = await syncNow()
      await refresh(false)
      setQueue(await listSyncQueue())
      setMessage(`Procesados ${result.processed}: ${result.synced} subidos, ${result.failed} fallaron.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'La sincronización falló')
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
        `Espejo listo: ${result.pull.tasks} tareas, ${result.pull.events} eventos, ${result.pull.drawings} lienzos, ${result.pull.snapshots} vistas. Subidos ${result.sync.synced} de ${result.sync.processed}.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo traer el espejo')
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
        name: NOMBRE_PAQUETE,
        notes: 'Hecho a mano desde Ajustes › Sincronización.',
        snapshots: {
          route: typeof window !== 'undefined' ? window.location.pathname : '/',
          generatedFrom: status.desktop ? 'desktop' : 'web-fallback',
          mirror,
        },
      })
      await refresh(false)
      setMessage(`Paquete offline listo: ${result.packPath}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo hacer el paquete')
    } finally {
      setBusy(null)
    }
  }

  const handleOpenWorkspace = async () => {
    const path = await openLocalWorkspace().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir la carpeta')
      return null
    })
    if (path) setMessage(`Carpeta: ${path}`)
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
    setMessage(conflicts.length > 0 ? `${conflicts.length} en conflicto: el sincronizador los reintenta con el cambio local.` : 'Sin conflictos en la cola.')
  }

  const handleRetryItem = async (item: SyncQueueItem) => {
    await retrySyncQueueItem(item.id)
    await refresh(false)
    setQueue(await listSyncQueue())
    setMessage(`${item.entityType}: de vuelta a la cola.`)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-card/60">
          <div className="border-b border-border-subtle px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[11px] text-muted">
                {status.desktop ? status.workspacePath ?? 'Espacio de escritorio' : 'Caché del navegador'}
              </p>
              <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${copy.className}`}>
                {copy.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-border-subtle p-3 text-[11px]">
            <Metric label="En cola" value={status.pendingCount} />
            <Metric label="Fallaron" value={status.failedCount} intent={status.failedCount > 0 ? 'bad' : 'neutral'} />
            <Metric label="Conflictos" value={status.conflictCount} intent={status.conflictCount > 0 ? 'bad' : 'neutral'} />
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            <button type="button" onClick={handlePack} disabled={busy !== null} className="btn-secondary justify-start text-xs">
              {busy === 'pack' ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
              Paquete offline
            </button>
            <button type="button" onClick={handleSync} disabled={busy !== null} className="btn-secondary justify-start text-xs">
              {busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Sincronizar ya
            </button>
            <button type="button" onClick={handleMirror} disabled={busy !== null || !status.online} className="btn-secondary justify-start text-xs disabled:opacity-50">
              {busy === 'mirror' ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />}
              Traer el espejo
            </button>
            <button type="button" onClick={handleOpenWorkspace} disabled={!status.desktop} className="btn-secondary justify-start text-xs disabled:opacity-50">
              <FolderOpen size={13} />
              Abrir la carpeta
            </button>
            <button type="button" onClick={handleViewQueue} className="btn-secondary justify-start text-xs">
              <ShieldAlert size={13} />
              Ver la cola
            </button>
            <button type="button" onClick={handleResolveConflicts} className="btn-secondary justify-start text-xs">
              <GitBranch size={13} />
              Ver conflictos
            </button>
          </div>

          <div className="border-t border-border-subtle px-3 py-2 text-[11px] text-muted">
            <div className="flex items-center justify-between gap-3">
              <span>Última sincronización</span>
              <span className="text-foreground/75">{rel(status.lastSyncedAt)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span>Conexión</span>
              <span className={status.online ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}>
                {status.online ? 'en línea' : 'sin red'}
              </span>
            </div>
            {status.server && (
              <div className="mt-1 flex items-center justify-between gap-3">
                <span>Servidor local</span>
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
                          Reintentar
                        </button>
                        {item.entityType === 'drawing' && (
                          <a href={`/draw3/${encodeURIComponent(item.entityId)}`} className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-foreground/80 hover:bg-card-hover">
                            Abrir lienzo
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
