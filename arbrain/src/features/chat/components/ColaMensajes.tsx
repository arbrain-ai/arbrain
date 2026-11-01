'use client'
import { CornerUpLeft, ImageIcon, Pencil, SendHorizontal, X } from 'lucide-react'
import type { EnFila } from '../hooks/useColaMensajes'
import type { EstadoSalida } from '../lib/fila-salida'
import type { EstadoItemServidor } from '../lib/fila-servidor'
import c from './cola.module.css'

/** Lo que la leyenda dice es lo que de verdad pasa (1 nov 2026: decía «saliendo…» con la fila parada). */
export type EstadoCola = 'trabajando' | EstadoSalida
function leyenda(estado: EstadoCola, intento: number): string {
  switch (estado) {
    case 'trabajando': case 'esperando-turno': return 'sale cuando Levy termine'
    case 'saliendo': return 'saliendo…'
    case 'reintentando': return `no ha salido · reintento ${Math.max(1, intento)}`
    case 'atorada': return 'no pudo salir sola · toca Enviar'
    default: return 'revisando si Levy terminó…'
  }
}

/** Lo que espera en el servidor (opción B, 1 nov 2026): sale solo al cerrar el turno, aunque no estés mirando. */
export function etiquetaServidor(e: EstadoItemServidor | undefined): string {
  if (e?.estado === 'reintentando') return `no llega al servidor · reintento ${Math.max(1, e.intento)}`
  if (e?.estado === 'en_servidor') return 'en el servidor · sale solo'
  return 'enviando al servidor…'
}

/** La fila, a la vista arriba del composer. Cada pendiente se puede regresar al
 *  composer para editarlo o quitar; «Enviar ya» no espera a que Levy termine. */
export function ColaMensajes({ items, pausada, estado, intento = 0, enServidor, onEditar, onQuitar, onEnviarYa }: {
  items: EnFila[]; pausada: boolean; estado: EstadoCola; intento?: number
  /** Seguimiento de lo que espera en el servidor, por id. */
  enServidor?: ReadonlyMap<string, EstadoItemServidor>
  onEditar: (id: string) => void; onQuitar: (id: string) => void; onEnviarYa: () => void
}) {
  if (!items.length) return null
  const n = items.length
  const trabajando = estado === 'trabajando'
  const atorada = estado === 'atorada'
  // Solo lo del servidor: su estado manda en la leyenda (la pausa y los reintentos del dispositivo no le aplican).
  const soloServidor = items.every(x => x.servidor)
  const fallando = items.filter(x => x.servidor).map(x => enServidor?.get(x.id)).find(e => e?.estado === 'reintentando')
  pausada = pausada && !soloServidor
  return <section className={c.cola} aria-label="Mensajes en fila" data-pausada={pausada || undefined}>
    <header className={c.cabecera}>
      <span className={c.estado} aria-hidden data-vivo={!pausada && !atorada || undefined} />
      <span className={c.leyenda} aria-live="polite">
        {pausada && !atorada
          ? <><b>{n === 1 ? '1 mensaje en pausa' : `${n} mensajes en pausa`}</b> · {trabajando ? 'se queda aquí hasta que lo mandes' : 'espera a que lo mandes'}</>
          : <><b>{n === 1 ? '1 mensaje en fila' : `${n} mensajes en fila`}</b> · {soloServidor ? (fallando ? etiquetaServidor(fallando) : 'sale solo cuando Levy termine') : leyenda(estado, intento)}</>}
      </span>
      {(!soloServidor || trabajando) && <button className={c.enviar} onClick={onEnviarYa} title={trabajando ? 'Detiene a Levy conservando lo hecho y manda la fila' : 'Mandar la fila ahora'}>
        <SendHorizontal size={13} aria-hidden />{trabajando ? 'Enviar ya' : 'Enviar'}
      </button>}
    </header>
    <ol className={c.lista}>
      {items.map((it, i) => <li key={it.id} className={c.item}>
        <span className={c.num} aria-hidden>{i + 1}</span>
        <p className={c.texto} title={it.texto}>
          {it.imagenes?.length ? <span className={c.fotos}><ImageIcon size={12} aria-hidden />{it.imagenes.length === 1 ? '1 foto' : `${it.imagenes.length} fotos`}</span> : null}
          {it.texto}
          {it.servidor ? <span className={c.servidor} data-falla={enServidor?.get(it.id)?.estado === 'reintentando' || undefined}>{etiquetaServidor(enServidor?.get(it.id))}</span> : null}
        </p>
        <span className={c.acciones}>
          <button onClick={() => onEditar(it.id)} aria-label={`Editar el mensaje ${i + 1}`} title="Regresarlo al composer con sus fotos para editarlo (↑ edita el último)"><Pencil size={13} aria-hidden /></button>
          <button onClick={() => onQuitar(it.id)} aria-label={`Quitar el mensaje ${i + 1}`} title="Quitarlo de la fila"><X size={14} aria-hidden /></button>
        </span>
      </li>)}
    </ol>
    {items.filter(x => !x.servidor).length > 1 && <p className={c.nota}><CornerUpLeft size={11} aria-hidden /> Salen juntos como un solo mensaje, en este orden.</p>}
  </section>
}
