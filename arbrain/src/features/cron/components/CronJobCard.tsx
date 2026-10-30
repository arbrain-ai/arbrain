'use client'
import { useState } from 'react'
import { Play, Pause, RotateCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, FileText } from 'lucide-react'
import type { CronJob, CronRun } from '../hooks/useCronJobs'
import { cronLabel } from '@/shared/constants/cron-taxonomy'

interface CronJobCardProps {
  job: CronJob
  history?: CronRun[]
  onAction: (id: string, action: 'run' | 'pause' | 'resume') => void
}

function formatCron(schedule: string): string {
  if (schedule === '45 3 * * *') return 'Daily 3:45 AM'
  if (schedule === '0 6 * * *') return 'Daily 6:00 AM'
  if (schedule === '0 2 * * 0') return 'Sun 2:00 AM'
  if (schedule === '0 1 * * 1') return 'Mon 1:00 AM'
  if (schedule === '0 */4 * * *') return 'Every 4h'
  if (schedule === '0 */6 * * *') return 'Every 6h'
  return schedule
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return 'Never'
  const d = new Date(ts * 1000)
  const now = Date.now()
  const diff = now - d.getTime()

  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatISOTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()

  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatNextRun(ts: number): string {
  const d = new Date(ts * 1000)
  const now = Date.now()
  const diff = d.getTime() - now

  if (diff < 0) return 'Overdue'
  if (diff < 60_000) return 'In <1m'
  if (diff < 3_600_000) return `In ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `In ${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

function HistoryItem({ run }: { run: CronRun }) {
  const [expanded, setExpanded] = useState(false)
  const isError = run.status === 'error'
  const content = isError ? run.error : run.response
  const preview = content
    ? content.length > 80
      ? content.slice(0, 80) + '...'
      : content
    : '(no output)'

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left bg-card/40 hover:bg-card rounded-lg p-2 transition-colors"
    >
      <div className="flex items-center gap-2">
        {isError ? (
          <AlertCircle size={10} className="text-red-400/60 shrink-0" />
        ) : (
          <CheckCircle2 size={10} className="text-emerald-400/60 shrink-0" />
        )}
        <span className="text-[10px] text-muted shrink-0">
          {formatISOTimestamp(run.created_at)}
        </span>
        {!expanded && (
          <span className="text-[10px] text-muted/70 truncate">{preview}</span>
        )}
      </div>
      {expanded && content && (
        <div className="mt-2 text-[11px] text-muted/80 font-mono break-words whitespace-pre-wrap max-h-60 overflow-y-auto">
          {content}
        </div>
      )}
    </button>
  )
}

export function CronJobCard({ job, history, onAction }: CronJobCardProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const isPaused = job.status === 'paused'
  const label = cronLabel(job.id)
  const lastResult = job.last_result
    ? job.last_result.length > 120
      ? job.last_result.slice(0, 120) + '...'
      : job.last_result
    : null

  const hasHistory = history && history.length > 0

  return (
    <div className="bg-card backdrop-blur-xl border border-border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-400/80' : 'bg-emerald-400 animate-pulse'}`}
          />
          <h3 className="text-sm font-medium text-foreground/85">{label}</h3>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            isPaused
              ? 'bg-yellow-400/10 text-yellow-400/80'
              : 'bg-emerald-400/10 text-emerald-400/80'
          }`}
        >
          {isPaused ? 'Paused' : 'Active'}
        </span>
      </div>

      {/* Schedule + timing */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-muted/80">Schedule</p>
          <p className="text-foreground/70 font-mono">{formatCron(job.schedule)}</p>
        </div>
        <div>
          <p className="text-muted/80">Last run</p>
          <p className="text-foreground/70">{formatTimestamp(job.last_run)}</p>
        </div>
        <div>
          <p className="text-muted/80">Next run</p>
          <p className="text-foreground/70">{isPaused ? '\u2014' : formatNextRun(job.next_run)}</p>
        </div>
      </div>

      {/* Last result */}
      {lastResult && (
        <div className="text-[11px] text-muted/80 bg-card/60 rounded-lg p-2 font-mono break-words max-h-20 overflow-y-auto">
          {lastResult}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onAction(job.id, 'run')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-card-hover hover:bg-card-active text-muted hover:text-foreground/85 transition-colors"
        >
          <Play size={12} />
          Run now
        </button>
        <button
          onClick={() => onAction(job.id, isPaused ? 'resume' : 'pause')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-card-hover hover:bg-card-active text-muted hover:text-foreground/85 transition-colors"
        >
          {isPaused ? <RotateCw size={12} /> : <Pause size={12} />}
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            showPrompt
              ? 'bg-blue-500/15 text-blue-400/80 hover:bg-blue-500/20'
              : 'bg-card-hover hover:bg-card-active text-muted hover:text-foreground/85'
          }`}
        >
          <FileText size={12} />
          Prompt
        </button>

        {hasHistory && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="ml-auto flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] text-muted/80 hover:text-foreground/70 transition-colors"
          >
            {history.length} run{history.length !== 1 ? 's' : ''}
            {showHistory ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}
      </div>

      {/* Prompt */}
      {showPrompt && job.prompt && (
        <div className="space-y-2 pt-1 border-t border-blue-400/10">
          <p className="text-[10px] text-blue-400/50 font-medium uppercase tracking-wider">Prompt del Job</p>
          <div className="text-[11px] text-muted bg-card/60 rounded-lg p-3 font-mono break-words whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
            {job.prompt}
          </div>
        </div>
      )}

      {/* History */}
      {showHistory && hasHistory && (
        <div className="space-y-1 pt-1 border-t border-border-subtle">
          {history.slice(0, 10).map((run) => (
            <HistoryItem key={run.id} run={run} />
          ))}
          {history.length > 10 && (
            <p className="text-[10px] text-muted/60 text-center pt-1">
              +{history.length - 10} older runs
            </p>
          )}
        </div>
      )}
    </div>
  )
}
