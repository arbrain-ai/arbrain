'use client'
/**
 * La sala (15 nov 2026): donde se ve un video del cuartel. Pantalla a oscuras, el video al centro y a un lado lo que
 * Levy sabe de él: por qué verlo, el minuto del oro, el transcript que sigue al video y «pregúntale al video». Nada de
 * lo que YouTube pone alrededor (comentarios, «te puede interesar», scroll infinito). Para salir a YouTube hay un
 * enlace chico, a propósito.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlignLeft, ArrowUpRight, Check, Copy, Download, FileText, Headphones, Loader2, Maximize2, MessageCircleQuestion, Minimize2, Pause, Pin, Play, RotateCcw, RotateCw, Search, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { Reproductor, type ControlReproductor } from './Reproductor'
import { preguntar, traerDescripcion, traerTranscript, leerTranscript, urlArchivo, votar, type Voto } from './acciones'
import { useDescargas } from './useDescargas'
import { compacto, duracion, lineaActual, multiplicador, NOMBRE_CAPA, reloj, textoNoArranca, type MotivoNoArranca } from './modelo'
import { BotonCanal } from './piezas'
import { fechaVisible } from './pantalla'
import type { Calificacion, Oro, PasoDosis, Respuesta, Transcript, VideoCuartel } from './tipos'
import { AccionesVideo } from './VerDespues'
import { cambiar, mostrarAviso, useMios } from './useMios'
import { enCola } from './mios'
import { tr } from '@/shared/i18n'
import s from './cuartel.module.css'
import { abrirEnNavegador } from '@/lib/navegador'

export interface EnSala {
  video: VideoCuartel
  paso?: PasoDosis | null
  calificacion?: Calificacion | null
  /** «inicio» (v1.3): un voto desde el feed le enseña al orden de Inicio. */
  desde: 'dosis' | 'biblioteca' | 'radar' | 'inicio'
  /** Porqué propio de quien abre (p. ej. el de la propuesta de mentalidad). */
  porque?: string | null
  /** Para la dosis: qué decir al terminar (siguiente, o «terminaste»). */
  final?: React.ReactNode
  alTerminar?: () => void
  alVotar?: (voto: Voto) => void
}

type Panel = 'porque' | 'descripcion' | 'transcript' | 'pregunta'
type ConWebkit = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type DocWebkit = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }

