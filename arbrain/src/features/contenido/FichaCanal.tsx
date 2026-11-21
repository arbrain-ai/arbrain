'use client'
/**
 * La ficha de un canal, DENTRO de Arbrain (cuartel v2, 15 nov 2026). El dueño: «un botón que me lleve al canal de la
 * persona». youtube.com está cerrado en horas de foco, así que «ir al canal» no sale de aquí: abre este cajón con quién
 * es, cómo rinde, lo que mejor le funcionó y lo último que publicó; cada video se ve en la sala. A YouTube solo se va
 * por un enlace chico, a propósito.
 *
 * Datos: primero lo que la pantalla ya tiene (se pinta al instante) y encima lo del Studio
 * (`GET /api/contenido/ficha-canal?id=UC…`, ESQUEMA §8.4), que trae su historia completa desde `cuartel.db`.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Loader2, Sparkles, X } from 'lucide-react'
import { FilaVideo, TarjetaVideo, Vacio } from './piezas'
import { SuEmbudo } from './SuEmbudo'
import { compacto, NOMBRE_CAPA } from './modelo'
import { fichaLocal, publicoHacePoco, temasChip } from './pantalla'
import type { FichaCanal, LecturaCuartel, VideoCuartel } from './tipos'
import type { EnSala } from './Sala'
import s from './cuartel.module.css'
import { abrirEnNavegador } from '@/lib/navegador'

export function FichaDeCanal({ id, lectura, abrir, cerrar }: { id: string; lectura: LecturaCuartel; abrir: (e: EnSala) => void; cerrar: () => void }) {
  const local = useMemo(() => fichaLocal(id, lectura), [id, lectura])
  const [remota, setRemota] = useState<FichaCanal | null>(null)
  const [estado, setEstado] = useState<'leyendo' | 'lista' | 'solo-local'>('leyendo')

  useEffect(() => {
    let vivo = true
    setRemota(null); setEstado('leyendo')
    fetch(`/api/contenido/ficha-canal?id=${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
      .then(async r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<FichaCanal> })
      .then(f => { if (!vivo) return; if (f?.canal?.channel_id) { setRemota(f); setEstado('lista') } else setEstado('solo-local') })
      .catch(() => { if (vivo) setEstado('solo-local') })
    return () => { vivo = false }
  }, [id])

  useEffect(() => {
    // En captura: si la sala está debajo, Escape cierra solo la ficha.
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar() } }
    document.addEventListener('keydown', tecla, true)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla, true); document.body.style.overflow = previo }
  }, [cerrar])

  const f = remota ?? local
  const c = f?.canal
  const ver = (v: VideoCuartel) => abrir({ video: v, desde: 'radar', calificacion: lectura.ranking[v.video_id] })
  const temas = useMemo(() => { const m = new Map(temasChip(lectura.universo?.temas).map(t => [t.slug, t.corto])); return (c?.temas ?? []).map(t => m.get(t) ?? t) }, [c, lectura.universo])
  const urlYT = c ? (c.url_handle || c.url || `https://www.youtube.com/channel/${id}`) : `https://www.youtube.com/channel/${id}`
  const enVivo = c ? publicoHacePoco(c) : false

  return createPortal(<div className={s.fichaCapa} role="dialog" aria-modal aria-label={c ? `Canal: ${c.nombre}` : 'Canal'} data-testid="ficha-canal" data-estado={estado} onClick={cerrar}>
    <aside className={s.fichaCajon} onClick={e => e.stopPropagation()} data-capa={c?.capa}>
      <header className={s.fichaCabeza}>
        {c?.miniatura_url ? <img src={c.miniatura_url} alt="" data-vivo={enVivo || undefined} /> : <i aria-hidden>{c?.nombre.slice(0, 1) ?? '?'}</i>}
        <div>
          <h2>{c?.nombre ?? 'Canal'}</h2>
          <p>{c ? <>{NOMBRE_CAPA[c.capa] ?? c.capa}{c.subcapa ? ` · ${c.subcapa}` : ''}{c.idioma ? ` · ${c.idioma === 'es' ? 'español' : c.idioma === 'en' ? 'inglés' : c.idioma}` : ''}{c.handle ? ` · ${c.handle}` : ''}</> : 'Buscando el canal…'}</p>
          <a className={s.aYouTubeClaro} href={urlYT} target="_blank" rel="noreferrer" onClick={ev => { ev.preventDefault(); void abrirEnNavegador(urlYT) }}>abrir en YouTube <ArrowUpRight size={11} /></a>
        </div>
        <button className={s.fichaCerrar} onClick={cerrar} aria-label="Cerrar la ficha del canal"><X size={18} /></button>
      </header>
      {!f ? (estado === 'leyendo' ? <p className={s.pensando}><Loader2 size={13} className={s.gira} /> Leyendo el canal…</p> : <Vacio>No tengo datos de este canal todavía: no está en tu universo ni en lo que trajo el sensor.</Vacio>)
        : <div className={s.fichaCuerpo}>
          <dl className={s.fichaCifras}>
            <div><dt>Suscriptores</dt><dd>{compacto(c!.suscriptores)}</dd></div>
            <div><dt>Mediana por video</dt><dd>{compacto(c!.mediana_vistas)}</dd></div>
            <div><dt>Ritmo</dt><dd>{c!.publicados_90d ?? '—'}<small> en 90 d</small></dd></div>
            <div><dt>Vistas / sub</dt><dd>{c!.vistas_por_sub_mediana != null ? `${(c!.vistas_por_sub_mediana * 100).toFixed(1)} %` : '—'}</dd></div>
            <div><dt>Outliers del año</dt><dd>{remota ? remota.totales.outliers_365d : f.outliers.length}{!remota && <small> vistos aquí</small>}</dd></div>
          </dl>
          {temas.length > 0 && <p className={s.fichaTemas}>Habla de <b>{temas.join(' · ')}</b></p>}
          <SuEmbudo id={id} />
          <section className={s.fichaSeccion}>
            <h3><Sparkles size={13} /> Lo que mejor le funcionó <small>{f.outliers.length ? 'contra lo normal de su propio canal' : ''}</small></h3>
            {f.outliers.length ? <div className={s.fichaRejilla}>{f.outliers.slice(0, 6).map((v, i) => <TarjetaVideo key={v.video_id} v={v} i={i} abrir={ver} sinCanal />)}</div>
              : <Vacio>Sin outliers este año: nada suyo ha rendido al doble de lo normal de su canal.</Vacio>}
          </section>
          <section className={s.fichaSeccion}>
            <h3>Lo último <small>{remota ? `${compacto(remota.totales.largos)} largos en total` : estado === 'leyendo' ? 'trayendo su historia…' : 'de los últimos 60 días'}</small></h3>
            {f.ultimos.length ? <ul className={s.filas}>{f.ultimos.slice(0, 12).map((v, i) => <FilaVideo key={v.video_id} v={v} i={i} abrir={ver} sinCanal />)}</ul>
              : <Vacio>No ha publicado un video largo en la ventana que tengo.</Vacio>}
          </section>
        </div>}
    </aside>
  </div>, document.body)
}
