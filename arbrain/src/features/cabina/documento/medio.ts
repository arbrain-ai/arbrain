/**
 * El visor único (7 oct 2026): la parte pura de PDF, video, audio y carpeta de entrega. Sin DOM ni React, para probarla
 * (tests/cabina/visor.test.ts) y para que el mensaje que viaja al agente tenga UNA sola forma.
 */

// ── Tiempo y fotogramas ──
export const FPS_POR_DEFECTO = 30

/** 83.4 → «1:23», 3723 → «1:02:03». Con `fotogramas` añade `.ff`: «1:23.12». */
export function formatoTiempo(seg: number, opciones: { fps?: number; fotogramas?: boolean } = {}): string {
  const s = Number.isFinite(seg) && seg > 0 ? seg : 0
  const fps = opciones.fps && opciones.fps > 0 ? opciones.fps : FPS_POR_DEFECTO
  let enteros = Math.floor(s)
  let ff = Math.floor((s - enteros) * fps + 1e-6)
  if (ff >= Math.round(fps)) { enteros += 1; ff = 0 }
  const h = Math.floor(enteros / 3600), m = Math.floor((enteros % 3600) / 60), r = enteros % 60
  const base = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
  return opciones.fotogramas ? `${base}.${String(ff).padStart(2, '0')}` : base
}

/** «2:10», «1:02:03», «130», «130.4» → segundos. null si no es un tiempo. */
export function leerTiempo(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!t) return null
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(t)
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** El fotograma (0, 1, 2…) que se está viendo en `seg`. */
export const fotogramaDe = (seg: number, fps: number) => Math.max(0, Math.floor(seg * fps + 1e-6))
/** Tiempo para caer en el MEDIO de un fotograma: un `currentTime` justo en el borde puede mostrar el anterior. */
export const tiempoDeFotograma = (n: number, fps: number) => (Math.max(0, n) + 0.5) / fps

/** Avanza `pasos` fotogramas desde `seg`, sin salirse de [0, duración]. */
export function pasoDeFotograma(seg: number, fps: number, pasos: number, duracion: number): number {
  const destino = tiempoDeFotograma(fotogramaDe(seg, fps) + pasos, fps)
  const ultimo = duracion > 0 ? Math.max(0, duracion - 0.5 / fps) : destino
  return Math.min(Math.max(0, destino), ultimo)
}

// ── J / K / L ──
export const VELOCIDADES = [0.25, 0.5, 1, 1.25, 1.5, 2, 3] as const
/** L repetida acelera: 1x → 1.5x → 2x → 3x. J repetida retrocede cada vez más (5 s, 10 s, 20 s). */
const ESCALA_L = [1, 1.5, 2, 3]
export function siguienteVelocidad(actual: number): number {
  return ESCALA_L.find(v => v > actual + 1e-6) ?? ESCALA_L[ESCALA_L.length - 1]
}
export const saltoAtras = (repeticiones: number) => 5 * Math.min(4, 2 ** Math.max(0, repeticiones))

// ── Dos versiones, un solo reloj ──
/** Dos cortes del mismo material rara vez miden lo mismo: «mismo avance» alinea por proporción, «mismo tiempo» por segundo. */
export function tiempoEnOtra(seg: number, durActual: number, durOtra: number, modo: 'tiempo' | 'avance'): number {
  if (!(durOtra > 0)) return 0
  const t = modo === 'avance' && durActual > 0 ? (seg / durActual) * durOtra : seg
  return Math.min(Math.max(0, t), durOtra)
}
/** Por defecto: mismo tiempo si miden casi igual (misma edición, otro tratamiento); si no, mismo avance. */
export const modoPorDefecto = (d1: number, d2: number): 'tiempo' | 'avance' => d1 > 0 && d2 > 0 && Math.abs(d1 - d2) / Math.max(d1, d2) < 0.02 ? 'tiempo' : 'avance'

// ── Pantalla completa y volumen ──
/** Sin movimiento del ratón ni toques, la capa de controles (y el cursor) se van tras este tiempo. */
export const OCULTAR_MANDO_MS = 2500
export type ViaPantalla = 'elemento' | 'ventana' | 'video'
/** Por dónde entra a pantalla completa. 'video' (webkitEnterFullscreen del <video>) solo en el teléfono: trae los controles
 *  del sistema y gira a horizontal; en el escritorio no tiene controles (9 oct, Daniel: «no hay barra»). El escritorio Tauri
 *  pone la ventana nativa a pantalla completa y el visor la cubre con su propia capa. */
export function viaPantallaCompleta(o: { elemento: boolean; escritorio: boolean; tactil: boolean; videoNativo: boolean }): ViaPantalla {
  if (o.escritorio) return 'ventana'
  if (o.elemento) return 'elemento'
  if (o.tactil && o.videoNativo) return 'video'
  return 'ventana'
}
/** Flechas ↑ ↓ mueven el volumen en pasos de 10 %, dentro de 0–1. */
export const pasoVolumen = (vol: number, pasos: number) => Math.round(Math.min(1, Math.max(0, vol + pasos * 0.1)) * 100) / 100
/** Quitar el silencio con el volumen en cero lo deja a la mitad: nunca un «sonido» que no suena. */
export const volumenAlOir = (vol: number) => vol > 0.02 ? vol : 0.5

// ── El mensaje que llega al agente ──
export interface Marca { id: string; tiempo: number; nota: string; version: string; ruta: string; enviada?: boolean }

/**
 * Un instante marcado viaja como TEXTO con forma fija. Primera línea legible por una persona y por el agente:
 *   ⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=/abs/v2.mp4
 *   quita esto
 * El tiempo es de la línea de tiempo de ESA versión (la que el dueño miraba), no del material original.
 */
