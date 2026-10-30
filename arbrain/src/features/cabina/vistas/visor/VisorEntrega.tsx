'use client'
/**
 * Carpeta de entrega (8 oct 2026): abrir una carpeta y verla como lo que es, una ENTREGA. Primero lo que se va a usar
 * (los finales), después las piezas del camino. Si la carpeta trae `entrega.json` ({titulo, finales, piezas, nota}) manda;
 * si no, se deduce por nombre (finales/, final-*, export-*; v1 < v2 < v2.1). Cada tarjeta se abre en el visor que le toca, sin
 * salir de aquí; los videos de un mismo grupo se abren juntos para compararlos (versiones, o horizontal y vertical).
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, AudioLines, Columns2, FileText, Play, Presentation } from 'lucide-react'
import { ImagenRapida } from '@/shared/components/ImagenRapida'
import type { MetaImagen } from '@/lib/imagenes/variantes'
import { ordenarEntrega, pesoLegible, type ItemEntrega } from '../../documento/medio'
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

export function VisorEntrega({ data, abrir, grande }: { data: Entrega; abrir: (input: MostrarInput) => React.ReactNode; grande?: boolean }) {
  const [abierto, setAbierto] = useState<MostrarInput | null>(null)
  const { finales, piezas } = useMemo(() => repartir(data.items, data.manifiesto), [data.items, data.manifiesto])
  const titulo = data.manifiesto?.titulo ?? data.archivo
  const videosDe = (grupo: ItemCarpeta[]) => grupo.filter(i => i.clase === 'video')
  const abrirItem = (it: ItemCarpeta, grupo: ItemCarpeta[]) => {
    const otros = it.clase === 'video' ? videosDe(grupo).filter(x => x.ruta !== it.ruta).map(x => x.ruta) : []
    setAbierto({ vista: 'documento', ruta: it.ruta, titulo: it.nombre, ...(otros.length ? { versiones: otros.slice(0, 5) } : {}) })
  }
  const comparar = (grupo: ItemCarpeta[]) => { const vs = videosDe(grupo); if (vs.length >= 2) setAbierto({ vista: 'documento', ruta: vs[0].ruta, titulo: 'Versiones', versiones: vs.slice(1, 6).map(x => x.ruta), compararCon: vs[1].ruta }) }

  if (abierto) return <div className={v.entregaAbierta}>
    <button type="button" className={v.volver} onClick={() => setAbierto(null)}><ArrowLeft size={14} aria-hidden />{titulo}</button>
    {abrir(abierto)}
  </div>

  const vacio = !finales.length && !piezas.length
  return <div className={v.entrega} data-grande={grande || undefined}>
    <header className={v.entregaCabeza}>
      <h3>{titulo}</h3>
      <p>{vacio ? 'Esta carpeta no tiene nada que el visor pueda abrir.' : `${finales.length === 1 ? '1 final' : `${finales.length} finales`} · ${piezas.length === 1 ? '1 pieza' : `${piezas.length} piezas`}${data.recortado ? ' · lista recortada' : ''}`}</p>
      {data.manifiesto?.nota && <p className={v.entregaNota}>{data.manifiesto.nota}</p>}
    </header>
    {finales.length > 0 && <section aria-label="Finales">
      <h4>Finales {videosDe(finales).length >= 2 && <button type="button" className={v.lado} onClick={() => comparar(finales)}><Columns2 size={13} aria-hidden />Verlos juntos</button>}</h4>
      <div className={v.tarjetasGrandes}>{finales.map(it => <Tarjeta key={it.ruta} it={it} grande alAbrir={() => abrirItem(it, finales)} />)}</div>
    </section>}
    {piezas.length > 0 && <section aria-label="Piezas">
      <h4>{finales.length ? 'Piezas' : 'Archivos'} {videosDe(piezas).length >= 2 && <button type="button" className={v.lado} onClick={() => comparar(piezas)}><Columns2 size={13} aria-hidden />Comparar versiones</button>}</h4>
      <div className={v.tarjetas}>{piezas.map(it => <Tarjeta key={it.ruta} it={it} alAbrir={() => abrirItem(it, piezas)} />)}</div>
    </section>}
  </div>
}

function Tarjeta({ it, grande, alAbrir }: { it: ItemCarpeta; grande?: boolean; alAbrir: () => void }) {
  const [dur, setDur] = useState<number | null>(null)
  const carpeta = it.relativa.includes('/') ? it.relativa.slice(0, it.relativa.lastIndexOf('/')) : ''
  return <button type="button" className={v.tarjeta} data-grande={grande || undefined} data-clase={it.clase} onClick={alAbrir} title={it.relativa}>
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
