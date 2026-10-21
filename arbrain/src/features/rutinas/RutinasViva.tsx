'use client'
/**
 * Taller › Rutinas, la vista viva (10 oct 2026). Daniel: «es muy aburrido como están ahora. ¿Hay posibilidad de que la
 * interfaz sea tan hermosa como la del calendario o el panel de Salud?». Brief: docs/builds/rutinas-vista-viva-2026-10-10/.
 *
 * En tres segundos: una frase honesta (todo en orden, falló X, X no corrió a su hora; «sin dato» nunca es «bien») y lo más
 * grave. Debajo, el reloj de 24 h: un anillo por categoría, cada rutina en su hora, la noche (22–05) en morado y la aguja del
 * ahora en oro. Luego qué rinde (tokens de 30 días, programas sin costo, lo que nadie usa), las seis categorías plegables con
 * su porqué y cada rutina con su historial y lo que reportó. Al fondo, lo que está en pausa y las lápidas.
 *
 * Solo lectura: nada aquí pausa, mueve ni activa. «Pedirle a Levy» deja un borrador en el chat, sin enviarlo.
 * Datos: el scheduler y 21 días de corridas (/api/planning/crons) + 30 días de tokens (/api/arbrain/rendimiento).
 * Lógica pura en ./vista.ts. Forma nacida en blanco con la vara de Salud y el calendario (god-animation, vara viva).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, ChevronRight, MessageCircle, Moon, RefreshCw, Search, Sun } from 'lucide-react'
import { mov, escalon, Cifra } from '@/shared/movimiento'
import { useFuente, releer } from '@/features/cabina/datos'
import { useAhora } from '@/features/cabina/useAhora'
import type { CronSnapshot } from '@/features/planning/types'
import { CATEGORIAS, PARA, type Categoria } from './catalogo'
import { LAPIDAS, LAPIDAS_FECHA } from './lapidas'
import { cuando, hace } from './model'
import { fmtTokens, propuestaVigente, type PropuestaRinde, type Rendimiento } from './rinde'
import { hhmm, leerFilas, lectura, nocheYDia, repartir, siguiente, type Fila, type Hora, type TonoViva } from './vista'
import v from './viva.module.css'

export const URL_RENDIMIENTO = '/api/arbrain/rendimiento'
const DIAS_HISTORIAL = 21
/** 21 días de corridas, con la ventana redondeada a la hora: la URL es la clave de la caché compartida. */
export function urlRutinasViva() {
  const to = Math.ceil(Date.now() / 3_600_000) * 3_600_000
  return `/api/planning/crons?${new URLSearchParams({ from: new Date(to - DIAS_HISTORIAL * 86_400_000).toISOString(), to: new Date(to).toISOString() })}`
}

interface DatosRinde {
  generadoEn: string; dias: number; schedulerError: string | null; propuestasError: string | null
  rutinas: Rendimiento[]; propuestas: PropuestaRinde[]; firmadas: number
}

