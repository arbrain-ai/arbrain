'use client'

import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../lib/audio-engine'
import type { LoopStatus } from '../hooks/useVoiceLoop'

interface OrbProps {
  engineRef: React.RefObject<AudioEngine | null>
  status: LoopStatus
}

// Paleta por estado (RGB)
const COLORS: Record<LoopStatus, [number, number, number]> = {
  idle: [104, 58, 204],      // primary purple
  listening: [56, 189, 248], // cyan
  thinking: [139, 92, 246],  // accent purple
  speaking: [255, 145, 1],   // gold
  error: [239, 68, 68],      // red
}

// Esfera de Fibonacci → puntos uniformes. Cada punto lleva fase propia y banda
// asignada por latitud (graves=ecuador, agudos=polos) → la superficie ondula
// orgánicamente con el espectro del audio, no solo con el volumen.
type Particle = { x: number; y: number; z: number; phase: number; band: 0 | 1 | 2; speed: number }

function buildSphere(n: number): Particle[] {
  const pts: Particle[] = []
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = phi * i
    const lat = Math.abs(y)
    const band: 0 | 1 | 2 = lat < 0.38 ? 0 : lat < 0.75 ? 1 : 2
    // pseudo-aleatorio determinista (no Math.random: render estable entre mounts)
    const h = Math.sin(i * 127.1) * 43758.5453
    const phase = (h - Math.floor(h)) * Math.PI * 2
    pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r, phase, band, speed: 0.6 + (phase / (Math.PI * 2)) * 0.8 })
  }
  return pts
}

const PARTICLES = buildSphere(820)

// El orbe se dibuja a baseR = 0.19 * box, y el glow llega hasta ~0.48 * box → SIEMPRE
// se desvanece antes del borde (0.5 * box), así nunca se ve el cuadrado del lienzo.
const ORB_FRAC = 0.19

/** Sprite suave pre-renderizado (bloom barato): núcleo blanco → tinte → transparente.
 *  `hot` = núcleo más blanco y denso, para las partículas frontales. */