export function Sala({ en, cerrar }: { en: EnSala; cerrar: () => void }) {
  const { video, paso, calificacion } = en
  const oro: Oro | null = paso?.oro ?? calificacion?.oro ?? null
  const porQue = en.porque || paso?.por_que || calificacion?.por_que_verlo || null
  const ctl = useRef<ControlReproductor>(null)
  const [panel, setPanel] = useState<Panel>(porQue || oro || calificacion?.tesis || calificacion?.saltar ? 'porque' : 'transcript')
  const [t, setT] = useState(0)
  const [verDescargado, setVerDescargado] = useState(false)
  const [voto, setVoto] = useState<Voto | null>(paso && paso.estado !== 'pendiente' ? paso.estado as Voto : null)
  const [avisoVoto, setAvisoVoto] = useState<string | null>(null)
  const descargas = useDescargas()
  const d = descargas.de(video.video_id)
  // Verlo o votarlo lo saca de «ver después» (17 nov 2026). Su bloque se queda en el calendario: borrar es del dueño.
  const { mios } = useMios()
  const enLaCola = !!enCola(mios, video.video_id)
  const salirDeCola = useCallback((porque: 'visto' | 'votado') => {
    if (!enLaCola) return
    void cambiar({ accion: 'salir', video_id: video.video_id }).then(ok => { if (ok) mostrarAviso(porque === 'visto' ? tr('Visto: sale de tu cola de ver después.') : tr('Votado: sale de tu cola de ver después.')) })
  }, [enLaCola, video.video_id])
  const inicio = oro?.verificado ? oro.inicio_s : null
  // No incrustable (lo dice el sensor o lo descubre el reproductor): se ve descargado, aquí mismo.
  const [bloqueado, setBloqueado] = useState(video.incrustable === false)
  // No arrancó en 8 s o YouTube dio error (15 nov 2026, PWA del iPhone): misma salida, descargado aquí mismo.
  const [atorado, setAtorado] = useState<{ motivo: MotivoNoArranca; detalle?: string } | null>(null)
  const [intento, setIntento] = useState(0)
  const sinIncrustado = bloqueado || !!atorado
  const local = verDescargado || (sinIncrustado && d?.estado === 'lista')
  const tiempoLocal = useRef<HTMLMediaElement | null>(null)
  const irLocal = useCallback((seg: number) => { const m = tiempoLocal.current; if (m) { m.currentTime = seg; void m.play().catch(() => {}) } setT(seg) }, [])
  // Barra propia (16 nov 2026, Daniel: «el visualizador de videos no tiene para saltar wtf quiero decir barra de video»):
  // siempre a la vista bajo el video, con la pista para saltar a cualquier punto, ±10 s, play/pausa, velocidad y el oro.
  const [sonando, setSonando] = useState(false)
  const [vel, setVel] = useState(1)
  const [dur, setDur] = useState(video.duracion_s ?? 0)
  // Pantalla completa (18 nov 2026, Daniel: «no sale completa la pantalla ni tengo un botón para ampliar al máximo»).
  // El modo cine deja solo el video y la barra propia; con Fullscreen API (escritorio y la app: wry la activa en
  // WKWebView) además ocupa toda la pantalla. Sin la API (iPhone) la sala ya es fija a todo el viewport: basta el modo.
  const raiz = useRef<HTMLDivElement>(null)
  const [cine, setCine] = useState(false)
  const cineRef = useRef(false)
  const salioHace = useRef(0)
  useEffect(() => { cineRef.current = cine }, [cine])
  const salirCine = useCallback(() => {
    setCine(false)
    const doc = document as DocWebkit
    if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {})
    else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.()
  }, [])
  const entrarCine = useCallback(() => {
    setCine(true)
    const el = raiz.current as ConWebkit | null
    try {
      if (el?.requestFullscreen) el.requestFullscreen().catch(() => {})
      else el?.webkitRequestFullscreen?.()
    } catch { /* sin API: queda el modo cine dentro de la ventana */ }
  }, [])
  const alternarCine = useCallback(() => { if (cineRef.current) salirCine(); else entrarCine() }, [entrarCine, salirCine])
  // El ancho del video, medido: lo más grande que cabe en 16:9 dejando abajo lo que va abajo (250 px con título, datos, barra
  // y botones; 78 px en pantalla completa, solo la barra). Lo usa el CSS con `--video-w` (por qué JS y no `cqh`: ver
  // cuartel.module.css). `getComputedStyle` da px CSS del propio elemento en WebKit y en Chromium, con o sin zoom.
  const columna = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = columna.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const medir = () => {
      const cs = getComputedStyle(el)
      const ancho = parseFloat(cs.width), alto = parseFloat(cs.height)
      if (!ancho || !alto) return
      const cabe = (alto - (cine ? 78 : 250)) * 16 / 9
      const w = cine ? Math.min(ancho, cabe) : Math.min(ancho, Math.max(cabe, 560))
      el.style.setProperty('--video-w', `${Math.max(0, Math.floor(w))}px`)
    }
    const ro = new ResizeObserver(medir)
    ro.observe(el); medir()
    return () => ro.disconnect()
  }, [cine])
  useEffect(() => {
    const doc = document as DocWebkit
    // Si el sistema sale de la pantalla completa (Esc, el botón verde, un gesto), el modo cine se apaga con ella.
    const cambio = () => { if (!doc.fullscreenElement && !doc.webkitFullscreenElement && cineRef.current) { salioHace.current = Date.now(); setCine(false) } }
    document.addEventListener('fullscreenchange', cambio); document.addEventListener('webkitfullscreenchange', cambio)
    return () => {
      document.removeEventListener('fullscreenchange', cambio); document.removeEventListener('webkitfullscreenchange', cambio)
      if (raiz.current && (doc.fullscreenElement === raiz.current || doc.webkitFullscreenElement === raiz.current)) {
        if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {}); else doc.webkitExitFullscreen?.()
      }
    }
  }, [])

  useEffect(() => {
    // Escape en pantalla completa solo sale de ella; la sala se cierra con el siguiente Escape. El que el sistema usó para
    // salir de la pantalla completa nativa puede llegar aquí después: en esa ventana corta tampoco cierra.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (cineRef.current || Date.now() - salioHace.current < 500) { salirCine(); return }
      cerrar()
    }
    document.addEventListener('keydown', tecla)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = previo }
  }, [cerrar, salirCine])

  const irYT = useCallback((seg: number) => { ctl.current?.ir(seg); setT(seg) }, [])
  const ir = local ? irLocal : irYT
  const alternar = useCallback(() => {
    if (local) { const m = tiempoLocal.current; if (m) { if (m.paused) void m.play().catch(() => {}); else m.pause() } return }
    if (sonando) ctl.current?.pausar(); else ctl.current?.reproducir()
  }, [local, sonando])
  const cambiarVel = useCallback((r: number) => {
    if (local) { if (tiempoLocal.current) tiempoLocal.current.playbackRate = r } else ctl.current?.velocidad(r)
    setVel(r)
  }, [local])
  useEffect(() => {
    if (dur) return
    const d = local ? tiempoLocal.current?.duration : ctl.current?.duracion()
    if (d && Number.isFinite(d)) setDur(Math.round(d))
  }, [t, dur, local])
  // Teclas de reproductor (fuera de campos de texto): espacio o k pausa, j y l saltan 10 s, flechas 5 s, f pantalla completa.
  const teclas = useRef({ alternar, ir, t, dur, alternarCine })
  useEffect(() => { teclas.current = { alternar, ir, t, dur, alternarCine } })
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.getAttribute('role') === 'slider')) return
      const { alternar: alt, ir: saltar, t: ahora, dur: total, alternarCine: cineT } = teclas.current
      const a = (seg: number) => saltar(Math.max(0, total ? Math.min(total, seg) : seg))
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); alt() }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); cineT() }
      else if (e.key === 'j') a(ahora - 10)
      else if (e.key === 'l') a(ahora + 10)
      else if (e.key === 'ArrowLeft') { e.preventDefault(); a(ahora - 5) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); a(ahora + 5) }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [])

  const emitir = async (v: Voto) => {
    setVoto(v); setAvisoVoto(null)
    try { await votar(video.video_id, v, en.desde as Parameters<typeof votar>[2]); en.alVotar?.(v); salirDeCola('votado') }
    catch (e) { setVoto(null); setAvisoVoto((e as Error).message) }
  }

  const fondo = video.miniatura_url ?? `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`
  return createPortal(<div ref={raiz} className={s.sala} role="dialog" aria-modal aria-label={video.titulo} data-testid="sala" data-cine={cine || undefined}>
    <div className={s.salaFondo} style={{ backgroundImage: `url(${fondo})` }} aria-hidden />
    <div className={s.salaCuerpo}>
      <header className={s.salaBarra}>
        <p className={s.salaCeja}><b>{NOMBRE_CAPA[video.capa] ?? video.capa}</b> · <BotonCanal id={video.channel_id} nombre={video.canal} />{video.publicado && <> · <time dateTime={video.publicado}>{fechaVisible(video.publicado)}</time></>}</p>
        <button className={s.cerrar} onClick={cerrar} aria-label="Cerrar la sala"><X size={18} /></button>
      </header>
      <div className={s.salaRejilla}>
        <section ref={columna} className={s.salaVideo}>
          {local && d?.estado === 'lista'
            ? <div className={s.pantalla}>
                {d.archivo?.endsWith('.m4a')
                  ? <div className={s.audioCaja}><Headphones size={40} /><audio ref={el => { tiempoLocal.current = el }} controls autoPlay src={urlArchivo(video.video_id)} onPlay={() => setSonando(true)} onPause={() => setSonando(false)} onTimeUpdate={e => setT(e.currentTarget.currentTime)} onLoadedMetadata={e => { if (inicio) e.currentTarget.currentTime = inicio }} onEnded={() => { descargas.ajustar(video.video_id, { vista: true }); salirDeCola('visto'); en.alTerminar?.() }} /></div>
                  : <video ref={el => { tiempoLocal.current = el }} className={s.marco} controls autoPlay playsInline src={urlArchivo(video.video_id)} onPlay={() => setSonando(true)} onPause={() => setSonando(false)} onTimeUpdate={e => setT(e.currentTarget.currentTime)} onLoadedMetadata={e => { if (inicio) e.currentTarget.currentTime = inicio }} onEnded={() => { descargas.ajustar(video.video_id, { vista: true }); salirDeCola('visto'); en.alTerminar?.() }} />}
              </div>
            : bloqueado ? <NoIncrustable video={video} />
            : atorado ? <NoIncrustable video={video} motivo={atorado} reintentar={() => { setAtorado(null); setIntento(i => i + 1) }} />
            : <Reproductor key={intento} ref={ctl} videoId={video.video_id} inicio={inicio} titulo={video.titulo} alTiempo={setT} alTerminar={() => { salirDeCola('visto'); en.alTerminar?.() }} alNoIncrustable={() => setBloqueado(true)} alNoArranca={(motivo, detalle) => setAtorado({ motivo, detalle })} alEstado={e => setSonando(e === 'sonando')} final={en.final} />}
          <h2 className={s.salaTitulo}>{video.titulo}</h2>
          <p className={s.salaDatos}>
            {video.vistas != null && <span>{compacto(video.vistas)} vistas</span>}
            {video.duracion_s ? <span>{duracion(video.duracion_s)}</span> : null}
            {video.outlier && <span className={s.dorado} title={`Esperado para su canal a esta edad: ${compacto(video.outlier.esperado)} (${video.outlier.metodo}, confianza ${video.outlier.confianza})`}>{multiplicador(video.outlier.puntaje)} sobre su canal</span>}
          </p>
          {(local || !sinIncrustado) && dur ? <BarraVideo t={t} total={dur} oro={oro} sonando={sonando} vel={vel} ir={ir} alternar={alternar} cambiarVel={cambiarVel} cine={cine} alternarCine={alternarCine} /> : null}
          <div className={s.salaAcciones}>
            <div className={s.voto} role="group" aria-label="¿Te sirvió?">
              <button data-activo={voto === 'sirvio' || undefined} onClick={() => emitir('sirvio')}><ThumbsUp size={14} /> Me sirvió</button>
              <button data-activo={voto === 'no_sirvio' || undefined} onClick={() => emitir('no_sirvio')}><ThumbsDown size={14} /> No me sirvió</button>
            </div>
            <AccionesVideo v={video} en="sala" />
            {!sinIncrustado && <BotonDescarga video={video} verDescargado={verDescargado} setVerDescargado={setVerDescargado} />}
            <a className={s.aYouTube} href={video.url ?? `https://www.youtube.com/watch?v=${video.video_id}`} target="_blank" rel="noreferrer" onClick={ev => { ev.preventDefault(); void abrirEnNavegador(video.url ?? `https://www.youtube.com/watch?v=${video.video_id}`) }}>abrir en YouTube <ArrowUpRight size={11} /></a>
          </div>
          {avisoVoto && <p className={s.avisoChico} role="alert">No se guardó tu voto: {avisoVoto}</p>}
        </section>
        <aside className={s.salaLado}>
          <nav className={s.ladoPestanas} role="tablist">
            {(porQue || oro || calificacion?.tesis || calificacion?.saltar) && <button role="tab" aria-selected={panel === 'porque'} onClick={() => setPanel('porque')}><Sparkles size={13} /> Por qué</button>}
            <button role="tab" aria-selected={panel === 'descripcion'} onClick={() => setPanel('descripcion')}><AlignLeft size={13} /> Descripción</button>
            <button role="tab" aria-selected={panel === 'transcript'} onClick={() => setPanel('transcript')}><FileText size={13} /> Transcript</button>
            <button role="tab" aria-selected={panel === 'pregunta'} onClick={() => setPanel('pregunta')}><MessageCircleQuestion size={13} /> Pregúntale</button>
          </nav>
          <div className={s.ladoCuerpo}>
            {panel === 'porque' && <PorQue paso={paso} porQue={porQue} oro={oro} calificacion={calificacion} ir={ir} />}
            {panel === 'descripcion' && <PanelDescripcion id={video.video_id} />}
            {panel === 'transcript' && <PanelTranscript video={video} t={t} ir={ir} />}
            {panel === 'pregunta' && <Preguntale video={video} ir={ir} />}
          </div>
        </aside>
      </div>
    </div>
  </div>, document.body)
}

