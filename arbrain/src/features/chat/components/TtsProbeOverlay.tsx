'use client'
import { useState, useSyncExternalStore } from 'react'
import { sonda } from '../lib/tts-probe'

const OFF = { on: false, lagMax: 0, bloqueos: 0, ultimo: '' }

/**
 * HUD de la sonda del hilo. Solo aparece con ?ttsdebug=1 (queda pegado por localStorage;
 * se apaga con ?ttsdebug=0). Temporal: muere con la sonda.
 *
 * Lo que importa es "peor": cuántos milisegundos estuvo el hilo tieso. Mientras el hilo
 * está tieso, el resaltado no se puede mover aunque la voz siga — ahí nace el desfase.
 */
export function TtsProbeOverlay() {
  const st = useSyncExternalStore(
    (cb) => sonda.subscribe(cb),
    () => sonda.getState(),
    () => OFF,
  )
  const [copiado, setCopiado] = useState(false)

  if (!st.on) return null

  const color = st.lagMax > 3000 ? '#ff6b8a' : st.lagMax > 800 ? '#ff9101' : '#5ee6a8'

  return (
    <div
      className="fixed z-[9999] left-2 bottom-24 max-w-[calc(100vw-16px)] rounded-xl border px-3 py-2"
      style={{ background: 'rgba(8,8,12,.92)', borderColor: '#2c2c3a', backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-3 font-mono text-[11px]" style={{ color: '#b9b9cc' }}>
        <span>
          peor: <b style={{ color }}>{st.lagMax}ms</b>
        </span>
        <span>bloqueos: <b style={{ color: '#e8e8ef' }}>{st.bloqueos}</b></span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(sonda.reporte())
              setCopiado(true)
              setTimeout(() => setCopiado(false), 1500)
            } catch { /* sin clipboard: queda el console.log de abajo */ }
            console.log(sonda.reporte())
          }}
          className="px-2 py-1 rounded-lg"
          style={{ background: '#8c27f1', color: '#fff' }}
        >
          {copiado ? '✓' : '📋 copiar'}
        </button>
      </div>
      {st.ultimo && (
        <div className="font-mono text-[10px] mt-1 truncate" style={{ color: '#8b8b9e', maxWidth: '80vw' }}>
          último: {st.ultimo}
        </div>
      )}
    </div>
  )
}
