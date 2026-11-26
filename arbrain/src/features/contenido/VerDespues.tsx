'use client'
/**
 * Guardar y «ver después» (17 nov 2026, el dueño: «como youtube puedes guardar videos, programar para ver después que
 * se sincronice bien con mi calendario»).
 *  · `AccionesVideo`: los dos toques de cada tarjeta y de la Sala. Aparecen al pasar el ratón (siempre en pantalla
 *    táctil) y se quedan a la vista cuando ya están puestos: el marcador lleno y la hora a la que toca.
 *  · `HojaDespues`: «¿Cuándo lo ves?». Tres huecos de su calendario real (solo lectura), «elegir otro» y «sin hora».
 *    Elegir crea UN bloque por la pluma del Día; si ya tenía, lo mueve. El aviso del pie ofrece deshacer.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, CalendarClock, CalendarPlus, Check, Clock, X } from 'lucide-react'
import { usePlanning } from '@/features/planning/usePlanning'
import { idiomaActual, localeDe, tr } from '@/shared/i18n'
import { agendar, deshacerBloque, ocupadoDe, calendarioDestino } from './bloque'
import { choca, huecosLibres, minutosDeBloque, type Hueco } from './huecos'
import { enCola, estaGuardado, ficha, type FichaVideo } from './mios'
import { alternarGuardado, cambiar, cerrarAviso, mostrarAviso, origenEnlace, useMios } from './useMios'
import { Miniatura } from './piezas'
import s from './cuartel.module.css'

/** Abrir la hoja desde cualquier tarjeta: la monta el cuartel, una sola. */
export const VerDespuesCtx = createContext<(v: FichaVideo) => void>(() => {})
export const useAbrirDespues = () => useContext(VerDespuesCtx)

const loc = () => localeDe(idiomaActual())
const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
/** «Hoy» · «18:30»; «Mañana» · «14:00»; «jue 19» · «16:30». */
export function cuandoPartes(iso: string | Date, ahora = new Date()): { dia: string; hora: string } {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const hora = d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit', hour12: false })
  const manana = new Date(ahora); manana.setDate(manana.getDate() + 1)
  const dia = mismoDia(d, ahora) ? tr('Hoy') : mismoDia(d, manana) ? tr('Mañana') : d.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric' }).replace('.', '')
  return { dia, hora }
}
export const cuandoTexto = (iso: string | Date, ahora = new Date()) => { const p = cuandoPartes(iso, ahora); return `${p.dia} ${p.hora}` }
const hhmm = (d: Date) => d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit', hour12: false })

export function AccionesVideo({ v, en = 'sobre' }: { v: FichaVideo; en?: 'sobre' | 'linea' | 'sala' | 'meta' }) {
  const { mios } = useMios()
  const abrir = useAbrirDespues()
  const guardado = estaGuardado(mios, v.video_id)
  const cola = enCola(mios, v.video_id)
  return <span className={s.acciones} data-en={en} onClick={e => e.stopPropagation()}>
    <button type="button" data-accion="guardar" data-activo={guardado || undefined} aria-pressed={guardado}
      onClick={() => void alternarGuardado(ficha(v), guardado)} title={guardado ? tr('Quitar de Guardados') : tr('Guardar')} aria-label={guardado ? tr('Quitar de Guardados') : tr('Guardar')}>
      <Bookmark size={en === 'sala' ? 15 : 14} fill={guardado ? 'currentColor' : 'none'} /><span>{guardado ? tr('Guardado') : tr('Guardar')}</span>
    </button>
    <button type="button" data-accion="despues" data-activo={!!cola || undefined} onClick={() => abrir(ficha(v))}
      title={cola?.cuando ? tr('Toca {cuando}: cambiar la hora', { cuando: cuandoTexto(cola.cuando) }) : cola ? tr('En tu cola: ponle hora') : tr('Ver después')} aria-label={tr('Ver después')}>
      <Clock size={en === 'sala' ? 15 : 14} /><span>{cola?.cuando ? cuandoTexto(cola.cuando) : cola ? tr('En tu cola') : tr('Ver después')}</span>
    </button>
  </span>
}