/**
 * El creador no deja incrustarlo (p. ej. casi todos los largos de Hormozi anteriores a 2026). No se manda a youtube.com:
 * se ofrece bajarlo, solo este video y solo con su botón, para verlo aquí. Transcript y «pregúntale» siguen al lado.
 */
function NoIncrustable({ video, motivo, reintentar }: { video: VideoCuartel; motivo?: { motivo: MotivoNoArranca; detalle?: string }; reintentar?: () => void }) {
  const ds = useDescargas()
  const d = ds.de(video.video_id)
  const [error, setError] = useState<string | null>(null)
  const pedir = async (modo: 'video' | 'audio') => { setError(null); try { await ds.pedir(video.video_id, video.titulo, video.canal, modo) } catch (e) { setError((e as Error).message) } }
  const fondo = video.miniatura_url ?? `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`
  const txt = motivo ? textoNoArranca(motivo.motivo, motivo.detalle) : null
  return <div className={`${s.pantalla} ${s.noIncrustable}`} data-testid={motivo ? 'no-arranca' : 'no-incrustable'} data-motivo={motivo?.motivo}>
    <div className={s.noIncFondo} style={{ backgroundImage: `url(${fondo})` }} aria-hidden />
    <div className={s.noIncCuerpo}>
      <p className={s.noIncCeja}>{txt ? txt.ceja : 'Se ve descargado'}</p>
      <p className={s.noIncTexto}>{txt ? txt.texto : <>{video.canal || 'El creador'} no deja ver este video incrustado. Bájalo una vez y lo ves aquí, sin abrir YouTube.</>}</p>
      {d?.estado === 'bajando'
        ? <span className={s.noIncBarra}><i style={{ width: `${Math.max(4, (d.progreso ?? 0) * 100)}%` }} /><small>Bajando al Studio · {Math.round((d.progreso ?? 0) * 100)} %</small></span>
        : <div className={s.noIncBotones}>
            <button className={s.botonOro} onClick={() => pedir('video')}><Download size={14} /> Bajar video · 720p</button>
            <button className={s.botonSuave} onClick={() => pedir('audio')}><Headphones size={14} /> Solo audio</button>
            {reintentar && <button className={s.botonSuave} onClick={reintentar}><RotateCcw size={14} /> Reintentar</button>}
          </div>}
      {txt?.pista && <small className={s.noIncPista}>{txt.pista}</small>}
      {(error || d?.estado === 'error') && <small className={s.avisoChico}>{error ?? d?.error}</small>}
      <small className={s.noIncNota}>Solo este video, para ti. Se borra a los 30 días o tras verlo, salvo que lo fijes. Mientras baja: el transcript y «pregúntale» ya funcionan.</small>
    </div>
  </div>
}

