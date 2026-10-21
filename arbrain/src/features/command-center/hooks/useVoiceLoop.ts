'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from '../lib/audio-engine'
import { SentenceSplitter, inferPanel } from '../lib/sentence-splitter'
import { asegurarPermiso } from '@/features/permisos/lib/permisos'

export type LoopStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface ToolEvent {
  id: string
  name: string
  status: 'running' | 'done'
  ts: number
  input?: string // JSON parcial del input de la tool (archivo, comando, skill, etc.)
}

export interface TranscriptEntry {
  role: 'user' | 'levy'
  text: string
  ts: number
}

export interface LatencyMetrics {
  speechEnd?: number
  sttMs?: number       // tiempo de transcripción
  firstTokenMs?: number // desde envío a primer token del modelo
  firstAudioMs?: number // desde fin del habla del user a primer audio TTS (LA métrica clave)
  totalMs?: number
}

interface SSEEvent {
  type: string
  text?: string
  toolName?: string
  toolId?: string
  partial?: string
  status?: string
  message?: string
  sessionId?: string
  contextUsed?: number
  contextTotal?: number
}

interface UseVoiceLoopOpts {
  onPanel?: (panel: string) => void
  getContext?: () => string | undefined
  effort?: string
  /** Endpoint del cerebro. Default carril rápido Groq. Cambiar a /api/chat/stream para Levy profundo (tools). */
  endpoint?: string
}

/** Quita marcadores de coreografía del texto que se muestra en subtítulos. */
function stripMarkers(s: string): string {
  return s.replace(/\[panel:[a-z0-9_-]+\]/gi, '').replace(/\s{2,}/g, ' ').trimStart()
}

const SILENCE_MS = 1500         // silencio tras hablar → enviar (duplicado para no cortar a media idea)
const SPEECH_START_LEVEL = 0.06 // nivel mic para considerar que empezó a hablar
const SILENCE_LEVEL = 0.035     // por debajo = silencio
const NO_SPEECH_MS = 9000       // en modo conversación, si NO hablas en este tiempo → vuelve a reposo (NO procesa)

