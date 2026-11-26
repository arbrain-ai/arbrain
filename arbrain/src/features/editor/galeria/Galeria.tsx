'use client'
/**
 * La Galería de videos (19 nov 2026): el inicio del editor de Arbrain. El dueño: «desde acá podíamos bajar a tierra la
 * descripción, el post publicado a la comunidad». Rejilla de todos sus videos (los del pipeline y los publicados del
 * canal) con portada y estado de un vistazo; la ficha a un clic. Es espejo: lo que falta lo hace Levy desde el chat y lo
 * irreversible espera el toque del dueño en su bandeja.
 *
 * Contrato con `editor-interfaz`: `<Galeria onAbrir={id => …} />`. `onAbrir` recibe el id durable del video
 * (`y/<carpeta>`, `v/<carpeta>`, `c/<id de YouTube>`); sin `onAbrir`, el botón «Abrir en el editor» se lo pide a Levy.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { useReading } from '@/features/clarity/useReading'
import { FILTROS, pasaFiltro, type Filtro } from './modelo'
import { Ficha } from './Ficha'
import type { LecturaGaleria, TarjetaVideo } from './tipos'
import s from './galeria.module.css'

export interface PropsGaleria {
  /** Abre el video en el editor. Lo pasa `editor-interfaz`. */
  onAbrir?: (id: string) => void
  /** Abrir directo la ficha de un video (por ejemplo `?video=y/2026-09-22-opus-5-5`). */
  inicial?: string | null
  className?: string
}

const compacto = (n: number) => new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const diaCorto = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' }) : ''

export function Galeria({ onAbrir, inicial = null, className }: PropsGaleria) {
  const { data, error, loading, refresh } = useReading<LecturaGaleria>('/api/editor/galeria', false, 45000)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState<string | null>(inicial)
  useEffect(() => { if (inicial) setAbierta(inicial) }, [inicial])
  const videos = useMemo(() => data?.videos ?? [], [data])
  const cuentas = useMemo(() => Object.fromEntries(FILTROS.map(f => [f.id, videos.filter(v => pasaFiltro(v, f.id)).length])) as Record<Filtro, number>, [videos])
  const visibles = useMemo(() => videos.filter(v => pasaFiltro(v, filtro, q)), [videos, filtro, q])
  const cerrar = useCallback(() => { setAbierta(null); refresh() }, [refresh])
  const tarjeta = abierta ? videos.find(v => v.id === abierta) ?? null : null

  return <div className={`${s.galeria} ${className ?? ''}`} data-testid="galeria" data-listo={!!data || undefined}>
    {abierta ? <Ficha id={abierta} previa={tarjeta} onCerrar={cerrar} onAbrir={onAbrir} /> : <>
      <header className={s.cabeza}>
        <div className={s.titulo}><h2>Tus videos</h2>{data && <small>{videos.length} · {data.fuentes.proyectos} con carpeta{data.fuentes.canal != null ? ` · ${data.fuentes.canal} solo en el canal` : ''}</small>}</div>
        <nav className={s.filtros} aria-label="Filtrar videos" data-testid="filtros">
          {FILTROS.map(f => <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.nombre}<b>{data ? cuentas[f.id] : '·'}</b></button>)}
        </nav>
        <label className={s.buscar}><Search size={14} aria-hidden /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título" aria-label="Buscar video" /></label>
        <button type="button" className={s.icono} onClick={refresh} disabled={loading} aria-label="Releer la galería" title="Releer"><RefreshCw size={14} className={loading ? s.gira : undefined} /></button>
      </header>
      {data?.avisos.map(a => <p key={a} className={s.aviso}>{a}</p>)}
      {error && !data && <p className={s.aviso} role="alert">{error}</p>}
      {!data ? <div className={s.rejilla} aria-busy>{Array.from({ length: 12 }, (_, i) => <div key={i} className={s.esqueleto} />)}</div>
        : !visibles.length ? <p className={s.vacio}>{q ? `Nada con «${q}».` : 'Ningún video en este filtro.'}</p>
        : <ul className={s.rejilla} data-testid="rejilla">{visibles.map(v => <li key={v.id}><Tarjeta v={v} onAbrir={() => setAbierta(v.id)} /></li>)}</ul>}
    </>}
  </div>
}

function Tarjeta({ v, onAbrir }: { v: TarjetaVideo; onAbrir: () => void }) {
  const [rota, setRota] = useState(false)
  return <button type="button" className={s.tarjeta} onClick={onAbrir} data-testid="tarjeta-video" data-etapa={v.video.clave} data-post={v.post.clave} data-origen={v.origen}>
    <span className={s.portada}>
      {v.portada && !rota ? <img src={v.portada} alt="" loading="lazy" decoding="async" onError={() => setRota(true)} /> : <i aria-hidden>{v.titulo.slice(0, 1).toUpperCase()}</i>}
      {v.portada_de === 'cuadro' && !rota && <em className={s.marcaCuadro}>cuadro del video</em>}
    </span>
    <span className={s.chips}>
      <span className={s.chip} data-tono={v.video.tono}>{v.video.etiqueta}</span>
      {v.post.clave !== 'sin-post' && v.post.clave !== 'sin-registro' && <span className={s.chip} data-tono={v.post.tono}>{v.post.etiqueta}</span>}
    </span>
    <strong className={s.nombre}>{v.titulo}</strong>
    <span className={s.meta}>
      <time dateTime={v.fecha ?? undefined}>{diaCorto(v.fecha)}</time>
      {v.vistas != null && <span>{compacto(v.vistas)} vistas</span>}
      {v.huecos.length > 0 && <span className={s.faltan} title={`Falta: ${v.huecos.join(', ')}`}>faltan {v.huecos.length}</span>}
    </span>
  </button>
}
