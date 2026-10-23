'use client'

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AudioState {
  isPlaying: boolean
  currentTime: number
  duration: number
  messageId: string | null
  playbackRate: number
}

const INITIAL: AudioState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  messageId: null,
  playbackRate: 1,
}

interface AudioContextValue {
  state: AudioState
  register: (el: HTMLAudioElement, messageId: string) => () => void
  play: () => void
  pause: () => void
  toggle: () => void
  seekTo: (time: number) => void
  skip: (seconds: number) => void
  cycleSpeed: () => void
  reset: () => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const Ctx = createContext<AudioContextValue | null>(null)

export function useAudio() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAudio must be inside AudioProvider')
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioState>(INITIAL)
  const elRef = useRef<HTMLAudioElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const rateRef = useRef(1)

  const reset = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (elRef.current) {
      elRef.current.pause()
      elRef.current = null
    }
    rateRef.current = 1
    setState(INITIAL)
  }, [])

  const register = useCallback(
    (el: HTMLAudioElement, messageId: string): (() => void) => {
      // Cleanup previous listeners
      cleanupRef.current?.()

      // Stop previous audio if different element
      if (elRef.current && elRef.current !== el) {
        elRef.current.pause()
      }

      elRef.current = el
      // Acelerar sin subir el tono (22 oct 2026): el estándar y el prefijo de Safari/WKWebView.
      const conPitch = el as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }
      conPitch.preservesPitch = true
      conPitch.webkitPreservesPitch = true
      el.playbackRate = rateRef.current

      const onTime = () =>
        setState((s) => ({
          ...s,
          currentTime: el.currentTime,
          duration: el.duration || 0,
        }))
      const onPlay = () =>
        setState((s) => ({
          ...s,
          isPlaying: true,
          messageId,
          duration: el.duration || 0,
        }))
      const onPause = () => setState((s) => ({ ...s, isPlaying: false }))
      const onEnded = () =>
        setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
      const onMeta = () => setState((s) => ({ ...s, duration: el.duration }))

      el.addEventListener('timeupdate', onTime)
      el.addEventListener('play', onPlay)
      el.addEventListener('pause', onPause)
      el.addEventListener('ended', onEnded)
      el.addEventListener('loadedmetadata', onMeta)

      setState((s) => ({ ...s, messageId }))

      const cleanup = () => {
        el.removeEventListener('timeupdate', onTime)
        el.removeEventListener('play', onPlay)
        el.removeEventListener('pause', onPause)
        el.removeEventListener('ended', onEnded)
        el.removeEventListener('loadedmetadata', onMeta)
      }
      cleanupRef.current = cleanup
      return cleanup
    },
    [],
  )

  const play = useCallback(() => {
    elRef.current?.play().catch(() => {})
  }, [])

  const pause = useCallback(() => {
    elRef.current?.pause()
  }, [])

  const toggle = useCallback(() => {
    const el = elRef.current
    if (!el) return
    if (el.paused) {
      if (el.duration > 0 && el.currentTime >= el.duration) el.currentTime = 0
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [])

  const seekTo = useCallback((time: number) => {
    if (elRef.current) elRef.current.currentTime = time
  }, [])

  const skip = useCallback((seconds: number) => {
    const el = elRef.current
    if (!el) return
    el.currentTime = Math.max(
      0,
      Math.min(el.duration || 0, el.currentTime + seconds),
    )
  }, [])

  const cycleSpeed = useCallback(() => {
    const rates = [1, 1.5, 2]
    const idx = rates.indexOf(rateRef.current)
    const next = rates[(idx + 1) % rates.length]
    rateRef.current = next
    if (elRef.current) elRef.current.playbackRate = next
    setState((s) => ({ ...s, playbackRate: next }))
  }, [])

  // Valor estable: el ChatPanel re-renderiza con cada tecla del composer, y un objeto nuevo aquí
  // obliga a React a recorrer TODO el árbol de la conversación buscando consumidores.
  const value = useMemo(
    () => ({ state, register, play, pause, toggle, seekTo, skip, cycleSpeed, reset }),
    [state, register, play, pause, toggle, seekTo, skip, cycleSpeed, reset],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
