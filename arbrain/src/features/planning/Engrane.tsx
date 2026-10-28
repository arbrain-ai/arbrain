'use client'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Filter, Keyboard, PanelRightOpen, RefreshCw, Settings } from 'lucide-react'
import { useModoPresentacion } from '@/shared/stores/presentacion-store'
import { SEMANAS_MES, type Ajustes } from './ajustes'
import { CUADRANTES, type Cuadrante, type Tarifa } from './drip'
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

/** DRIP en el engrane (24 oct 2026): qué cuadrantes se ven y la tarifa de recompra (Buyback Rate, en el almacén del servidor). */
export interface DripEngrane {
  ocultas: ReadonlySet<Cuadrante>; alternar: (c: Cuadrante) => void
  tarifa: Tarifa | null
  /** La tarifa es la de la persona (no la de la instalación). */
  propia: boolean
  poner: (monto: number | null, moneda?: string) => Promise<unknown>
  /** Bloques de la Semana Perfecta guardada (0 = sin diseñar). */
  bloquesPerfectos: number
}

export function Engrane({ ajustes, poner, diasActual, leyenda, drip, matriz, acciones }: {
  ajustes: Ajustes; poner: (c: Partial<Ajustes>) => void
  /** Los días que se ven ahora (con «Auto», los que caben). */
  diasActual: number
  leyenda: ControlLeyenda; drip?: DripEngrane; acciones: AccionesEngrane
  /** La matriz DRIP (te paga / paga poco) que antes vivía en la barra. */
  matriz?: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const presentacion = useModoPresentacion()
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
        {/* Pantalla compartida (25 oct 2026, pedido del dueño): Arbrain no sabe cuándo se graba o se comparte, así que es un interruptor
            de este equipo (el mismo modo presentación de «Hábitos de hoy»). Prendido, un hábito privado se ve como «Hábito privado». */}
        <Interruptor etiqueta="Pantalla compartida" ayuda="Al grabar o compartir: los hábitos privados se ven como «Hábito privado»" valor={presentacion.activo} onCambio={v => { if (v !== presentacion.activo) presentacion.alternar() }} />
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
      {/* DRIP (24 oct 2026): reemplaza las categorías como color. Cuadrantes a la vista y la tarifa de recompra.
          La matriz vive aquí desde el 25 oct 2026 (pedido del dueño: «la matriz va dentro del botón de config»): la barra queda en Hoy · ‹ › ·
          fecha · D S M · + · engrane. Sin gobierno (la vista del chat), las cuatro pastillas de antes. */}
      <Seccion titulo="DRIP">
        {drip && (matriz ?? <div className={e.categorias}>{CUADRANTES.map(c => { const oculta = drip.ocultas.has(c.id)
          return <button key={c.id} aria-pressed={!oculta} data-oculta={oculta || undefined} style={{ '--c': c.color } as CSSProperties} onClick={() => drip.alternar(c.id)} title={c.lema}><i aria-hidden />{c.nombre}</button> })}</div>)}
        {drip && <TarifaRecompra drip={drip} />}
        {drip && <Interruptor etiqueta="Semana perfecta" ayuda={drip.bloquesPerfectos ? `${drip.bloquesPerfectos} bloques en fantasma detrás de tu semana` : 'Sin diseñar: dile a Levy «armemos mi semana perfecta»'} valor={ajustes.semanaPerfecta} onCambio={v => poner({ semanaPerfecta: v })} />}
        <Interruptor etiqueta="Rutina a futuro" ayuda="Día y Semana: lo que falta de tu rutina. Lo que ya pasó y tus compromisos se ven siempre" valor={ajustes.rutinaFutura} onCambio={v => poner({ rutinaFutura: v })} />
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

/**
 * La tarifa de recompra (Buyback Rate, *Buy Back Your Time* p. 63): lo que te paga tu empresa al año ÷ 8,000 = lo que vale una hora
 * que le compras a alguien más. Se escribe en el almacén DRIP del servidor (el mismo que lee el Levy de la persona). Vacía, el
 * calendario dice solo horas recompradas y «fija tu tarifa».
 */
function TarifaRecompra({ drip }: { drip: DripEngrane }) {
  const [anual, setAnual] = useState('')
  const [hora, setHora] = useState(drip.tarifa ? String(drip.tarifa.monto) : '')
  const [moneda, setMoneda] = useState(drip.tarifa?.moneda ?? 'USD')
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado' | 'error'>('quieto')
  useEffect(() => { setHora(drip.tarifa ? String(drip.tarifa.monto) : ''); setMoneda(drip.tarifa?.moneda ?? 'USD') }, [drip.tarifa])
  const guardar = async (monto: number | null, mon = moneda) => {
    setEstado('guardando')
    try { await drip.poner(monto, mon); setEstado('guardado') } catch { setEstado('error') }
  }
  const desdeAnual = (v: string) => { setAnual(v); const n = Number(v.replace(/[^\d.]/g, '')); if (n > 0) setHora(String(Math.round(n / 8000 * 100) / 100)) }
  const confirmar = () => { const n = Number(hora); if (!hora.trim()) void guardar(null); else if (n > 0) void guardar(n) }
  return <div className={e.tarifa}>
    <span className={e.tarifaRotulo}><b>Tarifa de recompra</b><small>Lo que te paga tu empresa al año ÷ 8,000{drip.tarifa && !drip.propia ? ' · la de tu instalación' : ''}</small></span>
    <span className={e.tarifaCampos}>
      <label><small>Al año</small><input inputMode="decimal" placeholder="200000" value={anual} onChange={ev => desdeAnual(ev.target.value)} onBlur={confirmar} onKeyDown={ev => { if (ev.key === 'Enter') confirmar() }} aria-label="Lo que te paga tu empresa al año" /></label>
      <span aria-hidden>÷ 8,000 =</span>
      <label><small>Por hora</small><input inputMode="decimal" placeholder="—" value={hora} onChange={ev => setHora(ev.target.value.replace(/[^\d.]/g, ''))} onBlur={confirmar} onKeyDown={ev => { if (ev.key === 'Enter') confirmar() }} aria-label="Tarifa de recompra por hora" /></label>
      <select aria-label="Moneda" value={moneda} onChange={ev => { setMoneda(ev.target.value); if (Number(hora) > 0) void guardar(Number(hora), ev.target.value) }}>{['USD', 'MXN', 'EUR', 'COP', 'ARS', 'CLP'].map(m => <option key={m}>{m}</option>)}</select>
    </span>
    <small className={e.tarifaEstado} role="status">{estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardada.' : estado === 'error' ? 'No se guardó. Reintenta.' : ''}</small>
  </div>
}
