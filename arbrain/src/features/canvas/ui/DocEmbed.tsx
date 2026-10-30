'use client'
/**
 * Canvas v4 — un `doc:….html` VIVO dentro del lienzo (3 oct 2026).
 *
 * El mismo objeto que pinta sfmap (EmbedHTML.swift): el HTML tiene un viewport
 * LOGICO fijo de 1440 px de ancho y la camara lo ESCALA entero, sin remaquetar
 * la pagina. Asi el pergamino se ve igual a cualquier zoom y en los dos lados.
 *
 * El archivo se pide a `/api/canvas/doc`, que solo resuelve dentro del repo, y
 * llega con una URL firmada del lector de documentos: iframe sin mismo origen
 * (`sandbox="allow-scripts"`), assets solo de su carpeta. Nada se copia.
 */
import { useEffect, useState } from 'react'
import type { EmbedElement, Camera } from '../model/element'
import type { Theme } from '../theme/tokens'
import { worldToScreen, type Viewport } from '../render/viewport'
import { esHTML, leerLigaDoc } from '../model/doc'

const ANCHO_LOGICO = 1440

interface Resuelto { ok: boolean; url?: string | null; tipo?: string; archivo?: string; hash?: string; fragmento?: string | null; error?: string }
const cache = new Map<string, Promise<Resuelto>>()

export function resolverDoc(liga: string): Promise<Resuelto> {
  let p = cache.get(liga)
  if (!p) {
    p = fetch(`/api/canvas/doc?liga=${encodeURIComponent(liga)}`)
      .then(r => r.json() as Promise<Resuelto>)
      .catch(() => ({ ok: false, error: 'sin conexión' }))
    cache.set(liga, p)
    // Un fallo no se queda pegado: la proxima vez se vuelve a preguntar.
    void p.then(r => { if (!r.ok) setTimeout(() => cache.delete(liga), 10_000) })
  }
  return p
}

/** ¿Este embed es un documento del repo? (los demas son URLs normales) */
export const esEmbedDoc = (e: EmbedElement) => !!leerLigaDoc(e.url)

export function DocEmbed({ el, camera, viewport, theme }: {
  el: EmbedElement; camera: Camera; viewport: Viewport; theme: Theme
}) {
  const [doc, setDoc] = useState<Resuelto | null>(null)
  useEffect(() => {
    let vivo = true
    setDoc(null)
    void resolverDoc(el.url).then(r => { if (vivo) setDoc(r) })
    return () => { vivo = false }
  }, [el.url])

  const tl = worldToScreen({ x: el.x, y: el.y }, camera, viewport)
  const w = el.width * camera.zoom, h = el.height * camera.zoom
  // Fuera de la vista no se monta: un pergamino pesado detras del borde no debe costar nada.
  if (tl.x > viewport.width || tl.y > viewport.height || tl.x + w < 0 || tl.y + h < 0) return null
  const escala = w / ANCHO_LOGICO
  const ruta = leerLigaDoc(el.url)?.ruta ?? ''
  const html = doc?.ok && doc.tipo === 'html' && doc.url

  return (
    <div data-doc-embed={ruta} data-doc-estado={doc ? (doc.ok ? 'listo' : 'error') : 'cargando'}
      /* Activado, la rueda es del documento: el lienzo no la toma (Pizarra, listener de rueda). */
      data-canvas-scroll={el.interactive ? '' : undefined}
      style={{
        position: 'absolute', left: tl.x, top: tl.y, width: w, height: h,
        overflow: 'hidden', borderRadius: 8, background: theme.roles.card.fill,
        pointerEvents: el.interactive ? 'auto' : 'none',
      }}>
      {html ? (
        <iframe key={doc.hash} title={doc.archivo ?? ruta} sandbox="allow-scripts"
          src={doc.url + (doc.fragmento ? `#${doc.fragmento}` : '')}
          style={{
            width: ANCHO_LOGICO, height: ANCHO_LOGICO * el.height / Math.max(1, el.width),
            border: 'none', transform: `scale(${escala})`, transformOrigin: '0 0', background: '#fff',
          }} />
      ) : (
        <div style={{
          height: '100%', display: 'grid', placeItems: 'center', padding: 12, textAlign: 'center',
          color: theme.text.caption, font: `600 ${Math.max(9, Math.min(14, 13 * camera.zoom))}px CanvasSans, system-ui`,
        }}>
          {!doc ? 'Abriendo el documento…'
            : !doc.ok ? `${ruta} · ${doc.error ?? 'no se pudo abrir'}`
            : !esHTML(ruta) ? `${doc.archivo} · ⌘ + clic para abrirlo en el panel`
            : `${ruta} · no se pudo pintar`}
        </div>
      )}
    </div>
  )
}