/** La línea del video con el tramo del oro en dorado: se ve dónde vive lo que vale, y se salta tocándolo. */
const VELOCIDADES = [1, 1.25, 1.5, 1.75, 2]

/** La barra del video: pista para saltar a cualquier punto (clic o arrastre, con la hora bajo el cursor), el tramo del oro,
 * play/pausa, ±10 s, tiempo y velocidad. Vale igual para el incrustado y para lo descargado. */
function BarraVideo({ t, total, oro, sonando, vel, ir, alternar, cambiarVel, cine, alternarCine }: {
  t: number; total: number; oro: Oro | null; sonando: boolean; vel: number
  ir: (s: number) => void; alternar: () => void; cambiarVel: (r: number) => void
  cine: boolean; alternarCine: () => void
}) {
  const pista = useRef<HTMLDivElement>(null)
  const [arrastre, setArrastre] = useState<number | null>(null)
  const [encima, setEncima] = useState<number | null>(null)
  const frac = (x: number) => { const r = pista.current?.getBoundingClientRect(); return r && r.width ? Math.max(0, Math.min(1, (x - r.left) / r.width)) : 0 }
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / total) * 100))}%`
  const ahora = arrastre != null ? arrastre * total : Math.min(t, total)
  const finOro = oro ? oro.fin_s ?? Math.min(total, oro.inicio_s + 90) : 0
  const saltar = (seg: number) => ir(Math.max(0, Math.min(total, seg)))
  return <div className={s.barra} data-verificado={oro?.verificado || undefined} data-arrastrando={arrastre != null || undefined}>
    <div ref={pista} className={s.barraPista} role="slider" tabIndex={0} aria-label="Posición del video"
      aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(ahora)} aria-valuetext={`${reloj(ahora)} de ${reloj(total)}`}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setArrastre(frac(e.clientX)) }}
      onPointerMove={e => { const f = frac(e.clientX); setEncima(f); if (arrastre != null) setArrastre(f) }}
      onPointerUp={e => { if (arrastre != null) { saltar(frac(e.clientX) * total); setArrastre(null) } }}
      onPointerCancel={() => setArrastre(null)}
      onPointerLeave={() => setEncima(null)}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); saltar(t - 5) }
        else if (e.key === 'ArrowRight') { e.preventDefault(); saltar(t + 5) }
      }}>
      <span className={s.barraRiel} />
      {oro && <span className={s.barraOro} style={{ left: pct(oro.inicio_s), width: `calc(${pct(finOro)} - ${pct(oro.inicio_s)})` }} />}
      <span className={s.barraHecho} style={{ width: pct(ahora) }} />
      <span className={s.barraBola} style={{ left: pct(ahora) }} />
      {encima != null && <span className={s.barraGlobo} style={{ left: `${encima * 100}%` }}>{reloj(encima * total)}</span>}
    </div>
    <div className={s.barraFila}>
      <button className={s.barraBoton} onClick={alternar} aria-label={sonando ? 'Pausa' : 'Reproducir'} title={sonando ? 'Pausa (espacio)' : 'Reproducir (espacio)'}>
        {sonando ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      <button className={s.barraBoton} onClick={() => saltar(t - 10)} aria-label="Atrás 10 segundos" title="Atrás 10 s (j)"><RotateCcw size={15} /><small>10</small></button>
      <button className={s.barraBoton} onClick={() => saltar(t + 10)} aria-label="Adelante 10 segundos" title="Adelante 10 s (l)"><RotateCw size={15} /><small>10</small></button>
      <span className={s.barraTiempo}>{reloj(ahora)}<i> / {reloj(total)}</i></span>
      {oro && <button className={s.barraIrOro} onClick={() => saltar(oro.inicio_s)} disabled={!oro.verificado}>
        {oro.verificado ? <>El oro · <b>{oro.etiqueta ?? reloj(oro.inicio_s)}</b>{oro.fin_s ? <> a {reloj(oro.fin_s)}</> : null}</> : 'Oro sin verificar'}</button>}
      <button className={s.barraVel} onClick={() => cambiarVel(VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length])} aria-label={`Velocidad ${vel}x`} title="Velocidad">{vel}×</button>
      <button className={s.barraBoton} onClick={alternarCine} data-testid="sala-pantalla-completa" aria-pressed={cine}
        aria-label={cine ? 'Salir de pantalla completa' : 'Pantalla completa'} title={cine ? 'Salir de pantalla completa (f o Esc)' : 'Pantalla completa (f)'}>
        {cine ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
    </div>
  </div>
}

function PorQue({ paso, porQue, oro, calificacion, ir }: { paso?: PasoDosis | null; porQue: string | null; oro: Oro | null; calificacion?: Calificacion | null; ir: (s: number) => void }) {
  return <div className={s.porQue}>
    {porQue && <p className={s.porQueTexto}>{porQue}</p>}
    {oro && <button className={s.oroTarjeta} onClick={() => ir(oro.inicio_s)} disabled={!oro.verificado}>
      <span className={s.oroMinuto}>{oro.verificado ? oro.etiqueta ?? reloj(oro.inicio_s) : '—'}</span>
      <span>{oro.cita ? <q>{oro.cita}</q> : null}{oro.que_hay && <small>{oro.que_hay}</small>}{!oro.verificado && <small>Levy no encontró la cita en el transcript; no prometo el minuto.</small>}</span>
    </button>}
    {paso?.accion && <p className={s.accion}><span>{paso.se_vuelve ? `Se vuelve ${paso.se_vuelve}` : 'Acción'}</span>{paso.accion}</p>}
    {calificacion?.saltar && <p className={s.tesis}><span>Levy: sáltalo</span>{calificacion.saltar}</p>}
    {calificacion?.tesis && <p className={s.tesis}><span>La tesis</span>{calificacion.tesis}</p>}
    {!!paso?.ya_lo_tienes?.length && <div className={s.yaLoTienes}><span>Ya lo tienes en</span>{paso.ya_lo_tienes.slice(0, 3).map(y => <small key={y.titulo}>{y.titulo}{y.corpus ? ` · ${y.corpus}` : ''}</small>)}</div>}
  </div>
}

function PanelTranscript({ video, t, ir }: { video: VideoCuartel; t: number; ir: (s: number) => void }) {
  const [tr, setTr] = useState<Transcript | null>(null)
  const [estado, setEstado] = useState<'leyendo' | 'falta' | 'trayendo' | 'listo' | 'error'>('leyendo')
  const [error, setError] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [seguir, setSeguir] = useState(true)
  const [copiado, setCopiado] = useState(false)
  const lista = useRef<HTMLOListElement>(null)
  useEffect(() => {
    let vivo = true
    leerTranscript(video.video_id).then(x => { if (vivo) { setTr(x); setEstado('listo') } }).catch(() => { if (vivo) setEstado('falta') })
    return () => { vivo = false }
  }, [video.video_id])
  const traer = async () => {
    setEstado('trayendo'); setError(null)
    try { setTr(await traerTranscript(video.video_id)); setEstado('listo') } catch (e) { setEstado('error'); setError((e as Error).message) }
  }
  const actual = tr ? lineaActual(tr.lineas, t) : -1
  const filtradas = useMemo(() => {
    if (!tr) return []
    const q = buscar.trim().toLowerCase()
    return tr.lineas.map((l, i) => ({ ...l, i })).filter(l => !q || l.texto.toLowerCase().includes(q))
  }, [tr, buscar])
  useEffect(() => {
    if (!seguir || buscar || actual < 0) return
    const el = lista.current?.querySelector<HTMLElement>(`[data-i="${actual}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [actual, seguir, buscar])
  const copiar = async () => {
    if (!tr) return
    await navigator.clipboard.writeText(`${tr.titulo ?? video.titulo}\n${video.url ?? ''}\n\n` + tr.lineas.map(l => `[${reloj(l.s)}] ${l.texto}`).join('\n'))
    setCopiado(true); setTimeout(() => setCopiado(false), 1600)
  }
  if (estado === 'leyendo') return <p className={s.ladoVacio}><Loader2 size={14} className={s.gira} /> Buscando el transcript…</p>
  if (estado === 'falta' || estado === 'trayendo' || estado === 'error') return <div className={s.ladoVacio}>
    <p>{estado === 'error' ? error : 'Aún no tengo el transcript de este video.'}</p>
    <button className={s.botonOro} onClick={traer} disabled={estado === 'trayendo'}>{estado === 'trayendo' ? <><Loader2 size={14} className={s.gira} /> Trayéndolo de YouTube…</> : <><FileText size={14} /> Traer transcript</>}</button>
  </div>
  return <div className={s.transcript}>
    <div className={s.transcriptBarra}>
      <label className={s.buscador}><Search size={13} /><input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar en lo que dice…" aria-label="Buscar en el transcript" /></label>
      <button onClick={copiar} title="Copiar el transcript completo con sus minutos" aria-label="Copiar transcript">{copiado ? <Check size={14} /> : <Copy size={14} />}</button>
    </div>
    <ol ref={lista} className={s.lineas} onWheel={() => setSeguir(false)} onTouchMove={() => setSeguir(false)}>
      {filtradas.map(l => <li key={l.i} data-i={l.i} data-actual={l.i === actual || undefined}>
        <button onClick={() => { ir(l.s); setSeguir(true) }}><time>{reloj(l.s)}</time><span>{l.texto}</span></button>
      </li>)}
    </ol>
    {!seguir && !buscar && <button className={s.volverAhora} onClick={() => setSeguir(true)}>Seguir al video</button>}
  </div>
}

