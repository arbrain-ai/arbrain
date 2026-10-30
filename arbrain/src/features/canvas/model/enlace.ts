/**
 * LA PASTILLA DEL ENLACE (8 oct 2026).
 *
 * Antes cada elemento con `link` llevaba un círculo morado de tamaño fijo en pantalla: al alejar la cámara se comía las
 * tarjetas y no decía qué era. Daniel: «esos links morados ocupan tanto espacio, no sé qué son». Ahora es una pastilla
 * pequeña que dice a dónde lleva («Ver en calendario ↗»), dentro de la esquina de su tarjeta; si a ese zoom no cabe, no
 * se pinta (la tarjeta manda). Un clic la abre DENTRO de Arbrain, como pestaña del panel en la ventana de «Dónde abre
 * Levy»: las vistas internas y los documentos nunca abren el navegador. Solo un sitio de fuera sale de la app.
 *
 * Puro: sin React ni DOM salvo la medida del texto, que tiene respaldo sin canvas (tests/canvas/enlace.test.ts).
 */
import type { MostrarInput, Vista } from '@/features/cabina/model'
import type { CanvasElement } from './element'
import { leerLigaDoc } from './doc'
import { accionDe, leerNervio, rotuloDe, type AccionNervio, type Semaforo, type VivoNervio } from './nervio'
import { instalacion } from '@/config'

export type DestinoEnlace =
  | { tipo: 'panel'; input: MostrarInput; etiqueta: string }
  | { tipo: 'fuera'; url: string; etiqueta: string }

/** Las rutas de las secciones de Arbrain y la vista del panel que las enseña (inversa de `rutaDe` en cabina/model.ts). */
const RUTAS: Record<string, Vista> = {
  '/calendar': 'calendario', '/masterclass': 'masterclass', '/salud': 'salud', '/finanzas': 'finanzas', '/youtube': 'contenido',
  '/lienzo': 'lienzo', '/equipo': 'equipo', '/segundo-cerebro': 'negocio', '/rutinas': 'rutinas', '/memoria': 'memoria', '/servidores': 'servidores',
}
const MODO: Record<string, MostrarInput['alcance']> = { day: 'dia', week: 'semana', month: 'mes' }

const ETIQUETA: Partial<Record<Vista, string>> = {
  calendario: 'Ver en calendario', masterclass: 'Ver masterclass', documento: 'Abrir documento', lienzo: 'Abrir lienzo',
  salud: 'Ver salud', finanzas: 'Ver finanzas', contenido: 'Ver contenido',
}
const FLECHA = ' ↗'

/** ¿Es Arbrain quien sirve esta URL? El Studio por Tailscale, la app de escritorio, local o un dominio propio de esta instalación (config/instalacion.ts › dominiosPropios). */
export function esDeArbrain(url: URL, origenPropio?: string): boolean {
  if (origenPropio && url.origin === origenPropio) return true
  const h = url.hostname
  return h.endsWith('.ts.net') || h === 'localhost' || h === '127.0.0.1' || h === 'tauri.localhost' || instalacion().dominiosPropios.some(d => h === d || h.endsWith(`.${d}`))
}

/** El destino de una liga: una pestaña del panel (todo lo de Arbrain) o, solo si es de fuera, el navegador. */
export function destinoDeEnlace(link: string | null | undefined, origenPropio?: string): DestinoEnlace | null {
  const s = (link ?? '').trim()
  if (!s) return null
  const doc = leerLigaDoc(s)
  if (doc) return { tipo: 'panel', input: { vista: 'documento', ruta: doc.ruta, titulo: doc.ruta.split('/').pop() }, etiqueta: ETIQUETA.documento! + FLECHA }
  if (/^page:/i.test(s)) {
    const paginaId = s.slice(5).trim()
    return paginaId ? { tipo: 'panel', input: { vista: 'lienzo', paginaId }, etiqueta: ETIQUETA.lienzo! + FLECHA } : null
  }
  let url: URL
  try { url = new URL(s, s.startsWith('/') ? 'http://arbrain.local' : undefined) } catch { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const propia = s.startsWith('/') || esDeArbrain(url, origenPropio)
  const ruta = url.pathname.replace(/\/+$/, '') || '/'
  const vista = propia ? RUTAS[ruta] : undefined
  if (vista) {
    const q = url.searchParams
    const input: MostrarInput = { vista }
    if (vista === 'calendario') {
      const f = q.get('date'), m = q.get('mode')
      if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) input.fecha = f
      if (m && MODO[m]) input.alcance = MODO[m]
    }
    if (vista === 'lienzo') {
      const p = q.get('p')
      if (!p) return null
      input.paginaId = p
      const z = q.get('z'); if (z) input.zona = z
    }
    return { tipo: 'panel', input, etiqueta: (ETIQUETA[vista] ?? 'Abrir') + FLECHA }
  }
  return { tipo: 'fuera', url: url.href, etiqueta: 'Abrir' + FLECHA }
}

