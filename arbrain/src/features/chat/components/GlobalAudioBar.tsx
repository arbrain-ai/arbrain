'use client'

import { useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, RotateCw, X, Zap } from 'lucide-react'
import { useAudio } from '../contexts/AudioContext'
import {
  AudioBarFrame,
  BTN_CERRAR,
  BTN_PLAY,
  BTN_SALTO,
  BTN_VELOCIDAD,
  TXT_CONTADOR,
} from './AudioBarChrome'

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * Barra del audio de un mensaje (1 oct 2026: mismo marco que ChatSpeechBar, AudioBarChrome).
 * tiempo a la izquierda · velocidad, −15, ▶ (en el eje del hilo), +15 · ✕ a la derecha ·
 * progreso arrastrable como línea fina a todo el ancho.
 */
export function GlobalAudioBar() {
  const { state, toggle, skip, cycleSpeed, seekTo, reset } = useAudio()
  const barRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const handleSeek = useCallback(
    (clientX: number) => {
      const bar = barRef.current
      if (!bar || !state.duration) return
      const rect = bar.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      seekTo(pct * state.duration)
    },
    [state.duration, seekTo],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true
      handleSeek(e.clientX)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [handleSeek],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      handleSeek(e.clientX)
    },
    [handleSeek],
  )

  const onPointerUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  // Only render when audio is active
  if (!state.messageId || state.duration <= 0) return null

  const pct =
    state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0

  const speedLabel =
    state.playbackRate === 1
      ? '1x'
      : state.playbackRate === 1.5
        ? '1.5x'
        : '2x'

  const speedColor =
    state.playbackRate === 1
      ? 'text-muted'
      : state.playbackRate === 1.5
        ? 'text-brand-ink'
        : 'text-amber-400'

  return (
    <AudioBarFrame
      izquierda={
        <span className={TXT_CONTADOR}>
          {fmt(state.currentTime)}
          {/* En 390 px el carril izquierdo mide ~50 px: solo el tiempo transcurrido. */}
          <span className="max-sm:hidden"> / {fmt(state.duration)}</span>
        </span>
      }
      velocidad={
        <button onClick={cycleSpeed} className={`${BTN_VELOCIDAD} ${speedColor}`} title="Velocidad">
          <Zap size={11} />
          {speedLabel}
        </button>
      }
      controles={
        <>
          <button onClick={() => skip(-15)} className={BTN_SALTO} title="-15s">
            <RotateCcw size={18} />
          </button>
          <button onClick={toggle} className={BTN_PLAY}>
            {state.isPlaying ? (
              <Pause size={20} className="fill-current" />
            ) : (
              <Play size={20} className="fill-current ml-0.5" />
            )}
          </button>
          <button onClick={() => skip(15)} className={BTN_SALTO} title="+15s">
            <RotateCw size={18} />
          </button>
        </>
      }
      derecha={
        <button onClick={reset} className={BTN_CERRAR} title="Cerrar">
          <X size={18} />
        </button>
      }
      /* Línea de progreso a todo el ancho en el borde inferior. La zona de arrastre mide
         16 px (antes 24) para no comerse los botones; la línea crece al pasar el cursor. */
      progreso={
        <div
          ref={barRef}
          className="group/seek absolute inset-x-0 bottom-0 flex h-4 cursor-pointer touch-none items-end"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="relative h-[3px] w-full bg-card-active transition-[height] group-hover/seek:h-1.5">
            <div
              className="absolute inset-y-0 left-0 rounded-r-full bg-gradient-to-r from-brand to-brand-ink"
              style={{ width: `${pct}%`, transition: draggingRef.current ? 'none' : 'width 150ms' }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-brand-ink opacity-0 shadow-[0_0_6px_rgba(140,39,241,0.5)] transition-opacity group-hover/seek:opacity-100"
              style={{ left: `calc(${pct}% - 6px)` }}
            />
          </div>
        </div>
      }
    />
  )
}