function Preguntale({ video, ir }: { video: VideoCuartel; ir: (s: number) => void }) {
  const [hilo, setHilo] = useState<{ pregunta: string; r?: Respuesta; error?: string }[]>([])
  const [q, setQ] = useState('')
  const [pensando, setPensando] = useState(false)
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const pregunta = q.trim()
    if (!pregunta || pensando) return
    setQ(''); setPensando(true)
    setHilo(h => [...h, { pregunta }])
    const historial = hilo.filter(x => x.r).map(x => ({ pregunta: x.pregunta, respuesta: x.r!.respuesta }))
    try { const r = await preguntar(video.video_id, pregunta, historial); setHilo(h => h.map((x, i) => i === h.length - 1 ? { ...x, r } : x)) }
    catch (err) { setHilo(h => h.map((x, i) => i === h.length - 1 ? { ...x, error: (err as Error).message } : x)) }
    setPensando(false)
  }
  return <div className={s.pregunta}>
    {!hilo.length && <p className={s.ladoVacio}>Levy contesta con lo que dice ESTE video, citando el minuto. Prueba: «¿qué hace exactamente en el minuto del oro?» o «¿cómo aplico esto a mi oferta?»</p>}
    <ol className={s.hiloPregunta}>
      {hilo.map((x, i) => <li key={i}>
        <p className={s.tuPregunta}>{x.pregunta}</p>
        {x.r ? <div className={s.respuesta}>
          <p>{x.r.respuesta}</p>
          {!!x.r.citas?.length && <div className={s.citas}>{x.r.citas.map((c, k) => <button key={k} onClick={() => ir(c.t_s)} disabled={c.verificada === false} title={c.cita ?? undefined}><time>{c.etiqueta ?? reloj(c.t_s)}</time>{c.cita && <span>{c.cita}</span>}</button>)}</div>}
        </div> : x.error ? <p className={s.avisoChico}>{x.error}</p> : <p className={s.pensando}><Loader2 size={13} className={s.gira} /> Levy está leyendo el video…</p>}
      </li>)}
    </ol>
    <form className={s.preguntaForm} onSubmit={enviar}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pregúntale al video…" aria-label="Pregúntale al video" disabled={pensando} />
      <button type="submit" disabled={!q.trim() || pensando} aria-label="Preguntar"><ArrowUpRight size={15} /></button>
    </form>
  </div>
}

