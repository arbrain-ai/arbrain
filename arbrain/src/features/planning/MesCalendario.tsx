'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PunteroReact } from 'react'
import { format, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import type { Goal, GoalSnapshot } from '@/features/goals/model'
import { useHabitRecords } from '@/features/sistema/useHabitRecords'
import { dayKey } from './model'
import { objetivoDe, periodoDeEscala, rejillaDelMes, tiempoDelPeriodo } from './periodo-vivo'
import { entregablesDe } from './claridad'
import { Entregables, Segmentos } from './ObjetivoCaja'
import { FranjaPlan } from './FranjaPlan'
import { useAhora } from './vivo-piezas'
import { esArrastre, sumarDia } from './semana-horas'
import { DRIP } from './drip'
import { diasConHabito, diasEntre, mesCalendario, objetivoDelDiaMes, ritmoTipico, type BarraMes, type DiaMes, type ItemMes, type SemanaMes } from './mes-calendario'
import type { PlanEvent, PlanItem, PlanTask, PlanningSnapshot } from './types'
import { tr, trn, trNodos } from '@/shared/i18n'
import { localeFechas } from '@/shared/i18n/fechas'
import m from './mes-calendario.module.css'

/**
 * El Mes como un calendario de verdad (17 nov 2026, Daniel: «creo que prefiero un calendario mensual normal… apalancándonos ya del
 * ecosistema en la vista de día… pensemos en un calendario de toda la vida, pero con las mejores prácticas posibles para la gestión
 * del tiempo… aprovecha e incluye mi viaje a Monterrey del 26-29»). La cuadrícula de siempre a pantalla completa y sin scroll:
 *   - arriba, UNA línea: la meta del mes, sus entregables (k de n) y en qué día del mes vas;
 *   - cada semana es un renglón con su objetivo a la izquierda (S del programa, fase, objetivo y su carga contada);
 *   - en cada día, por importancia (mes-calendario.ts): lo de todo el día, los compromisos con personas o de hora fija, lo que vence en
 *     Todoist y los bloques propios; lo que no cabe es «+N», que abre el Día;
 *   - lo de varios días (Monterrey, el periodo de uno a uno) es una barra; los días fuera de casa se tiñen de morado;
 *   - la rutina no es texto en cada celda: es el ritmo de todos los días, dicho UNA vez al pie (ritual, trabajo fuerte, gym, noche);
 *   - las semanas que ya pasaron se encogen (el alto va a lo que falta) y lo ya cerrado no ocupa celdas;
 *   - la carga de cada semana es UNA medida: horas con personas (clases, llamadas, uno a uno), contadas del calendario;
 *   - se planifica ahí: clic en el número abre el Día, el «+» crea en ese día y arrastrar mueve (con la guarda de invitados).
 * Los datos son los mismos del Día (la misma pluma, los mismos filtros, la misma lectura); nada se duplica.
 */

/** Lo que mide cada renglón de la celda (px): número, carril de barra, línea de un elemento y tira del ritmo. */
const ALTO = { numero: 24, carril: 19, linea: 16, holgura: 6 } as const
/** Cuánto pesa en alto una semana que ya pasó frente a una que viene (el juez del 17 nov: «encoger el pasado») y la que casi no es del
 *  mes (3 días o menos dentro: el 30 nov con su semana de diciembre). */
const PESO_PASADA = 0.55, PESO_AJENA = 0.7

/** Los tonos de la atención salen de DRIP (el mismo color en Día, Semana y Mes): morado = Invertir (el viaje), bronce = Producir. */
const TONOS = { '--morado': DRIP.invertir.color, '--bronce': DRIP.producir.color } as CSSProperties

type Arrastre = { item: PlanItem; desde: string; agarre: string; x0: number; y0: number; activo: boolean; titulo: string; tono: string | null; barra: boolean; largo: number }

export function MesCalendario({ fecha, goals, snapshot, cargando, eventos, todos, tareas, zona, programa, guardarObjetivo, onDia, onSemana, onAbrir, onMover, onCrear }: {
  fecha: Date
  goals: { data: GoalSnapshot | null; error: string | null }
  snapshot: PlanningSnapshot | null; cargando: boolean
  /** Lo que se pinta (calendarios encendidos, sin los de objetivos ni la mecánica del programa). */
  eventos: readonly PlanEvent[]
  /** Todo lo leído de los calendarios encendidos, para medir el ritmo. */
  todos: readonly PlanEvent[]
  /** Tareas abiertas de Todoist (con los filtros del calendario). */
  tareas: readonly PlanTask[]
  zona: string
  programa: { lunes0: number; ultima: number } | null
  guardarObjetivo?: (g: Goal) => Promise<unknown>
  onDia?: (dia: string) => void
  onSemana?: (lunes: string) => void
  onAbrir?: (item: PlanItem) => void
  /** Soltar en otro día: `hacia` es el día nuevo (el inicio, en lo de varios días). */
  onMover?: (item: PlanItem, hacia: string) => void
  onCrear?: (dia: string) => void
}) {
  const ahora = useAhora(), hoy = dayKey(new Date(ahora))
  const { desde, hasta } = useMemo(() => periodoDeEscala('month', fecha), [fecha])
  const rejilla = useMemo(() => rejillaDelMes(fecha), [fecha])
  const goal = useMemo(() => goals.data?.goals.find(g => g.scope === 'month' && g.start === desde) ?? null, [goals.data, desde])
  const objetivoMes = useMemo(() => goals.data ? objetivoDe(goals.data.goals, snapshot, 'month', desde) : null, [goals.data, snapshot, desde])
  const mes = format(parseISO(desde), 'MMMM', { locale: localeFechas() })

  // El objetivo del día cumplido también vive en el hábito `objetivo_dia` (la estrella del Día lo marca ahí): se lee, nunca se escribe.
  const primer = rejilla[0][0], ultimo = rejilla.at(-1)![6]
  const hastaHabitos = hoy < ultimo ? hoy : ultimo
  const habitos = useHabitRecords({ date: hastaHabitos, from: primer, to: hastaHabitos, timeZone: zona })
  // De los DATOS, no de la función `record` del hook (identidad fija: el memo no se enteraba de que llegaron los hábitos).
  const objetivoHabito = useMemo(() => diasConHabito(habitos.data, 'objetivo_dia', { from: primer, to: hastaHabitos }), [habitos.data, primer, hastaHabitos])
  const semanas = useMemo<SemanaMes[]>(() => mesCalendario({
    semanas: rejilla, desde, hasta, hoy, eventos, todos, tareas, hechas: snapshot?.completedTasks ?? [], zona, programa,
    objetivoDia: dia => objetivoDelDiaMes({ dia, goals: goals.data?.goals ?? [], abiertas: snapshot?.tasks ?? [], completadas: snapshot?.completedTasks ?? [],
      eventos: snapshot?.events ?? [], fuentes: snapshot?.sources ?? [], zona, habito: d => d <= hoy && objetivoHabito.dias.has(d) ? true : null }),
  }), [rejilla, desde, hasta, hoy, eventos, todos, tareas, snapshot, zona, programa, goals.data, objetivoHabito])
  // Las barras se comparan contra todo el mes; el oro marca la más cargada de las que faltan (los jueces del 17 nov: «el oro señala
  // hacia atrás, no lo que Daniel está planeando»).
  const maxHoras = Math.max(0, ...semanas.map(w => w.carga.horas))
  const maxPorVenir = Math.max(0, ...semanas.filter(w => w.domingo >= hoy).map(w => w.carga.horas))
  const hayCarga = semanas.some(w => w.carga.horas > 0 || w.carga.tareas > 0)
  const ritmo = useMemo(() => ritmoTipico(semanas), [semanas])
  const pesos = semanas.map(w => w.domingo < hoy ? PESO_PASADA : w.dias.filter(d => d.enMes).length <= 3 ? PESO_AJENA : 1), sumaPesos = pesos.reduce((a, b) => a + b, 0)

  // El alto de un renglón decide cuántas líneas caben en cada día (sin scroll: lo demás es «+N»).
  const caja = useRef<HTMLDivElement>(null)
  const [altoFila, setAltoFila] = useState(0)
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setAltoFila(el.clientHeight)
    medir()
    const o = new ResizeObserver(medir); o.observe(el)
    return () => o.disconnect()
  }, [rejilla.length])

  // Arrastrar de un día a otro: el fantasma sigue al puntero y la celda de destino se marca; al soltar, `onMover`.
  const arrastre = useRef<Arrastre | null>(null), recien = useRef(false)
  const [fantasma, setFantasma] = useState<{ x: number; y: number; titulo: string; tono: string | null } | null>(null)
  // Los días donde caería (una barra marca todos los suyos: Monterrey son cuatro).
  const [destino, setDestino] = useState<ReadonlySet<string>>(() => new Set())
  // El día bajo el puntero, aunque encima haya una barra (soltar Monterrey un día después cae sobre la barra misma, no sobre la celda).
  const diaEn = (x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y)) { const d = (el as HTMLElement).closest?.<HTMLElement>('[data-mes-dia]'); if (d) return d.dataset.mesDia ?? null }
    return null
  }
  const soltar = useCallback(() => { arrastre.current = null; setFantasma(null); setDestino(new Set()) }, [])
  useEffect(() => {
    if (!fantasma) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); recien.current = true; setTimeout(() => { recien.current = false }, 300); soltar() } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [fantasma, soltar])
  const agarrar = (e: PunteroReact<HTMLElement>, item: PlanItem, desdeDia: string, titulo: string, tono: string | null, barra = false) => {
    if (!onMover || e.button !== 0) return
    const largo = barra && item.kind === 'event' && item.allDay ? Math.max(1, diasEntre(item.start.slice(0, 10), item.end.slice(0, 10))) : 1
    arrastre.current = { item, desde: desdeDia, agarre: diaEn(e.clientX, e.clientY) ?? desdeDia, x0: e.clientX, y0: e.clientY, activo: false, titulo, tono, barra, largo }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const mover = (e: PunteroReact<HTMLElement>) => {
    const a = arrastre.current
    if (!a) return
    if (!a.activo && !esArrastre(e.clientX - a.x0, e.clientY - a.y0)) return
    a.activo = true
    setFantasma({ x: e.clientX, y: e.clientY, titulo: a.titulo, tono: a.tono })
    const dia = diaEn(e.clientX, e.clientY), inicio = dia && (a.barra ? sumarDia(a.desde, diasEntre(a.agarre, dia)) : dia)
    setDestino(new Set(inicio ? Array.from({ length: a.largo }, (_, i) => sumarDia(inicio, i)) : []))
  }
  const terminar = (e: PunteroReact<HTMLElement>) => {
    const a = arrastre.current
    if (!a) return
    if (a.activo) {
      recien.current = true
      setTimeout(() => { recien.current = false }, 0)
      const dia = diaEn(e.clientX, e.clientY)
      const hacia = dia && (a.barra ? sumarDia(a.desde, diasEntre(a.agarre, dia)) : dia)
      if (hacia && hacia !== a.desde) onMover?.(a.item, hacia)
    }
    soltar()
  }
  const abrir = (item: PlanItem) => { if (recien.current) return; onAbrir?.(item) }

  const criterios = goal ? entregablesDe(goal.success).items : []
  const tiempo = tiempoDelPeriodo(desde, hasta, hoy, ahora)
  const enCurso = tiempo.estado === 'actual'

  return <section className={m.mes} data-mes-calendario data-arrastrando={fantasma ? '' : undefined} style={TONOS}
    data-habitos={objetivoHabito.listos ? 'listos' : 'leyendo'} data-objetivos={goals.data ? 'listos' : 'leyendo'} data-calendario={snapshot ? 'listo' : 'leyendo'}
    aria-label={tr('Mes de {mes}', { mes: format(parseISO(desde), 'MMMM yyyy', { locale: localeFechas() }) })}>
    <div className={m.meta} data-mes-meta>
      <FranjaPlan clave="arbrain.calendario.franja-mes-abierta" encima
        rotulo={<>{tr('Mes')}<b> · {mes}</b>{goal?.status === 'draft' && <em> · {tr('en planificación')}</em>}</>}
        titulo={objetivoMes?.titulo ?? null} vacio={cargando && !goals.data ? tr('Leyendo el objetivo…') : tr('Sin objetivo para este mes.')}
        aviso={criterios.length || enCurso ? <span className={m.avance}>
          {criterios.length > 0 && <span>{trNodos('{k} de {n} entregables', { k: <b>{criterios.filter(e => e.hecho).length}</b>, n: criterios.length })}</span>}
          {enCurso && <span title={tr('Día {dia} de {total} del mes', { dia: tiempo.dia, total: tiempo.total })}>{tr('día {dia} de {total}', { dia: tiempo.dia, total: tiempo.total })}</span>}
        </span> : null}
        detalle={criterios.length > 0 && <>
          <Segmentos k={criterios.filter(e => e.hecho).length} n={criterios.length} i={0} />
          <Entregables texto={goal!.success} guardar={guardarObjetivo ? success => guardarObjetivo({ ...goal!, success }) : undefined} i0={1} nombre={tr('Entregables del mes')} />
        </>} />
    </div>
    <div className={m.cabeza} aria-hidden>
      <span>{tr('Semana')}</span>
      {rejilla[0].map(d => <span key={d}>{format(parseISO(d), 'EEE', { locale: localeFechas() }).replace('.', '')}</span>)}
    </div>
    <div ref={caja} className={m.rejilla} style={{ gridTemplateRows: pesos.map(p => `minmax(0, ${p}fr)`).join(' ') }} role="group" aria-label={tr('Semanas de {mes}', { mes })}>
      {semanas.map((w, k) => <Semana key={w.lunes} w={w} hoy={hoy} altoFila={altoFila * pesos[k] / sumaPesos} maxHoras={maxHoras} maxPorVenir={maxPorVenir} hayCarga={hayCarga} destino={destino} habitosListos={objetivoHabito.listos}
        objetivo={goals.data ? objetivoDe(goals.data.goals, snapshot, 'week', w.lunes)?.titulo ?? null : null}
        onSemana={onSemana} onDia={onDia} onCrear={onCrear} abrir={abrir} agarrar={onMover ? agarrar : undefined} mover={mover} terminar={terminar} />)}
    </div>
    <p className={m.pie}>
      {ritmo.length > 0 && <span data-mes-ritmo-tipico title={tr('La rutina que se repite casi todos los días de este mes, leída de tu calendario: no se pinta en cada día.')}>
        <b>{tr('Ritmo diario')}</b> {ritmo.map(r => `${r.hora} ${r.nombre}`).join(' · ')}</span>}
      {semanas.some(w => w.dias.some(d => d.objetivo)) && <span className={m.leyendaEstrella}><b>★</b> {tr('objetivo del día cumplido')} · <b>☆</b> {tr('sin marcar')}</span>}
    </p>
    {fantasma && <div className={m.fantasma} data-tono={fantasma.tono ?? undefined} style={{ left: fantasma.x, top: fantasma.y }} aria-hidden>{fantasma.titulo}</div>}
  </section>
}