export function useVoiceLoop(opts: UseVoiceLoopOpts = {}) {
  const [status, setStatus] = useState<LoopStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [latency, setLatency] = useState<LatencyMetrics>({})
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [armed, setArmed] = useState(false) // audio desbloqueado por gesto del usuario
  const [transcriptLog, setTranscriptLog] = useState<TranscriptEntry[]>([]) // historial de la conversación (panel expandible)
  const [usage, setUsage] = useState<{ contextUsed?: number; contextTotal?: number }>({}) // tokens de contexto del último turno

  const engineRef = useRef<AudioEngine | null>(null)
  // Opener hablado pre-cacheado → primer audio instantáneo mientras se genera el contenido real
  const openerBytesRef = useRef<ArrayBuffer | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sdkSessionRef = useRef<string | null>(null)
  // Sesión de chat persistente: agrupa TODOS los turnos de voz en UNA conversación visible en /chat.
  const chatSessionIdRef = useRef<string | null>(null)

  // VAD
  const vadRafRef = useRef(0)
  const speechSeenRef = useRef(false)
  const silenceStartRef = useRef(0)
  const listeningRef = useRef(false)
  const pttRef = useRef(false) // push-to-talk activo (ignora VAD auto-stop)
  const listenStartRef = useRef(0) // cuándo empezó a escuchar (para timeout de no-voz)
  // Modo conversación: tras hablar, queda escuchando automáticamente
  const conversationRef = useRef(true)
  const streamDoneRef = useRef(true) // el stream del turno terminó (evita auto-listen en huecos de TTS)
  const startListeningRef = useRef<((ptt?: boolean) => Promise<void>) | null>(null)

  // Latencia
  const tSpeechEndRef = useRef(0)
  const tSendRef = useRef(0)
  const firstAudioSeenRef = useRef(false)
  const firstTokenSeenRef = useRef(false)

  // ─── Engine lifecycle ──────────────────────────────────────────────────────
  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine({
        onBargeIn: () => { void handleBargeIn() },
        onSpeakEnd: () => {
          setStatus((s) => (s === 'speaking' ? 'idle' : s))
          setLatency((l) => ({ ...l, totalMs: tSpeechEndRef.current ? Math.round(performance.now() - tSpeechEndRef.current) : l.totalMs }))
          // Modo conversación: al terminar de hablar (y con el stream ya cerrado), vuelve a escuchar.
          if (conversationRef.current && streamDoneRef.current) {
            setTimeout(() => { void startListeningRef.current?.(false) }, 250)
          }
        },
      })
    }
    return engineRef.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const OPENER_TEXT = 'A ver.'

  // Prefetch del opener (solo bytes; no necesita AudioContext) — corre al montar
  useEffect(() => {
    let cancelled = false
    fetch('/api/chat/tts-fast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: OPENER_TEXT }) })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => { if (!cancelled && b) openerBytesRef.current = b })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  /** Desbloquea el AudioContext (debe venir de un click/tap) + pre-cachea el opener. */
  const arm = useCallback(async () => {
    const engine = ensureEngine()
    await engine.resume()
    if (openerBytesRef.current) engine.primeOpener(openerBytesRef.current)
    setArmed(true)
  }, [ensureEngine])

  // ─── TTS por oración (ordenado, fetches en paralelo, enqueue en orden) ──────
  const ttsChainRef = useRef<Promise<void>>(Promise.resolve())
  const ttsAbortRef = useRef<AbortController | null>(null)
  // Disponibilidad del carril TTS rápido (ElevenLabs). null=por probar, true/false=conocido.
  const fastTtsRef = useRef<boolean | null>(null)
  // Oraciones habladas (en orden de encolado) → resaltado karaoke. El timing real
  // lo aporta el engine (spokenSegments + activeFraction del elemento que suena),
  // así el resaltado queda en sync a cualquier velocidad sin recálculos.
  const segmentsRef = useRef<{ text: string }[]>([])

  const fetchTts = useCallback(async (sentence: string, signal?: AbortSignal): Promise<ArrayBuffer | null> => {
    const body = JSON.stringify({ text: sentence })
    // Intento carril rápido (ElevenLabs Flash) salvo que ya sepamos que no está disponible
    if (fastTtsRef.current !== false) {
      try {
        const r = await fetch('/api/chat/tts-fast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal })
        if (r.ok) { fastTtsRef.current = true; return await r.arrayBuffer() }
        if (r.status === 503 || r.status === 403) fastTtsRef.current = false // no configurado → no reintentar
      } catch { /* cae a LemonFox */ }
    }
    // Fallback LemonFox
    try {
      const r = await fetch('/api/chat/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal })
      return r.ok ? await r.arrayBuffer() : null
    } catch { return null }
  }, [])

  const speakSentence = useCallback((sentence: string) => {
    const engine = engineRef.current
    if (!engine || !sentence) return
    const ac = ttsAbortRef.current
    const fetchP = fetchTts(sentence, ac?.signal)

    ttsChainRef.current = ttsChainRef.current
      .then(() => fetchP)
      .then(async (buf) => {
        if (!buf) return
        if (!firstAudioSeenRef.current) {
          firstAudioSeenRef.current = true
          const fa = tSpeechEndRef.current ? Math.round(performance.now() - tSpeechEndRef.current) : undefined
          setLatency((l) => ({ ...l, firstAudioMs: fa }))
        }
        setStatus('speaking')
        // El orden de encolado = orden de push (la cadena ttsChain es secuencial),
        // así el índice del engine (spokenSegments) mapea 1:1 con este array.
        engine.enqueueSentence(buf)
        segmentsRef.current.push({ text: sentence })
      })
      .catch(() => {})
  }, [fetchTts])

  // ─── Stream al agente + parsing SSE + sentence splitting ────────────────────
  const splitterRef = useRef(new SentenceSplitter())
  const lastPanelRef = useRef<string | null>(null)

  const runStream = useCallback(async (text: string) => {
    setResponse('')
    setToolEvents([])
    splitterRef.current.reset()
    segmentsRef.current = []
    lastPanelRef.current = null
    streamDoneRef.current = false
    firstAudioSeenRef.current = false
    firstTokenSeenRef.current = false
    ttsChainRef.current = Promise.resolve()
    ttsAbortRef.current = new AbortController()
    abortRef.current = new AbortController()
    tSendRef.current = performance.now()
    setStatus('thinking')
    setTranscriptLog((prev) => [...prev, { role: 'user' as const, text, ts: Date.now() }].slice(-60))

    // Opener hablado instantáneo: primer audio < ~150ms mientras el LLM+TTS generan el contenido.
    if (engineRef.current?.hasOpener) {
      engineRef.current.playOpener()
      firstAudioSeenRef.current = true
      setStatus('speaking')
      setLatency((l) => ({ ...l, firstAudioMs: tSpeechEndRef.current ? Math.round(performance.now() - tSpeechEndRef.current) : l.firstAudioMs }))
    }

    const source = typeof window !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
    // Cerebro = ClaudeClaw (el mismo Levy/Claude del chat). Más listo que el carril Groq.
    const endpoint = opts.endpoint ?? '/api/chat/stream'

    // Crear (una vez) la sesión de chat para agrupar todos los turnos de voz en /chat.
    if (!chatSessionIdRef.current) {
      try {
        const r = await fetch('/api/chat/sessions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `🎙️ ${text.slice(0, 48)}`, firstMessage: text }),
        })
        const j = await r.json().catch(() => ({})) as { session?: { id?: string } }
        if (j?.session?.id) chatSessionIdRef.current = j.session.id
      } catch { /* sin sesión → ClaudeClaw crea una por turno (degradación) */ }
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          source,
          ...(opts.effort && { effort: opts.effort }),
          ...(sdkSessionRef.current && { sdkSessionId: sdkSessionRef.current }),
          ...(chatSessionIdRef.current && { chatSessionId: chatSessionIdRef.current }),
          ...(opts.getContext?.() && { context: opts.getContext() }),
        }),
        signal: abortRef.current.signal,
      })

      if (res.status === 401) { window.location.href = '/login'; return }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'Error de conexión' }))
        setErrorMsg(data.error || 'Error de conexión')
        setStatus('error')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          let ev: SSEEvent
          try { ev = JSON.parse(data) as SSEEvent } catch { continue }

          switch (ev.type) {
            case 'init':
              if (ev.sessionId) sdkSessionRef.current = ev.sessionId
              break
            case 'text_delta': {
              if (!firstTokenSeenRef.current) {
                firstTokenSeenRef.current = true
                setLatency((l) => ({ ...l, firstTokenMs: Math.round(performance.now() - tSendRef.current) }))
              }
              const t = ev.text ?? ''
              acc += t
              setResponse(stripMarkers(acc))
              const { sentences, panels } = splitterRef.current.push(t)
              for (const s of sentences) speakSentence(s)
              if (panels.length) {
                for (const p of panels) { if (p !== lastPanelRef.current) { lastPanelRef.current = p; opts.onPanel?.(p) } }
              } else {
                // Fallback determinista: inferir panel por keywords de cada oración hablada
                for (const s of sentences) {
                  const inferred = inferPanel(s)
                  if (inferred && inferred !== lastPanelRef.current) { lastPanelRef.current = inferred; opts.onPanel?.(inferred) }
                }
              }
              break
            }
            case 'tool_start':
              setToolEvents((prev) => [...prev, { id: ev.toolId ?? `${Date.now()}`, name: ev.toolName ?? 'tool', status: 'running' as const, ts: Date.now(), input: '' }].slice(-40))
              break
            case 'tool_input_delta':
              setToolEvents((prev) => prev.map((e) => (e.id === ev.toolId ? { ...e, input: (e.input ?? '') + (ev.partial ?? '') } : e)))
              break
            case 'tool_done':
              setToolEvents((prev) => prev.map((e) => (e.id === ev.toolId ? { ...e, status: 'done' as const } : e)))
              break
            case 'usage':
              if (ev.contextUsed != null || ev.contextTotal != null) setUsage({ contextUsed: ev.contextUsed, contextTotal: ev.contextTotal })
              break
            case 'result': {
              const finalText = (ev.text || acc).trim()
              acc = finalText
              setResponse(stripMarkers(finalText))
              const tail = splitterRef.current.flush()
              if (tail) speakSentence(tail)
              if (finalText) setTranscriptLog((prev) => [...prev, { role: 'levy' as const, text: stripMarkers(finalText), ts: Date.now() }].slice(-60))
              // Persistir en la sesión de chat (el loop de voz no usa onSave; sin esto /chat sale vacío).
              if (finalText && chatSessionIdRef.current) {
                fetch(`/api/chat/sessions/${encodeURIComponent(chatSessionIdRef.current)}/messages`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messages: [
                    { role: 'user', content: text },
                    { role: 'assistant', content: stripMarkers(finalText) },
                  ] }),
                }).catch(() => {})
              }
              break
            }
            case 'error':
              setErrorMsg(ev.message || 'Error del agente')
              setStatus('error')
              break
          }
        }
      }
      // Stream cerrado: ya se encolaron todas las oraciones. Habilita auto-listen al terminar el audio.
      streamDoneRef.current = true
      // Si no hubo audio (respuesta vacía), volver a escuchar (o reposo).
      if (!firstAudioSeenRef.current) {
        if (conversationRef.current) { void startListeningRef.current?.(false) }
        else setStatus('idle')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      streamDoneRef.current = true
      setErrorMsg('La conexión se interrumpió.')
      setStatus('error')
    }
  }, [opts, speakSentence])

  // ─── STT: blob → texto → stream ─────────────────────────────────────────────
  const transcribeAndRun = useCallback(async (blob: Blob) => {
    if (blob.size < 1200) { setStatus('idle'); return }
    setStatus('thinking')
    const tStt = performance.now()
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/chat/transcribe', { method: 'POST', body: form })
      if (!res.ok) throw new Error('STT failed')
      const { text } = (await res.json()) as { text?: string }
      const clean = text?.trim() ?? ''
      setLatency((l) => ({ ...l, sttMs: Math.round(performance.now() - tStt) }))
      if (!clean) { setStatus('idle'); return }
      setTranscript(clean)
      await runStream(clean)
    } catch {
      setErrorMsg('No se pudo transcribir el audio.')
      setStatus('error')
    }
  }, [runStream])

  // ─── Captura de micrófono + VAD ─────────────────────────────────────────────
  const stopVad = useCallback(() => {
    cancelAnimationFrame(vadRafRef.current)
    listeningRef.current = false
  }, [])

  const finishListening = useCallback(async () => {
    if (!listeningRef.current && status !== 'listening') {
      // ya cerrado
    }
    stopVad()
    tSpeechEndRef.current = performance.now()
    setLatency({ speechEnd: tSpeechEndRef.current })
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') { setStatus('idle'); return }
    await new Promise<void>((resolve) => { recorder.onstop = () => resolve(); recorder.stop() })
    streamRef.current?.getTracks().forEach((t) => t.stop())
    engineRef.current?.detachMic()
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    chunksRef.current = []
    void transcribeAndRun(blob)
  }, [status, stopVad, transcribeAndRun])

  /** Cancela la escucha SIN procesar (no hubo voz) → vuelve a reposo. */
  const cancelListening = useCallback(() => {
    stopVad()
    listeningRef.current = false
    try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop() } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    engineRef.current?.detachMic()
    chunksRef.current = []
    setStatus('idle')
  }, [stopVad])

  const startListening = useCallback(async (pushToTalk = false) => {
    setErrorMsg(null)
    const engine = ensureEngine()
    await engine.resume()
    // Si Levy está hablando, lo cortamos (nueva interacción)
    engine.stopPlayback()
    ttsAbortRef.current?.abort()

    try {
      if (!(await asegurarPermiso('microfono'))) throw new Error('Micrófono sin permiso: actívalo en Ajustes → Permisos')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      streamRef.current = stream
      await engine.attachMic(stream)

      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm',
      })
      recorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(100)

      listeningRef.current = true
      pttRef.current = pushToTalk
      speechSeenRef.current = false
      silenceStartRef.current = 0
      listenStartRef.current = performance.now()
      setStatus('listening')

      // VAD loop (solo auto-stop si NO es push-to-talk)
      const tick = () => {
        if (!listeningRef.current) return
        const lvl = engine.micLevel
        if (!pttRef.current) {
          if (lvl > SPEECH_START_LEVEL) {
            speechSeenRef.current = true
            silenceStartRef.current = 0
          } else if (speechSeenRef.current && lvl < SILENCE_LEVEL) {
            // Ya habló y se calló → tras el silencio, ENVIAR (solo aquí se envía).
            if (silenceStartRef.current === 0) silenceStartRef.current = performance.now()
            else if (performance.now() - silenceStartRef.current > SILENCE_MS) {
              void finishListening()
              return
            }
          } else if (!speechSeenRef.current && performance.now() - listenStartRef.current > NO_SPEECH_MS) {
            // NO habló en todo el tiempo → cancelar SIN procesar (no envía nada).
            cancelListening()
            return
          }
        }
        vadRafRef.current = requestAnimationFrame(tick)
      }
      vadRafRef.current = requestAnimationFrame(tick)
    } catch {
      setErrorMsg('No se pudo acceder al micrófono.')
      setStatus('error')
    }
  }, [ensureEngine, finishListening, cancelListening])

  // Mantener una referencia viva a startListening para el auto-listen del onSpeakEnd del engine.
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // ─── Tab switch (visibilitychange) ──────────────────────────────────────────
  // Al pasar a otra pestaña, el navegador CONGELA los requestAnimationFrame (orbe,
  // VAD, barge-in) pero performance.now() sigue corriendo. Al volver, el VAD veía
  // "9s sin hablar" y se autocancelaba a reposo (= "se pausa y se borra"). Aquí, al
  // volver: reanudamos el AudioContext y reseteamos las marcas de tiempo del VAD para
  // que NO disparen los timeouts de silencio/no-voz con el tiempo acumulado en bg.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      // 1) Reanuda el AudioContext (algunos navegadores lo suspenden en bg).
      void engineRef.current?.resume()
      // 2) Re-ancla los relojes del VAD al "ahora" para que el tiempo transcurrido con
      //    la pestaña oculta NO dispare el auto-cancel por no-voz ni el envío por silencio.
      //    El loop rAF del VAD (definido en startListening) se reanuda solo al volver el
      //    foco; NO lo tocamos para no romper su cadena de frames.
      if (listeningRef.current) {
        const now = performance.now()
        listenStartRef.current = now
        if (silenceStartRef.current !== 0) silenceStartRef.current = now
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ─── Barge-in: usuario interrumpe a Levy ────────────────────────────────────
  const handleBargeIn = useCallback(async () => {
    engineRef.current?.stopPlayback()
    ttsAbortRef.current?.abort()
    abortRef.current?.abort()
    // Detener el karaoke: sin esto el resaltado sigue avanzando con oraciones ya agendadas.
    segmentsRef.current = []
    setResponse('')
    fetch('/api/chat/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sdkSessionRef.current }),
    }).catch(() => {})
    await startListening(false)
  }, [startListening])

  /** Interrumpe todo y vuelve a idle (ESC / botón stop). */
  const interrupt = useCallback(() => {
    stopVad()
    listeningRef.current = false
    engineRef.current?.stopPlayback()
    ttsAbortRef.current?.abort()
    abortRef.current?.abort()
    // Detener el karaoke al cortar (sin esto sigue revelando palabras ya agendadas).
    segmentsRef.current = []
    setResponse('')
    try {
      recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop()
    } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    engineRef.current?.detachMic()
    fetch('/api/chat/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sdkSessionRef.current }),
    }).catch(() => {})
    setStatus('idle')
  }, [stopVad])

  /** Envía texto directamente (status report, input tecleado) saltando STT. */
  const sendText = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t) return
    await arm()
    engineRef.current?.stopPlayback()
    tSpeechEndRef.current = performance.now()
    setLatency({ speechEnd: tSpeechEndRef.current })
    setTranscript(t)
    await runStream(t)
  }, [arm, runStream])

  // Push-to-talk handlers
  const pttStart = useCallback(() => { void startListening(true) }, [startListening])
  const pttEnd = useCallback(() => { void finishListening() }, [finishListening])

  // Toggle (tap mic): si idle → escuchar (VAD); si escuchando → enviar; si hablando → interrumpir
  const toggle = useCallback(() => {
    if (status === 'idle' || status === 'error') void startListening(false)
    else if (status === 'listening') void finishListening()
    else if (status === 'speaking' || status === 'thinking') interrupt()
  }, [status, startListening, finishListening, interrupt])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(vadRafRef.current)
      abortRef.current?.abort()
      ttsAbortRef.current?.abort()
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [])

  return {
    status, transcript, response, toolEvents, latency, errorMsg, armed, transcriptLog, usage,
    engineRef, segmentsRef,
    arm, startListening, finishListening, pttStart, pttEnd, toggle, interrupt, sendText,
    stopAndListen: handleBargeIn, // parar de hablar pero seguir escuchando
  }
}
