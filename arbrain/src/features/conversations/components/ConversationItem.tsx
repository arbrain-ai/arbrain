'use client'
import { useState } from 'react'
import type { Conversation } from '@/types/database'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-yellow-400 animate-pulse',
  done: 'bg-emerald-400',
  error: 'bg-red-400',
}

interface Props {
  conversation: Conversation
}

export function ConversationItem({ conversation }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isVoice = conversation.prompt.startsWith('[Nota de voz]')
  const icon = isVoice ? '🎤' : '💬'
  const truncated =
    conversation.prompt.length > 80
      ? conversation.prompt.slice(0, 80) + '…'
      : conversation.prompt

  return (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="w-full text-left px-4 py-3 hover:bg-card transition-colors border-b border-border-subtle last:border-0"
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[conversation.status] ?? 'bg-card-active'}`}
            />
            <span className="text-[10px] text-muted/80">
              {conversation.agents?.name ?? 'Levy'} · {timeAgo(conversation.created_at)}
            </span>
          </div>
          <p className="text-xs text-foreground/75 leading-relaxed">
            {expanded ? conversation.prompt : truncated}
          </p>
          {expanded && conversation.response && (
            <div className="mt-2 pt-2 border-t border-border-subtle">
              <p className="text-[10px] text-muted mb-1">Response</p>
              <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">
                {conversation.response}
              </p>
            </div>
          )}
          {expanded && conversation.error && (
            <div className="mt-2 pt-2 border-t border-border-subtle">
              <p className="text-xs text-red-400/80 leading-relaxed">{conversation.error}</p>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
