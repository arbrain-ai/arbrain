'use client'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Repeat2 } from 'lucide-react'
import { Palomita } from '@/shared/movimiento'
import type { ItemDia } from './lista-dia'
import { Agregar } from './ObjetivoCaja'
import { esc } from './vivo-piezas'
import type { PlanTask } from './types'
import s from './lista-dia.module.css'

/** «12:00», «5:30» → «05:30». */
export const horaDeMinuto = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * La lista del día dentro del toggle de la franja (3 nov 2026, Daniel: «quiero unificarlo toda la logica en el toggle»): las casillas
 * del objetivo y las tareas de Todoist en UNA lista. La casilla es cuadrada y dorada (vive en el objetivo); la tarea, un círculo (vive en
 * Todoist), el mismo círculo hueco que la marca en el timeline. Marcar cierra en su fuente y marcar otra vez la reabre; lo marcado se
 * queda en su lugar, tachado. A la derecha, tenue, su hora y el evento donde vive («12:00 · Grupal»).
 */
export function ListaDia({ items, alternar, puede, evento, resaltado, onResaltar, onAbrir, onNueva, onAgregar, fallo, i0 = 2 }: {
  items: ItemDia[]
  alternar: (it: ItemDia) => void
  puede: (it: ItemDia) => boolean
  /** El nombre corto del evento donde vive cada pendiente ligado. */
  evento: Map<string, string>
  resaltado?: string | null
  onResaltar?: (id: string | null) => void
  onAbrir: (t: PlanTask) => void
  onNueva?: () => void
  /** Sumar una casilla al objetivo (solo si su fuente se puede escribir). */
  onAgregar?: (texto: string) => void
  fallo?: string | null
  i0?: number
}) {
  return <div className={s.lista}>
    {items.length > 0 && <ul aria-label="Lo de hoy">
      {items.map((it, n) => {
        const donde = evento.get(it.id), t = it.tarea, sePuede = puede(it)
        const meta = <>
          {it.vencida && t?.due && <span className={s.vencio} title="Vencida">{format(parseISO(t.due), 'd MMM', { locale: es })}</span>}
          {it.minuto != null && !it.vencida && <time>{horaDeMinuto(it.minuto)}{donde && <small> · {donde}</small>}</time>}
          {it.minuto == null && donde && <time><small>{donde}</small></time>}
          {t?.priority === 1 && !it.hecho && <span className={s.prio}>P1</span>}
          {t?.recurring && <Repeat2 size={11} aria-label="Se repite" />}
        </>
        return <li key={it.id} className={s.entra} style={esc(i0 + n)} data-hecho={it.hecho || undefined} data-origen={it.origen} data-vencida={it.vencida || undefined}
          data-resaltado={resaltado === it.id || undefined} onMouseEnter={() => onResaltar?.(it.id)} onMouseLeave={() => onResaltar?.(null)}>
          <button className={s.marca} role="checkbox" aria-checked={it.hecho} disabled={!sePuede} onClick={() => alternar(it)}
            aria-label={`${it.hecho ? 'Reabrir' : 'Marcar'}: ${it.texto}`}
            title={!sePuede ? (it.fija ? 'Repetición ya hecha: Todoist programó la siguiente' : undefined) : it.origen === 'tarea' ? (it.hecho ? 'Reabrir en Todoist' : 'Completar en Todoist') : it.hecho ? 'Desmarcar' : 'Marcar como hecho'}>
            <i aria-hidden><Palomita /></i>
          </button>
          {t ? <button className={s.cuerpo} onClick={() => onAbrir(t)} title={it.texto}><span className={s.texto}>{it.texto}</span>{meta}</button>
            : <button className={s.cuerpo} onClick={() => alternar(it)} disabled={!sePuede} title={it.texto}><span className={s.texto}>{it.texto}</span>{meta}</button>}
        </li>
      })}
    </ul>}
    {(onAgregar || onNueva) && <div className={s.pie}>
      {onAgregar && <Agregar vacio={null} onAgregar={onAgregar} i={i0 + items.length} />}
      {onNueva && <button className={s.nueva} onClick={onNueva} title="Tarea nueva en Todoist"><Plus size={13} aria-hidden />Tarea</button>}
    </div>}
    {fallo && <p className={s.fallo} role="alert">{fallo}</p>}
  </div>
}
