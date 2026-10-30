'use client'
/**
 * ImagenRapida (5 oct 2026): la forma de pintar cualquier imagen que Levy enseña. Ver lib/imagenes/variantes.ts.
 *
 *  · Al instante: el color dominante y un placeholder borroso de ~200 bytes que ya viene en la ficha.
 *  · Mide su caja y pide la variante justa en AVIF (WebP de respaldo), 1x y 2x por densidad de pantalla.
 *  · La caja tiene la proporción de la imagen desde el primer pintado: nada salta al llegar.
 *  · El clic (lo pone quien la usa) abre la original.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { anchoVariante, pxNecesarios, srcSetDe, urlInfoImagen, urlVariante, type MetaImagen } from '@/lib/imagenes/variantes'

export interface PropsImagenRapida {
  meta: MetaImagen
  alt: string
  /** contain: la imagen entera con su proporción. cover: llena una caja que define quien la usa (miniaturas). */
  ajuste?: 'contain' | 'cover'
  /** Solo contain: alto máximo en CSS ('72vh', '300px'); el ancho se ajusta para respetar la proporción. */
  altoMax?: string
  className?: string
  style?: CSSProperties
  lazy?: boolean
}

export function ImagenRapida(props: PropsImagenRapida) {
  return <Interna key={props.meta.hash} {...props} />
}

const llenar: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', margin: 0 }

function Interna({ meta, alt, ajuste = 'contain', altoMax, className, style, lazy }: PropsImagenRapida) {
  const caja = useRef<HTMLSpanElement>(null)
  const [px, setPx] = useState(0)
  const [lista, setLista] = useState(false)

  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    // Solo crece: achicar la ventana no vuelve a bajar una variante menor que ya no hace falta.
    const medir = () => { const r = el.getBoundingClientRect(); const n = pxNecesarios({ ancho: r.width, alto: r.height }, meta, ajuste); if (n > 0) setPx(p => Math.max(p, Math.ceil(n))) }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [meta, ajuste])

  const contenedor: CSSProperties = ajuste === 'contain'
    ? { aspectRatio: `${meta.ancho} / ${meta.alto}`, width: altoMax ? `min(100%, ${meta.ancho}px, calc(${altoMax} * ${meta.ancho / meta.alto}))` : `min(100%, ${meta.ancho}px)` }
    : {}

  return <span ref={caja} className={className} data-imagen-rapida={lista ? 'lista' : 'cargando'}
    style={{ display: 'block', position: 'relative', overflow: 'hidden', backgroundColor: meta.color, ...contenedor, ...style }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={meta.placeholder} alt="" aria-hidden draggable={false}
      style={{ ...llenar, objectFit: ajuste, filter: 'blur(14px)', transform: 'scale(1.12)', borderRadius: 0 }} />
    {px > 0 && <picture>
      <source type="image/avif" srcSet={srcSetDe(meta, px, 'avif')} />
      <source type="image/webp" srcSet={srcSetDe(meta, px, 'webp')} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urlVariante(meta.hash, anchoVariante(px, meta.ancho), 'webp')} alt={alt} decoding="async" loading={lazy ? 'lazy' : undefined}
        draggable={false} onLoad={() => setLista(true)}
        style={{ ...llenar, objectFit: ajuste, opacity: lista ? 1 : 0, transition: 'opacity .3s ease', borderRadius: 0 }} />
    </picture>}
  </span>
}

// ── Ficha de una imagen que no vino con su vista (chat) ──

const fichas = new Map<string, Promise<MetaImagen | null>>()

function pedirFicha(url: string): Promise<MetaImagen | null> {
  let p = fichas.get(url)
  if (!p) {
    p = fetch(url, { credentials: 'same-origin' })
      .then(r => (r.ok ? (r.json() as Promise<MetaImagen>) : null))
      .catch(() => null)
      .then(m => { if (!m) fichas.delete(url); return m })
    fichas.set(url, p)
  }
  return p
}

/** null = no hay nada que optimizar (o falló): quien llama pinta la imagen tal cual. `listo` = ya se sabe. */
export function useMetaImagen(origen: { ruta: string } | { url: string } | null): { meta: MetaImagen | null; listo: boolean } {
  const url = origen ? urlInfoImagen(origen) : null
  const [estado, setEstado] = useState<{ url: string | null; meta: MetaImagen | null }>({ url: null, meta: null })
  useEffect(() => {
    if (!url) return
    let vivo = true
    void pedirFicha(url).then(meta => { if (vivo) setEstado({ url, meta }) })
    return () => { vivo = false }
  }, [url])
  return { meta: estado.url === url ? estado.meta : null, listo: !url || estado.url === url }
}
