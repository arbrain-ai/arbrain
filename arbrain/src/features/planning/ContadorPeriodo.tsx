'use client'
import type { CSSProperties } from 'react'
import { useCivilClock } from '@/features/sistema/useHabitRecords'
import { esc } from './vivo-piezas'
import { diaDelPeriodo, franjaDeTemporada, rangoCorto } from './periodo-premio'
import { DRIP, formatoDinero, formatoHorasDrip } from './drip'
import { useGobierno, type Numeros } from './gobierno'
import { useTemporada } from './useTemporada'
import s from './contador-periodo.module.css'

/**
 * La temporada (22 oct 2026, Daniel: «quiero ver alguna interfaz que diga… uno de 30 y tantos… eso es el premio»), hecha franja el
 * 24 oct (cascada Temporada → Mes → Semana → Día): «Monk mode · Día N de 29 → Monterrey · 24–29 nov», la meta de la temporada, una
 * tira con un trazo por día y lo que debe estar cumplido antes del cierre. UN contador: sin «Faltan N días» (la tira ya lo dice);
 * antes del día 1, «Empieza en N días». Cuenta siempre desde hoy (no desde el día que se mira). Nada late: es una marca firme.
 *
 * Fase 2 (24 oct 2026, Daniel: «máximo tres números a la vista: Día N de temporada, horas en Producir esta semana, horas
 * recompradas»): la franja lleva los TRES y nada más compite con ellos. Producir y recompradas son de la semana de HOY (lunes a
 * domingo), medidos en lo que hay en el calendario; sin medición, «—» (jamás un cero inventado). Sin tarifa, solo horas y «fija tu
 * tarifa». Sin temporada (el alumno nace así), la franja queda con una invitación discreta, «Arma tu temporada con Levy», y los dos
 * números. La temporada se lee en tiempo de ejecución (`useTemporada`: almacén del alumno o `instalacion()` de Daniel).
 */
export function ContadorPeriodo({ i = 1, delgada = false }: { i?: number
  /** La franja delgada de arriba (dos columnas): letra menor y menos aire; el contenido es el mismo. */
  delgada?: boolean }) {
  const { today } = useCivilClock()
  const g = useGobierno()
  const t = useTemporada()
  // Edición del alumno, primera lectura: nada hasta saber si hay temporada (sin parpadeo de la invitación).
  if (t === undefined) return null
  const p = t.periodo
  if (!p) return <section className={`${s.periodo} ${s.entra}`} style={esc(i)} data-delgada={delgada || undefined} data-sin-temporada data-temporada>
    <header className={s.cabeza}>
      <p className={s.linea}><span className={s.rotuloTemporada}>Temporada</span><b className={s.numero}>—</b>
        <span className={s.metaEnLinea} title="Dile a Levy «armemos mi temporada»: fechas, meta y premio">Arma tu temporada con Levy</span></p>
      {g && <TresNumeros n={g.numeros} />}
    </header>
  </section>
  const d = diaDelPeriodo(today, p), f = franjaDeTemporada(today, p, t.temporadaHabitos?.nombre)
  const vividos = d.estado === 'antes' ? 0 : d.estado === 'en-curso' ? (d.dia ?? 1) - 1 : d.total
  const destino = <p className={s.destino}><span className={s.flecha} aria-hidden>→</span><span className={s.premio}>{p.premio}</span>
    {p.viaje && <span className={s.fechas}>{rangoCorto(p.viaje.desde, p.viaje.hasta)}{f.porFirmar && <em> · por firmar</em>}</span>}</p>
  return <section className={`${s.periodo} ${s.entra}`} style={esc(i)} data-estado={d.estado} data-delgada={delgada || undefined} data-con-numeros={g ? '' : undefined} data-temporada
    aria-label={[f.rotulo, f.contador, `rumbo a ${f.destino}`, f.meta].filter(Boolean).join(' · ')}>
    <header className={s.cabeza}>
      <p className={s.linea}>
        {f.rotulo && <span className={s.rotuloTemporada}>{f.rotulo}</span>}
        {d.estado === 'en-curso' ? <span><b className={s.numero}>Día {d.dia}</b><span className={s.de}> de {d.total}</span></span> : <b className={s.numero}>{f.contador}</b>}
        {/* En la franja delgada la meta va en la misma línea: una fila menos arriba de todo. */}
        {delgada && f.meta && <span className={s.metaEnLinea}>{f.meta}</span>}
      </p>
      {g ? <TresNumeros n={g.numeros} /> : destino}
    </header>
    {f.meta && !delgada && <p className={s.meta}>{f.meta}</p>}
    <div className={s.tira} aria-hidden>
      {Array.from({ length: d.total }, (_, k) => <i key={k} data-vivido={k < vividos || undefined} data-hoy={(d.estado === 'en-curso' && k === vividos) || undefined} />)}
    </div>
    {(p.cumplir.length > 0 || g) && <div className={s.antes}>
      {g && destino}
      {p.cumplir.length > 0 && <><span className={s.rotulo}>Antes del cierre</span>
        <ul>{p.cumplir.map(x => <li key={x}>{x}</li>)}</ul></>}
    </div>}
  </section>
}

/**
 * Los otros dos números de la franja. Un toque en «fija tu tarifa» abre el engrane (ahí vive la tarifa). Los números se leen de un
 * vistazo: el valor en la letra de la casa y una etiqueta corta debajo; el de Producir lleva su cuadrito de oro.
 */
function TresNumeros({ n }: { n: Numeros }) {
  const g = useGobierno()
  const dinero = n.recompradas !== null && n.tarifa ? formatoDinero(n.recompradas * n.tarifa.monto, n.tarifa.moneda) : null
  return <dl className={s.numeros}>
    <div style={{ '--c': DRIP.producir.color } as CSSProperties} title="Horas de bloques Producir en tu calendario esta semana (lunes a domingo). Lo que se encima no cuenta doble.">
      <dt><i aria-hidden />en Producir esta semana</dt><dd>{formatoHorasDrip(n.producir)}</dd>
    </div>
    <div title="Horas de bloques Delegar o Reemplazar de esta semana que marcaste como de alguien más (Levy u otra persona). Sin delegaciones registradas: «—».">
      <dt>recompradas{dinero ? '' : n.recompradas !== null && !n.tarifa ? <> · <button className={s.fija} onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="Ajustes del calendario"]')?.click()}>fija tu tarifa</button></> : null}</dt>
      <dd>{formatoHorasDrip(n.recompradas)}{dinero && <small> · {dinero}</small>}</dd>
    </div>
    {g && <span className={s.srOnly}>Tres números: día de la temporada, horas en Producir y horas recompradas.</span>}
  </dl>
}
