'use client'
/**
 * Inicio (antes «Aprender»; v2 + adenda del 15 nov 2026): cara de YouTube, pero con final y hacia la meta. El dueño:
 * «tipo algo estilo youtube pero que nos acerque a la meta… que luzca como yt… espacios optimizados aun incluso desde el
 * móvil» y «tenemos demasiado de mentalidad pero no de mi nicho».
 *  1. La dosis del día, compacta: de 3 a 5 videos con su fecha a la vista, por qué verlo y el tramo del oro en su botón.
 *  2. Lo nuevo de tu universo: cuadrícula densa de miniaturas (4 columnas en escritorio, 2 en teléfono), cada tarjeta
 *     con canal, fecha y una línea de por qué te sirve; ordenada hacia la meta (nicho, frescura, outlier), nunca por
 *     tiempo visto. Se filtra con la barra única de arriba (19 nov 2026), la misma del Radar; ya no hay chips ni buscador propios.
 *  3. Tres reglas contra la tragamonedas: tiene final («terminaste» / «estás al día»), no hay scroll infinito (12 y
 *     «ver más» con tope) y nada se reproduce solo. Aprende de «me sirvió», no de cuánto viste.
 *  4. Mentalidad: una fila chica y ya armada para el gym. Nada que palomear; el resto queda tras «más».
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Download, Dumbbell, Headphones, Pin, Play, RotateCcw, SkipForward, Target, Trash2, X } from 'lucide-react'
import { useReading } from '@/features/clarity/useReading'
import { BotonCanal, Fecha, Miniatura, Multiplicador, SelloDescarga, TarjetaVideo, Vacio } from './piezas'
import { compacto, duracion, edad, reloj } from './modelo'
import { edadDias, feedInicio, multTexto, tramoOro, type VideoInicio } from './pantalla'
import { feedFiltrado, type Criterio } from './filtro'
import { useDescargas } from './useDescargas'
import { urlArchivo, type Voto } from './acciones'
import type { Dosis, LecturaCuartel, LecturaMentalidad, PasoDosis, VideoCuartel, VideoMentalidad } from './tipos'
import type { EnSala } from './Sala'
import { AccionesVideo, EstadoMio } from './VerDespues'
import { PorCuandoToca } from './MisVideos'
import s from './cuartel.module.css'

const FECHA = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function Aprender({ lectura, abrir, releer, irCola, criterio }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void; releer: () => void; irCola?: () => void; criterio: Criterio }) {
  const dosis = lectura.dosis
  const [votos, setVotos] = useState<Record<string, Voto | undefined>>({})
  const estadoDe = (p: PasoDosis): string => votos[p.video_id] ?? p.estado
  const hechos = dosis ? dosis.videos.filter(p => estadoDe(p) !== 'pendiente').length : 0
  const terminaste = !!dosis && hechos === dosis.videos.length

  const abrirPaso = (i: number) => {
    if (!dosis) return
    const paso = dosis.videos[i]
    if (!paso.video) return
    const siguiente = dosis.videos.findIndex((p, k) => k !== i && estadoDe(p) === 'pendiente' && p.video)
    const votar = (v: Voto) => { setVotos(m => ({ ...m, [paso.video_id]: v })); if (dosis.fuente === 'cerebro') setTimeout(releer, 800) }
    abrir({
      video: paso.video, paso, desde: 'dosis', alVotar: votar,
      final: siguiente >= 0
        ? <div className={s.finDosis}><p className={s.finTexto}>Listo este. ¿Te sirvió? Vótalo abajo.</p>
            <button className={s.botonOro} onClick={() => abrirPaso(siguiente)}><SkipForward size={14} /> Siguiente de tu dosis</button></div>
        : <div className={s.finDosis}><p className={s.finGrande}>Terminaste.</p><p className={s.finTexto}>Era todo por hoy. Lo demás puede esperar.</p></div>,
    })
  }

  return <div className={s.pestana}>
    {dosis ? <DosisVista dosis={dosis} estadoDe={estadoDe} hechos={hechos} terminaste={terminaste} abrirPaso={abrirPaso} />
      : <section className={s.dosis} data-testid="dosis"><header className={s.dosisCabeza}><h2><b>Dosis de hoy</b></h2>
          <p>Aún no hay dosis: Levy la arma cuando el sensor trae videos nuevos con transcript. Abajo ya está lo nuevo de tu universo.</p></header></section>}
    {/* Lo nuevo y, a su lado, lo que te toca ver por hora (17 nov 2026): en pantalla ancha una columna; angosta, encima. */}
    <div className={s.inicioConCola}>
      <PorCuandoToca lectura={lectura} abrir={abrir} irCola={irCola} />
      <LoNuevo lectura={lectura} abrir={abrir} releer={releer} criterio={criterio} />
    </div>
    <Mentalidad abrir={abrir} lectura={lectura} />
  </div>
}

