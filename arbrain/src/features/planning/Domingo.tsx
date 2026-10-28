'use client'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Lock, Send, Undo2, X } from 'lucide-react'
import type { GoalSnapshot } from '@/features/goals/model'
import { useHabitRecords } from '@/features/sistema/useHabitRecords'
import { ASESINOS, comparar, CUADRANTES, DRIP, formatoDinero, formatoHorasDrip, horasRecompradas, proponer, type BloqueDrip, type Cuadrante, type FotoSemana, type Propuesta } from './drip'
import { entregablesDe } from './claridad'
import type { DocDripVista } from './useDrip'
import type { LecturaInterrupciones } from './interrupciones'
import type { PlanningSnapshot } from './types'
import s from './domingo.module.css'

const dia = (t: number | string) => format(typeof t === 'number' ? t : parseISO(t), 'EEE d', { locale: es }).replace('.', '')
const hm = (t: number) => format(t, 'HH:mm')
const sinEmoji = (t: string) => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim()

/**
 * La revisión del domingo (24 oct 2026, Daniel: «el comparador del domingo en UNA pantalla: plan vs real, horas en Producir, horas
 * recompradas, qué asesino del tiempo apareció y una propuesta de ajuste que se aprueba con un toque»). Ordenada como el circuito
 * cibernético para enseñarlo con la misma pantalla:
 *
 *   SENSOR (Levy lee lo real) → COMPARADOR (real contra la referencia) → ATENUADOR (qué se cuela y qué se pliega) → ACTUADOR (un toque)
 *   └──────────────────────────── la semana que viene, Levy vuelve a leer ────────────────────────────┘
 *
 * La referencia es la FOTO del plan (drip.ts › FotoSemana): lo que había en el calendario la primera vez que se leyó la semana. Sin
 * foto, se toma al abrir y se dice (la comparación de esa semana empieza ahí). Sin medición, «—»; nada de ceros inventados.
 */
