'use client'
import { CornerUpLeft, ImageIcon, Pencil, SendHorizontal, X } from 'lucide-react'
import type { EnFila } from '../hooks/useColaMensajes'
import c from './cola.module.css'

/** La fila, a la vista arriba del composer. Cada pendiente se puede regresar al
 *  composer para editarlo o quitar; «Enviar ya» no espera a que Levy termine. */
export function ColaMensajes({ items, pausada, trabajando, onEditar, onQuitar, onEnviarYa }: {
  items: EnFila[]; pausada: boolean; trabajando: boolean
  onEditar: (id: string) => void; onQuitar: (id: string) => void; onEnviarYa: () => void
}) {
  if (!items.length) return null
  const n = items.length
  return <section className={c.cola} aria-label="Mensajes en fila" data-pausada={pausada || undefined}>
    <header className={c.cabecera}>
      <span className={c.estado} aria-hidden data-vivo={trabajando && !pausada || undefined} />
      <span className={c.leyenda} aria-live="polite">
        {pausada
          ? <><b>{n === 1 ? '1 mensaje en pausa' : `${n} mensajes en pausa`}</b> · {trabajando ? 'se queda aquí hasta que lo mandes' : 'espera a que lo mandes'}</>
          : <><b>{n === 1 ? '1 mensaje en fila' : `${n} mensajes en fila`}</b> · {trabajando ? 'sale cuando Levy termine' : 'saliendo…'}</>}
      </span>
      <button className={c.enviar} onClick={onEnviarYa} title={trabajando ? 'Detiene a Levy conservando lo hecho y manda la fila' : 'Mandar la fila ahora'}>
        <SendHorizontal size={13} aria-hidden />{trabajando ? 'Enviar ya' : 'Enviar'}
      </button>
    </header>
    <ol className={c.lista}>
      {items.map((it, i) => <li key={it.id} className={c.item}>
        <span className={c.num} aria-hidden>{i + 1}</span>
        <p className={c.texto} title={it.texto}>
          {it.imagenes?.length ? <span className={c.fotos}><ImageIcon size={12} aria-hidden />{it.imagenes.length === 1 ? '1 foto' : `${it.imagenes.length} fotos`}</span> : null}
          {it.texto}
        </p>
        <span className={c.acciones}>
          <button onClick={() => onEditar(it.id)} aria-label={`Editar el mensaje ${i + 1}`} title="Regresarlo al composer con sus fotos para editarlo (↑ edita el último)"><Pencil size={13} aria-hidden /></button>
          <button onClick={() => onQuitar(it.id)} aria-label={`Quitar el mensaje ${i + 1}`} title="Quitarlo de la fila"><X size={14} aria-hidden /></button>
        </span>
      </li>)}
    </ol>
    {n > 1 && <p className={c.nota}><CornerUpLeft size={11} aria-hidden /> Salen juntos como un solo mensaje, en este orden.</p>}
  </section>
}
