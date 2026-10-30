'use client'
/**
 * Ajustes › Panel (6 oct 2026, Daniel: «un panel de configuración… que pueda ocultar los que no quiera ver, por ejemplo Tareas»).
 * La lista de secciones del «+» del panel derecho: arrastrar con la manija para ordenar, un interruptor para mostrar u ocultar y
 * «Restablecer». Es LA MISMA configuración que Levy mueve en tiempo real con `panel {accion:"secciones"}`: vive en el servidor
 * (panel-ajustes.json) y llega a todas las ventanas. Ocultar una sección cierra su pestaña. Equipo y «Lo que llegó» salen del «+» por defecto y se vuelven a mostrar desde aquí.
 */
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { GripVertical, RotateCcw } from 'lucide-react'
import { Interruptor } from './Interruptor'
import { arrastrarFila } from '@/features/cabina/panel/arrastre-lista'
import { DONDE_POR_DEFECTO, moverEnMenu, OCULTAS_POR_DEFECTO, SECCIONES_MENU, type Donde } from '@/features/cabina/panel/menu-orden'
import { usePanelAjustes } from '@/features/cabina/panel/panel-ajustes'
import { IconoSeccion, nombreSeccion, notaSeccion } from '@/features/cabina/panel/Secciones'

/** «Dónde abre Levy» (7 oct 2026): cuál de las ventanas de Arbrain recibe lo que Levy abre. Izquierda/derecha se miden en la pantalla, no por número de ventana. */
const OPCIONES_DONDE: { id: Donde; titulo: string; nota: string }[] = [
  { id: 'izquierda', titulo: 'La de la izquierda', nota: 'La ventana que esté más a la izquierda de la pantalla' },
  { id: 'derecha', titulo: 'La de la derecha', nota: 'La que esté más a la derecha' },
  { id: 'principal', titulo: 'El panel principal', nota: 'Siempre el panel de la ventana principal' },
]

export function SeccionPanel() {
  const { ajustes, error, cargar, guardar, restablecer } = usePanelAjustes()
  useEffect(() => { cargar() }, [cargar])
  const lista = useRef<HTMLUListElement>(null)
  const { orden, ocultas, donde } = ajustes
  const deFabrica = orden.join() === SECCIONES_MENU.join() && ocultas.slice().sort().join() === [...OCULTAS_POR_DEFECTO].sort().join() && donde === DONDE_POR_DEFECTO

  const arrastrar = (id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!lista.current) return
    arrastrarFila(e, { lista: lista.current, selector: '[data-fila]', desde: orden.indexOf(id), alSoltar: destino => { void guardar({ orden: moverEnMenu(orden, id, destino) }) } })
  }
  const teclas = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = orden.indexOf(id)
    const a = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? orden.length - 1 : null
    if (a == null) return
    e.preventDefault()
    if (a >= 0 && a < orden.length && a !== i) {
      void guardar({ orden: moverEnMenu(orden, id, a) })
      requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>(`[data-fila="${id}"] [data-manija]`)?.focus())
    }
  }
  const alternar = (id: string, mostrar: boolean) => { void guardar({ ocultas: mostrar ? ocultas.filter(x => x !== id) : [...ocultas, id] }) }

  return (
    <div className="space-y-4" data-seccion-panel>
      <section className="solid-card overflow-hidden" data-donde-abre-levy>
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-foreground/90">Dónde abre Levy</h3>
          <p className="mt-0.5 text-xs leading-snug text-muted">Lo que Levy abre (documentos, videos, vistas) cae en esa ventana. Si no existe, cae en el panel principal. La otra conserva lo tuyo, como el Día y el Taller.</p>
        </div>
        <div role="radiogroup" aria-label="Dónde abre Levy" className="grid gap-2 p-3 sm:grid-cols-3 sm:p-4">
          {OPCIONES_DONDE.map(o => {
            const activa = donde === o.id
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={activa}
                data-donde={o.id}
                onClick={() => { if (!activa) void guardar({ donde: o.id }) }}
                className={`min-h-11 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${activa ? 'border-primary/60 bg-primary/10' : 'border-border-subtle hover:bg-card-hover'}`}
              >
                <span className="block text-[13.5px] font-medium text-foreground">{o.titulo}</span>
                <span className="block text-xs leading-snug text-muted">{o.nota}</span>
              </button>
            )
          })}
        </div>
      </section>
      <section className="solid-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground/90">Secciones del «+»</h3>
            <p className="mt-0.5 text-xs leading-snug text-muted">Arrastra para ordenar. Lo que apagues deja de salir en el «+» y su pestaña se cierra. Levy puede cambiarlo en vivo.</p>
          </div>
          <button
            type="button"
            onClick={() => { void restablecer() }}
            disabled={deFabrica}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-xs text-foreground/80 transition-colors hover:bg-card-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-40"
            title="Volver al orden de siempre, con Equipo y Lo que llegó fuera del «+», y que Levy abra en la ventana de la izquierda"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Restablecer
          </button>
        </div>
        <ul ref={lista} className="divide-y divide-border-subtle" aria-label="Secciones del panel">
          {orden.map(id => {
            const visible = !ocultas.includes(id)
            return (
              <li key={id} data-fila={id} data-visible={visible || undefined} className="relative flex items-center gap-2 bg-surface px-2 py-1 data-[arrastrada]:rounded-lg data-[arrastrada]:shadow-lg sm:px-3">
                <button
                  type="button"
                  data-manija
                  onPointerDown={arrastrar(id)}
                  onKeyDown={teclas(id)}
                  aria-label={`Mover ${nombreSeccion(id)} (flechas arriba y abajo)`}
                  title="Arrastra para acomodar · ↑ ↓ con el teclado"
                  className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:bg-card-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <GripVertical className="size-4" aria-hidden />
                </button>
                <span className={`flex min-w-0 flex-1 items-center gap-2 ${visible ? '' : 'opacity-55'}`}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground"><IconoSeccion id={id} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-foreground">{nombreSeccion(id)}</span>
                    <span className="block truncate text-xs text-muted">{notaSeccion(id)}</span>
                  </span>
                </span>
                <Interruptor activo={visible} onCambio={mostrar => alternar(id, mostrar)} etiqueta={visible ? `Ocultar ${nombreSeccion(id)} del «+»` : `Mostrar ${nombreSeccion(id)} en el «+»`} />
              </li>
            )
          })}
        </ul>
        {error && <p role="alert" className="border-t border-border-subtle px-4 py-2 text-xs text-red-500 sm:px-5">No quedó guardado: {error}</p>}
      </section>
    </div>
  )
}
