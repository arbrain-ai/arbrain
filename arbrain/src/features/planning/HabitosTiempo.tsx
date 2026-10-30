'use client'
import { useEffect, useMemo, useRef, type KeyboardEvent as TeclaReact } from 'react'
import { Check, Flag, Flame, X } from 'lucide-react'
import { instalacion } from '@/config'
import { isHabitTypingTarget } from '@/features/sistema/habit-shortcuts'
import { useCivilClock, useHabitRecords } from '@/features/sistema/useHabitRecords'
import { useAtomicos } from '@/features/sistema/useAtomicos'
import { nombreEnPantalla } from '@/lib/sistema/atomicos'
import { NombreHabito } from '@/features/sistema/NombreHabito'
import { siguienteMarca, type Marca } from './habitos-dia'
import { casillaDeTecla } from './habitos-hoy'
import { EVENTO_HABITOS, tomarPedidoHabitos } from './habitos-pedido'
import { diasDeTabla, estadoTiempo, lineaPeriodo, llenado, rangoTiempo, registrado, resumenHabito, rotuloDia, trayecto } from './habitos-tiempo'
import { textoRacha } from './habitos-hoy'
import { diaDelPeriodo, rangoCorto, textoFaltan, textoPeriodo, type DiaPeriodo } from './periodo-premio'
import { useTemporada } from './useTemporada'
import s from './habitos-tiempo.module.css'

/** La casilla del objetivo del día es tarea + ✓ en Google + hábito a la vez: hoy se marca desde el Día, no desde aquí. */
const HABITO_OBJETIVO = 'objetivo_dia'

/**
 * La vista H del calendario (Ctrl+H). 25 oct 2026, 10:00, Daniel: «quiero algo más simple: literal una tabla mensual con los hábitos
 * como columna y los días como fila. No 3 componentes, uno solo que englobe todo. Hasta arriba los no negociables, el periodo en monk
 * mode sin ruido». UNA tabla: arriba «No negociables» y una línea del periodo; filas = días del periodo completo (25 oct → 24 nov),
 * columnas = los hábitos y al final «x/3» del día; al pie, una línea. Sin tarjetas, mapas, rachas ni franja aparte.
 *
 * Cada celda se marca con un toque: vacío → cumplido → no cumplido (registrado) → vacío. La métrica es LLENAR (08:20: «no importa si
 * fallo, importa que los llene»): el «x/3» y el pie cuentan registrados. Hoy en el dorado de la casa; el futuro, tenue.
 *
 * Rediseño (28 oct 2026, Daniel: «es funcional, pero muy minimalista, no se adaptó a este cambio hermoso de UI»), con Salud como
 * referente: arriba el héroe del monk mode (Día N de 30, el trayecto día por día rumbo a Monterrey y lo llenado hoy), luego una
 * tarjeta por hábito (racha, mejor racha, llenado) y la tabla de siempre, con hoy destacado y el futuro como camino por recorrer.
 *
 * Misma fuente y misma pluma que «Hábitos de hoy» (useHabitRecords → /api/sistema), con la misma privacidad: un privado se ve como
 * «Hábito 3» siempre, sin candado (28 oct 2026), su nombre real solo al tocarlo o dejar el cursor encima, y sigue contando.
 */
