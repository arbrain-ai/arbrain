'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { TranscriptEntry } from '../hooks/useVoiceLoop'
import type { ChatMessage } from '@/features/chat/hooks/useChat'
import { MessageBubble } from '@/features/chat/components/ChatPanel'
import { AudioProvider } from '@/features/chat/contexts/AudioContext'

function toChatMessage(e: TranscriptEntry, i: number): ChatMessage {
  return {
    id: `cc-${e.ts}-${i}`,
    role: e.role === 'levy' ? 'assistant' : 'user',
    content: e.text,
    timestamp: new Date(e.ts),
  }
}

export function TranscriptPanel({ log, liveResponse, onClose }: {
  log: TranscriptEntry[]
  liveResponse: string
  onClose: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [log.length, liveResponse])

  const lastIsUser = log.length > 0 && log[log.length - 1].role === 'user'
  const showLive = liveResponse && lastIsUser

  const messages = log.map(toChatMessage)
  const liveMsg: ChatMessage | null = showLive
    ? { id: 'cc-live', role: 'assistant', content: liveResponse, timestamp: new Date(), streaming: true }
    : null

  return (
    <div className="cc-sheet absolute inset-x-0 bottom-0 top-14 z-30 flex flex-col bg-[#05060a]/95 backdrop-blur-xl px-4 sm:px-8 pt-4 pb-4 rounded-t-3xl border-t border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,0.6)]" role="dialog" aria-label="Conversación con Levy">
      <div className="flex items-center justify-between mb-3 max-w-3xl mx-auto w-full">
        <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/50">Conversación</span>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors" title="Cerrar" aria-label="Cerrar conversación">
          <X size={18} />
        </button>
      </div>
      {/* Reutiliza la UI real del chat (MessageBubble) — necesita AudioProvider para el botón de audio. */}
      <AudioProvider>
        <div className="flex-1 overflow-y-auto scrollbar-thin max-w-3xl mx-auto w-full space-y-3 pr-1">
          {messages.length === 0 && !liveMsg && (
            <p className="text-sm text-white/35 text-center mt-8">Aún no hay conversación. Habla con Levy o pide el reporte de estatus.</p>
          )}
          {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
          {liveMsg && <MessageBubble msg={liveMsg} />}
          <div ref={endRef} />
        </div>
      </AudioProvider>
    </div>
  )
}
