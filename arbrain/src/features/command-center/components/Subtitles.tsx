'use client'

import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../lib/audio-engine'
import type { LoopStatus } from '../hooks/useVoiceLoop'

type Segment = { text: string }

const HINT: Record<LoopStatus, string> = {
  idle: 'Toca a Levy o di "Oye Levy" · mantén ESPACIO para hablar · ESC para parar',
  listening: 'Escuchando… · ESC para parar',
  thinking: 'Procesando… · ESC para parar',
  speaking: '',
  error: '',
}

export function Subtitles({ engineRef, segmentsRef, status, transcript, response, error }: {
  engineRef: React.RefObject<AudioEngine | null>
  segmentsRef: React.RefObject<Segment[]>
  status: LoopStatus
  transcript: string
  response: string
  error?: string | null
}) {
  // disp.text = texto hablado/encolado · disp.spoken = chars ya pronunciados (en blanco)
  const [disp, setDisp] = useState<{ text: string; spoken: number }>({ text: '', spoken: 0 })
  // Primer arranque: saludo de sistema breve antes de la pista estándar
  const [boot, setBoot] = useState(true)
  useEffect(() => { const t = setTimeout(() => setBoot(false), 2800); return () => clearTimeout(t) }, [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef({ text: '', spoken: -1 })

  // Loop de sincronía karaoke: el engine reporta cuántas oraciones terminaron
  // (spokenSegments) y la fracción de la que suena (activeFraction, del currentTime
  // real del elemento). Como usa el tiempo de medios real, queda en sync a 1×/1.5×/2×.
  useEffect(() => {
    const tick = () => {
      const segs = segmentsRef.current ?? []
      const eng = engineRef.current
      const completed = eng?.spokenSegments ?? 0
      const frac = eng?.activeFraction ?? 0
      const full = segs.map((s) => s.text).join(' ')
      let spoken = 0
      let offset = 0
      for (let i = 0; i < segs.length; i++) {
        const len = segs[i].text.length
        if (i < completed) { spoken = offset + len; offset += len + 1; continue }
        if (i === completed) { spoken = offset + Math.floor(len * frac) }
        break
      }
      if (lastRef.current.text !== full || lastRef.current.spoken !== spoken) {
        lastRef.current = { text: full, spoken }
        setDisp({ text: full, spoken })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [engineRef, segmentsRef])

  // Auto-scroll SUAVE: sigue la palabra que se está hablando (frontera blanco/gris),
  // manteniéndola ~centrada. NO salta al fondo. Solo scrollea el contenedor, no la página.
  useEffect(() => {
    const c = scrollRef.current
    const m = markerRef.current
    if (!c || !m) return
    const target = m.offsetTop - c.clientHeight / 2
    c.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [disp])

  const hasKaraoke = disp.text.length > 0

  return (
    <div className="w-full max-w-2xl mx-auto text-center px-4 min-h-[72px] flex flex-col justify-center" aria-live="polite">
      {status === 'error' && error && (
        <div className="cc-fade mx-auto inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/30 bg-red-500/10" role="alert">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden />
          <p className="text-sm font-medium text-red-200">{error}</p>
          <span className="text-xs text-red-200/50 hidden sm:inline">· toca a Levy para reintentar</span>
        </div>
      )}
      {status !== 'error' && transcript && (
        <p key={transcript} className="cc-fade text-xs font-mono text-white/30 mb-1.5 truncate">{`“${transcript}”`}</p>
      )}

      {status !== 'error' && hasKaraoke && (
        <div ref={scrollRef} className="cc-subtitles-mask max-h-[92px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-2">
          <p className="text-base md:text-lg font-medium leading-snug">
            <span className="text-white [text-shadow:0_0_22px_rgba(255,255,255,0.18)]">{disp.text.slice(0, disp.spoken)}</span>
            <span ref={markerRef} aria-hidden />
            <span className="text-white/25">{disp.text.slice(disp.spoken)}</span>
          </p>
        </div>
      )}

      {/* Sin audio aún: si hay texto del modelo, mostrarlo tenue; si no, la pista */}
      {status !== 'error' && !hasKaraoke && response && (
        <div className="cc-subtitles-mask max-h-[92px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-2">
          <p className="text-base md:text-lg font-medium text-white/30 leading-snug">{response}</p>
        </div>
      )}
      {status !== 'error' && !hasKaraoke && !response && (
        boot && status === 'idle' ? (
          <p key="boot" className="cc-fade text-xs font-mono uppercase tracking-[0.3em] text-white/40">
            <span className="text-[#22c55e]">●</span> Levy en línea · sistemas nominales
          </p>
        ) : (
          <p key={status} className="cc-fade text-sm text-white/45">{HINT[status]}</p>
        )
      )}
    </div>
  )
}
