'use client'
/**
 * Loops de negocio (3 nov 2026, prototipo detrás de `ARBRAIN_LOOPS=1`; spec: docs/builds/loops-negocio-2026-11-03/SPEC.md).
 * Daniel vio los Loops de Cloudroom y le encantaron. Aquí, para el dueño de negocio y el consultor: un catálogo de
 * revisiones recurrentes (cobranza, leads, la agenda de mañana, flujo de caja, reseñas, competencia…) que se agregan con
 * un clic sobre el motor de rutinas y que solo te buscan cuando algo pide tu decisión: lo que está en orden se archiva
 * solo; la excepción sube a tu bandeja como tarjeta Sí · No · Otro. «Metas hacia abajo, excepciones hacia arriba.»
 *
 * Tres pestañas, como Cloudroom: Tus loops (lo que corre, con sus últimas corridas), Revisar (la línea de tiempo de 7
 * días; lo que espera tu toque trae su tarjeta) y Plantillas (P1 Esencial · P2 Recomendado · P3 Útil, con modelo, esfuerzo
 * y frecuencia a la vista). Lo que contacta personas, paga o publica dice «Pregunta antes» y nunca baja de ahí.
 * Datos: `/api/loops` (su daemon). Pausar, probar y quitar usan las mismas rutas que cualquier rutina (`/api/rutinas/:id`).
 */
import { useState } from 'react'
import {
  BellRing, CalendarClock, Check, Cpu, Eye, Hand, HandCoins, MessageCircle, MessageCircleQuestion, PackageCheck, Pause, Play,
  Plus, Radar, Receipt, Repeat, Star, Trash2, Wallet, Zap, type LucideIcon,
} from 'lucide-react'
import { releer } from '@/features/cabina/datos'
import { TarjetaDecision } from '@/features/decisiones/Bandeja'
import { hace, resumen } from '@/features/rutinas/model'
import { proximaEn } from '@/lib/rutinas-cliente'
import {
  chipModelo, chipModo, estadoCorrida, esperaTuToque, PRIORIDAD, pestanaInicial, porcentajeSolas, porDia, porPrioridad, ultimaLinea, ultimasDe,
  type CorridaVista, type PlantillaVista, type Prioridad, type VistaLoops,
} from '@/lib/loops'
import s from './loops.module.css'

export const URL_LOOPS = '/api/loops'
const URL_RUTINAS = '/api/rutinas'

const ICONOS: Record<string, LucideIcon> = { HandCoins, MessageCircleQuestion, CalendarClock, PackageCheck, Wallet, Receipt, Star, Radar }
const Icono = ({ nombre, size = 16 }: { nombre: string; size?: number }) => { const I = ICONOS[nombre] ?? Repeat; return <I size={size} aria-hidden /> }

type Pestana = 'tus' | 'revisar' | 'plantillas'

async function pedir(url: string, init: RequestInit): Promise<string | null> {
  try {
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' })
    if (r.ok) return null
    const j = await r.json().catch(() => ({})) as { error?: string }
    return j.error ?? 'No se pudo. Intenta de nuevo.'
  } catch { return 'Tu Arbrain local no responde. Intenta en unos segundos.' }
}
const refrescar = () => { void releer(URL_LOOPS); void releer(URL_RUTINAS) }

/** Deja el texto en la caja del chat sin enviarlo (el mismo camino que «Pedirle a Levy» de Rutinas). */
function redactar(texto: string) {
  if (window.location.pathname.startsWith('/chat')) { window.dispatchEvent(new CustomEvent('cabina:redactar', { detail: { texto } })); return }
  try { sessionStorage.setItem('cabina:redactar', texto) } catch { /* modo privado */ }
  window.location.assign('/chat')
}

