'use client'
import { useCronJobs, useCronHistory } from '../hooks/useCronJobs'
import { CronJobCard } from './CronJobCard'
import { RefreshCw, WifiOff, MessageCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAskLevy } from '@/shared/hooks/useAskLevy'

export function CronJobList() {
  const { jobs, loading, error, offline, offlineReason, configuredUrl, upstreamStatus, detail, refetch, runAction } = useCronJobs()
  const { historyByJob, loading: historyLoading, refetch: refetchHistory } = useCronHistory()
  const { isOwner } = useAuth()
  const askLevy = useAskLevy()

  const handleRefresh = () => {
    refetch()
    refetchHistory()
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 rounded-xl bg-card animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-400/60">Failed to load cron jobs</p>
        <p className="text-xs text-muted/80 mt-1">{error}</p>
        <button
          onClick={handleRefresh}
          className="mt-3 text-xs text-muted hover:text-foreground/75 flex items-center gap-1.5 mx-auto"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    )
  }

  if (offline) {
    const reasonLabel =
      offlineReason === 'connection_refused'
        ? 'Connection refused'
        : offlineReason === 'timeout'
          ? 'Timeout'
          : offlineReason === 'unauthorized'
            ? 'Token mismatch'
            : offlineReason === 'missing_token'
              ? 'Missing token'
              : 'Unreachable'

    return (
      <div className="text-center py-12">
        <WifiOff size={24} className="mx-auto text-muted/60 mb-3" />
        <p className="text-sm text-muted">ClaudeClaw bridge unreachable</p>
        <p className="text-xs text-muted/70 mt-1">
          {reasonLabel}
          {upstreamStatus ? ` · HTTP ${upstreamStatus}` : ''}
          {configuredUrl ? ` · ${configuredUrl}` : ''}
        </p>
        {detail && (
          <p className="mx-auto mt-2 max-w-md break-words font-mono text-[10px] text-muted/60">
            {detail}
          </p>
        )}
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={handleRefresh}
            className="text-xs text-muted hover:text-foreground/75 flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            Retry
          </button>
          {isOwner && (
            <button
              onClick={() => askLevy('Del monitor de crons: ')}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1.5"
              title="El daemon solo es alcanzable en desktop; por chat lo opero yo"
            >
              <MessageCircle size={12} />
              Pídemelo por chat
            </button>
          )}
        </div>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted">No cron jobs configured</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted/80">
          {jobs.length} job{jobs.length !== 1 ? 's' : ''} — {jobs.filter((j) => j.status === 'active').length} active
          {!historyLoading && Object.keys(historyByJob).length > 0 && (
            <span className="text-muted/60"> — history loaded</span>
          )}
        </p>
        <button
          onClick={handleRefresh}
          className="text-xs text-muted/80 hover:text-foreground/70 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>
      {jobs.map((job) => (
        <CronJobCard
          key={job.id}
          job={job}
          history={historyByJob[job.id]}
          onAction={runAction}
        />
      ))}
    </div>
  )
}
