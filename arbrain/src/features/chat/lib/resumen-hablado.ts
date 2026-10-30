/**
 * «ESCUCHAR RESUMEN» (29 oct 2026, pedido de la cohorte: «que hable un resumen»). Una respuesta larga leída
 * completa se vuelve eterna al oído: tablas, listas de doce puntos y bloques de código no se escuchan, se miran.
 *
 * El resumen es DETERMINISTA y local: cero llamadas a un modelo, cero red, cero latencia. Se eligen bloques
 * que YA están en pantalla (así el resaltado de la voz sigue funcionando igual que en «Escuchar») y se cierra
 * con una frase que avisa que hay más:
 *
 *   · Se leen en orden los párrafos de prosa hasta el tope (~70 s de voz a velocidad 1).
 *   · Código y tablas no se leen nunca (las tablas y las fuentes ya las quita lector-filtro.ts).
 *   · Listas cortas (hasta 4 puntos) se leen como prosa; de una lista larga, solo sus 2 primeros puntos.
 *   · Los encabezados se leen como guía, solo si algo de su sección entró al resumen.
 *   · Al llegar al tope se detiene (no salta a párrafos posteriores: el resumen es «el principio», coherente).
 *   · Si quedó algo fuera, se agrega «El resto está en pantalla.»
 *
 * La opción solo aparece en respuestas largas (más de UMBRAL_PALABRAS legibles) y si el resumen de verdad
 * es más corto (menos del 70 % de lo legible). La misma regla decide con el markdown (para mostrar el botón)
 * y con el DOM pintado (para leer): `elegirResumen` es la única fuente.
 *
 * PURO, sin DOM: testeable en node.
 */
import { filtrarBloques, pareceTabla, sinUrls, type BloqueLector } from './lector-filtro'

/** ~170 palabras por minuto en español a velocidad 1: 190 palabras ≈ 70 s. */
export const TOPE_PALABRAS = 190
/** Menos que esto (~1.6 min) se escucha completo sin problema: no se ofrece resumen. */
export const UMBRAL_PALABRAS = 280
/** Lista con más puntos que esto es «larga»: solo entran sus primeros PUNTOS_DE_LISTA_LARGA. */
export const LISTA_CORTA = 4
export const PUNTOS_DE_LISTA_LARGA = 2
export const CIERRE_RESUMEN = 'El resto está en pantalla.'

export interface BloqueResumen extends BloqueLector {
  /** vive dentro de un bloque de código (<pre> o ```) */
  enCodigo?: boolean
  /** id de la lista a la que pertenece (mismo número = misma lista); ausente si no es punto de lista */
  lista?: number
}

export interface Resumen {
  /** índices (sobre los bloques recibidos) que se leen, en orden */
  indices: number[]
  palabras: number
  totalPalabras: number
  /** frase final; null si el resumen cubre todo lo legible (no pasa cuando se ofrece) */
  cierre: string | null
}