const TZ = 'America/Mexico_City'
const reloj = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short' }).replace('.', '')
const duracion = (ms: number | null) => ms == null ? null : ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`
const minutoDe = (ms: number) => { const [h, m] = reloj(ms).split(':').map(Number); return h * 60 + m }
const diaDe = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ })
/** En cuánto falta: «en 12 min», «en 3 h», «mañana», «dom 1 nov». La hora ya va al lado. */
function enCuanto(ms: number, ahora: number) {
  const d = ms - ahora
  if (d < 3_600_000) return `en ${Math.max(1, Math.round(d / 60_000))} min`
  if (d < 12 * 3_600_000) return `en ${Math.round(d / 3_600_000)} h`
  if (diaDe(ms) === diaDe(ahora)) return 'hoy'
  if (diaDe(ms) === diaDe(ahora + 86_400_000)) return 'mañana'
  return new Date(ms).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
}

const TEXTO_TONO: Record<TonoViva, string> = { ok: 'salió bien', falla: 'falló', aviso: 'corrió con aviso', atrasada: 'no corrió a su hora', curso: 'trabajando', 'sin-dato': 'sin dato', pausada: 'en pausa' }

/** Deja el texto en la caja del chat sin enviarlo (mismo camino que «Corregir esto» de Memoria). */
function redactar(texto: string) {
  if (window.location.pathname.startsWith('/chat')) { window.dispatchEvent(new CustomEvent('cabina:redactar', { detail: { texto } })); return }
  try { sessionStorage.setItem('cabina:redactar', texto) } catch { /* modo privado */ }
  window.location.assign('/chat')
}

// ── El reloj de 24 h ──
// Medianoche abajo y mediodía arriba: el día sube por la izquierda y baja por la derecha, como el sol. Un anillo por
// categoría, de fuera (el dinero) hacia dentro (la máquina). La noche de la casa (22–05) es el sector morado.

const C = 200, R0 = 164, PASO_R = 15, R_IN = 74
const anillo = (cat: Categoria) => R0 - CATEGORIAS.findIndex(c => c.id === cat) * PASO_R
const angulo = (min: number) => ((min / 1440) * 360 + 180) % 360
const punto = (r: number, a: number) => { const t = (a * Math.PI) / 180; return [C + r * Math.sin(t), C - r * Math.cos(t)] as const }
function sector(a1: number, a2: number, rIn: number, rOut: number) {
  const barrido = ((a2 - a1) + 360) % 360, grande = barrido > 180 ? 1 : 0
  const [x1, y1] = punto(rOut, a1), [x2, y2] = punto(rOut, a2), [x3, y3] = punto(rIn, a2), [x4, y4] = punto(rIn, a1)
  return `M${x1} ${y1}A${rOut} ${rOut} 0 ${grande} 1 ${x2} ${y2}L${x3} ${y3}A${rIn} ${rIn} 0 ${grande} 0 ${x4} ${y4}Z`
}
interface Marca { fila: Fila; hora: Hora; clave: string; a?: number }

function Reloj24({ activas, ahora, sig, foco, setFoco, cat, setCat, onAbrir }: {
  activas: Fila[]; ahora: number; sig: Fila | null; foco: Marca | null; setFoco: (m: Marca | null) => void
  cat: Categoria | null; setCat: (c: Categoria | null) => void; onAbrir: (f: Fila) => void
}) {
  // Cada marca con su ángulo a pintar: en un mismo anillo, las cercanas se reparten para no encimarse (~13 px entre centros).
  const marcas = useMemo(() => {
    const todas = activas.flatMap(f => f.horario.horas.map((hora, k) => ({ fila: f, hora, clave: `${f.id}:${k}`, a: angulo(hora.h * 60 + hora.m) })))
    for (const c of CATEGORIAS) {
      const deAnillo = todas.filter(m => m.fila.categoria === c.id), r = anillo(c.id)
      // Medianoche cae en 180°: la costura del círculo queda arriba (mediodía), lejos de la noche, donde se juntan más.
      const repartidos = repartir(deAnillo.map(m => m.a), (13 / r) * (180 / Math.PI))
      deAnillo.forEach((m, i) => { m.a = repartidos[i] })
    }
    return todas
  }, [activas])
  const continuas = activas.filter(f => f.horario.ritmo === 'continua')
  const ahoraMin = minutoDe(ahora), aAhora = angulo(ahoraMin)
  const sigClave = sig ? (() => { const m = minutoDe(sig.siguiente!); const k = sig.horario.horas.findIndex(x => x.h * 60 + x.m === m); return `${sig.id}:${Math.max(0, k)}` })() : null
  const nd = nocheYDia(activas)
  const etiqueta = (m: Marca) => `${hhmm(m.hora)} · ${m.fila.nombre}${m.fila.horario.dias ? ` (${m.fila.horario.dias})` : ''}: ${TEXTO_TONO[m.fila.estado.tono]}`
  return <div className={v.relojCaja}>
    <div className={v.reloj}>
      <svg viewBox="0 0 400 400" role="group" aria-label={`Reloj de 24 horas con ${marcas.length} horas de rutina. Ahora: ${reloj(ahora)}.`} data-cat={cat ?? undefined}>
        <defs>
          <radialGradient id="rv-noche" cx="50%" cy="50%" r="50%"><stop offset="40%" stopColor="rgb(var(--brand-rgb))" stopOpacity="0.02" /><stop offset="100%" stopColor="rgb(var(--brand-rgb))" stopOpacity="0.16" /></radialGradient>
        </defs>
        <path d={sector(angulo(22 * 60), angulo(5 * 60), R_IN + 4, R0 + 10)} fill="url(#rv-noche)" className={v.noche} />
        {(() => { const [x, y] = punto(R0 + 2, angulo(1.5 * 60)); return <text x={x} y={y + 3} className={v.rotuloNoche} textAnchor="middle">noche</text> })()}
        {(() => { const [x, y] = punto(R0 + 2, angulo(13.5 * 60)); return <text x={x} y={y + 3} className={v.rotuloDia} textAnchor="middle">día</text> })()}
        {CATEGORIAS.map(c => <circle key={c.id} cx={C} cy={C} r={anillo(c.id)} className={v.anillo} data-cat={c.id} data-apagado={cat && cat !== c.id || undefined} />)}
        {Array.from({ length: 24 }, (_, h) => { const [x1, y1] = punto(R0 + 10, angulo(h * 60)), [x2, y2] = punto(R0 + (h % 3 ? 13 : 16), angulo(h * 60))
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} className={v.muesca} /> })}
        {[0, 3, 6, 9, 12, 15, 18, 21].map(h => { const [x, y] = punto(R0 + 27, angulo(h * 60)); return <text key={h} x={x} y={y + 4} className={v.hora} textAnchor="middle">{String(h).padStart(2, '0')}</text> })}
        {continuas.map((f, i) => <circle key={f.id} cx={C} cy={C} r={anillo(f.categoria)} className={v.continua} data-tono={f.estado.tono} data-apagado={cat && cat !== f.categoria || undefined}
          style={{ '--i': i } as CSSProperties} tabIndex={0} role="button" aria-label={`${f.nombre}: cada ${f.horario.cadaMin} minutos, todo el día. ${TEXTO_TONO[f.estado.tono]}`}
          onMouseEnter={() => setFoco({ fila: f, hora: { h: -1, m: 0 }, clave: f.id })} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco({ fila: f, hora: { h: -1, m: 0 }, clave: f.id })} onBlur={() => setFoco(null)}
          onClick={() => onAbrir(f)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(f) } }} />)}
        {/* La aguja del ahora: entra girando desde la medianoche, una sola vez. */}
        <g className={v.aguja} style={{ '--a': `${aAhora}deg` } as CSSProperties} aria-hidden>
          <line x1={C} y1={C - R_IN + 2} x2={C} y2={C - R0 - 8} />
          <circle cx={C} cy={C - R0 - 8} r={3.5} />
        </g>
        {marcas.map(m => { const a = m.a, [x, y] = punto(anillo(m.fila.categoria), a), esSig = m.clave === sigClave, enFoco = foco?.clave === m.clave
          return <g key={m.clave} className={v.marca} style={{ '--d': (a + 180) % 360 } as CSSProperties} data-tono={m.fila.estado.tono} data-ritmo={m.fila.horario.ritmo}
            data-apagado={cat && cat !== m.fila.categoria || undefined} data-foco={enFoco || undefined} data-sig={esSig || undefined}
            tabIndex={0} role="button" aria-label={etiqueta(m)}
            onMouseEnter={() => setFoco(m)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(m)} onBlur={() => setFoco(null)}
            onClick={() => onAbrir(m.fila)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(m.fila) } }}>
            {esSig && <circle cx={x} cy={y} r={10} className={v.halo} />}
            <circle cx={x} cy={y} r={8} className={v.blanco} />
            <circle cx={x} cy={y} r={enFoco ? 7 : 5.5} className={v.punto} />
          </g> })}
        <circle cx={C} cy={C} r={R_IN - 6} className={v.centro} />
      </svg>
      {/* La lente del centro: la marca bajo el cursor o, si no hay, la hora y lo que sigue. */}
      <div className={v.lente} aria-live="polite">
        {foco ? <>
          <b className={v.lenteHora}>{foco.hora.h < 0 ? `cada ${foco.fila.horario.cadaMin} min` : hhmm(foco.hora)}</b>
          <span className={v.lenteNombre}>{foco.fila.nombre}</span>
          <small data-tono={foco.fila.estado.tono}>{foco.fila.horario.dias ? `${foco.fila.horario.dias} · ` : ''}{TEXTO_TONO[foco.fila.estado.tono]}</small>
        </> : <>
          <b className={v.lenteHora} data-ahora>{reloj(ahora)}</b>
          <span className={v.lenteNombre}>{sig ? <>sigue <em>{sig.nombre}</em></> : 'ahora'}</span>
          {sig && <small>{reloj(sig.siguiente!)} · {enCuanto(sig.siguiente!, ahora)}</small>}
        </>}
      </div>
    </div>
    <div className={v.leyenda}>
      <p className={v.turnos}><span data-turno="noche"><Moon size={12} aria-hidden /> de noche <b>{nd.noche}</b></span><span data-turno="dia"><Sun size={12} aria-hidden /> de día <b>{nd.dia}</b></span>{nd.siempre > 0 && <span>todo el día <b>{nd.siempre}</b></span>}</p>
      <ol className={v.categoriasLeyenda} aria-label="Anillos, de fuera hacia dentro">
        {CATEGORIAS.map((c, i) => { const fs = activas.filter(f => f.categoria === c.id)
          return <li key={c.id}><button data-activa={cat === c.id || undefined} aria-pressed={cat === c.id} onMouseEnter={() => setCat(c.id)} onMouseLeave={() => setCat(null)} onFocus={() => setCat(c.id)} onBlur={() => setCat(null)}
            onClick={() => document.getElementById(`rv-cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <svg viewBox="0 0 16 16" aria-hidden className={v.mini}>{CATEGORIAS.map((_, k) => <circle key={k} cx="8" cy="8" r={7 - k * 1.1} data-este={k === i || undefined} />)}</svg>
            <span>{c.nombre}</span>
            <span className={v.puntitos} aria-label={`${fs.length} rutinas`}>{fs.map(f => <i key={f.id} data-tono={f.estado.tono} />)}</span>
          </button></li> })}
      </ol>
    </div>
  </div>
}

