/**
 * Canvas v4 — EL JUEZ MECANICO. La verdad, no la opinion.
 *
 * Audita un diagrama compilado SIN abrir un navegador, en milisegundos. Corre
 * SIEMPRE antes de gastar un turno de vision: si dos cajas se solapan al 80%,
 * eso no necesita un ojo, necesita un numero.
 *
 * Por que existe: el v3 declaraba la validacion visual OPT-IN ("si no se
 * verifico visualmente, decirlo") y su unico chequeo automatico era un detector
 * de colisiones que vivia en 4 de los 7 generadores. Los otros 3 posteaban a
 * ciegas.
 *
 * Este juez tambien le dice al OJO donde mirar: sus hallazgos son la lista de
 * recortes que el critico visual inspecciona. Asi no se gasta vision escaneando
 * un lienzo entero a ciegas.
 */

import type { CompiledDiagram, CompiledBox, CompiledPart } from '../compile'
import { LEGEND_SIZE } from '../layout/legend'
import type { Measurer } from '../text/types'

export type Severity = 'fail' | 'warn'

export interface Finding {
  metric: string
  severity: Severity
  message: string
  /** Donde mirar. Alimenta los recortes del juez visual. */
  focus?: { x: number; y: number; width: number; height: number }
  nodeIds?: string[]
}

export interface JudgeReport {
  ok: boolean
  findings: Finding[]
  stats: Record<string, number>
}

export interface ThemeColors {
  bg: string
  box: string
  title: string
  body: string
  caption: string
  chip: string
  chipText: string
}

interface Rect { x: number; y: number; width: number; height: number }

const overlapArea = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

const area = (r: Rect) => r.width * r.height

/** Luminancia relativa WCAG. Linealiza sRGB — sin eso el numero es otra cosa. */
function relativeLuminance(hex: string): number {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg), b = relativeLuminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** ¿Un segmento cruza un rectangulo? Slab de Liang-Barsky. */
function segmentIntersectsRect(
  p1: { x: number; y: number }, p2: { x: number; y: number }, r: Rect, inset = 0,
): boolean {
  const minX = r.x + inset, maxX = r.x + r.width - inset
  const minY = r.y + inset, maxY = r.y + r.height - inset
  if (minX >= maxX || minY >= maxY) return false
  let t0 = 0, t1 = 1
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
    return true
  }
  return clip(-dx, p1.x - minX) && clip(dx, maxX - p1.x)
      && clip(-dy, p1.y - minY) && clip(dy, maxY - p1.y)
}

export interface JudgeOptions {
  theme?: ThemeColors
  /**
   * Si se da, se verifica que cada linea DECLARADA quepa en el ancho declarado.
   *
   * Nacio de un bug medido: el compilador decia "434px, 2 lineas" y el renderer
   * pintaba UNA linea de 616px, metiendose 183px debajo de la tarjeta vecina.
   * Ninguna metrica geometrica lo veia, porque el MODELO estaba bien — el
   * renderer era el que no lo respetaba. Esta metrica cierra el hueco entre lo
   * que el compilador promete y lo que se puede pintar.
   */
  measure?: Measurer
  /** Zoom al que se exige legibilidad. 0.4 = "¿se lee de lejos?" */
  legibilityZoom?: number
  /** Solapamiento tolerado, como fraccion del area menor. */
  maxOverlap?: number
}