function Semana({ w, hoy, altoFila, maxHoras, maxPorVenir, hayCarga, destino, habitosListos, objetivo, onSemana, onDia, onCrear, abrir, agarrar, mover, terminar }: {
  w: SemanaMes; hoy: string; altoFila: number; maxHoras: number; maxPorVenir: number; hayCarga: boolean; destino: ReadonlySet<string>; habitosListos: boolean; objetivo: string | null
  onSemana?: (lunes: string) => void; onDia?: (dia: string) => void; onCrear?: (dia: string) => void; abrir: (item: PlanItem) => void
  agarrar?: (e: PunteroReact<HTMLElement>, item: PlanItem, desde: string, titulo: string, tono: string | null, barra?: boolean) => void
  mover: (e: PunteroReact<HTMLElement>) => void; terminar: (e: PunteroReact<HTMLElement>) => void
}) {
  const actual = w.lunes <= hoy && hoy <= w.domingo, pasada = w.domingo < hoy
  const rango = `${format(parseISO(w.lunes), 'd MMM', { locale: localeFechas() })} – ${format(parseISO(w.domingo), 'd MMM', { locale: localeFechas() })}`.replace(/\./g, '')
  const horas = tr('{h} h con personas', { h: String(w.carga.horas).replace('.', enDecimal()) })
  const resumenCarga = [horas, trn(w.carga.tareas, '{n} tarea', '{n} tareas')].join(' · ')
  // El objetivo usa las líneas que deja la carga (sin cortar a media palabra contra el contador).
  const lineasObjetivo = Math.max(1, Math.min(5, Math.floor((altoFila - 22 - (hayCarga ? 30 : 6)) / 17)))
  return <div className={m.semana} role="group" aria-label={tr('Semana del {rango}', { rango })} data-mes-semana={w.lunes} data-actual={actual || undefined} data-pasada={pasada || undefined} data-mas-cargada={!pasada && maxPorVenir > 0 && w.carga.horas === maxPorVenir || undefined}>
    <button type="button" className={m.wcol} onClick={onSemana ? () => onSemana(w.lunes) : undefined} disabled={!onSemana}
      aria-label={`${tr('Abrir la semana del {rango}', { rango })}${objetivo ? `: ${objetivo}` : ''}. ${resumenCarga}`}>
      <span className={m.s}>{w.s && <b>{w.s}</b>}{w.s && w.fase && ' · '}{w.fase ?? (!w.s ? rango : null)}</span>
      {objetivo ? <span className={m.objetivo} data-mes-objetivo-semana style={{ WebkitLineClamp: lineasObjetivo }} title={objetivo}>{objetivo}</span>
        : <span className={m.objetivo} data-vacio>{tr('Sin objetivo de semana')}</span>}
      {hayCarga && <span className={m.carga} title={tr('Horas con personas: clases, llamadas y uno a uno con hora en tu calendario esa semana (los empalmes cuentan una vez). Tareas: las de Todoist que vencen esa semana.')}>
        <span><b>{horas}</b><em> · {trn(w.carga.tareas, '{n} tarea', '{n} tareas')}</em></span>
        <i aria-hidden><b style={{ width: `${maxHoras ? Math.round(w.carga.horas / maxHoras * 100) : 0}%` }} /></i>
      </span>}
    </button>
    {w.dias.map((d, i) => <Dia key={d.dia} d={d} i={i} w={w} altoFila={altoFila} destino={destino.has(d.dia)} habitosListos={habitosListos} onDia={onDia} onCrear={onCrear} abrir={abrir} agarrar={agarrar} mover={mover} terminar={terminar} />)}
    {w.barras.map(b => <Barra key={b.id} b={b} w={w} abrir={abrir} agarrar={agarrar} mover={mover} terminar={terminar} />)}
  </div>
}