function DosisVista({ dosis, estadoDe, hechos, terminaste, abrirPaso }: { dosis: Dosis; estadoDe: (p: PasoDosis) => string; hechos: number; terminaste: boolean; abrirPaso: (i: number) => void }) {
  const n = dosis.videos.length
  const oro = dosis.minutos_oro ?? Math.round(dosis.videos.reduce((a, p) => a + (p.oro?.verificado ? ((p.oro.fin_s ?? p.oro.inicio_s + 90) - p.oro.inicio_s) : 0), 0) / 60)
  return <section className={s.dosis} data-terminaste={terminaste || undefined} data-testid="dosis">
    <header className={s.dosisCabeza}>
      <h2><b>Dosis de hoy</b> · {dosis.fecha ? FECHA(dosis.fecha) : 'hoy'}</h2>
      {terminaste ? <p className={s.dosisFin}><Check size={14} /> Terminaste. Lo demás puede esperar.</p>
        : <p>{n} videos hacia tu meta{oro > 0 ? <> · <em>{oro} min de oro</em></> : null}</p>}
      {dosis.fuente === 'provisional' && <span className={s.sello} title="Levy aún no arma la dosis de hoy: van los outliers más fuertes de la semana, sin minuto del oro.">provisional</span>}
      <span className={s.dosisAvance} aria-label={`${hechos} de ${n} vistos`}><b>{hechos}</b> de {n}</span>
    </header>
    {/* El hilo de la dosis: se llena con cada video votado. */}
    <span className={s.hiloPista} style={{ ['--avance' as string]: n ? hechos / n : 0 }} aria-hidden><i /></span>
    {dosis.nota && <p className={s.dosisNota}>{dosis.nota}</p>}
    <ol className={s.estaciones} style={{ ['--n' as string]: n }}>
      {dosis.videos.map((p, i) => <Estacion key={p.video_id} paso={p} i={i} estado={estadoDe(p)} abrir={() => abrirPaso(i)} />)}
    </ol>
  </section>
}

function Estacion({ paso, i, estado, abrir }: { paso: PasoDosis; i: number; estado: string; abrir: () => void }) {
  const v = paso.video
  const total = v?.duracion_s ?? 0
  const oro = paso.oro
  const publicado = paso.publicado ?? v?.publicado ?? null
  const fresc = paso.frescura ?? (publicado ? (edadDias(publicado) <= 7 ? 'nuevo' : edadDias(publicado) <= 28 ? 'reciente' : 'viejo') : null)
  return <li className={`${s.estacion} mov-entra`} style={{ ['--i' as string]: i }} data-estado={estado} data-frescura={fresc ?? undefined}>
    <div className={s.miniCaja}><button className={s.estacionMini} onClick={abrir} disabled={!v} aria-label={v ? `Ver: ${v.titulo}` : 'Sin video'}>
      {v && <Miniatura video={v} grande />}
      <span className={s.estacionVelo} />
      <span className={s.nodo} aria-hidden>{estado === 'pendiente' ? i + 1 : estado === 'no_sirvio' ? <X size={12} /> : estado === 'saltado' ? <SkipForward size={11} /> : <Check size={12} />}</span>
      <span className={s.estacionPlay}><Play size={18} fill="currentColor" /></span>
      {v && (v.outlier?.puntaje ?? 0) >= 2 && <span className={s.estacionMult}><Multiplicador v={v} /></span>}
      {total ? <small className={s.estacionDur}>{duracion(total)}</small> : null}
    </button></div>
    <div className={s.estacionTexto}>
      <small className={`${s.estacionMeta} ${s.metaCanal}`}>
        {v ? <BotonCanal id={v.channel_id} nombre={v.canal} /> : null}
        <span>{publicado ? <Fecha iso={publicado} /> : paso.fecha_txt ?? null}
          {fresc === 'nuevo' && <span className={s.selloNuevo}>nuevo</span>}
          {paso.relleno && <span className={s.selloDescarga} title="No pasó el piso de Levy: entró para completar la dosis">relleno</span>}
          {v && <SelloDescarga v={v} />}</span>
      {v && <AccionesVideo v={v} en="meta" />}</small>
      <button className={s.estacionTitulo} onClick={abrir} disabled={!v}>{v?.titulo ?? 'Video sin datos del sensor'}</button>
      {v && <EstadoMio v={v} />}
      {paso.por_que_viejo && <small className={s.porQueViejo}>{paso.por_que_viejo}</small>}
      <q className={s.estacionPorQue} title={paso.por_que}>{paso.por_que}</q>
      {total > 0 && oro && <button className={s.miniLinea} onClick={abrir} data-verificado={oro.verificado || undefined} title={oro.verificado ? `Abrir en el oro: ${oro.etiqueta ?? reloj(oro.inicio_s)}` : 'Oro sin verificar'}>
        <i style={{ left: `${(oro.inicio_s / total) * 100}%`, width: `${Math.max(1.5, (((oro.fin_s ?? oro.inicio_s + 90) - oro.inicio_s) / total) * 100)}%` }} />
        <small>{oro.verificado ? <><Play size={9} fill="currentColor" /> Ver el oro · <b>{tramoOro(oro)}</b></> : 'oro sin verificar'}</small>
      </button>}
    </div>
  </li>
}

