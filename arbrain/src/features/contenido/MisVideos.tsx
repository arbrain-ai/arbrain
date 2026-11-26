'use client'
/**
 * Lo tuyo (17 nov 2026): las tres casas que no tenían lugar. Guardados (miniaturas, buscables, con los mismos temas de
 * Inicio), Ver después (la cola por cuándo toca, como una línea del tiempo: hoy, mañana, el jueves, y lo sin hora al
 * final) y Descargas (lo que ya vivía al pie de Mentalidad). Y la columna «Por cuándo toca» que acompaña a Inicio.
 */
import { useMemo, useState } from 'react'
import { ArrowRight, Bookmark, CalendarClock, Clock, Download, Play, Search, X } from 'lucide-react'
import { idiomaActual, localeDe, tr } from '@/shared/i18n'
import { TarjetaVideo, Miniatura, Vacio } from './piezas'
import { duracion } from './modelo'
import { temasChip } from './pantalla'
import { colaOrdenada, filtrarGuardados, type EnCola, type FichaVideo } from './mios'
import { cambiar, mostrarAviso, useMios } from './useMios'
import { cuandoPartes, useAbrirDespues } from './VerDespues'
import { Descargados } from './Aprender'
import { useDescargas } from './useDescargas'
import type { LecturaCuartel, VideoCuartel } from './tipos'
import type { EnSala } from './Sala'
import s from './cuartel.module.css'

/** El video vivo del cuartel si lo conoce (con su ×N y su capa); si no, lo que se guardó de él. */
export function videoDe(f: FichaVideo, porId: Map<string, VideoCuartel>): VideoCuartel {
  return porId.get(f.video_id) ?? { video_id: f.video_id, channel_id: f.channel_id ?? '', canal: f.canal, capa: 'descubierto', titulo: f.titulo, publicado: f.publicado ?? '', duracion_s: f.duracion_s, miniatura_url: f.miniatura_url, temas: f.temas }
}
export const usePorId = (lectura: LecturaCuartel) => useMemo(() => new Map([...lectura.videos, ...lectura.outliers, ...(lectura.dosis?.videos ?? []).map(p => p.video).filter((v): v is VideoCuartel => !!v)].map(v => [v.video_id, v])), [lectura])

export function Guardados({ lectura, abrir }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void }) {
  const { mios, cargado } = useMios()
  const porId = usePorId(lectura)
  const [q, setQ] = useState('')
  const [tema, setTema] = useState<string | null>(null)
  const presentes = useMemo(() => new Set(mios.guardados.flatMap(g => g.temas ?? [])), [mios.guardados])
  const temas = useMemo(() => temasChip(lectura.universo?.temas).filter(t => presentes.has(t.slug)), [lectura.universo, presentes])
  const lista = filtrarGuardados(mios.guardados, { q, tema })
  return <section className={s.misVideos} data-testid="mis-videos" data-vista="guardados">
    <header className={s.misCabeza}>
      <h2><Bookmark size={18} /> {tr('Guardados')}{mios.guardados.length > 0 && <b className={s.cuenta}>{mios.guardados.length}</b>}</h2>
      <p>{tr('Lo que quisiste conservar. Sin caducidad y sin orden de nadie: lo último que guardaste, primero.')}</p>
      {mios.guardados.length > 0 && <label className={s.buscador}><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('Buscar título o canal…')} aria-label={tr('Buscar en tus guardados')} /></label>}
    </header>
    {temas.length > 1 && <div className={s.chipsFila} role="group" aria-label={tr('Tema')}>
      <button data-activo={tema === null || undefined} data-fuerte onClick={() => setTema(null)}>{tr('Todo')}</button>
      {temas.map(t => <button key={t.slug} data-activo={tema === t.slug || undefined} title={t.nombre} onClick={() => setTema(tema === t.slug ? null : t.slug)}>{t.corto}</button>)}
    </div>}
    {!cargado ? <Vacio>{tr('Leyendo lo tuyo…')}</Vacio>
      : !mios.guardados.length ? <VacioGuia icono={<Bookmark size={22} />} titulo={tr('Aún no guardas nada')} texto={tr('En cualquier miniatura, toca «Guardar». Aquí se quedan, aunque cierres la app.')} />
      : !lista.length ? <Vacio>{tr('Nada con eso en tus guardados.')}</Vacio>
      : <div className={s.rejillaYT}>{lista.map((g, i) => { const v = videoDe(g, porId); return <TarjetaVideo key={g.video_id} v={v} i={i} abrir={x => abrir({ video: x, desde: 'biblioteca' })} /> })}</div>}
  </section>
}