/** El separador decimal del idioma («12,5 h» en español, «12.5 h» en inglés). */
const enDecimal = () => (1.5).toLocaleString(localeFechas().code ?? 'es').includes(',') ? ',' : '.'

function Dia({ d, i, w, altoFila, destino, habitosListos, onDia, onCrear, abrir, agarrar, mover, terminar }: {
  d: DiaMes; i: number; w: SemanaMes; altoFila: number; destino: boolean; habitosListos: boolean
  onDia?: (dia: string) => void; onCrear?: (dia: string) => void; abrir: (item: PlanItem) => void
  agarrar?: (e: PunteroReact<HTMLElement>, item: PlanItem, desde: string, titulo: string, tono: string | null, barra?: boolean) => void
  mover: (e: PunteroReact<HTMLElement>) => void; terminar: (e: PunteroReact<HTMLElement>) => void
}) {
  const fecha = parseISO(d.dia)
  // Debajo del número, solo los carriles que esta columna usa (si la barra no pasa por aquí, la lista sube).
  const carriles = w.barras.filter(b => b.a <= i && i <= b.z).reduce((n, b) => Math.max(n, b.carril + 1), 0)
  // El objetivo del día: de hoy en adelante es una línea (lo que planeaste); en lo pasado, solo su estrella (si se cumplió).
  const objetivoEnLinea = Boolean(d.objetivo) && !d.pasado
  const libres = altoFila - ALTO.numero - carriles * ALTO.carril - ALTO.holgura - (objetivoEnLinea ? ALTO.linea : 0)
  const caben = altoFila ? Math.max(0, Math.floor(libres / ALTO.linea)) : 3
  // Lo de todo el día puede ocupar dos líneas (la reunión presencial no se corta): cuenta doble.
  const visibles: ItemMes[] = []
  let usadas = 0
  for (const x of d.items) { const l = x.tipo === 'hito' && x.titulo.length > 22 ? 2 : 1; if (usadas + l > caben) break; visibles.push(x); usadas += l }
  if (visibles.length < d.items.length && usadas >= caben && visibles.length) usadas -= visibles.pop()!.tipo === 'hito' ? 2 : 1
  const resto = d.items.length - visibles.length
  const nombre = format(fecha, tr("EEEE d 'de' MMMM"), { locale: localeFechas() })
  const primero = d.dia.endsWith('-01') || (i === 0 && w.dias[0] === d && !d.enMes)
  const resumen = [trn(d.items.filter(x => x.tipo === 'compromiso' || x.tipo === 'hito').length, '{n} compromiso', '{n} compromisos'),
    trn(d.items.filter(x => x.tipo === 'tarea' && !x.hecha).length, '{n} tarea', '{n} tareas')].join(', ')
  return <div className={m.dia} role="group" data-mes-dia={d.dia} data-hoy={d.hoy || undefined} data-pasado={d.pasado || undefined} data-finde={d.finde || undefined}
    data-fuera={d.fuera ? '' : undefined} data-fuera-mes={!d.enMes || undefined} data-destino={destino || undefined} style={{ gridColumn: i + 2 }}
    aria-label={`${nombre}${d.fuera ? ` · ${d.fuera}` : ''}: ${resumen}`}
    onClick={e => { if (onDia && e.target === e.currentTarget) onDia(d.dia) }}>
    <div className={m.numero}>
      <button type="button" data-mes-numero onClick={onDia ? () => onDia(d.dia) : undefined} aria-label={tr('Abrir el {dia}', { dia: nombre })} title={tr('Abrir el {dia}', { dia: nombre })}>
        <b>{format(fecha, 'd')}</b>{primero && <small>{format(fecha, 'MMM', { locale: localeFechas() }).replace('.', '')}</small>}
      </button>
      {d.objetivo && d.pasado && <span className={m.estrella} data-mes-estrella data-hecho={d.objetivo.hecho || undefined} data-leyendo={!d.objetivo.hecho && !habitosListos || undefined} title={`${d.objetivo.hecho ? tr('Objetivo del día cumplido') : tr('Objetivo del día')}: ${d.objetivo.titulo}`}
        aria-label={`${d.objetivo.hecho ? tr('Objetivo del día cumplido') : tr('Objetivo del día')}: ${d.objetivo.titulo}`}>{d.objetivo.hecho ? '★' : '☆'}</span>}
      {onCrear && <button type="button" className={m.crear} data-mes-crear onClick={() => onCrear(d.dia)} aria-label={tr('Crear algo el {dia}', { dia: nombre })} title={tr('Crear en este día')}><Plus size={13} aria-hidden /></button>}
    </div>
    {carriles > 0 && <div style={{ height: carriles * ALTO.carril, flex: 'none' }} aria-hidden />}
    {objetivoEnLinea && <p className={m.objetivoDia} data-mes-objetivo-dia data-hecho={d.objetivo!.hecho || undefined} title={`${tr('Objetivo del día')}: ${d.objetivo!.titulo}`}><b aria-hidden>{d.objetivo!.hecho ? '★' : '☆'}</b><span>{d.objetivo!.titulo}</span></p>}
    <ul className={m.items}>
      {visibles.map(x => <Item key={x.id} x={x} dia={d.dia} abrir={abrir} agarrar={agarrar} mover={mover} terminar={terminar} />)}
      {resto > 0 && <li><button type="button" className={m.mas} data-mes-mas onClick={onDia ? () => onDia(d.dia) : undefined}>{tr('+{n} más', { n: resto })}</button></li>}
    </ul>
  </div>
}