/** Lo tuyo de este video, como una línea chica bajo el título (no encima de la imagen): «Guardado · Jue 16:30». */
export function EstadoMio({ v }: { v: Pick<FichaVideo, 'video_id'> & Partial<FichaVideo> }) {
  const { mios } = useMios()
  const abrir = useAbrirDespues()
  const guardado = estaGuardado(mios, v.video_id)
  const cola = enCola(mios, v.video_id)
  if (!guardado && !cola) return null
  return <span className={s.estadoMio} data-testid="estado-mio">
    {guardado && <span data-guardado><Bookmark size={11} fill="currentColor" aria-hidden /> {tr('Guardado')}</span>}
    {cola && <button type="button" data-cola onClick={e => { e.stopPropagation(); abrir(cola) }} title={tr('Cambiar la hora')}><Clock size={11} aria-hidden /> {cola.cuando ? cuandoTexto(cola.cuando) : tr('En tu cola')}</button>}
  </span>
}

export function HojaDespues({ video, cerrar }: { video: FichaVideo; cerrar: () => void }) {
  const { mios } = useMios()
  const previo = enCola(mios, video.video_id)
  const minutos = minutosDeBloque(video.duracion_s)
  // El calendario REAL, solo lectura: hoy y los tres días que siguen.
  const rango = useMemo(() => { const a = new Date(); a.setHours(0, 0, 0, 0); return { from: a.toISOString(), to: new Date(a.getTime() + 4 * 864e5).toISOString() } }, [])
  const { snapshot, loading, error, mutate } = usePlanning(rango)
  const ocupado = useMemo(() => ocupadoDe(snapshot), [snapshot])
  const huecos = useMemo(() => snapshot ? huecosLibres({ ocupado, ahora: new Date(), minutos }) : [], [snapshot, ocupado, minutos])
  const conCalendario = !!calendarioDestino(snapshot)
  const sinCalendario = !loading && !conCalendario
  const [otroDia, setOtroDia] = useState('')
  const [otroHora, setOtroHora] = useState('18:00')
  const [otroPorque, setOtroPorque] = useState<'hueco' | 'sin' | 'mano' | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [falla, setFalla] = useState<string | null>(null)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar() } }
    document.addEventListener('keydown', tecla, true)
    const t = setTimeout(() => caja.current?.querySelector<HTMLElement>('[data-hueco], [data-sin-hora]')?.focus(), 60)
    return () => { document.removeEventListener('keydown', tecla, true); clearTimeout(t) }
  }, [cerrar])

  const elegir = useCallback(async (inicio: Date | null, clave: string) => {
    if (enviando) return
    setEnviando(clave); setFalla(null)
    try {
      const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
      const r = await agendar({ mutar: mutate, snapshot, video, previo: previo ? { cuando: previo.cuando, evento: previo.evento } : null, inicio, minutos, origen: origenEnlace(), zona })
      // Sin hora y con bloque previo: el bloque se queda donde estaba (borrar es decisión del dueño).
      if (!(await cambiar({ accion: 'despues', video, cuando: r.cuando, evento: r.evento }))) return
      cerrar()
      if (r.creado) {
        const creado = r.creado, snap = snapshot!
        mostrarAviso(tr('En tu calendario: {cuando}', { cuando: cuandoTexto(inicio!) }), { deshacer: async () => {
          try { await deshacerBloque({ mutar: mutate, snapshot: snap, evento: creado }); await cambiar(previo ? { accion: 'despues', video, cuando: previo.cuando, evento: previo.evento } : { accion: 'salir', video_id: video.video_id }) }
          catch (e) { mostrarAviso(tr('No se pudo deshacer: {motivo}', { motivo: (e as Error).message }), { error: true }) }
        } })
      } else if (r.movido) {
        const antes = previo?.cuando ? new Date(previo.cuando) : null
        mostrarAviso(tr('Movido a {cuando}, el mismo bloque', { cuando: cuandoTexto(inicio!) }), antes ? { deshacer: async () => {
          try { const de = await agendar({ mutar: mutate, snapshot, video, previo: { cuando: r.cuando, evento: r.evento }, inicio: antes, minutos, origen: origenEnlace(), zona }); await cambiar({ accion: 'despues', video, cuando: de.cuando, evento: de.evento }) }
          catch (e) { mostrarAviso(tr('No se pudo deshacer: {motivo}', { motivo: (e as Error).message }), { error: true }) }
        } } : {})
      } else mostrarAviso(r.sinCalendario ? tr('En tu cola para {cuando} (sin calendario conectado)', { cuando: cuandoTexto(inicio!) }) : tr('En tu cola, sin hora'), { deshacer: () => void cambiar(previo ? { accion: 'despues', video, cuando: previo.cuando, evento: previo.evento } : { accion: 'salir', video_id: video.video_id }) })
    } catch (e) { setFalla((e as Error).message) }
    finally { setEnviando(null) }
  }, [enviando, mutate, snapshot, video, previo, minutos, cerrar])

  const dias = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d }), [])
  const horas = useMemo(() => Array.from({ length: 68 }, (_, i) => `${String(6 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`), [])
  const otroFecha = otroDia ? (() => { const d = new Date(otroDia); const [h, m] = otroHora.split(':').map(Number); d.setHours(h, m, 0, 0); return d })() : null
  const otroChoca = otroFecha && !Number.isNaN(otroFecha.getTime()) ? choca(ocupado, otroFecha, minutos) : false
  const ahora = new Date()
  return createPortal(<div className={s.hojaCapa} onMouseDown={e => { if (e.target === e.currentTarget) cerrar() }} data-testid="hoja-despues">
    <div ref={caja} className={s.hoja} role="dialog" aria-modal aria-label={tr('¿Cuándo lo ves?')}>
      <header className={s.hojaCabeza}>
        <span className={s.hojaMini}><Miniatura video={{ video_id: video.video_id, miniatura_url: video.miniatura_url ?? null, titulo: video.titulo }} /></span>
        <span><h2>{tr('¿Cuándo lo ves?')}</h2><p title={video.titulo}>{video.titulo}</p><small>{tr('Un bloque de {n} min', { n: minutos })}{(video.duracion_s ?? 0) > minutos * 60 ? ` · ${tr('su primera parte')}` : ''}</small></span>
        <button className={s.icono} onClick={cerrar} aria-label={tr('Cerrar')}><X size={16} /></button>
      </header>
      {previo?.cuando && <p className={s.hojaAhora}><CalendarClock size={13} /> {tr('Ahora toca {cuando}. Elegir otra hora mueve el mismo bloque.', { cuando: cuandoTexto(previo.cuando) })}</p>}
      {sinCalendario ? <p className={s.hojaNota}>{error ? tr('No pude leer tu calendario: {motivo}', { motivo: error }) : tr('Sin calendario conectado: queda en tu cola y lo ves cuando quieras.')}</p>
        : <div className={s.huecos} role="group" aria-label={tr('Huecos libres en tu calendario')}>
          <p className={s.huecosGuia}>{tr('Libres en tu calendario. Toca uno para agendarlo.')}</p>
          {!snapshot ? [0, 1, 2].map(i => <span key={i} className={s.huecoFantasma} aria-hidden />)
            : huecos.length ? huecos.map((h: Hueco, i) => <button key={h.inicio.toISOString()} data-hueco={h.inicio.toISOString()} data-primero={i === 0 || undefined} disabled={!!enviando}
                onClick={() => void elegir(h.inicio, h.inicio.toISOString())}>
                <b>{cuandoTexto(h.inicio, ahora)}</b><small>{i === 0 && <em className={s.sugerido}>{tr('sugerido')}</em>}{tr('termina a las {hora}', { hora: hhmm(h.fin) })}</small>
                {enviando === h.inicio.toISOString() ? <span className={s.girando} aria-hidden /> : <CalendarPlus size={14} aria-hidden />}
              </button>)
            : <p className={s.hojaNota}>{tr('No encontré un hueco libre en los próximos días. Elige otra hora o déjalo sin hora.')}</p>}
        </div>}
      {!sinCalendario && <div className={s.hojaOtro} role="group" aria-label={tr('Elegir otro día')}>
        <span>{tr('Otro día')}</span>
        {/* Un toque al día propone su primer hueco libre; otro toque agenda (17 nov, juez 3: «el jueves pide un desplegable»). */}
        <span className={s.diasChips}>{dias.slice(0, 7).map((d, i) => <button key={d.toISOString()} type="button" data-dia={d.toISOString()} data-activo={otroDia === d.toISOString() || undefined}
          onClick={() => { setOtroDia(d.toISOString()); const fin = new Date(d); fin.setDate(fin.getDate() + 1)
            const h = huecosLibres({ ocupado, ahora: i === 0 ? new Date() : d, minutos, dias: 1, cuantos: 1 })[0]
            if (h && h.inicio < fin) { setOtroHora(`${String(h.inicio.getHours()).padStart(2, '0')}:${String(h.inicio.getMinutes()).padStart(2, '0')}`); setOtroPorque('hueco') } else setOtroPorque('sin') }}>
          {i === 0 ? tr('Hoy') : i === 1 ? tr('Mañana') : d.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric' }).replace('.', '')}</button>)}</span>
        {otroDia && <span className={s.hojaOtroCampos}>
          <select value={otroHora} onChange={e => { setOtroHora(e.target.value); setOtroPorque('mano') }} aria-label={tr('Hora')}>{horas.map(h => <option key={h} value={h}>{h}</option>)}</select>
          <button className={s.botonOro} data-agendar-otro disabled={!otroFecha || !!enviando} onClick={() => otroFecha && void elegir(otroFecha, 'otro')}><Check size={14} /> {otroFecha ? tr('Agendar {cuando}', { cuando: cuandoTexto(otroFecha) }) : tr('Agendar')}</button>
        </span>}
        {otroDia && otroPorque && otroPorque !== 'mano' && <small className={s.otroPorque}>{otroPorque === 'hueco' ? tr('Es el primer hueco libre de ese día en tu calendario; cámbiala si quieres.') : tr('Ese día no tiene un hueco libre; elige la hora.')}</small>}
      </div>}
      {otroChoca && <p className={s.hojaAviso}>{tr('A esa hora ya tienes algo. Si la eliges, quedan encimados.')}</p>}
      <footer className={s.hojaPie}>
        <button data-sin-hora onClick={() => void elegir(null, 'sin')} disabled={!!enviando}>{previo ? tr('Dejarlo sin hora') : tr('Ver después, sin hora')}</button>
        {previo && <button onClick={() => { void cambiar({ accion: 'salir', video_id: video.video_id }); cerrar(); mostrarAviso(previo.evento ? tr('Fuera de tu cola. Su bloque sigue en tu calendario.') : tr('Fuera de tu cola.')) }}>{tr('Sacar de la cola')}</button>}
        <small>{conCalendario ? tr('El bloque te trae de vuelta a este video.') : ''}</small>
      </footer>
      {falla && <p className={s.avisoChico} role="alert">{tr('No quedó: {motivo}', { motivo: falla })}</p>}
    </div>
  </div>, document.body)
}

/** El aviso chico del pie: lo que acaba de pasar y, si se puede, deshacer. */
export function AvisoPie() {
  const { aviso } = useMios()
  if (!aviso || typeof document === 'undefined') return null
  return createPortal(<div className={s.avisoPie} role="status" data-error={aviso.error || undefined} key={aviso.id} data-testid="aviso-pie">
    <span>{aviso.texto}</span>
    {aviso.deshacer && <button onClick={() => { const f = aviso.deshacer!; cerrarAviso(); f() }}>{tr('Deshacer')}</button>}
    <button className={s.icono} onClick={cerrarAviso} aria-label={tr('Cerrar aviso')}><X size={13} /></button>
  </div>, document.body)
}
