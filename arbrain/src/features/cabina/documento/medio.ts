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
/** Las del lector del chat (5 nov 2026, Daniel: «Prefiero velocidad x1.25, x1.5 x1.75 x2»): de 1x a 2x en cuartos. */
export const VELOCIDADES = [1, 1.25, 1.5, 1.75, 2] as const
/** L repetida acelera un paso y se queda en 2x. J repetida retrocede cada vez más (5 s, 10 s, 20 s). */
export function siguienteVelocidad(actual: number): number {
  return VELOCIDADES.find(v => v > actual + 1e-6) ?? VELOCIDADES[VELOCIDADES.length - 1]
}
/** El botón de velocidad da la vuelta: 1x → 1.25x → 1.5x → 1.75x → 2x → 1x. */
export function velocidadEnCiclo(actual: number): number {
  return VELOCIDADES.find(v => v > actual + 1e-6) ?? VELOCIDADES[0]
}
/** «1×», «1.25×»: lo que dice el botón. */
export const rotuloVelocidad = (x: number) => `${x}×`
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

// ── El reloj del visor mientras corre (7 nov 2026, Daniel: «parpadea se traba» con el video en grande) ──
/** El tiempo que se lee (m:ss) cambia solo cuando cambia el segundo: el visor no se re-renderiza en cada cuadro. */
export const otroSegundo = (antes: number, ahora: number) => Math.floor(antes) !== Math.floor(ahora)
/** La barra se repinta solo si la perilla se movería al menos un píxel de pantalla (medio píxel CSS a 2x). Un video de 13 min en una barra de
 *  2,500 px avanza ~3 px por segundo: repintarla (y re-renderizar el visor) en cada cuadro era trabajo tirado; un clip corto
 *  sigue moviéndose en cada cuadro. `anchoPx` en píxeles de pantalla (CSS × devicePixelRatio). */
export function moverBarra(antes: number, ahora: number, dur: number, anchoPx: number): boolean {
  if (!(dur > 0) || !(anchoPx > 0)) return antes !== ahora
  return (Math.abs(ahora - antes) / dur) * anchoPx >= 1
}

// ── Tamaño del escenario (8 nov 2026) ──
/** Lo que el visor deja libre a su alrededor cuando ocupa el panel principal (pestañas, controles, relleno), en px de la interfaz. */
export const HOLGURA_GRANDE = 300
/**
 * Alto del escenario del video en px de la INTERFAZ (lo que se pone en `style.height`). Daniel, 8 nov 2026: «el visualizador de
 * videos no se adapta al 16:9, es tan grande que me toca hacer scroll y debería ser estático». Causa: la altura de la ventana
 * (`visualViewport.height`) viene en px de pantalla, pero un `height` en px se multiplica por el zoom de la interfaz (CSS `zoom`
 * en <html>, ⌘+/⌘−): a 1.25 el escenario salía 25 % más alto de lo que cabía. Aquí la ventana se pasa a px de la interfaz
 * (÷ zoom), como hace el visor de PDF con `/ var(--ui-zoom)`. A zoom 1 el resultado es el de siempre.
 *  - grande (panel principal): toda la ventana menos la holgura; vertical (9:16): la ventana menos sus controles, sin pasar de 720;
 *  - en la hoja del chat: hasta el 55 % de la ventana, entre 220 y 520.
 * El escenario toma el alto de la versión que más lo pide (con dos lado a lado, cada una en su mitad del ancho: `hueco`).
 */
export function altoDeEscenario(o: { grande: boolean; vertical: boolean; altoVentana: number; zoom: number; hueco: number; proporciones: number[]; libre?: number | null }): number {
  const local = o.altoVentana / (o.zoom > 0 ? o.zoom : 1)
  // En el panel principal manda el espacio REAL que queda (`libre`, medido con espacioLibre); la holgura fija es solo el respaldo.
  const libre = typeof o.libre === 'number' && Number.isFinite(o.libre) && o.libre > 0 ? o.libre : null
  const tope = o.grande ? Math.max(260, libre ?? local - HOLGURA_GRANDE) : o.vertical ? Math.max(260, Math.min(720, local - 210)) : Math.min(520, Math.max(220, local * 0.55))
  const pide = o.proporciones.map(p => Math.min(tope, o.hueco / (p > 0 ? p : 16 / 9)))
  return Math.round(Math.max(160, ...pide))
}

