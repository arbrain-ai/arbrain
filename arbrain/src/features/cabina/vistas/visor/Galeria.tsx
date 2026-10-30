'use client'
/**
 * Imágenes del visor único (8 oct 2026): la imagen que pediste con las demás de su carpeta a un lado (← →), y, si hay una
 * segunda (compararCon), un deslizador antes/después. Pantalla completa con zoom la sigue poniendo documento.module.css
 * (VisorImagen en Documento.tsx); aquí vive lo nuevo.
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ImagenRapida } from '@/shared/components/ImagenRapida'
import { urlVariante, type MetaImagen } from '@/lib/imagenes/variantes'
import v from './visor.module.css'

export interface ImagenItem { nombre: string; ruta: string; url: string; imagen: MetaImagen | null }

export function Galeria({ hermanas, total, rutaActual, comparada, abrirGrande }: {
  hermanas: ImagenItem[]; total: number; rutaActual: string; comparada?: { ruta: string; archivo: string; url: string; imagen: MetaImagen | null } | { error: string }
  abrirGrande: (i: ImagenItem) => void
}) {
  const inicial = Math.max(0, hermanas.findIndex(h => h.ruta === rutaActual))
  const [i, setI] = useState(inicial)
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => { setI(Math.max(0, hermanas.findIndex(h => h.ruta === rutaActual))) }, [rutaActual]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = hermanas[Math.min(i, hermanas.length - 1)]
  if (!act) return null
  const ir = (d: number) => setI(x => Math.min(hermanas.length - 1, Math.max(0, x + d)))
  const dosEnUna = comparada && 'url' in comparada && i === inicial ? comparada : null
  return <div ref={raiz} className={v.galeria} tabIndex={0} aria-label="Imágenes" onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); ir(1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(-1) } }}>
    {comparada && 'error' in comparada && <p className={v.aviso}>{comparada.error}</p>}
    {dosEnUna ? <Deslizador antes={{ ...act }} despues={{ nombre: dosEnUna.archivo, ruta: dosEnUna.ruta, url: dosEnUna.url, imagen: dosEnUna.imagen }} />
      : <button type="button" className={v.imagenGrande} onClick={() => abrirGrande(act)} aria-label={`Ampliar ${act.nombre}`}>
        {act.imagen ? <ImagenRapida meta={act.imagen} alt={act.nombre} altoMax="62vh" style={{ margin: '0 auto', borderRadius: 10 }} /> : <img src={act.url} alt={act.nombre} />}
      </button>}
    <div className={v.pieGaleria}>
      <span><b>{dosEnUna ? `${act.nombre} contra ${dosEnUna.archivo}` : act.nombre}</b>{act.imagen && !dosEnUna ? ` · ${act.imagen.ancho}×${act.imagen.alto}` : ''}</span>
      {hermanas.length > 1 && <span className={v.contador}>{inicial === i && total > hermanas.length ? '' : ''}{i + 1} de {hermanas.length}{total > hermanas.length ? ` (carpeta: ${total})` : ''}</span>}
    </div>
    {hermanas.length > 1 && <div className={v.tira}>
      <button type="button" className={v.mini} onClick={() => ir(-1)} disabled={i === 0} aria-label="Imagen anterior"><ChevronLeft size={15} aria-hidden /></button>
      <div className={v.miniaturasImg} role="listbox" aria-label="Imágenes de la carpeta">
        {hermanas.map((h, k) => <button key={h.ruta} type="button" role="option" aria-selected={k === i} data-actual={k === i || undefined} onClick={() => setI(k)} title={h.nombre}
          ref={el => { if (el && k === i) el.scrollIntoView({ block: 'nearest', inline: 'center' }) }}>
          {h.imagen ? <img src={urlVariante(h.imagen.hash, 160, 'webp')} alt="" loading="lazy" style={{ backgroundColor: h.imagen.color }} /> : <img src={h.url} alt="" loading="lazy" />}
        </button>)}
      </div>
      <button type="button" className={v.mini} onClick={() => ir(1)} disabled={i === hermanas.length - 1} aria-label="Imagen siguiente"><ChevronRight size={15} aria-hidden /></button>
    </div>}
  </div>
}

/** Antes/después: la segunda imagen se descubre a la derecha de la línea. Arrastrar, o ← → con foco. */
function Deslizador({ antes, despues }: { antes: ImagenItem; despues: ImagenItem }) {
  const [x, setX] = useState(50)
  const caja = useRef<HTMLDivElement>(null)
  const ancla = antes.imagen
  const poner = (e: { clientX: number }) => { const r = caja.current!.getBoundingClientRect(); setX(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))) }
  const arrastrando = useRef(false)
  return <div className={v.deslizador}>
    <div className={v.deslizadorMarco} ref={caja} style={ancla ? { aspectRatio: `${ancla.ancho} / ${ancla.alto}` } : undefined}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); arrastrando.current = true; poner(e) }} onPointerMove={e => { if (arrastrando.current) poner(e) }} onPointerUp={() => { arrastrando.current = false }}>
      <img src={antes.url} alt={antes.nombre} draggable={false} />
      <div className={v.encima} style={{ clipPath: `inset(0 0 0 ${x}%)` }}><img src={despues.url} alt={despues.nombre} draggable={false} /></div>
      <span className={v.etiquetaIzq}>{antes.nombre}</span><span className={v.etiquetaDer}>{despues.nombre}</span>
      <div className={v.linea} style={{ left: `${x}%` }} role="slider" tabIndex={0} aria-label="Comparar imágenes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x)}
        onKeyDown={e => { if (e.key === 'ArrowLeft') setX(p => Math.max(0, p - 2)); else if (e.key === 'ArrowRight') setX(p => Math.min(100, p + 2)) }}><i /></div>
    </div>
  </div>
}