function makeSprite(r: number, g: number, b: number, hot = false, size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const half = size / 2
  const boost = hot ? 200 : 130
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0, `rgba(${Math.min(255, r + boost)},${Math.min(255, g + boost)},${Math.min(255, b + boost)},1)`)
  grad.addColorStop(hot ? 0.35 : 0.25, `rgba(${r},${g},${b},${hot ? 0.95 : 0.9})`)
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.22)`)
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  return c
}

type Ripple = { bornAt: number; life: number }

export function Orb({ engineRef, status }: OrbProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef<LoopStatus>(status)
  const rafRef = useRef(0)
  const smoothLevelRef = useRef(0)
  const bandsRef = useRef({ low: 0, mid: 0, high: 0 })
  const colorRef = useRef<[number, number, number]>([...COLORS.idle] as [number, number, number])
  const [box, setBox] = useState(320)

  useEffect(() => { statusRef.current = status }, [status])

  // Responsivo: el lienzo se mide al ancho disponible (acotado por alto de viewport).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800
      const s = Math.round(Math.max(200, Math.min(560, Math.min(w, vh * 0.6))))
      setBox((prev) => (Math.abs(prev - s) > 2 ? s : prev))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  // Render loop (se reinicia cuando cambia el tamaño del lienzo)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    // dpr 1.5 basta para sprites con glow suave y reduce el área de píxeles ~44% vs 2.0 (60fps)
    const dpr = Math.min(1.5, window.devicePixelRatio || 1)
    canvas.width = box * dpr
    canvas.height = box * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cx = box / 2
    const cy = box / 2
    const baseR = box * ORB_FRAC
    let rotY = 0
    let rotX = 0.42
    let t0 = performance.now()
    let sprite = makeSprite(colorRef.current[0], colorRef.current[1], colorRef.current[2])
    let spriteHot = makeSprite(colorRef.current[0], colorRef.current[1], colorRef.current[2], true)
    let spriteKey = colorRef.current.map(Math.round).join(',')
    let lastPeakAt = 0
    let prevLevel = 0
    let prevState: LoopStatus = statusRef.current
    const ripples: Ripple[] = []

    const render = (now: number) => {
      const dt = Math.min(50, now - t0)
      t0 = now
      const st = statusRef.current

      // Color con lerp suave entre estados
      const target = COLORS[st] ?? COLORS.idle
      const c = colorRef.current
      c[0] += (target[0] - c[0]) * 0.07
      c[1] += (target[1] - c[1]) * 0.07
      c[2] += (target[2] - c[2]) * 0.07
      const r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2])
      const key = `${r},${g},${b}`
      if (key !== spriteKey) { sprite = makeSprite(r, g, b); spriteHot = makeSprite(r, g, b, true); spriteKey = key }

      // Nivel + bandas del audio real
      const engine = engineRef.current
      const raw = engine?.level ?? 0
      const eb = engine?.bands ?? { low: 0, mid: 0, high: 0 }
      const bs = bandsRef.current
      bs.low += (eb.low - bs.low) * 0.25
      bs.mid += (eb.mid - bs.mid) * 0.25
      bs.high += (eb.high - bs.high) * 0.25

      const idleBreath = st === 'idle' ? (Math.sin(now / 1400) * 0.5 + 0.5) * 0.12 : 0
      const thinkPulse = st === 'thinking' ? (Math.sin(now / 280) * 0.5 + 0.5) * 0.18 : 0
      const targetLevel = Math.max(raw, idleBreath, thinkPulse)
      smoothLevelRef.current += (targetLevel - smoothLevelRef.current) * 0.18
      const level = smoothLevelRef.current

      // Burst al cambiar de estado (despertar/hablar): anillos que anuncian la transición
      if (st !== prevState) {
        if (!reduced && (st === 'listening' || st === 'speaking')) {
          ripples.length = 0
          ripples.push({ bornAt: now, life: 900 }, { bornAt: now + 140, life: 1000 })
        }
        prevState = st
      }

      // Pulsos: en picos de audio reales emite un anillo expansivo (hablando) o contractivo (escuchando)
      if (!reduced && raw - prevLevel > 0.09 && now - lastPeakAt > 240 && (st === 'speaking' || st === 'listening')) {
        lastPeakAt = now
        if (ripples.length < 4) ripples.push({ bornAt: now, life: 1100 })
      }
      prevLevel = raw

      // Rotación doble eje (precesión lenta) — reactiva al audio
      const speedMul = reduced ? 0.25 : 1
      rotY += (dt / 1000) * (0.22 + level * 1.4 + (st === 'thinking' ? 0.35 : 0)) * speedMul
      rotX = 0.42 + Math.sin(now / 9000) * 0.16 * speedMul
      const radius = baseR * (1 + level * 0.32)

      ctx.clearRect(0, 0, box, box)

      // Halo / glow central — desvanece a 0 antes del borde del lienzo
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.9)
      glow.addColorStop(0, `rgba(${r},${g},${b},${0.28 + level * 0.4})`)
      glow.addColorStop(0.5, `rgba(${r},${g},${b},${0.08 + level * 0.12})`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, box, box)

      // Núcleo blanco-caliente
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.55)
      core.addColorStop(0, `rgba(${Math.min(255, r + 110)},${Math.min(255, g + 110)},${Math.min(255, b + 110)},${0.6 + level * 0.4})`)
      core.addColorStop(0.55, `rgba(${r},${g},${b},${0.22 + level * 0.2})`)
      core.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2)
      ctx.fill()

      // Anillos de pulso (nacen en picos del audio real)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]
        const p = (now - rp.bornAt) / rp.life
        if (p >= 1) { ripples.splice(i, 1); continue }
        if (p < 0) continue // aún no nace (bursts encadenados)
        // hablando: expande hacia afuera · escuchando: contrae hacia el núcleo
        const frac = st === 'listening' ? 1.75 - p * 0.85 : 0.9 + p * 0.85
        const alpha = (1 - p) * 0.32
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.ellipse(cx, cy, radius * frac, radius * frac * 0.42, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Partículas de la esfera (sprites suaves con wobble por banda)
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY)
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX)
      const wob = reduced ? 0 : 1
      const bandAmp = [bs.low * 0.10, bs.mid * 0.085, bs.high * 0.075]
      const shimmer = st === 'thinking' && !reduced
      for (let i = 0; i < PARTICLES.length; i++) {
        const pt = PARTICLES[i]
        // Ondulación radial orgánica: banda asignada + fase propia
        const amp = bandAmp[pt.band]
        const wobble = 1 + wob * (amp * Math.sin(now / 160 * pt.speed + pt.phase) + level * 0.035 * Math.sin(now / 90 + pt.phase * 3))
        const px = pt.x * wobble, py = pt.y * wobble, pz = pt.z * wobble
        // Rotación Y → X
        const x1 = px * cosY - pz * sinY
        const z1 = px * sinY + pz * cosY
        const y1 = py * cosX - z1 * sinX
        const z2 = py * sinX + z1 * cosX
        const depth = (z2 + 1.6) / 2.6 // 0 lejos → 1 cerca
        // Coordenadas/tamaños enteros: drawImage sin subpixel es notablemente más rápido
        const psize = ((2.4 + depth * 6.2) * (1 + level * 0.55)) | 0
        const sx = (cx + x1 * radius - psize / 2) | 0
        const sy = (cy + y1 * radius - psize / 2) | 0
        let alpha = (0.16 + depth * 0.72) * (0.72 + level * 0.45)
        if (shimmer) alpha *= 0.75 + 0.25 * Math.sin(now / 200 + pt.phase * 2 + x1 * 2)
        // Twinkle sutil en reposo: constelación viva sin volumen de audio
        else if (st === 'idle' && !reduced) alpha *= 0.84 + 0.16 * Math.sin(now / 640 * pt.speed + pt.phase * 4)
        ctx.globalAlpha = Math.min(1, alpha)
        // Frontales con sprite "hot" (núcleo blanco) → profundidad sin doble pasada
        ctx.drawImage(depth > 0.8 ? spriteHot : sprite, sx, sy, psize, psize)
      }
      ctx.globalAlpha = 1

      // Anillo orbital doble (gira lento, opuesto al spin de la esfera)
      const ringTilt = Math.sin(now / 6000) * 0.1
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.20 + level * 0.28})`
      ctx.lineWidth = 1.25
      ctx.beginPath()
      ctx.ellipse(cx, cy, radius * 1.18, radius * 1.18 * 0.40, ringTilt, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.08 + level * 0.14})`
      ctx.beginPath()
      ctx.ellipse(cx, cy, radius * 1.34, radius * 1.34 * 0.46, -ringTilt * 1.6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'

      rafRef.current = requestAnimationFrame(render)
    }
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [engineRef, box])

  return (
    <div ref={wrapRef} className="w-full flex items-center justify-center select-none" aria-hidden>
      <canvas ref={canvasRef} style={{ width: box, height: box }} />
    </div>
  )
}
