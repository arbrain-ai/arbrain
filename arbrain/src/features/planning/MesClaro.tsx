'use client'
import { useMemo, type CSSProperties } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, ChevronRight } from 'lucide-react'
import { Cifra, mov } from '@/shared/movimiento'
import type { GoalSnapshot } from '@/features/goals/model'
import { dayKey } from './model'
import { diasEntre, objetivoDe, periodoDeEscala, rejillaDelMes } from './periodo-vivo'
import { cuandoHito, diasHasta, entregablesDe, estadoSemana, faltanTexto, hitosDelRegistro, ROTULO_SEMANA, type HitoMes } from './claridad'
import { ContadorPeriodo } from './ContadorPeriodo'
import { ObjetivoCaja, Segmentos } from './ObjetivoCaja'
import { esc, useAhora } from './vivo-piezas'
import type { PlanningSnapshot } from './types'
import type { Plegado } from './SemanaClara'
import c from './claridad.module.css'

/**
 * El Mes (6 oct 2026). Responde, firmado por Daniel: «¿voy a llegar?». Arriba, el objetivo del mes con «faltan N días» hasta el
 * hito. Debajo, S1…S5 como un recorrido: cada semana con su objetivo, su estado (hecha / en curso k de n / pendiente) y sus hitos
 * (◆). Un toque en una semana abre la Semana. Sin rejilla de días ni «Hoy»: eso lo dice el Día.
 *
 * Ronda 2 (10 oct 2026): Recorrido o Cuadrícula se eligen en el engrane del calendario (ajustes.ts), sin botón suelto. Con la
 * cuadrícula queda el objetivo arriba y la cuadrícula de días (FullCalendar) debajo, con sus semanas y fines de semana.
 */
const quita = (s: string) => s.replace(/\./g, '')
const corto = (dia: string) => quita(format(parseISO(dia), 'EEE d', { locale: es }))
function rango(a: string, b: string) {
  const x = parseISO(a), y = parseISO(b)
  return x.getMonth() === y.getMonth() ? `${format(x, 'd')} – ${format(y, 'd')}` : `${quita(format(x, 'd MMM', { locale: es }))} – ${quita(format(y, 'd MMM', { locale: es }))}`
}

