'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Mic, Square, Maximize2, Minimize2, Loader2, Ear, EarOff, ScrollText } from 'lucide-react'
import { useVoiceLoop } from '../hooks/useVoiceLoop'
import { useWakeWord } from '../hooks/useWakeWord'
import { TranscriptPanel } from './TranscriptPanel'
import { Waveform } from './Waveform'
import { useCommandBrief } from '../hooks/useCommandBrief'
import type { CommandMetrics } from '../hooks/useCommandMetrics'
import type { CommandCenterState } from '../types'
import { LevyFace } from '@/features/chat/components/LevyFace'
import { Retrato } from '@/shared/components/Retrato'
import { Subtitles } from './Subtitles'
import { normalizePanel, type PanelKey } from './SecondaryPanel'

function fmtUsd(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US')
}

function fmtTokens(n?: number): string {
  if (n == null) return '—'
  return n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n)
}

/** Bloque de contexto en vivo inyectado en CADA turno: aterriza a Levy en datos reales + modo voz. */
function buildContext(m: CommandMetrics | null, state: CommandCenterState | null): string {
  const base = [
    'MODO: Command Center Live (voz). REGLA #1 — SÉ SOBRIO: responde SOLO lo que el usuario pide, nada más. ' +
    'Si saluda o hace small talk ("hola", "qué tal", "buenas"), responde con UNA frase breve y humana, SIN mencionar ' +
    'métricas, números, MRR, churn, leads, retención, embudo ni reportes. NUNCA ofrezcas un reporte de estatus ni ' +
    'recites datos del negocio a menos que te lo pidan EXPLÍCITAMENTE (ej. "dame el reporte", "cómo va el revenue", ' +
    '"cuántos leads"). Por defecto eres un copiloto conversacional y discreto, NO un dashboard que habla solo. ' +
    'No agregues "por cierto…" con datos que no te pidieron.',
    'Responde BREVE, para leerse en voz alta (1-3 frases). Cuando SÍ hables de un área del negocio porque te la ' +
    'preguntaron, emite el marcador en línea: [panel:revenue] [panel:funnel] [panel:community] [panel:content] o ' +
    '[panel:leads]. El marcador no se lee, solo cambia la pantalla.',
    'Para ABRIR/MOSTRAR una sección del Business OS o una página (ej: "abre el dashboard", "muéstrame el board", "abre ' +
    'los leads"), usa el NAVEGADOR via Playwright (navega a la ruta/URL). Conoces el mapa de rutas (ver CLAUDE.md). ' +
    'Di en voz alta qué estás abriendo mientras lo haces.',
  ]
  if (m) {
    base.push(
      'DATOS DISPONIBLES (referencia silenciosa — NO los recites sin que te pregunten; úsalos SOLO para responder con ' +
      'precisión SI el usuario pregunta por ellos): ' +
      `MRR ${fmtUsd(m.mrrCents)}, ${m.activeSubs} subs activas, ${m.cancelPending} cancel pending. ` +
      `Ventas 30d ${fmtUsd(m.newMrrCents30d)}. ` +
      `Funnel 30d: ${m.funnelVisits30d} visitas → ${m.funnelPayments30d} pagos (${m.funnelConversionPct30d.toFixed(1)}%). ` +
      `Leads: ${m.leadsCritical} critical, ${m.leadsHigh} high, ${m.leadsTotal} total. ` +
      `Activos: ${m.active1d} hoy / ${m.active7d} 7d / ${m.active30d} 30d. ` +
      `Snapshot ${m.metricDate ?? 'n/a'}. (No inventes otros números.)`
    )
  }
  // Inteligencia del cerebro: SOLO referencia, gated tras petición explícita.
  if (state) {
    base.push(
      `CONTEXTO INTERNO (no lo menciones salvo que pregunten por estatus, riesgo o acciones): ` +
      `lectura ${state.brief.headline}. Riesgo: ${state.brief.risk}. Acción #1: ${state.brief.nextAction}.`
    )
    if (state.actions?.length) {
      const top = state.actions.slice(0, 5).map((a) => `(${a.severity}/${a.source}) ${a.title} — ${a.detail}`).join(' | ')
      base.push(`COLA DE ACCIONES (solo si preguntan qué hacer / prioridades): ${top}`)
    }
    const sysFlags: string[] = []
    if (state.system?.bridgeStatus && state.system.bridgeStatus !== 'online') sysFlags.push(`bridge ${state.system.bridgeStatus}`)
    if (state.system?.failingJobs?.length) sysFlags.push(`${state.system.failingJobs.length} jobs fallando`)
    if (state.system?.tasksOverdue) sysFlags.push(`${state.system.tasksOverdue} tareas vencidas`)
    if (sysFlags.length) base.push(`SISTEMA (solo si preguntan por salud del sistema): ${sysFlags.join(', ')}.`)
  }
  return base.join('\n')
}