// ── Geometría: tamaño de PANTALLA, como el chrome; se omite si no cabe dentro de la tarjeta ──
export const PASTILLA = { alto: 22, tam: 11.5, padX: 9, margen: 8, punto: 7, glifo: 9, hueco: 6 } as const
export const FUENTE_PASTILLA = `600 ${PASTILLA.tam}px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`

const anchos = new Map<string, number>()
let ctxMedida: CanvasRenderingContext2D | null | undefined
/** Ancho en pantalla de la etiqueta. Sin canvas (tests, servidor), una aproximación holgada. */
export function anchoEtiqueta(etiqueta: string): number {
  const ya = anchos.get(etiqueta)
  if (ya !== undefined) return ya
  if (ctxMedida === undefined) {
    try { ctxMedida = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null } catch { ctxMedida = null }
  }
  let w = etiqueta.length * PASTILLA.tam * 0.58
  if (ctxMedida) { ctxMedida.font = FUENTE_PASTILLA; w = ctxMedida.measureText(etiqueta).width }
  anchos.set(etiqueta, w)
  return w
}

export interface Pastilla {
  id: string; link: string; etiqueta: string; x: number; y: number; width: number; height: number
  /** Nodo con nervio (model/nervio.ts): qué hace su clic, su glifo y el punto del semáforo. Ausente = enlace de siempre. */
  accion?: AccionNervio
  glifo?: 'play' | 'previa' | null
  semaforo?: Semaforo | null
}

/** ¿Lleva pastilla? Figuras, imágenes (por fuera, ver bajoLaImagen), secciones y embeds. El texto enlazado sigue con ⌘+clic: una pastilla por renglón sería ruido. */
const llevaPastilla = (e: CanvasElement) => (!!e.link || !!e.nervio) && e.type !== 'text' && e.type !== 'connector' && e.type !== 'ink'

const dentro = (a: CanvasElement, b: CanvasElement) =>
  a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5

interface Caja { x: number; y: number; width: number; height: number }
const cruza = (a: Caja, b: Caja) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * Lo que ya ocupa la tarjeta: sus piezas de encima y, del texto, solo lo que ocupan sus renglones (no la caja entera).
 * También lo que CRUZA su borde sin tener el centro dentro (14 oct 2026: el chip «HOY» del embudo va a caballo del
 * borde superior y la pastilla se le metía debajo). Lo que la contiene entera (su superficie) no cuenta.
 */
function ocupado(card: CanvasElement, elements: readonly CanvasElement[]): Caja[] {
  const out: Caja[] = []
  for (const o of elements) {
    if (o === card || o.type === 'connector' || o.type === 'frame' || o.zIndex < card.zIndex) continue
    const cx = o.x + o.width / 2, cy = o.y + o.height / 2
    const centroDentro = !(cx < card.x || cx > card.x + card.width || cy < card.y || cy > card.y + card.height)
    if (!centroDentro && (!cruza(o, card) || dentro(card, o))) continue
    if (o.type !== 'text') { out.push(o); continue }
    const lineas = o.lines ?? [o.text]
    const lh = o.height / Math.max(1, lineas.length)
    lineas.forEach((l, i) => {
      if (!l.trim()) return
      const w = Math.min(o.width, l.length * o.style.size * 0.56)
      const x = o.align === 'center' ? o.x + (o.width - w) / 2 : o.align === 'right' ? o.x + o.width - w : o.x
      out.push({ x, y: o.y + i * lh, width: w, height: lh })
    })
  }
  return out
}

