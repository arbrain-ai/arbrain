/**
 * CSV y TSV del visor de documentos (14 nov 2026). Sin librería: RFC 4180 (comillas, comillas dobles escapadas, saltos de
 * línea dentro de un campo, CRLF/LF/CR), separador adivinado (coma, punto y coma, tabulador o barra) y codificación
 * adivinada (BOM, UTF-8 estricto y, si no cuadra, Windows-1252: los CSV que exporta Excel en español).
 * Puro: lo prueba tests/visor/tabla-csv.test.ts.
 */

/** Bytes → texto. Un CSV de Excel en español suele venir en Windows-1252; uno de una app web, en UTF-8 con o sin BOM. */
export function decodificar(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return new TextDecoder('windows-1252').decode(bytes) }
}

const CANDIDATOS = [',', ';', '\t', '|']

/** El separador que deja el mismo número de campos (más de uno) en más líneas de la muestra. */
export function detectarSeparador(texto: string, pista?: string): string {
  if (pista && CANDIDATOS.includes(pista)) return pista
  const muestra = texto.slice(0, 64 * 1024)
  let mejor = ',', puntaje = -1
  for (const sep of CANDIDATOS) {
    const filas = parsearCsv(muestra, sep, 40)
    const completas = filas.length > 1 ? filas.slice(0, -1) : filas // la última puede venir cortada por la muestra
    const cuentas = new Map<number, number>()
    for (const f of completas) if (f.length > 1) cuentas.set(f.length, (cuentas.get(f.length) ?? 0) + 1)
    let moda = 0, veces = 0
    for (const [n, k] of cuentas) if (k > veces || (k === veces && n > moda)) { moda = n; veces = k }
    if (!moda) continue
    const p = veces / Math.max(1, completas.length) * 100 + Math.min(moda, 40)
    if (p > puntaje) { puntaje = p; mejor = sep }
  }
  return mejor
}

/** Texto → filas de campos. `max` corta tras esas filas (para la muestra del separador). Sin filas vacías. */
export function parsearCsv(texto: string, sep = ',', max = Infinity): string[][] {
  const filas: string[][] = []
  const n = texto.length
  if (!n) return filas
  const s = sep.charCodeAt(0)
  let fila: string[] = []
  let i = 0
  const cerrar = () => { if (fila.length > 1 || fila[0] !== '') filas.push(fila); fila = [] }
  for (;;) {
    let valor: string
    if (i < n && texto.charCodeAt(i) === 34) {
      // Campo entre comillas: puede traer separadores, saltos de línea y "" (una comilla).
      let partes = ''
      i++
      for (;;) {
        const j = texto.indexOf('"', i)
        if (j < 0) { partes += texto.slice(i); i = n; break }
        partes += texto.slice(i, j)
        if (texto.charCodeAt(j + 1) === 34) { partes += '"'; i = j + 2 } else { i = j + 1; break }
      }
      let k = i
      while (k < n) { const c = texto.charCodeAt(k); if (c === s || c === 10 || c === 13) break; k++ }
      valor = partes + texto.slice(i, k)
      i = k
    } else {
      let k = i
      while (k < n) { const c = texto.charCodeAt(k); if (c === s || c === 10 || c === 13) break; k++ }
      valor = texto.slice(i, k)
      i = k
    }
    fila.push(valor)
    if (i >= n) { cerrar(); break }
    const c = texto.charCodeAt(i)
    if (c === s) { i++; continue }
    i += c === 13 && texto.charCodeAt(i + 1) === 10 ? 2 : 1
    cerrar()
    if (i >= n || filas.length >= max) break
  }
  return filas
}

/** Bytes de un .csv o .tsv → filas, con su separador. */
export function leerCsv(bytes: Uint8Array, nombre = ''): { filas: string[][]; separador: string } {
  const texto = decodificar(bytes)
  const separador = detectarSeparador(texto, /\.tsv$/i.test(nombre) ? '\t' : undefined)
  return { filas: parsearCsv(texto, separador), separador }
}