// ── Cada rutina ──

function Tira({ f }: { f: Fila }) {
  const cs = f.historial.slice(0, 10).reverse()
  if (!cs.length) return <span className={`${v.tira} ${v.tiraVacia}`}><i className={mov.hueco} /><small>sin corridas en {DIAS_HISTORIAL} días</small></span>
  return <span className={v.tira} aria-label={`Últimas ${cs.length}: ${cs.filter(c => c.tono === 'ok').length} bien, ${cs.filter(c => c.tono === 'falla').length} fallaron`}>{cs.map(c => <i key={c.at} data-tono={c.tono} />)}</span>
}

function Turno({ f }: { f: Fila }) {
  const hz = f.horario
  if (hz.ritmo === 'continua') return <span className={v.chip} data-turno="siempre">cada {hz.cadaMin} min</span>
  if (!hz.horas.length) return <span className={v.chip}>{f.job.schedule}</span>
  const horas = hz.horas.length > 2 ? `${hhmm(hz.horas[0])} +${hz.horas.length - 1}` : hz.horas.map(hhmm).join(' · ')
  return <span className={v.chip} data-turno={f.turno ?? undefined} title={cuando(f.job.schedule)}>
    {f.turno === 'noche' ? <Moon size={11} aria-hidden /> : f.turno === 'dia' ? <Sun size={11} aria-hidden /> : <><Moon size={11} aria-hidden /><Sun size={11} aria-hidden /></>}
    {horas}{hz.dias && <small>{hz.dias}</small>}
  </span>
}