export function LoopsNegocio({ vista, tz }: { vista: VistaLoops; tz?: string }) {
  const [pestana, setPestana] = useState<Pestana>(() => pestanaInicial(vista))
  const plantillas = vista.plantillas ?? [], corridas = vista.corridas ?? []
  const tus = plantillas.filter(p => p.agregado)
  const enBandeja = vista.resumen?.enBandeja ?? 0
  const zona = tz ?? vista.tz ?? 'America/Mexico_City'
  const ahora = Date.now()
  const pestanas: { id: Pestana; nombre: string; cuenta?: number; alerta?: boolean }[] = [
    { id: 'tus', nombre: 'Tus loops', cuenta: tus.length },
    { id: 'revisar', nombre: 'Revisar', cuenta: enBandeja || undefined, alerta: enBandeja > 0 },
    { id: 'plantillas', nombre: 'Plantillas', cuenta: plantillas.length },
  ]
  return <div className={s.loops} data-loops>
    <Cabeza vista={vista} corridas={corridas} activos={tus.filter(p => p.agregado?.activa).length} />
    <div className={s.pestanas} role="tablist" aria-label="Loops de negocio">
      {pestanas.map(p => <button key={p.id} role="tab" type="button" aria-selected={pestana === p.id} className={s.pestana} onClick={() => setPestana(p.id)}>
        {p.nombre}{p.cuenta !== undefined && <span className={s.cuenta} data-alerta={p.alerta || undefined}>{p.cuenta}</span>}
      </button>)}
    </div>
    {pestana === 'plantillas' && <Plantillas plantillas={plantillas} onVer={() => setPestana('tus')} />}
    {pestana === 'tus' && <TusLoops tus={tus} corridas={corridas} ahora={ahora} zona={zona} onPlantillas={() => setPestana('plantillas')} />}
    {pestana === 'revisar' && <Revisar corridas={corridas} ahora={ahora} zona={zona} />}
  </div>
}

// ── La cabeza: cuántos vigilan y cuánto se resolvió sin ti ──

function Cabeza({ vista, corridas, activos }: { vista: VistaLoops; corridas: CorridaVista[]; activos: number }) {
  const r = vista.resumen
  const pct = porcentajeSolas(r)
  // Un anillo con las últimas corridas como marcas (la órbita de Cloudroom, en pequeño): verde se archivó sola,
  // oro esperó tu toque, rojo falló. Sin corridas, el anillo vacío.
  const marcas = [...corridas].sort((a, b) => a.corrida - b.corrida).slice(-36)
  return <header className={s.cabeza}>
    <div className={s.orbita} aria-hidden>
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" className={s.orbitaAro} />
        {marcas.map((c, i) => { const a = (i / 36) * 2 * Math.PI - Math.PI / 2
          return <line key={c.id} x1={32 + 22 * Math.cos(a)} y1={32 + 22 * Math.sin(a)} x2={32 + 29 * Math.cos(a)} y2={32 + 29 * Math.sin(a)} className={s.marca} data-tono={estadoCorrida(c).tono} /> })}
      </svg>
      <b>{activos}</b>
    </div>
    <div className={s.cabezaTexto}>
      <p className={s.titular}>{activos === 0 ? 'Ningún loop vigilando todavía' : activos === 1 ? '1 loop vigilando tu negocio' : `${activos} loops vigilando tu negocio`}</p>
      <p className={s.bajada}>Revisan solos. Lo que está en orden se archiva; solo te buscan cuando algo pide tu decisión.</p>
      <dl className={s.cifras}>
        <div><dt>Corridas · 7 días</dt><dd>{r?.corridas ?? 0}</dd></div>
        <div><dt>Se archivaron solas</dt><dd>{pct === null ? 'sin dato' : `${pct} %`}</dd></div>
        <div data-alerta={(r?.enBandeja ?? 0) > 0 || undefined}><dt>Esperan tu toque</dt><dd>{r?.enBandeja ?? 0}</dd></div>
      </dl>
    </div>
  </header>
}

// ── Plantillas ──

