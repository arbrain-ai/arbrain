'use client'
/**
 * El reporte de la mañana como vista viva (5 oct 2026). El dueño, leyendo el markdown de las 09:00: «es el tipo de
 * cosas que podemos automatizar para que me muestres mejores animaciones… para las tareas o para el día».
 *
 * Llega al hilo «Reportes» como invocación `mostrar {vista:'diario'}` (la cuelga el webhook al mensaje del cron)
 * y lee TODO al abrirse: Dinero y Lanzamiento por /api/cabina/diario (el mismo script del cron en modo --json),
 * Tu día y Tareas por /api/planning (Google y Todoist; palomear escribe por la pluma del calendario).
 * «Sin medir» se pinta como hueco rayado, nunca como cero. La socia recibe la misma pieza con lo suyo.
 * Movimiento: el lenguaje común (shared/movimiento): entra escalonado, las barras se llenan, el ahora late, la
 * palomita se dibuja y la tarjeta se pliega. Con «reducir movimiento», quieto.
 */
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { PlanningSnapshot, PlanTask } from '@/features/planning/types'
import { mov, escalon, Cifra, Palomita } from '@/shared/movimiento'
import { useFuente, releer } from '../datos'
import { etiquetaDia, hoyCivil, sumarDias, type Quien } from '../model'
import { urlCalendario } from './Calendario'
import { Agenda, Riel } from './Dia'
import { type Item, porDia, tareasDe, atrasada, mutarTarea, duracion, sinEmoji } from './agenda'
import l from '../luz.module.css'
import d from './diario.module.css'
import { DUENO, NOMBRE_SEGUNDA, SEGUNDA } from '@/config'

// ── Datos (contrato: arbrain/server/scripts/analytics/reportes_matutinos.py, vista del dueño / vista de la segunda persona) ──
type Montos = Record<string, number>
export interface DatosDueno {
  quien: string; fecha: string; ayer: string; masterclass: string; diasMasterclass: number; leidoEn?: string
  dinero: null | { altas: number; bajas: number; pidieron_cancelar: number; cobros_n: number; cobros_monto: Montos; cobros_altas: number; cobros_renovaciones: number; reembolsos: Montos; mrr: { activo: number; previo: number | null; cambio: boolean } }
  embudo: { etapa: string; valor: number | null }[]
  notaEmbudo?: string | null
  alarmas: string[]; decision: string | null; limites: string[]
}
export interface DatosSegunda {
  quien: string; fecha: string; leidoEn?: string
  comunidad: null | { sinRespuesta: string[]; conversacionesEsperando: number; nuevos: string[]; dejaron: string[] }
  youtube: null | { total: number; nuevos_3d: number }
  soporte: null; limites: string[]
}

export const urlDiario = (quien: Quien = DUENO(), fecha = hoyCivil()) => `/api/cabina/diario?quien=${quien}&fecha=${fecha}`

const pesos = (c: number) => `$${Math.round(c / 100).toLocaleString('es-MX')}`
const corto = (dia: string) => etiquetaDia(dia, { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
const horaLectura = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }) : null

/** Resumen de la vista colapsada (lo último leído, sin pedir nada). */
export function resumenDiario(x: DatosDueno | DatosSegunda | undefined): string | null {
  if (!x) return null
  if ('comunidad' in x) return x.comunidad ? `${x.comunidad.sinRespuesta.length} sin respuesta · ${x.comunidad.nuevos.length} nuevos` : 'comunidad sin dato'
  const cobros = x.dinero ? (Object.keys(x.dinero.cobros_monto).length ? `cobros ${Object.entries(x.dinero.cobros_monto).map(([m, v]) => `${pesos(v)} ${m}`).join(' + ')}` : 'sin cobros ayer') : 'dinero sin dato'
  return `${cobros} · masterclass en ${x.diasMasterclass} días`
}

// ── Piezas ──
function Tarjeta({ ceja, extra, i, children, tono }: { ceja: React.ReactNode; extra?: React.ReactNode; i: number; children: React.ReactNode; tono?: 'alarma' | 'decision' }) {
  return <article className={`${d.tarjeta} ${mov.entra}`} style={escalon(i)} data-tono={tono}>
    <header className={d.tarjetaCeja}><span>{ceja}</span>{extra}</header>
    {children}
  </article>
}

