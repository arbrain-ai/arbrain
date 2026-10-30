'use client'
/**
 * Secciones que el dueño acomoda a su gusto (15 oct 2026, Daniel: «permíteme unos botones para reordenar todo esto, tipo
 * agarrar y reordenar con animación y todo»). Cada sección lleva una manija de seis puntos arriba a la derecha:
 *  · Con el ratón o el dedo: agarrar la manija y arrastrar. La sección sigue al cursor y las vecinas abren hueco con el
 *    resorte de las pestañas (arrastre-lista.ts: el DOM no se toca durante el gesto; el orden cambia al soltar).
 *  · Con el teclado: foco en la manija y ↑/↓ (Inicio/Fin). Las secciones se deslizan a su lugar nuevo (FLIP con la Web
 *    Animations API, solo en ese momento) y un lector de pantalla oye la posición nueva.
 * Nada se anima en reposo; con «reducir movimiento», el cambio es instantáneo. El orden vive en orden-taller.ts.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import { arrastrarFila } from './arrastre-lista'
import { indiceCompleto, useOrdenTaller, type ListaTaller } from './orden-taller'
import o from './reordenables.module.css'

export interface Reordenable { id: string; nombre: string; nodo: ReactNode }

const reducido = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function Reordenables({ lista, items, className }: { lista: ListaTaller; items: Reordenable[]; className?: string }) {
  const { orden, mover } = useOrdenTaller(lista, items.map(x => x.id))
  const caja = useRef<HTMLDivElement>(null)
  const antes = useRef<Map<string, DOMRect> | null>(null)
  const enfocar = useRef<string | null>(null)
  const [aviso, setAviso] = useState('')
  const porId = new Map(items.map(x => [x.id, x]))
  const visibles = orden.filter(id => porId.get(id)?.nodo)

  // FLIP: tras un movimiento por teclado, cada sección sale de donde estaba y se desliza a su lugar nuevo.
  useLayoutEffect(() => {
    const prev = antes.current; antes.current = null
    const el = caja.current
    if (enfocar.current) { el?.querySelector<HTMLElement>(`[data-manija="${enfocar.current}"]`)?.focus(); enfocar.current = null }
    if (!prev || !el || reducido()) return
    for (const nodo of el.querySelectorAll<HTMLElement>(':scope > [data-orden]')) {
      const a = prev.get(nodo.dataset.orden!), b = nodo.getBoundingClientRect()
      const dy = a ? a.top - b.top : 0
      if (Math.abs(dy) > 1) nodo.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
    }
  }, [orden])

  const medir = () => {
    const m = new Map<string, DOMRect>()
    caja.current?.querySelectorAll<HTMLElement>(':scope > [data-orden]').forEach(n => m.set(n.dataset.orden!, n.getBoundingClientRect()))
    antes.current = m
  }
  const anunciar = (id: string, pos: number) => setAviso(`${porId.get(id)?.nombre ?? id}: ahora es la ${pos + 1} de ${visibles.length}.`)
  const llevar = (id: string, destino: number) => { mover(id, indiceCompleto(orden, visibles, id, destino)); anunciar(id, destino) }

  return <div ref={caja} className={`${o.lista}${className ? ` ${className}` : ''}`}>
    {visibles.map((id, i) => {
      const it = porId.get(id)!
      return <div key={id} data-orden={id} className={o.item}>
        <button type="button" className={o.manija} data-manija={id}
          aria-label={`Mover «${it.nombre}» (${i + 1} de ${visibles.length}). Arrástrala o usa las flechas arriba y abajo.`}
          title={`Agarra para mover «${it.nombre}»`}
          onPointerDown={e => { if (caja.current) arrastrarFila(e, { lista: caja.current, selector: ':scope > [data-orden]', desde: i, alSoltar: d => llevar(id, d) }) }}
          onKeyDown={e => {
            const a = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? visibles.length - 1 : null
            if (a == null) return
            e.preventDefault(); e.stopPropagation()
            if (a < 0 || a >= visibles.length || a === i) return
            medir(); enfocar.current = id; llevar(id, a)
          }}>
          <GripVertical size={14} aria-hidden />
        </button>
        {it.nodo}
      </div>
    })}
    <span className={o.aviso} role="status" aria-live="polite">{aviso}</span>
  </div>
}
