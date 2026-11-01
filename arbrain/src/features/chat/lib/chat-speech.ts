/**
 * Lectura por voz de un mensaje del chat: barra (⏮ ⏯ ⏭ · velocidad · ✕), tap en un párrafo para leer desde esa palabra,
 * y UN resaltado ámbar en la palabra que suena. Un solo mensaje lee a la vez (singleton).
 *
 * DOS VOCES, UNA REGLA: el resaltado solo se mueve con una marca REAL de la voz, nunca con una estimación.
 *   · Voz del servidor (la de siempre en la instalación de Daniel; ver voz-servidor.ts y hablaConAudio()): audio por
 *     tramos con la tabla exacta palabra → instante de la MISMA síntesis (marcas-voz.ts). Un reloj (lo que sale por la
 *     bocina, latencia incluida) y en cada fotograma la palabra de ese instante. Voces que no dan marcas (LemonFox, un
 *     agent-server viejo): respaldo de tiempos-estimados.ts, documentado ahí.
 *   · Voz del dispositivo (Web Speech API), solo si no hay voz de servidor (edición cliente sin llave, servidor caído):
 *     el resaltado lo mueven los `boundary` que emite el propio motor. Si una plataforma no los emite, el resaltado se
 *     queda en la primera palabra de la frase que suena: mejor quieto que adivinando (29 oct 2026, Daniel: «si solo es
 *     preciso 95% del tiempo hay desfases que me cortan la concentración»).
 *
 * El resaltado es un solo elemento que se mueve (resaltado.ts): no deja rastro y sobrevive a la pausa (el «estás aquí»).
 *
 * VOZ DEL DISPOSITIVO — medido el 15 jul 2026, NO asumir lo contrario: WebKit (Safari, iPhone/iPad, WKWebView) expone
 * solo Paulina (es-MX) y Mónica (es-ES); «Juan (mejorada)» no aparece aunque `say -v` la liste. Chrome expone 181 voces,
 * Juan incluida. currentVoice() fija a Juan si aparece; si no, deja la del sistema (Apple) o elige la mejor en español.
 */

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1))
const isChrome = typeof navigator !== 'undefined' && /Chrome/.test(navigator.userAgent)
const esApple = isIOS || (typeof navigator !== 'undefined' && /Mac OS X|Macintosh/.test(navigator.userAgent))
/** Idiomas del sistema de la persona (en España: es-ES primero). */
const idiomasSistema = (): readonly string[] =>
  typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : []

/**
 * La mejor voz en español que expone el sistema, fuera de Apple (v0.2.10). Orden: neuronales/naturales (Edge y WebView2
 * exponen voces «Microsoft … Online (Natural)»; Chrome, «Google español de Estados Unidos») > mejoradas > el resto, y
 * dentro de cada nivel es-MX > es-US/es-419 > otras de Latinoamérica > es-ES. Ninguna en español: null (el caller fija
 * `lang` con idiomaDeRespaldo y el sistema decide). Pura, para probarla sin navegador.
 * `idioma` (29 oct 2026, un fundador en España): el español del sistema de la persona (voz-sistema.ts › idiomaPreferido);
 * dentro de cada nivel de calidad su región va primero (en España, la voz de España antes que la de México).
 */
export function mejorVozEspanol<V extends { name: string; lang: string; localService?: boolean; default?: boolean }>(voces: readonly V[], idioma: string | null = null): V | null {
  const es = voces.filter((v) => /^es([-_]|$)/i.test(v.lang))
  if (!es.length) return null
  const calidad = (v: V) => /(natural|neural|online|wavenet|enhanced|mejorad|premium)/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2
  const suya = idioma?.toLowerCase().replace('_', '-') ?? null
  const region = (v: V) => { const l = v.lang.toLowerCase().replace('_', '-'); return l === suya ? -1 : l === 'es-mx' ? 0 : l === 'es-us' || l === 'es-419' ? 1 : l === 'es-es' ? 3 : 2 }
  return [...es].sort((a, b) => calidad(a) - calidad(b) || region(a) - region(b) || Number(!!b.default) - Number(!!a.default))[0]
}

// Velocidad REAL (la hornea el servidor, atempo sin cambiar el tono). Hasta 3x desde el 23 oct 2026: Daniel, «sigo sin
// escuchar la velocidad rápida; esto funcionaba por meses». Por meses la app leyó con la voz de WebKit, cuyo `rate` no es
// lineal: «1.75x» sonaba a 42 car/s, 3x de los 14 car/s de 1x (medido el 22 oct). El 2x real del servidor son ~30 car/s:
// correcto, pero más lento que lo que su oído conocía como «rápido».
const RATES = [1, 1.5, 2, 2.5, 3]
/** Índice de la velocidad de RATES más cercana; en empate, la más rápida (una posición guardada a 1.75 vuelve a 2). */
export function indiceDeVelocidad(rate: number): number {
  if (!Number.isFinite(rate)) return -1
  let mejor = 0
  for (let i = 1; i < RATES.length; i++) if (Math.abs(RATES[i] - rate) <= Math.abs(RATES[mejor] - rate)) mejor = i
  return mejor
}
// Tramos de voz del servidor que se piden por adelantado (también de los párrafos siguientes). Con uno solo, un párrafo
// corto se acababa antes de que llegara el siguiente (~1.2 s de `say`) y quedaba un hueco.
const PRECARGA = 3
/**
 * UN FALLO NO CAMBIA LA VOZ (31 oct 2026). El 31 oct a las 08:31:22 el auto-deploy reinició el daemon de voz en el mismo
 * segundo en que el iPhone pedía un tramo: un 500, y la lectura siguió con la voz del navegador, que en WebKit pierde
 * frases enteras (ver cancelAndSpeak). Ahora un tramo que no llega por la red o por el servidor se vuelve a pedir tras
 * estas esperas (3.5 s en total: lo que dura un reinicio del daemon; medido en scripts/qa/lector-marcas/latencia.mjs,
 * una caída de 2.5 s deja ~2.7 s de silencio y sigue con la misma voz) antes de cambiar de voz; si aun así cae a la del
 * navegador, la del servidor vuelve en el párrafo siguiente en cuanto responde (sondeaServidor), sin silencio extra.
 */
export const ESPERAS_REINTENTO_MS = [250, 500, 750, 1000, 1000]
/** Con la voz del navegador tras una caída: cada cuánto se vuelve a preguntar al servidor (sondeaServidor). */
const SONDEO_MS = 2000