function Costo({ f, dia, leyendo }: { f: Fila; dia: string; leyendo: boolean }) {
  const c = f.costo
  if (leyendo && f.info?.motor !== 'programa') return <span className={v.costo} data-tipo="leyendo"><b>…</b><small>leyendo costo</small></span>
  if (c.tipo === 'programa') return <span className={v.costo} data-tipo="programa"><b>sin costo</b><small>programa</small></span>
  if (c.tipo === 'tokens') return <span className={v.costo} data-tipo="tokens"><b><Cifra valor={c.tokens} clave={`rv-${f.id}-${dia}`} formato={fmtTokens} /></b><small>tokens · 30 d</small></span>
  return <span className={v.costo} data-tipo="sin-dato"><b className={`${v.huecoTexto} ${mov.hueco}`}>sin dato</b><small>de costo</small></span>
}

function Detalle({ f, ahora }: { f: Fila; ahora: number }) {
  const i = f.info
  return <div className={`${v.detalle} ${mov.aparece}`}>
    <p className={v.queHace}>{i?.queHace ?? 'Rutina sin descripción todavía. Pídele a Levy que la explique.'}</p>
    <dl className={v.datos}>
      <div><dt>Cuándo</dt><dd>{cuando(f.job.schedule)}</dd></div>
      <div><dt>Para</dt><dd>{i?.para ? <>{PARA[i.para]}{i.paraDetalle ? <small> · {i.paraDetalle}</small> : null}{i.seguro ? <small> · es un seguro</small> : null}</> : <em>sin dato</em>}</dd></div>
      <div><dt>Costo</dt><dd>{f.costo.tipo === 'programa' ? 'Programa directo, sin costo' : f.costo.tipo === 'tokens' ? <>{fmtTokens(f.costo.tokens)} tokens en 30 días{f.costo.porCorrida != null ? <small> · {fmtTokens(f.costo.porCorrida)} por corrida</small> : null}</> : <em>sin dato</em>}</dd></div>
      <div><dt>Sigue</dt><dd>{f.siguiente ? `${reloj(f.siguiente)} · ${enCuanto(f.siguiente, ahora)}` : <em>sin dato</em>}</dd></div>
    </dl>
    {f.costo.nota && <p className={v.nota}>{f.costo.nota}</p>}
    {f.noRinde && <p className={v.noRinde}><b>No rinde.</b> {f.noRinde}</p>}
    {f.reporte && <figure className={v.reporte}><figcaption>Lo que reportó · {hace(f.job.last_run ? f.job.last_run * 1000 : f.estado.ms, ahora, TZ)}</figcaption><blockquote>{f.reporte}</blockquote></figure>}
    {f.historial.length > 0 ? <ol className={v.historial} aria-label="Últimas corridas">
      {f.historial.slice(0, 8).map(c => <li key={c.at} data-tono={c.tono}><i aria-hidden /><span>{hace(c.at, ahora, TZ)}</span><span>{c.tono === 'falla' ? 'falló' : c.tono === 'curso' ? 'trabajando' : 'bien'}</span><small>{duracion(c.durMs) ?? ''}</small>{c.error && <em>{c.error}</em>}</li>)}
    </ol> : <p className={v.nota}>Sin corridas registradas en {DIAS_HISTORIAL} días.</p>}
    {(f.estado.tono === 'falla' || f.estado.tono === 'atrasada' || f.estado.tono === 'aviso' || f.noRinde) && <button className={v.levy} onClick={() => redactar(
      f.noRinde && f.estado.tono === 'ok' ? `La rutina «${f.nombre}» (${f.id}) no rinde: ${f.noRinde} ¿Qué hacemos con ella?`
        : `La rutina «${f.nombre}» (${f.id}) ${TEXTO_TONO[f.estado.tono]}${f.estado.ms ? ` (${hace(f.estado.ms, ahora, TZ)})` : ''}. Revisa qué pasó y dime si necesito decidir algo.`)}>
      <MessageCircle size={13} aria-hidden />Pedirle a Levy que lo revise</button>}
  </div>
}