export function HabitosTiempo({ donde }: { donde: string }) {
  const { today, timeZone } = useCivilClock()
  const rango = useMemo(() => rangoTiempo(today), [today])
  const habits = useHabitRecords({ ...rango, timeZone })
  const vigente = useTemporada()
  const periodo = vigente?.periodo
  const atomicos = useAtomicos()
  const propuesta = instalacion().habitosAtomicos
  const raiz = useRef<HTMLElement>(null)

  const lista = (habits.data?.habitos ?? []).map((x, n) => ({ ...x, posicion: n + 1, p: atomicos.data?.habitos[x.clave] ?? propuesta?.habitos[x.clave] }))
  const claves = lista.map(x => x.clave)
  const leido = useMemo(() => new Map((habits.data?.records ?? []).map(r => [`${r.fecha}|${r.habito_clave}`, r.hecho])), [habits.data])
  // Lo recién marcado (aún en la cola) gana sobre lo leído: la celda cambia al toque, también en días pasados.
  const enCola = useMemo(() => new Map(habits.pending.map(c => [`${c.date}|${c.clave}`, c.hecho])), [habits.pending])
  const marca = (fecha: string, clave: string): Marca => { const k = `${fecha}|${clave}`; return enCola.has(k) ? enCola.get(k) : leido.get(k) }

  const dias = useMemo(() => diasDeTabla(today, periodo), [today, periodo])
  // Llenar cuenta desde el arranque de la temporada (o el inicio del periodo); sin periodo, desde el día 1 del mes.
  const inicio = vigente?.temporadaHabitos?.arranque ?? periodo?.desde ?? dias[0] ?? null
  const total = llenado(dias, claves, marca, today, inicio)
  const dia = periodo ? diaDelPeriodo(today, periodo) : null
  const tramos = useMemo(() => periodo ? trayecto(dias, claves, marca, today, inicio) : [], [dias, claves.join(), habits.data, habits.pending, today, inicio]) // eslint-disable-line react-hooks/exhaustive-deps
  const llenosHoy = claves.filter(c => registrado(marca(today, c))).length
  const linea = periodo ? lineaPeriodo(vigente?.temporadaHabitos?.nombre, periodo, diaDelPeriodo(today, periodo))
    : new Date(`${today}T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  const enfocar = () => {
    raiz.current?.querySelector('tr[data-hoy]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const hoy = [...(raiz.current?.querySelectorAll<HTMLButtonElement>('button[data-hoy]:not(:disabled)') ?? [])]
    ;(hoy.find(b => b.dataset.estado !== 'hecho') ?? hoy[0] ?? raiz.current)?.focus({ preventScroll: true })
  }
  // Ctrl+H: el pedido llega antes o después de que la vista exista (el Calendario del panel puede estar montándose).
  useEffect(() => {
    if (donde !== 'panel') return
    const oir = () => { if (tomarPedidoHabitos()) requestAnimationFrame(enfocar) }
    if (habits.data) oir()
    window.addEventListener(EVENTO_HABITOS, oir)
    return () => window.removeEventListener(EVENTO_HABITOS, oir)
  }, [donde, !!habits.data]) // eslint-disable-line react-hooks/exhaustive-deps
  // Al abrir, la fila de hoy queda a la vista (el periodo tiene 31 filas).
  useEffect(() => {
    if (habits.data) raiz.current?.querySelector('tr[data-hoy]')?.scrollIntoView({ block: 'center' })
  }, [!!habits.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Un toque, tres estados en cualquier día (también hoy): vacío → cumplido → no cumplido (registrado) → vacío.
  const alternar = (fecha: string, clave: string) => habits.mark(fecha, clave, siguienteMarca(marca(fecha, clave)))
  // Con el foco en la vista, 1 · 2 · 3 marcan el hábito de ese lugar hoy (como en el Día).
  const tecla = (e: TeclaReact<HTMLElement>) => {
    if (isHabitTypingTarget(e.target)) return
    const n = casillaDeTecla(e.nativeEvent, lista.length)
    if (n == null || lista[n].clave === HABITO_OBJETIVO) return
    e.preventDefault(); e.stopPropagation(); alternar(today, lista[n].clave)
  }
  const fechaLarga = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  const texto = (m: Marca) => m === true ? 'cumplido' : m === false ? 'no cumplido, registrado' : 'sin registrar'
  const nombres = lista.map(x => nombreEnPantalla(x.nombre, x.p))

  return <section ref={raiz} className={s.vista} aria-label="Hábitos" data-habitos-tiempo tabIndex={-1} onKeyDown={tecla}>
    <header className={s.heroe} data-estado={dia?.estado}>
      <div className={s.heroeTexto}>
        <h2 className={s.ceja}>No negociables{vigente?.temporadaHabitos?.nombre ? <> · <b>{vigente.temporadaHabitos.nombre}</b></> : null}</h2>
        {dia ? <p className={s.palabra}>{dia.estado === 'en-curso' ? <>Día <b>{dia.dia}</b><span> de {dia.total}</span></> : textoPeriodo(dia)}</p>
          : <p className={s.palabra}>{linea}</p>}
        {periodo && <p className={s.rumbo}>
          <span>Rumbo a <b>{periodo.premio}</b>{periodo.viaje ? ` · ${rangoCorto(periodo.viaje.desde, periodo.viaje.hasta)}` : ''}</span>
          {dia && textoFaltan(dia) && <span>{textoFaltan(dia)}</span>}
          {periodo.meta && <span className={s.meta}>{periodo.meta}</span>}
        </p>}
      </div>
      {habits.data && lista.length > 0 && <Anillo hechos={llenosHoy} total={claves.length} />}
      {periodo && tramos.length > 0 && <Trayecto tramos={tramos} total={claves.length} premio={periodo.premio} dia={dia} />}
    </header>

    {habits.data && lista.length > 0 && <ul className={s.habitos} aria-label="Cada hábito en el periodo">
      {lista.map((x, n) => {
        const r = resumenHabito(x.clave, dias, marca, today, inicio)
        return <li key={x.clave} className={s.habito} data-hoy={r.hoy === true ? 'hecho' : r.hoy === false ? 'fallado' : 'vacio'}>
          <p className={s.habitoNombre}><kbd aria-hidden>{n + 1}</kbd><NombreHabito clave={x.clave} nombre={x.nombre} p={x.p} /></p>
          <p className={s.racha} data-viva={r.racha > 0 || undefined}><Flame size={15} aria-hidden /><b>{r.racha}</b><span>{r.racha === 1 ? 'día seguido' : 'días seguidos'}</span></p>
          <p className={s.habitoPie}>
            <span>Mejor <b>{textoRacha(r.mejor)}</b></span>
            <span>Llenado <b>{r.pct == null ? '—' : `${r.pct}%`}</b></span>
          </p>
          <span className={s.barra} aria-hidden><i style={{ width: `${r.pct ?? 0}%` }} /></span>
        </li>
      })}
    </ul>}

    {!habits.data ? <p className={s.vacio}>{habits.loading ? 'Leyendo tus hábitos…' : habits.error ?? 'No se pudieron leer los hábitos.'}</p>
      : !lista.length ? <p className={s.vacio}>Aún no tienes hábitos activos.</p>
      : <table className={s.tabla} style={{ ['--habitos' as string]: lista.length }}>
        <thead><tr>
          <th scope="col" className={s.colDia}><span className={s.srOnly}>Día</span></th>
          {lista.map(x => <th key={x.clave} scope="col"><NombreHabito clave={x.clave} nombre={x.nombre} p={x.p} /></th>)}
          <th scope="col" className={s.colTotal}><span className={s.srOnly}>Llenados del día</span></th>
        </tr></thead>
        <tbody>
          {dias.map((f, k) => {
            const r = rotuloDia(f, k === 0), futuro = f > today, antes = !!inicio && f < inicio
            const llenos = claves.filter(c => registrado(marca(f, c))).length
            const dow = new Date(`${f}T12:00:00Z`).getUTCDay(), cierre = !!periodo && f === periodo.hasta
            return <tr key={f} data-hoy={f === today || undefined} data-futuro={futuro || undefined} data-cierre={cierre || undefined}
              data-lunes={(dow === 1 && k > 0) || undefined} data-finde={dow === 0 || dow === 6 || undefined} title={cierre ? periodo!.premio : undefined}>
              <th scope="row" className={s.colDia}>{r.dia}{r.mes && <small> {r.mes}</small>}{f === today && <em className={s.hoyPastilla}>hoy</em>}</th>
              {lista.map((x, n) => {
                const m = marca(f, x.clave), e = estadoTiempo(m, f, today, inicio)
                const objetivoHoy = x.clave === HABITO_OBJETIVO && f === today
                return <td key={x.clave}>
                  <button className={s.celda} data-estado={e} data-hoy={f === today || undefined} disabled={e === 'fuera' || e === 'futuro' || objetivoHoy}
                    title={objetivoHoy ? 'Hoy se marca con el objetivo del día, en el Día' : undefined}
                    aria-label={`${nombres[n]}, ${fechaLarga(f)}: ${e === 'fuera' ? 'antes de empezar' : e === 'futuro' ? 'aún no llega' : texto(m)}${f === today ? `. Tecla ${n + 1}` : ''}`}
                    onClick={() => alternar(f, x.clave)}>
                    {e === 'hecho' ? <Check size={14} strokeWidth={3} aria-hidden /> : e === 'fallado' ? <X size={13} strokeWidth={2.5} aria-hidden /> : e === 'futuro' ? <i className={s.porVenir} aria-hidden /> : null}
                  </button>
                </td>
              })}
              <td className={s.colTotal} data-lleno={(!futuro && !antes && llenos === claves.length) || undefined}>
                {cierre ? <span className={s.meta2} title={periodo!.premio}><Flag size={12} aria-hidden />{futuro ? <span className={s.srOnly}>{periodo!.premio}</span> : `${llenos}/${claves.length}`}</span>
                  : futuro || antes ? '' : `${llenos}/${claves.length}`}</td>
            </tr>
          })}
        </tbody>
      </table>}

    {habits.data && lista.length > 0 && <p className={s.pie}>{total ? <><b>{total.diasLlenos}</b> de {total.dias} {total.dias === 1 ? 'día' : 'días'} con los {claves.length} llenados</> : `Cuenta desde el ${Number((inicio ?? today).slice(8, 10))}.`}</p>}

    {(habits.error && habits.data) || (habits.pending.length > 0 && !habits.saving) ? <p className={s.aviso} role="status">
      <span>{habits.error ?? 'Hay una marca sin confirmar.'}</span>
      {habits.pending.length > 0 && !habits.saving && <button onClick={() => void habits.retry()}>Reintentar</button>}
    </p> : null}
  </section>
}

/** Lo llenado hoy, en un anillo: «2/3». Completo, se cierra en verde. */
function Anillo({ hechos, total }: { hechos: number; total: number }) {
  const R = 26, C = 2 * Math.PI * R, pct = total ? hechos / total : 0
  return <div className={s.anillo} data-completo={(total > 0 && hechos === total) || undefined} role="img" aria-label={`Hoy: ${hechos} de ${total} llenados`}>
    <svg viewBox="0 0 64 64" aria-hidden><circle cx="32" cy="32" r={R} className={s.anilloPista} />
      {hechos > 0 && <circle cx="32" cy="32" r={R} className={s.anilloAvance} strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 32 32)" />}</svg>
    <span><span className={s.anilloCifra}><b>{hechos}</b>/{total}</span><small>hoy</small></span>
  </div>
}

/** El periodo día por día, rumbo al premio: lo vivido según cuánto se llenó, hoy con la luz del ahora y lo que falta como camino. */
function Trayecto({ tramos, total, premio, dia }: { tramos: { fecha: string; tramo: string; llenos: number }[]; total: number; premio: string; dia: DiaPeriodo | null }) {
  const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
  const vividos = tramos.filter(t => t.tramo !== 'futuro' && t.tramo !== 'fuera').length
  return <div className={s.trayecto} role="img" aria-label={`Trayecto: ${vividos} de ${tramos.length} días vividos${dia?.dia ? `, hoy es el día ${dia.dia}` : ''}, rumbo a ${premio}`}>
    <ol>{tramos.map(t => <li key={t.fecha} data-tramo={t.tramo} title={`${fecha(t.fecha)}${t.tramo === 'futuro' ? ' · por venir' : t.tramo === 'fuera' ? '' : ` · ${t.llenos}/${total}`}`} />)}</ol>
    <span className={s.destino}><Flag size={12} aria-hidden />{premio}</span>
  </div>
}
