'use client'
/**
 * «Escuchar» en la pestaña de un documento (7 oct 2026): lee el .html, .md o .txt abierto con la voz del dispositivo y
 * resalta la palabra que suena DENTRO del documento. En reposo es un botón discreto flotando arriba a la derecha, a un
 * lado del «tema» (el que pinta el propio documento). Al darle play aparece la MISMA barra del chat (AudioBarChrome:
 * contador, velocidad, anterior, play/pausa, siguiente, progreso) en una franja propia del flujo, entre la tira de pestañas y el documento (no lo tapa);
 * anterior/siguiente saltan de bloque (párrafo o encabezado). Tocar un párrafo del documento también salta ahí. Todo el trabajo vive en
 * documento/lector-documento.ts; el motor de voz es el del chat.
 *
 * Cómo se queda junto a «tema»: el script inyectado en el HTML (lector-agente.ts) mide ese botón y avisa cuánto espacio
 * dejar a la derecha (`arbrain-lector-ancla`); sin botón de tema, la píldora ocupa la esquina.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Loader2, Pause, Play, SkipBack, SkipForward, Volume2, X, Zap } from 'lucide-react'
import { chatSpeech } from '@/features/chat/lib/chat-speech'
import { AudioBarFrame, BTN_CERRAR, BTN_PLAY, BTN_SALTO, BTN_VELOCIDAD, TXT_CONTADOR } from '@/features/chat/components/AudioBarChrome'
import { alternarLectura, guardarVelocidad, idLector, sePuedeEscuchar, usePreparando, type ResultadoLector } from '../documento/lector-documento'
import type { Fijada } from './fijadas'
import s from './panel.module.css'

const ESQUINA = 15 // px desde el borde derecho del marco: donde el documento pone su botón «tema» (14 px + borde)

const AVISO: Partial<Record<ResultadoLector, string>> = {
  vacio: 'No encontré texto que leer en este documento.',
  'sin-fuente': 'Espera a que el documento termine de abrirse (o sal del modo edición).',
  'sin-respuesta': 'El documento no respondió. Vuelve a abrirlo e intenta otra vez.',
}

const fmt = (r: number) => r.toFixed(2).replace(/\.?0+$/, '') + 'x'
// Cada getSnapshot devuelve un primitivo: estable bajo Object.is (lección del chat: nada de objetos nuevos por llamada).
const usaMotor = <T,>(leer: () => T, vacio: T) => useSyncExternalStore((cb) => (chatSpeech ? chatSpeech.subscribe(cb) : () => {}), leer, () => vacio)

/** Espacio (px del documento) que el HTML pide dejar a su derecha: 0 si no tiene botón de tema. */
function useAncla(fijadaId: string) {
  const [der, setDer] = useState(0)
  useEffect(() => {
    const al = (e: MessageEvent) => {
      if (e.data?.tipo !== 'arbrain-lector-ancla' || typeof e.data.der !== 'number') return
      const marco = document.querySelector<HTMLIFrameElement>(`[data-fijada="${CSS.escape(fijadaId)}"] iframe[data-lector]`)
      if (marco && e.source === marco.contentWindow) setDer(Math.max(0, Math.min(400, e.data.der)))
    }
    window.addEventListener('message', al)
    return () => window.removeEventListener('message', al)
  }, [fijadaId])
  return der
}

export function EscucharDocumento({ f }: { f: Fijada }) {
  const id = idLector(f.id)
  const activo = usaMotor(() => chatSpeech.getState().id === id, false)
  const pausado = usaMotor(() => chatSpeech.getState().paused, false)
  const rate = usaMotor(() => chatSpeech.getState().rate, 1)
  const idx = usaMotor(() => chatSpeech.getState().idx, 0)
  const total = usaMotor(() => chatSpeech.getState().total, 0)
  const preparando = usePreparando(f.id)
  const ancla = useAncla(f.id)
  const [aviso, setAviso] = useState<string | null>(null)
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t) }, [aviso])
  // Si la pestaña desaparece leyendo, callar: el motor no debe seguir sobre un documento que ya no está.
  useEffect(() => () => { if (chatSpeech?.isActive(id)) chatSpeech.stop() }, [id])

  if (f.input.vista !== 'documento' || !sePuedeEscuchar(f.input.ruta) || !chatSpeech) return null

  const alternar = async () => { setAviso(null); const r = await alternarLectura(f.id); setAviso(AVISO[r] ?? null) }
  const velocidad = () => { chatSpeech.cycleRate(); guardarVelocidad(chatSpeech.getState().rate) }
  const pct = total > 0 ? ((idx + 1) / total) * 100 : 0
  const colorVel = rate === 1 ? 'text-muted' : rate >= 1.75 ? 'text-amber-400' : 'text-brand-ink'
  return <div className={s.escucharFlota} data-leyendo={activo || undefined} style={{ '--ancla': ancla || ESQUINA } as React.CSSProperties}>
    {/* En reposo: solo el botón discreto, junto a «tema». */}
    {!activo && <button className={s.escucharBoton} onClick={() => void alternar()}
      title={aviso ?? (preparando ? 'Preparando el texto… (clic para cancelar)' : 'Escuchar este documento (voz del dispositivo)')}
      aria-label="Escuchar documento">
      {preparando ? <Loader2 size={13} aria-hidden className="animate-spin" /> : <Volume2 size={13} aria-hidden />}
    </button>}
    {/* Al darle play: la barra del chat (mismo marco y botones), en una franja propia sobre el documento. */}
    {activo && <div className={s.escucharBarra} role="group" aria-label="Lectura del documento">
      <AudioBarFrame
        izquierda={<span className={TXT_CONTADOR} title="Párrafo">{idx + 1}/{total}</span>}
        velocidad={<button onClick={velocidad} className={`${BTN_VELOCIDAD} ${colorVel}`} title="Velocidad (se recuerda)" aria-label={`Velocidad ${fmt(rate)}`}><Zap size={11} aria-hidden />{fmt(rate)}</button>}
        controles={<>
          <button onClick={() => chatSpeech.prev()} className={BTN_SALTO} title="Párrafo anterior" aria-label="Párrafo anterior"><SkipBack size={18} aria-hidden /></button>
          <button onClick={() => chatSpeech.pauseResume()} className={BTN_PLAY} title={pausado ? 'Reanudar (Ctrl+Espacio)' : 'Pausar (Ctrl+Espacio)'} aria-label={pausado ? 'Reanudar lectura' : 'Pausar lectura'}>
            {pausado ? <Play size={20} aria-hidden className="fill-current ml-0.5" /> : <Pause size={20} aria-hidden className="fill-current" />}
          </button>
          <button onClick={() => chatSpeech.next()} className={BTN_SALTO} title="Párrafo siguiente" aria-label="Párrafo siguiente"><SkipForward size={18} aria-hidden /></button>
        </>}
        derecha={<button onClick={() => chatSpeech.stop()} className={BTN_CERRAR} title="Detener la lectura" aria-label="Detener lectura"><X size={18} aria-hidden /></button>}
        progreso={<div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-card-active">
          <div className="h-full rounded-r-full bg-gradient-to-r from-brand to-brand-ink" style={{ width: `${pct}%`, transition: 'width 200ms' }} />
        </div>}
      />
    </div>}
    {aviso && <span role="status" className={s.escucharAviso}>{aviso}</span>}
  </div>
}