const STATUS_REPORT_PROMPT =
  'Dame el reporte de estatus del negocio ahora mismo. Cúbrelo en este orden, breve y hablado, ' +
  'emitiendo el marcador de panel correcto antes de cada sección: revenue & subs, embudo, ' +
  'comunidad & soporte, contenido/YouTube, y cierra con la acción #1 que mueve la aguja hoy. ' +
  'Usa los datos en vivo del contexto, no inventes números.'

export function CommandCenterLive({ headerAction }: { headerAction?: ReactNode } = {}) {
  const { state, metrics, error: briefError, refresh } = useCommandBrief()
  const metricsRef = useRef<CommandMetrics | null>(null)
  const stateRef = useRef<CommandCenterState | null>(null)
  useEffect(() => { metricsRef.current = metrics }, [metrics])
  useEffect(() => { stateRef.current = state }, [state])

  const [, setPanel] = useState<PanelKey>('overview')
  const [fullscreen, setFullscreen] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [clock, setClock] = useState('')
  const [speed, setSpeed] = useState(1) // velocidad de la voz: 1× / 1.5× / 2×

  const loop = useVoiceLoop({
    onPanel: (raw) => setPanel(normalizePanel(raw)),
    getContext: () => buildContext(metricsRef.current, stateRef.current),
  })
  const { status, transcript, response, toolEvents, latency, errorMsg, transcriptLog, usage, engineRef, segmentsRef, toggle, interrupt, sendText, pttStart, pttEnd, startListening, stopAndListen } = loop

  // Velocidad de la voz de Levy (1× / 1.5× / 2×). El AudioContext se crea perezosamente
  // (en el primer gesto), así que reaplicamos la velocidad guardada al cambiar de estado.
  const setRate = useCallback((r: number) => { setSpeed(r); engineRef.current?.setPlaybackRate(r) }, [engineRef])
  useEffect(() => { engineRef.current?.setPlaybackRate(speed) }, [speed, status, engineRef])

  // Wake word "Oye Levy" — "Levy" funciona como toggle de voz:
  //   idle      → decir "Levy" despierta y empieza a escuchar
  //   pensando  → decir "Levy" cancela la petición
  //   hablando  → decir "Levy" lo hace PARAR (interrumpe el audio)
  // Solo se apaga durante 'listening' (ahí el grabador es dueño del micrófono).
  const [wakeOn, setWakeOn] = useState(true)
  const statusRef = useRef(status)
  useEffect(() => { statusRef.current = status }, [status])
  const onIntent = useCallback((intent: 'wake' | 'stop') => {
    const s = statusRef.current
    if (intent === 'stop') { interrupt(); return }            // "Levy para" → parada total (deja de escuchar)
    if (s === 'speaking' || s === 'thinking') void stopAndListen() // "Levy" mientras habla → calla pero sigue escuchando
    else void startListening(false)                            // idle → despertar y escuchar
  }, [interrupt, stopAndListen, startListening])
  const wake = useWakeWord(onIntent, { enabled: wakeOn && status !== 'listening' })

  // Reloj (solo cliente, evita hydration mismatch)
  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Teclado: ESPACIO mantener = push-to-talk; ESC = interrumpir
  const spaceDownRef = useRef(false)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !spaceDownRef.current) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        spaceDownRef.current = true
        pttStart()
      } else if (e.code === 'Escape') {
        interrupt()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceDownRef.current) {
        e.preventDefault()
        spaceDownRef.current = false
        pttEnd()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [pttStart, pttEnd, interrupt])

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), [])

  const statusLabel = useMemo(() => ({
    idle: 'En reposo', listening: 'Escuchando', thinking: 'Procesando', speaking: 'Hablando', error: 'Error',
  }[status]), [status])

  const micBusy = status === 'thinking'
  // El loop está activo (escuchando / pensando / hablando) → mostrar la salida explícita "Parar".
  const loopActive = status === 'listening' || status === 'thinking' || status === 'speaking'

  return (
    <div
      data-cc-state={status}
      className={`cc-root ${fullscreen ? 'fixed inset-0 z-[100]' : 'relative h-full min-h-[560px] rounded-3xl overflow-hidden'} flex flex-col text-white`}
    >
      {/* Atmósfera por capas: glow teñido por estado + grid + vignette + grano */}
      <div className="cc-atmos" aria-hidden />
      <div className="cc-grid" aria-hidden />
      <div className="cc-vignette" aria-hidden />
      <div className="cc-noise" aria-hidden />

      {/* Top bar */}
      <div className="relative z-20 shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Retrato agente="levy" size={32} prioridad className="size-8 rounded-full object-cover" />
          <span className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.2em] sm:tracking-[0.3em] text-white/60 truncate">
            Levy · Live
          </span>
          <span className="cc-chip text-[9px] font-mono uppercase tracking-[0.18em]" role="status" aria-live="polite">
            <span className={`cc-chip-dot ${status === 'listening' || status === 'speaking' ? 'animate-pulse' : ''}`} aria-hidden />
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
          {wake.supported && (
            <button
              onClick={() => setWakeOn((v) => !v)}
              aria-pressed={wakeOn}
              className={`flex items-center gap-1.5 text-xs transition-colors ${wakeOn ? 'text-[#56bdf8]' : 'text-white/40 hover:text-white/70'}`}
              title={wakeOn ? 'Wake word "Oye Levy" activo' : 'Wake word apagado'}
              aria-label={wakeOn ? 'Desactivar wake word' : 'Activar wake word'}
            >
              {wakeOn ? <Ear size={14} /> : <EarOff size={14} />}
              <span className="hidden sm:inline font-mono uppercase tracking-wider">{wakeOn ? 'Oye Levy' : 'wake off'}</span>
            </button>
          )}
          <button
            onClick={() => setShowLog((v) => !v)}
            aria-expanded={showLog}
            className={`relative transition-colors ${showLog ? 'text-[#56bdf8]' : 'text-white/50 hover:text-white'}`}
            title="Ver conversación"
            aria-label="Ver conversación"
          >
            <ScrollText size={16} />
            {transcriptLog.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 text-[8px] font-mono bg-[#683ACC] text-white rounded-full px-1 leading-tight" aria-hidden>{transcriptLog.length}</span>
            )}
          </button>
          <span className="hidden sm:inline text-[10px] sm:text-xs font-mono tabular-nums text-white/50">{clock}</span>
          <button
            onClick={toggleFullscreen}
            className="text-white/50 hover:text-white transition-colors"
            title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {headerAction}
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center overflow-y-auto px-4 py-4">
        <button onClick={toggle} disabled={micBusy}
          aria-label={status === 'listening' ? 'Enviar lo dicho' : status === 'speaking' ? 'Interrumpir a Levy' : 'Hablar con Levy'}
          className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400"
          title="Hablar con Levy">
          <LevyFace engineRef={engineRef} segmentsRef={segmentsRef} status={status}
            className="w-[min(48vh,420px,72vw)] border border-white/10 shadow-[0_0_80px_rgba(139,92,246,0.12)]" />
        </button>
        <Waveform engineRef={engineRef} status={status} />
      </div>

      {/* Subtítulos + controles (bottom, en flujo) */}
      <div className="relative z-20 shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-2 bg-gradient-to-t from-black/70 via-black/40 to-transparent">
        <Subtitles engineRef={engineRef} segmentsRef={segmentsRef} status={status} transcript={transcript} response={response} error={errorMsg} />
        <div className="mt-2 sm:mt-3 flex items-center justify-center gap-3">
          {/* Mic / toggle */}
          <button
            onClick={toggle}
            disabled={micBusy}
            className={`cc-mic relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0
              ${status === 'listening' ? 'bg-[#56bdf8]/20 ring-2 ring-[#56bdf8] text-[#56bdf8] shadow-[0_0_28px_rgba(56,189,248,0.35)]'
                : status === 'speaking' ? 'bg-[#ff9101]/20 ring-2 ring-[#ff9101] text-[#ff9101] shadow-[0_0_28px_rgba(255,145,1,0.35)]'
                : 'bg-white/5 ring-1 ring-white/15 text-white/80 hover:bg-white/10 hover:ring-white/30'}`}
            title="Hablar (toca o mantén ESPACIO)"
            aria-label="Hablar"
          >
            {micBusy ? <Loader2 size={22} className="animate-spin" />
              : status === 'listening' || status === 'speaking' ? <Square size={20} className="fill-current" />
              : <Mic size={22} />}
            {(status === 'listening' || status === 'speaking') && (
              <span className="absolute inset-0 rounded-full animate-ping ring-1 ring-current opacity-30" aria-hidden />
            )}
          </button>

          {/* Parar: salida inequívoca del loop (= tecla ESC). Solo visible con el loop activo. */}
          {loopActive && (
            <button
              onClick={interrupt}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 h-12 rounded-full bg-red-500/15 ring-1 ring-red-500/40 text-sm font-medium text-red-200
                hover:bg-red-500/25 hover:ring-red-500/70 active:scale-[0.97] transition-all"
              title="Parar y volver a reposo (ESC)"
              aria-label="Parar"
            >
              <Square size={14} className="fill-current" />
              <span className="hidden sm:inline">Parar</span>
              <kbd className="hidden sm:inline text-[9px] font-mono text-red-200/50 ml-0.5">ESC</kbd>
            </button>
          )}

          {/* Status report (si el brief falló: reintentar en vez de spinner eterno) */}
          <button
            onClick={() => { if (metrics) void sendText(STATUS_REPORT_PROMPT); else void refresh() }}
            disabled={status === 'thinking' || status === 'listening' || (!metrics && !briefError)}
            className="px-4 sm:px-5 h-12 rounded-full bg-[#683ACC]/20 ring-1 ring-[#683ACC]/50 text-sm font-medium text-white/90
              hover:bg-[#683ACC]/35 hover:ring-[#683ACC]/80 hover:shadow-[0_0_24px_rgba(104,58,204,0.35)]
              active:scale-[0.97] transition-all disabled:opacity-40 disabled:hover:shadow-none"
            title={metrics ? 'Reporte de estatus hablado' : briefError ? 'No se pudieron cargar las métricas — reintentar' : 'Cargando métricas…'}
          >
            {metrics ? 'Reporte de estatus' : briefError ? 'Reintentar métricas' : (
              <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando métricas</span>
            )}
          </button>

          {/* Velocidad de la voz (1× / 1.5× / 2×) */}
          <div className="flex items-center gap-0.5 rounded-full bg-white/5 ring-1 ring-white/15 p-1" role="group" aria-label="Velocidad de la voz">
            {[1, 1.5, 2].map((r) => (
              <button
                key={r}
                onClick={() => setRate(r)}
                aria-pressed={speed === r}
                className={`px-2 sm:px-2.5 h-9 rounded-full text-xs font-mono tabular-nums transition-colors ${
                  speed === r
                    ? 'bg-[#ff9101]/25 text-[#ff9101] ring-1 ring-[#ff9101]/60'
                    : 'text-white/55 hover:text-white/90'
                }`}
                title={`Velocidad de la voz ${r}×`}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>

        {/* Latencia (QA / smooth check) */}
        <div className="mt-2 sm:mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-x-4 text-[10px] font-mono text-white/35 tabular-nums min-h-[14px]">
          {latency.sttMs != null && <span className="cc-fade">STT {latency.sttMs}ms</span>}
          {latency.firstTokenMs != null && <span className="cc-fade">1er token {latency.firstTokenMs}ms</span>}
          {latency.firstAudioMs != null && (
            <span className={`cc-fade ${latency.firstAudioMs < 1200 ? 'text-[#22c55e]' : 'text-[#ff9101]'}`}>
              1er audio {latency.firstAudioMs}ms
            </span>
          )}
          {usage.contextTotal != null && (
            <span className="cc-fade text-[#8b5cf6]" title="Contexto de Levy usado / total">
              ctx {fmtTokens(usage.contextUsed)}/{fmtTokens(usage.contextTotal)}
            </span>
          )}
        </div>
      </div>

      {/* Panel de conversación expandible */}
      {showLog && (
        <TranscriptPanel log={transcriptLog} liveResponse={response} onClose={() => setShowLog(false)} />
      )}
    </div>
  )
}
