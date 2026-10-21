'use client'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Filter, Keyboard, PanelRightOpen, RefreshCw, Settings } from 'lucide-react'
import { SEMANAS_MES, type Ajustes } from './ajustes'
import { CATEGORIAS } from './categorias'
import { ListaCalendarios, type ControlLeyenda } from './Leyenda'
import { DIAS_VISTA, type DiasVista } from './semana-horas'
import e from './engrane.module.css'

/**
 * El engrane (10 oct 2026, Daniel: «en lugar de tener un botón de enfoque, otro de horas, otro de agenda, deberíamos tener un
 * botón tipo tres puntitos o engrane»). Concentra cómo se ve el calendario. Desde la ronda 3 (10 oct 2026) es UNA hoja igual en
 * Día, Semana y Mes: Vista (días, Enfoque, fines de semana, cómo se ve cada escala), Horas, calendarios, categorías y las acciones
 * al pie. Todo se guarda solo (ajustes.ts).
 */
export interface AccionesEngrane {
  onFiltros?: () => void
  tareas?: { abierto: boolean; alternar: () => void }
  onAtajos?: () => void
  onActualizar: () => void
  actualizando: boolean
}

export function Engrane({ ajustes, poner, diasActual, leyenda, acciones }: {
  ajustes: Ajustes; poner: (c: Partial<Ajustes>) => void
  /** Los días que se ven ahora (con «Auto», los que caben). */
  diasActual: number
  leyenda: ControlLeyenda; acciones: AccionesEngrane
}) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (ev: Event) => { if (!raiz.current?.contains(ev.target as Node)) setAbierto(false) }
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); setAbierto(false) } }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', tecla, true)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla, true) }
  }, [abierto])
  const cerrarY = (f?: () => void) => () => { setAbierto(false); f?.() }
  const horas = Array.from({ length: 25 }, (_, h) => h)

  return <span ref={raiz} className={e.wrap} data-more-menu>
    <button className={e.boton} aria-label="Ajustes del calendario" aria-haspopup="dialog" aria-expanded={abierto} title="Ajustes del calendario" onClick={() => setAbierto(v => !v)}><Settings size={16} aria-hidden /></button>
    {abierto && <div className={e.hoja} role="dialog" aria-label="Ajustes del calendario">
      {/* Una sola hoja para Día, Semana y Mes (10 oct 2026, el dueño: «en pro de no repetir detalles»): los mismos ajustes, en el mismo
          orden, sin importar la escala. Cada uno vale para todas las vistas donde tiene sentido. */}
      <Seccion titulo="Vista">
        <Fila etiqueta={<>Días a la vista{ajustes.dias === null && diasActual > 0 && <small>{diasActual} por el ancho</small>}</>}>
          <Segmentos valor={ajustes.dias ?? 'auto'} opciones={[{ v: 'auto' as const, t: 'Auto' }, ...DIAS_VISTA.map(n => ({ v: n, t: String(n) }))]}
            onCambio={n => poner({ dias: n === 'auto' ? null : n as DiasVista })} nombre="Días a la vista" />
        </Fila>
        <Interruptor etiqueta="Enfoque" ayuda="Sin categorías ni subtítulos; las horas más altas" valor={ajustes.enfoque} onCambio={v => poner({ enfoque: v })} />
        <Interruptor etiqueta="Fines de semana" valor={ajustes.finDeSemana} onCambio={v => poner({ finDeSemana: v })} />
        <Fila etiqueta="Semana"><Segmentos valor={ajustes.vistaSemana} opciones={[{ v: 'horas', t: 'Horas' }, { v: 'agenda', t: 'Agenda' }]} onCambio={v => poner({ vistaSemana: v })} nombre="Ver la semana como" /></Fila>
        <Fila etiqueta="Mes"><Segmentos valor={ajustes.mesVista} opciones={[{ v: 'recorrido', t: 'Recorrido' }, { v: 'cuadricula', t: 'Cuadrícula' }]} onCambio={v => poner({ mesVista: v })} nombre="Ver el mes como" /></Fila>
        {ajustes.mesVista === 'cuadricula' && <Fila etiqueta="Semanas del mes"><Segmentos valor={ajustes.mesSemanas} opciones={SEMANAS_MES.map(n => ({ v: n, t: n ? String(n) : 'Mes' }))} onCambio={n => poner({ mesSemanas: n })} nombre="Semanas a la vista" /></Fila>}
      </Seccion>
      <Seccion titulo="Horas">
        <Fila etiqueta="Rango">
          <span className={e.rango}>
            <select aria-label="Desde" value={ajustes.desde} onChange={ev => poner({ desde: Number(ev.target.value) })}>{horas.slice(0, 21).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
            <span aria-hidden>–</span>
            <select aria-label="Hasta" value={ajustes.hasta} onChange={ev => poner({ hasta: Number(ev.target.value) })}>{horas.slice(4).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
          </span>
        </Fila>
        <Fila etiqueta="Densidad"><Segmentos valor={ajustes.densidad} opciones={[{ v: 'comoda', t: 'Cómoda' }, { v: 'compacta', t: 'Compacta' }]} onCambio={v => poner({ densidad: v })} nombre="Densidad" /></Fila>
        <Interruptor etiqueta="Zona horaria" ayuda="En la esquina de las horas" valor={ajustes.zona} onCambio={v => poner({ zona: v })} />
      </Seccion>
      {leyenda.calendarios && leyenda.alternarCalendario && <Seccion titulo="Calendarios"><div className={e.calendarios}><ListaCalendarios calendarios={leyenda.calendarios} alternar={leyenda.alternarCalendario} poner={leyenda.ponerCalendarios} /></div></Seccion>}
      <Seccion titulo="Categorías">
        <div className={e.categorias}>{CATEGORIAS.map(c => { const oculta = leyenda.ocultas.has(c.id)
          return <button key={c.id} aria-pressed={!oculta} data-oculta={oculta || undefined} style={{ '--c': c.color } as CSSProperties} onClick={() => leyenda.alternar(c.id)}><i aria-hidden />{c.corto}</button> })}</div>
        <Interruptor etiqueta="Eventos rechazados" ayuda="Los que rechazaste en Google" valor={ajustes.rechazados} onCambio={v => poner({ rechazados: v })} />
      </Seccion>
      <div className={e.pie}>
        {acciones.onFiltros && <button onClick={cerrarY(acciones.onFiltros)}><Filter size={14} aria-hidden />Filtros de tareas</button>}
        {acciones.tareas && <button role="menuitemcheckbox" aria-checked={acciones.tareas.abierto} onClick={cerrarY(acciones.tareas.alternar)}><PanelRightOpen size={14} aria-hidden />Panel de tareas</button>}
        {acciones.onAtajos && <button onClick={cerrarY(acciones.onAtajos)}><Keyboard size={14} aria-hidden />Atajos</button>}
        <button disabled={acciones.actualizando} onClick={cerrarY(acciones.onActualizar)}><RefreshCw size={14} aria-hidden />Actualizar</button>
      </div>
    </div>}
  </span>
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className={e.seccion} aria-label={titulo}><h4>{titulo}</h4>{children}</section>
}
function Fila({ etiqueta, children }: { etiqueta: ReactNode; children: ReactNode }) {
  return <div className={e.fila}><span>{etiqueta}</span>{children}</div>
}
function Segmentos<T extends string | number>({ valor, opciones, onCambio, nombre }: { valor: T; opciones: { v: T; t: string }[]; onCambio: (v: T) => void; nombre: string }) {
  return <span className={e.segmentos} role="radiogroup" aria-label={nombre}>
    {opciones.map(o => <button key={String(o.v)} role="radio" aria-checked={o.v === valor} onClick={() => onCambio(o.v)}>{o.t}</button>)}
  </span>
}
function Interruptor({ etiqueta, ayuda, valor, onCambio }: { etiqueta: string; ayuda?: string; valor: boolean; onCambio: (v: boolean) => void }) {
  return <button className={e.interruptor} role="switch" aria-checked={valor} onClick={() => onCambio(!valor)}>
    <span><b>{etiqueta}</b>{ayuda && <small>{ayuda}</small>}</span><i aria-hidden />
  </button>
}
