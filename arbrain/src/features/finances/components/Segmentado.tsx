'use client'
import s from './segmentado.module.css'

/** Un selector de 2 a 4 opciones con pulgar que se desliza (260 ms): se ve a dónde va el cambio. Cada opción es un tab. */
export function Segmentado<T extends string>({ opciones, valor, onChange, etiqueta, chico }: {
  opciones: { id: T; label: string; title?: string }[]; valor: T; onChange: (v: T) => void; etiqueta: string; chico?: boolean
}) {
  const k = Math.max(0, opciones.findIndex(o => o.id === valor))
  return <div className={s.seg} role="tablist" aria-label={etiqueta} data-chico={chico || undefined} style={{ ['--k' as string]: k, ['--n' as string]: opciones.length }}>
    <i aria-hidden />
    {opciones.map(o => <button key={o.id} role="tab" aria-selected={valor === o.id} title={o.title} onClick={() => onChange(o.id)}>{o.label}</button>)}
  </div>
}