function Divisor({ prioridad, cuenta }: { prioridad: Prioridad; cuenta: number }) {
  const p = PRIORIDAD[prioridad]
  return <div className={s.divisor} data-prioridad={prioridad}>
    <span className={s.anillo} aria-hidden />
    <b>{p.corta} · {p.nombre}</b><span className={s.divisorCuenta}>{cuenta}</span>
    <span className={s.linea} aria-hidden /><span className={s.divisorQue}>{p.que}</span>
  </div>
}

function Meta({ p }: { p: PlantillaVista }) {
  return <p className={s.meta}>
    <span><Repeat size={12} aria-hidden />{p.frecuencia}</span>
    <span className={s.chip} title="Con qué modelo corre y cuánto piensa"><Cpu size={12} aria-hidden />{chipModelo(p)}</span>
    <span className={s.chip} data-modo={p.modo} title={p.toca ? 'Lo irreversible nunca sale sin tu Sí' : 'No contacta, no paga, no publica'}>
      {p.modo === 'solo-revisa' ? <Eye size={12} aria-hidden /> : <Hand size={12} aria-hidden />}{chipModo(p)}
    </span>
  </p>
}

function Plantillas({ plantillas, onVer }: { plantillas: PlantillaVista[]; onVer: () => void }) {
  return <div className={s.seccion}>
    {porPrioridad(plantillas).map(g => <section key={g.prioridad} className={s.grupo} aria-label={`${PRIORIDAD[g.prioridad].corta} ${PRIORIDAD[g.prioridad].nombre}`}>
      <Divisor prioridad={g.prioridad} cuenta={g.items.length} />
      <ul className={s.lista}>{g.items.map(p => <Plantilla key={p.id} p={p} onVer={onVer} />)}</ul>
    </section>)}
    <button type="button" className={s.pedir} onClick={() => redactar('Quiero un loop de negocio que revise … cada … y que solo me busque si …')}>
      <MessageCircle size={14} aria-hidden />¿Tu negocio necesita otro? Descríbeselo a Levy
    </button>
  </div>
}

