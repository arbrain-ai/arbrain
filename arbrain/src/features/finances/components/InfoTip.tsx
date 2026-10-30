'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import s from './infotip.module.css'

/**
 * Explicación al lado de un término financiero. Se abre al tocar (iPhone) o con el teclado, no solo al pasar el
 * ratón, se cierra con Escape o al tocar fuera, y se acomoda para no salirse del panel (8 oct 2026).
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const [abierto, setAbierto] = useState(false)
  const [alReves, setAlReves] = useState(false)
  const raiz = useRef<HTMLSpanElement>(null)
  const id = useId()
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])
  function alternar() {
    if (!abierto && raiz.current) {
      const r = raiz.current.getBoundingClientRect()
      setAlReves(r.left + 250 > (typeof window !== 'undefined' ? window.innerWidth : 9999) - 12)
    }
    setAbierto(a => !a)
  }
  return <span ref={raiz} className={s.raiz} data-abierto={abierto || undefined}>
    <button type="button" className={s.boton} aria-label={label ?? 'Qué significa'} aria-expanded={abierto} aria-describedby={abierto ? id : undefined} onClick={alternar}>
      <Info size={12} aria-hidden />
    </button>
    {abierto && <span role="tooltip" id={id} className={s.globo} data-reves={alReves || undefined}>{text}</span>}
  </span>
}