function BotonDescarga({ video, verDescargado, setVerDescargado }: { video: VideoCuartel; verDescargado: boolean; setVerDescargado: (v: boolean) => void }) {
  const ds = useDescargas()
  const d = ds.de(video.video_id)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pedir = async (modo: 'video' | 'audio') => { setAbierto(false); setError(null); try { await ds.pedir(video.video_id, video.titulo, video.canal, modo) } catch (e) { setError((e as Error).message) } }
  if (d?.estado === 'bajando') return <span className={s.descarga} data-estado="bajando"><Loader2 size={13} className={s.gira} /> Bajando {Math.round((d.progreso ?? 0) * 100)} %<i style={{ width: `${(d.progreso ?? 0) * 100}%` }} /></span>
  if (d?.estado === 'lista') return <span className={s.descarga} data-estado="lista">
    <button onClick={() => setVerDescargado(!verDescargado)}>{verDescargado ? 'Ver en YouTube' : 'Ver descargado'}</button>
    <a href={urlArchivo(video.video_id, true)} title="Guardar en este dispositivo (para verlo sin red)"><Download size={13} /></a>
    <button onClick={() => ds.ajustar(video.video_id, { fijada: !d.fijada })} data-activo={d.fijada || undefined} title={d.fijada ? 'Fijado: no se borra solo' : 'Fijar: que no se borre a los 30 días ni al verlo'}><Pin size={13} /></button>
  </span>
  return <span className={s.descargaGrupo}>
    <button className={s.descarga} onClick={() => setAbierto(!abierto)} aria-expanded={abierto}><Download size={13} /> Descargar</button>
    {abierto && <span className={s.descargaMenu}>
      <button onClick={() => pedir('video')}>Video · 720p</button>
      <button onClick={() => pedir('audio')}><Headphones size={12} /> Solo audio (gym)</button>
    </span>}
    {(error || d?.estado === 'error') && <small className={s.avisoChico}>{error ?? d?.error}</small>}
  </span>
}