export function Domingo({ lunes, bloques, goals, snapshot, doc, ahora, tomarFoto, rutinasPlegadas, aplicar, deshacer, onCerrar, onLunes, pluma, ponerTarifa }: {
  lunes: string
  /** Todo lo leído con hora, clasificado (los calendarios encendidos; sin mirar los cuadrantes ocultos). */
  bloques: BloqueDrip[]
  goals: GoalSnapshot | null
  snapshot: PlanningSnapshot | null
  doc: DocDripVista | null
  ahora: number
  /** Guarda la foto de la semana si no existe (la primera lectura). Devuelve la que quedó. */
  tomarFoto: (lunes: string) => Promise<FotoSemana | null>
  /** Cuántas rutinas no entran al Mes en esta semana (el atenuador del Preloaded Year). */
  rutinasPlegadas: number
  aplicar: (p: Propuesta) => Promise<unknown>
  deshacer: () => void
  onCerrar: () => void
  onLunes: (delta: number) => void
  /** Sin pluma (solo lectura), la propuesta se ve pero no se aplica. */
  pluma: boolean
  /** Fijar la tasa de recompra desde la misma pantalla (almacén DRIP). Sin esto, solo se lee. */
  ponerTarifa?: (monto: number | null, moneda?: string) => Promise<unknown>
}) {
  const desde = parseISO(lunes).getTime(), hasta = addDays(parseISO(lunes), 7).getTime(), corte = Math.min(hasta, ahora)
  const domingo = format(addDays(parseISO(lunes), 6), 'yyyy-MM-dd')
  const foto = doc?.fotos[lunes] ?? null
  // La foto del plan: si no existe, se toma al abrir (la primera lectura de la semana) y se dice.
  const [sinFoto, setSinFoto] = useState(false)
  useEffect(() => {
    setSinFoto(false)
    if (!doc || doc.fotos[lunes]) return
    void tomarFoto(lunes).then(f => { if (!f) setSinFoto(true) }).catch(() => setSinFoto(true))
  }, [lunes, doc, tomarFoto])
  const tomada = foto ? Date.parse(foto.tomada) : null
  const fotoTomada: 'leyendo' | 'nueva' | 'previa' | 'sin' = foto ? (ahora - tomada! < 15 * 60_000 ? 'nueva' : 'previa') : sinFoto ? 'sin' : 'leyendo'

  // SENSOR: lo que hay, sin juicio.
  const enSemana = useMemo(() => bloques.filter(b => b.fin > desde && b.inicio < hasta), [bloques, desde, hasta])
  const goal = goals?.goals.find(g => g.scope === 'week' && g.start === lunes) ?? null
  const entregables = goal ? entregablesDe(goal.success).items : null
  const leido = Boolean(snapshot) && Date.parse(snapshot!.range.from) <= desde && Date.parse(snapshot!.range.to) >= hasta
  const tareasHechas = leido ? (snapshot!.completedTasks ?? []).filter(t => t.completedAt && Date.parse(t.completedAt) >= desde && Date.parse(t.completedAt) < hasta).length : null
  const habits = useHabitRecords({ date: domingo, from: lunes, to: domingo })
  const casillas = useMemo(() => {
    const h = habits.data
    if (!h || !h.habitos.length) return null
    const dias = Math.max(0, Math.min(7, Math.ceil((corte - desde) / 86_400_000)))
    return { k: h.records.filter(r => r.hecho === true && r.fecha >= lunes && r.fecha <= domingo).length, n: h.habitos.length * dias }
  }, [habits.data, lunes, domingo, corte, desde])

  // COMPARADOR.
  const c = useMemo(() => comparar(foto, bloques, desde, corte), [foto, bloques, desde, corte])
  const hayMedicion = Boolean(doc && Object.keys(doc.delegados).length) || bloques.some(b => b.delegadoA)
  const recompradas = leido ? horasRecompradas(enSemana, desde, corte, hayMedicion) : null
  const dinero = recompradas !== null && doc?.tarifa ? formatoDinero(recompradas * doc.tarifa.monto, doc.tarifa.moneda) : null
  const maxH = Math.max(1, ...CUADRANTES.map(q => Math.max(c.plan?.[q.id] ?? 0, c.real[q.id]))) // escala común de las dos barras
  const totalPlan = c.plan ? CUADRANTES.reduce((a, q) => a + c.plan![q.id], 0) : 0, totalReal = CUADRANTES.reduce((a, q) => a + c.real[q.id], 0)
  const totalSemana = CUADRANTES.reduce((a, q) => a + c.semana[q.id], 0)
  const escala = Math.max(totalPlan, totalReal, 1)
  const desvios = c.plan ? CUADRANTES.map(q => ({ q, h: c.real[q.id] - c.plan![q.id] })).filter(d => Math.abs(d.h) >= 0.25) : []
  const maxDesvio = Math.max(1, ...desvios.map(d => Math.abs(d.h)))
  const dominante = c.dominante ? ASESINOS.find(a => a.id === c.dominante!.id) ?? null : null
  /** La foto se tomó después del lunes: el plan cuenta desde ahí. */
  const tarde = c.desdePlan > desde + 12 * 3_600_000, sinTramo = c.desdePlan >= corte

  // Los avisos que pidieron tu decisión en la semana (interrupciones.ts): la fuente honesta, o «sin medir».
  const [interrup, setInterrup] = useState<LecturaInterrupciones | null>(null)
  useEffect(() => {
    let vivo = true; setInterrup(null)
    const q = new URLSearchParams({ desde: new Date(desde).toISOString(), hasta: new Date(Math.max(corte, desde + 60_000)).toISOString() })
    fetch(`/api/planning/interrupciones?${q}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) }).then(r => r.ok ? r.json() : Promise.reject())
      .then((b: LecturaInterrupciones) => { if (vivo) setInterrup(b) }).catch(() => { if (vivo) setInterrup({ medido: false, motivo: 'No pude leer los avisos.' }) })
    return () => { vivo = false }
  }, [desde, corte])

  // ATENUADOR: lo que se pliega y lo que se protege.
  const protegidos = enSemana.filter(b => b.protegido).length
  const delegados = enSemana.filter(b => b.delegadoA).length

  // ACTUADOR: UNA propuesta para la semana que viene.
  const siguiente = useMemo(() => bloques.filter(b => b.inicio >= hasta && b.inicio < hasta + 7 * 86_400_000), [bloques, hasta])
  const leidaSiguiente = Boolean(snapshot) && Date.parse(snapshot!.range.to) >= hasta + 7 * 86_400_000
  const propuesta = useMemo(() => leidaSiguiente ? proponer(siguiente, c.dominante?.id ?? null) : null, [leidaSiguiente, siguiente, c.dominante])
  const [estado, setEstado] = useState<'listo' | 'aplicando' | 'aplicada' | 'error'>('listo')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setEstado('listo'); setError(null) }, [lunes])
  const aplicarla = async () => {
    if (!propuesta) return
    setEstado('aplicando'); setError(null)
    try { await aplicar(propuesta); setEstado('aplicada') } catch (e) { setEstado('error'); setError(e instanceof Error ? e.message : 'Google no confirmó.') }
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc)
  }, [onCerrar])

  const rango = `${format(parseISO(lunes), 'd', { locale: es })} – ${format(addDays(parseISO(lunes), 6), "d 'de' MMMM", { locale: es })}`
  const parcial = Boolean(foto) && tarde
  return <div className={s.capa} role="dialog" aria-modal="true" aria-label={`Revisión del domingo, semana del ${rango}`}>
    <div className={s.pantalla}>
      <header className={s.cabeza}>
        <div className={s.titulo}>
          <p className={s.ceja}>Revisión del domingo · el circuito</p>
          <h2><button className={s.flecha} onClick={() => onLunes(-7)} aria-label="Semana anterior"><ChevronLeft size={16} /></button>
            <span>Semana del {rango}</span>
            <button className={s.flecha} onClick={() => onLunes(7)} aria-label="Semana siguiente"><ChevronRight size={16} /></button></h2>
          {goal && <p className={s.objetivo}><span>Objetivo</span>{goal.title}</p>}
        </div>
        <button className={s.cerrar} onClick={onCerrar} aria-label="Cerrar la revisión (Esc)"><X size={18} /></button>
      </header>

      <ol className={s.circuito}>
        {/* 1 · SENSOR */}
        <li className={s.etapa} data-etapa="sensor" style={{ '--i': 0 } as CSSProperties}>
          <h3><b>1</b>Sensor<small>Levy lee lo real</small></h3>
          {/* Una frase, no un tablero (crítico A/B, ronda 1): lo que Levy leyó, sin juicio. */}
          <p className={s.leido}>{leido ? <>Leí <b>{enSemana.length} bloques</b> de tu calendario</> : <>Aún no leo esta semana</>}
            {entregables && entregables.length > 0 && <>, <b>{entregables.filter(e => e.hecho).length} de {entregables.length}</b> entregables</>}
            {casillas && <>, <b>{casillas.k} de {casillas.n}</b> casillas de hábitos</>}
            {tareasHechas !== null && <> y <b>{tareasHechas}</b> {tareasHechas === 1 ? 'tarea hecha' : 'tareas hechas'}</>}.</p>
          <p className={s.foto} data-estado={fotoTomada}>
            {fotoTomada === 'previa' && foto ? <>Referencia: la foto del plan del {dia(foto.tomada)}, {hm(tomada!)}{parcial ? '. Se tomó tarde: lo de antes no se compara' : ''}.</>
              : fotoTomada === 'nueva' ? <>No había foto del plan: <b>la guardé ahora</b>{tarde ? '. Esta semana se compara desde aquí; la que viene, completa' : ''}.</>
              : fotoTomada === 'sin' ? <>Sin foto del plan: no pude guardarla.</> : <>Leyendo la foto del plan…</>}
          </p>
        </li>

        {/* 2 · COMPARADOR */}
        <li className={s.etapa} data-etapa="comparador" style={{ '--i': 1 } as CSSProperties}>
          <h3><b>2</b>Comparador<small>real contra la referencia</small></h3>
          {/* Los tres números del domingo (25 oct 2026, firmado): Producir, interrupciones en R/D y la tasa de recompra. Sin medición, «sin medir». */}
          <div className={s.grande} data-tres>
            <p className={s.cifra} style={{ '--c': DRIP.producir.color } as CSSProperties}><span>{formatoHorasDrip(leido ? c.semana.producir : null)}</span><small>de Producir en tu calendario{c.plan && !tarde ? ` de ${formatoHorasDrip(c.plan.producir)} planeadas` : ''}</small></p>
            <p className={s.cifra} title={interrup?.medido ? 'Avisos de tus rutinas que pidieron tu decisión, clasificados por DRIP. Las preguntas dentro del chat aún no se miden.' : undefined}>
              {interrup === null ? <><span>…</span><small>interrupciones</small></>
                : interrup.medido ? <><span>{interrup.rd}</span><small>{interrup.rd === 1 ? 'interrupción' : 'interrupciones'} en Reemplazar o Delegar · de {interrup.total} {interrup.total === 1 ? 'aviso que pidió' : 'avisos que pidieron'} tu decisión{interrup.ejemplos[0] ? ` (p. ej. «${interrup.ejemplos[0]}»)` : ''}. Las del chat: sin medir</small></>
                : <><span className={s.sinMedir}>sin medir</span><small>interrupciones en Reemplazar o Delegar · {interrup.motivo}</small></>}
            </p>
            <TasaRecompra doc={doc} poner={ponerTarifa} recompradas={recompradas} dinero={dinero} />
          </div>
          {/* El desvío, no dos barras iguales: solo lo que se movió entre plan y real (crítico A/B, ronda 1). */}
          {tarde && <p className={s.desde}>{sinTramo ? 'Plan contra real empieza con la próxima foto (el lunes).' : `Plan contra real desde el ${dia(c.desdePlan)}, ${hm(c.desdePlan)}`}</p>}
          {!sinTramo && c.plan && (desvios.length ? <ul className={s.desvios} aria-label="Desvío entre plan y real">{desvios.map(d => <li key={d.q.id} data-signo={d.h > 0 ? '+' : '-'} style={{ '--c': d.q.color, '--w': `${Math.min(100, Math.abs(d.h) / maxDesvio * 100)}%` } as CSSProperties}>
              <span>{d.q.nombre}</span><i aria-hidden /><b>{d.h > 0 ? '+' : '−'}{formatoHorasDrip(Math.abs(d.h))}</b></li>)}</ul>
            : <p className={s.igual}>Tu calendario no se movió contra el plan: nada se cayó ni se pospuso. (Mide lo agendado, no lo hecho.)</p>)}
          {(c.cayeron.length > 0 || c.pospuestos.length > 0) && <ul className={s.diferencias}>
            {c.cayeron.slice(0, 2).map(b => <li key={b.id}><span data-tipo="cayo">se cayó</span>{sinEmoji(b.titulo)}<small>{dia(b.inicio)}</small></li>)}
            {c.pospuestos.slice(0, 2).map(p => <li key={p.antes.id}><span data-tipo="pospuesto">se movió</span>{sinEmoji(p.antes.titulo)}<small>{dia(p.antes.inicio)} → {dia(p.ahora.inicio)}</small></li>)}
          </ul>}
          {maxH === 1 && !leido && <p className={s.nota}>Abre esta semana en el calendario para que Levy la lea.</p>}
        </li>

        {/* 3 · ATENUADOR */}
        <li className={s.etapa} data-etapa="atenuador" style={{ '--i': 2 } as CSSProperties}>
          <h3><b>3</b>Atenuador<small>qué se coló y qué se pliega</small></h3>
          {/* Solo el que apareció (crítico A/B, ronda 1); los cinco de Martell quedan como cinco puntos, uno encendido. */}
          <p className={s.subrotulo}>Asesino del tiempo <span className={s.cinco} aria-hidden>{ASESINOS.map(a => <i key={a.id} data-on={c.dominante?.id === a.id || undefined} title={`${a.nombre} (${a.libro})`} />)}</span></p>
          {dominante ? <p className={s.asesino}><b>{dominante.nombre}</b><small>{dominante.libro}</small></p> : null}
          <p className={s.senal}>{c.dominante ? <>{c.dominante.texto}<small> Una señal de tu calendario, no un diagnóstico.</small></> : foto ? 'Ninguno de los cinco apareció esta semana.' : 'Sin foto del plan, solo se ven las señales de Delegar y de revisar.'}</p>
          <p className={s.pliegaLinea}>El sistema ya pliega {rutinasPlegadas} rutinas del Mes{protegidos ? `, protege ${protegidos}` : ''}{delegados ? ` y ${delegados} son de alguien más` : ''}.</p>
        </li>

        {/* 4 · ACTUADOR */}
        <li className={s.etapa} data-etapa="actuador" style={{ '--i': 3 } as CSSProperties}>
          <h3><b>4</b>Actuador<small>un ajuste, un toque</small></h3>
          {propuesta ? <div className={s.propuesta} data-estado={estado} style={{ '--c': DRIP[propuesta.bloque.cuadrante as Cuadrante].color } as CSSProperties}>
            <p className={s.verbo}>{propuesta.tipo === 'proteger' ? <Lock size={14} aria-hidden /> : <Send size={14} aria-hidden />}{propuesta.texto}</p>
            <p className={s.bloque}><i aria-hidden /><span>{sinEmoji(propuesta.bloque.titulo)}</span><small>{dia(propuesta.bloque.inicio)} · {hm(propuesta.bloque.inicio)}–{hm(propuesta.bloque.fin)}</small></p>
            <p className={s.porque}>{propuesta.porque}</p>
            {estado === 'aplicada' ? <p className={s.hecho}><Check size={14} aria-hidden />Aplicado en tu calendario<button onClick={() => { deshacer(); setEstado('listo') }}><Undo2 size={13} aria-hidden />Deshacer</button></p>
              : <button className={s.aplicar} disabled={!pluma || estado === 'aplicando'} onClick={() => void aplicarla()}>{estado === 'aplicando' ? 'Aplicando…' : <>Aplicar<ArrowRight size={14} aria-hidden /></>}</button>}
            {error && <p className={s.error} role="alert">{error}</p>}
            <p className={s.nota}>Se escribe por la misma pluma del calendario; ⌘Z lo deshace.</p>
          </div> : <p className={s.nota}>{leidaSiguiente ? 'Nada que ajustar: la semana que viene no tiene un bloque de Producir sin proteger ni algo delegable tuyo.' : 'Para proponer, Levy necesita leer la semana que viene: ábrela en el calendario.'}</p>}
        </li>
      </ol>
      <p className={s.lazo} aria-hidden><span>la semana que viene, Levy vuelve a leer</span></p>
    </div>
  </div>
}

/**
 * La tasa de recompra en la revisión (Buyback Rate, cap. 2, p. 63): lo que te paga tu negocio al año ÷ 8,000. Campo editable, nace
 * vacío: Levy no la inventa (si la calcula, el ingreso sale de una fuente viva y se guarda con tu sí). Debajo, las horas recompradas.
 */
function TasaRecompra({ doc, poner, recompradas, dinero }: { doc: DocDripVista | null; poner?: (monto: number | null, moneda?: string) => Promise<unknown>; recompradas: number | null; dinero: string | null }) {
  const [valor, setValor] = useState(doc?.tarifa ? String(doc.tarifa.monto) : '')
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'error'>('quieto')
  useEffect(() => { setValor(doc?.tarifa ? String(doc.tarifa.monto) : '') }, [doc?.tarifa])
  const moneda = doc?.tarifa?.moneda ?? 'USD'
  const confirmar = async () => {
    if (!poner) return
    const n = Number(valor)
    if (valor.trim() === (doc?.tarifa ? String(doc.tarifa.monto) : '')) return
    if (valor.trim() && !(n > 0)) return
    setEstado('guardando')
    try { await poner(valor.trim() ? n : null, moneda); setEstado('quieto') } catch { setEstado('error') }
  }
  return <div className={s.cifra} data-tasa>
    {poner ? <label className={s.tasa}><span className={s.tasaSigno} aria-hidden>$</span>
      <input inputMode="decimal" placeholder="—" value={valor} onChange={ev => setValor(ev.target.value.replace(/[^\d.]/g, ''))} onBlur={() => void confirmar()} onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
        aria-label="Tasa de recompra por hora" /></label>
      : <span>{doc?.tarifa ? formatoDinero(doc.tarifa.monto, moneda) : '—'}</span>}
    <small>{moneda}/h tasa de recompra (al año ÷ 8,000){doc?.tarifa && !doc.tarifaPropia ? ' · la de tu instalación' : ''}{!doc?.tarifa ? ' · sin fijar' : ''} · {formatoHorasDrip(recompradas)} recompradas{dinero ? ` = ${dinero}` : ''}{estado === 'guardando' ? ' · guardando…' : estado === 'error' ? ' · no se guardó' : ''}</small>
  </div>
}
