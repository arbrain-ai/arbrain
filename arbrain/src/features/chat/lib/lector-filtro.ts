/**
 * QUÉ NO SE OYE (2 oct 2026, pedido de Daniel: «el lector lee las fuentes, las tablas y
 * los enlaces»). Regla ÚNICA para toda voz que lea respuestas del chat:
 *
 *   · FUENTES: desde el encabezado «Fuentes:», «Sources:», «Fuentes principales»,
 *     «Referencias»… hasta el final, nada se lee. La lectura se detiene ANTES del encabezado.
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

/** ¿Este bloque abre la sección de fuentes? */
export function esEncabezadoFuentes(texto: string): boolean {
  const t = normaliza(texto)
  if (FUENTES_RE.test(t)) return true
  // «Fuentes: https://a.com, https://b.com» o «Fuentes: [x](…) · [y](…)» en una sola línea:
  // el prefijo es encabezado y lo que sigue, sin las URLs, queda casi vacío.
  const m = /^([^:]{1,40}):\s*(.+)$/u.exec(t)
  if (m && FUENTES_RE.test(m[1] + ':')) {
    const resto = m[2].replace(URL_RE, '').replace(/[\s,;·|•\-–]+/g, '')
    return resto.length === 0 || HAY_URL.test(m[2])
  }
  return false
}

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
  /** h1–h4: un encabezado nuevo después de las fuentes reabre la lectura */
  esEncabezado?: boolean
}

/**
 * Índices de los bloques que SÍ se leen, en orden. La sección de fuentes se corta en su
 * ÚLTIMA aparición que no vaya seguida de otro encabezado normal (las fuentes van al final;
 * un «Fuentes:» a media respuesta seguido de más secciones no corta el resto).
 */
export function filtrarBloques(bloques: BloqueLector[]): number[] {
  let corte = bloques.length
  for (let i = bloques.length - 1; i >= 0; i--) {
    const b = bloques[i]
    if (esEncabezadoFuentes(b.texto)) {
      corte = i
      continue
    }
    else if (b.esEncabezado) break
  }
  const out: number[] = []
  for (let i = 0; i < corte; i++) {
    const b = bloques[i]
    if (b.enTabla || pareceTabla(b.texto) || !tieneAlgoQueDecir(b.texto)) continue
    out.push(i)
  }
  return out
}

/** Separa markdown en bloques (párrafos, ítems, encabezados, tablas) para aplicar la regla. */
export function bloquesDeMarkdown(md: string): BloqueLector[] {
  const sinCodigo = md.replace(/```[\s\S]*?```/g, '\n\ncódigo\n\n')
  const out: BloqueLector[] = []
  let parrafo: string[] = []
  let tabla: string[] = []
  const cierra = () => {
    if (parrafo.length) out.push({ texto: parrafo.join(' ') })
    if (tabla.length) out.push({ texto: tabla.join('\n'), enTabla: true })
    parrafo = []
    tabla = []
  }
  for (const raw of sinCodigo.split('\n')) {
    const l = raw.trim()
    if (!l) { cierra(); continue }
    if (/^\|.*\|$/.test(l)) {
      if (parrafo.length) { out.push({ texto: parrafo.join(' ') }); parrafo = [] }
      tabla.push(l)
      continue
    }
    if (tabla.length) cierra()
    if (/^#{1,6}\s/.test(l)) { cierra(); out.push({ texto: l.replace(/^#{1,6}\s+/, ''), esEncabezado: true }); continue }
    if (/^(?:[-*+]|\d+[.)])\s/.test(l)) { cierra(); out.push({ texto: l.replace(/^(?:[-*+]|\d+[.)])\s+/, '') }); continue }
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
  const bloques = bloquesDeMarkdown(md.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
  return filtrarBloques(bloques)
    .map((i) => sinUrls(bloques[i].texto).replace(/[ \t]+/g, ' ').trim())
    .join('\n\n')
}
