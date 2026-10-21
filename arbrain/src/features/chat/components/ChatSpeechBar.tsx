'use client'
import { useSyncExternalStore } from 'react'
import { SkipBack, SkipForward, Play, Pause, X, Zap } from 'lucide-react'
import { chatSpeech, type SpeechState } from '../lib/chat-speech'
import {
  AudioBarFrame,
  BTN_CERRAR,
  BTN_PLAY,
  BTN_SALTO,
  BTN_VELOCIDAD,
  TXT_CONTADOR,
} from './AudioBarChrome'

// Referencia ESTABLE para SSR y estado inactivo (Object.is en useSyncExternalStore).
const INACTIVE: SpeechState = { active: false, id: null, paused: false, rate: 1, idx: 0, total: 0, despierto: false }

/**
 * Barra de lectura por voz del chat — MISMO diseño que la GlobalAudioBar (pegada bajo el
 * header, en el flujo, no flotante; marco compartido en AudioBarChrome): un renglón con el
 * contador a la izquierda, los controles centrados en el hilo y la ✕ a la derecha
 * (1 oct 2026: se recuperó la simetría de antes del 30 sep).
 * velocidad (1x→1.25→1.5→1.75→2) · ⏮ párrafo anterior · ⏯ pausa/play · ⏭ siguiente · ✕ cerrar.
 */
// El aviso de pantalla solo importa donde la pantalla se duerme sola a los segundos:
// el teléfono. En escritorio sería ruido (y ahí la API tampoco hace falta).
const tactil = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export function ChatSpeechBar() {
  const state = useSyncExternalStore(
    (cb) => (chatSpeech ? chatSpeech.subscribe(cb) : () => {}),
    () => (chatSpeech ? chatSpeech.getState() : INACTIVE),
    () => INACTIVE,
  )

  // Un documento del panel lleva sus controles en su propia pestaña (lo que vive en el panel no se pinta otra vez en el chat).
  if (!chatSpeech || !state.active || state.id?.startsWith('doc:')) return null

  const fmtRate = (r: number) => r.toFixed(2).replace(/\.?0+$/, '') + 'x'
  const pct = state.total > 0 ? ((state.idx + 1) / state.total) * 100 : 0
  const speedColor = state.rate === 1 ? 'text-muted' : state.rate >= 1.75 ? 'text-amber-400' : 'text-brand-ink'

  return (
    <AudioBarFrame
      izquierda={
        <span className={TXT_CONTADOR} title="Párrafo">
          {state.idx + 1}/{state.total}
        </span>
      }
      velocidad={
        <button
          onClick={() => chatSpeech.cycleRate()}
          className={`${BTN_VELOCIDAD} ${speedColor}`}
          title="Velocidad"
        >
          <Zap size={11} />
          {fmtRate(state.rate)}
        </button>
      }
      controles={
        <>
          <button
            onClick={() => chatSpeech.prev()}
            className={BTN_SALTO}
            title="Párrafo anterior"
          >
            <SkipBack size={18} />
          </button>
          <button
            onClick={() => chatSpeech.pauseResume()}
            className={BTN_PLAY}
            title={state.paused ? 'Reanudar (Ctrl+Espacio)' : 'Pausar (Ctrl+Espacio)'}
          >
            {state.paused ? (
              <Play size={20} className="fill-current ml-0.5" />
            ) : (
              <Pause size={20} className="fill-current" />
            )}
          </button>
          <button
            onClick={() => chatSpeech.next()}
            className={BTN_SALTO}
            title="Párrafo siguiente"
          >
            <SkipForward size={18} />
          </button>
        </>
      }
      derecha={
        <button onClick={() => chatSpeech.stop()} className={BTN_CERRAR} title="Cerrar">
          <X size={18} />
        </button>
      }
      /* Progreso por párrafos (no interactivo: la voz no es scrubbeable) */
      progreso={
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-card-active">
          <div
            className="h-full rounded-r-full bg-gradient-to-r from-brand to-brand-ink"
            style={{ width: `${pct}%`, transition: 'width 200ms' }}
          />
        </div>
      }
      /* Si no se pudo retener la pantalla (Modo de Bajo Consumo la niega, y navegadores
         viejos no traen la API), iOS la va a dormir sola en cuanto dejes de tocar — y
         con ella el JS que mueve el resaltado. La voz sigue, el naranja se queda. Se
         avisa para que no parezca que el lector se rompió. */
      aviso={
        !state.paused && !state.despierto && tactil() ? (
          <div className="chat-prose px-4 pb-2.5 text-center">
            <p className="text-[10px] text-amber-500/80 leading-snug">
              No pude mantener la pantalla encendida (¿Modo de Bajo Consumo?). Si se apaga,
              la voz sigue pero el resaltado se queda atrás.
            </p>
          </div>
        ) : null
      }
    />
  )
}