export function MesClaro({ goals, fecha, snapshot, cargando, angosto, cuadricula, onSemana, enfoque = false, plegado }: {
  goals: { data: GoalSnapshot | null; error: string | null }
  fecha: Date; snapshot: PlanningSnapshot | null; cargando: boolean; angosto: boolean
  /** La cuadrícula clásica (FullCalendar) en lugar del recorrido: aquí solo queda el objetivo. */
  cuadricula: boolean
  onConversar?: (borrador: string) => void; onSemana: (lunes: string) => void
  /** Enfoque (el engrane): sin el subtítulo del recorrido. */
  enfoque?: boolean
  /** El objetivo del mes nace plegado en una línea (con «Semana N de M»); un toque abre la cuenta regresiva y la línea del mes. */
  plegado?: Plegado
}) {
  const ahora = useAhora(), hoy = dayKey(new Date(ahora))
  const { desde, hasta } = useMemo(() => periodoDeEscala('month', fecha), [fecha])
  const goal = useMemo(() => goals.data?.goals.find(g => g.scope === 'month' && g.start === desde) ?? null, [goals.data, desde])
  const objetivo = useMemo(() => goals.data ? objetivoDe(goals.data.goals, snapshot, 'month', desde) : null, [goals.data, snapshot, desde])
  const hitos = useMemo(() => goal ? hitosDelRegistro(goal.notes) : [], [goal])
  const ultimo = diasEntre(desde, hasta).at(-1)!

  // El hito que manda la cuenta: el próximo (o el que está en curso, si es una ventana). Sin hitos, el cierre del mes.
  const proximo = hitos.find(h => (h.hasta ?? h.dia) >= hoy) ?? null
  const meta: { dia: string; titulo: string; hito: HitoMes | null } = proximo ? { dia: proximo.dia, titulo: proximo.titulo, hito: proximo } : { dia: ultimo, titulo: `Cierre de ${format(parseISO(desde), 'MMMM', { locale: es })}`, hito: null }
  const faltan = diasHasta(hoy, meta.dia)
  const enMes = hoy >= desde && hoy < hasta

  const semanas = useMemo(() => rejillaDelMes(fecha).map((dias, i) => {
    const lunes = dias[0], domingo = dias[6]
    const g = goals.data?.goals.find(x => x.scope === 'week' && x.start === lunes) ?? null
    const o = goals.data ? objetivoDe(goals.data.goals, snapshot, 'week', lunes) : null
    const items = g ? entregablesDe(g.success).items : []
    return { n: i + 1, lunes, domingo, goal: g, titulo: o?.titulo ?? null, estado: estadoSemana(g, lunes, hoy),
      k: items.filter(e => e.hecho).length, total: items.length,
      hitos: hitos.filter(h => h.dia <= domingo && (h.hasta ?? h.dia) >= lunes) }
  }), [fecha, goals.data, snapshot, hoy, hitos])
  const hechas = semanas.filter(s => s.estado === 'hecha').length
  const sinCerrar = semanas.filter(s => s.estado === 'sin-cerrar').length
  const actual = semanas.findIndex(s => s.estado === 'en-curso' || (hoy >= s.lunes && hoy <= s.domingo))

  // La línea del mes: de su día 1 a su último día, con el ahora y los hitos en su lugar.
  const total = diasEntre(desde, hasta).length
  const pos = (dia: string, fin = false) => Math.max(0, Math.min(1, (diasHasta(desde, dia) + (fin ? 1 : 0)) / total))
  const vivido = enMes ? pos(hoy) + (new Date(ahora).getHours() / 24) / total : hoy >= hasta ? 1 : 0


  return <section className={c.vista} data-angosto={angosto || undefined} aria-label={`Mes de ${format(parseISO(desde), 'MMMM yyyy', { locale: es })}`}>
    <ObjetivoCaja rotulo={plegado && !plegado.objetivo ? 'Mes' : <>Objetivo de {format(parseISO(desde), 'MMMM', { locale: es })}{goal?.status === 'draft' && <em> · en planificación</em>}</>}
      titulo={objetivo?.titulo ?? null} vacio="Sin objetivo para este mes." leyendo={!goals.data && !goals.error}
      marca={actual >= 0 ? `Semana ${actual + 1} de ${semanas.length}` : null}
      plegada={plegado ? !plegado.objetivo : false} onPlegar={plegado ? () => plegado.alternar('objetivo') : undefined}>
      <div className={c.cuentaAtras}>
        {faltan > 0 ? <span className={c.faltanNumero}><Cifra valor={faltan} clave={`faltan-${meta.dia}-${hoy}`} formato={x => String(Math.round(x))} /><small>{faltan === 1 ? 'día' : 'días'}</small></span>
          : <span className={c.faltanNumero} data-hoy><small>{faltanTexto(faltan)}</small></span>}
        <span className={c.faltanTexto}>
          <b>{faltan > 1 ? `Faltan ${faltan} días para` : faltan === 1 ? 'Mañana:' : faltan === 0 ? 'Hoy:' : 'Ya pasó:'} {meta.hito ? <span className={c.rombo}>◆</span> : null}{meta.titulo}</b>
          <small>{meta.hito ? `${corto(meta.hito.dia)}${meta.hito.hasta ? ` al ${corto(meta.hito.hasta)}` : ''}` : corto(meta.dia)}
            {' · '}{sinCerrar ? `${sinCerrar} ${sinCerrar === 1 ? 'semana' : 'semanas'} sin cerrar` : 'ninguna semana atrasada'}</small>
        </span>
      </div>
      <div className={c.lineaMes} aria-hidden>
        <i className={`${c.lineaVivida} ${mov.llena}`} style={{ width: `${vivido * 100}%` }} />
        {hitos.map(h => h.hasta && h.hasta !== h.dia
          ? <span key={h.dia + h.titulo} className={c.lineaVentana} style={{ left: `${pos(h.dia) * 100}%`, width: `${(pos(h.hasta, true) - pos(h.dia)) * 100}%` }} />
          : <span key={h.dia + h.titulo} className={c.lineaHito} style={{ left: `${(pos(h.dia) + 0.5 / total) * 100}%` }}>◆</span>)}
        {enMes && <b className={c.lineaAhora} style={{ left: `${vivido * 100}%` }} />}
      </div>
    </ObjetivoCaja>
    <ContadorPeriodo />

    {!cuadricula && !enfoque && <div className={`${c.subtitulo} ${c.entra}`} style={esc(4)}><h3>El recorrido</h3></div>}

    {cuadricula ? null : cargando && !goals.data ? <p className={c.leyendo}>Leyendo tus objetivos…</p>
      : <ol className={c.recorrido} style={{ ['--hechas' as string]: actual >= 0 ? actual : hechas } as CSSProperties}>{semanas.map((s, i) => {
        const fuera = s.domingo < desde || s.lunes >= hasta
        return <li key={s.lunes} className={c.entra} style={esc(5 + i)} data-estado={s.estado} data-tramo={i < (actual >= 0 ? actual : hechas) || undefined}>
          <button className={c.semana} onClick={() => onSemana(s.lunes)} data-fuera={fuera || undefined} aria-label={`Abrir la semana ${s.n}${s.titulo ? `: ${s.titulo}` : ''}`}>
            <span className={`${c.nodo} ${s.estado === 'en-curso' ? mov.late : ''}`} aria-hidden>{s.estado === 'hecha' ? <Check size={11} strokeWidth={3} /> : null}</span>
            <span className={c.semanaCuerpo}>
              <span className={c.semanaCeja}><b>S{s.n}</b><span>{rango(s.lunes, s.domingo)}</span>
                <em className={c.estado} data-estado={s.estado}>{s.estado === 'en-curso' && s.total ? `En curso · ${s.k} de ${s.total}` : ROTULO_SEMANA[s.estado]}</em></span>
              <span className={c.semanaTitulo}>{s.titulo ?? 'Sin objetivo'}</span>
              {s.estado === 'en-curso' && s.total > 0 && <Segmentos k={s.k} n={s.total} i={6 + i} />}
              {s.hitos.length > 0 && <span className={c.hitos}>{s.hitos.map(h => <span key={h.dia + h.titulo} className={c.hito}><span className={c.rombo}>◆</span>{h.titulo}<small>{h.hasta ? cuandoHito(h) : corto(h.dia)}</small></span>)}</span>}
            </span>
            <ChevronRight size={14} aria-hidden className={c.ir} />
          </button>
        </li>
      })}</ol>}
  </section>
}