function Item({ x, dia, abrir, agarrar, mover, terminar }: {
  x: ItemMes; dia: string; abrir: (item: PlanItem) => void
  agarrar?: (e: PunteroReact<HTMLElement>, item: PlanItem, desde: string, titulo: string, tono: string | null, barra?: boolean) => void
  mover: (e: PunteroReact<HTMLElement>) => void; terminar: (e: PunteroReact<HTMLElement>) => void
}) {
  const invitados = x.item.kind === 'event' ? (x.item.attendees ?? []).filter(a => !a.self).length : 0
  const movible = Boolean(agarrar) && x.movible
  const etiqueta = [x.hora, x.titulo, x.vencida ? tr('vencida') : null, x.hecha ? tr('hecha') : null, x.prioridad && x.prioridad < 4 ? `P${x.prioridad}` : null,
    x.choque ? tr('se cruza con «{otro}»', { otro: x.choque }) : null].filter(Boolean).join(' · ')
  return <li><button type="button" className={m.item} data-mes-item={x.id} data-tipo={x.tipo} data-tono={x.tono ?? undefined} data-p={x.prioridad ?? undefined}
    data-vencida={x.vencida || undefined} data-hecha={x.hecha || undefined} data-choque={x.choque ? '' : undefined} data-movible={movible || undefined} data-invitados={invitados}
    title={etiqueta} aria-label={etiqueta} onClick={() => abrir(x.item)}
    onPointerDown={movible ? e => agarrar!(e, x.item, dia, x.titulo, x.tono) : undefined} onPointerMove={movible ? mover : undefined} onPointerUp={movible ? terminar : undefined} onPointerCancel={movible ? terminar : undefined}>
    {x.tipo === 'tarea' && <i aria-hidden />}{x.hora && <time>{x.hora}</time>}<span>{x.titulo}</span>
  </button></li>
}