/**
 * Lo nuevo de tu universo: el «inicio» de YouTube, pero suyo. Ordenado hacia la meta (lo arma PULSO en `lectura.inicio`;
 * si aún no llega, se arma aquí con su nicho, la frescura y cuánto rinde cada video). Cada tarjeta dice canal, fecha y
 * una línea de por qué le sirve. Con final: 12, un «ver más» hasta 24 y después el cierre («eso es todo» / «estás al día»).
 */
const PAGINA = 12, TOPE = 24

function LoNuevo({ lectura, abrir, releer, criterio }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void; releer: () => void; criterio: Criterio }) {
  const [n, setN] = useState(PAGINA)
  // Sin fichas, lo de hoy: el feed de PULSO tal cual. Con fichas (la barra de arriba, 19 nov 2026), lo que pasa el filtro.
  const filtrado = !criterio.deHoy
  useEffect(() => { setN(PAGINA) }, [criterio.clave])
  const feed = useMemo(() => {
    const base = feedInicio(lectura, { n: TOPE })
    if (!filtrado) return base
    const videos: VideoInicio[] = feedFiltrado([...lectura.videos, ...lectura.outliers], criterio, { n: TOPE }).map(v => ({ ...v, por_que: '', por_que_fuente: null }))
    return { ...base, videos, alDia: false, mensaje: null }
  }, [lectura, criterio, filtrado])
  const q = filtrado
  const lista = feed.videos
  // Votar desde Inicio enseña al feed («me sirvió / no me sirvió», nunca tiempo visto): al releer, lo votado sale de la lista.
  const ver = (v: VideoCuartel) => abrir({ video: v, desde: 'inicio', calificacion: lectura.ranking[v.video_id], porque: (v as VideoInicio).por_que || undefined, alVotar: () => setTimeout(releer, 800) })
  const resto = lista.length - n
  // El final: lo escribe PULSO («Eso es todo lo nuevo de tu nicho… El siguiente pulso es a las 16:37»); si no, se dice aquí.
  const cierre = feed.mensaje ?? <>Eso es todo lo nuevo de tu nicho. {feed.pulso ? <>Último pulso {edad(feed.pulso)}; lo nuevo llega solo.</> : 'Lo nuevo llega solo.'} Lo demás puede esperar.</>
  const titulo = filtrado ? 'Lo que pasa tu filtro' : lectura.inicio?.nuevo?.titulo?.trim() || 'Lo nuevo de tu universo'
  return <section className={s.bloque} data-testid="inicio" data-fuente={feed.fuente}>
    <header className={s.bloqueCabeza}>
      <h3><Target size={14} /> {titulo}{lista.length > 0 && <b className={s.cuenta}>{lista.length === TOPE && filtrado ? `${TOPE}+` : lista.length}</b>}</h3>
      <small>{criterio.textos.length ? 'Buscando en todo lo que el cuartel conoce, lo más reciente primero.' : <>Ordenado hacia tu meta, no por lo que engancha. <b>×N</b> = veces sobre lo normal de su canal.</>}</small>
    </header>
    {feed.alDia && !q ? <p className={s.alDia} data-testid="al-dia" data-al-dia><Check size={14} /> <span><b>Estás al día.</b> {cierre}</span></p>
      : lista.length ? <>
        <div className={s.rejillaYT}>{lista.slice(0, n).map((v, i) => <TarjetaVideo key={v.video_id} v={v} i={i} abrir={ver}
          extra={v.recien ? <span className={s.selloNuevo}>nuevo</span> : null}
          // 19 nov 2026 (09:24, el dueño): en lugar de la línea «Levy · …», las vistas del video y su ×N contra lo normal
          // de su canal (el mismo multiplicador del cuartel). Con menos de 3 días el ×N aún se mide y se dice.
          pie={<VistasYMult v={v} />} />)}</div>
        {/* El final siempre a la vista: «hasta aquí» con un «ver más» con tope, o el cierre. Nunca scroll infinito. */}
        {resto > 0
          ? <p className={s.alDia} data-testid="al-dia" data-quedan={resto}><Check size={14} /> <span><b>Hasta aquí lo que más te acerca.</b>{' '}
              <button className={s.enlace} onClick={() => setN(Math.min(TOPE, n + PAGINA))}>Ver {Math.min(PAGINA, resto)} más</button> <small>(quedan {resto}, con menos peso{feed.siguiente ? <>; siguiente pulso {feed.siguiente}</> : feed.pulso ? <>; último pulso {edad(feed.pulso)}</> : null})</small></span></p>
          : !q && <p className={s.alDia} data-testid="al-dia"><Check size={14} /> <span><b>{feed.mensaje ? 'Fin.' : 'Estás al día.'}</b> {cierre}</span></p>}
      </> : q ? <Vacio>Nada con este filtro en tu cuartel. Prueba una ventana más larga o quita una ficha.</Vacio> : <p className={s.alDia} data-testid="al-dia"><Check size={14} /> <span><b>Estás al día.</b> {cierre}</span></p>}
  </section>
}