/** Ancho en pantalla de una pastilla con nervio: punto del semáforo y glifo, más su texto. */
export function anchoPastilla(etiqueta: string, glifo: Pastilla['glifo'], semaforo: Pastilla['semaforo']): number {
  const extra = (semaforo ? PASTILLA.punto + PASTILLA.hueco : 0) + (glifo ? PASTILLA.glifo + (etiqueta ? PASTILLA.hueco : 0) : 0)
  return (etiqueta ? anchoEtiqueta(etiqueta) : 0) + extra + PASTILLA.padX * 2
}

/**
 * LA PASTILLA DE UNA IMAGEN VA POR FUERA (14 oct 2026). Daniel, con el QR de /aplicar en el Embudo: «mueve el botón de
 * abrir que no me permite probarlo desde el móvil». La pastilla en el rincón tapaba un ojo del QR y el teléfono ya no lo
 * leía. Una imagen es contenido entero (un QR, una captura, un diagrama): nada se pinta encima de ella. La pastilla se
 * cuelga DEBAJO, alineada a la derecha, pegada a su marco ceñido si lo tiene (el `marco` de P.imagen) y, si ahí hay un
 * pie u otra pieza, baja hasta el primer hueco libre. Nunca sube sobre la imagen.
 */
function bajoLaImagen(img: CanvasElement, elements: readonly CanvasElement[], w: number, h: number, zoom: number): Caja {
  const area = img.width * img.height
  // El marco ceñido: contiene la imagen y mide menos del doble (no la etapa ni el fondo de la sección).
  const marco = elements
    .filter(o => o !== img && o.type !== 'connector' && o.type !== 'text' && dentro(img, o) && o.width * o.height < area * 2)
    .reduce<Caja>((a, o) => (o.y + o.height > a.y + a.height ? o : a), img)
  const g = 6 / zoom
  // Lo que estorba debajo: piezas que no contienen a la imagen (las superficies sí la contienen y no cuentan) y, del
  // texto, solo sus renglones. Una pieza que cubre todo el hueco se salta entera.
  const estorbos: Caja[] = []
  for (const o of elements) {
    if (o === img || o.type === 'connector' || o.type === 'frame' || o.type === 'ink' || dentro(img, o)) continue
    if (o.type !== 'text') { estorbos.push(o); continue }
    const lineas = o.lines ?? [o.text]
    const lh = o.height / Math.max(1, lineas.length)
    lineas.forEach((l, i) => {
      if (!l.trim()) return
      const lw = Math.min(o.width, l.length * o.style.size * 0.56)
      const x = o.align === 'center' ? o.x + (o.width - lw) / 2 : o.align === 'right' ? o.x + o.width - lw : o.x
      estorbos.push({ x, y: o.y + i * lh, width: lw, height: lh })
    })
  }
  const caja: Caja = { x: marco.x + marco.width - w, y: marco.y + marco.height + g, width: w, height: h }
  for (let i = 0; i < 8; i++) {
    const choca = estorbos.filter(o => cruza(caja, o))
    if (!choca.length) break
    caja.y = Math.max(...choca.map(o => o.y + o.height)) + g
  }
  return caja
}

/**
 * Las pastillas a este zoom, en coordenadas de MUNDO. Una por destino y tarjeta: si un elemento con la misma liga vive
 * dentro de otro (el rótulo o la etiqueta de una tarjeta enlazada), solo la tarjeta de fuera la lleva.
 * Una IMAGEN la lleva por fuera, debajo (bajoLaImagen): nunca tapa su contenido. Una tarjeta busca el primer rincón LIBRE (arriba a la derecha, abajo a la derecha, abajo a la izquierda, arriba a la izquierda):
 * nunca tapa un renglón ni un chip de la tarjeta. Si ninguno está libre, se apoya sobre el borde de abajo, a la
 * derecha. Si la tarjeta es demasiado chica en pantalla, no hay pastilla (⌘+clic sigue abriendo la liga).
 *
 * Un nodo con NERVIO (model/nervio.ts) lleva su pastilla viva: punto del semáforo, glifo de play o de vista previa y
 * el rótulo. Si no cabe entera, se queda en lo mínimo (punto y glifo): el nodo sigue siendo un botón a cualquier zoom
 * en que se lea su tarjeta.
 */