function Hueco({ texto }: { texto: string }) {
  return <p className={`${d.hueco} ${mov.hueco}`}>{texto}</p>
}

function Cargando({ lineas = 2 }: { lineas?: number }) {
  return <div className={d.cargando} aria-busy="true" aria-label="Leyendo">{Array.from({ length: lineas }, (_, i) => <span key={i} />)}</div>
}

function Dinero({ x, i }: { x: DatosDueno | undefined; i: number }) {
  const din = x?.dinero
  const monedas = din ? Object.entries(din.cobros_monto) : []
  const [moneda, monto] = monedas[0] ?? ['', 0]
  const delta = din && din.mrr.previo != null ? din.mrr.activo - din.mrr.previo : null
  return <Tarjeta i={i} ceja={<>Dinero · <b>ayer {x ? corto(x.ayer) : ''}</b></>}>
    {!x ? <Cargando /> : !din ? <Hueco texto={`Polar no respondió: sin dato de ${corto(x.ayer)}. No es cero.`} /> : <>
      <div className={d.cifras}>
        <div><Cifra className={d.cifra} valor={din.altas} clave={`altas-${x.ayer}`} formato={n => String(Math.round(n))} /><small>Altas</small></div>
        <div><Cifra className={d.cifra} valor={din.bajas} clave={`bajas-${x.ayer}`} formato={n => String(Math.round(n))} /><small>Bajas</small></div>
        <div data-ancho><span className={d.cifra}><Cifra valor={monto} clave={`cobros-${x.ayer}`} formato={n => pesos(n)} />{moneda && <em>{moneda}</em>}</span>
          <small>{din.cobros_n ? `Cobros · ${din.cobros_n} ${din.cobros_n === 1 ? 'orden' : 'órdenes'}` : 'Cobros · ninguno ayer'}</small></div>
      </div>
      {(din.cobros_n > 0 || monedas.length > 1 || din.pidieron_cancelar > 0 || Object.keys(din.reembolsos).length > 0) && <p className={d.nota}>
        {din.cobros_n > 0 && <span>{din.cobros_altas} {din.cobros_altas === 1 ? 'alta' : 'altas'} y {din.cobros_renovaciones} {din.cobros_renovaciones === 1 ? 'renovación' : 'renovaciones'}</span>}
        {monedas.slice(1).map(([m, v]) => <span key={m}>+ {pesos(v)} {m}</span>)}
        {din.pidieron_cancelar > 0 && <span>{din.pidieron_cancelar} pidieron cancelar (siguen pagados)</span>}
        {Object.entries(din.reembolsos).map(([m, v]) => <span key={`r${m}`} data-malo>Reembolsos {pesos(v)} {m}</span>)}
      </p>}
      {/* MRR solo si cambió (regla del reporte): el resto de los días no dice nada nuevo. */}
      {din.mrr.cambio && <p className={`${d.mrr} ${mov.aparece}`} style={escalon(i + 3)}>
        MRR <b>{pesos(din.mrr.activo)}</b>
        {delta == null ? <small>primera lectura</small> : <small data-signo={delta > 0 ? 'mas' : 'menos'}>{delta > 0 ? '▲' : '▼'} {pesos(Math.abs(delta))} desde ayer</small>}
      </p>}
    </>}
  </Tarjeta>
}

