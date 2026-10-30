'use client'

import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../lib/audio-engine'
import type { LoopStatus } from '../hooks/useVoiceLoop'

// Barra de sonido reactiva: se mueve con el micrófono al ESCUCHAR (cyan) y con el TTS al HABLAR (gold).
const COLOR: Record<LoopStatus, string> = {
  idle: '104,58,204',
  listening: '56,189,248',
  thinking: '139,92,246',
  speaking: '255,145,1',
  error: '239,68,68',
}

export function Waveform({ engineRef, status, bars = 36 }: {
  engineRef: React.RefObject<AudioEngine | null>
  status: LoopStatus
  bars?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef<LoopStatus>(status)
  const rafRef = useRef(0)
  useEffect(() => { statusRef.current = status }, [status])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = 260, H = 36
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const phases = Array.from({ length: bars }, (_, i) => i * 0.5)
    const gap = 3
    const bw = (W - gap * (bars - 1)) / bars
    let smooth = 0

    const render = (now: number) => {
      const st = statusRef.current
      const raw = engineRef.current?.level ?? 0
      // En reposo, una respiración mínima para que no se vea muerto.
      const idle = st === 'idle' ? 0.06 : 0
      smooth += (Math.max(raw, idle) - smooth) * 0.25
      const color = COLOR[st] ?? COLOR.idle

      ctx.clearRect(0, 0, W, H)
      const mid = H / 2
      for (let i = 0; i < bars; i++) {
        // perfil tipo "ola": más alto al centro, con variación temporal por barra
        const center = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2)
        const wobble = 0.5 + 0.5 * Math.sin(now / 220 + phases[i])
        const amp = (0.12 + smooth * 1.7) * (0.35 + center * 0.65) * (0.4 + wobble * 0.6)
        const h = Math.max(2, Math.min(H, amp * H))
        const x = i * (bw + gap)
        const alpha = 0.35 + smooth * 0.5 + center * 0.2
        ctx.fillStyle = `rgba(${color},${Math.min(1, alpha)})`
        ctx.beginPath()
        // barra redondeada centrada verticalmente
        const r = bw / 2
        const y = mid - h / 2
        ctx.roundRect(x, y, bw, h, r)
        ctx.fill()
      }
      rafRef.current = requestAnimationFrame(render)
    }
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [engineRef, bars])

  return <canvas ref={canvasRef} style={{ width: 260, height: 36 }} className="pointer-events-none select-none" aria-hidden />
}