/**
 * La descripción del video tal cual la publicó el canal (20 nov 2026): ahí viven los enlaces de su embudo (regalo, comunidad,
 * llamada). Los enlaces se abren en el navegador del sistema; el resto es texto plano con sus saltos de línea.
 */
function PanelDescripcion({ id }: { id: string }) {
  const [d, setD] = useState<{ texto?: string; error?: string } | null>(null)
  useEffect(() => { let vivo = true; setD(null)
    traerDescripcion(id).then(r => vivo && setD({ texto: r.descripcion })).catch(e => vivo && setD({ error: e instanceof Error ? e.message : String(e) }))
    return () => { vivo = false } }, [id])
  if (!d) return <p className={s.avisoChico}><Loader2 size={13} className={s.gira} /> Trayendo la descripción…</p>
  if (d.error) return <p className={s.avisoChico} role="alert">No pude traer la descripción: {d.error}</p>
  if (!d.texto?.trim()) return <p className={s.avisoChico}>Este video no tiene descripción.</p>
  const partes = d.texto.split(/(https?:\/\/[^\s)]+)/g)
  return <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55, overflowWrap: 'anywhere' }}>
    {partes.map((p, i) => /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: '#9cc7ff' }} onClick={ev => { ev.preventDefault(); void abrirEnNavegador(p) }}>{p}</a>
      : <span key={i}>{p}</span>)}
  </div>
}