function Lanzamiento({ x, i }: { x: DatosDueno | undefined; i: number }) {
  const medidos = x?.embudo.filter(e => e.valor != null).map(e => e.valor!) ?? []
  const tope = Math.max(1, ...medidos)
  const dias = x?.diasMasterclass
  const cuando = dias == null ? '' : dias > 1 ? `faltan ${dias} días` : dias === 1 ? 'mañana' : dias === 0 ? 'hoy' : 'ya pasó'
  return <Tarjeta i={i} ceja={<>Lanzamiento · <b>masterclass {x ? corto(x.masterclass) : ''}</b></>} extra={x && <span className={d.chip}><i className={dias != null && dias >= 0 && dias <= 3 ? mov.late : undefined} />{cuando}</span>}>
    {!x ? <Cargando lineas={5} /> : <>
      <ol className={d.embudo}>
        {x.embudo.map((e, k) => {
          const previo = k > 0 ? x.embudo[k - 1].valor : null
          const paso = e.valor != null && previo ? Math.round((e.valor / previo) * 100) : null
          return <li key={e.etapa} className={mov.entra} style={escalon(i + 1 + k)} data-sin-medir={e.valor == null || undefined}>
            <span className={d.etapa}>{e.etapa}</span>
            <span className={`${d.pista} ${e.valor == null ? mov.hueco : ''}`}>
              {e.valor != null && e.valor > 0 && <i className={mov.llena} style={{ ...escalon(i + 1 + k), width: `${Math.max(3, (e.valor / tope) * 100)}%` }} />}
            </span>
            <span className={d.valor}>{e.valor == null ? 'sin medir' : <><Cifra valor={e.valor} clave={`embudo-${x.fecha}-${e.etapa}`} formato={n => Math.round(n).toLocaleString('es-MX')} />{paso != null && <small>{paso}%</small>}</>}</span>
          </li>
        })}
      </ol>
      {x.embudo.some(e => e.valor == null) && <p className={d.pie}>Rayado = aún no hay fuente que lo cuente. No es cero.</p>}
      {x.notaEmbudo && <p className={d.pie}>{x.notaEmbudo}</p>}
    </>}
  </Tarjeta>
}

function EnCurso({ eventos, ahora }: { eventos: Item[]; ahora: number }) {
  const actual = eventos.find(e => e.inicio! <= ahora && ahora < e.fin!)
  if (!actual) return null
  const sigue = eventos.find(e => e.inicio! >= actual.fin!)
  const avance = Math.max(0.02, Math.min(1, (ahora - actual.inicio!) / Math.max(1, actual.fin! - actual.inicio!)))
  return <div className={`${d.enCurso} ${mov.entra}`} style={{ ...escalon(4), ['--c' as string]: actual.color }}>
    <p><i className={mov.late} aria-hidden /><b>Ahora</b> · {actual.hora} · quedan {duracion(Math.max(1, Math.round((actual.fin! - ahora) / 60000)))}</p>
    <strong>{actual.titulo}</strong>
    <span className={d.barra} aria-hidden><i className={mov.llena} style={{ width: `${Math.round(avance * 100)}%` }} /></span>
    {sigue && <small>Luego · <em>{sinEmoji(sigue.titulo)}</em> a las {sigue.hora}</small>}
  </div>
}

function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(t) }, [])
  return ahora
}

type Fase = 'enviando' | 'hecha' | 'plegando' | 'plegada'
const CABEN = 6

/** Tareas de hoy como tarjetas: palomear escribe en Todoist (pluma del calendario), la palomita se dibuja, el
 *  título se tacha y la tarjeta se pliega; «Deshacer» la reabre. Si Todoist rechaza, vuelve y se dice por qué. */
