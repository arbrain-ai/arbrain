'use client'

import { useEffect, useState } from 'react'
import { reloj, UMBRAL_MS } from '../lib/duracion-turno'

/**
 * Reloj vivo del turno. Late solo él (no re-renderiza la burbuja ni su markdown cada segundo).
 * Aparece al pasar el umbral para no parpadear en respuestas rápidas.
 */
export function RelojTurno({ inicio }: { inicio: number }) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const ms = ahora - inicio
  if (ms < UMBRAL_MS) return null
  return <span data-reloj-turno aria-hidden className="tabular-nums text-muted/70 font-normal">· {reloj(ms)}</span>
}
