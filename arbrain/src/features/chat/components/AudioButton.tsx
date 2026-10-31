'use client'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Volume2, Square, AudioLines } from 'lucide-react'
import { chatSpeech } from '../lib/chat-speech'

/**
 * PRECARGA CON EL DEDO (31 oct 2026, Daniel: «la menor latencia posible al momento de play»). En la Mac, pasar el cursor
 * por el botón pide ya el primer tramo; con el dedo no hay `hover`: `pointerenter` llega junto con el toque. En una
 * pantalla táctil el primer tramo se pide cuando el botón lleva ANTICIPO_MS a la vista (no al pasar de largo con el
 * scroll) y otra vez en `pointerdown` (llega ~100 ms antes del click). Un solo IntersectionObserver para todos los
 * botones: los mensajes no se desmontan nunca (ver la nota del botón).
 */
const ANTICIPO_MS = 600
const esTactil = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
let observador: IntersectionObserver | null = null
const alVerse = new Map<Element, () => void>()
const relojes = new Map<Element, ReturnType<typeof setTimeout>>()
function vigilarVista(el: Element, anticipar: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined' || !esTactil()) return () => {}
  observador ??= new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const r = relojes.get(e.target)
      if (r) { clearTimeout(r); relojes.delete(e.target) }
      if (e.isIntersecting) relojes.set(e.target, setTimeout(() => { relojes.delete(e.target); alVerse.get(e.target)?.() }, ANTICIPO_MS))
    }
  }, { threshold: 0.5 })
  alVerse.set(el, anticipar)
  observador.observe(el)
  return () => {
    observador?.unobserve(el)
    alVerse.delete(el)
    const r = relojes.get(el)
    if (r) clearTimeout(r)
    relojes.delete(el)
  }
}

interface AudioButtonProps {
  messageId: string
  selectionEnabled?: boolean
  label?: string
  /** «Escuchar resumen» (resumen-hablado.ts): lee el principio de la respuesta y cierra con «El resto está en pantalla». */
  resumen?: boolean
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
export function AudioButton({ messageId, selectionEnabled = false, label, resumen = false }: AudioButtonProps) {
  // getSnapshot devuelve un BOOLEAN primitivo: estable bajo Object.is (nada de objetos
  // nuevos por llamada — ese fue el bug que tumbó el chat en producción, ver chat-speech).
  const active = useSyncExternalStore(
    (cb) => (chatSpeech ? chatSpeech.subscribe(cb) : () => {}),
    () => (chatSpeech ? chatSpeech.getState().id === messageId && chatSpeech.getState().resumen === resumen : false),
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
      // Un solo dueño de la limpieza por mensaje: el botón completo (el de resumen va junto a él, se monta y desmonta a la par).
      if (resumen || !chatSpeech?.isActive(messageId)) return
      setTimeout(() => {
        if (chatSpeech.isActive(messageId) && !chatSpeech.relocate()) chatSpeech.suspend()
      }, 120)
    },
    [messageId, resumen],
  )

  const handleClick = () => {
    if (!chatSpeech) return
    // Buscar el DOM renderizado de ESTE mensaje (lo marca ChatPanel con data-tts-content).
    const el = document.querySelector<HTMLElement>(`[data-tts-content="${CSS.escape(messageId)}"]`)
    if (!el) return
    if (resumen) return chatSpeech.toggle(messageId, el, undefined, undefined, undefined, { resumen: true })
    const selection = selectionEnabled ? window.getSelection() : null
    if (selection && selection.rangeCount && selection.toString().trim() &&
      selection.anchorNode && selection.focusNode && el.contains(selection.anchorNode) && el.contains(selection.focusNode) && !active) {
      chatSpeech.toggle(messageId, el, undefined, selection.toString())
    } else chatSpeech.toggle(messageId, el)
  }

  // El cursor llegó al botón (o el dedo lo tocó, o lleva un momento a la vista en el teléfono): el primer tramo de la
  // voz del servidor se pide ya. El click lo encuentra en la caché o en vuelo.
  const anticipar = () => {
    if (!chatSpeech || active) return
    const el = document.querySelector<HTMLElement>(`[data-tts-content="${CSS.escape(messageId)}"]`)
    if (el) chatSpeech.anticipar(el)
  }
  const boton = useRef<HTMLButtonElement>(null)
  const anticiparRef = useRef(anticipar)
  anticiparRef.current = anticipar
  useEffect(() => {
    if (resumen || !boton.current) return
    return vigilarVista(boton.current, () => anticiparRef.current())
  }, [resumen])

  if (resumen) {
    return (
      <button
        type="button"
        data-escuchar-resumen
        aria-label={active ? 'Detener resumen' : 'Escuchar resumen'}
        onPointerEnter={anticipar}
        onClick={handleClick}
        title={active ? 'Detener' : 'Escuchar resumen (el principio, cerca de un minuto)'}
        className={`
          flex items-center gap-1 min-h-[36px] md:min-h-0 px-2 py-2 md:px-1 md:py-1 rounded-lg md:rounded transition-colors text-[11px]
          ${active ? 'text-violet-400 hover:text-violet-300' : 'text-muted/70 hover:text-foreground/70'}
          hover:bg-card-hover md:hover:bg-transparent
        `}
      >
        {active ? <Square size={13} /> : <AudioLines size={13} />}
        <span>Resumen</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={active ? `Detener ${label ?? 'lectura'}` : label ? `Escuchar ${label} o su selección` : 'Escuchar (voz del dispositivo)'}
      ref={boton}
      onPointerDown={(e) => { if (selectionEnabled) e.preventDefault(); if (e.pointerType !== 'mouse') anticipar() }}
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