function FilaRutina({ f, abierta, onTocar, ahora, dia, i, leyendo }: { f: Fila; abierta: boolean; onTocar: () => void; ahora: number; dia: string; i: number; leyendo: boolean }) {
  const para = f.info?.para
  return <li id={`rv-${f.id}`} className={`${v.fila} ${mov.entra}`} style={escalon(i)} data-tono={f.estado.tono} data-abierta={abierta || undefined}>
    <button className={v.filaCabeza} aria-expanded={abierta} onClick={onTocar}>
      <i className={v.estado} data-tono={f.estado.tono} aria-label={TEXTO_TONO[f.estado.tono]} />
      {/* Nombre y metadatos en un renglón que se dobla solo: si la hora y el costo no caben, bajan debajo del nombre. */}
      <span className={v.filaLinea}>
        <span className={v.filaNombre}>
          <b>{f.nombre}</b>
          <small>{f.info?.produce ?? cuando(f.job.schedule)}{para && <span className={v.para} data-para={para} data-seguro={f.info?.seguro || undefined}> → {PARA[para]}</span>}</small>
        </span>
        <span className={v.filaMeta}><Turno f={f} /><Costo f={f} dia={dia} leyendo={leyendo} /></span>
      </span>
      <span className={v.filaPie}><Tira f={f} /><span className={v.cuando}>{f.estado.tono === 'ok' ? '' : `${TEXTO_TONO[f.estado.tono]} · `}{hace(f.estado.ms, ahora, TZ)}</span>
        <ChevronRight size={13} className={v.chevron} aria-hidden /></span>
    </button>
    {abierta && <Detalle f={f} ahora={ahora} />}
  </li>
}

function SeccionCategoria({ c, filas, abierta, onPlegar, abiertaFila, onTocar, ahora, dia, i, leyendo }: {
  c: (typeof CATEGORIAS)[number]; filas: Fila[]; abierta: boolean; onPlegar: () => void; abiertaFila: string | null; onTocar: (id: string) => void; ahora: number; dia: string; i: number; leyendo: boolean
}) {
  const mal = filas.filter(f => f.estado.tono !== 'ok' && f.estado.tono !== 'curso').length
  return <section id={`rv-cat-${c.id}`} className={`${v.categoria} ${mov.entra}`} style={escalon(i)} data-abierta={abierta || undefined} data-mal={mal || undefined}>
    <button className={v.categoriaCabeza} aria-expanded={abierta} onClick={onPlegar}>
      <ChevronRight size={14} className={v.chevron} aria-hidden />
      <span className={v.categoriaNombre}>{c.nombre}</span>
      <span className={v.puntitos} aria-hidden>{filas.map(f => <i key={f.id} data-tono={f.estado.tono} />)}</span>
      <small>{filas.length}{mal ? ` · ${mal} ${mal === 1 ? 'pide atención' : 'piden atención'}` : ''}</small>
    </button>
    <div className={mov.pliega} data-plegada={!abierta || undefined}><div>
      <p className={v.porque}>{c.porque}</p>
      {filas.length ? <ul className={v.filas}>{filas.map((f, k) => <FilaRutina key={f.id} f={f} abierta={abiertaFila === f.id} onTocar={() => onTocar(f.id)} ahora={ahora} dia={dia} i={k} leyendo={leyendo} />)}</ul>
        : <p className={v.nota}>Sin rutinas activas en esta categoría.</p>}
    </div></div>
  </section>
}