export function contarPalabras(texto: string): number {
  return (sinUrls(texto).match(/[\p{L}\p{N}][\p{L}\p{N}'’.,-]*/gu) || []).length
}

const legible = (b: BloqueResumen) => !b.enCodigo && !b.enTabla && !pareceTabla(b.texto) && contarPalabras(b.texto) > 0

/**
 * El resumen hablado de una respuesta, o `null` si no vale la pena (respuesta corta o que no se acorta).
 * Recibe los bloques en orden de pantalla; los que no se leen (código, tablas) pueden venir y se saltan.
 */
export function elegirResumen(bloques: BloqueResumen[], tope = TOPE_PALABRAS, umbral = UMBRAL_PALABRAS): Resumen | null {
  const candidatos = bloques.map((b, i) => ({ b, i, n: contarPalabras(b.texto) })).filter(({ b }) => legible(b))
  const totalPalabras = candidatos.reduce((s, c) => s + c.n, 0)
  if (totalPalabras <= umbral) return null

  const tamLista = new Map<number, number>()
  for (const { b } of candidatos) if (b.lista != null) tamLista.set(b.lista, (tamLista.get(b.lista) ?? 0) + 1)
  const vistosDeLista = new Map<number, number>()

  const elegidos: Array<{ i: number; n: number; encabezado: boolean }> = []
  let palabras = 0
  for (const { b, i, n } of candidatos) {
    if (b.lista != null) {
      const visto = (vistosDeLista.get(b.lista) ?? 0) + 1
      vistosDeLista.set(b.lista, visto)
      if ((tamLista.get(b.lista) ?? 0) > LISTA_CORTA && visto > PUNTOS_DE_LISTA_LARGA) continue
    }
    const contenido = elegidos.some((e) => !e.encabezado)
    if (palabras + n > tope && contenido) break
    elegidos.push({ i, n, encabezado: !!b.esEncabezado })
    palabras += n
  }
  // Un encabezado sin nada de su sección detrás (al final, o seguido de otro encabezado) no guía nada.
  const finales = elegidos.filter((e, k) => !e.encabezado || (elegidos[k + 1] && !elegidos[k + 1].encabezado))
  const dichas = finales.reduce((s, e) => s + e.n, 0)
  if (!finales.length || dichas >= totalPalabras * 0.7) return null
  return {
    indices: finales.map((e) => e.i),
    palabras: dichas,
    totalPalabras,
    cierre: finales.length < candidatos.length ? CIERRE_RESUMEN : null,
  }
}

/**
 * Markdown → bloques con la información que necesita el resumen (código, listas). Sirve para decidir si se
 * muestra «Escuchar resumen» sin tocar el DOM. Aplica también la regla de lector-filtro (fuentes, tablas, URLs).
 */
export function bloquesResumenDeMarkdown(md: string): BloqueResumen[] {
  const out: BloqueResumen[] = []
  let parrafo: string[] = []
  let tabla: string[] = []
  let codigo: string[] | null = null
  let lista: number | null = null
  let listas = 0
  let blancoTrasLista = false
  const cierra = () => {
    if (parrafo.length) out.push({ texto: parrafo.join(' ') })
    if (tabla.length) out.push({ texto: tabla.join('\n'), enTabla: true })
    parrafo = []
    tabla = []
  }
  for (const raw of md.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').split('\n')) {
    const l = raw.trim()
    if (/^(```|~~~)/.test(l)) {
      if (codigo) { out.push({ texto: codigo.join('\n') || 'código', enCodigo: true }); codigo = null }
      else { cierra(); lista = null; codigo = [] }
      continue
    }
    if (codigo) { codigo.push(raw); continue }
    if (!l) { cierra(); if (lista != null) blancoTrasLista = true; continue }
    if (/^\|.*\|$/.test(l)) { if (parrafo.length) { out.push({ texto: parrafo.join(' ') }); parrafo = [] } lista = null; tabla.push(l); continue }
    if (tabla.length) cierra()
    if (/^#{1,6}\s/.test(l)) { cierra(); lista = null; out.push({ texto: l.replace(/^#{1,6}\s+/, ''), esEncabezado: true }); continue }
    const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l)
    if (item) {
      cierra()
      if (lista == null) lista = ++listas
      blancoTrasLista = false
      out.push({ texto: item[1], lista })
      continue
    }
    // Texto que sigue a un punto sin línea en blanco: continuación de ese punto.
    if (lista != null && !blancoTrasLista && !parrafo.length && out.length && out[out.length - 1].lista === lista) {
      out[out.length - 1].texto += ' ' + l
      continue
    }
    if (/^\s{2,}/.test(raw) && lista != null) continue // sub-contenido indentado de un punto: no rompe la lista
    lista = null
    blancoTrasLista = false
    parrafo.push(l)
  }
  if (codigo) out.push({ texto: codigo.join('\n') || 'código', enCodigo: true })
  cierra()
  const leibles = new Set(filtrarBloques(out))
  // Lo que filtrarBloques descarta (fuentes, tablas, URLs sueltas) sale; el código se queda marcado (no se lee igual).
  return out.filter((b, i) => b.enCodigo || leibles.has(i))
}

/** ¿Se muestra «Escuchar resumen» para esta respuesta? */
export function ofreceResumen(md: string): boolean {
  if (!md || md.length < UMBRAL_PALABRAS * 4) return false // atajo barato: menos caracteres no llegan al umbral
  return elegirResumen(bloquesResumenDeMarkdown(md)) != null
}