/** Aire que se deja bajo el visor en el panel principal, en px de la interfaz. */
export const MARGEN_INFERIOR_VISOR = 24
/**
 * El alto que le queda al ESCENARIO en el panel principal (8 nov 2026, Daniel: «cabe, pero wtf con todo el espacio vacío debajo»:
 * la holgura fija de 300 px reservaba casi el doble de lo que ocupan lo de arriba y los controles). Es lo que mide la ventana desde donde
 * empieza el visor hasta su borde, menos lo que el propio visor ocupa fuera del escenario (controles, versiones, huecos) y un margen.
 *  - `arriba`: dónde empieza el visor, en px de PANTALLA (getBoundingClientRect().top); `altoVentana` también va en px de pantalla;
 *  - `fijo`: lo que mide el visor sin el escenario, en px de la interfaz (offsetHeight);
 *  - el resultado, en px de la interfaz como el `height` que se pone (por eso se divide entre el zoom).
 */
export function espacioLibre(o: { altoVentana: number; arriba: number; zoom: number; fijo: number; margen?: number }): number {
  const z = o.zoom > 0 ? o.zoom : 1
  return Math.max(0, Math.floor((o.altoVentana - Math.max(0, o.arriba)) / z - o.fijo - (o.margen ?? MARGEN_INFERIOR_VISOR)))
}

// ── Miniaturas bajo la barra (8 nov 2026, Daniel: «ver la miniatura del frame abajo, justo como YT») ──
// Como YouTube: UNA hoja de miniaturas por video (un fotograma cada pocos segundos, en cuadrícula) que el servidor genera con
// ffmpeg una sola vez y guarda; el navegador solo recorta la celda que toca bajo el cursor (nada de decodificar al pasar).
export interface PlanMiniaturas { cada: number; n: number; cols: number; filas: number; ancho: number; alto: number }
export const MINIATURAS_COLUMNAS = 10
/** Alto (o ancho, si es vertical) de cada miniatura en px: lo justo para verse nítida al doble de tamaño en pantalla retina. */
export const MINIATURA_LADO = 90

/**
 * Cuántas miniaturas y de qué tamaño. Un fotograma cada 1 s (≤ 2 min), 2 s (≤ 10 min), 5 s (≤ 30 min) o 10 s: de 60 a 180 piezas,
 * una hoja de 1 a 2 MB como mucho. El tamaño sigue la proporción del video (16:9 → 160×90, 9:16 → 90×160), siempre par (lo pide el escalado).
 * Sin duración conocida no hay plan.
 */
export function planMiniaturas(duracion: number, proporcion: number): PlanMiniaturas | null {
  if (!Number.isFinite(duracion) || duracion <= 0) return null
  const p = Number.isFinite(proporcion) && proporcion > 0 ? proporcion : 16 / 9
  const cada = duracion <= 120 ? 1 : duracion <= 600 ? 2 : duracion <= 1800 ? 5 : 10
  const n = Math.max(1, Math.floor(duracion / cada) + 1)
  const par = (x: number) => Math.max(2, Math.round(x / 2) * 2)
  const ancho = p >= 1 ? par(MINIATURA_LADO * p) : MINIATURA_LADO
  const alto = p >= 1 ? MINIATURA_LADO : par(MINIATURA_LADO / p)
  return { cada, n, cols: Math.min(MINIATURAS_COLUMNAS, n), filas: Math.ceil(n / Math.min(MINIATURAS_COLUMNAS, n)), ancho: Math.min(ancho, 240), alto: Math.min(alto, 240) }
}

/** Qué celda de la hoja toca a un instante (la última miniatura sirve para el final del video). */
export function celdaDeMiniatura(plan: PlanMiniaturas, seg: number): { indice: number; col: number; fila: number } {
  const indice = Math.min(plan.n - 1, Math.max(0, Math.floor((Number.isFinite(seg) ? seg : 0) / plan.cada)))
  return { indice, col: indice % plan.cols, fila: Math.floor(indice / plan.cols) }
}

