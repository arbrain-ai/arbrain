/**
 * QUÉ NO SE OYE (2 oct 2026, pedido de Daniel: «el lector lee las fuentes, las tablas y
 * los enlaces»). Regla ÚNICA para toda voz que lea respuestas del chat:
 *
 *   · FUENTES: el encabezado «Fuentes:», «Sources:», «Fuentes principales», «Referencias»,
 *     «Enlaces»… y SUS ENTRADAS (puntos de lista, enlaces, URLs) no se leen. Desde el 31 oct
 *     (Daniel: «que el lector sea preciso con cada palabra») la lectura VUELVE en el primer bloque
 *     que ya no es una entrada: un párrafo de prosa, un encabezado h1–h6 o una etiqueta en negrita
 *     con dos puntos («**Siguiente paso:** …»), aunque sea un punto de lista. Antes, todo lo que
 *     venía después del encabezado se callaba si no había un h1–h4 real: «**Enlaces:**», su lista
 *     y luego «**Siguiente paso:** …» dejaba el siguiente paso sin oírse.
 *   · TABLAS: se saltan completas (celdas de una <table> o filas «| a | b |» que no llegaron
 *     a pintarse como tabla).
 *   · URLs sueltas: se quitan del texto hablado; un párrafo que solo era una URL desaparece.
 *
 * Lo que no se lee tampoco cuenta en el total («15/24»). La pantalla no cambia.
 *
 * Dos consumidores, mismas reglas:
 *   · `filtrarBloques` — el lector de la barra (chat-speech.ts), que trabaja sobre los
 *     párrafos ya pintados en el DOM.
 *   · `markdownHablable` — la voz de servidor (/api/chat/tts), que recibe markdown crudo.
 *
 * PURO, sin DOM: testeable en node.
 */

/** URL suelta: http(s)://… o www.… (sin cerrar paréntesis/corchetes de markdown). */
export const URL_RE = /(?:https?:\/\/|\bwww\.)[^\s)>\]]+/giu
// Sin /g para preguntar «¿hay una URL?»: un RegExp global guarda lastIndex entre llamadas.
const HAY_URL = new RegExp(URL_RE.source, 'iu')

/** Encabezado de la sección de fuentes. Admite «**Fuentes:**», «## Sources», «Fuentes
 *  principales:», «Fuentes consultadas», «Referencias», «Bibliografía», «Links»… con o sin
 *  dos puntos, pero SOLO si es el bloque entero (o «Fuentes:» seguido de enlaces). */
const FUENTES_RE =
  /^(?:fuentes?|sources?|referencias?|references?|bibliograf[ií]a|enlaces?|links?)(?:\s+(?:principales|consultadas|citadas|usadas|utilizadas|y\s+referencias|y\s+enlaces|de\s+consulta|clave|main|used|cited|consulted))?\s*:?$/iu

