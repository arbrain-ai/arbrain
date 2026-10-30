'use client'
import { useEffect } from 'react'
import { X } from 'lucide-react'
import Link from 'next/link'
import { ATAJOS_SHELL } from '@/shared/navigation/atajos'

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-md bg-card border border-border rounded-2xl shadow-elevation-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Specular rim */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-2xl" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-semibold text-foreground">Atajos de teclado</h2>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1.5 rounded-lg hover:bg-card-active text-muted hover:text-foreground/85 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
            {ATAJOS_SHELL.map((group) => (
              <div key={group.id}>
                <h3 className="text-[10px] uppercase tracking-widest text-muted/80 font-semibold mb-2">
                  {group.titulo}
                </h3>
                <div className="space-y-1.5">
                  {group.atajos.map((shortcut) => (
                    <div
                      key={shortcut.accion}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-xs text-foreground/70">{shortcut.accion}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.teclas.map((key) => (
                          <kbd
                            key={key}
                            className="min-w-[24px] px-1.5 py-0.5 text-[10px] font-mono text-center text-foreground/75 bg-card-active border border-border rounded"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {/* La lista completa, con los del Canvas, vive en Configuración → Atajos (2 oct 2026). */}
            <Link href="/settings?section=atajos" onClick={onClose} className="block text-xs text-primary hover:underline">
              Ver todos, con los del Canvas, en Configuración
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
