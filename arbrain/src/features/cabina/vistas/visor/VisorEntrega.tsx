'use client'
/**
 * Carpeta de entrega (8 oct 2026): abrir una carpeta y verla como lo que es, una ENTREGA. Primero lo que se va a usar
 * (los finales), después las piezas del camino. Si la carpeta trae `entrega.json` ({titulo, finales, piezas, nota}) manda;
 * si no, se deduce por nombre (finales/, final-*, export-*; v1 < v2 < v2.1) y, sin nombres de final, video y audio son los
 * finales. Cada tarjeta se abre en el visor que le toca, sin salir de aquí; los videos de un mismo grupo se pueden abrir juntos para
 * compararlos con «Verlos juntos» (versiones, o horizontal y vertical).
 *
 * «Me saca» (6 nov 2026, Daniel: «doy clic a un video y luego me saca no puedo he podido ver ninguno aun»): abrir una pieza
 * encoge la carpeta (13 tarjetas → un video) y el hilo no se mueve: la vista quedaba arriba, fuera de la pantalla, el hilo la
 * dormía (useALaVista desmonta lo que se aleja) y lo abierto, que vivía solo en este componente, se perdía; al subir, la
 * carpeta otra vez. Ahora lo abierto se recuerda por carpeta (medio.ts › abiertaEnCarpeta) y, al abrir o volver, la vista se
 * trae a la pantalla.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, AudioLines, Columns2, FileText, Play, Presentation } from 'lucide-react'
import { ImagenRapida } from '@/shared/components/ImagenRapida'
import type { MetaImagen } from '@/lib/imagenes/variantes'
import { abiertaEnCarpeta, hayQueTraer, ordenarEntrega, pesoLegible, recordarAbiertaEnCarpeta, type ItemEntrega } from '../../documento/medio'
import type { MostrarInput } from '../../model'
import v from './visor.module.css'

export interface ItemCarpeta extends ItemEntrega { url?: string; imagen?: MetaImagen | null }
export interface Entrega { archivo: string; ruta: string; items: ItemCarpeta[]; recortado: boolean; manifiesto: { titulo?: string; nota?: string; finales?: string[]; piezas?: string[] } | null }

/** Reparte los archivos en finales y piezas: el manifiesto manda; sin él, por nombre. */
export function repartir(items: ItemCarpeta[], m: Entrega['manifiesto']): { finales: ItemCarpeta[]; piezas: ItemCarpeta[] } {
  const propios = items.filter(i => i.nombre.toLowerCase() !== 'entrega.json')
  if (!m?.finales?.length && !m?.piezas?.length) return ordenarEntrega(propios) as { finales: ItemCarpeta[]; piezas: ItemCarpeta[] }
  const por = (rel: string) => propios.find(i => i.relativa === rel.replace(/^\.\//, '') || i.nombre === rel)
  const finales = (m.finales ?? []).map(por).filter((x): x is ItemCarpeta => !!x)
  const nombradas = (m.piezas ?? []).map(por).filter((x): x is ItemCarpeta => !!x)
  const usadas = new Set([...finales, ...nombradas].map(i => i.ruta))
  const resto = (ordenarEntrega(propios.filter(i => !usadas.has(i.ruta))) as { finales: ItemCarpeta[]; piezas: ItemCarpeta[] })
  // Lo que el manifiesto no menciona y por nombre parece final, sigue siendo pieza: el manifiesto es quien dice qué es final.
  return { finales, piezas: [...nombradas, ...resto.finales, ...resto.piezas] }
}

/** Lo abierto y la tarjeta de la que salió, para volver a ella. */
interface Abierta { input: MostrarInput; desde: string }

/** Trae `el` a la pantalla si su borde de arriba quedó fuera; mueve solo lo necesario (el hilo o la pestaña que la contiene). */
function traer(el: Element | null, bloque: ScrollLogicalPosition) {
  if (!el) return
  const alto = window.visualViewport?.height ?? window.innerHeight
  if (hayQueTraer(el.getBoundingClientRect().top, alto)) el.scrollIntoView({ block: bloque, inline: 'nearest' })
}

export function VisorEntrega({ data, abrir, grande }: { data: Entrega; abrir: (input: MostrarInput) => React.ReactNode; grande?: boolean }) {
  const [abierta, setAbierta] = useState<Abierta | null>(() => abiertaEnCarpeta<Abierta>(data.ruta))
  const raiz = useRef<HTMLDivElement>(null)
  const volviDe = useRef<string | null>(null)
  const poner = (a: Abierta | null) => { recordarAbiertaEnCarpeta(data.ruta, a); if (!a) volviDe.current = abierta?.desde ?? null; setAbierta(a) }
  const abierto = abierta?.input ?? null
  // Al abrir, lo abierto queda delante (antes de pintar: el hilo aún no lo ha dormido); al volver, la tarjeta de la que salió.
  const primera = useRef(true)
  useLayoutEffect(() => {
    if (primera.current) { primera.current = false; return }
    if (abierta) { traer(raiz.current, 'start'); return }
    const desde = volviDe.current; volviDe.current = null
    traer(desde ? raiz.current?.querySelector(`[data-ruta="${CSS.escape(desde)}"]`) ?? raiz.current : raiz.current, desde ? 'center' : 'start')
  }, [abierta])
  const { finales, piezas } = useMemo(() => repartir(data.items, data.manifiesto), [data.items, data.manifiesto])
  const titulo = data.manifiesto?.titulo ?? data.archivo
  const videosDe = (grupo: ItemCarpeta[]) => grupo.filter(i => i.clase === 'video')
  // Un video se abre solo (6 nov 2026: «más simple»); compararlos es «Verlos juntos» / «Comparar versiones».
  const abrirItem = (it: ItemCarpeta) => poner({ input: { vista: 'documento', ruta: it.ruta, titulo: it.nombre }, desde: it.ruta })
  const comparar = (grupo: ItemCarpeta[]) => { const vs = videosDe(grupo); if (vs.length >= 2) poner({ input: { vista: 'documento', ruta: vs[0].ruta, titulo: 'Versiones', versiones: vs.slice(1, 6).map(x => x.ruta), compararCon: vs[1].ruta }, desde: vs[0].ruta }) }

  if (abierto) return <div ref={raiz} className={v.entregaAbierta}>
    <button type="button" className={v.volver} data-volver-carpeta onClick={() => poner(null)} aria-label={`Volver a la carpeta ${titulo}`} title={titulo}>
      <ArrowLeft size={14} aria-hidden />Volver a la carpeta<small>{titulo}</small></button>
    {abrir(abierto)}
  </div>

  const vacio = !finales.length && !piezas.length
  return <div ref={raiz} className={v.entrega} data-grande={grande || undefined}>
    <header className={v.entregaCabeza}>
      <h3>{titulo}</h3>
      <p>{vacio ? 'Esta carpeta no tiene nada que el visor pueda abrir.' : `${finales.length === 1 ? '1 final' : `${finales.length} finales`} · ${piezas.length === 1 ? '1 pieza' : `${piezas.length} piezas`}${data.recortado ? ' · lista recortada' : ''}`}</p>
      {data.manifiesto?.nota && <p className={v.entregaNota}>{data.manifiesto.nota}</p>}
    </header>
    {finales.length > 0 && <section aria-label="Finales">
      <h4>Finales {videosDe(finales).length >= 2 && <button type="button" className={v.lado} onClick={() => comparar(finales)}><Columns2 size={13} aria-hidden />Verlos juntos</button>}</h4>
      <div className={v.tarjetasGrandes}>{finales.map(it => <Tarjeta key={it.ruta} it={it} grande alAbrir={() => abrirItem(it)} />)}</div>
    </section>}
    {piezas.length > 0 && <section aria-label="Piezas">
      <h4>{finales.length ? 'Piezas' : 'Archivos'} {videosDe(piezas).length >= 2 && <button type="button" className={v.lado} onClick={() => comparar(piezas)}><Columns2 size={13} aria-hidden />Comparar versiones</button>}</h4>
      <div className={v.tarjetas}>{piezas.map(it => <Tarjeta key={it.ruta} it={it} alAbrir={() => abrirItem(it)} />)}</div>
    </section>}
  </div>
}

function Tarjeta({ it, grande, alAbrir }: { it: ItemCarpeta; grande?: boolean; alAbrir: () => void }) {
  const [dur, setDur] = useState<number | null>(null)
  const carpeta = it.relativa.includes('/') ? it.relativa.slice(0, it.relativa.lastIndexOf('/')) : ''
  return <button type="button" className={v.tarjeta} data-grande={grande || undefined} data-clase={it.clase} data-ruta={it.ruta} onClick={alAbrir} title={it.relativa}>
    <span className={v.portada}>
      {it.clase === 'video' && it.url && <><video src={`${it.url}#t=0.1`} muted playsInline preload="metadata" onLoadedMetadata={e => setDur(e.currentTarget.duration)} /><i className={v.jugar}><Play size={grande ? 20 : 14} aria-hidden /></i>
        {dur != null && <em>{Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, '0')}</em>}</>}
      {it.clase === 'imagen' && (it.imagen ? <ImagenRapida meta={it.imagen} alt="" ajuste="cover" lazy style={{ width: '100%', height: '100%' }} /> : it.url ? <img src={it.url} alt="" loading="lazy" /> : null)}
      {it.clase === 'pdf' && <Presentation size={grande ? 30 : 22} aria-hidden />}
      {it.clase === 'audio' && <AudioLines size={grande ? 30 : 22} aria-hidden />}
      {(it.clase === 'documento' || it.clase === 'otro') && <FileText size={grande ? 30 : 22} aria-hidden />}
    </span>
    <span className={v.tarjetaTexto}><b>{it.nombre}</b><small>{carpeta ? `${carpeta} · ` : ''}{pesoLegible(it.bytes)}</small></span>
  </button>
}
