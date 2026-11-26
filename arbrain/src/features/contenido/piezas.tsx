'use client'
/**
 * Piezas comunes del cuartel: la miniatura (con su respaldo de i.ytimg), el multiplicador, la fila y la tarjeta de video.
 * v2 (15 nov 2026): cada video dice su fecha y el nombre del canal es un botón que abre su ficha DENTRO de Arbrain
 * («un botón que me lleve al canal de la persona»). Por eso fila y tarjeta ya no son un solo botón gigante.
 */
import { createContext, useContext, useState } from 'react'
import { Play } from 'lucide-react'
import { compacto, duracion, edad, outlierReal } from './modelo'
import { fechaCorta, multTexto } from './pantalla'
import type { VideoCuartel } from './tipos'
import { AccionesVideo, EstadoMio } from './VerDespues'
import s from './cuartel.module.css'

/** Lo que cualquier pieza puede pedirle al cuartel: abrir la ficha de un canal. */
export const CuartelCtx = createContext<{ irCanal: (channelId: string) => void; avatar: (channelId: string) => string | null }>({ irCanal: () => {}, avatar: () => null })
export const useCuartel = () => useContext(CuartelCtx)

type PropsMiniatura = { video: Pick<VideoCuartel, 'video_id' | 'miniatura_url' | 'titulo'>; className?: string; grande?: boolean }

/**
 * La llave por video reinicia el estado de la imagen cuando la misma pieza pasa a otro video (16 nov 2026, Daniel:
 * «mira esta falla con las miniaturas aca wtf»): el globo de la gráfica del Radar reusa la pieza al pasar de punto en
 * punto y, como `src` vive en un useState, se quedaba con la miniatura del primer video que tocó.
 */
export function Miniatura(props: PropsMiniatura) {
  return <MiniaturaImg key={`${props.video.video_id}|${props.video.miniatura_url ?? ''}|${props.grande ? 'g' : ''}`} {...props} />
}

function MiniaturaImg({ video, className, grande }: PropsMiniatura) {
  const respaldo = `https://i.ytimg.com/vi/${video.video_id}/${grande ? 'maxresdefault' : 'hqdefault'}.jpg`
  const segundo = `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`
  const [src, setSrc] = useState(video.miniatura_url || respaldo)
  // YouTube contesta con una imagen gris de 120×90 (y 404) cuando la miniatura grande aún no existe: un video de hace
  // horas. Eso no dispara `onError`, así que se detecta por tamaño y se cae a la mediana, que siempre existe.
  return <img className={`${s.mini} ${className ?? ''}`} src={src} alt="" loading="lazy" decoding="async"
    onLoad={e => { if (e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth <= 120 && src !== segundo) setSrc(segundo) }}
    onError={() => setSrc(src === segundo ? '' : segundo)} data-sin={!src || undefined} />
}

export function Multiplicador({ v, grande }: { v: VideoCuartel; grande?: boolean }) {
  if (!v.outlier) return null
  // Sobre la miniatura el sello es para lo que destaca: un video por debajo de ×2 no lo lleva.
  if (grande && !(v.outlier.puntaje >= 2)) return null
  const real = outlierReal(v.outlier)
  return <span className={grande ? s.multGrande : s.mult} data-real={real || undefined} data-confianza={v.outlier.confianza}
    title={`Rinde ${multTexto(v.outlier.puntaje)} sobre lo normal de su canal: ${compacto(v.vistas)} vistas contra ${compacto(v.outlier.esperado)} esperadas a esta edad${v.outlier.confianza === 'baja' ? '. Canal con poca historia: tómalo con pinzas' : ''}`}>
    {multTexto(v.outlier.puntaje)}
  </span>
}

/** «Ir al canal»: el nombre del canal como botón. Abre su ficha dentro de Arbrain (youtube.com está cerrado en foco). */
export function BotonCanal({ id, nombre, className }: { id?: string | null; nombre: string; className?: string }) {
  const { irCanal, avatar } = useCuartel()
  if (!id || !id.startsWith('UC')) return <span className={className}>{nombre}</span>
  const foto = avatar(id)
  return <button type="button" className={`${s.canalBoton} ${className ?? ''}`} onClick={e => { e.stopPropagation(); irCanal(id) }}
    title={`Ir al canal de ${nombre} (aquí, sin abrir YouTube)`} aria-label={`Ir al canal de ${nombre}`} data-testid="ir-al-canal">
    {foto ? <img src={foto} alt="" loading="lazy" /> : <i aria-hidden>{nombre.slice(0, 1)}</i>}<span>{nombre}</span>
  </button>
}