function TareasVivas({ tareas, dia, ownerId, proyectos, i }: { tareas: PlanTask[]; dia: string; ownerId?: string; proyectos: Map<string, string>; i: number }) {
  const [estado, setEstado] = useState<Record<string, { t: PlanTask; pos: number; fase: Fase }>>({})
  const [ultima, setUltima] = useState<PlanTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [todas, setTodas] = useState(false)
  useEffect(() => { if (!ultima) return; const t = setTimeout(() => setUltima(null), 7000); return () => clearTimeout(t) }, [ultima])
  const fase = (id: string, f: Fase | null) => setEstado(s => { const n = { ...s }; if (f) { if (n[id]) n[id] = { ...n[id], fase: f } } else delete n[id]; return n })
  const lista = useMemo(() => {
    const base = tareas.filter(t => estado[t.id]?.fase !== 'plegada')
    // Las que se están palomeando se retienen aunque la relectura ya no las traiga, para que el pliegue se vea.
    for (const e of Object.values(estado).sort((a, b) => a.pos - b.pos)) if (e.fase !== 'plegada' && !base.some(x => x.id === e.t.id)) base.splice(Math.min(e.pos, base.length), 0, e.t)
    return base
  }, [tareas, estado])
  async function palomear(t: PlanTask, pos: number) {
    if (!ownerId || estado[t.id]) return
    setError(null); setEstado(s => ({ ...s, [t.id]: { t, pos, fase: 'enviando' } }))
    const t0 = Date.now()
    try {
      await mutarTarea(t, ownerId, 'complete')
      fase(t.id, 'hecha'); setUltima(t)
      setTimeout(() => { fase(t.id, 'plegando'); setTimeout(() => fase(t.id, 'plegada'), 420) }, Math.max(0, 900 - (Date.now() - t0)))
    } catch (e) { fase(t.id, null); setError(e instanceof Error ? e.message : 'Todoist no confirmó el cambio.') }
  }
  async function deshacer(t: PlanTask) {
    setUltima(null)
    try { await mutarTarea(t, ownerId!, 'reopen'); fase(t.id, null) }
    catch (e) { setError(e instanceof Error ? e.message : 'No pude reabrirla; ábrela en Todoist.') }
  }
  const pendientes = lista.filter(t => !estado[t.id]).length
  const visibles = todas ? lista : lista.slice(0, CABEN)
  return <section className={d.bloque} aria-label="Tareas de hoy">
    <header className={`${d.bloqueTitulo} ${mov.entra}`} style={escalon(i)}><h4>Tareas de hoy</h4>{pendientes > 0 && <small>{pendientes}</small>}</header>
    {error && <p className={l.aviso} role="alert">{error}</p>}
    {!lista.length ? <p className={l.vacio}>Nada pendiente con fecha de hoy.</p> : <div className={d.tareas}>
      {visibles.map((t, k) => { const f = estado[t.id]?.fase, proyecto = t.projectId ? proyectos.get(t.projectId) : undefined
        return <div key={t.id} className={mov.pliega} data-plegada={f === 'plegando' || undefined}>
          <article className={`${d.tarea} ${mov.entra}`} style={escalon(i + 1 + k)} data-hecha={f ? true : undefined} data-prio={t.priority && t.priority < 3 ? t.priority : undefined}>
            <button className={d.check} onClick={() => void palomear(t, k)} disabled={!ownerId || !!f} aria-label={`Completar «${t.title}»`} title={ownerId ? 'Completar en Todoist' : 'Sin identidad para escribir'}><Palomita /></button>
            <div className={d.tareaCuerpo}>
              <p className={d.tareaTitulo}>{t.url ? <a href={t.url} target="_blank" rel="noreferrer">{t.title}</a> : t.title}</p>
              <p className={d.tareaMeta}>
                {t.priority && t.priority < 3 && <span className={l.prio} data-prio={t.priority}>P{t.priority}</span>}
                {proyecto && <span>{proyecto}</span>}
                {atrasada(t, dia) && <span className={l.atrasada}>atrasada</span>}
                {t.recurring && <span title={t.recurrenceText ?? 'Se repite'}>↻</span>}
              </p>
            </div>
          </article>
        </div> })}
    </div>}
    {lista.length > CABEN && <button className={l.enlace} onClick={() => setTodas(v => !v)} aria-expanded={todas}>{todas ? 'Ver menos' : `Ver las ${lista.length}`}</button>}
    {ultima && <p className={`${l.deshacer} ${mov.aparece}`} role="status"><span>Hecha: «{ultima.title}»{ultima.recurring ? ' · su próxima repetición quedó programada' : ''}</span>
      {!ultima.recurring && <button className={l.enlace} onClick={() => void deshacer(ultima)}>Deshacer</button>}</p>}
  </section>
}

function Cabecera({ fecha, ceja, i, derecha }: { fecha: string; ceja: string; i: number; derecha?: React.ReactNode }) {
  const hoy = hoyCivil(), relativo = fecha === hoy ? 'Hoy' : fecha === sumarDias(hoy, -1) ? 'Ayer' : null
  return <div className={l.heroe}>
    <div className={mov.entra} style={escalon(i)}>
      <p className={l.ceja}>{ceja} · {relativo ? <><b>{relativo}</b> · </> : null}{etiquetaDia(fecha, { weekday: 'long' })}</p>
      <h3 className={`${l.titular} ${l.serif}`}>{etiquetaDia(fecha, { day: 'numeric' })} <small>de {etiquetaDia(fecha, { month: 'long' })}</small></h3>
    </div>
    {derecha}
  </div>
}

