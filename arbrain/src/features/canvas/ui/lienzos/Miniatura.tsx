'use client'

/** La miniatura de un lienzo en la lista (y en «Desde plantilla»): la imagen guardada o, sin ella, el ícono de figuras. */
import { useState } from 'react'
import { Shapes } from 'lucide-react'
import css from './lienzos.module.css'

export function Miniatura({ url }: { url: string | null }) {
  const [mala, setMala] = useState<string | null>(null)
  return <span className={css.mini} aria-hidden>
    {url && mala !== url ? <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setMala(url)} /> : <Shapes size={16} />}
  </span>
}