// ---- Texto HABLADO vs texto VISIBLE ----
// La voz no debe verbalizar lo que no es prosa: un emoji suena como "marca de verificación",
// una flecha como "flecha", y una URL o una ruta se deletrean carácter por carácter. Eso es
// lo que hacía que la lectura no sonara "tal cual el texto". Aquí se traduce el ruido ANTES
// de hablar, sin tocar lo que se ve en pantalla.
//
// El orden ES la prioridad: la primera regla que toca un tramo gana, y los solapes se
// descartan (una URL contiene puntos y barras, no queremos que además la parta la regla de
// rutas). Las tablas y los bloques de código no llegan hasta aquí: el selector de bloques
// ni los recoge, y así debe seguir siendo.
const NOISE: Array<{ re: RegExp; say: string | ((m: RegExpExecArray) => string); si?: (m: string) => boolean }> = [
  // URLs sueltas: no se dicen (antes «un enlace»). Misma regla que lector-filtro.ts.
  { re: URL_RE, say: ' ' },
  // Fechas dd/mm/aaaa (31 oct 2026): la regla de rutas las decía «una ruta» («el 31/10/2026» sonaba «el una ruta»).
  // Va ANTES de las rutas: a igual tramo gana la primera regla.
  { re: /(?<![\w/])(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?![\w/])/gu, say: fechaHablada },
  // Rutas: exige DOS o más segmentos con barra. Con una sola barra se tragaba "80/20",
  // "24/7" y "60/90 min" y los leía como "una ruta". El `[\w.~-]*` inicial absorbe tanto
  // la barra de "/Users/..." como el "agent-server" de "arbrain/server/scripts/x/y.py".
  // Palabras sueltas entre barras («lunes/miércoles/viernes», «LT/HT/cohorte») no son ruta (31 oct 2026): se leen.
  { re: /[\w.~-]*(?:\/[\w.~-]+){2,}/gu, say: ' una ruta ', si: esRuta },
  // Ruta de UNA barra con pinta de archivo ("project/comentario-ia-2026-09-22.md"). Medido
  // el 23 sep: la voz la deletreaba guion por guion durante 7s y el vigilante la cortaba
  // a media palabra. El filtro deja pasar "80/20", "LT/HT" o "input/output".
  { re: /[\w.~-]+\/[\w.~-]+/gu, say: ' una ruta ', si: (m) => m.length >= 10 && /\p{L}/u.test(m) && /[-_]|\.\w{1,4}\.?$/.test(m) },
  { re: /\b[\w-]+\.(?:ts|tsx|js|jsx|py|md|css|json|sh|html|sql|yml|yaml)\b/gu, say: ' un archivo ' },
  // Pictogramas (emoji, dingbats, variation selectors, ZWJ, keycaps): fuera, no se dicen.
  { re: /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, say: '' },
  { re: /[→⇒➜►]/gu, say: ' hacia ' },
  { re: /[←⇐◄]/gu, say: ' desde ' },
  { re: /§\s*(?=\d)/gu, say: ' sección ' },
  { re: /[·•▍|§#*_`]/gu, say: ' ' },
  // Comillas/guillemets: la voz no las verbaliza pero sí le tropieza la prosodia en citas.
  { re: /[«»“”„‟‹›"']/gu, say: ' ' },
]

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «31/10/2026» → «31 de octubre de 2026» (también 10/31/2026, la forma de EE. UU.). Si no es fecha, los números. */
function fechaHablada(m: RegExpExecArray): string {
  const a = Number(m[1]), b = Number(m[2]), y = m[3]
  const anio = y.length === 2 ? `del ${y}` : `de ${y}`
  if (b >= 1 && b <= 12 && a >= 1 && a <= 31) return ` ${a} de ${MESES[b - 1]} ${anio} `
  if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return ` ${b} de ${MESES[a - 1]} ${anio} `
  return ` ${m[1]} ${m[2]} ${y} `
}

/** ¿Esto que tiene dos o más barras es una ruta? No si son solo palabras («lunes/miércoles/viernes») o una fecha. */
function esRuta(m: string): boolean {
  if (/^[~./]/.test(m)) return true
  const segmentos = m.replace(/[.~-]+$/, '').split('/') // el punto final es de la frase, no de la ruta
  if (segmentos.every((x) => /^\p{L}+$/u.test(x))) return false
  if (segmentos.every((x) => /^\d+$/.test(x))) return false
  return true
}

/**
 * Convierte el texto visible en el texto que se le manda a la voz, y devuelve además
 * `map[i]` = índice en `text` del i-ésimo carácter hablado.
 *
 * El mapa es la pieza clave. `boundary.charIndex` viene en coordenadas del texto HABLADO,
 * pero el resaltado necesita posiciones del texto VISIBLE. Sin mapa, sustituir "→" (1 char)
 * por " hacia " (7) desincroniza el resaltado de ahí en adelante. Con mapa, hablar y
 * resaltar dejan de estar atados a la misma longitud.
 *
 * Exportado para poder testearlo sin navegador.
 */
export function buildSpoken(text: string): { spoken: string; map: number[] } {
  type Hit = { start: number; end: number; say: string }
  const hits: Hit[] = []
  for (const { re, say, si } of NOISE) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (!m[0].length) {
        re.lastIndex++
        continue
      }
      if (si && !si(m[0])) continue
      hits.push({ start: m.index, end: m.index + m[0].length, say: typeof say === 'string' ? say : say(m) })
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const clean: Hit[] = []
  let guard = -1
  for (const h of hits) {
    if (h.start < guard) continue
    clean.push(h)
    guard = h.end
  }

  let spoken = ''
  const map: number[] = []
  let i = 0
  for (const h of clean) {
    for (; i < h.start; i++) {
      map.push(i)
      spoken += text[i]
    }
    // Los caracteres de la sustitución se reparten a lo largo del tramo original, así el
    // resaltado cubre la URL/emoji entera en vez de colapsar en un punto.
    const span = h.end - h.start
    for (let k = 0; k < h.say.length; k++) {
      map.push(h.start + Math.floor((k / h.say.length) * span))
      spoken += h.say[k]
    }
    i = h.end
  }
  for (; i < text.length; i++) {
    map.push(i)
    spoken += text[i]
  }
  return { spoken, map }
}

import { calcularZonaLectura } from './zona-lectura'
import { anclarElemento, deslizarScroll, escalaRect, fijarScroll } from './desplazar'
import { sonda } from './tts-probe'
import { URL_RE, filtrarBloques, type BloqueLector } from './lector-filtro'
import { MARCA_PROPIO, SELECTOR_BLOQUES, tramosPropios, type NodoLector } from './lector-bloques'
import { MemoriaLector, huellaDeTexto, resolverPosicion, type PosicionLector } from './lector-posicion'
import { FallaVoz, VozServidor, type AudioTramo } from './voz-servidor'
import { registrarLector } from './lector-registro'
import { palabraEn, tiemposDeMarcas } from './marcas-voz'
import { tiemposDelAudio } from './tiempos-estimados'
import { ResaltadoUnico } from './resaltado'
import { idiomaDeRespaldo, idiomaPreferido } from './voz-sistema'
import { elegirResumen, type BloqueResumen } from './resumen-hablado'

type StateCb = (playing: boolean) => void

/**
 * Lectura de un texto que NO vive en este documento (un HTML aislado en un iframe del panel,
 * 7 oct 2026). El motor lee bloques-espejo desprendidos (`<p>` con el mismo textContent que el
 * original, así los offsets coinciden) y el puente traduce "pinta la palabra X del bloque N" al
 * mundo real. El índice es el del espejo: el puente sabe a qué bloque original corresponde.
 */
export interface PuenteLector {
  pintar(bloque: number, desde: number, hasta: number): void
  limpiar(): void
  ver(bloque: number): void
  /** El motor terminó o paró: soltar escuchadores y resaltado. */
  cerrar(): void
}
export interface LecturaExterna {
  textos: string[]
  puente: PuenteLector
}

export interface SpeechState {
  active: boolean // hay un mensaje cargado (la barra se muestra)
  /** id del mensaje cargado. Lo lee el botón de CADA mensaje para saber si le toca a él.
   *  Antes cada AudioButton preguntaba con un setInterval de 500ms propio y esos timers
   *  vivían para siempre (LazyMessage nunca desmonta): en una conversación larga eran
   *  cientos despertando el hilo principal, justo el hilo por el que llegan los eventos
   *  `boundary` de la voz. Empujar el estado cuesta cero timers. */
  id: string | null
  paused: boolean
  rate: number
  idx: number
  total: number
  /** La pantalla está retenida (no se va a apagar sola durante la lectura).
   *  `false` mientras se lee = iOS va a dormir la pantalla y con ella el JS. */
  despierto: boolean
  /** Se lee el RESUMEN del mensaje (resumen-hablado.ts), no el mensaje completo. */
  resumen: boolean
}

// Snapshot inmutable compartido para el estado inactivo (SSR + arranque). Es una
// referencia ESTABLE: useSyncExternalStore compara con Object.is, así que el
// server snapshot y el cliente antes de arrancar apuntan al mismo objeto.
const INACTIVE_STATE: SpeechState = { active: false, id: null, paused: false, rate: 1, idx: 0, total: 0, despierto: false, resumen: false }

// Screen Wake Lock. Los tipos del DOM no lo traen en todas las versiones de TS, y no
// vale la pena subir el lib target por dos métodos.
type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: string, cb: () => void) => void }
type WakeLockNav = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }

class ChatSpeechController {
  private synth: SpeechSynthesis | null =
    typeof window !== 'undefined' ? window.speechSynthesis : null
  private warmed = false
  private playing = false
  private paused = false
  private container: HTMLElement | null = null
  private blocks: HTMLElement[] = []
  private idx = 0
  // Offset de char (dentro de block.textContent) de la ÚLTIMA palabra sonada. Es lo que
  // le permite a pauseResume() reanudar EXACTO en vez de reiniciar el párrafo.
  private cursorOffset = 0
  // One-shot: si está seteado, la próxima speakBlock() arranca a mitad del bloque
  // (frase+palabra que contiene este offset) en vez de desde el principio.
  private startOffset: number | null = null
  private rateIdx = 0
  private tapHandlers: Array<() => void> = []
  private stateCb: StateCb | null = null
  private chromeTimer: ReturnType<typeof setInterval> | null = null
  private speakTimer: ReturnType<typeof setTimeout> | null = null
  private curId: string | null = null
  // Lectura de una SELECCIÓN: los bloques son un extracto desprendido a propósito.
  private extracto = false
  // «Escuchar resumen» (29 oct 2026): los bloques son un subconjunto del mensaje más una frase de
  // cierre DESPRENDIDA («El resto está en pantalla.»), que se oye pero no tiene dónde pintarse.
  private resumen = false
  private cierre: HTMLElement | null = null
  // Lectura de un texto ajeno (ver PuenteLector): el resaltado y el scroll los hace el puente.
  private puente: PuenteLector | null = null
  private indiceEspejo = new Map<HTMLElement, number>()
  // Firma del texto que se lee (primeros caracteres de cada bloque): sirve para
  // reencontrar el mensaje cuando un re-render le cambia el nodo o hasta el id.
  private firma: string[] = []
  private uttSeq = 0
  private listeners = new Set<() => void>()
  // Snapshot CACHEADO para useSyncExternalStore. getState() DEBE devolver la
  // misma referencia mientras el estado no cambie: si devolviera un objeto nuevo
  // en cada llamada, React detectaria un cambio en cada render → bucle infinito
  // ("Maximum update depth exceeded"), que en el build de produccion tumba el
  // chat entero. Solo emit() recomputa este objeto (cuando algo cambio de verdad).
  private cached: SpeechState = INACTIVE_STATE

  // ─── LA POSICIÓN SOBREVIVE (2 oct 2026) ─────────────────────────────────────
  // Cada conversación recuerda dónde iba su lector (mensaje, párrafo «4/26», palabra) y
  // lo guarda en localStorage: sobrevive a cambiar de conversación y a Cmd+R, en escritorio
  // y en teléfono. SUSPENDER (cambio de conversación, recarga) guarda; PARAR (✕, toggle-off,
  // fin del mensaje) olvida. Reglas puras en lector-posicion.ts; idea de SFTerm.
  // No hay lectura de fondo deliberada: al cambiar de conversación el audio SE PAUSA y se
  // guarda el punto (el mensaje leído ya no está en pantalla; seguir hablando sobre nodos
  // desprendidos era el bug de «se oye la voz y no hay resaltado»).
  private memoria = new MemoriaLector(
    (() => { try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null } })(),
  )
  private sesion: string | null = null
  private resolverSesion: (() => string | null) | null = null
  private huella = ''
  private ultimoGuardado = 0

  constructor() {
    if (typeof window === 'undefined') return
    // Chromium (WebView2 en Windows, Chrome, Edge) carga las voces en segundo plano y solo empieza al primer
    // getVoices(): sin esto, la primera lectura llegaba con la lista vacía y sonaba la voz por defecto del sistema
    // (en un Windows en inglés, en inglés). Pedirla ya deja la lista lista para el primer «Escuchar».
    try { this.synth?.getVoices() } catch { /* sin voces: el lector sigue con la del servidor */ }
    // iOS no siempre dispara pagehide: al ocultarse la página también se vuelca el punto.
    window.addEventListener('pagehide', () => this.guardaPunto(true))
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.guardaPunto(true) })
  }

  /** ChatPanel dice en qué conversación está (Consejo y otros no lo registran: no persisten). */
  registrarSesion(fn: (() => string | null) | null) {
    this.resolverSesion = fn
  }
  /** Conversación a la que pertenece la lectura cargada. */
  sesionDeLectura() {
    return this.curId ? this.sesion : null
  }

  /** Vuelca el punto de lectura de la conversación. Con `force` ignora el límite de 1/s. */
  private guardaPunto(force = false) {
    // El resumen no guarda punto: su índice es de un subconjunto y volver a él no tiene sentido.
    if (!this.curId || !this.sesion || this.extracto || this.resumen || !this.blocks.length) return
    const t = this.now()
    if (!force && t - this.ultimoGuardado < 1000) return
    this.ultimoGuardado = t
    const b = this.blocks[this.idx]
    if (!b) return
    this.memoria.guardar(this.sesion, {
      msgId: this.curId,
      idx: this.idx,
      total: this.blocks.length,
      offset: Math.max(0, this.cursorOffset),
      huella: this.huella,
      firmaBloque: firmaDe(b),
      rate: RATES[this.rateIdx],
    })
  }

  /** Posición recordada de una conversación (para restaurar al volver o recargar). */
  posicionGuardada(sesion: string): PosicionLector | undefined {
    return this.memoria.obtener(sesion)
  }
  olvidarPosicion(sesion: string) {
    this.memoria.olvidar(sesion)
  }

  /**
   * Deja la barra lista en el punto guardado, EN PAUSA: no suena hasta que Daniel pulse play.
   * Si el mensaje cambió (editado o regenerado) vuelve al inicio de ese mensaje, no a un
   * fragmento que ya no existe. `false` si no se pudo montar (mensaje ausente o ya hay
   * otra lectura viva).
   */
  restaurar(sesion: string, el: HTMLElement): boolean {
    if (!this.synth || this.curId) return false
    const g = this.memoria.obtener(sesion)
    if (!g || el.dataset.ttsContent !== g.msgId) return false
    this.container = el
    this.curId = g.msgId
    this.sesion = sesion
    this.stateCb = null
    this.extracto = false
    this.resumen = false
    this.collectBlocks()
    if (!this.blocks.length) {
      this.container = null
      this.curId = null
      this.sesion = null
      return false
    }
    this.huella = huellaDeTexto(el.textContent || '')
    this.firma = this.blocks.map(firmaDe)
    const r = resolverPosicion(g, {
      huella: this.huella,
      firmas: this.firma,
      longitudes: this.blocks.map((b) => (b.textContent || '').length),
    })
    const ri = indiceDeVelocidad(g.rate)
    if (ri >= 0) this.rateIdx = ri
    this.idx = r.idx
    this.cursorOffset = r.offset
    this.startOffset = null
    this.playing = false
    this.paused = true // lista para seguir con play; pauseResume() reanuda por la palabra
    this.attachKeys()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility)
    if (r.offset > 0) this.highlightAtOffset(this.blocks[this.idx], r.offset)
    else this.markBlockStart()
    sonda.mark(`tts-restaurado(${r.motivo})`)
    this.emit()
    return true
  }

  // ─── LA PANTALLA ES PARTE DEL LECTOR (medido el 28 jul 2026) ────────────────
  //
  // Escuchar es no tocar el teléfono. iOS toma esa quietud como inactividad, atenúa la
  // pantalla y SUSPENDE EL JAVASCRIPT de la página. Pero la voz no la produce el JS: la
  // produce el sistema. Resultado: la voz sigue y el resaltado se congela; el `onend` de
  // la frase tampoco se atiende, así que la siguiente nunca se manda a hablar (silencios
  // largos); y al volver a tocar la pantalla se procesa todo lo encolado de golpe y el
  // naranja SALTA. Los tres síntomas del reporte, con una sola causa.
  //
  // Cómo se probó: el MISMO iPhone corriendo /tts-lab.html (con el usuario mirando y
  // tocando, o sea pantalla siempre despierta) da drift de -0.01s constante y cero
  // huecos. Dentro de la app, escuchando en pasivo, se desincroniza. La diferencia no es
  // el motor ni el texto ni la velocidad: es si la pantalla se durmió.
  //
  // Por eso mientras se lee se retiene la pantalla. No es un lujo: un lector que resalta
  // la palabra que suena NECESITA la pantalla viva, o no hay nada que resaltar.
  private wakeLock: Sentinel | null = null
  private despierto = false
  private hiddenAt = 0
  // Guard de petición EN VUELO: request('screen') es async, así que dos llamadas
  // seguidas (play + visibilitychange) pedían DOS locks y solo se soltaba uno.
  // Medido en pmset -g log: tres "Created Screen Wake Lock" en el mismo segundo.
  private lockEnVuelo = false
  // Watchdog del candado. El release vivía SOLO en stop(); si la lectura no moría
  // por su camino natural (utterance colgada, ventana que se queda abierta), el
  // candado seguía vivo y la pantalla NO se apagaba nunca. Medido: 24 ago 20:29 →
  // 25 ago 06:46, diez horas de monitores encendidos toda la noche. Este intervalo
  // comprueba el estado real y suelta si ya no se está leyendo: el candado no puede
  // sobrevivir más de 30s a la lectura, venga la fuga por donde venga.
  private lockWatchdog: ReturnType<typeof setInterval> | null = null

  private async retenPantalla() {
    const nav = typeof navigator !== 'undefined' ? (navigator as WakeLockNav) : null
    if (!nav?.wakeLock || this.wakeLock || this.lockEnVuelo) return
    this.lockEnVuelo = true
    try {
      const s = await nav.wakeLock.request('screen')
      // Puede llegar tarde: si mientras tanto se paró la lectura, soltarlo enseguida.
      if (!this.curId) { s.release().catch(() => {}); return }
      this.wakeLock = s
      this.despierto = true
      // iOS lo suelta solo al ir a background (y no lo devuelve al volver).
      s.addEventListener('release', () => {
        this.wakeLock = null
        this.despierto = false
        this.emit()
      })
      this.armarWatchdogPantalla()
      sonda.mark('wakelock-on')
      this.emit()
    } catch {
      // Rechaza en Modo de Bajo Consumo o con batería crítica — justo cuando iOS más
      // agresivo es con el throttling. No hay plan B: la barra lo avisa (despierto=false)
      // para que el silencio y el desfase no parezcan un bug del lector.
      this.despierto = false
      sonda.mark('wakelock-denegado')
      this.emit()
    } finally {
      this.lockEnVuelo = false
    }
  }

  /** Suelta el candado en cuanto deja de haber lectura viva, sin depender de que
   *  alguien llame a stop(). Es la red que faltaba: un actuador que retiene la
   *  pantalla necesita quien verifique que la soltó. */
  private armarWatchdogPantalla() {
    if (this.lockWatchdog) return
    this.lockWatchdog = setInterval(() => {
      const leyendo = this.curId != null && this.playing && !this.paused
      if (!leyendo) this.soltarPantalla()
    }, 30_000)
  }

  private soltarPantalla() {
    if (this.lockWatchdog) {
      clearInterval(this.lockWatchdog)
      this.lockWatchdog = null
    }
    const s = this.wakeLock
    this.wakeLock = null
    this.despierto = false
    s?.release().catch(() => {})
  }

  /**
   * Vuelta del background. Tras un rato fuera, el estado del motor no es de fiar: WebKit
   * deja la síntesis en mal estado si la página se fue a background hablando, y los
   * eventos pendientes llegan en ráfaga y mandan el resaltado a donde no va.
   * Re-arrancamos desde la última palabra CONFIRMADA (la que se ve en naranja), que es
   * justo donde el usuario dejó de mirar. Repetir un pedazo es aceptable; saltárselo no.
   */
  private onVisibility = () => {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      this.hiddenAt = this.now()
      sonda.mark('page-hidden')
      return
    }
    sonda.mark('page-visible')
    if (!this.curId) return
    void this.retenPantalla() // iOS lo suelta al ir a background: hay que re-pedirlo
    const fuera = this.now() - this.hiddenAt
    // En escritorio (WKWebView/Chrome) tapar la ventana también la marca oculta, pero ahí el
    // JS NO se congela: medido el 23 sep, las frases siguieron encadenándose sin hueco con la
    // ventana tapada 16s. Re-arrancar igual cortaba la voz y repetía la frase cada vez que
    // cambiabas de app. Fuera de iOS solo se re-arranca si el motor de verdad se quedó mudo.
    // Con la voz del servidor no hay nada que re-sincronizar: Web Audio sigue sonando oculto y el resaltado se pone al
    // día en el siguiente frame (lo da el reloj del audio, no un evento que se haya perdido).
    if (this.enAudio) { this.voz.reanudar(); this.hiddenAt = 0; return }
    const mudo = !this.synth?.speaking && this.now() - Math.max(this.ultimoBoundaryAt, this.uttStartedAt) > 2500
    if (this.playing && !this.paused && this.hiddenAt && fuera > 1200 && (isIOS || mudo)) {
      sonda.mark(`resync-tras-${(fuera / 1000).toFixed(0)}s-oculto`)
      this.speakFrom(this.idx, this.cursorOffset)
    }
    this.hiddenAt = 0
  }

  // ---- suscripción para la barra flotante ----
  subscribe(cb: () => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  private emit() {
    this.cached = {
      active: this.curId != null,
      id: this.curId,
      paused: this.paused,
      rate: RATES[this.rateIdx],
      idx: this.idx,
      total: this.blocks.length,
      despierto: this.despierto,
      resumen: this.resumen,
    }
    this.listeners.forEach((l) => l())
    this.guardaPunto()
  }
  getState(): SpeechState {
    return this.cached
  }

  isPlaying(id: string) {
    return this.playing && this.curId === id
  }
  isActive(id: string) {
    return this.curId === id
  }

  /** Toggle desde el botón del mensaje: si este mensaje ya está cargado, cierra; si no, arranca. */
  toggle(id: string, el: HTMLElement, cb?: StateCb, selectedText?: string, externo?: LecturaExterna, opciones?: { resumen?: boolean }) {
    if (!this.synth) return
    const resumen = !!opciones?.resumen && !selectedText?.trim() && !externo
    if (this.curId === id) {
      const mismoModo = this.resumen === resumen
      this.stop()
      if (mismoModo) return // mismo botón = detener; el otro botón del mismo mensaje cambia de modo
    }
    this.stop()
    this.curId = id
    this.sesion = this.resolverSesion?.() ?? null
    this.huella = externo ? '' : huellaDeTexto(el.textContent || '')
    this.container = el
    this.stateCb = cb ?? null
    this.extracto = !!selectedText?.trim() || !!externo
    this.resumen = resumen
    this.cierre = null
    this.puente = externo?.puente ?? null
    if (externo) {
      // Espejo desprendido: sin taps propios (los reenvía el puente por saltarA) ni posición guardada.
      this.blocks = externo.textos.map((t) => {
        const p = document.createElement('p')
        p.textContent = t
        return p
      })
      this.indiceEspejo = new Map(this.blocks.map((b, i) => [b, i]))
    } else if (selectedText?.trim()) {
      const excerpt=document.createElement('p')
      excerpt.textContent=selectedText
      this.blocks=[excerpt] // Detached excerpt: read only the selection, without scrolling or altering the message.
    } else this.collectBlocks()
    this.firma = this.extracto ? [] : this.blocks.filter((b) => b !== this.cierre).map(firmaDe)
    if (!this.blocks.length) {
      this.puente?.cerrar()
      this.puente = null
      this.curId = null
      return
    }
    this.idx = 0
    this.paused = false
    this.voz.reintentar() // un fallo de la lectura anterior no condena a esta a la voz del navegador
    this.vozVuelve = false
    this.servidorListo = false
    this.motor = null
    this.marcarToque(resumen ? 'resumen' : this.extracto ? 'seleccion' : 'escuchar')
    this.voz.desbloquear() // dentro del clic: Chrome y Safari solo dejan sonar Web Audio si arranca en un gesto
    if (isIOS && !this.warmed) {
      try {
        const w = new SpeechSynthesisUtterance(' ')
        w.volume = 0
        this.synth.speak(w)
      } catch { /* best effort */ }
      this.warmed = true
    }
    this.attachKeys()
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.onVisibility)
    void this.retenPantalla()
    this.play()
  }

  private collectBlocks() {
    if (!this.container) return
    // Un <li> con sub-lista no es hoja: su prosa propia se envuelve en un <span> para que
    // también se lea (ver lector-bloques.ts). Idempotente: no re-envuelve lo ya envuelto.
    for (const c of Array.from(this.container.querySelectorAll(SELECTOR_BLOQUES))) {
      for (const tramo of tramosPropios(c as unknown as NodoLector)) {
        const nodos = tramo as unknown as ChildNode[]
        if (nodos.length === 1 && (nodos[0] as HTMLElement).hasAttribute?.(MARCA_PROPIO)) continue
        const span = document.createElement('span')
        span.setAttribute(MARCA_PROPIO, '')
        nodos[0].parentNode?.insertBefore(span, nodos[0])
        for (const n of nodos) span.appendChild(n)
      }
    }
    this.blocks = bloquesLegibles(this.container)
    if (this.resumen) this.blocks = this.recortaResumen(this.blocks)
    this.clearTaps()
    this.blocks.forEach((el, i) => {
      el.style.cursor = 'pointer'
      const h = (e: MouseEvent) => {
        // Si el usuario está SELECCIONANDO texto (arrastrar para copiar), no leer.
        const sel = window.getSelection()
        if (sel && sel.type === 'Range' && sel.toString().trim()) return
        // Tap/click en un párrafo = leer DESDE LA PALABRA bajo el dedo, siempre (aunque
        // esté en pausa). Si no se puede resolver el caret exacto, cae al inicio del bloque.
        const offset = this.caretOffsetInBlock(el, e.clientX, e.clientY)
        this.jumpTo(i, offset ?? 0)
      }
      el.addEventListener('click', h)
      this.tapHandlers.push(() => el.removeEventListener('click', h))
    })
  }
  /** Subconjunto del resumen + la frase de cierre. Si el mensaje no da para resumen, se lee completo. */
  private recortaResumen(bloques: HTMLElement[]): HTMLElement[] {
    const listas = new Map<Element, number>()
    const descr: BloqueResumen[] = bloques.map((el) => {
      const l = el.closest('li') ? el.closest('ul,ol') : null
      if (l && !listas.has(l)) listas.set(l, listas.size + 1)
      return {
        texto: el.innerText,
        enTabla: !!el.closest('table'),
        enCodigo: !!el.closest('pre'),
        esEncabezado: /^H[1-6]$/.test(el.tagName),
        lista: l ? listas.get(l) : undefined,
      }
    })
    const r = elegirResumen(descr)
    if (!r) return bloques
    const out = r.indices.map((i) => bloques[i])
    if (r.cierre) {
      if (!this.cierre) {
        this.cierre = document.createElement('p')
        this.cierre.textContent = r.cierre
      }
      out.push(this.cierre)
    }
    return out
  }
  /** Bloque que se lee sin estar en el documento a propósito (una selección, la frase de cierre del resumen). */
  private desprendido(el: HTMLElement) {
    return this.extracto || el === this.cierre
  }

  /**
   * LA LECTURA SOBREVIVE A UN RE-RENDER (1 oct 2026, reporte de Daniel: «se detiene o
   * desaparece cuando hago clic o selecciono en la caja de texto»).
   *
   * Causa medida en el código: volver a la ventana (clic en la caja desde otra app) dispara
   * `window.focus` → `refreshActiveSession()` → `loadMessages(fresh)`. El mensaje recién
   * leído cambia su id local (`a-…`) por el de la base: cambia la `key`, React vuelve a
   * montar la burbuja y la limpieza del `AudioButton` viejo llamaba `stop()`. Aun con el
   * mismo id, el re-render deja los párrafos que se leían DESPRENDIDOS del documento: la
   * voz seguía sobre nodos muertos y el resaltado desaparecía.
   *
   * Ahora el motor se reubica: busca el mensaje por su id y, si el id cambió, por la firma
   * de su texto; vuelve a enganchar los párrafos y sigue en la misma palabra. Solo si el
   * mensaje ya no está en pantalla (otra conversación) la lectura se detiene.
   */
  relocate(): boolean {
    if (!this.curId || typeof document === 'undefined') return false
    const vivo = this.container?.isConnected && (this.extracto || this.blocks.every((b) => b.isConnected || b === this.cierre))
    if (vivo) return true
    const iguales = (el: HTMLElement) => {
      const t = Array.from(el.querySelectorAll(SELECTOR_BLOQUES)).map((b) => firmaDe(b as HTMLElement)).filter(Boolean)
      return this.firma.length > 0 && this.firma.every((f) => t.includes(f))
    }
    let el = document.querySelector<HTMLElement>(`[data-tts-content="${CSS.escape(this.curId)}"]`)
    let id = this.curId
    if (!el || (!this.extracto && !iguales(el))) {
      el = null
      for (const c of Array.from(document.querySelectorAll<HTMLElement>('[data-tts-content]'))) {
        if (!this.extracto && iguales(c)) { el = c; id = c.dataset.ttsContent || id; break }
      }
    }
    if (!el) return false
    this.container = el
    if (id !== this.curId) this.curId = id
    if (!this.extracto) {
      const idx = this.idx
      this.collectBlocks()
      if (!this.blocks.length) return false
      this.idx = Math.min(idx, this.blocks.length - 1)
      const b = this.blocks[this.idx]
      if (b) this.highlightAtOffset(b, this.cursorOffset)
    }
    this.huella = huellaDeTexto(el.textContent || '')
    sonda.mark('tts-reubicado')
    this.emit()
    return true
  }

  private clearTaps() {
    this.tapHandlers.forEach((r) => r())
    this.tapHandlers = []
    this.blocks.forEach((el) => (el.style.cursor = ''))
  }

  /**
   * Resuelve el offset de char (dentro de block.textContent) bajo el punto (x,y) del tap.
   * `caretRangeFromPoint` (Chrome/Safari/WebKit) o `caretPositionFromPoint` (Firefox).
   * Si ninguna existe, o el caret no cae en un text node dentro de `block`, devuelve null
   * (el caller cae al comportamiento viejo: inicio de bloque).
   */
  private caretOffsetInBlock(block: HTMLElement, x: number, y: number): number | null {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    }
    let node: Node | null = null
    let nodeOffset = 0
    if (doc.caretRangeFromPoint) {
      const r = doc.caretRangeFromPoint(x, y)
      if (!r) return null
      node = r.startContainer
      nodeOffset = r.startOffset
    } else if (doc.caretPositionFromPoint) {
      const p = doc.caretPositionFromPoint(x, y)
      if (!p) return null
      node = p.offsetNode
      nodeOffset = p.offset
    } else {
      return null
    }
    if (!node || node.nodeType !== Node.TEXT_NODE || !block.contains(node)) return null
    return this.offsetWithinBlock(block, node, nodeOffset)
  }

  /** Inversa de highlightWord(): dado un text node + offset local, devuelve el offset
   *  absoluto dentro de block.textContent, sumando longitudes con el mismo TreeWalker. */
  private offsetWithinBlock(block: HTMLElement, node: Node, nodeOffset: number): number {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    let off = 0
    let n: Node | null
    while ((n = walker.nextNode())) {
      if (n === node) return off + nodeOffset
      off += n.textContent?.length || 0
    }
    return 0 // no se encontró el nodo bajo el walker: fallback a inicio de bloque
  }

  // Atajos de teclado, activos SOLO cuando hay un mensaje cargado y el foco NO está en un
  // input/textarea/contentEditable (si no, Espacio no se escribiría y las flechas no
  // moverían el cursor del composer). Espacio = pausar/reanudar (Ctrl+Espacio funciona también en inputs) · ← → = párrafo ant/sig.
  // Ctrl+Espacio (solo Ctrl) pausa/reanuda SIEMPRE, también con el foco en la caja de
  // texto: se atrapa antes de la guarda de inputs. macOS lo tiene libre (atajos 60/61 apagados).
  private keyHandler = (e: KeyboardEvent) => {
    if (!this.curId) return
    if (e.code === 'Space' && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault()
      if (!e.repeat) this.pauseResume()
      return
    }
    const a = document.activeElement as HTMLElement | null
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    if (e.code === 'Space') {
      e.preventDefault()
      this.pauseResume()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      this.next()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      this.prev()
    }
  }
  private attachKeys() {
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.keyHandler)
  }
  private detachKeys() {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.keyHandler)
  }

  private currentVoice(): SpeechSynthesisVoice | null {
    if (!this.synth || isIOS) return null
    const es = this.synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'))
    // Preferir voces locales (las mejoradas descargadas lo son) igual que el lector de libros.
    const local = es.filter((v) => v.localService)
    const pool = local.length ? local : es
    const enh = (v: SpeechSynthesisVoice) => /(enhanced|mejorad|premium|siri|neural)/i.test(v.name)
    // SOLO fijamos la voz si encontramos a JUAN por nombre. Si no aparece —caso de la app de
    // escritorio (Tauri/WKWebView) y Safari, donde las voces mejoradas NO se exponen por
    // nombre pero el sistema SÍ las usa por defecto— devolvemos null: el caller no fija
    // utterance.voice y suena la voz del sistema (Contenido Hablado = Juan, la de Option+Esc),
    // idéntico al lector de libros. Antes caía a Paulina a la fuerza -> por eso el chat sonaba
    // distinto al libro en la misma máquina. NUNCA volver a forzar Paulina/otra aquí.
    const juan =
      pool.find((v) => /Juan/i.test(v.name) && enh(v)) ||
      pool.find((v) => /Juan/i.test(v.name)) ||
      null
    // Fuera de Apple (Windows, Linux, Android: grupal del 23 oct 2026, «la voz por defecto en Windows es fea») el
    // default del sistema suele ser una voz robótica o ni siquiera en español: se elige la mejor en español.
    if (!juan && !esApple) return mejorVozEspanol(es, idiomaPreferido(idiomasSistema()))
    return juan
  }

  // Une fragmentos cuando el punto NO cierra frase: abreviaturas (p., pp., cap., Vol.,
  // etc., vs., Dr., Ej.…), iniciales ("J.") y decimales/páginas ("p. 217", "3.1416").
  // Sin esto, las CITAS ("… — Beer, El corazón de la empresa, p. 217") se partían en
  // "…p." + "217" y el resaltado se desincronizaba en los quotes.
  private static ABBR_END =
    /(?:\b(?:pp?|p[aá]gs?|caps?|figs?|n[uú]m|nro|vols?|eds?|op|cit|arts?|Dr|Dra|Sr|Sra|Srta|Prof|Ing|Lic|Gral|Av|etc|vs|Ej|ej|ss)|\b[\p{Lu}])\.[\s"»”’)\]]*$/u
  private static NUM_END = /\d\.[\s"»”’)\]]*$/
  private static NUM_START = /^[\s"«“(]*\d/
  private static PEGADO = /[.!?…]$/

  private sentencesOf(el: HTMLElement) {
    const text = el.textContent || ''
    const raw = text.match(/[^.!?…]+[.!?…]+[\s"»”’)\]]*|[^.!?…]+$/g) || [text]
    const C = ChatSpeechController
    const parts: string[] = []
    for (const seg of raw) {
      const prev = parts.length ? parts[parts.length - 1] : null
      // PEGADO: el punto no va seguido de espacio ("22.md", "v5.5", "sfmap.app"). Una frase
      // de verdad deja aire antes de la siguiente; el regex se lo come al final de `prev`.
      if (prev != null && (C.PEGADO.test(prev) || C.ABBR_END.test(prev) || (C.NUM_END.test(prev) && C.NUM_START.test(seg)))) {
        parts[parts.length - 1] = prev + seg
      } else {
        parts.push(seg)
      }
    }
    const out: Array<{ text: string; start: number; end: number }> = []
    let pos = 0
    for (const p of parts) {
      const rawStart = text.indexOf(p, pos)
      pos = rawStart + p.length
      const lead = p.length - p.trimStart().length
      const t = p.trim()
      out.push({ text: t, start: rawStart + lead, end: rawStart + lead + t.length })
    }
    return out.filter((s) => s.text.length)
  }

  // UN solo resaltado (resaltado.ts): una caja que se mueve a la palabra que suena y se quita al cerrar. El pintado de
  // la voz del dispositivo se coalesce por frame (ver pintaPalabra en speakBlock): si llegan boundaries en ráfaga, solo
  // se pinta el último.
  private rafPintar = 0
  private pendienteDePintar: { el: HTMLElement; from: number; to: number } | null = null
  private resaltado = new ResaltadoUnico()

  private highlightWord(el: HTMLElement, start: number, end: number) {
    if (this.puente) {
      const i = this.indiceEspejo.get(el)
      if (i != null) this.puente.pintar(i, start, end)
      return
    }
    if (this.desprendido(el) && !el.isConnected) return // extracto desprendido (una selección): no hay dónde pintar
    this.resaltado.pintar(el, start, end)
  }
  private clearHighlight() {
    this.cancelaPintadoPendiente()
    this.resaltado.limpiar()
    this.puente?.limpiar()
  }

  /** Tira el pintado en cola: al parar o saltar, esa palabra ya no es la actual. */
  private cancelaPintadoPendiente() {
    if (this.rafPintar) cancelAnimationFrame(this.rafPintar)
    this.rafPintar = 0
    this.pendienteDePintar = null
  }

  /**
   * Resalta la PRIMERA palabra del bloque actual. Es el ancla "estás aquí": se pinta al
   * entrar al párrafo, ANTES de que hable, y sobrevive a la pausa y a la navegación.
   *
   * Antes esto lo hacía un marco morado alrededor del párrafo, y el naranja solo existía
   * mientras sonaba la voz (uno u otro, nunca los dos). Sobraba: con el fondo naranja de
   * la palabra ya sabes dónde empieza el párrafo y dónde vas. Un solo lenguaje visual.
   *
   * Además es el seguro del resaltado: no depende de que llegue ningún evento `boundary`.
   * Si el motor de voz no los emite, el ancla igual se ve; los boundaries solo la mueven.
   */
  private markBlockStart() {
    const el = this.blocks[this.idx]
    if (!el) return
    const text = el.textContent || ''
    // Primera palabra HABLADA, no primer carácter visible: muchos bloques abren con un
    // emoji ("💰 COMPRAS 24H") y el ancla caía sobre el emoji, que además ya no se
    // pronuncia. El mapa la devuelve a coordenadas visibles.
    const { spoken, map } = buildSpoken(text)
    const m = /\S+/.exec(spoken)
    if (!m) return
    const from = m.index
    const to = from + m[0].length
    const vFrom = map[from]
    if (vFrom == null) return
    this.highlightWord(el, vFrom, (map[to - 1] ?? vFrom) + 1)
  }

  /**
   * Trae el párrafo a la vista SOLO si hace falta.
   *
   * Antes se llamaba `scrollIntoView({smooth, block:'center'})` en CADA párrafo, aunque ya
   * estuviera centrado. Ese scroll continuo es lo más caro de la lectura en una conversación
   * larga: cada píxel movido despierta a TODOS los IntersectionObserver del chat (uno por
   * mensaje sin materializar, con 1200px de margen; uno por explicable HTML, con 700px) y
   * eso materializa markdown y monta iframes MIENTRAS se lee. El hilo principal se traba, los
   * eventos `boundary` de la voz llegan tarde, y el resaltado se queda atrás del audio: el
   * síntoma de "el lector muestra una palabra y el sonido va en otra".
   *
   * Con la zona cómoda, un mensaje que cabe en pantalla se lee entero con CERO scroll.
   */
  private ancla: (() => void) | null = null
  private soltarAncla() {
    this.ancla?.()
    this.ancla = null
  }
  /**
   * ¿El lector lleva el scroll? (25 oct 2026, Daniel: «cuando llego hasta abajo me regresa al mismo punto… no fue
   * hasta que lo cerré que sí me permitió»). Con una lectura activa, cada párrafo nuevo y cada cambio de alto del hilo
   * (el composer, la fila «Esperando a su agente») devolvían el scroll al párrafo leído, aun en pausa. Ahora el gesto
   * de Daniel sobre el hilo (rueda, dedo, tecla, clic) suelta el seguimiento; se retoma solo con un gesto al lector
   * (play, anterior/siguiente, tocar un párrafo) o cuando él mismo vuelve a dejar el párrafo leído a la vista.
   */
  private sigue = true
  private gestos: { hilo: HTMLElement; quitar: () => void } | null = null
  private vigilarGestos(hilo: HTMLElement) {
    if (this.gestos?.hilo === hilo) return
    this.dejarDeVigilar()
    const soltar = () => {
      this.sigue = false
      this.soltarAncla()
    }
    const eventos = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const
    for (const ev of eventos) hilo.addEventListener(ev, soltar, { passive: true })
    this.gestos = { hilo, quitar: () => { for (const ev of eventos) hilo.removeEventListener(ev, soltar) } }
  }
  private dejarDeVigilar() {
    this.gestos?.quitar()
    this.gestos = null
  }
  private revealBlock(el: HTMLElement) {
    if (this.puente) {
      const i = this.indiceEspejo.get(el)
      if (i != null) this.puente.ver(i)
      return
    }
    const r = el.getBoundingClientRect()
    if (!el.isConnected) return
    const hiloEl = el.closest<HTMLElement>('[data-arbrain-scroll="chat"]')
    if (!hiloEl) return
    this.vigilarGestos(hiloEl)
    const h = hiloEl.getBoundingClientRect()
    // Composer y barra se miden AHORA: el composer cambia de alto mientras se escribe.
    const composer = document.querySelector<HTMLElement>('[data-chat-composer]')?.getBoundingClientRect()
    const barra = document.querySelector<HTMLElement>('[data-tts-barra]')?.getBoundingClientRect()
    const { dentro, delta } = calcularZonaLectura({
      bloque: { top: r.top, bottom: r.bottom },
      hilo: { top: h.top, bottom: h.bottom },
      composerTop: composer && composer.height > 0 ? composer.top : null,
      barraBottom: barra && barra.height > 0 ? barra.bottom : null,
    })
    // El párrafo que se lee queda anclado donde se ve: si lo de arriba cambia de alto, no se va (ver desplazar.ts).
    this.soltarAncla()
    const anclar = () => { if (this.blocks[this.idx] === el) this.ancla = anclarElemento(hiloEl, el) }
    const aLaVista = dentro || Math.abs(delta) < 1
    if (!this.sigue) {
      // Daniel movió el hilo: no se le regresa. Si él mismo dejó el párrafo leído a la vista, se vuelve a seguir.
      if (!aLaVista) return
      this.sigue = true
    }
    if (aLaVista) return anclar()
    // La zona se calcula con rects (px en pantalla); el scroll va en px de layout. Con el zoom de la app no son lo
    // mismo (1.4 px de rect por px de scroll): sin convertir, cada seguimiento se pasaba de largo.
    const paso = delta / escalaRect(hiloEl)
    // Salto largo: al instante (una animación de cientos de ms compitiendo con la voz); corto: deslizado.
    // NUNCA `scrollBy`/`scrollTop` directos: con el zoom de la app, WKWebView deja el compositor en otra posición
    // y el mensaje se ve en blanco debajo del párrafo (12 oct 2026, ver desplazar.ts).
    if (Math.abs(paso) > hiloEl.clientHeight) {
      fijarScroll(hiloEl, hiloEl.scrollTop + paso)
      anclar()
    } else deslizarScroll(hiloEl, hiloEl.scrollTop + paso, undefined, anclar)
  }

  private speakBlock(motivo = 'bloque'): void {
    if (!this.synth) return
    const el = this.blocks[this.idx]
    if (!el) return this.stop()
    this.revealBlock(el)
    // Tras una caída del servidor, el párrafo vuelve a su voz en cuanto el sondeo respondió (sondeaServidor).
    if (!this.voz.disponible && this.vozVuelve && this.servidorListo) {
      this.vozVuelve = false
      this.servidorListo = false
      this.voz.reintentar()
    }
    if (this.voz.disponible) return this.hablaConAudio(el)
    this.usaMotor('navegador', motivo)
    this.sondeaServidor()

    const sents = this.sentencesOf(el)
    // Consumir el arranque a mitad de bloque (si lo hay): lo setea speakFrom().
    const startAt = this.startOffset
    this.startOffset = null

    let si = 0
    let localStart = 0
    if (startAt != null && sents.length) {
      // Primera frase cuyo end > charOffset; clamp a la última si se pasa.
      si = sents.findIndex((s) => s.end > startAt)
      if (si === -1) si = sents.length - 1
      const fs = sents[si]
      localStart = Math.max(0, Math.min(fs.text.length, startAt - fs.start))
      // SNAP hacia atrás al inicio de la palabra (no cortar a media palabra).
      let k = localStart
      while (k > 0 && !/\s/.test(fs.text[k - 1])) k--
      localStart = k
      this.cursorOffset = fs.start + localStart
      this.highlightAtOffset(el, this.cursorOffset)
    } else {
      // Ancla visible desde el primer instante, sin esperar a la voz ni a un boundary.
      this.cursorOffset = sents.length ? sents[0].start : 0
      this.markBlockStart()
    }
    this.emit()

    let cursor = si
    const next = () => {
      if (!this.playing) return
      // Entre frases (nunca a media frase): si un re-render desprendió el párrafo, se
      // reengancha y se sigue en el nodo nuevo desde la frase que tocaba.
      if (!el.isConnected && !this.desprendido(el)) {
        if (this.relocate()) {
          const s = sents[cursor]
          this.startOffset = s ? s.start : null
          if (!s) { if (this.idx < this.blocks.length - 1) this.idx++; else return this.stop() }
          return this.speakBlock()
        }
      }
      if (cursor >= sents.length) {
        // NO se limpia el resaltado aquí: al saltar al siguiente bloque, markBlockStart()
        // lo reubica. Limpiarlo dejaba el texto sin ancla en cada cambio de párrafo.
        if (this.idx < this.blocks.length - 1) {
          this.idx++
          this.speakBlock()
        } else this.stop()
        return
      }
      const isFirst = cursor === si
      const s = sents[cursor++]
      // Solo la PRIMERA frase hablada arranca a mitad (localStart); las siguientes, completas.
      const sliceStart = isFirst ? localStart : 0
      const sentText = sliceStart > 0 ? s.text.slice(sliceStart) : s.text
      // Cursor al iniciar la frase (piso mínimo si no llegan boundaries en esta plataforma).
      this.cursorOffset = s.start + sliceStart

      // Secuencia por utterance: iOS a veces dispara `boundary` TARDE (después del onend) y re-pintaba la última
      // palabra al final de cada párrafo. Un evento de una utterance ya terminada se ignora.
      const seq = ++this.uttSeq
      const { spoken, map } = buildSpoken(sentText)
      // Frase que era puro ruido (un bullet con solo un emoji, una URL suelta): no hay nada que decir.
      if (!spoken.trim()) return next()
      const u = new SpeechSynthesisUtterance(spoken)
      const v = this.currentVoice()
      if (v) {
        u.voice = v
        u.lang = v.lang
      } else u.lang = idiomaDeRespaldo(idiomasSistema())
      u.rate = RATES[this.rateIdx]
      const primera = /\S+/.exec(spoken)

      // La posición (de donde reanuda la pausa) se mueve con cada marca real; el PINTADO se coalesce por frame: si el
      // hilo se trabó y los boundaries llegan en ráfaga, el resaltado salta a la palabra actual en vez de arrastrarse.
      const pintaPalabra = (w: { from: number; to: number }) => {
        const vFrom = map[w.from]
        if (vFrom == null) return
        const from = s.start + sliceStart + vFrom
        const to = s.start + sliceStart + (map[w.to - 1] ?? vFrom) + 1
        this.cursorOffset = from
        this.guardaPunto()
        this.pendienteDePintar = { el, from, to }
        if (this.rafPintar) return
        this.rafPintar = requestAnimationFrame(() => {
          this.rafPintar = 0
          const p = this.pendienteDePintar
          this.pendienteDePintar = null
          if (!p) return
          // el párrafo pudo cambiar de nodo por un re-render: pintar en el nuevo
          const destino = p.el.isConnected || this.desprendido(p.el) ? p.el : this.relocate() ? this.blocks[this.idx] : null
          if (destino) this.highlightWord(destino, p.from, p.to)
        })
      }

      u.onboundary = (ev) => {
        if (seq !== this.uttSeq) return
        if (ev.name && ev.name !== 'word') return
        this.ultimoBoundaryAt = this.now()
        // charIndex viene en coordenadas del texto HABLADO: el mapa lo lleva al VISIBLE.
        const m = /\S+/.exec(spoken.slice(ev.charIndex))
        if (!m) return
        const desde = ev.charIndex + m.index
        pintaPalabra({ from: desde, to: desde + m[0].length })
      }
      // La frase empezó a SONAR: su primera palabra es la que suena (WebKit tarda 200–600 ms entre speak() y el audio).
      u.onstart = () => {
        if (seq !== this.uttSeq) return
        this.uttStartedAt = this.now()
        this.primerAudio('navegador')
        if (primera) pintaPalabra({ from: primera.index, to: primera.index + primera[0].length })
      }
      u.onend = () => {
        // Utterance vieja (cancelada por un salto o un cambio de velocidad): no avanzar, o hablaría dos veces.
        if (seq !== this.uttSeq) return
        this.uttSeq++
        this.soltarDestrabe()
        next()
      }
      u.onerror = () => {
        if (seq !== this.uttSeq) return
        this.uttSeq++
        this.soltarDestrabe()
        next()
      }
      sonda.mark('tts-speak')
      this.uttStartedAt = 0
      this.ultimoBoundaryAt = 0
      this.synth!.speak(u)
      this.uttStart = this.now() // referencia del keepalive de Chrome (ver play())
      this.armarDestrabe(seq, next)
    }
    next()
  }

  // ─── VOZ DEL SERVIDOR (22 oct 2026; Web Audio desde el 23 oct; marcas exactas desde el 29 oct) ──────────────
  // El servidor genera cada tramo ya a la velocidad pedida (atempo, mismo tono) con la tabla exacta de cuándo empieza
  // cada palabra en ESE audio (ver voz-servidor.ts y marcas-voz.ts). Aquí hay un solo reloj, voz.posicion() (lo que sale
  // por la bocina ahora), y en cada fotograma el resaltado va a la palabra de ese instante. Cada párrafo se parte en
  // tramos de pocas frases y se precargan los PRECARGA siguientes, aunque sean de otros párrafos. Si el servidor falla,
  // el tramo se reintenta (ESPERAS_REINTENTO_MS); si sigue sin llegar, sigue la voz del navegador desde esa palabra y la
  // del servidor vuelve en el párrafo siguiente en cuanto responde (31 oct 2026).
  private voz = new VozServidor((texto, velocidad, formato, signal, prioridad) =>
    fetch('/api/chat/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texto, lector: true, velocidad, ...(formato === 'opus' ? { formato } : {}), ...(prioridad ? { prioridad } : {}) }),
      signal,
    }),
  )
  /** Hay un tramo sonando (o a punto) por la voz del servidor. */
  private enAudio = false
  private rafAudio = 0
  /** Cambio de velocidad a media lectura: pide el tramo actual a la nueva velocidad y lo releva en la palabra que suena. */
  private relevoVelocidad: (() => void) | null = null
  /** Duración de un cuadro de pantalla (s), medida entre fotogramas del reloj: lo que tarda en verse lo que se pinta. */
  private cuadro = 1 / 60
  /** Lo que suena ahora por la voz del servidor (lo lee el arnés de scripts/qa/lector-marcas para medir). */
  private sonando: { el: HTMLElement; texto: string; velocidad: number; palabras: Array<[number, number]>; tiempos: number[]; exactas: boolean } | null = null
  /** El gesto que espera su primer audio (Escuchar, tap, reanudar, salto): la bitácora mide cuánto tardó en sonar. */
  private toque: { t: number; tipo: string } | null = null
  /** Último primer audio medido (lo lee el arnés de scripts/qa/lector-marcas). */
  private ultimoPrimerAudio: Record<string, unknown> | null = null
  /** Voz que suena en esta lectura: cada cambio queda en la bitácora. */
  private motor: 'servidor' | 'navegador' | null = null
  /** La voz del servidor cayó por la red o por el servidor: se sondea para volver en el siguiente párrafo. */
  private vozVuelve = false
  private servidorListo = false
  private sondeo: Promise<unknown> | null = null
  /** Reintento en espera de un tramo que no llegó (ESPERAS_REINTENTO_MS). */
  private reintento: ReturnType<typeof setTimeout> | null = null

  private marcarToque(tipo: string) {
    this.toque = { t: this.now(), tipo }
  }

  /** El primer audio del gesto ya sale por la bocina: a la bitácora (lector-registro.ts). `atras`: hace cuántos ms. */
  private primerAudio(motor: 'servidor' | 'navegador', atras = 0, extra: Record<string, unknown> = {}) {
    const g = this.toque
    if (!g) return
    this.toque = null
    const ms = Math.max(0, Math.round(this.now() - atras - g.t))
    this.ultimoPrimerAudio = { ms, toque: g.tipo, motor, ...extra }
    sonda.mark(`tts-primer-audio(${ms}ms)`)
    registrarLector({ tipo: 'primer-audio', ms, toque: g.tipo, motor, velocidad: RATES[this.rateIdx], ...extra })
  }

  private usaMotor(m: 'servidor' | 'navegador', motivo: string) {
    if (this.motor && this.motor !== m) {
      sonda.mark(`tts-motor(${this.motor}→${m}: ${motivo})`)
      registrarLector({ tipo: 'motor', de: this.motor, a: m, motivo })
    }
    this.motor = m
  }

  /**
   * Con la voz del navegador tras una caída del servidor: pide ya el primer tramo del párrafo siguiente. Si llega, ese
   * párrafo vuelve a la voz del servidor (y su audio ya está en la caché: sin espera). Si no, se intenta en el próximo.
   */
  private sondeaServidor() {
    if (!this.vozVuelve || this.servidorListo || this.sondeo) return
    if (this.sondeoTimer) { clearTimeout(this.sondeoTimer); this.sondeoTimer = null }
    const b = this.blocks[this.idx + 1]
    if (!b) return
    const sp = buildSpoken(b.textContent || '').spoken
    const t0 = tramosDeVoz(sp, palabrasDe(sp))[0]
    if (!t0) return
    const lectura = this.curId
    this.sondeo = this.voz.cargar(t0.texto, RATES[this.rateIdx]).then(
      () => { if (this.curId === lectura) this.servidorListo = true },
      // Sigue caído: se vuelve a preguntar en un momento (un párrafo de la voz del navegador dura decenas de segundos).
      () => { if (this.curId === lectura && this.playing) this.sondeoTimer = setTimeout(() => { this.sondeoTimer = null; this.sondeaServidor() }, SONDEO_MS) },
    ).finally(() => { this.sondeo = null })
  }
  private sondeoTimer: ReturnType<typeof setTimeout> | null = null

  private paraAudio() {
    if (this.reintento) clearTimeout(this.reintento)
    this.reintento = null
    this.relevoVelocidad = null
    if (this.rafAudio) cancelAnimationFrame(this.rafAudio)
    this.rafAudio = 0
    this.voz.parar()
    this.enAudio = false
    this.sonando = null
  }

  private hablaConAudio(el: HTMLElement): void {
    const { spoken, map } = buildSpoken(el.textContent || '')
    const words = palabrasDe(spoken)
    const startAt = this.startOffset
    this.startOffset = null
    // Bloque que era puro ruido (un emoji, una URL): nada que decir.
    if (!words.length) {
      if (this.idx < this.blocks.length - 1) {
        this.idx++
        return this.speakBlock()
      }
      return this.stop()
    }
    // Palabra de arranque: la que contiene el offset pedido (tap, reanudar), o la primera.
    let w0 = 0
    if (startAt != null) {
      const i = words.findIndex((w) => (map[w.to - 1] ?? -1) >= startAt)
      w0 = i < 0 ? words.length - 1 : i
    }
    let tramos = tramosDeVoz(spoken, words)
    // Arranque a media frase (tap, salto) en un tramo que no está en la caché: se pide un tramo que EMPIEZA en la palabra
    // tocada y corta pronto (31 oct 2026: antes se sintetizaba el tramo entero, también lo que ya no iba a sonar). Si el
    // tramo ya está (reanudar tras una pausa), se usa ese: arranca sin pedir nada.
    const t0Viejo = tramos.findIndex((tr) => w0 < tr.hasta)
    if (w0 > 0 && t0Viejo >= 0 && w0 > tramos[t0Viejo].desde && !this.voz.enCache(tramos[t0Viejo].texto, RATES[this.rateIdx]))
      tramos = tramosDesde(spoken, words, w0)
    // Offsets VISIBLES de cada palabra hablada (lo que se pinta).
    const visibles = words.map((w): [number, number] => {
      const from = map[w.from] ?? 0
      return [from, (map[w.to - 1] ?? from) + 1]
    })
    let bloque = el
    const pinta = (i: number) => {
      const [from, to] = visibles[i]
      this.cursorOffset = from
      this.guardaPunto()
      if (!bloque.isConnected && !this.desprendido(bloque)) {
        if (!this.relocate()) return
        bloque = this.blocks[this.idx]
        if (this.sonando) this.sonando.el = bloque
      }
      this.highlightWord(bloque, from, to)
    }
    pinta(w0)
    this.emit()

    const seq = ++this.uttSeq
    // Lo que suena ahora: tramo y palabra (índices de este párrafo). `turno` cambia con cada fuente que arranca o
    // termina: un relevo de velocidad que llega tarde (el tramo ya acabó) no debe volver atrás.
    let actual = { t: -1, palabra: w0 }
    let turno = 0
    // Rescates seguidos del reloj del audio (ver el vigía en tick): vuelve a 0 en cuanto el reloj avanza.
    let rescates = 0
    // Tramo pedido que aún no suena (arranque, siguiente o relevo): un cambio de velocidad lo vuelve a pedir.
    let espera: { t: number; desde: number | null } | null = null
    // Del tramo que suena: cuánto se esperó desde que se pidió (≈0 si venía de la precarga) y su medida de red.
    let esperaTramo = 0
    let medida: AudioTramo['medida'] | null = null
    const siguienteBloque = () => {
      if (this.idx < this.blocks.length - 1) {
        this.idx++
        this.speakBlock()
      } else this.stop()
    }
    const precarga = (t: number) => {
      const v = RATES[this.rateIdx]
      let n = 0
      for (let k = t + 1; k < tramos.length && n < PRECARGA; k++, n++) this.voz.precargar(tramos[k].texto, v)
      for (let b = this.idx + 1; b < this.blocks.length && n < PRECARGA; b++) {
        const sp = buildSpoken(this.blocks[b].textContent || '').spoken
        for (const tr of tramosDeVoz(sp, palabrasDe(sp))) {
          if (n++ >= PRECARGA) break
          this.voz.precargar(tr.texto, v)
        }
      }
    }
    // `servidor`: cayó la red o el servidor (no el audio de este equipo): la voz del servidor vuelve en el siguiente
    // párrafo. `palabra`: desde dónde sigue la voz del navegador (la primera del tramo que no llegó; nada se salta).
    const falla = (motivo: string, o: { servidor?: boolean; palabra?: number } = {}) => {
      if (seq !== this.uttSeq) return
      sonda.mark(`tts-audio-falla(${motivo})`)
      console.warn('[lector] la voz del servidor falló; sigo con la del navegador:', motivo)
      // Una edición sin voz de servidor (alumno sin llave) no es una falla: es su voz de siempre.
      if (!/sin_voz_servidor/.test(motivo)) registrarLector({ tipo: 'falla', motivo, servidor: !!o.servidor, velocidad: RATES[this.rateIdx] })
      this.vozVuelve = !!o.servidor
      this.servidorListo = false
      this.voz.disponible = false
      this.paraAudio()
      this.uttSeq++
      const w = o.palabra != null ? visibles[Math.min(visibles.length - 1, Math.max(0, o.palabra))] : null
      this.startOffset = w ? w[0] : this.cursorOffset
      if (this.playing && !this.paused && this.curId) this.speakBlock(motivo)
    }

    // `desde`: palabra del párrafo donde arrancar; `null` = la que suena en el momento de arrancar (relevo).
    // `intento`: reintentos ya hechos de este tramo (ESPERAS_REINTENTO_MS).
    const suena = (t: number, desde: number | null, intento = 0) => {
      const tramo = tramos[t]
      if (!tramo) return siguienteBloque()
      const v = RATES[this.rateIdx]
      const miTurno = turno
      const pedido = this.now()
      espera = { t, desde }
      this.voz.cargar(tramo.texto, v, true).then((audio) => {
        if (seq !== this.uttSeq || !this.playing || this.paused) return
        // Otro arranque ganó (el tramo terminó antes del relevo) o la velocidad volvió a cambiar (ya viene otro).
        if (miTurno !== turno || v !== RATES[this.rateIdx]) return
        turno++
        espera = null
        esperaTramo = Math.round(this.now() - pedido)
        medida = audio.medida ?? null
        const sub = words.slice(tramo.desde, tramo.hasta)
        // Instante de cada palabra en ESTE audio: las marcas de la síntesis. Solo una voz sin marcas usa el respaldo.
        const exactos = audio.marcas ? tiemposDeMarcas(tramo.texto, audio.marcas) : null
        const exactas = !!exactos && exactos.length === sub.length
        const tiempos = exactas ? exactos! : tiemposDelAudio(spoken, sub, audio.buffer.getChannelData(0), audio.buffer.sampleRate)
        const local = Math.min(sub.length - 1, Math.max(0, (desde ?? actual.palabra) - tramo.desde))
        actual = { t, palabra: tramo.desde + local }
        if (this.rafAudio) cancelAnimationFrame(this.rafAudio)
        this.rafAudio = 0
        try {
          this.voz.sonar(audio, local ? tiempos[local] : 0, () => {
            if (seq !== this.uttSeq) return
            if (this.rafAudio) cancelAnimationFrame(this.rafAudio)
            this.rafAudio = 0
            turno++
            suena(t + 1, tramo.hasta)
          })
        } catch (e) {
          return falla(e instanceof Error ? e.message : 'web audio')
        }
        this.enAudio = true
        this.usaMotor('servidor', intento ? `reintento ${intento}` : 'tramo')
        this.sonando = { el: bloque, texto: tramo.texto, velocidad: v, palabras: visibles.slice(tramo.desde, tramo.hasta), tiempos, exactas }
        sonda.mark(`${exactas ? 'tts-audio' : 'tts-audio-sin-marcas'}${audio.tempo === v ? '' : `(${audio.tempo}≠${v})`}`)
        // EL reloj: en cada fotograma, la palabra que sonará cuando ESTE fotograma llegue a la pantalla: voz.posicion()
        // (lo que sale por la bocina ahora) más un cuadro, lo que tarda en verse lo que se pinta en este rAF. Medido en el
        // WKWebView (scripts/qa/lector-marcas): sin ese cuadro el ámbar llegaba ~20 ms tarde a cada palabra. Mientras el
        // arranque del tramo todavía no sale por la bocina (la latencia de salida), se queda lo pintado: ni vuelve a la
        // palabra anterior ni se adelanta.
        let ultima = -1
        let previo = 0
        // Vigía del reloj del audio (ver VozServidor.reabrir): quieto 1.5 s sonando → reabrir la salida; otros 1.5 s →
        // contexto nuevo desde la palabra que sonaba; si tampoco, la voz del navegador. La lectura nunca se queda atorada.
        let relojVisto = -1
        let relojDesde = 0
        const tick = (ahora?: number) => {
          if (seq !== this.uttSeq) return
          if (ahora && previo) this.cuadro = Math.min(0.034, Math.max(0.008, this.cuadro * 0.9 + ((ahora - previo) / 1000) * 0.1))
          if (ahora) previo = ahora
          const r = this.voz.reloj()
          const ya = this.now()
          if (r == null) { /* sin fuente: nada que vigilar */ }
          else if (r !== relojVisto) {
            if (relojVisto >= 0) rescates = 0 // avanzó de verdad (la primera lectura de un tramo no cuenta)
            relojVisto = r
            relojDesde = ya
          } else if (this.voz.corriendo() && ya - relojDesde > 1500) {
            relojDesde = ya
            rescates++
            sonda.mark(`tts-reloj-quieto(${rescates})`)
            if (rescates === 1) this.voz.reabrir()
            else if (rescates === 2) {
              this.voz.reabrir(true)
              turno++
              return suena(t, actual.palabra)
            } else return falla('reloj de audio detenido')
          }
          // El primer audio del gesto ya sale por la bocina (posición ≥ 0): cuándo cruzó, con el reloj del audio.
          if (this.toque) {
            const oido = this.voz.posicion() - (local ? tiempos[local] : 0)
            if (oido >= 0) this.primerAudio('servidor', oido * 1000, { chars: tramo.texto.length, espera_ms: esperaTramo, ...(medida ?? {}) })
          }
          const pos = this.voz.posicion() + this.cuadro
          const i = pos < tiempos[local] ? -1 : palabraEn(tiempos, pos)
          if (i >= 0 && i !== ultima) {
            ultima = i
            actual.palabra = tramo.desde + i
            pinta(actual.palabra)
          }
          this.rafAudio = requestAnimationFrame(tick)
        }
        tick()
        precarga(t)
        // Sin gesto, Chrome deja el contexto suspendido y no suena nada: mejor la voz del navegador que el silencio.
        const turnoAqui = turno
        setTimeout(() => {
          if (seq === this.uttSeq && turno === turnoAqui && this.playing && !this.paused && !this.voz.corriendo())
            falla('contexto suspendido')
        }, 2500)
      }, (e: unknown) => {
        if (seq !== this.uttSeq || !this.playing || this.paused) return
        // Ya se pidió otro (un relevo de velocidad o un arranque que ganó): este fallo no decide nada.
        if (miTurno !== turno || v !== RATES[this.rateIdx]) return
        const motivo = e instanceof Error ? e.message : 'red'
        const servidor = e instanceof FallaVoz ? e.reintentable : true
        if (servidor && intento < ESPERAS_REINTENTO_MS.length) {
          sonda.mark(`tts-reintento(${intento + 1}: ${motivo})`)
          registrarLector({ tipo: 'reintento', motivo, intento: intento + 1 })
          if (this.reintento) clearTimeout(this.reintento)
          this.reintento = setTimeout(() => {
            this.reintento = null
            if (seq === this.uttSeq && miTurno === turno && this.playing && !this.paused) suena(t, desde, intento + 1)
          }, ESPERAS_REINTENTO_MS[intento])
          return
        }
        falla(motivo, { servidor, palabra: desde ?? actual.palabra })
      })
    }
    this.relevoVelocidad = () => {
      // Lo que se esperaba se pide de nuevo a la velocidad nueva; si ya suena, el tramo actual se releva en su palabra.
      if (espera) suena(espera.t, espera.desde)
      else if (actual.t >= 0) suena(actual.t, null)
    }

    const t0 = Math.max(0, tramos.findIndex((tr) => w0 < tr.hasta))
    suena(t0, w0)
  }

  /** speakFrom() lo usa para anclar la palabra exacta ANTES de que arranque la voz
   *  (mismo rol que markBlockStart(), pero para un offset a mitad de bloque en vez del
   *  primer word del bloque). Escanea sobre el texto RAW del bloque, mismo criterio de
   *  "palabra" que el snap de arriba (separadores = whitespace). */
  private highlightAtOffset(el: HTMLElement, offset: number) {
    const text = el.textContent || ''
    let start = offset
    while (start > 0 && !/\s/.test(text[start - 1])) start--
    let end = offset
    while (end < text.length && !/\s/.test(text[end])) end++
    if (end <= start) return
    this.highlightWord(el, start, end)
  }

  /**
   * EL PRIMITIVO ÚNICO. Arranca (o reanuda) la lectura del bloque `blockIdx` desde el
   * carácter `charOffset` (offset dentro de block.textContent). Es cancel+re-speak desde
   * la palabra: mismo comportamiento en Chrome/WebKit/WKWebView, granularidad de palabra.
   * Lo usan pauseResume() (resume exacto) y jumpTo() (tap-en-punto).
   */
  private speakFrom(blockIdx: number, charOffset: number) {
    if (!this.synth || !this.blocks.length) return
    this.idx = Math.max(0, Math.min(this.blocks.length - 1, blockIdx))
    this.paused = false
    this.startOffset = Math.max(0, charOffset)
    if (!this.playing) {
      this.playing = true
      this.stateCb?.(true)
    }
    // Ancla naranja SÍNCRONA en la palabra tocada/reanudada, antes del debounce de
    // 60ms de cancelAndSpeak(). Sin esto, tap y resume tenían ~60ms de retraso
    // perceptible frente a las flechas (jump), que sí anclan al instante. speakBlock()
    // la re-confirma tras el debounce (idempotente).
    const el = this.blocks[this.idx]
    if (el) {
      this.cursorOffset = this.startOffset
      this.highlightAtOffset(el, this.startOffset)
    }
    this.voz.desbloquear()
    this.cancelAndSpeak() // ya trae el debounce de 60ms para el cancel() async de WebKit
    this.emit()
  }

  // ---- Voz del dispositivo: señales y destrabe ----
  // Los eventos de la Web Speech API no son confiables en todas las superficies (medido el 15 jul y el 23 sep 2026):
  // Chrome emite boundary y onend perfectos; el WKWebView de la app y el iPhone también desde macOS 27; algún motor no
  // los emite. El resaltado de esta voz solo se mueve con `boundary` (ver speakBlock). Lo único que se vigila aquí es
  // que la lectura no se TRABE si `onend` nunca llega: eso es avanzar, no adivinar dónde va la voz.
  private destrabe: ReturnType<typeof setInterval> | null = null
  private uttStart = 0
  // Cuándo empezó a SONAR la frase actual (onstart) y la última marca real de la plataforma. 0 = aún no.
  private uttStartedAt = 0
  private ultimoBoundaryAt = 0

  private soltarDestrabe() {
    if (this.destrabe) clearInterval(this.destrabe)
    this.destrabe = null
  }

  /**
   * Si la frase terminó y nadie avisó (`onend` perdido): el motor dice que ya no habla durante 1.5 s → siguiente frase.
   * Si dice que habla pero está mudo (sin ninguna señal en 10 s, o 30 s en una plataforma que no emite boundaries): se
   * cancela y se sigue. `cancel()` es ASÍNCRONO en WebKit: la frase siguiente espera un respiro o la cancelación
   * pendiente se la lleva entera (ver cancelAndSpeak). El techo viejo de 20 s en silencio era el «se queda pausado».
   */
  private armarDestrabe(seq: number, next: () => void) {
    this.soltarDestrabe()
    const pedida = this.now()
    let callado = 0
    this.destrabe = setInterval(() => {
      if (seq !== this.uttSeq) return this.soltarDestrabe()
      if (this.paused || !this.synth) return
      const ahora = this.now()
      if (!this.synth.speaking && !this.synth.pending) {
        if (!callado) callado = ahora
        if (ahora - callado < 1500) return
      } else {
        callado = 0
        const senal = Math.max(this.ultimoBoundaryAt, this.uttStartedAt, pedida)
        if (ahora - senal < (this.ultimoBoundaryAt ? 10_000 : 30_000)) return
        this.synth.cancel()
      }
      this.uttSeq++
      this.soltarDestrabe()
      if (this.speakTimer) clearTimeout(this.speakTimer)
      this.speakTimer = setTimeout(() => {
        this.speakTimer = null
        if (this.playing && !this.paused && this.curId) next()
      }, 60)
    }, 300)
  }

  private now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  /**
   * Cancela lo que suena y arranca el bloque actual, con un tick de aire en medio.
   *
   * `cancel()` es ASÍNCRONO en WebKit: si hablas en el mismo tick, la cancelación pendiente
   * se lleva por delante la utterance recién encolada. La frase se pierde entera (sin audio
   * y sin boundary) y el motor salta a la siguiente como si nada. Ese era el "no dice tal
   * cual el texto" al arrancar y en cada salto de párrafo.
   */
  private cancelAndSpeak() {
    if (!this.synth) return
    this.uttSeq++ // invalida boundary/onend de la utterance que se está cancelando
    this.soltarDestrabe()
    this.paraAudio()
    const hablaba = this.synth.speaking || this.synth.pending
    this.synth.cancel()
    if (this.speakTimer) clearTimeout(this.speakTimer)
    this.speakTimer = null
    // El respiro solo hace falta si la voz del navegador estaba hablando Y la que sigue también es la suya. La voz del
    // servidor (Web Audio) no tiene esa carrera: arranca ya (31 oct 2026: 60 ms menos en cada play, tap y reanudar).
    if (!hablaba || this.voz.disponible) {
      if (this.playing && !this.paused && this.curId) this.speakBlock()
      return
    }
    this.speakTimer = setTimeout(() => {
      this.speakTimer = null
      if (this.playing && !this.paused && this.curId) this.speakBlock()
    }, 60)
  }

  private play() {
    if (!this.synth || this.playing) return
    this.playing = true
    this.paused = false
    this.stateCb?.(true)
    // Keepalive de Chrome, ahora QUIRÚRGICO. Existe por el corte de Chrome a los ~15s de
    // una MISMA utterance. Pero aquí se habla frase por frase (3-8s típico), así que casi
    // ninguna frase llega a ese límite — y aplicar el pause+resume igual es DAÑINO: en
    // medio de una frase tira los `boundary` pendientes y el resaltado se queda atrás del
    // audio. Antes corría a ciegas cada 10s durante toda la lectura. Ahora solo toca las
    // frases que de verdad se acercan al corte.
    if (isChrome)
      this.chromeTimer = setInterval(() => {
        if (this.paused || !this.synth!.speaking || this.synth!.paused) return
        if (this.now() - this.uttStart < 10000) return
        this.synth!.pause()
        this.synth!.resume()
        this.uttStart = this.now() // siguiente refresco dentro de otros 10s
      }, 3000)
    this.markBlockStart() // ancla ya visible; no espera al tick de la voz
    this.cancelAndSpeak()
    this.emit()
  }

  // ---- controles de la barra ----
  pauseResume() {
    if (!this.synth || !this.curId) return
    if (this.paused) {
      this.paused = false
      this.sigue = true // play es gesto al lector: vuelve a llevar el scroll
      if (!this.playing) {
        this.playing = true
        this.stateCb?.(true)
      }
      void this.retenPantalla() // la restauración arranca en pausa sin candado
      this.marcarToque('reanudar')
      // Reanudar SIEMPRE por la palabra exacta (cursorOffset), NUNCA por synth.resume():
      // ese camino es inconsistente entre plataformas. speakFrom = cancel + re-speak
      // desde la palabra, idéntico en todas las superficies.
      this.speakFrom(this.idx, this.cursorOffset)
    } else {
      this.paused = true
      if (this.enAudio) this.paraAudio()
      else this.synth.pause()
    }
    // En pausa NO se limpia el resaltado: el naranja se queda donde iba la voz. Ese es el
    // "estás aquí" (antes lo hacía el marco morado, que ya no existe).
    this.emit()
  }
  prev() {
    this.jump(this.idx - 1)
  }
  next() {
    this.jump(this.idx + 1)
  }
  cycleRate() {
    this.rateIdx = (this.rateIdx + 1) % RATES.length
    this.emit()
    // Con la voz del servidor el tramo actual sigue sonando hasta que llega a la velocidad nueva (~1 s) y se releva en
    // la palabra que suena: sin silencio ni volver al inicio del párrafo.
    if (this.relevoVelocidad) {
      this.relevoVelocidad()
      return
    }
    // Solo re-arrancar si REALMENTE está sonando. En pausa, `playing` sigue true (no
    // refleja "está vocalizando"), así que sin el !this.paused el cambio de velocidad
    // reanudaba el audio a la fuerza y reiniciaba el párrafo. En pausa solo memorizamos
    // el nuevo rate (lo toma la próxima utterance).
    if (this.playing && !this.paused && this.curId) {
      // La velocidad de una utterance queda fija al hablarla: para que aplique AL INSTANTE
      // se corta y se re-habla con el nuevo rate DESDE LA PALABRA que sonaba (antes
      // re-arrancaba el párrafo entero y cada toque de 1x a 1.75x lo rebobinaba tres veces).
      this.speakFrom(this.idx, this.cursorOffset)
    }
  }

  /** El cursor está sobre el botón del lector de `el`: pide ya el primer tramo a la velocidad actual (sin tocar nada
   *  más). El clic que llega ~0.3–1 s después lo encuentra en caché o en vuelo; sin esto el primer audio tardaba 1.5 s. */
  anticipar(el: HTMLElement) {
    if (!this.voz.disponible || this.curId) return
    const b = bloquesLegibles(el)[0]
    if (!b) return
    const sp = buildSpoken(b.textContent || '').spoken
    const t0 = tramosDeVoz(sp, palabrasDe(sp))[0]
    if (t0) this.voz.precargar(t0.texto, RATES[this.rateIdx])
  }

  /** Un toque en el texto original (lo reenvía el puente de una lectura externa): leer desde esa palabra. */
  saltarA(bloque: number, offset = 0) {
    if (this.puente) this.jumpTo(bloque, offset)
  }
  /** Velocidad (una de RATES) que se quiere desde el arranque; la ignora si no es válida. */
  fijarVelocidad(rate: number) {
    const i = indiceDeVelocidad(rate)
    if (i < 0 || i === this.rateIdx) return
    this.rateIdx = i
    this.relevoVelocidad?.()
    this.emit()
  }

  // Tap/click en un párrafo: SIEMPRE leer desde ahí (aunque estuviera en pausa), desde
  // la palabra exacta bajo el dedo (charOffset, calculado en collectBlocks()).
  private jumpTo(i: number, charOffset = 0) {
    if (!this.blocks.length || !this.synth) return
    this.sigue = true
    this.marcarToque('tap')
    this.speakFrom(i, charOffset)
  }

  private jump(i: number) {
    if (!this.blocks.length || !this.synth) return
    this.sigue = true
    this.idx = Math.max(0, Math.min(this.blocks.length - 1, i))
    if (this.paused) {
      // Navegar entre párrafos SIN reproducir: el ancla naranja se muda al párrafo nuevo.
      // Play reanuda ahí (pauseResume re-arranca porque la utterance ya se canceló).
      this.uttSeq++
      this.soltarDestrabe()
      this.paraAudio()
      this.synth.cancel()
      if (this.speakTimer) {
        clearTimeout(this.speakTimer)
        this.speakTimer = null
      }
      this.playing = false
      this.cursorOffset = 0 // navegar a un párrafo nuevo invalida la posición del anterior
      this.markBlockStart()
      const b = this.blocks[this.idx]
      if (b) this.revealBlock(b)
      this.emit()
      return
    }
    if (!this.playing) {
      this.playing = true
      this.stateCb?.(true)
    }
    this.marcarToque('salto')
    this.markBlockStart()
    this.cancelAndSpeak()
    this.emit()
  }

  /** Pausa y guarda el punto (cambio de conversación, mensaje que sale de pantalla): NO olvida. */
  suspend() {
    if (!this.curId) return
    this.guardaPunto(true)
    this.stop(false)
  }

  /** `olvidar` (por defecto sí): parar es gesto explícito o fin de lectura, la próxima empieza de cero. */
  /** Recoloca el bloque activo en la zona visible (p. ej. el composer cambió de alto). */
  reajustar() {
    // En pausa no se recoloca nada: Daniel está leyendo o moviéndose por el hilo, no siguiendo la voz.
    const el = this.blocks[this.idx]
    if (el && this.getState().active && !this.paused && this.sigue) this.revealBlock(el)
  }

  stop(olvidar = true) {
    if (olvidar && this.sesion && this.curId && this.memoria.obtener(this.sesion)?.msgId === this.curId)
      this.memoria.olvidar(this.sesion)
    this.sesion = null
    this.extracto = false
    this.resumen = false
    this.cierre = null
    this.firma = []
    this.playing = false
    this.paused = false
    this.cursorOffset = 0
    this.startOffset = null
    this.toque = null
    this.vozVuelve = false
    this.servidorListo = false
    if (this.sondeoTimer) { clearTimeout(this.sondeoTimer); this.sondeoTimer = null }
    this.paraAudio()
    if (this.synth) this.synth.cancel()
    this.clearHighlight()
    this.soltarDestrabe()
    this.uttSeq++
    if (this.speakTimer) {
      clearTimeout(this.speakTimer)
      this.speakTimer = null
    }
    if (this.chromeTimer) {
      clearInterval(this.chromeTimer)
      this.chromeTimer = null
    }
    this.clearTaps()
    this.detachKeys()
    this.soltarAncla()
    this.dejarDeVigilar()
    this.sigue = true
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onVisibility)
    this.soltarPantalla()
    this.stateCb?.(false)
    this.stateCb = null
    this.container = null
    this.blocks = []
    this.curId = null
    this.puente?.cerrar()
    this.puente = null
    this.indiceEspejo = new Map()
    this.emit()
  }
}

/** Bloques hoja que se leen, en orden. Fuentes del final, tablas y párrafos que solo eran una URL no se oyen ni
 *  cuentan en el total: regla única en lector-filtro.ts. Siguen visibles en pantalla. */
function bloquesLegibles(container: HTMLElement): HTMLElement[] {
  const cands = Array.from(container.querySelectorAll(`${SELECTOR_BLOQUES},span[${MARCA_PROPIO}]`)) as HTMLElement[]
  const set = new Set(cands)
  const hojas = cands.filter((el) => {
    if (!el.innerText.trim()) return false
    for (const d of Array.from(el.querySelectorAll(SELECTOR_BLOQUES)))
      if (set.has(d as HTMLElement)) return false
    return true
  })
  return filtrarBloques(hojas.map(bloqueLector)).map((i) => hojas[i])
}

/** Lo que lector-filtro necesita saber de un bloque pintado (31 oct 2026: listas, enlaces y etiquetas en negrita, para
 *  que una sección de fuentes calle sus entradas y nada más). */
function bloqueLector(el: HTMLElement): BloqueLector {
  const enlaces = Array.from(el.querySelectorAll('a[href]'))
  let sinEnlaces: string | undefined
  if (enlaces.length) {
    sinEnlaces = el.innerText
    for (const a of enlaces) sinEnlaces = sinEnlaces.replace((a as HTMLElement).innerText, ' ')
  }
  return {
    texto: el.innerText,
    enTabla: !!el.closest('table'),
    esEncabezado: /^H[1-6]$/.test(el.tagName),
    enLista: !!el.closest('li'),
    conEnlace: enlaces.length > 0,
    etiqueta: empiezaConEtiqueta(el),
    sinEnlaces,
  }
}

/** ¿El bloque abre con una negrita que termina en dos puntos («Siguiente paso:» o «Ojo» + «:»)? */
function empiezaConEtiqueta(el: HTMLElement): boolean {
  let n: ChildNode | null = el.firstChild
  while (n && n.nodeType === 3 && !(n.textContent || '').trim()) n = n.nextSibling
  if (!n || n.nodeType !== 1 || !/^(STRONG|B)$/.test((n as HTMLElement).tagName)) return false
  const t = (n.textContent || '').trim()
  if (!t || t.length > 60) return false
  return t.endsWith(':') || /^\s*:/.test(n.nextSibling?.textContent || '')
}

/** Palabras del texto hablado, en sus coordenadas. */
function palabrasDe(spoken: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(spoken))) out.push({ from: m.index, to: m.index + m[0].length })
  return out
}

