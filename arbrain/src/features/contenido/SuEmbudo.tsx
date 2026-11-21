'use client'
/**
 * «Su embudo» dentro de la ficha del canal (19 nov 2026). Daniel: «yo al presionar cada uno, esperaría poder dar clic al
 * perfil de cada uno, y poder mirar su oferta, link etc…». Tarjeta corta: qué vende (con precio y botón a su página),
 * su regalo de entrada, a dónde manda sus videos, su promesa en una línea y su vehículo como etiquetas. Nada más de
 * texto; lo que falta dice «sin dato». Datos: `GET /api/contenido/embudo-canal?id=UC…` (resumen de embudos.json).
 */
import { useEffect, useState } from 'react'
import { ArrowUpRight, Filter } from 'lucide-react'
import { diaCorto, type EmbudoCanal, type EnlaceEmbudo } from './embudo'
import { abrirEnNavegador } from '@/lib/navegador'

/** En la app de escritorio `target=_blank` no hace nada (WKWebView): se abre por el opener del sistema (20 nov 2026). */
const abrirFuera = (url?: string | null) => (ev: React.MouseEvent) => { if (!url) return; ev.preventDefault(); void abrirEnNavegador(url) }
import s from './cuartel.module.css'

function Boton({ e, texto }: { e: EnlaceEmbudo; texto: string }) {
  return e.url ? <a className={s.embudoBoton} href={e.url} target="_blank" rel="noreferrer noopener" title={e.url} onClick={abrirFuera(e.url)}>{texto} <ArrowUpRight size={12} /></a> : null
}
const SinDato = () => <span className={s.embudoSin}>sin dato</span>

export function SuEmbudo({ id }: { id: string }) {
  const [e, setE] = useState<EmbudoCanal | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    setE(undefined)
    fetch(`/api/contenido/embudo-canal?id=${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(async r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<{ embudo: EmbudoCanal | null }> })
      .then(j => { if (vivo) setE(j.embudo ?? null) })
      .catch(() => { if (vivo) setE(null) })
    return () => { vivo = false }
  }, [id])
  if (!e) return null

  const v = e.vende[0]
  return <section className={s.embudo} data-testid="su-embudo" data-completa={e.completa || undefined}>
    <h3><Filter size={13} /> Su embudo <small>{e.cambio ? <b>cambió el {diaCorto(e.cambio)}</b> : null}{e.cambio ? ' · ' : ''}dato del {diaCorto(e.fecha)}</small></h3>
    <dl className={s.embudoFilas}>
      <div>
        <dt>Vende</dt>
        <dd>{v ? <><span className={s.embudoNombre} title={v.nombre}>{v.nombre}</span><b className={s.embudoPrecio}>{v.precio ?? 'precio sin dato'}</b><Boton e={v} texto="Ver oferta" /></> : <SinDato />}</dd>
      </div>
      <div>
        <dt>Regalo</dt>
        <dd>{e.regalo ? <><span className={s.embudoNombre} title={e.regalo.nombre}>{e.regalo.nombre}</span><Boton e={e.regalo} texto="Abrir" /></> : <SinDato />}</dd>
      </div>
      <div>
        <dt>Sus videos mandan a</dt>
        <dd className={s.embudoDestinos}>{e.destinos.length ? e.destinos.map(d =>
          <a key={d.nombre} className={s.embudoDestino} href={d.url ?? undefined} target="_blank" rel="noreferrer noopener" title={d.url ?? ''} onClick={abrirFuera(d.url)}>
            <span>{d.nombre}</span>{d.de > 0 && <small>en {d.en} de {d.de} videos</small>}<ArrowUpRight size={12} />
          </a>) : <SinDato />}</dd>
      </div>
      <div>
        <dt>Promete</dt>
        <dd>{e.promesa ? <q className={s.embudoPromesa} title={e.promesa}>{e.promesa}</q> : <SinDato />}</dd>
      </div>
      <div>
        <dt>Vehículo</dt>
        <dd className={s.embudoEtiquetas}>{e.vehiculo.length ? e.vehiculo.map(x => <span key={x}>{x}</span>) : <SinDato />}</dd>
      </div>
    </dl>
  </section>
}
