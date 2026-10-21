'use client'
/**
 * Salud (5 oct 2026). Daniel: «una UI para las automatizaciones de mi salud que ya llegan desde el reloj… para el
 * estándar, no solo para mí sino para todos». Diseño: docs/builds/vista-salud-2026-10-05.md.
 *
 * En 3 segundos: una palabra (Con margen, En tu normal, Señales cruzadas, Pide calma, Vigila) y qué hacer con eso,
 * amarrado al objetivo del día. Debajo, el porqué: la noche, cada métrica contra TU banda, la tira de 30 días, tus
 * hábitos contra la noche siguiente (solo con muestras suficientes) y tu pacto. Sin anillos ni puntajes ajenos.
 * Quien no tiene datos ve «Conecta tu reloj». Lógica pura en features/salud/modelo.ts.
 * Movimiento: el lenguaje común. Entra escalonado, las cifras cuentan una vez, la noche se llena, solo late el reloj
 * cuando su último envío es reciente, «sin medir» es el rayado. Un solo componente: pestaña del «+», sección /salud y
 * `mostrar {vista:"salud"}` en el chat.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MessageCircle, RefreshCw, Watch } from 'lucide-react'
import { mov, escalon, Cifra } from '@/shared/movimiento'
import { useFuente, releer } from '../datos'
import { useAhora } from '../useAhora'
import { etiquetaDia, sumarDias as sumar } from '../model'
import { urlCalendario } from './Calendario'
import type { GoalSnapshot } from '@/features/goals/model'
import type { PlanningSnapshot } from '@/features/planning/types'
import { objetivoDe } from '@/features/planning/periodo-vivo'
import {
  base, habitoVsCuerpo, hace, horasYMin, lectura, METRICAS, MIN_BASE, MIN_MUESTRAS, metrica, nocheDe, posicion, reloj, serie, sinDatos, tendencia,
  type DatosSalud, type Dia, type HabitoCuerpo, type MetricaDef, type MetricaDia, type PactoFila, type Tendencia,
} from '@/features/salud/modelo'
import { ConectaReloj } from './ConectaReloj'
import l from '../luz.module.css'
import h from './salud.module.css'

export const URL_SALUD = '/api/salud'
export { resumenSalud } from '@/features/salud/modelo'

const corto = (dia: string) => etiquetaDia(dia, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
const horaLectura = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }) : null
const minutos = (horas: number) => horas < 1 ? `${Math.round(horas * 60)} min` : horasYMin(horas)
const valorDe = (d: Dia | undefined, c: MetricaDia) => { const v = d?.[c]; return typeof v === 'number' ? v : null }
const conUnidad = (m: MetricaDef, v: number) => `${m.formato(v)}${m.unidad ? ` ${m.unidad}` : ''}`

function Tarjeta({ ceja, extra, i, children, className }: { ceja: React.ReactNode; extra?: React.ReactNode; i: number; children: React.ReactNode; className?: string }) {
  return <section className={`${h.tarjeta} ${mov.entra}${className ? ` ${className}` : ''}`} style={escalon(i)}>
    <header className={h.ceja}><span>{ceja}</span>{extra}</header>
    {children}
  </section>
}

function Hueco({ texto }: { texto: string }) { return <p className={`${h.hueco} ${mov.hueco}`}>{texto}</p> }

function Cargando() { return <div className={h.cargando} aria-label="Leyendo tu reloj"><span /><span /><span /><span /></div> }

// ── El reloj: solo late si el último envío es reciente ──
function Reloj({ ultimo, ahora }: { ultimo: string | null; ahora: number }) {
  const e = reloj(ultimo, ahora)
  return <p className={h.reloj} data-estado={e} title={ultimo ? `Último envío del reloj: ${new Date(ultimo).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}` : 'Tu reloj aún no ha enviado nada'}>
    <i className={e === 'vivo' ? mov.late : undefined} aria-hidden />
    <span>{e === 'nunca' ? 'Reloj sin envíos' : `Reloj · ${hace(ultimo!, ahora)}`}</span>
  </p>
}

// ── La lectura del día (héroe) ──
function Heroe({ x, objetivo, ahora, onConversar }: { x: DatosSalud; objetivo: string | null; ahora: number; onConversar: () => void }) {
  const lec = useMemo(() => lectura(x.dias, x.hoy, objetivo), [x.dias, x.hoy, objetivo])
  return <header className={h.heroe} data-estado={lec.estado}>
    <div className={`${h.heroeTop} ${mov.entra}`} style={escalon(0)}>
      <p className={l.ceja}>Salud · <b>Hoy</b> · {etiquetaDia(x.hoy, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <Reloj ultimo={x.ultimoEnvio} ahora={ahora} />
    </div>
    <h3 className={`${h.palabra} ${l.serif} ${mov.entra}`} style={escalon(1)}>{lec.palabra}</h3>
    <p className={`${h.hacer} ${mov.entra}`} style={escalon(2)}>{lec.hacer}</p>
    {lec.estado === 'sin-lectura' && lec.ultimoDia && <p className={`${h.nota} ${mov.aparece}`}>Lo último que llegó fue del {corto(lec.ultimoDia)}.</p>}
    {lec.senales.length > 0 && <ul className={h.senales} aria-label="Por qué">
      {lec.senales.map((s, i) => <li key={s.clave} className={mov.entra} style={escalon(3 + i)} data-voto={s.voto ?? undefined} data-sin-medir={s.sinMedir || undefined}>
        <i aria-hidden className={s.sinMedir ? mov.hueco : undefined} />{s.texto}
      </li>)}
    </ul>}
    <div className={`${h.objetivo} ${mov.entra}`} style={escalon(9)}>
      {objetivo ? <p><span>Objetivo de hoy</span> <b>«{objetivo}»</b></p> : <p><span>Sin objetivo del día registrado.</span></p>}
      <button className={l.enlace} onClick={onConversar}><MessageCircle size={12} aria-hidden /> Conversar con Levy</button>
    </div>
  </header>
}

// ── La noche ──
function LaNoche({ x, i }: { x: DatosSalud; i: number }) {
  const n = useMemo(() => nocheDe(x.dias, x.noches, x.hoy), [x.dias, x.noches, x.hoy])
  const suma = n.fases.reduce((a, f) => a + (f.horas ?? 0), 0)
  const conFases = n.fases.some(f => f.horas != null) && suma > 0
  return <Tarjeta i={i} ceja={<>La noche · <b>{corto(sumar(x.hoy, -1))} → {corto(x.hoy)}</b></>}>
    {n.total == null ? <Hueco texto="Sin medir: el reloj no registró sueño anoche. ¿Dormiste con él puesto?" /> : <>
      <div className={h.nocheCifras}>
        <Cifra className={h.cifra} valor={n.total} clave={`salud-sueno-${x.hoy}`} formato={horasYMin} />
        {n.inicio && n.fin ? <p className={h.horario}><b>{n.inicio}</b><span aria-hidden>→</span><b>{n.fin}</b><small>te dormiste · despertaste</small></p>
          : <p className={h.horario}><small>Hora de dormir: sin medir</small></p>}
      </div>
      {conFases ? <>
        <div className={h.composicion} role="img" aria-label={n.fases.map(f => `${f.nombre} ${f.horas == null ? 'sin medir' : minutos(f.horas)}`).join(', ')}>
          {n.fases.map((f, k) => f.horas ? <span key={f.clave} className={mov.llena} data-fase={f.clave} style={{ ...escalon(i + k), width: `${(f.horas / suma) * 100}%` }} /> : null)}
        </div>
        <dl className={h.fases}>
          {n.fases.map(f => <div key={f.clave} data-fase={f.clave}>
            <dt><i aria-hidden />{f.nombre}</dt>
            <dd>{f.horas == null ? <em>sin medir</em> : minutos(f.horas)}{f.horas != null && f.normal != null && <small>tu normal {minutos(f.normal)}</small>}</dd>
          </div>)}
        </dl>
      </> : <Hueco texto="Fases del sueño: sin medir anoche." />}
    </>}
  </Tarjeta>
}

// ── Frente a tu normal ──
function Pista({ m, x, d, t7 }: { m: MetricaDef; x: DatosSalud; d: Dia | undefined; t7: Tendencia }) {
  const b = base(x.dias, m.clave, x.hoy)
  const hoyV = valorDe(d, m.clave)
  if (!b.suficiente || b.p25 == null || b.p75 == null || b.p50 == null) return <span className={h.aprendiendo}>aprendiendo tu normal · {b.n} de {MIN_BASE} días</span>
  const vals = [b.p25, b.p75, hoyV, t7.media, ...serie(x.dias, m, x.hoy).map(p => p.valor)].filter((v): v is number => v != null)
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad
  const pct = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return <span className={h.pista} aria-hidden>
    <span className={h.banda} style={{ left: pct(b.p25), width: `calc(${pct(b.p75)} - ${pct(b.p25)})` }} />
    <span className={h.mediana} style={{ left: pct(b.p50) }} />
    {t7.media != null && <span className={h.anillo} style={{ left: pct(t7.media) }} />}
    {hoyV != null && <span className={h.punto} data-en-curso={m.enCurso || undefined} style={{ left: pct(hoyV) }} />}
  </span>
}

const signo = (t: Tendencia, m: MetricaDef) => {
  if (t.media == null) return '—'
  // Sin banda todavía: el promedio a secas (la unidad ya está en la fila).
  if (t.delta == null) return m.formato(t.media)
  if (m.mejor === 'estable') return Math.abs(t.delta) < 0.05 ? '=' : `${t.delta > 0 ? '+' : '−'}${m.formato(Math.abs(t.delta))}`
  return Math.abs(t.delta) < 0.5 ? '=' : `${t.delta > 0 ? '+' : '−'}${Math.abs(t.delta).toFixed(0)} %`
}
const SENTIDO: Record<string, string> = { favor: 'a tu favor', contra: 'en contra', igual: 'en tu normal', fuera: 'fuera de lo tuyo' }

function Tend({ t, m }: { t: Tendencia; m: MetricaDef }) {
  return <span className={h.tend} data-sentido={t.sentido ?? undefined} title={`Promedio de ${t.medidos} de ${t.dias} días medidos${t.media != null ? `: ${conUnidad(m, t.media)}` : ''}`}>
    <small>{t.dias} d</small><b>{signo(t, m)}</b>{t.medidos < t.dias && t.medidos > 0 && <em>{t.medidos}/{t.dias}</em>}
  </span>
}

function FrenteATuNormal({ x, i, sel, onSel }: { x: DatosSalud; i: number; sel: MetricaDia; onSel: (c: MetricaDia) => void }) {
  const d = x.dias.find(z => z.fecha === x.hoy)
  return <Tarjeta i={i} ceja={<b>Frente a tu normal</b>} extra={<small className={h.ayuda}>banda = tus últimos {60} días · <i className={h.leyPunto} aria-hidden /> hoy · <i className={h.leyAnillo} aria-hidden /> 7 d</small>}>
    <ul className={h.filas}>
      {METRICAS.map((m, k) => {
        const v = valorDe(d, m.clave), b = base(x.dias, m.clave, x.hoy)
        const t7 = tendencia(x.dias, m, x.hoy, 7, b), t30 = tendencia(x.dias, m, x.hoy, 30, b)
        const p = v != null ? posicion(v, b) : null
        return <li key={m.clave} className={mov.entra} style={escalon(i + k)}>
          <button className={h.fila} onClick={() => onSel(m.clave)} aria-pressed={sel === m.clave} title={`Ver ${m.nombre} en los últimos 30 días`}>
            <span className={h.nombre}>
              <span>{m.nombre}</span>
              {v == null ? <em className={`${h.sinMedir} ${mov.hueco}`}>sin medir</em>
                : <b><Cifra valor={v} clave={`salud-${m.clave}-${x.hoy}`} formato={m.formato} />{m.unidad && <small>{m.unidad}</small>}{m.enCurso && <small>hoy va</small>}{p && p !== 'dentro' && !m.enCurso && <small data-pos={p}>{p}</small>}</b>}
            </span>
            <Pista m={m} x={x} d={d} t7={t7} />
            <span className={h.tends}><Tend t={t7} m={m} /><Tend t={t30} m={m} />
              {t7.sentido && <small className={h.sentido} data-sentido={t7.sentido}>{SENTIDO[t7.sentido]}</small>}</span>
          </button>
        </li>
      })}
    </ul>
  </Tarjeta>
}

// ── La tira de 30 días ──
function Tira({ x, i, sel, onSel }: { x: DatosSalud; i: number; sel: MetricaDia; onSel: (c: MetricaDia) => void }) {
  const m = metrica(sel)
  const puntos = useMemo(() => serie(x.dias, m, x.hoy), [x.dias, m, x.hoy])
  const b = base(x.dias, m.clave, x.hoy)
  const [foco, setFoco] = useState<string | null>(null)
  const vals = puntos.map(p => p.valor).filter((v): v is number => v != null)
  const conBanda = b.suficiente && b.p25 != null && b.p75 != null
  const todos = [...vals, ...(conBanda ? [b.p25!, b.p75!] : [])]
  const min = todos.length ? Math.min(...todos) : 0, max = todos.length ? Math.max(...todos) : 1
  const lo = min - (max - min) * 0.35 - (max === min ? 1 : 0), hi = max + (max - min) * 0.06
  const alto = (v: number) => `${Math.max(4, ((v - lo) / (hi - lo)) * 100)}%`
  const elegido = puntos.find(p => p.fecha === foco) ?? [...puntos].reverse().find(p => p.valor != null) ?? puntos.at(-1)!
  const medidos = vals.length
  return <Tarjeta i={i} ceja={<>Últimos 30 días · <b>{m.nombre}</b></>} extra={<small className={h.ayuda}>{medidos} de 30 medidos</small>}>
    <div className={h.chips} role="tablist" aria-label="Métrica">
      {METRICAS.map(c => <button key={c.clave} role="tab" aria-selected={c.clave === sel} className={h.chip} onClick={() => { onSel(c.clave); setFoco(null) }}>{c.nombre}</button>)}
    </div>
    <div className={h.tira} onMouseLeave={() => setFoco(null)}>
      {conBanda && <span className={h.tiraBanda} style={{ bottom: alto(b.p25!), height: `calc(${alto(b.p75!)} - ${alto(b.p25!)})` }} aria-hidden />}
      {b.suficiente && b.p50 != null && <span className={h.tiraMediana} style={{ bottom: alto(b.p50) }} aria-hidden />}
      {puntos.map((p, k) => <button key={p.fecha} className={`${h.barraDia}${p.valor == null ? ` ${mov.hueco}` : ''}`} data-hoy={p.hoy || undefined} data-foco={elegido.fecha === p.fecha || undefined}
        onMouseEnter={() => setFoco(p.fecha)} onFocus={() => setFoco(p.fecha)} onClick={() => setFoco(p.fecha)}
        aria-label={`${corto(p.fecha)}: ${p.valor == null ? 'sin medir' : conUnidad(m, p.valor)}`}>
        {p.valor != null && <i className={mov.entra} style={{ ...escalon(Math.floor(k / 3)), height: alto(p.valor) }} />}
      </button>)}
    </div>
    <div className={h.tiraPie}>
      <span>{corto(puntos[0].fecha)}</span>
      <p aria-live="polite"><b>{corto(elegido.fecha)}</b> · {elegido.valor == null ? <em>sin medir</em> : <>{conUnidad(m, elegido.valor)}{elegido.enCurso ? ' (va en curso)' : ''}</>}</p>
      <span>hoy</span>
    </div>
  </Tarjeta>
}

// ── Hábitos y cuerpo ──
function Puntos({ n }: { n: number }) {
  return <span className={h.conteo} aria-hidden>{Array.from({ length: MIN_MUESTRAS }, (_, k) => <i key={k} data-lleno={k < n || undefined} />)}</span>
}
function Habito({ r, i }: { r: HabitoCuerpo; i: number }) {
  const dif = (a: number | null, b: number | null, f: (v: number) => string) => a == null || b == null ? 'sin medir' : `${f(a)} vs ${f(b)}`
  return <li className={`${h.habito} ${mov.entra}`} style={escalon(i)}>
    <header><b>{r.nombre}</b><span data-hoy={r.hoy == null ? 'sin' : r.hoy ? 'si' : 'no'}>hoy: {r.hoy == null ? 'sin marcar' : r.hoy ? 'cumplido' : 'no cumplido'}</span></header>
    {r.suficiente ? <>
      <p className={h.compara}>La noche después de cumplir contra la de no cumplir: HRV <b>{dif(r.si.hrv, r.no.hrv, v => `${Math.round(v)} ms`)}</b> · sueño <b>{dif(r.si.sueno, r.no.sueno, horasYMin)}</b></p>
      <p className={h.nota}>{r.si.noches} noches contra {r.no.noches}. Es asociación, no causa.</p>
    </> : <>
      <div className={h.faltan}>
        <p><Puntos n={r.si.noches} /><span>{r.si.noches} {r.si.noches === 1 ? 'noche medida' : 'noches medidas'} después de cumplir</span></p>
        <p><Puntos n={r.no.noches} /><span>{r.no.noches} después de no cumplir</span></p>
      </div>
      <p className={h.nota}>Faltan muestras para comparar: necesito {MIN_MUESTRAS} de cada lado{r.faltanNo && r.no.noches === 0 ? '. Marcar «no cumplido» también cuenta; sin registro, no' : ''}.{r.sinMedir ? ` ${r.sinMedir} ${r.sinMedir === 1 ? 'marca cayó' : 'marcas cayeron'} en noches sin medir.` : ''}</p>
    </>}
  </li>
}
function HabitosYCuerpo({ x, i }: { x: DatosSalud; i: number }) {
  const filas = useMemo(() => x.habitos.map(hb => habitoVsCuerpo(hb, x.marcas, x.dias, x.hoy)), [x.habitos, x.marcas, x.dias, x.hoy])
  return <Tarjeta i={i} ceja={<b>Tus hábitos y tu cuerpo</b>} extra={<Link className={l.enlace} href="/calendar?mode=day">Marcar en el Día</Link>}>
    {!filas.length ? <Hueco texto="Sin hábitos activos todavía. Cuando los marques en el Día, aquí ves si mueven tu noche." />
      : <ul className={h.habitos}>{filas.map((r, k) => <Habito key={r.clave} r={r} i={i + k} />)}</ul>}
  </Tarjeta>
}

// ── Tu pacto (el semáforo del morning briefing, misma lógica) ──
const UNIDAD_PACTO: Record<string, string> = { h: 'h', ms: 'ms', bpm: 'lpm', '/10': '/10' }
function Pacto({ filas, i }: { filas: PactoFila[]; i: number }) {
  return <Tarjeta i={i} ceja={<b>Tu pacto</b>} extra={<small className={h.ayuda}>promedio 7 d · el semáforo del briefing</small>}>
    <ul className={h.pacto}>{filas.map(p => <li key={p.key} data-color={p.color ?? undefined}>
      <i aria-hidden className={p.color ? undefined : mov.hueco} /><span>{p.nombre === 'Resting HR' ? 'Pulso en reposo' : p.nombre === 'HRV (SDNN)' ? 'HRV' : p.nombre}</span>
      <b>{p.valor == null ? <em>sin medir</em> : `${p.key === 'sueno_horas' ? horasYMin(p.valor) : Math.round(p.valor * 10) / 10}${p.key === 'sueno_horas' ? '' : ` ${UNIDAD_PACTO[p.unidad] ?? p.unidad}`}`}</b>
      <small>{p.mejor === 'alto' ? '≥' : '≤'} {p.verde} {UNIDAD_PACTO[p.unidad] ?? p.unidad}</small>
    </li>)}</ul>
  </Tarjeta>
}

function Pie({ x, cargando, onConectar }: { x: DatosSalud; cargando: boolean; onConectar: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  async function actualizar() { setOcupado(true); try { await fetch(`${URL_SALUD}?fresco=1`, { cache: 'no-store' }); await releer(URL_SALUD) } finally { setOcupado(false) } }
  const hr = horaLectura(x.leidoEn)
  return <footer className={h.pie}>
    <span>{hr ? `Leído a las ${hr}` : ''} · {x.fuente === 'studio' ? 'desde tu receptor del Studio' : 'desde tu Arbrain'}</span>
    <span className={h.pieAcciones}>
      <button className={l.enlace} onClick={onConectar}><Watch size={12} aria-hidden /> Conecta tu reloj</button>
      <button className={l.enlace} onClick={() => void actualizar()} disabled={ocupado || cargando}><RefreshCw size={12} className={ocupado ? 'animate-spin' : undefined} aria-hidden /> Actualizar</button>
    </span>
  </footer>
}

export function VistaSalud({ grande }: { grande?: boolean }) {
  const lect = useFuente<DatosSalud>(URL_SALUD)
  const x = lect.data
  const ahora = useAhora()
  const [conectar, setConectar] = useState(false)
  const [sel, setSel] = useState<MetricaDia>('hrv_ms')
  // El objetivo del día: el del plan (o el evento «Objetivo del día» del calendario) si quien mira tiene plan; si no, su prioridad de la mañana.
  const plan = useFuente<GoalSnapshot>(x?.planPersonal ? '/api/planning/objectives' : null)
  const cal = useFuente<PlanningSnapshot>(x?.planPersonal ? urlCalendario('dia', x.hoy) : null)
  const objetivo = useMemo(() => {
    if (!x) return null
    const o = plan.data || cal.data ? objetivoDe(plan.data?.goals ?? [], cal.data ?? null, 'day', x.hoy) : null
    return o?.titulo ?? x.prioridad
  }, [x, plan.data, cal.data])

  const conversar = () => {
    if (!x) return
    const l0 = lectura(x.dias, x.hoy, objetivo)
    window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto: `Hablemos de mi cuerpo hoy. La vista Salud dice «${l0.palabra}»: ${l0.senales.map(s => s.texto).join('; ')}.${objetivo ? ` Mi objetivo del día es «${objetivo}».` : ''} Dame tu lectura con evidencia y qué ajustarías de mi día, sin inventar correlaciones.` } }))
  }

  if (!x) return <div className={h.salud}>{lect.error ? <p className={l.aviso}>{lect.error}</p> : <Cargando />}</div>
  if (conectar || sinDatos(x)) return <div className={h.salud}>
    {x.errores.length > 0 && <p className={l.aviso}>{x.errores.join(' ')}</p>}
    <ConectaReloj x={x} onVolver={sinDatos(x) ? undefined : () => setConectar(false)} />
  </div>

  return <div className={h.salud} data-grande={grande || undefined}>
    {x.errores.length > 0 && <p className={l.aviso}>{x.errores.join(' ')}</p>}
    <div className={h.rejilla}>
      {/* Ancho: dos columnas. Angosto (panel, teléfono): una sola en el orden de lectura (order en el CSS). */}
      <div className={h.columna}>
        <div className={h.o1}><Heroe x={x} objetivo={objetivo} ahora={ahora} onConversar={conversar} /></div>
        <div className={h.o2}><LaNoche x={x} i={10} /></div>
        <div className={h.o5}><HabitosYCuerpo x={x} i={12} /></div>
        {x.pacto && <div className={h.o6}><Pacto filas={x.pacto} i={14} /></div>}
      </div>
      <div className={h.columna}>
        <div className={h.o3}><FrenteATuNormal x={x} i={4} sel={sel} onSel={setSel} /></div>
        <div className={h.o4}><Tira x={x} i={11} sel={sel} onSel={setSel} /></div>
      </div>
    </div>
    <Pie x={x} cargando={lect.cargando} onConectar={() => setConectar(true)} />
  </div>
}

