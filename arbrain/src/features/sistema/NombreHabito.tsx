'use client'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { nombrePublico, type PrincipioHabito } from '@/lib/sistema/atomicos'
import { useAtomicos } from './useAtomicos'
import { principioHabito } from './privacidad-habitos'
import s from './nombre-habito.module.css'

/** Cuánto tiene que quedarse el cursor para revelar: pasar de largo (al compartir pantalla) no lo destapa. */
const INTENCION_MS = 450
/** Un toque deja el nombre real a la vista este tiempo. */
const TOQUE_MS = 4000

/**
 * El nombre de un hábito tal como se pinta (28 oct 2026, Daniel: «por nada del mundo quiero que mis alumnos vean» el nombre del tercero).
 * Lo no privado sale tal cual. Lo privado sale como «Hábito 3», sin candado ni tooltip (28 oct 07:59, Daniel: el candado «despierta
 * curiosidad»), y su nombre real solo al dejar el cursor encima o al tocarlo.
 * `tocable={false}` dentro de un botón que ya hace otra cosa (marcar el hábito): ahí solo el cursor revela.
 */
export function NombreHabito({ clave, nombre, p, tocable = true, className }: {
  clave: string; nombre: string; p?: PrincipioHabito; tocable?: boolean; className?: string
}) {
  useAtomicos()
  const principio = p ?? principioHabito(clave)
  const [visto, setVisto] = useState(false)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null), fijo = useRef(false)
  const limpiar = () => { if (espera.current) clearTimeout(espera.current); espera.current = null }
  useEffect(() => limpiar, [])
  useEffect(() => {
    if (!visto || !fijo.current) return
    const t = setTimeout(() => { fijo.current = false; setVisto(false) }, TOQUE_MS)
    return () => clearTimeout(t)
  }, [visto])
  if (!principio?.privado) return <span className={className}>{nombre}</span>

  const entrar = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; limpiar(); espera.current = setTimeout(() => setVisto(true), INTENCION_MS) }
  const salir = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; limpiar(); if (!fijo.current) setVisto(false) }
  const tocar = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); fijo.current = !visto; setVisto(v => !v) }
  const texto = visto ? nombre : nombrePublico(nombre, principio)
  return <span className={`${s.privado}${className ? ` ${className}` : ''}`} data-privado data-visto={visto || undefined}
    onPointerEnter={entrar} onPointerLeave={salir} onClick={tocable ? tocar : undefined}
    role={tocable ? 'button' : undefined} tabIndex={tocable ? 0 : undefined}
    onKeyDown={tocable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fijo.current = !visto; setVisto(v => !v) } } : undefined}
    aria-label={texto}>
    <span>{texto}</span>
  </span>
}
