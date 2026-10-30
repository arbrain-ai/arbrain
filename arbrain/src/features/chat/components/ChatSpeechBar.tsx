'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { SkipBack, SkipForward, Play, Pause, X, Zap } from 'lucide-react'
import { chatSpeech, type SpeechState } from '../lib/chat-speech'
import { avisoGroqMostrado, avisoGroqVisible, cerrarAvisoGroq, suscribirAvisoGroq } from '../lib/aviso-groq-lector'
import { MARCA_DESDE_MIC } from '@/features/primer-arranque/lib/llaves'
import { useAjustes } from '@/shared/stores/ajustes-store'
import {
  AudioBarFrame,
  BTN_CERRAR,
  BTN_PLAY,
  BTN_SALTO,
  BTN_VELOCIDAD,
  TXT_CONTADOR,
} from './AudioBarChrome'

// Referencia ESTABLE para SSR y estado inactivo (Object.is en useSyncExternalStore).
const INACTIVE: SpeechState = { active: false, id: null, paused: false, rate: 1, idx: 0, total: 0, despierto: false, resumen: false }

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

  const avisoGroq = useSyncExternalStore(suscribirAvisoGroq, avisoGroqVisible, () => false)
  // El aviso de Groq se dice una vez: queda anotado cuando esta barra lo pinta y se va al cerrar el lector.
  const pintaAviso = avisoGroq && state.active && !state.id?.startsWith('doc:')
  useEffect(() => { if (pintaAviso) avisoGroqMostrado() }, [pintaAviso])
  useEffect(() => { if (!state.active) cerrarAvisoGroq() }, [state.active])

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
        // LemonFox sin llave de Groq (29 oct 2026): una vez, cómo hacer que el resaltado siga la voz exacto. Mismo camino
        // que el micrófono sin llave: la marca de sesión hace que Ajustes › Voz salude con el porqué.
        avisoGroq ? (
          <div className="chat-prose flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pb-2.5 text-center" role="status">
            <p className="text-[11px] leading-snug text-muted">
              Con una llave gratis de Groq, el resaltado sigue la voz palabra por palabra. Créala en console.groq.com/keys
              y pégala en Arbrain › Ajustes › Voz (nunca en el chat).
            </p>
            <span className="flex gap-2">
              <button
                type="button"
                className="text-[11px] font-medium text-brand-ink hover:underline"
                onClick={() => {
                  try { sessionStorage.setItem(MARCA_DESDE_MIC, 'lector') } catch { /* sin storage */ }
                  cerrarAvisoGroq()
                  useAjustes.getState().abrir('voz')
                }}
              >
                Abrir Ajustes › Voz
              </button>
              <button type="button" className="text-[11px] text-muted hover:text-foreground/75" onClick={cerrarAvisoGroq}>
                Ahora no
              </button>
            </span>
          </div>
        ) : !state.paused && !state.despierto && tactil() ? (
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
