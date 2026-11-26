'use client'
/**
 * La ficha de un video: el expediente entero del lanzamiento en una pantalla. Portada y candidatas, títulos (el elegido y
 * los descartados), descripción con capítulos, link /go/ y su verificación, transcript buscable, post de comunidad en
 * borrador (editable aquí), salida del video y del post, finales y «Abrir en el editor». Cada hueco lleva su botón a Levy.
 * Aprobar el post o programar la salida suben una tarjeta a la bandeja del dueño: nada se publica desde aquí.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Clapperboard, ExternalLink, Inbox, Link2, Search, Sparkles } from 'lucide-react'
import { pedirALevy } from '@/features/cabina/documento/enviar'
import { buscarEnTranscript, cuandoCorto, NOMBRE_PIEZA, pedidoALevy, reloj } from './modelo'
import type { FichaVideo, Pieza, Solicitud, TarjetaVideo } from './tipos'
import s from './galeria.module.css'

const MB = (b: number) => b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`
const NOMBRE_FINAL = { largo: 'Largo', vertical: 'Corto vertical', '720p': '720p', otro: 'Otro' } as const

function textoSolicitud(x: Solicitud | null, que: string): string | null {
  if (!x) return null
  if (x.estado === 'pendiente') return `${que} espera tu toque en la bandeja desde ${cuandoCorto(x.pedida)}.`
  if (x.estado === 'si') return `Dijiste que sí en la bandeja (${que.toLowerCase()}).`
  if (x.estado === 'no') return `Dijiste que no en la bandeja${x.comentario ? `: «${x.comentario}»` : ''}.`
  if (x.estado === 'otro') return `Pediste otra cosa en la bandeja${x.comentario ? `: «${x.comentario}»` : ''}.`
  return `${que}: la bandeja no responde; la tarjeta sigue ahí.`
}

export function Ficha({ id, previa, onCerrar, onAbrir }: { id: string; previa: TarjetaVideo | null; onCerrar: () => void; onAbrir?: (id: string) => void }) {
  const [f, setF] = useState<FichaVideo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const leer = useCallback(async () => {
    try {
      const r = await fetch(`/api/editor/galeria/ficha?id=${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No pude leer la ficha.')
      setF(j as FichaVideo); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [id])
  useEffect(() => { void leer() }, [leer])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) onCerrar() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onCerrar])
  const video = useRef<HTMLVideoElement>(null)
  const ir = useCallback((t: number) => { const v = video.current; if (v) { v.currentTime = t; void v.play().catch(() => {}) } }, [])
  const titulo = f?.titulo ?? previa?.titulo ?? ''
  const largo = f?.finales.find(x => x.tipo === 'largo') ?? null
  const puedeIr = !!largo && (f?.transcript?.corte === 'final')

  return <article className={s.ficha} data-testid="ficha" data-estado={f ? 'lista' : error ? 'error' : 'leyendo'} aria-label={`Ficha de ${titulo}`}>
    <header className={s.fichaCabeza}>
      <button type="button" className={s.volver} onClick={onCerrar} aria-label="Volver a la galería"><ArrowLeft size={15} /> Galería</button>
      <h2>{titulo}</h2>
      {(f ?? previa) && <span className={s.chips}><span className={s.chip} data-tono={(f ?? previa)!.video.tono}>{(f ?? previa)!.video.etiqueta}</span><span className={s.chip} data-tono={(f ?? previa)!.post.tono}>{(f ?? previa)!.post.etiqueta}</span></span>}
      <span className={s.fichaAcciones}>
        {f?.youtube_id && <a className={s.boton} href={`https://youtu.be/${f.youtube_id}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> YouTube</a>}
        {(f?.origen ?? previa?.origen) !== 'canal' && <button type="button" className={s.botonFuerte} data-testid="abrir-en-editor"
          onClick={() => onAbrir ? onAbrir(id) : pedirALevy(`Abre en el editor el video «${titulo}» (${f?.carpeta ?? id}) en la segunda pantalla.`)}><Clapperboard size={14} /> Abrir en el editor</button>}
      </span>
    </header>
    {error && <p className={s.aviso} role="alert">{error}</p>}
    {f?.avisos.map(a => <p key={a} className={s.aviso}>{a}</p>)}
    {!f ? <div className={s.fichaCuerpo}><div className={s.esqueletoAlto} /><div className={s.esqueletoAlto} /><div className={s.esqueletoAlto} /></div> :
      <div className={s.fichaCuerpo}>
        <section className={s.col} aria-label="Portada, salida y finales">
          <Portada f={f} />
          <Salida f={f} alCambiar={leer} />
          {!f.finales.length && f.video.clave === 'publicado' ? <div className={s.bloque} data-pieza="finales"><h3>Finales</h3><p className={s.vacio}>{f.origen === 'canal' ? 'Ya está en YouTube; sin carpeta de proyecto no hay finales locales.' : 'Ya salió; sus finales no están en esta máquina (se archivaron después de subirlo).'}</p></div> :
          <Bloque titulo="Finales" pieza="finales" f={f} vacio={!f.finales.length}>
            {largo && <video ref={video} className={s.reproductor} src={largo.url} controls preload="metadata" playsInline muted />}
            <ul className={s.finales}>{f.finales.map(x => <li key={x.nombre}><span className={s.chip} data-tono="idle">{NOMBRE_FINAL[x.tipo]}</span><a href={x.url} target="_blank" rel="noreferrer" title={x.nombre}>{x.nombre.split('/').pop()}</a><small>{MB(x.bytes)}</small></li>)}</ul>
          </Bloque>}
          {f.metricas && <p className={s.metricas}>{f.metricas.vistas != null && <span><b>{new Intl.NumberFormat('es-MX').format(f.metricas.vistas)}</b> vistas</span>}{f.metricas.ctr != null && <span><b>{(f.metricas.ctr > 1 ? f.metricas.ctr : f.metricas.ctr * 100).toFixed(1)} %</b> CTR</span>}{f.metricas.retencion != null && <span><b>{Math.round(f.metricas.retencion)} %</b> retención</span>}<small>de tu analítica</small></p>}
        </section>
        <section className={s.col} aria-label="Metadata y post">
          <Bloque titulo="Títulos" pieza="titulos" f={f} vacio={!f.titulos.length}>
            <ol className={s.titulos}>{f.titulos.map(t => <li key={t.texto} data-elegido={t.elegido || undefined}>{t.elegido && <Check size={13} aria-label="elegido" />}{t.texto}</li>)}</ol>
          </Bloque>
          <Bloque titulo="Descripción" pieza="descripcion" f={f} vacio={!f.descripcion} fuente={f.descripcion?.fuente}>
            {f.descripcion && <pre className={s.descripcion}>{f.descripcion.texto}</pre>}
            {f.descripcion && (f.capitulos.length ? <ol className={s.capitulos} aria-label="Capítulos">{f.capitulos.map(c => <li key={c.t}><button type="button" disabled={!puedeIr} onClick={() => ir(c.t)}><time>{reloj(c.t)}</time>{c.titulo}</button></li>)}</ol>
              : <Hueco pieza="capitulos" f={f} chico />)}
            {!!f.palabras_clave.length && <p className={s.claves}>{f.palabras_clave.slice(0, 18).map(k => <span key={k}>{k}</span>)}</p>}
          </Bloque>
          <Bloque titulo="Link /go/" pieza="link" f={f} vacio={!f.link}>
            {f.link && <p className={s.link}><Link2 size={13} /><a href={f.link.url} target="_blank" rel="noreferrer">{f.link.url}</a><span className={s.chip} data-tono={f.link.verificado ? 'ok' : 'wait'}>{f.link.verificado ? `verificado${f.link.estado ? ` · ${f.link.estado}` : ''}` : 'sin verificar'}</span>{f.link.destino && <small title={f.link.destino}>→ {f.link.destino.replace(/^https?:\/\//, '').slice(0, 60)}</small>}</p>}
          </Bloque>
          <Post f={f} alCambiar={leer} />
        </section>
        <section className={s.col} aria-label="Transcript">
          <Transcript f={f} ir={puedeIr ? ir : null} />
        </section>
      </div>}
  </article>
}

function Hueco({ pieza, f, chico }: { pieza: Pieza; f: FichaVideo; chico?: boolean }) {
  const [enviado, setEnviado] = useState(false)
  return <div className={s.hueco} data-chico={chico || undefined} data-testid={`hueco-${pieza}`}>
    <span>Falta {NOMBRE_PIEZA[pieza].toLowerCase()}.</span>
    <button type="button" onClick={() => { pedirALevy(pedidoALevy(pieza, f)); setEnviado(true) }} disabled={enviado}>
      <Sparkles size={13} /> {enviado ? 'Pedido a Levy en el chat' : 'Pídeselo a Levy'}
    </button>
  </div>
}

function Bloque({ titulo, pieza, f, vacio, fuente, children }: { titulo: string; pieza: Pieza; f: FichaVideo; vacio: boolean; fuente?: string | null; children?: React.ReactNode }) {
  return <div className={s.bloque} data-pieza={pieza}>
    <h3>{titulo}{fuente && <small title={fuente}>{fuente}</small>}</h3>
    {vacio ? <Hueco pieza={pieza} f={f} /> : children}
  </div>
}

function Portada({ f }: { f: FichaVideo }) {
  const [rota, setRota] = useState(false)
  return <div className={s.bloque} data-pieza="miniatura">
    <h3>Portada{f.portada_de && <small>{f.portada_de === 'elegida' ? 'la elegida' : f.portada_de === 'candidata' ? 'candidata (sin elegir)' : f.portada_de === 'youtube' ? 'la de YouTube' : 'cuadro del video'}</small>}</h3>
    {f.portada && !rota ? <img className={s.portadaGrande} src={f.portada} alt={`Portada de ${f.titulo}`} onError={() => setRota(true)} /> : <Hueco pieza="miniatura" f={f} />}
    {f.candidatas.length > 1 && <ul className={s.candidatas} aria-label="Candidatas">{f.candidatas.map(c => <li key={c.nombre} data-elegida={c.elegida || undefined} title={c.nombre}><img src={c.url} alt="" loading="lazy" /></li>)}</ul>}
  </div>
}

function Salida({ f, alCambiar }: { f: FichaVideo; alCambiar: () => void }) {
  const [para, setPara] = useState('')
  const [estado, setEstado] = useState<string | null>(null)
  const publicado = f.video.clave === 'publicado'
  const programar = async () => {
    setEstado('Subiendo a tu bandeja…')
    try {
      const r = await fetch('/api/editor/galeria/bandeja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, tipo: 'programar', revision: f.revision, para: new Date(para).toISOString() }) })
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'No se pudo.')
      setEstado(null); alCambiar()
    } catch (e) { setEstado((e as Error).message) }
  }
  const sol = textoSolicitud(f.salida.programar, 'Programar')
  return <div className={s.bloque} data-pieza="fecha">
    <h3>Salida</h3>
    <dl className={s.salida}>
      <dt>Video</dt><dd>{f.salida.video ? cuandoCorto(f.salida.video) : <em>sin fecha</em>}</dd>
      <dt>Post</dt><dd>{f.borrador.publicado ? `publicado ${cuandoCorto(f.borrador.publicado)}` : f.salida.post ? `${cuandoCorto(f.salida.post)} (+${f.salida.post_min} min)` : <em>después del video</em>}</dd>
    </dl>
    {sol && <p className={s.solicitud}><Inbox size={13} /> {sol}</p>}
    {!publicado && f.origen === 'proyecto' && (f.revision
      ? <div className={s.programar}><input type="datetime-local" value={para} onChange={e => setPara(e.target.value)} aria-label="Fecha y hora de salida" />
          <button type="button" className={s.boton} disabled={!para || f.salida.programar?.estado === 'pendiente'} onClick={programar}><Inbox size={13} /> Programar · a tu bandeja</button></div>
      : !f.salida.video && <Hueco pieza="fecha" f={f} chico />)}
    {estado && <p className={s.estadoLinea}>{estado}</p>}
  </div>
}

function Post({ f, alCambiar }: { f: FichaVideo; alCambiar: () => void }) {
  const [texto, setTexto] = useState(f.borrador.cuerpo)
  const [estado, setEstado] = useState<string | null>(null)
  useEffect(() => { setTexto(f.borrador.cuerpo) }, [f.borrador.cuerpo])
  const sucio = texto !== f.borrador.cuerpo
  const llamar = async (url: string, cuerpo: unknown, ok: string) => {
    setEstado('Guardando…')
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'No se pudo.')
      setEstado(ok); alCambiar()
    } catch (e) { setEstado((e as Error).message) }
  }
  const sol = textoSolicitud(f.borrador.solicitud, 'La aprobación del post')
  if (f.origen === 'canal') return <div className={s.bloque} data-pieza="post"><h3>Post de comunidad</h3><p className={s.vacio}>Sin registro del post de este video (no tiene carpeta de proyecto).</p></div>
  if (!f.borrador.cuerpo && !f.borrador.editable) return <Bloque titulo="Post de comunidad" pieza="post" f={f} vacio />
  return <div className={s.bloque} data-pieza="post">
    <h3>Post de comunidad{f.borrador.fuente && <small title={f.borrador.fuente}>{f.borrador.fuente}</small>}</h3>
    {!f.borrador.cuerpo && <Hueco pieza="post" f={f} chico />}
    <textarea className={s.post} value={texto} onChange={e => setTexto(e.target.value)} readOnly={!f.borrador.editable || !!f.borrador.publicado} rows={12}
      aria-label="Borrador del post de comunidad" placeholder={f.borrador.editable ? 'El borrador del post, en tu voz.' : ''} data-testid="post-borrador" />
    {sol && <p className={s.solicitud}><Inbox size={13} /> {sol}</p>}
    {f.borrador.aprobado && <p className={s.solicitud}><Check size={13} /> Aprobado {cuandoCorto(f.borrador.aprobado)}: sale cuando el video sea público.</p>}
    {!f.borrador.editable && f.borrador.cuerpo && <p className={s.estadoLinea}>Sin publish.json: el texto sale de {f.borrador.fuente}; para editarlo aquí, Levy arma el paquete de publicación.</p>}
    {f.borrador.editable && !f.borrador.publicado && <div className={s.acciones}>
      <button type="button" className={s.boton} disabled={!sucio} onClick={() => llamar('/api/editor/galeria/ficha', { id: f.id, revision: f.revision, post: texto }, 'Guardado en el proyecto.')}>Guardar</button>
      <button type="button" className={s.botonFuerte} disabled={sucio || !texto.trim() || !!f.borrador.aprobado || f.borrador.solicitud?.estado === 'pendiente'}
        title={sucio ? 'Guarda primero: se aprueba el texto guardado' : 'Sube una tarjeta a tu bandeja; aprobar no publica'}
        onClick={() => llamar('/api/editor/galeria/bandeja', { id: f.id, tipo: 'aprobar_post', revision: f.revision }, 'En tu bandeja: tócala para aprobar.')}><Inbox size={13} /> Aprobar · a tu bandeja</button>
    </div>}
    {estado && <p className={s.estadoLinea}>{estado}</p>}
  </div>
}

function Transcript({ f, ir }: { f: FichaVideo; ir: ((t: number) => void) | null }) {
  const [q, setQ] = useState('')
  const segs = useMemo(() => f.transcript?.segmentos ?? [], [f.transcript])
  const hits = useMemo(() => new Set(buscarEnTranscript(segs, q)), [segs, q])
  const lista = useRef<HTMLOListElement>(null)
  useEffect(() => { if (hits.size) lista.current?.querySelector('[data-hit]')?.scrollIntoView({ block: 'center' }) }, [hits])
  if (!f.transcript) return <Bloque titulo="Transcript" pieza="transcript" f={f} vacio />
  const corte = { final: 'corte final', crudo: 'toma cruda', youtube: 'de YouTube', texto: 'texto con tiempos' }[f.transcript.corte]
  return <div className={`${s.bloque} ${s.transcript}`} data-pieza="transcript">
    <h3>Transcript<small title={f.transcript.fuente}>{corte} · {new Intl.NumberFormat('es-MX').format(f.transcript.palabras)} palabras</small></h3>
    <label className={s.buscar}><Search size={13} aria-hidden /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el transcript" aria-label="Buscar en el transcript" />{q && <small>{hits.size}</small>}</label>
    <ol ref={lista} className={s.lineas}>{segs.map((x, i) => <li key={i} data-hit={hits.has(i) || undefined}>
      <button type="button" disabled={!ir} onClick={() => ir?.(x.t)} title={ir ? 'Ir a este momento' : undefined}><time>{reloj(x.t)}</time></button><span>{x.texto}</span>
    </li>)}</ol>
  </div>
}
