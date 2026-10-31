'use client'

/**
 * Miniaturas de los lienzos (6 oct 2026, v4): la imagen a la izquierda de cada fila de «¿Qué lienzo?» y de la sección.
 *
 * Se genera en el navegador con el mismo render del export (`exportarPNG`, canvas aparte: sin guías ni selección) a un lado
 * mayor de ~400 px, en webp ≤ 300 KB, y se sube por `/api/draw3/[id]/thumbnail` (bucket `draw-thumbnails`, columna
 * `draw.thumbnail_url`). Dos caminos:
 *   · AL GUARDAR, con rebote: tras el último guardado de un lienzo pasan `REBOTE_MS` y se regenera (editar no la pide en cada trazo).
 *   · BACKFILL: los lienzos sin miniatura se rellenan de uno en uno, en reposo, al abrir la lista. Una vez por sesión y lienzo.
 * Una miniatura que falla no rompe nada: la fila muestra su placeholder.
 * Edición cliente (30 oct 2026): la misma imagen va a `/api/canvas/miniatura/[id]`, que la guarda en su carpeta de datos
 * (`/api/draw3` vive en Supabase y ahí no existe).
 */
import type { CanvasElement } from '../model/element'
import { exportarPNG } from '../render/export'
import { THEMES, type Theme } from '../theme/tokens'
import { waitForFonts } from '../text/metrics-browser'
import type { TextStyle } from '../text/types'
import { cargarPagina } from './nube'
import { esEdicionCliente } from '@/lib/edicion'

export const LADO_MINIATURA = 400
/** El servidor rechaza más de 300 KB; se apunta debajo para que el base64 y el redondeo no lo rocen. */
export const MAX_BYTES = 280 * 1024
const REBOTE_MS = 8_000
const INTENTOS = [{ lado: LADO_MINIATURA, calidad: 0.82 }, { lado: LADO_MINIATURA, calidad: 0.6 }, { lado: 280, calidad: 0.5 }]

const aDataUrl = (b: Blob) => new Promise<string>((ok, no) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(b)
})

/** La miniatura como data URL (webp; PNG si el navegador no sabe webp) o null si no hay nada que dibujar o no cabe en 300 KB. */
export async function generarMiniatura(elements: CanvasElement[], theme: Theme): Promise<string | null> {
  for (const { lado, calidad } of INTENTOS) {
    const blob = await exportarPNG(elements, theme, { escala: 4, ladoMax: lado, margen: 32, mime: 'image/webp', calidad })
    if (!blob) return null
    if (blob.size <= MAX_BYTES) return aDataUrl(blob)
  }
  return null
}

export async function subirMiniatura(paginaId: string, dataUrl: string): Promise<string> {
  const destino = esEdicionCliente() ? `/api/canvas/miniatura/${paginaId}` : `/api/draw3/${paginaId}/thumbnail`
  const r = await fetch(destino, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) })
  const j = await r.json().catch(() => ({})) as { thumbnail_url?: string; error?: string }
  if (!r.ok || !j.thumbnail_url) throw new Error(j.error ?? `miniatura: error ${r.status}`)
  return j.thumbnail_url
}

// ── quién se entera de una miniatura nueva (la lista abierta cambia la imagen sin releer todo)
type Oyente = (paginaId: string, url: string) => void
const oyentes = new Set<Oyente>()
export const alMiniatura = (fn: Oyente) => { oyentes.add(fn); return () => { oyentes.delete(fn) } }
const avisar = (id: string, url: string) => oyentes.forEach(fn => fn(id, url))

const FUENTES: TextStyle[] = [{ family: 'montserrat', weight: 400, size: 20 }, { family: 'montserrat', weight: 700, size: 24 }, { family: 'roboto-slab', weight: 900, size: 24 }]

async function hacer(id: string, elements: CanvasElement[], theme: Theme) {
  if (elements.length === 0) return
  await waitForFonts(FUENTES).catch(() => {})
  const dataUrl = await generarMiniatura(elements, theme)
  if (!dataUrl) return
  avisar(id, await subirMiniatura(id, dataUrl))
}

// ── al guardar
const rebotes = new Map<string, ReturnType<typeof setTimeout>>()
/** Regenera la miniatura de `id` `REBOTE_MS` después del último llamado. `lectura` entrega lo que haya en ese momento. */
export function programarMiniatura(id: string, lectura: () => { elements: CanvasElement[]; theme: Theme } | null) {
  clearTimeout(rebotes.get(id))
  rebotes.set(id, setTimeout(() => {
    rebotes.delete(id)
    const l = lectura()
    if (l) hacer(id, l.elements, l.theme).catch(e => console.warn('[lienzo] miniatura no generada', id, e))
  }, REBOTE_MS))
}

// ── backfill
/** Pura: los que piden miniatura, en el orden recibido (la lista llega por fecha), sin repetir lo ya intentado. */
export function sinMiniatura<P extends { id: string; elementos: number; miniatura: string | null }>(paginas: P[], intentadas: ReadonlySet<string>): P[] {
  return paginas.filter(x => !x.miniatura && x.elementos > 0 && !intentadas.has(x.id))
}

const intentadas = new Set<string>()
let corriendo = false
const enReposo = () => new Promise<void>(ok => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => ok(), { timeout: 1500 }) : setTimeout(ok, 120)))

/**
 * Rellena, de uno en uno y en reposo, las miniaturas que faltan. Un solo bucle por aplicación aunque lo pidan la lista del panel
 * y la sección a la vez. Una página del canvas anterior se dibuja con el tema con el que se hizo; el resto, con `temaApp`.
 */
export async function rellenarMiniaturas<P extends { id: string; elementos: number; miniatura: string | null }>(paginas: P[], temaApp: Theme) {
  if (corriendo) return
  corriendo = true
  try {
    for (const x of sinMiniatura(paginas, intentadas)) {
      if (typeof document !== 'undefined' && document.hidden) return   // sin nadie mirando no se gasta; se retoma al volver a abrir
      intentadas.add(x.id)
      await enReposo()
      try {
        const pag = await cargarPagina(x.id)
        await hacer(x.id, pag.elements, pag.tema ? THEMES[pag.tema] : temaApp)
      } catch (e) { console.warn('[lienzo] miniatura no generada', x.id, e) }
    }
  } finally { corriendo = false }
}
