/**
 * Textos con piezas de React adentro (13 nov 2026): el orden de las palabras cambia entre idiomas, así que el enlace o
 * la negrita van como marcador dentro de UNA frase traducible, nunca partiendo la frase en pedazos.
 *
 *   trNodos('Escribe {comando} para fijar una meta', { comando: <code>/goal</code> })
 *   → en inglés: 'Type {comando} to set a goal' con el <code> en su lugar.
 *
 * Las variables de texto (números, nombres) también entran aquí como string.
 */
import { Fragment, type ReactNode } from 'react'
import { tr } from './tr'

export function trNodos(texto: string, piezas: Record<string, ReactNode>): ReactNode {
  const traducido = tr(texto)
  const partes = traducido.split(/(\{\w+\})/g)
  if (partes.length === 1) return traducido
  return partes.map((p, i) => {
    const m = /^\{(\w+)\}$/.exec(p)
    if (m && m[1] in piezas) return <Fragment key={i}>{piezas[m[1]]}</Fragment>
    return p ? <Fragment key={i}>{p}</Fragment> : null
  })
}