function normaliza(t: string): string {
  return t
    .replace(/[*_`#>]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿Este bloque abre la sección de fuentes? `sinEnlaces`: el mismo texto sin el texto de sus enlaces (en el DOM un
 * enlace ya no trae la URL: «Fuentes: Polar, Supabase» con dos <a> también es la línea de fuentes).
 */
export function esEncabezadoFuentes(texto: string, sinEnlaces?: string): boolean {
  const t = normaliza(texto)
  if (FUENTES_RE.test(t)) return true
  // «Fuentes: https://a.com, https://b.com» o «Fuentes: [x](…) · [y](…)» en una sola línea:
  // el prefijo es encabezado y lo que sigue, sin las URLs, queda casi vacío.
  const m = /^([^:]{1,40}):\s*(.+)$/u.exec(t)
  if (m && FUENTES_RE.test(m[1] + ':')) {
    const resto = m[2].replace(URL_RE, '').replace(/[\s,;·|•\-–]+/g, '')
    if (resto.length === 0 || HAY_URL.test(m[2])) return true
    if (sinEnlaces != null) {
      const s = /^[^:]{1,40}:\s*([\s\S]*)$/u.exec(normaliza(sinEnlaces))
      return !!s && !/[\p{L}\p{N}]/u.test(s[1].replace(/\b(?:y|and|e)\b/giu, ''))
    }
  }
  return false
}

/** Etiqueta en negrita con dos puntos al inicio del bloque («**Siguiente paso:** …» o «**Ojo**: …»). En markdown. */
export const ETIQUETA_MD_RE = /^\s*(?:\*\*|__)[^*_\n]{1,60}?(?::\s*(?:\*\*|__)|(?:\*\*|__)\s*:)/u

/** Fila de tabla markdown que no se pintó como tabla («| a | b |» o «|---|---|»). */
export function pareceTabla(texto: string): boolean {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lineas.length) return false
  const fila = (l: string) => /^\|.*\|$/.test(l) || /^:?-{3,}:?(\s*\|\s*:?-{3,}:?)+$/.test(l)
  if (lineas.every(fila)) return true
  // Párrafo plano con las filas pegadas: tres o más barras y un separador ---.
  return (texto.match(/\|/g) || []).length >= 4 && /\|\s*:?-{3,}:?\s*\|/.test(texto)
}

/** Quita las URLs sueltas del texto hablado. */
export function sinUrls(texto: string): string {
  return texto.replace(URL_RE, '')
}

/** Lo que queda para decir de un bloque tras quitar URLs y ruido de puntuación. */
function tieneAlgoQueDecir(texto: string): boolean {
  return /[\p{L}\p{N}]/u.test(sinUrls(texto))
}

export interface BloqueLector {
  texto: string
  /** el bloque vive dentro de una <table> pintada */
  enTabla?: boolean
  /** h1–h6: un encabezado nuevo después de las fuentes reabre la lectura */
  esEncabezado?: boolean
  /** punto de una lista (<li> o «- …»): después de un encabezado de fuentes, es una entrada */
  enLista?: boolean
  /** lleva un enlace (<a href> o [texto](url)): después de un encabezado de fuentes, es una entrada */
  conEnlace?: boolean
  /** abre con una etiqueta en negrita y dos puntos («**Siguiente paso:** …»): es una sección, reabre la lectura */
  etiqueta?: boolean
  /** el texto sin el de sus enlaces (ver esEncabezadoFuentes) */
  sinEnlaces?: string
}

/** ¿Prosa de verdad (una frase hecha y derecha), no una referencia suelta como «Supabase: ventas por mes»? */
function esProsa(texto: string): boolean {
  const t = normaliza(texto)
  return t.length >= 120 || ((t.match(/[\p{L}\p{N}]+/gu) || []).length >= 6 && /[.!?…][»"”’)\]]*$/u.test(t))
}

/**
 * ¿Este bloque es una entrada de la sección de fuentes? Un punto de lista, un enlace, una URL o una referencia corta. La
 * sección termina en un encabezado, una etiqueta en negrita con dos puntos o un párrafo de prosa.
 */
function esEntradaDeFuente(b: BloqueLector): boolean {
  if (b.esEncabezado || b.etiqueta) return false
  return !!b.enLista || !!b.conEnlace || HAY_URL.test(b.texto) || !tieneAlgoQueDecir(b.texto) || !esProsa(b.texto)
}

/**
 * Índices de los bloques que SÍ se leen, en orden. Un encabezado de fuentes calla sus entradas y nada más: la lectura
 * vuelve en el primer bloque que no es entrada (ver la cabecera). Tablas y bloques sin nada que decir, fuera.
 */
export function filtrarBloques(bloques: BloqueLector[]): number[] {
  const out: number[] = []
  let enFuentes = false
  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i]
    if (esEncabezadoFuentes(b.texto, b.sinEnlaces)) { enFuentes = true; continue }
    if (enFuentes) {
      if (esEntradaDeFuente(b)) continue
      enFuentes = false
    }
    if (b.enTabla || pareceTabla(b.texto) || !tieneAlgoQueDecir(b.texto)) continue
    out.push(i)
  }
  return out
}

const ENLACE_MD = /\[([^\]]+)\]\([^)]+\)/g

/** Bloque de markdown crudo → BloqueLector: el enlace conserva su texto y se anota que lo había. */
function bloqueMd(crudo: string, extra: Partial<BloqueLector> = {}): BloqueLector {
  const conEnlace = /\[[^\]]+\]\([^)]+\)/.test(crudo)
  return {
    texto: crudo.replace(ENLACE_MD, '$1'),
    ...(conEnlace ? { conEnlace, sinEnlaces: crudo.replace(ENLACE_MD, '') } : {}),
    ...(ETIQUETA_MD_RE.test(crudo) ? { etiqueta: true } : {}),
    ...extra,
  }
}

/** Separa markdown en bloques (párrafos, ítems, encabezados, tablas) para aplicar la regla. */
export function bloquesDeMarkdown(md: string): BloqueLector[] {
  const sinCodigo = md.replace(/```[\s\S]*?```/g, '\n\ncódigo\n\n')
  const out: BloqueLector[] = []
  let parrafo: string[] = []
  let tabla: string[] = []
  const cierra = () => {
    if (parrafo.length) out.push(bloqueMd(parrafo.join(' ')))
    if (tabla.length) out.push({ texto: tabla.join('\n'), enTabla: true })
    parrafo = []
    tabla = []
  }
  for (const raw of sinCodigo.split('\n')) {
    const l = raw.trim()
    if (!l) { cierra(); continue }
    if (/^\|.*\|$/.test(l)) {
      if (parrafo.length) { out.push(bloqueMd(parrafo.join(' '))); parrafo = [] }
      tabla.push(l)
      continue
    }
    if (tabla.length) cierra()
    if (/^#{1,6}\s/.test(l)) { cierra(); out.push(bloqueMd(l.replace(/^#{1,6}\s+/, ''), { esEncabezado: true })); continue }
    if (/^(?:[-*+]|\d+[.)])\s/.test(l)) { cierra(); out.push(bloqueMd(l.replace(/^(?:[-*+]|\d+[.)])\s+/, ''), { enLista: true })); continue }
    parrafo.push(l)
  }
  cierra()
  return out
}

/**
 * Markdown → markdown que se puede hablar: sin fuentes, sin tablas, sin URLs sueltas.
 * Un enlace `[texto](url)` conserva su texto (es lo que se ve en pantalla).
 */
export function markdownHablable(md: string): string {
  const bloques = bloquesDeMarkdown(md)
  return filtrarBloques(bloques)
    .map((i) => sinUrls(bloques[i].texto).replace(/[ \t]+/g, ' ').trim())
    .join('\n\n')
}
