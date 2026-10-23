'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { Volume2, Square } from 'lucide-react'
import { chatSpeech } from '../lib/chat-speech'

interface AudioButtonProps {
  messageId: string
  selectionEnabled?: boolean
  label?: string
}

/**
 * Botón "Escuchar" con la VOZ DEL DISPOSITIVO (Web Speech API), como el lector de libros:
 * lee el mensaje con la voz del sistema, resalta la palabra en naranja, y permite TAP en un
 * párrafo para saltar ahí. Cero servidor, cero costo, instantáneo, offline.
 * (El motor lee el DOM renderizado del mensaje, no el texto crudo.)
 *
 * NO TIENE TIMER PROPIO, y no puede volver a tenerlo: se suscribe al motor. Antes cada botón
 * montaba un `setInterval` de 500ms que vivía mientras el mensaje existiera — y los mensajes
 * no se desmontan nunca (LazyMessage: "una vez montado, montado se queda"). En una
 * conversación larga eso eran cientos de timers despertando el hilo principal dos veces por
 * segundo... el mismo hilo por el que llegan los eventos `boundary` que mueven el resaltado.
 * De ahí que la lectura se desincronizara justo cuando la conversación se alargaba.
 */
export function AudioButton({ messageId, selectionEnabled = false, label }: AudioButtonProps) {
  // getSnapshot devuelve un BOOLEAN primitivo: estable bajo Object.is (nada de objetos
  // nuevos por llamada — ese fue el bug que tumbó el chat en producción, ver chat-speech).
  const active = useSyncExternalStore(
    (cb) => (chatSpeech ? chatSpeech.subscribe(cb) : () => {}),
    () => (chatSpeech ? chatSpeech.getState().id === messageId : false),
    () => false,
  )

  // Si el mensaje que se está leyendo desaparece (cambio de sesión, limpiar chat), callar.
  // Sin esto el motor seguía hablando sobre nodos ya desprendidos del documento: se oía la
  // voz, no se veía ningún resaltado, y la barra quedaba viva sin dueño.
  // PERO desmontar no es desaparecer (1 oct 2026): un re-render que vuelve a montar la
  // burbuja (el id local `a-…` cambia al de la base al volver el foco a la ventana) también
  // desmonta este botón. Se espera a que React monte lo nuevo y el motor intenta
  // reubicarse; solo si el mensaje ya no está, se SUSPENDE: pausa y guarda el punto de su
  // conversación (volver la deja lista en el mismo párrafo y palabra), no lo olvida.
  useEffect(
    () => () => {
      if (!chatSpeech?.isActive(messageId)) return
      setTimeout(() => {
        if (chatSpeech.isActive(messageId) && !chatSpeech.relocate()) chatSpeech.suspend()
      }, 120)
    },
    [messageId],
  )

  const handleClick = () => {
    if (!chatSpeech) return
    // Buscar el DOM renderizado de ESTE mensaje (lo marca ChatPanel con data-tts-content).
    const el = document.querySelector<HTMLElement>(`[data-tts-content="${CSS.escape(messageId)}"]`)
    if (!el) return
    const selection = selectionEnabled ? window.getSelection() : null
    if (selection && selection.rangeCount && selection.toString().trim() &&
      selection.anchorNode && selection.focusNode && el.contains(selection.anchorNode) && el.contains(selection.focusNode) && !active) {
      chatSpeech.toggle(messageId, el, undefined, selection.toString())
    } else chatSpeech.toggle(messageId, el)
  }

  // El cursor llegó al botón: el primer tramo de la voz del servidor se pide ya (`say` tarda ~1.2 s en arrancar).
  const anticipar = () => {
    if (!chatSpeech || active) return
    const el = document.querySelector<HTMLElement>(`[data-tts-content="${CSS.escape(messageId)}"]`)
    if (el) chatSpeech.anticipar(el)
  }

  return (
    <button
      type="button"
      aria-label={active ? `Detener ${label ?? 'lectura'}` : label ? `Escuchar ${label} o su selección` : 'Escuchar (voz del dispositivo)'}
      onPointerDown={selectionEnabled ? e => e.preventDefault() : undefined}
      onPointerEnter={anticipar}
      onClick={handleClick}
      title={active ? 'Detener' : 'Escuchar (voz del dispositivo)'}
      className={`
        flex items-center justify-center min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 p-2 md:p-1 rounded-lg md:rounded transition-colors
        ${active ? 'text-violet-400 hover:text-violet-300' : 'text-muted/70 hover:text-foreground/70'}
        hover:bg-card-hover md:hover:bg-transparent
      `}
    >
      {active ? <Square size={14} /> : <Volume2 size={14} />}
    </button>
  )
}
