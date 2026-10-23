'use client'
import { instalacion } from '@/config'
import { useCivilClock } from '@/features/sistema/useHabitRecords'
import { esc } from './vivo-piezas'
import { diaDelPeriodo, rangoCorto, textoFaltan, textoPeriodo } from './periodo-premio'
import s from './contador-periodo.module.css'

/**
 * El periodo con premio (22 oct 2026, Daniel: «quiero ver alguna interfaz que diga… uno de 30 y tantos… eso es el premio»):
 * «Día N de 34 · Monterrey», una tira con un trazo por día y lo que debe estar cumplido antes del cierre. Va justo debajo del
 * objetivo en Día, Semana y Mes, y cuenta siempre desde hoy (no desde el día que se mira). Sin `instalacion().periodo` no se pinta.
 * Nada late: es una marca firme, no un aviso.
 */
export function ContadorPeriodo({ i = 1 }: { i?: number }) {
  const { today } = useCivilClock()
  const p = instalacion().periodo
  if (!p) return null
  const d = diaDelPeriodo(today, p), faltan = textoFaltan(d)
  const vividos = d.estado === 'antes' ? 0 : d.estado === 'en-curso' ? (d.dia ?? 1) - 1 : d.total
  return <section className={`${s.periodo} ${s.entra}`} style={esc(i)} data-estado={d.estado} aria-label={`${textoPeriodo(d)} · ${p.premio}`}>
    <header className={s.cabeza}>
      <p className={s.linea}>
        {d.estado === 'en-curso' ? <span><b className={s.numero}>Día {d.dia}</b><span className={s.de}> de {d.total}</span></span> : <b className={s.numero}>{textoPeriodo(d)}</b>}
        <span className={s.punto} aria-hidden>·</span><span className={s.premio}>{p.premio}</span>
      </p>
      {faltan && <span className={s.faltan}>{faltan}</span>}
    </header>
    <div className={s.tira} aria-hidden>
      {Array.from({ length: d.total }, (_, k) => <i key={k} data-vivido={k < vividos || undefined} data-hoy={(d.estado === 'en-curso' && k === vividos) || undefined} />)}
    </div>
    {p.cumplir.length > 0 && <div className={s.antes}>
      <span className={s.rotulo}>Antes del cierre</span>
      <ul>{p.cumplir.map(x => <li key={x}>{x}</li>)}</ul>
    </div>}
    {p.viaje && <p className={s.viaje}>{p.premio} · {rangoCorto(p.viaje.desde, p.viaje.hasta)}{!p.viaje.firmado && <em> · por firmar</em>}</p>}
  </section>
}