function Lectura({ url, leidoEn, cargando }: { url: string; leidoEn?: string; cargando: boolean }) {
  const [ocupado, setOcupado] = useState(false)
  async function actualizar() {
    setOcupado(true)
    try { await fetch(`${url}&fresco=1`, { cache: 'no-store' }); await releer(url) } finally { setOcupado(false) }
  }
  const h = horaLectura(leidoEn)
  return <p className={d.lectura}>
    <span>{cargando && !h ? 'Leyendo Polar y tus fuentes…' : h ? `Leído a las ${h}, en vivo al abrir` : ''}</span>
    <button className={l.enlace} onClick={() => void actualizar()} disabled={ocupado || cargando}><RefreshCw size={12} className={ocupado ? 'animate-spin' : undefined} aria-hidden /> Actualizar</button>
  </p>
}

function DiarioDueno({ fecha }: { fecha: string }) {
  const url = urlDiario(DUENO(), fecha)
  const rep = useFuente<DatosDueno>(url)
  const plan = useFuente<PlanningSnapshot>(urlCalendario('dia', fecha))
  const ahora = useAhora()
  const hoy = hoyCivil(), esHoy = fecha === hoy
  const { mapa } = useMemo(() => porDia(plan.data), [plan.data])
  const items = mapa.get(fecha) ?? []
  const eventos = items.filter(e => !e.tarea && e.inicio != null)
  const tareas = useMemo(() => tareasDe(plan.data, fecha, hoy), [plan.data, fecha, hoy])
  // El bloque en curso vive en su tarjeta «Ahora»; la agenda muestra el resto (sin repetirlo).
  const actual = esHoy ? eventos.find(e => e.inicio! <= ahora && ahora < e.fin!) : undefined
  const resto = actual ? eventos.filter(e => e !== actual) : eventos
  const proyectos = useMemo(() => new Map((plan.data?.projects ?? []).map(p => [p.id, p.title])), [plan.data?.projects])
  const x = rep.data
  const decidir = () => window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto: `Decidamos lo que trae el reporte de hoy: «${x?.decision}». Dame tu recomendación con evidencia antes de tocar nada.` } }))
  return <div className={d.diario}>
    <Cabecera fecha={fecha} ceja="Reporte diario" i={0} derecha={esHoy ? <p className={`${d.hora} ${mov.entra}`} style={escalon(1)}>{new Date(ahora).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false })}</p> : undefined} />
    {rep.error && !x && <p className={l.aviso}>{rep.error}</p>}
    {x?.limites.length ? <p className={l.aviso}>Sin dato hoy: {x.limites.join('; ')}.</p> : null}
    {x?.alarmas.length ? <Tarjeta i={1} tono="alarma" ceja={<b>Alarmas</b>}><ul className={d.lista}>{x.alarmas.map(a => <li key={a}>{a}</li>)}</ul></Tarjeta> : null}
    {x?.decision && <Tarjeta i={1} tono="decision" ceja={<b>Decisión pendiente</b>} extra={<button className={l.enlace} onClick={decidir}>Decidir con Levy</button>}><p className={`${d.decision} ${l.serif}`}>{x.decision}</p></Tarjeta>}
    <div className={d.rejilla}>
      <Dinero x={x} i={2} />
      <Lanzamiento x={x} i={3} />
    </div>
    <section className={d.bloque} aria-label="Tu día">
      <header className={`${d.bloqueTitulo} ${mov.entra}`} style={escalon(4)}><h4>Tu día</h4>{eventos.length > 0 && <small>{eventos.length}</small>}</header>
      {!plan.data ? (plan.error ? <p className={l.aviso}>{plan.error}</p> : <Cargando lineas={3} />) : <>
        <Riel eventos={eventos} dia={fecha} hoy={hoy} ahora={ahora} />
        {esHoy && <EnCurso eventos={eventos} ahora={ahora} />}
        {resto.length ? <Agenda eventos={resto} dia={fecha} hoy={hoy} ahora={ahora} /> : !actual && <p className={l.vacio}>Nada agendado {esHoy ? 'hoy' : 'ese día'}.</p>}
      </>}
    </section>
    {plan.data ? <TareasVivas tareas={tareas} dia={fecha} ownerId={plan.data.ownerId} proyectos={proyectos} i={6} /> : null}
    <Lectura url={url} leidoEn={x?.leidoEn} cargando={rep.cargando} />
  </div>
}

