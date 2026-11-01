'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import { CATEGORIAS, CLAVE_OCULTAS, bloquesDeCalendarios, formatoHoras, guardarOcultas, horasPorCategoria, leerOcultas, type Categoria } from './categorias'
import type { PlanEvent } from './types'
import l from './leyenda.module.css'

/**
 * La leyenda de tu forma de trabajo (10 oct 2026, Daniel: «veo rojo pero no veo morado, gris, azul… segmentar por colores»).
 * Cinco chips con su color y las horas planeadas del periodo; tocar uno oculta o muestra esa categoría. Al lado, el menú
 * «Calendarios» con los de Google de origen. Lo oculto vive en localStorage (`useOcultas`); los calendarios, en las preferencias del calendario.
 */
export interface ControlLeyenda {
  categoria: (e: PlanEvent) => Categoria
  ocultas: ReadonlySet<Categoria>
  alternar: (c: Categoria) => void
  /** Visible por calendario (sin mirar la categoría): las horas de una categoría oculta siguen contándose. */
  porCalendario: (e: PlanEvent) => boolean
  calendarios?: { id: string; titulo: string; color: string | null; activo: boolean }[]
  alternarCalendario?: (id: string) => void
  /** La casilla de un grupo (Trabajo, Vida): enciende o apaga todos sus calendarios de una vez. */
  ponerCalendarios?: (ids: string[], activo: boolean) => void
}

const EVENTO = 'arbrain:categorias-ocultas'
/** Las categorías ocultas, compartidas por la sección, el panel y el chat (y entre ventanas, por `storage`). */
export function useOcultas(): [ReadonlySet<Categoria>, (c: Categoria) => void] {
  const [ocultas, setOcultas] = useState<ReadonlySet<Categoria>>(() => typeof window === 'undefined' ? new Set() : leerOcultas())
  useEffect(() => {
    const leer = (e: Event) => { if (e.type !== 'storage' || (e as StorageEvent).key === CLAVE_OCULTAS) setOcultas(leerOcultas()) }
    window.addEventListener(EVENTO, leer); window.addEventListener('storage', leer)
    return () => { window.removeEventListener(EVENTO, leer); window.removeEventListener('storage', leer) }
  }, [])
  const alternar = useCallback((c: Categoria) => {
    const s = new Set(leerOcultas()); if (s.has(c)) s.delete(c); else s.add(c)
    guardarOcultas(s); window.dispatchEvent(new Event(EVENTO))
  }, [])
  return [ocultas, alternar]
}

export function Leyenda({ ctl, eventos, desde, hasta, periodo }: { ctl: ControlLeyenda; eventos: PlanEvent[]; desde: number; hasta: number; periodo: 'semana' | 'día' }) {
  const horas = useMemo(() => horasPorCategoria(eventos.filter(e => !e.allDay && ctl.porCalendario(e))
    .map(e => ({ inicio: Date.parse(e.start), fin: Date.parse(e.end), categoria: ctl.categoria(e) })), desde, hasta), [eventos, ctl, desde, hasta])
  return <div className={l.leyenda} role="group" aria-label={`Tipos de trabajo ${periodo === 'día' ? 'del día' : 'de la semana'}`}>
    <div className={l.chips}>
      {CATEGORIAS.map(c => { const oculta = ctl.ocultas.has(c.id)
        return <button key={c.id} className={l.chip} aria-pressed={!oculta} data-oculta={oculta || undefined} style={{ '--c': c.color } as CSSProperties} onClick={() => ctl.alternar(c.id)}
          title={`${c.nombre}: ${formatoHoras(horas[c.id])} planeadas ${periodo === 'día' ? 'este día' : 'esta semana'}. ${oculta ? 'Toca para mostrar' : 'Toca para ocultar'}.`}>
          <i aria-hidden /><span className={l.largo}>{c.nombre}</span><span className={l.corto}>{c.corto}</span><b>{formatoHoras(horas[c.id])}</b>
        </button> })}
    </div>
    {ctl.calendarios && ctl.alternarCalendario && <MenuCalendarios calendarios={ctl.calendarios} alternar={ctl.alternarCalendario} poner={ctl.ponerCalendarios} />}
  </div>
}

type Calendario = NonNullable<ControlLeyenda['calendarios']>[number]

function CasillaGrupo({ nombre, calendarios, poner }: { nombre: string; calendarios: Calendario[]; poner: (ids: string[], activo: boolean) => void }) {
  const activos = calendarios.filter(c => c.activo).length
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = activos > 0 && activos < calendarios.length }, [activos, calendarios.length])
  return <label className={l.grupo}>
    <input ref={ref} type="checkbox" checked={activos === calendarios.length} onChange={() => poner(calendarios.map(c => c.id), activos < calendarios.length)} />
    <span>{nombre}</span>
  </label>
}

function MenuCalendarios({ calendarios, alternar, poner }: { calendarios: Calendario[]; alternar: (id: string) => void; poner?: (ids: string[], activo: boolean) => void }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: Event) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])
  const apagados = calendarios.filter(c => !c.activo).length
  return <div ref={raiz} className={l.menuWrap} data-more-menu>
    <button className={l.menuBoton} aria-haspopup="true" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
      Calendarios{apagados > 0 && <small>{calendarios.length - apagados}/{calendarios.length}</small>}<ChevronDown size={12} aria-hidden />
    </button>
    {abierto && <div className={l.menu} role="group" aria-label="Calendarios"><ListaCalendarios calendarios={calendarios} alternar={alternar} poner={poner} /></div>}
  </div>
}

/** Los calendarios de Google por grupo (Trabajo, Vida), con su casilla de grupo: el menú de la leyenda y el engrane. */
export function ListaCalendarios({ calendarios, alternar, poner }: { calendarios: Calendario[]; alternar: (id: string) => void; poner?: (ids: string[], activo: boolean) => void }) {
  return <>{bloquesDeCalendarios(calendarios).map(b => <div key={b.id} className={l.bloque} role="group" aria-label={b.nombre}>
    {poner ? <CasillaGrupo nombre={b.nombre} calendarios={b.calendarios} poner={poner} /> : <span className={l.grupo}>{b.nombre}</span>}
    {b.calendarios.map(c => <label key={c.id}>
      <input type="checkbox" checked={c.activo} onChange={() => alternar(c.id)} />
      <i aria-hidden style={{ background: c.color ?? 'var(--muted)' }} /><span>{c.titulo}</span>
    </label>)}
  </div>)}</>
}