function Barra({ b, w, abrir, agarrar, mover, terminar }: {
  b: BarraMes; w: SemanaMes; abrir: (item: PlanItem) => void
  agarrar?: (e: PunteroReact<HTMLElement>, item: PlanItem, desde: string, titulo: string, tono: string | null, barra?: boolean) => void
  mover: (e: PunteroReact<HTMLElement>) => void; terminar: (e: PunteroReact<HTMLElement>) => void
}) {
  const movible = Boolean(agarrar) && b.movible
  const inicio = b.evento.allDay ? b.evento.start.slice(0, 10) : dayKey(parseISO(b.evento.start))
  const etiqueta = [b.titulo, ...b.dentro].join(' · ')
  return <button type="button" className={m.barra} data-mes-barra={b.id} data-tono={b.tono ?? undefined} data-antes={b.antes || undefined} data-despues={b.despues || undefined}
    data-movible={movible || undefined} style={{ gridColumn: `${b.a + 2} / ${b.z + 3}`, marginTop: ALTO.numero + b.carril * ALTO.carril } as CSSProperties}
    title={etiqueta} aria-label={etiqueta} onClick={() => abrir(b.evento)}
    onPointerDown={movible ? e => agarrar!(e, b.evento, inicio, b.titulo, b.tono, true) : undefined} onPointerMove={movible ? mover : undefined} onPointerUp={movible ? terminar : undefined} onPointerCancel={movible ? terminar : undefined}>
    {b.antes && !w.dias[0].enMes ? null : <span>{b.titulo}</span>}{b.dentro.length > 0 && <small>{b.dentro.join(' · ')}</small>}
  </button>
}