function Plantilla({ p, onVer }: { p: PlantillaVista; onVer: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const agregar = async () => {
    setOcupado(true); setError(null)
    const e = await pedir(URL_LOOPS, { method: 'POST', body: JSON.stringify({ plantilla: p.id }) })
    setOcupado(false)
    if (e) { setError(e); return }
    refrescar()
  }
  return <li className={s.plantilla} data-prioridad={p.prioridad} data-agregada={!!p.agregado || undefined}>
    <span className={s.icono}><Icono nombre={p.icono} /></span>
    <div className={s.cuerpo}>
      <div className={s.fila1}>
        <strong className={s.nombre}>{p.nombre}</strong>
        {p.agregado
          ? <button type="button" className={s.agregado} onClick={onVer} title="Ver en tus loops"><Check size={13} aria-hidden />{p.agregado.activa ? 'Activo' : 'En pausa'}</button>
          : <button type="button" className={s.agregar} disabled={ocupado} onClick={() => void agregar()} aria-label={`Agregar ${p.nombre}`}><Plus size={13} aria-hidden />{ocupado ? 'Agregando…' : 'Agregar'}</button>}
      </div>
      <p className={s.que}>{p.queVigila}</p>
      <p className={s.teSube}><BellRing size={12} aria-hidden /><span>Te busca para: {p.teSube.replace(/^./, c => c.toLowerCase())}</span></p>
      <Meta p={p} />
      {error && <p className={s.error} role="alert">{error}</p>}
    </div>
  </li>
}

// ── Tus loops ──

function TusLoops({ tus, corridas, ahora, zona, onPlantillas }: { tus: PlantillaVista[]; corridas: CorridaVista[]; ahora: number; zona: string; onPlantillas: () => void }) {
  if (!tus.length) return <div className={s.vacio}>
    <p><b>Aún no tienes loops.</b> Empieza por los Esenciales: se agregan en un clic y corren solos con tu llave.</p>
    <button type="button" className={s.agregar} onClick={onPlantillas}><Plus size={13} aria-hidden />Ver plantillas</button>
  </div>
  return <div className={s.seccion}>
    {porPrioridad(tus).map(g => <section key={g.prioridad} className={s.grupo}>
      <Divisor prioridad={g.prioridad} cuenta={g.items.length} />
      <ul className={s.lista}>{g.items.map(p => <TuLoop key={p.id} p={p} corridas={ultimasDe(corridas, p.agregado!.rutina)} ahora={ahora} zona={zona} />)}</ul>
    </section>)}
    <p className={s.nota}>Tu computadora debe estar encendida para que corran. Cada corrida usa tu llave.</p>
  </div>
}

function TuLoop({ p, corridas, ahora, zona }: { p: PlantillaVista; corridas: CorridaVista[]; ahora: number; zona: string }) {
  const a = p.agregado!
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quitar, setQuitar] = useState(false)
  const [probada, setProbada] = useState(false)
  const accion = async (que: 'pausar' | 'reanudar' | 'probar' | 'borrar') => {
    setOcupado(true); setError(null)
    const url = `${URL_RUTINAS}/${encodeURIComponent(a.rutina)}`
    const e = que === 'borrar' ? await pedir(url, { method: 'DELETE' }) : await pedir(url, { method: 'POST', body: JSON.stringify({ accion: que }) })
    setOcupado(false); setQuitar(false)
    if (e) { setError(e); return }
    if (que === 'probar') setProbada(true)
    refrescar()
  }
  const ultima = ultimaLinea(a.resultado)
  const solas = corridas.filter(c => c.estado === 'en-orden').length
  return <li className={s.loop} data-activa={a.activa || undefined} data-prioridad={p.prioridad}>
    <div className={s.fila1}>
      <span className={s.icono} data-chico><Icono nombre={p.icono} size={14} /></span>
      <strong className={s.nombre}>{p.nombre}</strong>
      <span className={s.estado} data-activa={a.activa || undefined}>{a.activa ? 'Activo' : 'En pausa'}</span>
    </div>
    <Meta p={p} />
    <p className={s.cuando}>{a.activa ? `Próxima: ${proximaEn(a.proxima, ahora, zona)}` : 'No corre hasta que lo reanudes'}{a.ultima ? ` · última ${hace(a.ultima * 1000, ahora, zona)}` : ' · todavía no corre'}</p>
    {ultima && <p className={s.ultima} data-tono={ultima.tono}>{ultima.texto}</p>}
    {corridas.length > 0 && <div className={s.puntos} aria-label={`Últimas ${corridas.length} corridas: ${solas} se archivaron solas`}>
      {corridas.map(c => <span key={c.id} className={s.punto} data-tono={estadoCorrida(c).tono} title={`${hace(c.corrida, ahora, zona)} · ${estadoCorrida(c).texto}`} />)}
      <span className={s.puntosTexto}>{Math.round((solas / corridas.length) * 100)} % solas</span>
    </div>}
    {probada && <p className={s.cuando}>Corriendo ahora. Si encuentra algo, llega a tu bandeja; si todo está en orden, se archiva.</p>}
    {error && <p className={s.error} role="alert">{error}</p>}
    {quitar
      ? <div className={s.botones} role="group" aria-label="Confirmar">
          <span className={s.pregunta}>¿Quitar este loop? Deja de correr y se borra su rutina; lo puedes volver a agregar.</span>
          <button type="button" className={s.peligro} disabled={ocupado} onClick={() => void accion('borrar')}>Sí, quitar</button>
          <button type="button" className={s.boton} disabled={ocupado} onClick={() => setQuitar(false)}>Cancelar</button>
        </div>
      : <div className={s.botones}>
          {a.activa
            ? <button type="button" className={s.boton} disabled={ocupado} onClick={() => void accion('pausar')}><Pause size={13} aria-hidden />Pausar</button>
            : <button type="button" className={s.boton} disabled={ocupado} onClick={() => void accion('reanudar')}><Play size={13} aria-hidden />Reanudar</button>}
          <button type="button" className={s.boton} disabled={ocupado} onClick={() => void accion('probar')} title="Lo corre una vez ahora, sin cambiar su horario"><Zap size={13} aria-hidden />Probar ahora</button>
          <button type="button" className={s.boton} disabled={ocupado} onClick={() => setQuitar(true)}><Trash2 size={13} aria-hidden />Quitar</button>
        </div>}
  </li>
}

