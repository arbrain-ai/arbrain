'use client'
/**
 * La salida de «1 pregunta» (8 nov 2026). Daniel: «estoy cansado del 1 pregunta interminable: doy clic y no hay forma
 * de responder». La pregunta de un agente abría una terminal cruda (sin teclado útil en el teléfono) y el «Visto» vivía
 * escondido en la lista de Tareas. Aquí, sobre la terminal: lo que el agente preguntó, una caja para contestarle y
 * «Visto» para soltarla. Toda pregunta que llega a esta pantalla tiene salida a un toque.
 */
import { useState } from 'react'
import { Send } from 'lucide-react'
import s from './panel.module.css'
import { enviarRespuesta, escribirEnTerminal } from './responder-terminal'

export interface ResponderProps {
  id: number
  /** Lo que el agente preguntó, en palabras (su último mensaje). */
  pregunta: string | null
  /** Terminal escribible. Sin ella (solo lectura, sin pantalla) solo queda «Visto». */
  puedeEscribir: boolean
  /** Diálogo con opciones (AskUserQuestion, permiso): se elige en la terminal, un texto libre lo cerraría. */
  dialogo: boolean
  /** Soltar la pregunta en este dispositivo («Visto»). Al contestar también se llama: la nueva respuesta del agente trae firma nueva. */
  onVisto: () => void
}

export function ResponderAgente({ id, pregunta, puedeEscribir, dialogo, onVisto }: ResponderProps) {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<{ fase: 'quieta' | 'enviando' | 'enviado' | 'error'; msg?: string }>({ fase: 'quieta' })
  const escribe = puedeEscribir && !dialogo

  const enviar = async () => {
    if (estado.fase === 'enviando') return
    setEstado({ fase: 'enviando' })
    const r = await enviarRespuesta(texto, escribirEnTerminal(id))
    if (!r.ok) { setEstado({ fase: 'error', msg: r.error }); return }
    setTexto(''); setEstado({ fase: 'enviado' }); onVisto()
  }

  return <section className={s.responder} aria-label="Contestarle al agente" data-testid="responder-agente">
    {pregunta && <p className={s.responderPregunta}>{pregunta}</p>}
    {dialogo && <p className={s.responderNota}>Pide elegir una opción: tócala en la terminal de abajo.</p>}
    {escribe && <form className={s.responderForma} onSubmit={e => { e.preventDefault(); void enviar() }}>
      <input className={s.responderCampo} value={texto} onChange={e => { setTexto(e.target.value); if (estado.fase !== 'quieta') setEstado({ fase: 'quieta' }) }}
        placeholder="Contéstale…" aria-label="Tu respuesta" enterKeyHint="send" autoComplete="off" autoCorrect="off" inputMode="text" />
      <button type="submit" className={s.responderEnviar} disabled={!texto.trim() || estado.fase === 'enviando'} aria-label="Enviar respuesta">
        <Send size={14} /><span>{estado.fase === 'enviando' ? 'Enviando' : 'Contestar'}</span>
      </button>
    </form>}
    <div className={s.responderPie}>
      <span role="status" data-error={estado.fase === 'error' || undefined}>
        {estado.fase === 'enviado' ? 'Enviado.' : estado.fase === 'error' ? estado.msg : !puedeEscribir ? 'Esta terminal no acepta escritura desde aquí.' : ''}
      </span>
      <button type="button" className={s.responderVisto} onClick={onVisto} title="Ya lo revisé: quita el aviso">Visto</button>
    </div>
  </section>
}