const claveDia = (iso: string | null) => iso ? new Date(iso).toDateString() : 'sin'
function tituloDia(iso: string | null): string {
  if (!iso) return tr('Sin hora')
  const d = new Date(iso), hoy = new Date(), man = new Date(); man.setDate(man.getDate() + 1)
  if (d.toDateString() === hoy.toDateString()) return tr('Hoy')
  if (d.toDateString() === man.toDateString()) return tr('Mañana')
  const t = d.toLocaleDateString(localeDe(idiomaActual()), { weekday: 'long', day: 'numeric', month: 'short' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString(localeDe(idiomaActual()), { hour: '2-digit', minute: '2-digit', hour12: false })

export function VerDespuesVista({ lectura, abrir }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void }) {
  const { mios, cargado } = useMios()
  const porId = usePorId(lectura)
  const abrirHoja = useAbrirDespues()
  const cola = colaOrdenada(mios.despues)
  const pasados = cola.filter(d => d.cuando && Date.parse(d.cuando) < Date.now() - 36e5)
  const dias = useMemo(() => { const m = new Map<string, EnCola[]>(); for (const d of cola) { const k = claveDia(d.cuando); m.set(k, [...(m.get(k) ?? []), d]) } return [...m.entries()] }, [cola])
  const conHora = cola.filter(d => d.cuando).length
  return <section className={s.misVideos} data-testid="mis-videos" data-vista="despues">
    <header className={s.misCabeza}>
      <h2><Clock size={18} /> {tr('Ver después')}{cola.length > 0 && <b className={s.cuenta}>{cola.length}</b>}</h2>
      <p>{cola.length ? tr('{n} con hora en tu calendario. Al verlo o votarlo sale de aquí; su bloque se queda en tu calendario.', { n: conHora }) : tr('Tu cola, por cuándo toca.')}</p>
    </header>
    {pasados.length > 0 && <p className={s.colaPendiente}><CalendarClock size={14} /> {tr('{n} ya pasaron su hora y siguen sin ver. Dales otra hora o sácalos.', { n: pasados.length })}</p>}
    {!cargado ? <Vacio>{tr('Leyendo lo tuyo…')}</Vacio>
      : !cola.length ? <VacioGuia icono={<Clock size={22} />} titulo={tr('Nada en tu cola')} texto={tr('En cualquier miniatura, toca «Ver después» y elige un hueco: se crea su bloque en tu calendario.')} />
      : <ol className={s.linea}>{dias.map(([k, xs]) => <li key={k} className={s.lineaDia} data-sin-hora={k === 'sin' || undefined}>
          <h3>{tituloDia(xs[0].cuando)}<small>{xs.reduce((a, d) => a + Math.ceil((d.duracion_s ?? 0) / 60), 0)} min</small></h3>
          <ul>{xs.map((d, i) => { const v = videoDe(d, porId), pasado = !!d.cuando && Date.parse(d.cuando) < Date.now() - 36e5
            return <li key={d.video_id} className={`${s.colaFila} mov-entra`} style={{ ['--i' as string]: i }} data-pasado={pasado || undefined} data-testid="cola-fila">
              <time className={s.colaHora}>{d.cuando ? horaDe(d.cuando) : '—'}<small>{d.evento ? tr('en tu calendario') : d.cuando ? tr('sin bloque') : ''}</small></time>
              <button className={s.colaMini} onClick={() => abrir({ video: v, desde: 'biblioteca' })} aria-label={tr('Ver: {titulo}', { titulo: d.titulo })}><Miniatura video={v} /><span className={s.filaPlay}><Play size={14} fill="currentColor" /></span>{d.duracion_s ? <small>{duracion(d.duracion_s)}</small> : null}</button>
              <span className={s.colaTexto}><button className={s.filaTitulo} onClick={() => abrir({ video: v, desde: 'biblioteca' })}>{d.titulo}</button><small>{d.canal}</small></span>
              <span className={s.colaBotones}>
                <button className={s.pastilla} onClick={() => abrirHoja(d)} data-accion="mover"><CalendarClock size={13} /> {d.cuando ? tr('Cambiar hora') : tr('Ponle hora')}</button>
                <button className={s.icono} onClick={() => { void cambiar({ accion: 'salir', video_id: d.video_id }); mostrarAviso(d.evento ? tr('Fuera de tu cola. Su bloque sigue en tu calendario.') : tr('Fuera de tu cola.'), { deshacer: () => void cambiar({ accion: 'despues', video: d, cuando: d.cuando, evento: d.evento }) }) }} aria-label={tr('Sacar de la cola')} title={tr('Sacar de la cola')}><X size={14} /></button>
              </span>
            </li> })}</ul>
        </li>)}</ol>}
  </section>
}

export function DescargasVista({ lectura, abrir }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void }) {
  const ds = useDescargas()
  return <section className={s.misVideos} data-testid="mis-videos" data-vista="descargas">
    <header className={s.misCabeza}><h2><Download size={18} /> {tr('Descargas')}{ds.lista.length > 0 && <b className={s.cuenta}>{ds.lista.length}</b>}</h2>
      <p>{tr('Lo que bajaste al Studio para verlo sin red o desde el teléfono. Se borran a los 30 días o al verlas, salvo lo fijado.')}</p></header>
    {ds.lista.length ? <Descargados lectura={lectura} abrir={abrir} />
      : <VacioGuia icono={<Download size={22} />} titulo={tr('Sin descargas')} texto={tr('Dentro de un video, «Descargar» lo baja al Studio. Solo si tú lo decides.')} />}
  </section>
}

function VacioGuia({ icono, titulo, texto }: { icono: React.ReactNode; titulo: string; texto: string }) {
  return <div className={s.vacioGuia}><span aria-hidden>{icono}</span><b>{titulo}</b><p>{texto}</p></div>
}

/** Junto a Inicio: lo que te toca ver, por hora. Solo si hay algo en la cola. */
export function PorCuandoToca({ lectura, abrir, irCola }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void; irCola?: () => void }) {
  const { mios } = useMios()
  const porId = usePorId(lectura)
  const cola = colaOrdenada(mios.despues).filter(d => !d.cuando || Date.parse(d.cuando) > Date.now() - 36e5).slice(0, 5)
  if (!cola.length) return null
  return <aside className={s.porCuando} data-testid="por-cuando" aria-label={tr('Ver después, por cuándo toca')}>
    <h3><Clock size={14} /> {tr('Ver después')}<small>{tr('por cuándo toca')}</small></h3>
    <ol>{cola.map(d => { const v = videoDe(d, porId)
      return <li key={d.video_id}><button onClick={() => abrir({ video: v, desde: 'biblioteca' })}>
        <time data-sin-hora={!d.cuando || undefined}>{d.cuando ? <><b>{cuandoPartes(d.cuando).dia}</b>{cuandoPartes(d.cuando).hora}</> : <b>{tr('Sin hora')}</b>}</time>
        <span className={s.porCuandoMini}><Miniatura video={v} /></span>
        <span className={s.porCuandoTexto}><b>{d.titulo}</b><small>{d.canal}{d.duracion_s ? ` · ${duracion(d.duracion_s)}` : ''}</small></span>
      </button></li> })}</ol>
    {irCola && <button className={s.enlace} onClick={irCola}>{tr('Toda tu cola')} <ArrowRight size={12} /></button>}
  </aside>
}