/** «890 K vistas · ×9.3 sobre lo normal de su canal»: lo que pidió ver en cada tarjeta de Inicio. */
function VistasYMult({ v }: { v: VideoInicio }) {
  const p = v.outlier?.puntaje
  return <span className={s.contra} data-testid="vistas-mult">
    {v.vistas != null ? <><b>{compacto(v.vistas)}</b> vistas</> : 'sin vistas aún'}
    {' · '}{p != null && Number.isFinite(p) ? <span title={`Esperaba ${compacto(v.outlier!.esperado)} vistas a esta edad${v.outlier!.confianza === 'baja' ? '; canal con poca historia' : ''}`}><b>{multTexto(p)}</b> sobre lo normal de su canal</span>
      : <span title="Con menos de 3 días su multiplicador todavía se está midiendo">{v.outlier_txt && v.outlier_txt.includes('×') ? v.outlier_txt : 'su ×N aún se mide'}</span>}
  </span>
}

/**
 * Mentalidad (v2): estante chico y ya armado (el núcleo que eligió Levy), para el gym y la constancia. No alimenta la
 * dosis ni el radar. No se palomea nada: el resto vive tras «más». Para llevarlo: en el video, Descargar → solo audio.
 * Lo descargado se lista aquí mismo, solo si hay algo.
 */
function Mentalidad({ abrir, lectura }: { abrir: (e: EnSala) => void; lectura: LecturaCuartel }) {
  const { data, error } = useReading<LecturaMentalidad>('/api/contenido/mentalidad')
  const [mas, setMas] = useState(false)
  const vivos = useMemo(() => (data?.videos ?? []).filter(v => v.aprobado !== false), [data])
  const nucleo = useMemo(() => data?.nucleo ?? (vivos.some(v => v.nucleo || v.aprobado === true) ? vivos.filter(v => v.nucleo || v.aprobado === true) : vivos.slice(0, 12)), [data, vivos])
  const resto = useMemo(() => { const ids = new Set(nucleo.map(v => v.video_id)); return data?.mas ?? vivos.filter(v => !ids.has(v.video_id)) }, [data, vivos, nucleo])
  const mostrados = mas ? [...nucleo, ...resto] : nucleo
  return <section className={s.bloque} data-testid="mentalidad">
    <header className={s.bloqueCabeza}><h3><Dumbbell size={14} /> Mentalidad · para el gym</h3>
      <small>{nucleo.length ? `${nucleo.length} listos. Para llevarte uno: ábrelo → Descargar → solo audio.` : 'Tu estante para el gym y la constancia.'}</small>
      {resto.length > 0 && <button className={s.enlace} onClick={() => setMas(!mas)} aria-expanded={mas}>{mas ? 'Solo el estante' : `Más (${resto.length})`}</button>}
    </header>
    {error && !data ? <Vacio>No pude leer tu estante: {error}</Vacio>
      : !data ? <Vacio>Leyendo tu estante…</Vacio>
      : !mostrados.length ? <Vacio>Aún no hay estante de mentalidad en esta máquina.</Vacio>
      : <div className={s.carrilChico} data-todo={mas || undefined}>{mostrados.map((v, i) => <CartaChica key={v.video_id} v={v} i={i} abrir={() => abrir({ video: v, desde: 'biblioteca', porque: v.porque })} />)}</div>}
    <Descargados lectura={lectura} abrir={abrir} />
  </section>
}

