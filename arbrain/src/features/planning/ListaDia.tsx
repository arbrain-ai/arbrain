'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Flag, Plus, Repeat2 } from 'lucide-react'
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
 *
 * Prioridades como en Todoist (8 nov 2026, Daniel: «justo como lo hace y permite Todoist»): el círculo lleva el color de su prioridad
 * (P1 rojo, P2 naranja, P3 azul, P4 gris) en vez de la etiqueta «P1», y se cambia con la bandera de la fila, con clic derecho o con
 * las teclas 1–4 sobre la fila (el mouse encima o el foco dentro), igual que allá. Un criterio que dice lo mismo que una tarea no se
 * pinta aparte: la fila es la tarea y su tooltip dice que cerrarla marca el criterio.
 */
export type Prioridad = 1 | 2 | 3 | 4
export const PRIORIDADES: { p: Prioridad; nombre: string }[] = [{ p: 1, nombre: 'Prioridad 1' }, { p: 2, nombre: 'Prioridad 2' }, { p: 3, nombre: 'Prioridad 3' }, { p: 4, nombre: 'Prioridad 4' }]
/** La prioridad de una tecla («1»…«4») sin modificadores, o null. */
export const prioridadDeTecla = (e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): Prioridad | null =>
  !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-4]$/.test(e.key) ? Number(e.key) as Prioridad : null