/** La fecha de un video, siempre a la vista: el día y, si hay ancho, hace cuánto. */
export function Fecha({ iso }: { iso: string | null | undefined }) {
  const ok = !!iso && !Number.isNaN(Date.parse(iso))
  return <time dateTime={iso ?? undefined} className={s.fecha} title={ok ? new Date(iso!).toLocaleString('es-MX') : undefined}>{fechaCorta(iso)}{ok && <span className={s.fechaEdad}> · {edad(iso)}</span>}</time>
}

export function FilaVideo({ v, abrir, extra, i = 0, sinCanal }: { v: VideoCuartel; abrir: (v: VideoCuartel) => void; extra?: React.ReactNode; i?: number; sinCanal?: boolean }) {
  return <li className={`${s.fila} mov-entra`} style={{ ['--i' as string]: Math.min(i, 14) }}>
    <button type="button" className={s.filaMini} onClick={() => abrir(v)} aria-label={`Ver: ${v.titulo}`}><Miniatura video={v} /><span className={s.filaPlay}><Play size={14} fill="currentColor" /></span>{v.duracion_s ? <small>{duracion(v.duracion_s)}</small> : null}</button>
    <span className={s.filaTexto}>
      <button type="button" className={s.filaTitulo} onClick={() => abrir(v)}>{v.titulo}</button>
      <small className={s.metaCanal}>{!sinCanal && <BotonCanal id={v.channel_id} nombre={v.canal} />}<span><Fecha iso={v.publicado} /> · {compacto(v.vistas)} vistas <SelloDescarga v={v} /></span></small>
      <EstadoMio v={v} />
    </span>
    <span className={s.filaFin}><Multiplicador v={v} />{extra}<AccionesVideo v={v} en="linea" /></span>
  </li>
}

/** Tarjeta compacta para rejillas: miniatura con su multiplicador, título, canal (botón) y fecha. En teléfono se acuesta como fila. */
export function TarjetaVideo({ v, abrir, i = 0, extra, pie, sinCanal }: { v: VideoCuartel; abrir: (v: VideoCuartel) => void; i?: number; extra?: React.ReactNode; pie?: React.ReactNode; sinCanal?: boolean }) {
  return <article className={`${s.tarjeta} mov-entra`} style={{ ['--i' as string]: Math.min(i, 14) }} data-capa={v.capa}>
    <div className={s.miniCaja}><button type="button" className={s.tarjetaMini} onClick={() => abrir(v)} aria-label={`Ver: ${v.titulo}`}>
      <Miniatura video={v} /><span className={s.filaPlay}><Play size={16} fill="currentColor" /></span>
      <Multiplicador v={v} grande />{v.duracion_s ? <small>{duracion(v.duracion_s)}</small> : null}
    </button></div>
    <div className={s.tarjetaTexto}>
      <button type="button" className={s.tarjetaTitulo} onClick={() => abrir(v)}>{v.titulo}</button>
      <small className={s.metaCanal}>{!sinCanal && <BotonCanal id={v.channel_id} nombre={v.canal} />}<span><Fecha iso={v.publicado} />{sinCanal && v.vistas != null ? ` · ${compacto(v.vistas)} vistas` : ''} <SelloDescarga v={v} />{extra}</span><AccionesVideo v={v} en="meta" /></small>
      <EstadoMio v={v} />
      {pie}
    </div>
  </article>
}

/** Sello de las tarjetas: este video no se reproduce incrustado (se ve descargado con su botón). */
export function SelloDescarga({ v }: { v: Pick<VideoCuartel, 'incrustable'> }) {
  if (v.incrustable !== false) return null
  return <span className={s.selloDescarga} title="El creador no deja incrustarlo: bájalo con su botón y se ve aquí">se ve descargado</span>
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className={s.vacio}>{children}</p>
}