function CartaChica({ v, i, abrir }: { v: VideoMentalidad; i: number; abrir: () => void }) {
  return <article className={`${s.cartaChica} mov-entra`} style={{ ['--i' as string]: Math.min(i, 10) }} title={v.porque ?? undefined}>
    <div className={s.miniCaja}><button className={s.cartaMini} onClick={abrir} aria-label={`Ver: ${v.titulo}`}><Miniatura video={v} /><span className={s.filaPlay}><Play size={14} fill="currentColor" /></span>{v.duracion_s ? <small>{duracion(v.duracion_s)}</small> : null}</button></div>
    <strong>{v.titulo}</strong>
    <small className={s.metaCanal}><span>{v.canal} <SelloDescarga v={v} /></span><AccionesVideo v={v} en="meta" /></small>
    <EstadoMio v={v} />
  </article>
}

export function Descargados({ lectura, abrir }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void }) {
  const ds = useDescargas()
  const porId = useMemo(() => new Map([...lectura.videos, ...lectura.outliers].map(v => [v.video_id, v])), [lectura])
  if (!ds.lista.length) return null
  return <div className={s.descargados} data-testid="descargas">
    <p className={s.descargadosTitulo}><Download size={12} /> Descargados · {ds.lista.length} en el Studio, se ven desde el teléfono. Se borran a los 30 días o al verlos, salvo lo fijado.</p>
    <ul className={s.listaDescargas}>
      {ds.lista.map(d => {
        const v: VideoCuartel = porId.get(d.video_id) ?? { video_id: d.video_id, channel_id: '', canal: d.canal ?? '', capa: 'descubierto', titulo: d.titulo, publicado: d.pedida }
        const dias = d.expira ? Math.max(0, Math.ceil((Date.parse(d.expira) - Date.now()) / 864e5)) : null
        return <li key={d.video_id} data-estado={d.estado}>
          <button className={s.descargaMini} onClick={() => abrir({ video: v, desde: 'biblioteca' })} aria-label={`Ver: ${d.titulo}`}><Miniatura video={v} />{d.archivo?.endsWith('.m4a') && <span className={s.marcaAudio}><Headphones size={12} /></span>}</button>
          <span className={s.filaTexto}><strong>{d.titulo}</strong>
            <small>{d.estado === 'bajando' ? `Bajando ${Math.round((d.progreso ?? 0) * 100)} %` : d.estado === 'error' ? 'No se pudo bajar' : d.fijada ? 'Fijado' : d.vista ? 'Visto · se borra pronto' : dias != null ? `Se borra en ${dias} días` : ''}{d.bytes ? ` · ${(d.bytes / 1e6).toFixed(0)} MB` : ''}</small></span>
          {d.estado === 'lista' && <>
            <a className={s.icono} href={urlArchivo(d.video_id, true)} title="Guardar en este dispositivo para verlo sin red" aria-label="Guardar en el dispositivo"><Download size={14} /></a>
            <button className={s.icono} onClick={() => ds.ajustar(d.video_id, { fijada: !d.fijada })} data-activo={d.fijada || undefined} aria-label={d.fijada ? 'Quitar fijado' : 'Fijar'}><Pin size={14} /></button>
          </>}
          {d.estado === 'error' && <button className={s.icono} title={`Reintentar${d.error ? ` (${d.error})` : ''}`} aria-label="Reintentar la descarga" onClick={() => void ds.pedir(d.video_id, d.titulo, d.canal, d.archivo?.endsWith('.m4a') ? 'audio' : 'video')}><RotateCcw size={14} /></button>}
          <button className={s.icono} onClick={() => ds.ajustar(d.video_id, { borrar: true })} aria-label="Borrar descarga"><Trash2 size={14} /></button>
        </li>
      })}
    </ul>
  </div>
}
