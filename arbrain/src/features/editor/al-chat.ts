'use client'
/**
 * C (comentario para Levy) desde el editor, que vive en otra ventana que el chat (19 nov 2026).
 *
 * El chat atiende el evento `cabina:enviar` solo en su propia ventana. El editor publica el texto por el canal de las
 * ventanas (`ventanas.ts`, BroadcastChannel + eventos de Tauri) y la ventana que tiene el chat lo envía y contesta
 * «recibido». Si nadie contesta en 1.5 s (no hay chat abierto, o es el teléfono con una sola pestaña), cae al camino de
 * siempre: `pedirALevy` deja el texto pendiente y lleva al chat.
 */
import { escuchar, publicar } from '@/features/cabina/panel/ventanas'
import { pedirALevy } from '@/features/cabina/documento/enviar'

export function enviarAlChat(texto: string): Promise<'chat' | 'camino-al-chat'> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  return new Promise(resolve => {
    let listo = false
    const fin = escuchar(m => {
      if (m.tipo === 'al-chat-recibido' && m.id === id && !listo) { listo = true; fin(); resolve('chat') }
    })
    publicar({ tipo: 'al-chat', id, texto })
    setTimeout(() => { if (listo) return; listo = true; fin(); pedirALevy(texto); resolve('camino-al-chat') }, 1500)
  })
}

/** Lo monta el chat: recibe lo que manda el editor desde otra ventana y lo envía como mensaje del dueño. */
export function atenderEditor(enviar: (texto: string) => void): () => void {
  return escuchar(m => {
    if (m.tipo !== 'al-chat' || !m.texto.trim()) return
    enviar(m.texto)
    publicar({ tipo: 'al-chat-recibido', id: m.id })
  })
}
