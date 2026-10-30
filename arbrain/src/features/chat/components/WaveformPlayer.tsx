'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause } from 'lucide-react'
import { useAudio } from '../contexts/AudioContext'

const HEIGHTS = [3, 5, 7, 9, 11, 13, 11, 9, 7, 5, 9, 13, 11, 9, 7, 5, 7, 9, 11, 13, 11, 9, 7, 5, 7, 9, 7, 5]
const BARS = 28

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

interface WaveformPlayerProps {
  audioUrl: string
  messageId: string
  isUser?: boolean
  autoPlay?: boolean
}

export function WaveformPlayer({
  audioUrl,
  messageId,
  isUser = false,
  autoPlay = false,
}: WaveformPlayerProps) {
  const { state: audio, register } = useAudio()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const unregisterRef = useRef<(() => void) | null>(null)
  const autoPlayRef = useRef(autoPlay)
  const [localDuration, setLocalDuration] = useState(0)

  useEffect(() => {
    const el = new Audio(audioUrl)
    audioRef.current = el

    const onMeta = () => setLocalDuration(el.duration)
    el.addEventListener('loadedmetadata', onMeta)

    if (autoPlayRef.current) {
      unregisterRef.current = register(el, messageId)
      el.play().catch(() => {})
    }

    return () => {
      el.pause()
      el.removeEventListener('loadedmetadata', onMeta)
      unregisterRef.current?.()
      unregisterRef.current = null
    }
  }, [audioUrl, messageId, register])

  const handleToggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return

    if (!el.paused) {
      el.pause()
    } else {
      unregisterRef.current?.()
      unregisterRef.current = register(el, messageId)
      if (el.duration > 0 && el.currentTime >= el.duration) el.currentTime = 0
      el.play().catch(() => {})
    }
  }, [messageId, register])

  // Derive state from AudioContext when this is the active audio
  const isActive = audio.messageId === messageId
  const playing = isActive && audio.isPlaying
  const progress =
    isActive && audio.duration > 0 ? audio.currentTime / audio.duration : 0
  const duration =
    isActive && audio.duration > 0 ? audio.duration : localDuration

  const filled = Math.round(progress * BARS)

  return (
    <div
      className={`flex items-center gap-2.5 py-0.5 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Play / Pause */}
      <button
        onClick={handleToggle}
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors
          ${
            isUser
              ? 'bg-card-active hover:bg-muted/40 text-foreground'
              : 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-300'
          }`}
      >
        {playing ? (
          <Pause size={11} className="fill-current" />
        ) : (
          <Play size={11} className="fill-current" />
        )}
      </button>

      {/* Waveform bars */}
      <div
        className={`flex items-end gap-px h-5 ${isUser ? 'flex-row-reverse' : ''}`}
      >
        {Array.from({ length: BARS }, (_, i) => {
          const isFilled = isUser ? i >= BARS - filled : i < filled
          return (
            <span
              key={i}
              className={`w-0.5 rounded-full transition-colors duration-75 ${
                isFilled
                  ? isUser
                    ? 'bg-foreground/70'
                    : 'bg-violet-400'
                  : 'bg-card-active'
              }`}
              style={{ height: `${HEIGHTS[i % HEIGHTS.length]}px` }}
            />
          )
        })}
      </div>

      {/* Timer */}
      <span className="text-[10px] font-mono text-muted/80 tabular-nums shrink-0 min-w-[28px]">
        {playing ? formatTime(audio.currentTime) : formatTime(duration)}
      </span>
    </div>
  )
}