function Nombres({ nombres, vacio }: { nombres: string[]; vacio: string }) {
  if (!nombres.length) return <p className={l.vacio}>{vacio}</p>
  return <div className={d.nombres}>{nombres.map((n, k) => <span key={`${n}-${k}`} className={mov.aparece} style={escalon(k)}>{n}</span>)}</div>
}

function DiarioSegunda({ fecha }: { fecha: string }) {
  const url = urlDiario(SEGUNDA(), fecha)
  const { data: x, error, cargando } = useFuente<DatosSegunda>(url)
  const c = x?.comunidad
  return <div className={d.diario}>
    <Cabecera fecha={fecha} ceja={`Reporte de ${NOMBRE_SEGUNDA()}`} i={0} />
    {error && !x && <p className={l.aviso}>{error}</p>}
    {x?.limites.length ? <p className={l.aviso}>Sin dato hoy: {x.limites.join('; ')}.</p> : null}
    <div className={d.rejilla}>
      <Tarjeta i={1} ceja={<b>Por responder</b>}>
        {!x ? <Cargando /> : !c ? <Hueco texto="No pude leer la comunidad hoy. No es cero." /> : <>
          <div className={d.cifras}>
            <div><Cifra className={d.cifra} valor={c.sinRespuesta.length} clave={`sin-${x.fecha}`} formato={n => String(Math.round(n))} /><small>Publicaciones sin respuesta</small></div>
            <div><Cifra className={d.cifra} valor={c.conversacionesEsperando} clave={`conv-${x.fecha}`} formato={n => String(Math.round(n))} /><small>Conversaciones esperando (72 h)</small></div>
          </div>
          {c.sinRespuesta.length > 0 && <ul className={d.lista}>{c.sinRespuesta.slice(0, 4).map((p, k) => <li key={k} className={mov.entra} style={escalon(3 + k)}>{p}</li>)}</ul>}
        </>}
      </Tarjeta>
      <Tarjeta i={2} ceja={<b>Comentarios de YouTube</b>}>
        {!x ? <Cargando /> : !x.youtube ? <Hueco texto="No pude leer la cola. No es cero." /> : <div className={d.cifras}>
          <div><Cifra className={d.cifra} valor={x.youtube.nuevos_3d} clave={`yt3-${x.fecha}`} formato={n => String(Math.round(n))} /><small>Nuevos en 3 días</small></div>
          <div><Cifra className={d.cifra} valor={x.youtube.total} clave={`ytt-${x.fecha}`} formato={n => Math.round(n).toLocaleString('es-MX')} /><small>En cola por aprobar</small></div>
        </div>}
      </Tarjeta>
      <Tarjeta i={3} ceja={<b>Bienvenidas</b>}>{!x ? <Cargando lineas={1} /> : c ? <Nombres nombres={c.nuevos} vacio="Sin miembros nuevos en las últimas 24 h." /> : <Hueco texto="Sin dato." />}</Tarjeta>
      <Tarjeta i={4} ceja={<b>Dejaron de entrar</b>} extra={c?.dejaron.length ? <small className={d.ayuda}>2 semanas sin entrar</small> : undefined}>
        {!x ? <Cargando lineas={1} /> : c ? <>{<Nombres nombres={c.dejaron} vacio="Nadie cumplió 2 semanas sin entrar." />}{c.dejaron.length > 0 && <p className={d.pie}>Un mensaje corto puede traerlos de vuelta.</p>}</> : <Hueco texto="Sin dato." />}
      </Tarjeta>
      <Tarjeta i={5} ceja={<b>Correo de soporte</b>}><Hueco texto="Sin medir: todavía no hay buzón de soporte definido." /></Tarjeta>
    </div>
    <Lectura url={url} leidoEn={x?.leidoEn} cargando={cargando} />
  </div>
}

export function VistaDiario({ fecha, quien = DUENO() }: { fecha?: string; quien?: Quien; grande?: boolean }) {
  const dia = fecha ?? hoyCivil()
  return quien === SEGUNDA() ? <DiarioSegunda fecha={dia} /> : <DiarioDueno fecha={dia} />
}
