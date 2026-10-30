/**
 * Canvas v4 — puente compilador → elementos del documento.
 *
 * Aqui es donde la capa SEMANTICA se materializa en la capa GEOMETRICA. Cada
 * elemento que sale de aqui lleva su `origin`: sabe de que region y de que nodo
 * del spec viene, y por eso una recompilacion puede ACTUALIZARLO en vez de
 * destruirlo y recrearlo.
 *
 * Esa llave es lo que permite el diff: sin `nodeId`, recompilar seria "borra
 * todo y vuelve a poner", que es exactamente lo que hacian los generadores del
 * v3 (wipe + rebuild en lotes de 80 ops) y por eso cada iteracion tiraba
 * cualquier ajuste hecho a mano.
 */

import type { CompiledDiagram } from '../compile'
import type { CanvasElement, ShapeElement, ConnectorElement, BoundText, Origin } from './element'
import { bounds } from './element'
import type { Role } from '../theme/tokens'
import { LEGEND_SIZE } from '../layout/legend'

const ROLE_MAP: Record<string, Role> = {
  card: 'card', module: 'module', form: 'form', callout: 'callout',
  deliverable: 'deliverable', trigger: 'trigger', risk: 'risk', agent: 'agent',
}

export function elementsFromCompiled(
  d: CompiledDiagram, regionId: string, now = 0,
): CanvasElement[] {
  const out: CanvasElement[] = []
  const partsByNode = new Map<string, BoundText[]>()

  for (const p of d.parts) {
    if (!p.text || !p.style) continue
    const box = d.boxes.find(b => b.nodeId === p.nodeId)
    if (!box) continue
    const list = partsByNode.get(p.nodeId) ?? []
    // Relativas a SU caja: si el humano mueve la caja, el texto viaja con ella.
    // Guardar absolutas obligaria a reposicionar cada parte en cada arrastre.
    list.push({
      kind: p.kind === 'title' ? 'title' : p.kind === 'caption' ? 'caption' : p.kind === 'chip' ? 'chip' : 'item',
      text: p.text, lines: p.lines ?? [p.text],
      x: p.x - box.x, y: p.y - box.y,
      width: p.width, height: p.height, style: p.style,
    })
    partsByNode.set(p.nodeId, list)
  }

  let z = 0
  for (const box of d.boxes) {
    const origin: Origin = { regionId, nodeId: box.nodeId }
    const shape: ShapeElement = {
      id: `${regionId}:${box.nodeId}`, type: 'shape', shape: 'rect',
      role: ROLE_MAP[box.role] ?? 'card',
      x: box.x, y: box.y, width: box.width, height: box.height,
      rotation: 0, zIndex: z++, opacity: 1, locked: false,
      origin, version: 1, createdAt: now, updatedAt: now,
      text: partsByNode.get(box.nodeId) ?? [],
    }
    out.push(shape)
  }

  for (const e of d.edges) {
    if (e.points.length < 2) continue
    const conn: ConnectorElement = {
      id: `${regionId}:${e.from}->${e.to}`, type: 'connector',
      fromId: `${regionId}:${e.from}`, toId: `${regionId}:${e.to}`,
      points: e.points, arrowEnd: true, kind: e.kind,
      x: 0, y: 0, width: 0, height: 0, rotation: 0,
      // Los conectores van DEBAJO de las cajas: una flecha que pasa por encima
      // de una tarjeta se lee como error aunque geometricamente sea correcta.
      zIndex: -1, opacity: 1, locked: false,
      origin: { regionId, nodeId: `${e.from}->${e.to}` },
      version: 1, createdAt: now, updatedAt: now,
    }
    out.push(conn)
  }

  // El titular entra como elemento de verdad: se puede mover, editar y exportar
  // como todo lo demas, y al llevar `origin` una recompilacion lo ACTUALIZA en
  // vez de duplicarlo.
  if (d.title) {
    out.push({
      id: `${regionId}:titulo`, type: 'text',
      text: d.title.text, lines: d.title.lines,
      x: d.title.x, y: d.title.y, width: d.title.width, height: d.title.height,
      rotation: 0, zIndex: z++, opacity: 1, locked: false,
      origin: { regionId, nodeId: 'titulo' },
      version: 1, createdAt: now, updatedAt: now,
      style: d.title.style, align: 'left',
    })
  }

  // La leyenda entra como elementos de verdad, no como adorno pintado aparte:
  // asi vive en el documento, se puede mover, ocultar o exportar como todo lo
  // demas. Y lleva `origin`, asi que una recompilacion la actualiza en vez de
  // duplicarla.
  if (d.legend) {
    for (const item of d.legend.items) {
      const clave = item.clase === 'arista' ? `arista:${item.edgeKind}` : item.role
      if (item.clase === 'arista') {
        // Como CONECTOR y no como caja pintada aparte: si la muestra de la
        // leyenda se dibujara con su propio codigo, podria dejar de parecerse a
        // la arista que explica sin que nadie se entere.
        const y = d.legend.y + item.swatch.y + item.swatch.height / 2
        out.push({
          id: `${regionId}:leyenda:${clave}`, type: 'connector',
          fromId: '', toId: '', arrowEnd: false, kind: item.edgeKind,
          points: [
            { x: d.legend.x + item.swatch.x, y },
            { x: d.legend.x + item.swatch.x + item.swatch.width, y },
          ],
          x: 0, y: 0, width: 0, height: 0, rotation: 0,
          zIndex: z++, opacity: 1, locked: false,
          origin: { regionId, nodeId: `leyenda:${clave}` },
          version: 1, createdAt: now, updatedAt: now,
        })
      } else out.push({
        id: `${regionId}:leyenda:${clave}`, type: 'shape', shape: 'rect',
        role: item.role,
        x: d.legend.x + item.swatch.x, y: d.legend.y + item.swatch.y,
        width: item.swatch.width, height: item.swatch.height,
        rotation: 0, zIndex: z++, opacity: 1, locked: false,
        origin: { regionId, nodeId: `leyenda:${item.role}` },
        version: 1, createdAt: now, updatedAt: now,
        text: [],
      })
      out.push({
        id: `${regionId}:leyenda-txt:${clave}`, type: 'text',
        text: item.label, lines: [item.label],
        x: d.legend.x + item.text.x, y: d.legend.y + item.text.y + 3,
        width: item.text.width, height: item.text.height,
        rotation: 0, zIndex: z++, opacity: 1, locked: false,
        origin: { regionId, nodeId: `leyenda-txt:${clave}` },
        version: 1, createdAt: now, updatedAt: now,
        style: { family: 'montserrat', weight: 600, size: LEGEND_SIZE }, align: 'left',
      })
    }
  }

  return out
}

