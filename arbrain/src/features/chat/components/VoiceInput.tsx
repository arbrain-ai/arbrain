'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { asegurarPermiso } from '@/features/permisos/lib/permisos'

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

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const startRecording = useCallback(async () => {
    try {
      // Justo a tiempo: el permiso de micrófono se pide al pulsar grabar, no al abrir la app.
      if (!(await asegurarPermiso('microfono'))) throw new Error('Micrófono sin permiso')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start(100) // collect every 100ms
      setState('recording')
      setSeconds(0)

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }, [])

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

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
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
        const fileName = `voice-${Date.now()}.webm`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat-audio')
          .upload(fileName, blob, { contentType: 'audio/webm', upsert: false })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('chat-audio')
          .getPublicUrl(uploadData.path)
        audioUrl = urlData.publicUrl
      }

      // 2. Transcribe via Groq Whisper
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/chat/transcribe', { method: 'POST', body: form })

      if (!res.ok) {
        const fallo = await res.json().catch(() => null) as { code?: string } | null
        if (onSinConfigurar && fallo?.code === 'stt_not_configured') { setState('idle'); setSeconds(0); onSinConfigurar(); return }
        throw new Error('STT failed')
      }
      const { text } = await res.json() as { text?: string }

      const transcription = text?.trim() || (soloTexto ? '' : '[Nota de voz sin transcripción]')

      setState('idle')
      setSeconds(0)
      onVoiceNote(transcription, audioUrl)
    } catch {
      setState('error')
      setTimeout(() => { setState('idle'); setSeconds(0) }, 2000)
    }
  }, [onVoiceNote, soloTexto, onSinConfigurar])

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
    <button
      onClick={handleClick}
      disabled={disabled || state === 'processing'}
      title={state === 'processing' ? 'Procesando…' : state === 'error' ? 'Error de micrófono' : etiqueta ?? (soloTexto ? 'Dictar' : 'Grabar nota de voz')}
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
  )
}
