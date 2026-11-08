'use client'
/**
 * El mensaje del dueño se ve igual siempre (5 nov 2026, Daniel: «no me gusta que la ui de estos mensajes en cola sean así
 * más pequeños… si es tan smooth no debería cambiar el tamaño del mensaje»). Una sola burbuja y un solo pie para el mensaje
 * normal (MessageBubble) y para lo que escribió con Levy trabajando (dentro del turno, donde el motor lo tomó). Como
 * Claude y ChatGPT: lo que escribes es tu burbuja, entre o no a mitad de turno; el estado va fuera, en el pie.
 */
import { useState, type ReactNode } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { etiquetaVisible, type NotaInyectada } from '../lib/inyecciones'
import { copyableUserText } from '../lib/text-attachments'
import { UserMessageText } from './TextAttachmentCard'

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handle}
      title="Copiar mensaje"
      aria-label="Copiar mensaje"
      className="flex items-center justify-center min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 p-2 md:p-0.5 rounded-lg md:rounded text-muted/60 hover:text-muted hover:bg-card-hover md:hover:bg-transparent transition-colors"
    >
      {copied ? <Check size={14} className="text-gold-dark dark:text-gold-bright" /> : <Copy size={14} />}
    </button>
  )
}

/** Burbuja morada a la derecha (identidad Titaniumorphism): la única forma del texto del dueño en el hilo. */
export function BurbujaUsuario({ children }: { children: ReactNode }) {
  return <div data-burbuja-usuario className="max-w-[85%] md:max-w-[75%] min-w-0 overflow-hidden px-4 py-2.5 text-[15px] leading-relaxed msg-bubble-own rounded-br-md">{children}</div>
}

/** Pie bajo la burbuja, alto fijo: `estado` siempre a la vista (enviando, entrando…) y las acciones al pasar el ratón en
 *  escritorio (v2: viven DEBAJO, como claude.ai). Que cambie o se vaya el estado no mueve nada. El contenedor del mensaje
 *  lleva `group/usuario`: dentro de la respuesta de Levy, pasar sobre su texto no enciende las acciones de la nota. */
export function PieUsuario({ estado, children }: { estado?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-end mt-1 gap-1.5 pr-1 min-h-6">
      {estado}
      <div className="flex items-center gap-1.5 md:opacity-0 md:group-hover/usuario:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200">
        {children}
      </div>
    </div>
  )
}

const hora = (at: number) => new Date(at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

/** Mensaje del dueño dentro del turno, en el punto donde Levy lo tomó: la misma burbuja y el mismo pie que un mensaje
 *  normal. «Leído» no se escribe (1 nov 2026: «sé que lo lees»); solo se ve lo que aún pide atención, fuera de la burbuja.
 *  Sin «Editar»: rebobinar a mitad de un turno ajeno no aplica. Fuera de la lectura en voz (es del dueño, no de Levy). */
function NotaInyectadaMensaje({ nota }: { nota: NotaInyectada }) {
  const etiqueta = etiquetaVisible(nota.estado)
  return (
    <div className="group/usuario flex flex-col items-end my-5" data-nota-inyectada={nota.id} data-estado={nota.estado} data-tts-exclude>
      <BurbujaUsuario><UserMessageText text={nota.texto} /></BurbujaUsuario>
      <PieUsuario estado={etiqueta
        ? <span role="status" className="inline-flex items-center gap-1 text-[10px] text-muted/80">
            {nota.estado !== 'en_fila' && <Loader2 size={10} className="animate-spin shrink-0" />}
            {etiqueta}
          </span>
        : <span className="sr-only">Levy ya lo leyó</span>}>
        <CopyBtn text={copyableUserText(nota.texto)} />
        <p className="text-[10px] text-muted/80">{hora(nota.at)}</p>
      </PieUsuario>
    </div>
  )
}

/** Lo que el dueño escribió con el turno vivo, en orden y fuera del rastro plegado: es conversación, no auditoría. */
export function NotasInyectadas({ notas }: { notas?: NotaInyectada[] }) {
  if (!notas?.length) return null
  return <div className="flex flex-col">{notas.map(nota => <NotaInyectadaMensaje key={nota.id} nota={nota} />)}</div>
}