/**
 * Reconcilia una recompilacion contra lo que ya hay.
 *
 * Reglas, en orden:
 *   0. Lo BLOQUEADO gana al spec: ni se actualiza ni se borra, y se DECLARA.
 *   1. Lo FIJADO por la mano nunca se toca.
 *   2. Lo compilado que sigue existiendo se ACTUALIZA (misma identidad).
 *   3. Lo compilado que ya no esta en el spec se borra.
 *   4. Lo LIBRE (sin origin) ni se mira: no es de esta region.
 */
export function reconcile(
  existing: CanvasElement[], next: CanvasElement[], regionId: string,
): {
  elements: CanvasElement[]; added: number; updated: number; removed: number; keptPinned: number
  /**
   * Elementos FIJADOS cuyo nodo ya no existe en el spec.
   *
   * No se borran — la mano los toco y borrarlos seria tirar trabajo humano —
   * pero tampoco pueden actualizarse nunca mas: quedaron sueltos del modelo.
   * Se REPORTAN para que alguien decida, en vez de acumularse en silencio.
   */
  orphanedPins: string[]
  /**
   * Elementos BLOQUEADOS que el compilador queria actualizar y no toco.
   *
   * El candado es de Daniel, no del sistema: si puso uno, el compilador se
   * detiene aunque el spec diga otra cosa. Pero detenerse en SILENCIO seria
   * peor que ignorarlo — el agente creeria que actualizo un diagrama que en
   * realidad quedo a medias. Se devuelven para poder avisar: *"esto tiene
   * candado, ¿seguro?"*.
   */
  bloqueados: string[]
} {
  const nextById = new Map(next.map(e => [e.id, e]))
  const out: CanvasElement[] = []
  let updated = 0, removed = 0, keptPinned = 0
  const orphanedPins: string[] = []
  const bloqueados: string[] = []

  for (const el of existing) {
    if (el.origin?.regionId !== regionId) { out.push(el); continue }  // regla 4
    // REGLA 0 — EL CANDADO GANA AL SPEC.
    //
    // Va antes que todo: si Daniel puso un candado, el compilador se detiene
    // aunque el spec diga otra cosa, y ni siquiera lo borra. Pero detenerse en
    // SILENCIO seria peor que ignorarlo — quien pidio la recompilacion creeria
    // que el diagrama quedo entero cuando quedo a medias.
    if (el.locked) {
      out.push(el)
      if (nextById.has(el.id)) bloqueados.push(el.id)
      nextById.delete(el.id)
      continue
    }
    if (el.origin.pinned) {
      out.push(el)
      keptPinned++
      // Si el compilador ya no lo menciona, quedo huerfano: se conserva pero se
      // declara. Un pin sin nodo detras no se puede volver a actualizar jamas.
      if (!nextById.has(el.id)) orphanedPins.push(el.id)
      nextById.delete(el.id)
      continue
    }  // regla 1
    const fresh = nextById.get(el.id)
    if (!fresh) { removed++; continue }  // regla 3
    out.push({ ...fresh, version: el.version + 1, createdAt: el.createdAt })  // regla 2
    updated++
    nextById.delete(el.id)
  }

  const added = nextById.size
  for (const el of nextById.values()) out.push(el)
  return { elements: out, added, updated, removed, keptPinned, orphanedPins, bloqueados }
}

