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
 *
 * MAPA v16 (14 nov 2026): si el HTML trae `isla.json` al lado, es una ISLA (features/canvas/islas) y la pinta `IslaEmbed`:
 * foto en el canvas mientras la cámara se mueve o está lejos, iframe vivo (y tocable sin doble clic) cuando descansa
 * cerca, con puente de acciones y datos. Lo demás (la v15, cualquier `doc:` de hoy) sigue exactamente igual.
 */
import { useEffect, useRef, useState } from 'react'
import type { EmbedElement, Camera } from '../model/element'
import type { Theme } from '../theme/tokens'
import { worldToScreen, type Viewport } from '../render/viewport'
import { esHTML, leerLigaDoc } from '../model/doc'
import { tr, trMarca } from '@/shared/i18n'
import type { FichaIsla } from '../islas/protocolo'
import { useEstadoIsla, type InfoIsla, type Islas, type Nativa } from '../islas/useIslas'
import { IslaNativa } from '../islas/bloques/registro'
import { encajar } from '../islas/bloques/pintar'
import { anotarIsla } from '../render/sonda'
import type { CamaraViva } from './CamaraViva'

const ANCHO_LOGICO = 1440

interface Resuelto { ok: boolean; url?: string | null; tipo?: string; archivo?: string; hash?: string; fragmento?: string | null; error?: string; isla?: FichaIsla }
const cache = new Map<string, Promise<Resuelto>>()

export function resolverDoc(liga: string): Promise<Resuelto> {
  let p = cache.get(liga)
  if (!p) {
    p = fetch(`/api/canvas/doc?liga=${encodeURIComponent(liga)}`)
      .then(r => r.json() as Promise<Resuelto>)
      .catch(() => ({ ok: false, error: trMarca('sin conexión') }))
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
  // Una isla la pinta IslaEmbed (la Pizarra ya la apartó; esto cubre el cuadro en que la ficha acaba de llegar).
  if (doc?.isla) return null
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
          {!doc ? tr('Abriendo el documento…')
            : !doc.ok ? `${ruta} · ${doc.error ? tr(doc.error) : tr('no se pudo abrir')}`
            : !esHTML(ruta) ? tr('{archivo} · ⌘ + clic para abrirlo en el panel', { archivo: doc.archivo })
            : tr('{ruta} · no se pudo pintar', { ruta })}
        </div>
      )}
    </div>
  )
}

/**
 * Una ISLA del mapa v16. Su iframe existe solo mientras está montada (LRU de `vida.ts`, o revelándose para su foto); fuera
 * de eso no cuesta nada y el lienzo pinta su foto. Despierta = visible, animando y tocable SIN doble clic (los botones son
 * el punto). Dormida = el mismo documento vivo pero oculto y en pausa: despertarla es mostrarla, sin recargar.
 *
 * Se posiciona con un solo `transform` (traslado y escala del ancho lógico de su ficha) y no sigue a la cámara por
 * cuadro: despierta solo con la cámara quieta, y al primer movimiento se duerme.
 */
export function IslaEmbed({ el, info, islas, camViva, viewport, temaInicial }: {
  el: EmbedElement; info: InfoIsla; islas: Islas; camViva: CamaraViva; viewport: Viewport; temaInicial: string
}) {
  const estado = useEstadoIsla(islas.vida, el.id)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  // El tema con el que nace el iframe: el script del tema lo aplica antes de pintar (sin destello). Después, por mensaje.
  const [tema0] = useState(temaInicial)
  const montada = estado !== 'fuera'
  useEffect(() => {
    const f = frameRef.current
    if (!montada || !f?.contentWindow) return
    // La ventana del iframe es la misma antes y después de navegar: se registra al montar, así el primer «hola» ya llega.
    const baja = islas.puente.registrar(el.id, info.ruta, info.hash, info.ficha, f.contentWindow, islas.vida.estadoDe(el.id) === 'despierta')
    islas.registrarFrame(el.id, f)
    return () => { baja(); islas.registrarFrame(el.id, null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montada, el.id, info.ruta, info.hash, info.url])
  if (!montada) return null
  const despierta = estado === 'despierta'
  const cam = camViva.ref.current
  const tl = worldToScreen({ x: el.x, y: el.y }, cam, viewport)
  const ancho = info.ficha.ancho
  const alto = Math.round(ancho * el.height / Math.max(1, el.width))
  const s = (el.width * cam.zoom) / ancho
  const src = `${info.url}${info.url.includes('?') ? '&' : '?'}tema=${tema0}`
  return (
    <div data-isla={info.ficha.id} data-isla-estado={estado}
      style={{
        position: 'absolute', left: 0, top: 0, width: ancho, height: alto,
        transform: `translate(${tl.x}px, ${tl.y}px) scale(${s})`, transformOrigin: '0 0',
        visibility: despierta ? 'visible' : 'hidden', pointerEvents: despierta ? 'auto' : 'none',
        borderRadius: 8 / Math.max(0.01, s), overflow: 'hidden', contain: 'strict',
      }}>
      <iframe ref={frameRef} key={info.hash} title={info.ficha.titulo} sandbox="allow-scripts" src={src}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: 'transparent', colorScheme: 'normal' }} />
    </div>
  )
}

/**
 * Una isla NATIVA (receta de bloques de la app, mapa v16). Montada solo en su turno de vida (LRU); despierta = visible,
 * animando y tocable; dormida = montada, oculta y en pausa. Lo que se ve de lejos o en movimiento lo dibuja el canvas
 * (`islas/bloques/pintar.ts`) en las mismas cajas. Los botones (`data-control`) no inician gestos del lienzo; el resto de
 * la isla sí (se puede panear o seleccionar desde ella).
 */
export function IslaNativaEmbed({ el, nativa, islas, camViva, viewport }: {
  el: EmbedElement; nativa: Nativa; islas: Islas; camViva: CamaraViva; viewport: Viewport
}) {
  const estado = useEstadoIsla(islas.vida, el.id)
  const lista = nativa.lista
  // La latencia de despertar se mide hasta el PRIMER CUADRO pintado con la isla visible (dos rAF tras el commit).
  useEffect(() => {
    if (estado !== 'despierta') return
    let a = 0, b = 0
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => anotarIsla('despertar', { isla: el.id, nativa: true })) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [estado, el.id])
  if (estado === 'fuera' || !lista) return null
  const despierta = estado === 'despierta'
  const cam = camViva.ref.current
  const { k, dx, dy } = encajar(el, lista)
  const tl = worldToScreen({ x: el.x + dx, y: el.y + dy }, cam, viewport)
  const s = k * cam.zoom
  return (
    <div data-isla={lista.receta.id} data-isla-estado={estado}
      onPointerDown={e => { if ((e.target as HTMLElement).closest?.('[data-control]')) e.stopPropagation() }}
      onDoubleClick={e => { if ((e.target as HTMLElement).closest?.('[data-control]')) e.stopPropagation() }}>
      <IslaNativa isla={lista} almacen={islas.almacen} ir={islas.ir} vivo={despierta}
        estilo={{
          position: 'absolute', left: 0, top: 0, transform: `translate(${tl.x}px, ${tl.y}px) scale(${s})`, transformOrigin: '0 0',
          visibility: despierta ? 'visible' : 'hidden', pointerEvents: despierta ? 'auto' : 'none',
        }} />
    </div>
  )
}
