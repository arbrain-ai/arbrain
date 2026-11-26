'use client'
/**
 * Ajustes › Voz, con la llave de LemonFox guardada (13 nov 2026): elegir entre las voces en español que LemonFox publica
 * y probarlas con un clic. La elección se guarda en este dispositivo (lib/voz-lemonfox.ts); la llave nunca pasa por
 * aquí: el audio lo pide el daemon con la suya.
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { FRASE_PRUEBA_VOZ, guardarVozLemonfox, leerVozLemonfox, VOCES_LEMONFOX, type VozLemonfox } from '../lib/voz-lemonfox'
import { tr } from '@/shared/i18n'

export function ElegirVozLemonfox() {
  const [voz, setVoz] = useState<VozLemonfox>('alex')
  const [probando, setProbando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => { setVoz(leerVozLemonfox()) }, [])
  useEffect(() => () => { audio.current?.pause() }, [])

  const elegir = (v: VozLemonfox) => { setVoz(v); guardarVozLemonfox(v); setAviso(null) }

  const probar = async () => {
    if (probando) return
    setProbando(true); setAviso(null)
    audio.current?.pause()
    try {
      const r = await fetch('/api/chat/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: FRASE_PRUEBA_VOZ, voz }) })
      if (!r.ok) {
        const j = await r.json().catch(() => null) as { error?: string } | null
        setAviso(j?.error ? tr(j.error) : tr('La voz no respondió ({status}).', { status: r.status }))
        return
      }
      const url = URL.createObjectURL(await r.blob())
      const a = new Audio(url)
      a.onended = () => URL.revokeObjectURL(url)
      audio.current = a
      await a.play()
    } catch { setAviso(tr('No pude reproducir la prueba. Reintenta en unos segundos.')) } finally { setProbando(false) }
  }

  return (
    <div className="mt-3 space-y-2">
      <label htmlFor="voz-lemonfox" className="text-[13.5px] font-medium text-foreground">{tr('Voz de LemonFox')}</label>
      <div className="flex gap-2">
        <select id="voz-lemonfox" value={voz} onChange={(e) => elegir(e.target.value as VozLemonfox)} className="input-field min-h-10 min-w-0 flex-1 px-3 text-[13px]">
          {VOCES_LEMONFOX.map(v => <option key={v.id} value={v.id}>{v.etiqueta} · {tr(v.detalle)}</option>)}
        </select>
        <button type="button" onClick={() => void probar()} disabled={probando} className="btn-secondary min-h-10 shrink-0 !px-3 text-[13px]">
          {probando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />} {tr('Probar')}
        </button>
      </div>
      <p className="text-[12px] text-muted" aria-live="polite">{aviso ?? tr('Se guarda al elegirla y la usa «Escuchar» en el chat. Son las voces en español que publica LemonFox.')}</p>
    </div>
  )
}
