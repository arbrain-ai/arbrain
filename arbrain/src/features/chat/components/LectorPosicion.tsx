'use client'
import { useEffect, useRef } from 'react'
import { chatSpeech } from '../lib/chat-speech'
import { MATERIALIZAR_MENSAJE } from './LazyMessage'

/**
 * Pegamento entre el chat y la memoria del lector (2 oct 2026). No pinta nada.
 *
 *  · Cambiar de conversación mientras suena = el lector se SUSPENDE: pausa y guarda su
 *    punto bajo la conversación que dejas. No suena de fondo (no hay lectura de fondo
 *    deliberada en el chat).
 *  · Volver, o recargar con Cmd+R = la barra reaparece en ese mensaje, párrafo y palabra,
 *    EN PAUSA. Suena solo cuando Daniel pulsa play. Si el mensaje cambió, vuelve a su inicio.
 *
 * El mensaje puede estar diferido (LazyMessage) o aún cargando: se le pide materializarse
 * y se reintenta unos segundos, sin mover el scroll.
 */
export function LectorPosicion({ sessionId, messageIds }: { sessionId?: string | null; messageIds: string[] }) {
  const sesionRef = useRef<string | null>(null)
  sesionRef.current = sessionId ?? null

  useEffect(() => {
    if (!chatSpeech) return
    chatSpeech.registrarSesion(() => sesionRef.current)
    return () => {
      chatSpeech.registrarSesion(null)
      chatSpeech.suspend() // el chat se desmonta (otra sección): el punto queda guardado
    }
  }, [])

  // Salir de la conversación que se leía.
  useEffect(() => {
    if (!chatSpeech) return
    const dueña = chatSpeech.sesionDeLectura()
    if (dueña && dueña !== (sessionId ?? null)) chatSpeech.suspend()
  }, [sessionId])

  // Volver a la conversación (o recargar): dejar la barra en el punto guardado.
  const idsKey = `${messageIds.length}:${messageIds[messageIds.length - 1] ?? ''}`
  useEffect(() => {
    if (!chatSpeech || !sessionId) return
    const g = chatSpeech.posicionGuardada(sessionId)
    if (!g || !messageIds.includes(g.msgId)) return
    let intentos = 0
    let t: ReturnType<typeof setTimeout> | null = null
    const intenta = () => {
      if (chatSpeech.sesionDeLectura() || !chatSpeech.posicionGuardada(sessionId)) return
      const el = document.querySelector<HTMLElement>(`[data-tts-content="${CSS.escape(g.msgId)}"]`)
      if (el && chatSpeech.restaurar(sessionId, el)) return
      if (!el) window.dispatchEvent(new CustomEvent(MATERIALIZAR_MENSAJE, { detail: g.msgId }))
      if (++intentos < 30) t = setTimeout(intenta, 200)
    }
    intenta()
    return () => { if (t) clearTimeout(t) }
    // messageIds se resume en idsKey: solo importa cuándo cambia el conjunto cargado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, idsKey])

  return null
}
