'use client'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { stripThinking } from './MarkdownMessage'
import { sonda } from '../lib/tts-probe'

// ─── Render diferido de mensajes lejos del viewport (20 jul 2026) ────────────
//
// El costo real de abrir una conversación larga en móvil NO era la red (hay
// snapshot local + paginación por cursor): era el PARSEO — react-markdown +
// rehype-highlight + widgets de N mensajes de golpe en el CPU del teléfono.
//
// Patrón Claude iOS: solo la cola visible paga el render completo. El resto
// pinta un placeholder de TEXTO PLANO (mismo contenido → altura ≈ la real, así
// el pin al fondo y la compensación de prepend no saltan) y se materializa al
// ACERCARSE por scroll — IntersectionObserver con margen generoso, para que al
// subir leyendo ya esté montado antes de entrar a pantalla. Una vez montado,
// montado se queda (no des-materializa: el estado de widgets/audio sobrevive).
/** Evento: materializar el mensaje diferido con este `data-msg-id` (detail = id). */
export const MATERIALIZAR_MENSAJE = 'arbrain:materializar-mensaje'

export const LazyMessage = memo(function LazyMessage({
  text,
  children,
}: {
  /** Contenido crudo del mensaje — el placeholder lo pinta plano. */
  text: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (mounted) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          // Sospechoso: materializar un mensaje = parseo markdown + highlight + widgets.
          sonda.mark(`lazy-mount(${text.length}c)`)
          setMounted(true)
          io.disconnect()
        }
      },
      // ~2 pantallas de anticipación: materializa antes de que el ojo llegue.
      { rootMargin: '1200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [mounted])

  // El lector restaura su punto en un mensaje que puede seguir diferido (sin párrafos que
  // leer): el evento lo materializa sin mover el scroll. Lo emite LectorPosicion.
  useEffect(() => {
    if (mounted) return
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      const dueño = ref.current?.closest<HTMLElement>('[data-msg-id]')?.dataset.msgId
      if (id && dueño === id) setMounted(true)
    }
    window.addEventListener(MATERIALIZAR_MENSAJE, h)
    return () => window.removeEventListener(MATERIALIZAR_MENSAJE, h)
  }, [mounted])

  if (mounted) return <>{children}</>

  return (
    <div
      ref={ref}
      className="chat-serif px-1 py-2 text-[15px] leading-relaxed text-foreground/60 whitespace-pre-wrap break-words"
    >
      {stripThinking(text)}
    </div>
  )
})