/** Argumentos de ffmpeg que arman la hoja de un video en una sola pasada (sin shell: la ruta va como argumento). */
export function argsMiniaturas(entrada: string, salida: string, plan: PlanMiniaturas): string[] {
  return ['-v', 'error', '-nostdin', '-y', '-threads', '2', '-i', entrada, '-an', '-sn',
    '-vf', `fps=1/${plan.cada},scale=${plan.ancho}:${plan.alto}:flags=bilinear,tile=${plan.cols}x${plan.filas}`,
    '-frames:v', '1', '-q:v', '6', salida]
}

/** Qué decirle a Daniel cuando el <video> falla (MediaError.code: 2 red, 3 decodificación, 4 fuente no válida, p. ej. enlace vencido). */
export function textoFallaVideo(codigo: number | null | undefined): string {
  if (codigo === 2) return 'Se cortó la conexión con el video.'
  if (codigo === 3) return 'El video no se pudo decodificar en este punto.'
  if (codigo === 4) return 'No se pudo abrir el video (¿venció el enlace?).'
  return 'El video dejó de responder.'
}

// ── Flechas (8 nov 2026) ──
/** Lo que salta ← → sin parar el video. */
export const SALTO_FLECHA_S = 5
/**
 * ← → adelantan y atrasan 5 s (Daniel: «flechas para adelantar y atrasar»); con Shift, un fotograma, que es lo que hacían
 * solas para editar con Levy. Cualquier otra tecla: null.
 */
export function pasoDeFlecha(tecla: string, shift: boolean): { segundos: number } | { fotogramas: number } | null {
  if (tecla !== 'ArrowRight' && tecla !== 'ArrowLeft') return null
  const signo = tecla === 'ArrowRight' ? 1 : -1
  return shift ? { fotogramas: signo } : { segundos: signo * SALTO_FLECHA_S }
}

// ── Pantalla completa y volumen ──
/** Sin movimiento del ratón ni toques, la capa de controles (y el cursor) se van tras este tiempo. */
export const OCULTAR_MANDO_MS = 2500
export type ViaPantalla = 'elemento' | 'ventana' | 'video'
/** Por dónde entra a pantalla completa (6 nov 2026, rehecho). En el teléfono (iPhone, iPad), la nativa del <video>
 *  (webkitEnterFullscreen): controles del sistema, gira a horizontal y no saca al <video> de su lugar. Donde la API de
 *  pantalla completa de elementos existe y está permitida, el contenedor con nuestros controles. Si no (WKWebView sin ella),
 *  la capa propia sobre la ventana nativa a pantalla completa. */
export function viaPantallaCompleta(o: { elemento: boolean; tactil: boolean; videoNativo: boolean }): ViaPantalla {
  if (o.tactil && o.videoNativo) return 'video'
  if (o.elemento) return 'elemento'
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

/** ¿Se llama «final»? Una carpeta de finales/entrega/export, o un nombre que empieza por final/master/export. */
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
  // Sin nombres de final (6 nov 2026, Daniel: «0 finales · 13 piezas» en una carpeta de 6 cortos y sus hojas): lo que se
  // ve o se oye es lo que se entrega; hojas, .md y lo demás son piezas del camino.
  const porNombre = items.some(i => esFinal(i.relativa))
  const final = (i: ItemEntrega) => porNombre ? esFinal(i.relativa) : i.clase === 'video' || i.clase === 'audio'
  const finales = items.filter(final).sort(cmp)
  const piezas = items.filter(i => !final(i)).sort(cmp)
  return { finales, piezas }
}

/** Lo abierto de cada carpeta de entrega, por ruta: sobrevive a que la vista se remonte (se duerme fuera de pantalla, el
 *  hilo se recarga con los ids de la base, la pestaña renace). Vive lo que la página. */
const abiertasEnCarpeta = new Map<string, unknown>()
export function abiertaEnCarpeta<T>(carpeta: string): T | null { return (abiertasEnCarpeta.get(carpeta) as T | undefined) ?? null }
export function recordarAbiertaEnCarpeta<T>(carpeta: string, abierta: T | null) {
  if (abierta == null) abiertasEnCarpeta.delete(carpeta); else abiertasEnCarpeta.set(carpeta, abierta)
}

/** ¿Hay que traer la vista a la pantalla? Sí si su borde de arriba quedó fuera (arriba) o en la mitad de abajo. */
export const hayQueTraer = (arriba: number, altoVisible: number) => arriba < 0 || arriba > altoVisible * 0.6

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