export function judge(d: CompiledDiagram, options: JudgeOptions = {}): JudgeReport {
  const findings: Finding[] = []
  const maxOverlap = options.maxOverlap ?? 0.15
  const zoom = options.legibilityZoom ?? 0.4

  // 1 · SOLAPAMIENTO de cajas.
  let overlaps = 0
  for (let i = 0; i < d.boxes.length; i++) {
    for (let j = i + 1; j < d.boxes.length; j++) {
      const a = d.boxes[i], b = d.boxes[j]
      const inter = overlapArea(a, b)
      if (inter === 0) continue
      const frac = inter / Math.min(area(a), area(b))
      if (frac > maxOverlap) {
        overlaps++
        findings.push({
          metric: 'solapamiento', severity: 'fail',
          message: `"${a.nodeId}" y "${b.nodeId}" se solapan ${(frac * 100).toFixed(0)}% (vara ${maxOverlap * 100}%)`,
          nodeIds: [a.nodeId, b.nodeId],
          focus: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
                   width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
                   height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) },
        })
      }
    }
  }

  // 1c · LOS PIES contra todo lo demas.
  //
  // Tercer punto ciego de la MISMA forma. El bucle 1 recorre `d.boxes`, y un
  // pie (`caption`) NO es una caja: vive en `d.parts`, colgando POR FUERA de su
  // tarjeta. Dos tarjetas separadas correctamente pueden tener los pies
  // encimados y el juez daria verde.
  //
  // Hoy no dispara, y eso es exactamente lo que se quiere medir: el compositor
  // le entrega a dagre la HUELLA (caja + pie), no la caja. Esta metrica
  // convierte esa invariante arquitectonica en algo MEDIDO — si un cambio
  // futuro le pasara la caja a dagre, aqui se veria en vez de descubrirse en
  // una captura.
  const pies = d.parts.filter(p => p.kind === 'caption')
  for (const pie of pies) {
    const rect = { x: pie.x, y: pie.y, width: pie.width, height: pie.height }
    const contra: Array<{ id: string; x: number; y: number; width: number; height: number }> = [
      ...d.boxes.filter(b => b.nodeId !== pie.nodeId).map(b => ({ id: b.nodeId, ...b })),
      ...pies.filter(o => o.nodeId !== pie.nodeId)
        .map(o => ({ id: `pie de ${o.nodeId}`, x: o.x, y: o.y, width: o.width, height: o.height })),
    ]
    for (const otro of contra) {
      const inter = overlapArea(rect, otro)
      // 4px2 de tolerancia: un roce de subpixel entre dos cajas adyacentes no
      // es un defecto, y un juez que grita por eso se deja de leer.
      if (inter <= 4) continue
      overlaps++
      findings.push({
        metric: 'solapamiento', severity: 'fail',
        message: `el pie de "${pie.nodeId}" se encima sobre ${otro.id} (${inter.toFixed(0)}px2)`,
        nodeIds: [pie.nodeId],
        focus: { x: Math.min(rect.x, otro.x), y: Math.min(rect.y, otro.y),
                 width: Math.max(rect.x + rect.width, otro.x + otro.width) - Math.min(rect.x, otro.x),
                 height: Math.max(rect.y + rect.height, otro.y + otro.height) - Math.min(rect.y, otro.y) },
      })
    }
  }

  // 1b · LA LEYENDA contra el diagrama.
  //
  // Esta metrica nacio de un falso verde: el juez decia 0 fail mientras la
  // leyenda estaba pintada ENCIMA del nodo raiz, porque el bucle de arriba solo
  // compara cajas contra cajas y la leyenda no es una caja. Un elemento que el
  // juez no mide es un elemento que puede romperse en silencio para siempre.
  if (d.legend) {
    const banda = { x: d.legend.x, y: d.legend.y,
                    width: d.legend.width, height: d.legend.height }
    for (const b of d.boxes) {
      const inter = overlapArea(banda, b)
      if (inter === 0) continue
      overlaps++
      findings.push({
        metric: 'solapamiento', severity: 'fail',
        message: `la leyenda se encima sobre "${b.nodeId}" (${inter.toFixed(0)}px2): no tiene banda propia`,
        nodeIds: [b.nodeId],
        focus: { x: Math.min(banda.x, b.x), y: Math.min(banda.y, b.y),
                 width: Math.max(banda.x + banda.width, b.x + b.width) - Math.min(banda.x, b.x),
                 height: Math.max(banda.y + banda.height, b.y + b.height) - Math.min(banda.y, b.y) },
      })
    }
  }

  // 2 · TEXTO que se sale de su caja. Las captions viven fuera A PROPOSITO.
  const boxById = new Map(d.boxes.map(b => [b.nodeId, b]))
  let overflowing = 0
  for (const p of d.parts) {
    if (p.kind === 'caption') continue
    const box = boxById.get(p.nodeId)
    if (!box) continue
    const out = p.x < box.x - 0.5 || p.y < box.y - 0.5
             || p.x + p.width > box.x + box.width + 0.5
             || p.y + p.height > box.y + box.height + 0.5
    if (out) {
      overflowing++
      findings.push({
        metric: 'desborde', severity: 'fail',
        message: `${p.kind} de "${p.nodeId}" se sale de su caja: "${(p.text ?? '').slice(0, 40)}"`,
        nodeIds: [p.nodeId], focus: { x: p.x, y: p.y, width: p.width, height: p.height },
      })
    }
  }

  // 2b · ¿LAS LINEAS DECLARADAS CABEN EN EL ANCHO DECLARADO?
  let lineasLargas = 0
  if (options.measure) {
    for (const p of d.parts) {
      if (!p.style || !p.lines?.length) continue
      for (const linea of p.lines) {
        const w = options.measure(linea, p.style)
        // 1px de margen: el ancho declarado viene de un Math.ceil.
        if (w > p.width + 1) {
          lineasLargas++
          findings.push({
            metric: 'linea-desborda', severity: 'fail',
            message: `una linea del ${p.kind} de "${p.nodeId}" mide ${w.toFixed(0)}px y su caja declara ${p.width.toFixed(0)}px: "${linea.slice(0, 40)}"`,
            nodeIds: [p.nodeId], focus: { x: p.x, y: p.y, width: p.width, height: p.height },
          })
          break
        }
      }
    }
  }

  // 3 · FUERA DEL LIENZO.
  let outside = 0
  const all: Array<Rect & { id: string }> = [
    ...d.boxes.map(b => ({ ...b, id: b.nodeId })),
    ...d.parts.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height, id: p.nodeId })),
  ]
  for (const r of all) {
    if (r.x < -1 || r.y < -1 || r.x + r.width > d.bounds.width + 1 || r.y + r.height > d.bounds.height + 1) {
      outside++
      findings.push({
        metric: 'fuera-de-lienzo', severity: 'fail',
        message: `"${r.id}" se sale del lienzo ${d.bounds.width}×${d.bounds.height}`,
        nodeIds: [r.id], focus: r,
      })
    }
  }

  // 4 · CONTRASTE WCAG. Solo si hay tema: sin colores no hay nada que medir,
  //     y "no medido" JAMAS se reporta como verde.
  let lowContrast = 0
  if (options.theme) {
    const t = options.theme
    const fgFor = (kind: CompiledPart['kind']) =>
      kind === 'title' ? t.title : kind === 'caption' ? t.caption : kind === 'chip' ? t.chipText : t.body
    for (const p of d.parts) {
      if (!p.text || !p.style) continue
      const bg = p.kind === 'caption' ? t.bg : p.kind === 'chip' ? t.chip : t.box
      const ratio = contrastRatio(fgFor(p.kind), bg)
      // "Texto grande" segun WCAG: 24px+, o 19px+ en negrita.
      const large = p.style.size >= 24 || (p.style.weight >= 700 && p.style.size >= 19)
      const min = large ? 3 : 4.5
      if (ratio < min) {
        lowContrast++
        findings.push({
          metric: 'contraste', severity: 'fail',
          message: `${p.kind} de "${p.nodeId}" a ${ratio.toFixed(2)}:1 (minimo ${min}:1) — "${(p.text ?? '').slice(0, 30)}"`,
          nodeIds: [p.nodeId], focus: { x: p.x, y: p.y, width: p.width, height: p.height },
        })
      }
    }
  }

  // 5 · CONECTORES que atraviesan cajas que no son su origen ni su destino.
  let crossings = 0
  for (const e of d.edges) {
    for (let i = 0; i + 1 < e.points.length; i++) {
      for (const box of d.boxes) {
        if (box.nodeId === e.from || box.nodeId === e.to) continue
        if (segmentIntersectsRect(e.points[i], e.points[i + 1], box, 4)) {
          crossings++
          findings.push({
            metric: 'cruce', severity: 'fail',
            message: `la arista ${e.from}→${e.to} atraviesa "${box.nodeId}"`,
            nodeIds: [e.from, e.to, box.nodeId], focus: box,
          })
          break
        }
      }
    }
  }

  // 5b · CONECTORES que pasan por encima de TEXTO.
  //
  // Punto ciego que encontro el ojo, no el numero: la metrica 5 solo miraba
  // CAJAS, pero las descripciones viven FUERA de su caja a proposito, asi que
  // una flecha les puede pasar por encima sin tocar ninguna caja. Se veia mal y
  // el juez decia verde.
  //
  // Es texto, no estructura: se reporta como warn. Pero se reporta.
  //
  // La exclusion es FINA a proposito. Excluir todas las partes del nodo origen
  // y destino seria un punto ciego: la ruta sale legitimamente de DENTRO de esa
  // caja, pero la caption vive FUERA y debajo — pasarle por encima si es un
  // defecto, aunque sea del propio nodo del que sale la flecha.
  let textCrossings = 0
  for (const e of d.edges) {
    for (let i = 0; i + 1 < e.points.length; i++) {
      for (const p of d.parts) {
        if (!p.text) continue
        const suCaja = boxById.get(p.nodeId)
        const dentroDeSuCaja = suCaja != null
          && p.x >= suCaja.x - 0.5 && p.y >= suCaja.y - 0.5
          && p.x + p.width <= suCaja.x + suCaja.width + 0.5
          && p.y + p.height <= suCaja.y + suCaja.height + 0.5
        if (dentroDeSuCaja && (p.nodeId === e.from || p.nodeId === e.to)) continue
        // Margen negativo: rozar el borde de una linea de texto no molesta,
        // atravesarla si. Se mide contra el cuerpo real de la letra.
        const body = { x: p.x + 2, y: p.y + 2, width: p.width - 4, height: p.height - 4 }
        if (body.width <= 0 || body.height <= 0) continue
        if (segmentIntersectsRect(e.points[i], e.points[i + 1], body)) {
          textCrossings++
          findings.push({
            metric: 'cruce-texto', severity: 'warn',
            message: `la arista ${e.from}→${e.to} pasa por encima del ${p.kind} de "${p.nodeId}": "${(p.text ?? '').slice(0, 32)}"`,
            nodeIds: [e.from, e.to, p.nodeId],
            focus: { x: p.x, y: p.y, width: p.width, height: p.height },
          })
          break
        }
      }
    }
  }

  // 6 · DENSIDAD. Diagnostico, no veredicto: alimenta el gap del juez visual.
  const occupied = d.boxes.reduce((s, b) => s + area(b), 0)
  const canvas = d.bounds.width * d.bounds.height
  const density = canvas > 0 ? occupied / canvas : 0
  if (density < 0.10) {
    findings.push({ metric: 'densidad', severity: 'warn',
      message: `densidad ${(density * 100).toFixed(1)}% — el contenido se pierde en el vacio (banda sana 18-45%)` })
  } else if (density > 0.60) {
    findings.push({ metric: 'densidad', severity: 'warn',
      message: `densidad ${(density * 100).toFixed(1)}% — apretado (banda sana 18-45%)` })
  }

  // 7 · HUERFANOS: integridad referencial.
  let orphans = 0
  const ids = new Set(d.boxes.map(b => b.nodeId))
  for (const e of d.edges) {
    for (const end of [e.from, e.to]) {
      if (!ids.has(end)) {
        orphans++
        findings.push({ metric: 'huerfano', severity: 'fail',
          message: `la arista ${e.from}→${e.to} apunta a "${end}", que no existe` })
      }
    }
  }
  for (const p of d.parts) {
    if (!ids.has(p.nodeId)) {
      orphans++
      findings.push({ metric: 'huerfano', severity: 'fail',
        message: `la parte ${p.kind} pertenece a "${p.nodeId}", que no existe` })
    }
  }

  // 7b · ISLAS Y RAICES. La otra mitad de "huerfanos", que estaba documentada y
  // NO implementada: la metrica solo verificaba integridad referencial (aristas
  // que apuntan a nodos inexistentes) y se llamaba a si misma "+ islas".
  //
  // La cazo un critico ciego antes que el juez: "'La maquina en frio' no tiene
  // ninguna flecha de entrada — su lugar en la jerarquia se infiere solo por su
  // posicion espacial, asi que el lector tiene que adivinar".
  //
  // Dos cosas distintas:
  //   - ISLA: un nodo sin NINGUNA arista en un diagrama que si tiene aristas.
  //     No participa de la estructura; esta ahi de adorno. Es fail.
  //   - RAIZ DE MAS: varios nodos sin arista de entrada. Un diagrama de flujo
  //     tiene UN punto de partida; con tres, el ojo no sabe por donde empezar.
  //     Es warn, porque hay diagramas legitimamente multi-raiz.
  if (d.edges.length > 0) {
    const conAlguna = new Set<string>()
    const conEntrada = new Set<string>()
    for (const e of d.edges) {
      conAlguna.add(e.from); conAlguna.add(e.to)
      conEntrada.add(e.to)
    }
    for (const b of d.boxes) {
      if (!conAlguna.has(b.nodeId)) {
        orphans++
        findings.push({ metric: 'huerfano', severity: 'fail',
          message: `"${b.nodeId}" es una isla: ningun conector lo toca`,
          nodeIds: [b.nodeId],
          focus: { x: b.x, y: b.y, width: b.width, height: b.height } })
      }
    }
    const raices = d.boxes.filter(b => conAlguna.has(b.nodeId) && !conEntrada.has(b.nodeId))
    if (raices.length > 1) {
      findings.push({ metric: 'huerfano', severity: 'warn',
        message: `${raices.length} nodos sin flecha de entrada (${raices.map(r => `"${r.nodeId}"`).join(', ')}) — el lector no sabe por donde empezar y tiene que inferir la jerarquia de la posicion`,
        nodeIds: raices.map(r => r.nodeId) })
    }
  }

  // 8 · PISO DE LEGIBILIDAD. Dos varas, a proposito:
  //   - TEXTO ESTRUCTURAL (titulo, item, caption): tiene que leerse al 40%,
  //     que es el QA del estandar (§18, nacido de "de lejos no veo nada").
  //   - METADATOS (chips): el mismo estandar los quiere a ~10.5-11px muted.
  //     Son detalle de cerca; exigirles el piso de lejos seria contradecir la
  //     regla que los creo. Se les mide al 100%.
  let tiny = 0
  for (const p of d.parts) {
    if (!p.style || !p.text) continue
    const esMetadato = p.kind === 'chip'
    const zoomEfectivo = esMetadato ? 1 : zoom
    const onScreen = p.style.size * zoomEfectivo
    if (onScreen < 6) {
      tiny++
      findings.push({ metric: 'legibilidad', severity: 'fail',
        message: `${p.kind} de "${p.nodeId}" mide ${onScreen.toFixed(1)}px al ${zoomEfectivo * 100}% (minimo 6px)`,
        nodeIds: [p.nodeId], focus: { x: p.x, y: p.y, width: p.width, height: p.height } })
    } else if (onScreen < 8) {
      tiny++
      findings.push({ metric: 'legibilidad', severity: 'warn',
        message: `${p.kind} de "${p.nodeId}" mide ${onScreen.toFixed(1)}px al ${zoomEfectivo * 100}% (comodo desde 8px)`,
        nodeIds: [p.nodeId] })
    }
  }

  // 8a · EL TITULO se mide como texto ESTRUCTURAL: es lo primero que el lector
  // busca y tiene que sobrevivir al zoom alejado. Y se comprueba que no se
  // encime con ninguna caja — comparte la banda de arriba con la leyenda, y una
  // cabecera que se monta sobre el diagrama es el mismo defecto que ya costo
  // una ronda.
  if (d.title) {
    const px = d.title.style.size * zoom
    if (px < 6) {
      tiny++
      findings.push({ metric: 'legibilidad', severity: 'fail',
        message: `el titulo mide ${px.toFixed(1)}px al ${zoom * 100}% (minimo 6px)`,
        nodeIds: ['titulo'] })
    }
    const banda = { x: d.title.x, y: d.title.y, width: d.title.width, height: d.title.height }
    for (const b of d.boxes) {
      if (overlapArea(banda, b) === 0) continue
      overlaps++
      findings.push({ metric: 'solapamiento', severity: 'fail',
        message: `el titulo se encima sobre "${b.nodeId}": la cabecera invade el diagrama`,
        nodeIds: [b.nodeId] })
    }
    if (d.legend && overlapArea(banda, { x: d.legend.x, y: d.legend.y,
        width: d.legend.width, height: d.legend.height }) > 0) {
      overlaps++
      findings.push({ metric: 'solapamiento', severity: 'fail',
        message: 'el titulo y la leyenda se enciman en la banda de cabecera' })
    }
  }

  // 8b · LA LEYENDA tambien se mide.
  //
  // El bucle de arriba recorre `d.parts`, y la leyenda no vive ahi: vive en
  // `d.legend`. Consecuencia — a 40% la leyenda salia como una mancha gris y el
  // juez decia 0 fail. Segundo punto ciego del mismo tipo que el solapamiento:
  // lo que el sensor no recorre, no existe para el.
  //
  // Se clasifica como METADATO, y el argumento importa mas que el veredicto: el
  // diccionario se lee UNA vez, de cerca, para aprender el codigo; de lejos el
  // lector ya no usa las palabras, usa el codigo visual (punteado morado =
  // agente, rojo = riesgo, pildora = disparador), y ese SI esta garantizado por
  // la vara de roles, que exige dos canales de separacion. Exigirle a la
  // leyenda el piso de lejos obligaria a un texto de 20px que la volveria mas
  // grande que los nodos que explica.
  if (d.legend) {
    for (const item of d.legend.items) {
      const px = LEGEND_SIZE   // metadato: se mide al 100%
      if (px < 6) {
        tiny++
        findings.push({ metric: 'legibilidad', severity: 'fail',
          message: `leyenda "${item.label}" mide ${px.toFixed(1)}px de cerca (minimo 6px)`,
          nodeIds: [`leyenda:${item.role}`],
          focus: { x: d.legend.x + item.text.x, y: d.legend.y + item.text.y,
                   width: item.text.width, height: item.text.height } })
      }
    }
  }

  // Los problemas que el propio compilador reporto entran al juicio: si el
  // compilador dijo que un texto no cupo, eso ES un hallazgo.
  for (const issue of d.issues) {
    findings.push({
      metric: issue.kind === 'overflow' ? 'desborde'
            : issue.kind === 'routing' || issue.kind === 'routing-tight' ? 'ruteo'
            : 'cobertura',
      // Solo son FAIL los que dejan el diagrama roto. Una cobertura que el
      // navegador resuelve con otra fuente, o una ruta que cupo con menos
      // holgura, son informacion para el ojo — no defectos.
      severity: issue.kind === 'coverage' || issue.kind === 'routing-tight' ? 'warn' : 'fail',
      message: `${issue.nodeId}: ${issue.detail}`, nodeIds: [issue.nodeId],
    })
  }

  return {
    ok: findings.every(f => f.severity !== 'fail'),
    findings,
    stats: {
      nodos: d.boxes.length, aristas: d.edges.length, partes: d.parts.length,
      solapamientos: overlaps, desbordes: overflowing, fuera: outside,
      contrasteBajo: lowContrast, cruces: crossings, crucesTexto: textCrossings,
      lineasLargas, huerfanos: orphans,
      textoChico: tiny, densidadPct: Math.round(density * 1000) / 10,
    },
  }
}
