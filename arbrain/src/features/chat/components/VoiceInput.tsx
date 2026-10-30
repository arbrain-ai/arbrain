'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { asegurarPermiso } from '@/features/permisos/lib/permisos'
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import { formatoGrabacion, mensajeFalloMicrofono, mensajeFalloTranscripcion, plataformaDe, SIN_PERMISO_MAC, tipoDeGrabacion } from '../lib/voz-sistema'

type RecordState = 'idle' | 'recording' | 'processing' | 'error'

interface VoiceInputProps {
  onVoiceNote: (transcription: string, audioUrl: string) => void
  disabled?: boolean
  /** Dictado: solo transcribe (no sube el audio a Storage); `onVoiceNote` recibe audioUrl vacío. */
  soloTexto?: boolean
  /** Atajo opcional por si el contenedor quiere reemplazar el título del botón. */
  etiqueta?: string
  /** Aviso opcional de si está grabando o transcribiendo (Live lo usa para que el avatar ponga cara de escuchar). */
  onEstado?: (state: RecordState) => void
  /** Edición cliente: la transcripción no está configurada (falta la llave de Groq) → llevar a Ajustes › Voz. */
  onSinConfigurar?: () => void
}

export function VoiceInput({ onVoiceNote, disabled, soloTexto, etiqueta, onEstado, onSinConfigurar }: VoiceInputProps) {
  const [state, setState] = useState<RecordState>('idle')
  const avisar = useRef(onEstado); avisar.current = onEstado
  useEffect(() => { avisar.current?.(state) }, [state])
  const [seconds, setSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Qué falló, en una línea con el camino de SU sistema (29 oct 2026, un fundador en Windows: el botón se ponía rojo dos
  // segundos y volvía sin decir nada). Se queda hasta el siguiente intento o 9 s.
  const [aviso, setAviso] = useState<string | null>(null)
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fallar = useCallback((mensaje: string) => {
    setState('error')
    setAviso(mensaje)
    if (avisoTimer.current) clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => { setState('idle'); setSeconds(0); setAviso(null) }, 9000)
  }, [])
  useEffect(() => () => { if (avisoTimer.current) clearTimeout(avisoTimer.current) }, [])

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const startRecording = useCallback(async () => {
    if (avisoTimer.current) clearTimeout(avisoTimer.current)
    setAviso(null)
    try {
      // Justo a tiempo: el permiso de micrófono se pide al pulsar grabar, no al abrir la app.
      if (!(await asegurarPermiso('microfono'))) throw new Error(SIN_PERMISO_MAC)
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Sin MediaRecorder o mediaDevices')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // WebView2, Chrome y Edge graban webm/opus; Safari, mp4. Sin ninguno conocido, el navegador elige el suyo.
      const mimeType = formatoGrabacion((t) => MediaRecorder.isTypeSupported(t))
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start(100) // collect every 100ms
      setState('recording')
      setSeconds(0)

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (error) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      fallar(mensajeFalloMicrofono(error, plataformaDe(navigator.userAgent), isDesktopRuntime()))
    }
  }, [fallar])

  const sendRecording = useCallback(async () => {
    stopTimer()
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    setState('processing')

    // Stop recorder and collect final chunk
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    // Stop all tracks
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    // El tipo que de verdad grabó (el servidor elige la extensión por él).
    const grabado = tipoDeGrabacion(recorder.mimeType)
    const blob = new Blob(chunksRef.current, { type: grabado.tipo })
    chunksRef.current = []

    if (blob.size < 1000) {
      setState('idle')
      setSeconds(0)
      return
    }

    try {
      // 1. Upload to Supabase Storage (el dictado no guarda audio)
      let audioUrl = ''
      if (!soloTexto) {
        const supabase = createClient()
        const fileName = `voice-${Date.now()}.${grabado.nombre.split('.').pop()}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat-audio')
          .upload(fileName, blob, { contentType: grabado.tipo, upsert: false })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('chat-audio')
          .getPublicUrl(uploadData.path)
        audioUrl = urlData.publicUrl
      }

      // 2. Transcribe via Groq Whisper
      const form = new FormData()
      form.append('audio', blob, grabado.nombre)
      const res = await fetch('/api/chat/transcribe', { method: 'POST', body: form })

      if (!res.ok) {
        const fallo = await res.json().catch(() => null) as { code?: string; error?: string } | null
        if (onSinConfigurar && fallo?.code === 'stt_not_configured') { setState('idle'); setSeconds(0); onSinConfigurar(); return }
        fallar(mensajeFalloTranscripcion(res.status, fallo))
        return
      }
      const { text } = await res.json() as { text?: string }

      const transcription = text?.trim() || (soloTexto ? '' : '[Nota de voz sin transcripción]')

      setState('idle')
      setSeconds(0)
      onVoiceNote(transcription, audioUrl)
    } catch {
      fallar('No se pudo transcribir. Revisa tu conexión y vuelve a intentarlo.')
    }
  }, [onVoiceNote, soloTexto, onSinConfigurar, fallar])

  const handleClick = useCallback(() => {
    if (state === 'idle' || state === 'error') {
      startRecording()
    } else if (state === 'recording') {
      sendRecording()
    }
  }, [state, startRecording, sendRecording])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-1.5">
        {/* Duration */}
        <span className="text-[10px] font-mono text-red-400/80 tabular-nums min-w-[28px]">
          {formatTime(seconds)}
        </span>
        {/* Waveform pulses */}
        <div className="flex items-end gap-px h-4">
          {[3, 5, 7, 4, 6].map((h, i) => (
            <span
              key={i}
              className="w-0.5 bg-red-400/70 rounded-full animate-pulse"
              style={{ height: `${h}px`, animationDelay: `${i * 80}ms`, animationDuration: '700ms' }}
            />
          ))}
        </div>
        {/* Stop button */}
        <button
          onClick={handleClick}
          title={soloTexto ? 'Parar y transcribir' : 'Enviar nota de voz'}
          className="shrink-0 w-11 h-11 md:w-8 md:h-8 rounded-xl flex items-center justify-center bg-red-500/20 text-red-400 ring-1 ring-red-500/40 hover:bg-red-500/30 transition-all"
        >
          <Square size={11} className="fill-current" />
        </button>
      </div>
    )
  }

  return (
    <span className="relative inline-flex shrink-0">
    {aviso && (
      <span role="alert" className="absolute bottom-full right-0 z-30 mb-2 w-72 max-w-[80vw] rounded-xl border border-border-subtle bg-card px-3 py-2 text-left text-[12px] leading-snug text-foreground/85 shadow-lg">
        {aviso}
      </span>
    )}
    <button
      onClick={handleClick}
      disabled={disabled || state === 'processing'}
      aria-label={aviso ?? undefined}
      title={state === 'processing' ? 'Procesando…' : state === 'error' ? aviso ?? 'Error de micrófono' : etiqueta ?? (soloTexto ? 'Dictar' : 'Grabar nota de voz')}
      className={`
        shrink-0 w-11 h-11 md:w-8 md:h-8 rounded-xl flex items-center justify-center transition-all
        disabled:opacity-50 disabled:cursor-not-allowed
        ${state === 'processing'
          ? 'bg-violet-500/20 text-violet-400'
          : state === 'error'
            ? 'text-red-400/60'
            : 'text-muted/80 hover:text-foreground/70 hover:bg-card-hover'
        }
      `}
    >
      {state === 'processing'
        ? <Loader2 size={16} className="animate-spin md:w-[13px] md:h-[13px]" />
        : <Mic size={16} className="md:w-[13px] md:h-[13px]" />
      }
    </button>
    </span>
  )
}