/**
 * Parte un párrafo hablado en tramos para la voz del servidor: frases enteras, cortando al pasar de ~160 caracteres en
 * un fin de frase (o a los 320 en cualquier palabra). Tramos cortos = el primero suena antes y el siguiente se precarga
 * mientras tanto. `desde`/`hasta` son índices de palabra; `texto`, lo que se le pide al servidor (también es la clave
 * de la caché). Exportado para testearlo.
 *
 * EL PRIMER TRAMO VA CORTO (31 oct 2026, Daniel: «la menor latencia posible al momento de play»): el primer fin de frase
 * pasados PRIMER_TRAMO caracteres; si la primera frase es larga, su primera coma pasados PRIMER_TRAMO_COMA; tope
 * PRIMER_TRAMO_MAX. Es lo único que se espera al tocar play: sintetizarlo, mandarlo y decodificarlo crece con su largo.
 * Mientras suena, el resto del párrafo se precarga.
 */
export const PRIMER_TRAMO = 60
const PRIMER_TRAMO_COMA = 100
const PRIMER_TRAMO_MAX = 200
export function tramosDeVoz(spoken: string, words: Array<{ from: number; to: number }>) {
  const out: Array<{ desde: number; hasta: number; texto: string }> = []
  let desde = 0
  for (let i = 0; i < words.length; i++) {
    const largo = words[i].to - words[desde].from
    const palabra = spoken.slice(words[i].from, words[i].to)
    const finDeFrase = /[.!?…:;]["»”’)\]]*$/.test(palabra)
    const primero = out.length === 0
    const corta = primero
      ? (finDeFrase && largo >= PRIMER_TRAMO) || (/,["»”’)\]]*$/.test(palabra) && largo >= PRIMER_TRAMO_COMA) || largo >= PRIMER_TRAMO_MAX
      : (finDeFrase && largo >= 160) || largo >= 320
    if (i === words.length - 1 || corta) {
      out.push({ desde, hasta: i + 1, texto: spoken.slice(words[desde].from, words[i].to).replace(/\s+/g, ' ') })
      desde = i + 1
    }
  }
  return out
}

/** Tramos de un párrafo con un corte en la palabra `w0`: lo de antes y, desde ahí, tramos nuevos (el primero corto).
 *  Mismo contrato que tramosDeVoz (índices de palabra del párrafo entero). Exportado para testearlo. */
export function tramosDesde(spoken: string, words: Array<{ from: number; to: number }>, w0: number) {
  const antes = w0 > 0 ? tramosDeVoz(spoken, words.slice(0, w0)) : []
  const despues = tramosDeVoz(spoken, words.slice(w0)).map((t) => ({ ...t, desde: t.desde + w0, hasta: t.hasta + w0 }))
  return [...antes, ...despues]
}

/** Firma corta de un párrafo: estable entre renders, distinta entre mensajes. */
function firmaDe(el: HTMLElement): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

export const chatSpeech =
  typeof window !== 'undefined' ? new ChatSpeechController() : (null as unknown as ChatSpeechController)

// El arnés WKWebView (scripts/qa/arnes-wkwebview) lee el estado del lector desde aquí. Solo existe bajo el arnés.
if (typeof window !== 'undefined' && (window as unknown as { __arnes?: boolean }).__arnes)
  (window as unknown as { __chatSpeech?: ChatSpeechController }).__chatSpeech = chatSpeech