/** La pista de cada forma (8 nov 2026, «¿por qué unas son cuadradas y otras círculo?»). */
export function pistaDeMarca(it: ItemDia, sePuede: boolean): string {
  if (it.origen === 'casilla') return `Criterio del objetivo del día${sePuede ? (it.hecho ? ' · tocar para desmarcar' : ' · tocar para marcar') : ''}`
  const t = it.tarea
  const accion = !sePuede ? (it.fija ? ' · repetición ya hecha: Todoist programó la siguiente' : '') : it.hecho ? ' · tocar para reabrir' : ' · tocar para completar'
  const criterio = it.criterio ? `\nTambién marca el criterio: «${it.criterio.texto}»` : ''
  return `Tarea de Todoist${t ? ` · Prioridad ${t.priority}` : ''}${accion}${criterio}`
}
export function ListaDia({ items, alternar, puede, evento, resaltado, onResaltar, onAbrir, onPrioridad, onNueva, onAgregar, fallo, i0 = 2 }: {
  items: ItemDia[]
  alternar: (it: ItemDia) => void
  puede: (it: ItemDia) => boolean
  /** El nombre corto del evento donde vive cada pendiente ligado. */
  evento: Map<string, string>
  resaltado?: string | null
  onResaltar?: (id: string | null) => void
  onAbrir: (t: PlanTask) => void
  /** Cambiar la prioridad en Todoist; sin ella, el color se ve pero no se cambia. */
  onPrioridad?: (t: PlanTask, p: Prioridad) => void
  onNueva?: () => void
  /** Sumar una casilla al objetivo (solo si su fuente se puede escribir). */
  onAgregar?: (texto: string) => void
  fallo?: string | null
  i0?: number
}) {
  // La fila bajo el mouse o con el foco: ahí caen las teclas 1–4, como en Todoist.
  const encima = useRef<string | null>(null)
  // El menú va al cuerpo del documento (la franja recorta lo que se sale) y se ancla a la bandera o al clic derecho.
  const [menu, setMenuEstado] = useState<{ id: string; lugar: CSSProperties } | null>(null)
  const setMenu = (id: string | null, x?: number, y?: number, ancla?: HTMLElement | null) => {
    if (!id) { setMenuEstado(null); return }
    const r = ancla?.getBoundingClientRect(), alto = 4 * 34 + 10, ancho = 200
    const izq = Math.max(8, Math.min((r ? r.right - ancho : x ?? 0), innerWidth - ancho - 8))
    const abajo = r ? r.bottom + 4 : y ?? 0
    setMenuEstado({ id, lugar: { left: izq, top: abajo + alto > innerHeight - 8 ? Math.max(8, (r ? r.top - 4 : abajo) - alto) : abajo } })
  }
  const vivas = useRef(items); vivas.current = items
  const cambiar = useRef(onPrioridad); cambiar.current = onPrioridad
  useEffect(() => {
    if (!onPrioridad) return
    const tecla = (e: KeyboardEvent) => {
      const p = prioridadDeTecla(e), t = vivas.current.find(i => i.id === encima.current && !i.hecho)?.tarea
      const objetivo = e.target as HTMLElement | null
      if (!p || !t || e.isComposing || objetivo?.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="textbox"],[data-habitos]')) return
      // Antes que los atajos del calendario (1 = Día, 3 = Semana): sobre una tarea, el número es su prioridad.
      e.preventDefault(); e.stopImmediatePropagation()
      cambiar.current?.(t, p); setMenu(null)
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [Boolean(onPrioridad)]) // eslint-disable-line react-hooks/exhaustive-deps -- lee lo vivo por refs
  useEffect(() => {
    if (!menu) return
    const fuera = (e: PointerEvent) => { if (!(e.target as HTMLElement | null)?.closest('[data-menu-prioridad]')) setMenu(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null) } }
    const cerrar = () => setMenu(null)
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', esc, true)
    window.addEventListener('scroll', cerrar, true); window.addEventListener('resize', cerrar)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc, true); window.removeEventListener('scroll', cerrar, true); window.removeEventListener('resize', cerrar) }
  }, [menu])
  return <div className={s.lista}>
    {items.length > 0 && <ul aria-label="Lo de hoy">
      {items.map((it, n) => {
        const donde = evento.get(it.id), t = it.tarea, sePuede = puede(it), conMenu = Boolean(t && onPrioridad && !it.hecho)
        const meta = <>
          {it.vencida && t?.due && <span className={s.vencio} title="Vencida">{format(parseISO(t.due), 'd MMM', { locale: es })}</span>}
          {it.minuto != null && !it.vencida && <time>{horaDeMinuto(it.minuto)}{donde && <small> · {donde}</small>}</time>}
          {it.minuto == null && donde && <time><small>{donde}</small></time>}
          {t?.recurring && <Repeat2 size={11} aria-label="Se repite" />}
        </>
        return <li key={it.id} className={s.entra} style={esc(i0 + n)} data-hecho={it.hecho || undefined} data-origen={it.origen} data-vencida={it.vencida || undefined}
          data-p={t?.priority} data-criterio={it.criterio ? '' : undefined} data-menu-abierto={menu?.id === it.id || undefined}
          data-resaltado={resaltado === it.id || undefined}
          onMouseEnter={() => { encima.current = it.id; onResaltar?.(it.id) }} onMouseLeave={() => { if (encima.current === it.id) encima.current = null; onResaltar?.(null) }}
          onFocus={() => { encima.current = it.id }} onBlur={() => { if (encima.current === it.id) encima.current = null }}
          onContextMenu={conMenu ? e => { e.preventDefault(); setMenu(it.id, e.clientX, e.clientY) } : undefined}>
          <button className={s.marca} role="checkbox" aria-checked={it.hecho} disabled={!sePuede} onClick={() => alternar(it)}
            aria-label={`${it.hecho ? 'Reabrir' : 'Marcar'}: ${it.texto}`} title={pistaDeMarca(it, sePuede)}>
            <i aria-hidden><Palomita /></i>
          </button>
          {t ? <button className={s.cuerpo} onClick={() => onAbrir(t)} title={it.texto}><span className={s.texto}>{it.texto}</span>{meta}</button>
            : <button className={s.cuerpo} onClick={() => alternar(it)} disabled={!sePuede} title={it.texto}><span className={s.texto}>{it.texto}</span>{meta}</button>}
          {conMenu && <button className={s.bandera} data-menu-prioridad aria-label={`Prioridad: P${t!.priority}`} aria-haspopup="menu" aria-expanded={menu?.id === it.id}
            title="Prioridad (1–4 con el mouse encima, o clic derecho)" onClick={e => setMenu(menu?.id === it.id ? null : it.id, 0, 0, e.currentTarget)}><Flag size={13} aria-hidden /></button>}
          {menu?.id === it.id && t && createPortal(<div className={`${s.menu} ${s.lista}`} style={menu.lugar} role="menu" aria-label="Prioridad" data-menu-prioridad>
            {PRIORIDADES.map(o => <button key={o.p} type="button" role="menuitemradio" aria-checked={t.priority === o.p} data-p={o.p}
              onClick={() => { onPrioridad?.(t, o.p); setMenu(null) }}>
              <Flag size={14} aria-hidden /><span>{o.nombre}</span>{t.priority === o.p ? <Check size={13} aria-hidden /> : <kbd>{o.p}</kbd>}
            </button>)}
          </div>, document.body)}
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
