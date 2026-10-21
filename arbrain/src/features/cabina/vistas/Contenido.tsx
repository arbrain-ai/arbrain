'use client'
/**
 * Contenido en el hilo (Cabina v2): cuántos videos salieron este mes y en qué
 * semanas (la meta de octubre es 2 por semana), y los últimos con su miniatura,
 * vistas acumuladas y retención. Las vistas no son ventas; la vista no lo finge.
 */
import { useState } from 'react'
import type { Video, Videos } from '@/features/clarity/types'
import { useFuente } from '../datos'
import { hoyCivil, inicioMes, finMes, rangoCalendario, sumarDias, etiquetaDia } from '../model'
import { Cifra, escalon } from '../movimiento'
import s from '../cabina.module.css'
import l from '../luz.module.css'

export const URL_CONTENIDO = '/api/clarity?section=results'
const civil = (iso: string) => hoyCivil(new Date(iso))
const compacto = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(0)} mil` : n >= 1000 ? `${(n / 1000).toFixed(1)} mil` : String(n)
const hace = (iso: string) => { const d = Math.round((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : etiquetaDia(civil(iso), { day: 'numeric', month: 'short' }) }

function Miniatura({ v }: { v: Video }) {
  const respaldo = `https://i.ytimg.com/vi/${encodeURIComponent(v.video_id)}/hqdefault.jpg`
  const [src, setSrc] = useState(v.thumbnail_url || respaldo)
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => src !== respaldo && setSrc(respaldo)} />
}

export function VistaContenido({ grande, sinCeja }: { grande?: boolean; sinCeja?: boolean }) {
  const { data, error } = useFuente<Videos>(URL_CONTENIDO)
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Leyendo tus publicaciones…'}</div>
  const hoy = hoyCivil(), mesIni = inicioMes(hoy), mesFin = finMes(hoy)
  const delMes = data.videos.filter(v => { const d = civil(v.published_at); return d >= mesIni && d < mesFin })
  const { desde: semIni } = rangoCalendario('semana', hoy)
  const estaSemana = data.videos.filter(v => civil(v.published_at) >= semIni).length
  // Semanas (lunes) que tocan el mes; cada una con sus publicaciones.
  const semanas: { ini: string; n: number }[] = []
  for (let d = rangoCalendario('semana', mesIni).desde; d < mesFin; d = sumarDias(d, 7)) semanas.push({ ini: d, n: data.videos.filter(v => { const c = civil(v.published_at); return c >= d && c < sumarDias(d, 7) && c >= mesIni && c < mesFin }).length })
  const ultimos = data.videos.slice(0, grande ? 9 : 3) // múltiplos de 3: la cuadrícula no deja huérfanos
  return <div>
    {!sinCeja && <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>Contenido · <b>YouTube</b></p>}
    {error && <p className={l.aviso}>{error} Se muestra la última lectura.</p>}
    <div className={l.cifras} style={{ marginTop: 10 }}>
      <div className={`${l.cifra} ${l.entra}`} style={escalon(1)} data-foco>
        <span>Publicados en {etiquetaDia(mesIni, { month: 'long' })}</span>
        <strong><Cifra valor={delMes.length} clave={`cont-mes-${mesIni}`} formato={n => String(Math.round(n))} /></strong>
        <small>{data.limited ? 'al menos · ' : ''}{estaSemana} esta semana</small>
      </div>
      <div className={`${l.cifra} ${l.entra}`} style={escalon(2)}>
        <span>Vistas del mes</span>
        <strong><Cifra valor={delMes.reduce((n, v) => n + (v.views ?? 0), 0)} clave={`cont-vistas-${mesIni}`} formato={n => compacto(Math.round(n))} /></strong>
        <small>acumuladas de lo publicado este mes</small>
      </div>
    </div>
    <div className={`${l.semanasPub} ${l.entra}`} style={escalon(3)} aria-label="Publicaciones por semana del mes">
      {semanas.map(w => <span key={w.ini} data-actual={w.ini === semIni || undefined}>{etiquetaDia(w.ini < mesIni ? mesIni : w.ini, { day: 'numeric', month: 'short' }).replace('.', '')}
        <i>{Array.from({ length: Math.max(2, w.n) }, (_, i) => <b key={i} data-vacio={i >= w.n || undefined} />)}</i></span>)}
    </div>
    <div className={l.seccion}><h4>Lo último</h4><small>{data.videos.length ? `actualizado ${hace(data.loadedAt)}` : ''}</small></div>
    {ultimos.length ? <div className={l.videos}>
      {ultimos.map((v, i) => <a key={v.video_id} className={`${l.video} ${l.entra}`} style={escalon(4 + i)} href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.video_id)}`} target="_blank" rel="noreferrer">
        <span className={l.miniatura}><Miniatura v={v} />{civil(v.published_at) >= semIni && <em>nuevo</em>}</span>
        <strong>{v.title}</strong>
        <small>{hace(v.published_at)} · {v.views == null ? 'sin vistas registradas' : `${compacto(v.views)} vistas`}{v.avg_view_percentage != null ? ` · ${v.avg_view_percentage.toFixed(0)}% retención` : ''}</small>
      </a>)}
    </div> : <p className={l.vacio}>No hay publicaciones en esta lectura.</p>}
    <p className={l.fuente} style={{ marginTop: 12 }}>Vistas acumuladas por video; no equivalen a ventas. Cada video conserva su propia fecha de actualización.</p>
  </div>
}

export function resumenContenido(d: Videos | undefined) {
  if (!d) return null
  const hoy = hoyCivil(), ini = inicioMes(hoy)
  const n = d.videos.filter(v => hoyCivil(new Date(v.published_at)) >= ini).length
  return `${n} ${n === 1 ? 'video' : 'videos'} este mes`
}