export function pastillasDe(elements: readonly CanvasElement[], zoom: number, origenPropio?: string, vivo?: VivoNervio): Pastilla[] {
  const con = elements.filter(llevaPastilla)
  if (!con.length || !(zoom > 0)) return []
  const out: Pastilla[] = []
  for (const e of con) {
    const n = leerNervio(e.nervio)
    if (!n && !e.link) continue
    const imagen = e.type === 'image'
    if (!n && con.some(o => o !== e && o.link === e.link && dentro(e, o) && !(dentro(o, e) && o.id > e.id))) continue
    const d = e.link ? destinoDeEnlace(e.link, origenPropio) : null
    const accion = accionDe(n, d ? e.link : undefined)
    if (!accion) continue
    let etiqueta: string, glifo: Pastilla['glifo'] = null, semaforo: Pastilla['semaforo'] = null, wPx: number
    if (n) {
      const r = rotuloDe(n, accion, vivo, d?.etiqueta ?? null)
      glifo = r.glifo; semaforo = r.semaforo; etiqueta = r.completo
      wPx = anchoPastilla(etiqueta, glifo, semaforo)
      const cabe = (w: number) => imagen
        ? e.width * zoom >= w && e.height * zoom >= PASTILLA.alto * 2
        : e.width * zoom >= w + PASTILLA.margen * 2 && e.height * zoom >= PASTILLA.alto + PASTILLA.margen * 2
      if (!cabe(wPx)) {
        etiqueta = r.corto
        wPx = anchoPastilla(etiqueta, glifo, semaforo)
        if (!cabe(wPx) && (glifo || semaforo)) { etiqueta = ''; wPx = anchoPastilla('', glifo, semaforo) }
        else if (!cabe(wPx) && d) { etiqueta = d.etiqueta; wPx = anchoPastilla(etiqueta, null, null) }
        if (!cabe(wPx)) continue
      }
    } else {
      if (!d) continue
      etiqueta = d.etiqueta
      wPx = anchoEtiqueta(d.etiqueta) + PASTILLA.padX * 2
      if (imagen ? e.width * zoom < wPx || e.height * zoom < PASTILLA.alto * 2
        : e.width * zoom < wPx + PASTILLA.margen * 2 + 24 || e.height * zoom < PASTILLA.alto + PASTILLA.margen * 2) continue
    }
    const w = wPx / zoom, h = PASTILLA.alto / zoom, m = PASTILLA.margen / zoom
    if (imagen) {
      const p: Pastilla = { id: e.id, link: e.link ?? '', etiqueta, ...bajoLaImagen(e, elements, w, h, zoom) }
      if (n) { p.accion = accion; p.glifo = glifo; p.semaforo = semaforo }
      out.push(p)
      continue
    }
    const der = e.x + e.width - w - m, izq = e.x + m, arr = e.y + m, aba = e.y + e.height - h - m
    const rincones: Caja[] = [{ x: der, y: arr, width: w, height: h }, { x: der, y: aba, width: w, height: h },
      { x: izq, y: aba, width: w, height: h }, { x: izq, y: arr, width: w, height: h }]
    const lleno = ocupado(e, elements)
    const libre = rincones.find(r => !lleno.some(o => cruza(r, o))) ?? { x: der, y: e.y + e.height - h / 2, width: w, height: h }
    const p: Pastilla = { id: e.id, link: e.link ?? '', etiqueta, ...libre }
    if (n) { p.accion = accion; p.glifo = glifo; p.semaforo = semaforo }
    out.push(p)
  }
  return out
}

/** La pastilla bajo un punto del mundo (la de más arriba si dos se tocan). */
export function pastillaEn(pastillas: readonly Pastilla[], p: { x: number; y: number }): Pastilla | null {
  for (let i = pastillas.length - 1; i >= 0; i--) {
    const q = pastillas[i]
    if (p.x >= q.x && p.x <= q.x + q.width && p.y >= q.y && p.y <= q.y + q.height) return q
  }
  return null
}