export function mensajeMarca(m: Pick<Marca, 'tiempo' | 'nota' | 'version' | 'ruta'>, tipo: 'Video' | 'Audio' = 'Video'): string {
  const t = Math.round(m.tiempo * 100) / 100
  const cabeza = `⏱ ${tipo} «${m.version}» · ${formatoTiempo(m.tiempo)} (tiempo=${t}) · ruta=${m.ruta}`
  const nota = m.nota.trim()
  return nota ? `${cabeza}\n${nota}` : cabeza
}
export const mensajeMarcas = (ms: Pick<Marca, 'tiempo' | 'nota' | 'version' | 'ruta'>[], tipo: 'Video' | 'Audio' = 'Video') =>
  [...ms].sort((a, b) => a.tiempo - b.tiempo).map(m => mensajeMarca(m, tipo)).join('\n\n')

/** Lo que el dueño seleccionó en un PDF, con página y archivo, para que el agente sepa de dónde viene. */
export function mensajePdf(o: { archivo: string; ruta: string; pagina: number; seleccion: string; pregunta: string }): string {
  const cita = o.seleccion.replace(/\s+/g, ' ').trim().slice(0, 1200)
  const pregunta = o.pregunta.trim() || 'Explícame esto.'
  return `📄 PDF «${o.archivo}» · p. ${o.pagina} · ruta=${o.ruta}\n«${cita}»\n${pregunta}`
}

// ── Búsqueda en PDF ──
/** Sin mayúsculas ni acentos: «accion» encuentra «Acción». Conserva la longitud (NFD + quitar marcas se hace por carácter). */
export function plano(texto: string): string {
  let o = ''
  for (const c of texto) { const b = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); o += b.length === 1 ? b : c.toLowerCase().slice(0, 1) }
  return o
}
/** `junto`: esta pieza sigue a la anterior SIN espacio (un PDF parte «Hel» y «lo» en dos trozos de la misma palabra). */
export interface Pieza { texto: string; junto?: boolean }
export interface Encontrado { desde: number; hasta: number; pieza: number; ini: number; fin: number }
/** Busca `consulta` en la concatenación de las piezas de texto de una página (cada una separada por un espacio, como se lee). Devuelve, por coincidencia, los trozos [ini, fin) de cada pieza que cubre. */
export function buscarEnPiezas(piezas: Pieza[], consulta: string): Encontrado[][] {
  const q = plano(consulta.trim().replace(/\s+/g, ' '))
  if (!q) return []
  let junto = ''
  const inicios: number[] = []
  piezas.forEach((p, i) => { if (i > 0 && !p.junto) junto += ' '; inicios.push(junto.length); junto += plano(p.texto) })
  const salida: Encontrado[][] = []
  let desde = 0
  for (;;) {
    const k = junto.indexOf(q, desde)
    if (k < 0) break
    const fin = k + q.length
    const trozos: Encontrado[] = []
    piezas.forEach((p, i) => {
      const a = inicios[i], b = a + p.texto.length
      const x = Math.max(k, a), y = Math.min(fin, b)
      if (y > x) trozos.push({ desde: k, hasta: fin, pieza: i, ini: x - a, fin: y - a })
    })
    if (trozos.length) salida.push(trozos)
    desde = k + Math.max(1, q.length)
  }
  return salida
}

// ── Carpeta de entrega ──
export type ClaseArchivo = 'video' | 'audio' | 'imagen' | 'pdf' | 'documento' | 'carpeta' | 'otro'
export interface ItemEntrega { nombre: string; ruta: string; clase: ClaseArchivo; bytes: number; mtime: string; relativa: string }

const CARPETAS_FINALES = /^(finales?|entrega|entregables?|export(s|ados?)?|salidas?|out)$/i
const NOMBRE_FINAL = /^(final|master|export|entrega)([-_. ].*)?\./i
const VERSION = /^v(\d+)(?:[._](\d+))?\b/i

/** ¿Es un «final»? Una carpeta de finales/entrega/export, o un nombre que empieza por final/master/export. */
export function esFinal(relativa: string): boolean {
  const partes = relativa.split('/')
  const nombre = partes[partes.length - 1] ?? ''
  return partes.slice(0, -1).some(p => CARPETAS_FINALES.test(p)) || NOMBRE_FINAL.test(nombre)
}
/** v1 < v1.1 < v2 < v10; lo que no es versión va después, por nombre. */
export function ordenVersion(nombre: string): [number, number] | null {
  const m = VERSION.exec(nombre)
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null
}
export function ordenarEntrega(items: ItemEntrega[]): { finales: ItemEntrega[]; piezas: ItemEntrega[] } {
  const cmp = (a: ItemEntrega, b: ItemEntrega) => {
    const va = ordenVersion(a.nombre), vb = ordenVersion(b.nombre)
    if (va && vb) return va[0] - vb[0] || va[1] - vb[1] || a.nombre.localeCompare(b.nombre, 'es')
    if (va) return -1
    if (vb) return 1
    return a.relativa.localeCompare(b.relativa, 'es', { numeric: true })
  }
  const finales = items.filter(i => esFinal(i.relativa)).sort(cmp)
  const piezas = items.filter(i => !esFinal(i.relativa)).sort(cmp)
  return { finales, piezas }
}

/** Las versiones de un mismo material en una lista: videos cuyo nombre empieza por vN (v1, v2.1…). */
export const versionesDe = (items: ItemEntrega[]) => items.filter(i => i.clase === 'video' && ordenVersion(i.nombre)).sort((a, b) => {
  const x = ordenVersion(a.nombre)!, y = ordenVersion(b.nombre)!
  return x[0] - y[0] || x[1] - y[1]
})

export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
