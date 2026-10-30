'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Campo para cambiar el nombre de una conversación en el lugar del título (1 oct 2026). Lo usan «Recientes»
 * y «Ver todas»: Enter o salir del campo guarda, Escape cancela. Sin cambios, no llama a nadie.
 */
export function EditorTitulo({ valor, onConfirmar, onCancelar, className = '' }: {
  valor: string
  onConfirmar: (titulo: string) => void
  onCancelar: () => void
  className?: string
}) {
  const [texto, setTexto] = useState(valor)
  const ref = useRef<HTMLInputElement>(null)
  // Enter y el blur que sigue al desmontar no deben guardar dos veces.
  const terminado = useRef(false)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const terminar = (guardar: boolean) => {
    if (terminado.current) return
    terminado.current = true
    const limpio = texto.trim()
    if (guardar && limpio && limpio !== valor) onConfirmar(limpio)
    else onCancelar()
  }

  return (
    <input
      ref={ref}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); terminar(true) }
        else if (e.key === 'Escape') { e.preventDefault(); terminar(false) }
      }}
      onBlur={() => terminar(true)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Nombre de la conversación"
      maxLength={200}
      className={`input-field px-1.5 py-0.5 text-xs ${className}`}
    />
  )
}