/**
 * DONDE se materializa una region compilada.
 *
 * El compilador emite coordenadas LOCALES: su nodo raiz nace cerca de (0,0).
 * Si esas coordenadas se usan tal cual, el diagrama se pinta sobre lo que la
 * mano ya tenia ahi. Se midio: recompilar sobre una pizarra de 18 elementos
 * dibujados a mano dejo 39 elementos encimados, con el diagrama tapando los
 * trazos. La tesis de las dos capas no sobrevive a que una entierre a la otra.
 *
 * Dos casos, y el segundo es el que importa:
 *
 * 1. La region YA esta en el lienzo → su origen se DEDUCE comparando un
 *    elemento existente con el entrante del mismo id. Asi el diagrama no salta
 *    de lugar cada vez que se recompila, aunque el layout interno cambie.
 * 2. Es la primera vez → se busca hueco a la derecha de todo lo demas. A la
 *    derecha y no abajo porque el lienzo se lee en horizontal y porque el
 *    encuadre inicial ya reparte el ancho.
 *
 * Se ignoran los FIJADOS al deducir: son justo los que la mano pudo mover, y
 * medir el origen contra un elemento arrastrado devolveria un origen falso.
 */
export function origenDeRegion(
  existentes: CanvasElement[], entrantes: CanvasElement[], regionId: string,
): { x: number; y: number } {
  const porId = new Map(entrantes.map(e => [e.id, e]))
  const fijados: Array<{ x: number; y: number }> = []
  for (const e of existentes) {
    if (e.origin?.regionId !== regionId) continue
    const nuevo = porId.get(e.id)
    if (!nuevo) continue
    const delta = { x: e.x - nuevo.x, y: e.y - nuevo.y }
    if (!e.origin.pinned) return delta   // uno libre basta: a ese nadie lo movio
    fijados.push(delta)
  }
  // Si la mano FIJO todos los elementos de la region no queda ninguno limpio del
  // cual deducir. Caer al caso "primera vez" seria lo peor posible: el diagrama
  // entero se mudaria a otro lado del lienzo. Se usa la MEDIANA de los
  // desplazamientos, que resiste que unos cuantos hayan sido arrastrados lejos
  // — un promedio no lo resiste.
  if (fijados.length > 0) {
    const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    return { x: med(fijados.map(d => d.x)), y: med(fijados.map(d => d.y)) }
  }

  const ajenos = existentes.filter(e => e.origin?.regionId !== regionId)
  if (ajenos.length === 0) return { x: 0, y: 0 }

  const CANALON = 160
  let maxX = -Infinity, minY = Infinity
  for (const e of ajenos) {
    const b = bounds(e)
    if (b.x + b.width > maxX) maxX = b.x + b.width
    if (b.y < minY) minY = b.y
  }
  return { x: maxX + CANALON, y: minY }
}

/** Traslada una region compilada a su origen en el mundo. */
export function trasladar(els: CanvasElement[], d: { x: number; y: number }): CanvasElement[] {
  if (d.x === 0 && d.y === 0) return els
  return els.map(e => e.type === 'connector'
    ? { ...e, points: e.points.map(p => ({ x: p.x + d.x, y: p.y + d.y })) }
    : { ...e, x: e.x + d.x, y: e.y + d.y })
}