// ── Qué rinde ──

function QueRinde({ activas, pausadas, dias, dia, leyendo }: { activas: Fila[]; pausadas: Fila[]; dias: number; dia: string; leyendo: boolean }) {
  if (leyendo) return <section className={`${v.tarjeta} ${mov.entra}`} style={escalon(8)} aria-label="Qué rinde" aria-busy="true">
    <header className={v.ceja}><span>Qué rinde · <b>{dias} días</b></span></header>
    <div className={v.cargando}><span /><span /><span /></div>
  </section>
  const conModelo = activas.filter(f => f.costo.tipo === 'tokens').sort((a, b) => (b.costo.tokens ?? 0) - (a.costo.tokens ?? 0))
  const programas = activas.filter(f => f.costo.tipo === 'programa').length
  const sinDato = activas.filter(f => f.costo.tipo === 'sin-dato').length
  const total = conModelo.reduce((s, f) => s + (f.costo.tokens ?? 0), 0)
  const max = conModelo[0]?.costo.tokens ?? 0
  const noRinden = activas.filter(f => f.noRinde)
  const pesadaPausada = [...pausadas].sort((a, b) => (b.rinde?.tokens ?? 0) - (a.rinde?.tokens ?? 0))[0]
  return <section className={`${v.tarjeta} ${mov.entra}`} style={escalon(8)} aria-label="Qué rinde">
    <header className={v.ceja}><span>Qué rinde · <b>{dias} días</b></span></header>
    <div className={v.cifras}>
      <div><strong>{total ? <Cifra valor={total} clave={`rv-total-${dia}`} formato={fmtTokens} /> : conModelo.length ? '0' : '—'}</strong><span>tokens de {conModelo.length} con modelo</span></div>
      <div><strong>{programas}</strong><span>{programas === 1 ? 'programa sin costo' : 'programas sin costo'}</span></div>
      <div data-mal={noRinden.length || undefined}><strong>{noRinden.length}</strong><span>{noRinden.length === 1 ? 'no rinde' : 'no rinden'}</span></div>
    </div>
    {conModelo.length > 0 && <ul className={v.barras}>{conModelo.slice(0, 5).map((f, i) => <li key={f.id}>
      <span>{f.nombre}</span>
      <span className={v.pista}><i className={mov.llena} style={{ ...escalon(i), width: `${Math.max(3, ((f.costo.tokens ?? 0) / max) * 100)}%` }} /></span>
      <b>{fmtTokens(f.costo.tokens)}</b>
    </li>)}</ul>}
    {noRinden.length > 0 && <ul className={v.noRindenLista}>{noRinden.map(f => <li key={f.id}><button onClick={() => document.getElementById(`rv-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><b>{f.nombre}</b> {f.noRinde}</button></li>)}</ul>}
    <p className={v.nota}>
      {sinDato ? `${sinDato} sin medición de tokens: no son cero, son sin dato. ` : ''}
      {pesadaPausada?.rinde?.tokens && pesadaPausada.rinde.tokens > total ? `Lo que más gastaba ya está en pausa: ${pesadaPausada.nombre}, ${fmtTokens(pesadaPausada.rinde.tokens)} tokens en ${dias} días.` : ''}
    </p>
  </section>
}

// ── Al fondo ──

function Historial() {
  const pathname = usePathname(), router = useRouter()
  const [aviso, setAviso] = useState<string | null>(null)
  const abrir = async (qs: string) => {
    try {
      const r = await fetch(`/api/cabina/reporte/abrir?${qs}&json=1`), { url } = await r.json() as { url?: string }
      const id = url ? new URLSearchParams(url.split('?')[1] ?? '').get('session') : null
      if (!r.ok || !id) throw new Error('sin hilo')
      if (pathname === '/chat') { window.dispatchEvent(new CustomEvent('openclaw:open-session', { detail: id })); return }
      try { sessionStorage.setItem('mc_activeChatSessionId', id) } catch { /* modo privado */ }
      router.push('/chat')
    } catch { setAviso('No encontré ese hilo.') }
  }
  return <div className={v.hilos}>
    <p>Desde el 10 oct los reportes llegan a tu conversación favorita y lo informativo queda en la bitácora de Levy. Los hilos de antes:</p>
    <span><button className={v.enlace} onClick={() => void abrir('')}><Bell size={12} aria-hidden />Reportes</button><button className={v.enlace} onClick={() => void abrir('hilo=informacion')}><Search size={12} aria-hidden />Información</button></span>
    {aviso && <p className={v.nota}>{aviso}</p>}
  </div>
}

function Pliegue({ titulo, n, nota, children }: { titulo: string; n: number; nota?: string; children: ReactNode }) {
  return <details className={v.pliegue}>
    <summary><ChevronRight size={13} className={v.chevron} aria-hidden />{titulo}<small>{n}</small>{nota && <span>{nota}</span>}</summary>
    {children}
  </details>
}

// ── La vista ──

export function VistaRutinasViva({ grande, fondo }: { grande?: boolean; fondo?: ReactNode }) {
  const url = useMemo(urlRutinasViva, [])
  const lect = useFuente<CronSnapshot>(url)
  const rinde = useFuente<DatosRinde>(URL_RENDIMIENTO, 120_000)
  const ahora = useAhora()
  const d = lect.data
  const { activas, pausadas } = useMemo(() => d ? leerFilas(d, rinde.data?.rutinas, Date.now()) : { activas: [], pausadas: [] }, [d, rinde.data])
  const lec = useMemo(() => lectura(activas), [activas])
  const sig = siguiente(activas, ahora)
  const [foco, setFoco] = useState<Marca | null>(null)
  const [cat, setCat] = useState<Categoria | null>(null)
  const [abiertaFila, setAbiertaFila] = useState<string | null>(null)
  // Plegadas: abiertas de entrada las categorías que piden atención; lo que Daniel toque manda desde ahí.
  const [plegado, setPlegado] = useState<Partial<Record<Categoria, boolean>>>({})
  const abiertaCat = (c: Categoria) => plegado[c] ?? activas.some(f => f.categoria === c && f.estado.tono !== 'ok' && f.estado.tono !== 'curso')
  const dia = (d?.loadedAt ?? '').slice(0, 10)
  // Mientras llega lo que rinde, el costo «se lee»: no es cero ni «sin dato».
  const leyendoRinde = !rinde.data && !rinde.error

  const abrir = (f: Fila) => {
    setPlegado(p => ({ ...p, [f.categoria]: true })); setAbiertaFila(f.id)
    requestAnimationFrame(() => setTimeout(() => document.getElementById(`rv-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60))
  }
  const releerTodo = () => { void releer(url); void releer(URL_RENDIMIENTO) }

  if (!d) return <div className={v.vista} aria-busy="true">{lect.error ? <p className={v.aviso}>{lect.error}</p> : <div className={v.cargando}><span /><span /><span /><span /></div>}</div>

  const ids = new Set(d.jobs.map(j => j.id))
  const propuestas = (rinde.data?.propuestas ?? []).filter(p => propuestaVigente(p, ids))
  const errores = [lect.error, d.scheduleError, d.historyError ? 'No se pudo leer el historial; el estado sale del último resultado guardado por cada rutina.' : null, rinde.error ? 'No se pudo leer qué rinde cada una: el costo queda sin dato.' : null].filter(Boolean)

  return <div className={v.vista} data-rutinas-viva data-grande={grande || undefined}>
    {errores.length > 0 && <p className={v.aviso}>{errores.join(' ')}</p>}
    <div className={v.rejilla}>
      <div className={v.columna}>
        <header className={v.heroe} data-tono={lec.tono}>
          <div className={`${v.heroeTop} ${mov.entra}`} style={escalon(0)}>
            <p className={v.cejaHeroe}>Rutinas · <b>lo que corre solo</b></p>
            <button className={v.leido} onClick={releerTodo} title="Volver a leer"><RefreshCw size={11} className={lect.cargando ? v.gira : undefined} aria-hidden />{d.loadedAt ? `leído ${reloj(Date.parse(d.loadedAt))}` : 'leer'}</button>
          </div>
          <h3 className={`${v.palabra} ${mov.entra}`} style={escalon(1)}>{lec.palabra}</h3>
          <ul className={`${v.cuentas} ${mov.entra}`} style={escalon(2)} aria-label="De un vistazo">
            <li><b><Cifra valor={lec.trabajan} clave={`rv-trabajan-${dia}`} formato={n => String(Math.round(n))} /></b> trabajan</li>
            <li data-tono={lec.fallaron ? 'falla' : undefined}><b>{lec.fallaron}</b> {lec.fallaron === 1 ? 'falló' : 'fallaron'}</li>
            {lec.atrasadas > 0 && <li data-tono="atrasada"><b>{lec.atrasadas}</b> sin correr a su hora</li>}
            {lec.avisos > 0 && <li data-tono="aviso"><b>{lec.avisos}</b> con aviso</li>}
            <li data-tono={lec.sinDato ? 'sin-dato' : undefined}><b>{lec.sinDato}</b> sin dato</li>
            <li><b>{pausadas.length}</b> en pausa</li>
          </ul>
          {lec.grave ? <button className={`${v.grave} ${mov.entra}`} style={escalon(3)} data-tono={lec.grave.estado.tono} onClick={() => abrir(lec.grave!)}>
            <i aria-hidden /><span><small>Lo más grave</small><b>{lec.grave.nombre}</b> {TEXTO_TONO[lec.grave.estado.tono]}{lec.grave.estado.ms ? ` · ${hace(lec.grave.estado.ms, ahora, TZ)}` : ''}</span><ChevronRight size={14} aria-hidden />
          </button> : <p className={`${v.tranquilo} ${mov.entra}`} style={escalon(3)}>Ninguna falló ni se atrasó en la última lectura. Solo te avisan los reportes; lo demás calla y habla si falla.</p>}
        </header>
        <section className={`${v.tarjeta} ${mov.entra}`} style={escalon(4)} aria-label="Cuándo corre cada una">
          <header className={v.ceja}><span>Tu día en 24 horas · <b>cuándo corre cada una</b></span></header>
          <Reloj24 activas={activas} ahora={ahora} sig={sig} foco={foco} setFoco={setFoco} cat={cat} setCat={setCat} onAbrir={abrir} />
        </section>
        <QueRinde activas={activas} pausadas={pausadas} dias={rinde.data?.dias ?? 30} dia={dia} leyendo={leyendoRinde} />
      </div>
      <div className={v.columna}>
        <div className={v.categorias}>
          {CATEGORIAS.map((c, i) => <SeccionCategoria key={c.id} c={c} filas={activas.filter(f => f.categoria === c.id)} abierta={abiertaCat(c.id)} onPlegar={() => setPlegado(p => ({ ...p, [c.id]: !abiertaCat(c.id) }))}
            abiertaFila={abiertaFila} onTocar={id => setAbiertaFila(x => x === id ? null : id)} ahora={ahora} dia={dia} i={5 + i} leyendo={leyendoRinde} />)}
        </div>
        <div className={v.fondo}>
          {pausadas.length > 0 && <Pliegue titulo="En pausa" n={pausadas.length} nota="no corren ni cuestan">
            <ul className={v.pausadas}>{pausadas.map(f => <li key={f.id}>
              <b>{f.nombre}</b><small>{f.info?.pausa ?? 'En pausa.'}</small>
              <span>{f.job.last_run ? `última ${hace(f.job.last_run * 1000, ahora, TZ)}` : 'sin corridas'}{f.rinde?.tokens ? ` · gastó ${fmtTokens(f.rinde.tokens)} tokens en 30 d` : ''}</span>
            </li>)}</ul>
          </Pliegue>}
          <Pliegue titulo="Lápidas" n={LAPIDAS.length} nota={`retiradas el ${LAPIDAS_FECHA}, con registro para revivirlas`}>
            <ul className={v.pausadas}>{LAPIDAS.map(l => <li key={l.id}><b>{l.nombre}</b><small>{l.queHacia} {l.porque}</small><span>última {l.ultima}</span></li>)}</ul>
          </Pliegue>
          {propuestas.length > 0 && <Pliegue titulo="Lo que propuso el órgano de poda" n={propuestas.length} nota="en pausa: propuestas viejas">
            <ul className={v.pausadas}>{propuestas.map(p => <li key={p.id}><b>{p.titulo}</b><small>{p.propuesta}</small>
              <span>{p.neurona} · {fecha(p.updated_at)} · <button className={v.enlace} onClick={() => redactar(`El órgano metabolismo propuso «${p.titulo}» (${p.clave}, del ${fecha(p.updated_at)}). ¿Sigue vigente? Revísalo con datos de hoy antes de que firme.`)}><MessageCircle size={11} aria-hidden />Conversarlo con Levy</button></span></li>)}</ul>
          </Pliegue>}
          <Historial />
          {fondo}
          <p className={v.fuente}>Lee el scheduler del Studio, {DIAS_HISTORIAL} días de corridas y {rinde.data?.dias ?? 30} días de tokens. Nada de aquí pausa, mueve ni activa una rutina.</p>
        </div>
      </div>
    </div>
  </div>
}

