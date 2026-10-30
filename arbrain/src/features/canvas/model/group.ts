/**
 * Canvas v4 — agrupar.
 *
 * Un grupo NO es un elemento: es una etiqueta compartida (`groupId`) en sus
 * miembros. Ver la nota en `element.ts` sobre por que.
 *
 * Consecuencia practica y buena: no hay que pintar nada nuevo, no hay que
 * hit-testear nada nuevo, y borrar un miembro no deja un contenedor huerfano
 * apuntando a un id que ya no existe.
 */

import { bounds, type CanvasElement } from './element'

let n = 0
const nuevoId = () => `g-${Date.now().toString(36)}-${(n++).toString(36)}`

/** Todos los ids que se seleccionan al tocar UNO. Sube al grupo si lo hay. */
export function expandirSeleccion(elements: CanvasElement[], ids: Set<string>, abierto?: string | null): Set<string> {
  const grupos = new Set<string>()
  // `abierto` = el grupo al que se entro con doble clic: sus miembros se eligen sueltos, sin subir al grupo.
  for (const el of elements) if (ids.has(el.id) && el.groupId && el.groupId !== abierto) grupos.add(el.groupId)
  if (grupos.size === 0) return ids
  const out = new Set(ids)
  for (const el of elements) if (el.groupId && grupos.has(el.groupId)) out.add(el.id)
  return out
}

/** ¿La seleccion actual es exactamente uno o mas grupos completos? */
export function esGrupo(elements: CanvasElement[], ids: Set<string>): boolean {
  const sel = elements.filter(e => ids.has(e.id))
  return sel.length > 1 && sel.every(e => e.groupId != null)
    && new Set(sel.map(e => e.groupId)).size >= 1
}

/**
 * Agrupa la seleccion. Devuelve null si no hay nada que agrupar.
 *
 * Un elemento que ya estaba en otro grupo se MUDA al nuevo. Anidar grupos suena
 * potente y en la practica produce arboles que nadie puede deshacer sin un
 * panel de capas — y este lienzo no lo tiene.
 */
export function agrupar(elements: CanvasElement[], ids: Set<string>): CanvasElement[] | null {
  if (ids.size < 2) return null
  const g = nuevoId()
  const ahora = Date.now()
  return elements.map(el => ids.has(el.id) ? { ...el, groupId: g, updatedAt: ahora } : el)
}

/** Desagrupa. Devuelve null si nada de lo seleccionado estaba agrupado. */
export function desagrupar(elements: CanvasElement[], ids: Set<string>): CanvasElement[] | null {
  const grupos = new Set(elements.filter(e => ids.has(e.id) && e.groupId).map(e => e.groupId))
  if (grupos.size === 0) return null
  const ahora = Date.now()
  return elements.map(el => {
    if (!el.groupId || !grupos.has(el.groupId)) return el
    const { groupId: _, ...resto } = el
    return { ...resto, updatedAt: ahora } as CanvasElement
  })
}

/** Todos los elementos de la MISMA region compilada que uno dado. */
export function regionDe(elements: CanvasElement[], id: string): Set<string> {
  const el = elements.find(e => e.id === id)
  const region = el?.origin?.regionId
  if (!region) return new Set([id])
  return new Set(elements.filter(e => e.origin?.regionId === region).map(e => e.id))
}

export interface GrupoSeleccionado {
  id: string
  ids: string[]
  caja: { x: number; y: number; width: number; height: number }
}

/**
 * Los grupos cuyos miembros estan TODOS seleccionados (y que no estan abiertos): se pintan como UN solo recuadro
 * punteado con su etiqueta, en vez de un contorno por miembro.
 */
export function gruposCompletos(elements: CanvasElement[], ids: Set<string>, abierto?: string | null): GrupoSeleccionado[] {
  const porGrupo = new Map<string, CanvasElement[]>()
  for (const el of elements) if (el.groupId) {
    const l = porGrupo.get(el.groupId)
    l ? l.push(el) : porGrupo.set(el.groupId, [el])
  }
  const out: GrupoSeleccionado[] = []
  for (const [id, miembros] of porGrupo) {
    if (id === abierto || miembros.length < 2 || !miembros.every(m => ids.has(m.id))) continue
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const m of miembros) {
      const b = bounds(m)
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height)
    }
    out.push({ id, ids: miembros.map(m => m.id), caja: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  }
  return out
}

/** ¿Hay algun elemento agrupado en la seleccion? (la barra enseña «Desagrupar») */
export function haySeleccionAgrupada(elements: CanvasElement[], ids: Set<string>): boolean {
  return elements.some(e => ids.has(e.id) && e.groupId)
}

/** El grupo al que pertenece un elemento, o null. */
export function grupoDe(elements: CanvasElement[], id: string): string | null {
  return elements.find(e => e.id === id)?.groupId ?? null
}

/** Esc estando DENTRO de un grupo: vuelve a seleccionar el grupo entero. Null si no hay grupo abierto. */
export function miembrosDeGrupo(elements: CanvasElement[], groupId: string): Set<string> {
  return new Set(elements.filter(e => e.groupId === groupId).map(e => e.id))
}
