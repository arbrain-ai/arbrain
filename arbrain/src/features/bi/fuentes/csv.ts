/**
 * Business Intelligence · lector de CSV (8 nov 2026). Lo que exporta un punto de venta, una hoja de cálculo o un CRM: con
 * comas (Estados Unidos), punto y coma (el Excel en español) o tabuladores; comillas con comas y saltos de línea adentro;
 * BOM al principio; líneas vacías al final. El separador se adivina con la primera línea si el archivo no lo dice.
 * Puro (sin fs): recibe el texto.
 */

export interface TablaCsv { columnas: string[]; filas: (string | null)[][] }

/** El separador que más aparece fuera de comillas en la primera línea con contenido. */
export function adivinarSeparador(texto: string): ',' | ';' | '\t' {
  const linea = texto.replace(/^﻿/, '').split(/\r?\n/).find(l => l.trim()) ?? ''
  const cuenta = { ',': 0, ';': 0, '\t': 0 }
  let dentro = false
  for (const ch of linea) {
    if (ch === '"') dentro = !dentro
    else if (!dentro && ch in cuenta) cuenta[ch as keyof typeof cuenta]++
  }
  const [mejor] = (Object.entries(cuenta) as [',' | ';' | '\t', number][]).sort((a, b) => b[1] - a[1])
  return mejor[1] > 0 ? mejor[0] : ','
}

/** RFC 4180 con tolerancia: la primera fila es el encabezado; celdas vacías → null; filas cortas se rellenan. */
export function parsearCsv(texto: string, separador?: ',' | ';' | '\t'): TablaCsv {
  const t = texto.replace(/^﻿/, '')
  const sep = separador ?? adivinarSeparador(t)
  const filas: string[][] = []
  let fila: string[] = [], celda = '', dentro = false, i = 0
  const cerrarCelda = () => { fila.push(celda); celda = '' }
  const cerrarFila = () => { cerrarCelda(); if (fila.length > 1 || fila[0].trim()) filas.push(fila); fila = [] }
  while (i < t.length) {
    const ch = t[i]
    if (dentro) {
      if (ch === '"') {
        if (t[i + 1] === '"') { celda += '"'; i += 2; continue }
        dentro = false; i++; continue
      }
      celda += ch; i++; continue
    }
    if (ch === '"' && !celda.trim()) { dentro = true; celda = ''; i++; continue }
    if (ch === sep) { cerrarCelda(); i++; continue }
    if (ch === '\r' && t[i + 1] === '\n') { cerrarFila(); i += 2; continue }
    if (ch === '\n' || ch === '\r') { cerrarFila(); i++; continue }
    celda += ch; i++
  }
  if (celda || fila.length) cerrarFila()
  if (!filas.length) return { columnas: [], filas: [] }
  const columnas = filas[0].map((c, k) => c.trim() || `columna ${k + 1}`)
  const ancho = Math.max(columnas.length, ...filas.slice(1).map(f => f.length))
  while (columnas.length < ancho) columnas.push(`columna ${columnas.length + 1}`)
  return {
    columnas,
    filas: filas.slice(1).map(f => Array.from({ length: ancho }, (_, k) => { const v = f[k]; return v === undefined || v.trim() === '' ? null : v.trim() })),
  }
}
