/**
 * Canvas v4 — resaltado de codigo para el widget.
 *
 * Tokenizador propio y pequeño, no `highlight.js`.
 *
 * Razon: el canvas 2D no renderiza HTML, asi que la salida de una libreria de
 * resaltado (que produce marcado) habria que parsearla de vuelta a tokens para
 * poder pintarlos con fillText. Se pagaria el peso de la libreria para tirar su
 * formato de salida. Lo que el canvas necesita es una lista de (texto, tipo), y
 * eso son ~60 lineas.
 *
 * El v3 declaraba `insertCode` con resaltado en su contrato y pintaba texto
 * monocromo: la capacidad estaba prometida y no existia.
 */

export type TokenKind = 'texto' | 'palabra' | 'cadena' | 'numero' | 'comentario' | 'funcion' | 'puntuacion'

export interface Token { texto: string; kind: TokenKind }

const PALABRAS: Record<string, string[]> = {
  ts: ['const','let','var','function','return','if','else','for','while','import','export','from','type','interface','class','extends','new','async','await','try','catch','throw','null','undefined','true','false','this'],
  js: ['const','let','var','function','return','if','else','for','while','import','export','from','class','extends','new','async','await','try','catch','throw','null','undefined','true','false','this'],
  py: ['def','return','if','elif','else','for','while','import','from','class','try','except','raise','None','True','False','with','as','lambda','yield'],
  sh: ['if','then','else','fi','for','do','done','while','case','esac','function','return','export','local','echo'],
  json: ['true','false','null'],
}

/**
 * Tokeniza una linea. Es deliberadamente simple: reconoce cadenas,
 * comentarios, numeros, palabras reservadas y llamadas a funcion. No entiende
 * gramatica, y no le hace falta — el objetivo es que el ojo distinga las partes,
 * no validar el codigo.
 */
export function tokenizar(linea: string, lenguaje = 'ts'): Token[] {
  const palabras = PALABRAS[lenguaje] ?? PALABRAS.ts
  const out: Token[] = []
  let i = 0

  const comentario = linea.indexOf(lenguaje === 'py' || lenguaje === 'sh' ? '#' : '//')
  const hastaComentario = comentario >= 0 ? comentario : linea.length

  while (i < hastaComentario) {
    const c = linea[i]

    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < hastaComentario && linea[j] !== c) { if (linea[j] === '\\') j++; j++ }
      out.push({ texto: linea.slice(i, Math.min(j + 1, hastaComentario)), kind: 'cadena' })
      i = j + 1
      continue
    }

    if (/[0-9]/.test(c)) {
      let j = i
      while (j < hastaComentario && /[0-9._a-fx]/i.test(linea[j])) j++
      out.push({ texto: linea.slice(i, j), kind: 'numero' })
      i = j
      continue
    }

    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < hastaComentario && /[A-Za-z0-9_$]/.test(linea[j])) j++
      const palabra = linea.slice(i, j)
      // Si le sigue un parentesis, es una llamada: distinguirlas ayuda mas a
      // leer que colorear cada identificador.
      const esLlamada = linea[j] === '('
      out.push({
        texto: palabra,
        kind: palabras.includes(palabra) ? 'palabra' : esLlamada ? 'funcion' : 'texto',
      })
      i = j
      continue
    }

    if (/[{}()[\];:,.<>=+\-*/&|!?]/.test(c)) {
      out.push({ texto: c, kind: 'puntuacion' })
      i++
      continue
    }

    out.push({ texto: c, kind: 'texto' })
    i++
  }

  if (comentario >= 0) out.push({ texto: linea.slice(comentario), kind: 'comentario' })
  return out
}

/** Paleta por tipo de token. Dos juegos, uno por tema. */
export const COLORES: Record<'claro' | 'oscuro', Record<TokenKind, string>> = {
  claro: {
    texto: '#24292f', palabra: '#cf222e', cadena: '#0a7c42', numero: '#0550ae',
    comentario: '#6e7781', funcion: '#8250df', puntuacion: '#57606a',
  },
  oscuro: {
    texto: '#e6edf3', palabra: '#ff7b72', cadena: '#7ee787', numero: '#79c0ff',
    comentario: '#8b949e', funcion: '#d2a8ff', puntuacion: '#a8b3c0',
  },
}