// ── Revisar ──

function Revisar({ corridas, ahora, zona }: { corridas: CorridaVista[]; ahora: number; zona: string }) {
  const [solo, setSolo] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lista = solo ? corridas.filter(esperaTuToque) : corridas
  const responder = async (id: string, respuesta: 'si' | 'no' | 'otro', comentario?: string) => {
    setOcupado(id); setError(null)
    const e = await pedir('/api/decisiones', { method: 'POST', body: JSON.stringify({ accion: 'resolver', id, respuesta, ...(comentario ? { comentario } : {}) }) })
    setOcupado(null)
    if (e) { setError(e); return false }
    refrescar()
    return true
  }
  const abiertas = corridas.filter(esperaTuToque).length
  return <div className={s.seccion}>
    <div className={s.barra}>
      <p className={s.nota}>{abiertas ? `${abiertas === 1 ? 'Una decisión espera' : `${abiertas} decisiones esperan`} tu toque. Lo demás se archivó solo.` : 'Al día: nada espera tu decisión.'}</p>
      <button type="button" className={s.boton} aria-pressed={solo} onClick={() => setSolo(!solo)}>{solo ? 'Ver todo' : 'Solo lo que espera'}</button>
    </div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {!lista.length
      ? <div className={s.vacio}><p>{corridas.length ? 'Nada espera tu toque.' : 'Nada todavía. Lo que tus loops revisen solos aparece aquí.'}</p></div>
      : porDia(lista, ahora, zona).map(g => <section key={g.dia} className={s.dia} aria-label={g.titulo}>
          <h4 className={s.diaTitulo}>{g.titulo}</h4>
          <ol className={s.tiempo}>{g.items.map(c => { const e = estadoCorrida(c)
            return <li key={c.id} className={s.corrida} data-tono={e.tono}>
              <time>{new Date(c.corrida).toLocaleTimeString('es-MX', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false })}</time>
              <span className={s.punto} data-tono={e.tono} aria-hidden />
              <div className={s.corridaCuerpo}>
                <p className={s.corridaCabeza}><Icono nombre={c.icono} size={13} /><b>{c.nombre}</b><span className={s.corridaEstado} data-tono={e.tono}>{e.texto}</span>{c.manual && <span className={s.manual}>prueba</span>}</p>
                {!(esperaTuToque(c) && c.tarjeta) && <p className={s.corridaResumen} title={c.resumen}>{resumen(c.resumen, 220) ?? c.resumen}</p>}
                {esperaTuToque(c) && c.tarjeta && <TarjetaDecision t={c.tarjeta} ocupado={ocupado === c.tarjeta.id} onResponder={(r, com) => responder(c.tarjeta!.id, r, com)} />}
              </div>
            </li> })}</ol>
        </section>)}
  </div>
}

/** El selector de arriba de Taller › Rutinas cuando los loops están encendidos. */
export function SelectorRutinasLoops({ vista, setVista, enBandeja }: { vista: 'rutinas' | 'loops'; setVista: (v: 'rutinas' | 'loops') => void; enBandeja: number }) {
  return <div className={s.selector} role="tablist" aria-label="Rutinas o loops de negocio">
    <button type="button" role="tab" aria-selected={vista === 'rutinas'} onClick={() => setVista('rutinas')}>Tus rutinas</button>
    <button type="button" role="tab" aria-selected={vista === 'loops'} onClick={() => setVista('loops')}>
      <Repeat size={13} aria-hidden />Loops de negocio{enBandeja > 0 && <span className={s.cuenta} data-alerta>{enBandeja}</span>}
    </button>
  </div>
}
