/**
 * Canvas v4 — EL COMPILADOR. Semantica declarada -> geometria correcta.
 *
 * Esto es lo que el agente llama. Recibe QUE hay (nodos con su rol y su
 * contenido, aristas entre ellos) y devuelve DONDE va cada cosa, habiendo
 * medido el texto de verdad.
 *
 * El agente no calcula una sola coordenada. Nunca.
 *
 * Orden del pipeline, y cada paso depende del anterior:
 *   1. COMPONER cada nodo   -> cuanto mide y donde cae cada parte (flexbox + medicion real)
 *   2. DISTRIBUIR el grafo  -> donde va cada nodo (dagre, alimentado con la HUELLA)
 *   3. TRASLADAR            -> partes relativas a coordenadas de mundo
 *   4. AUDITAR              -> desbordes y glifos sin cobertura, reportados NUNCA tragados
 *
 * El paso 4 no es opcional ni "modo estricto". Un compilador que devuelve
 * geometria rota en silencio es peor que uno que falla: el v3 devolvia
 * `ok: true` mientras dibujaba cajas vacias y texto recortado.
 */

import { composeNode, DEFAULT_TOKENS, initLayout, type ComposeTokens, type NodeContent, type ComposedPart } from './layout/compose'
import { arrange, type ArrangeEdge, type ArrangeOptions, type RoutedEdge } from './layout/arrange'
import { composeLegend, LEGEND_SIZE, type Legend } from './layout/legend'
import type { EdgeKind } from './theme/tokens'
import { routeOrthogonal, pegarALosBordes, type Obstacle, type Point } from './layout/route'
import type { MeasureContext, TextStyle } from './text/types'
import { wrapText } from './text/layout'

export interface DiagramNode extends NodeContent {
  id: string
}

export interface DiagramEdge {
  from: string
  to: string
  label?: string
  /** Que clase de relacion es. Por defecto `flujo`. Ver EdgeKind. */
  kind?: EdgeKind
}

/** Lo que el agente declara. Cero coordenadas, cero tamaños, cero colores. */
export interface DiagramSpec {
  nodes: DiagramNode[]
  edges?: DiagramEdge[]
  layout?: ArrangeOptions
  title?: string
}

/** Una parte de texto o caja ya en coordenadas de mundo. */
export interface CompiledPart extends ComposedPart {
  nodeId: string
}

export interface CompiledBox {
  nodeId: string
  role: string
  x: number; y: number; width: number; height: number
}

export interface CompileIssue {
  kind: 'overflow' | 'coverage' | 'routing' | 'routing-tight'
  nodeId: string
  detail: string
}

export interface CompiledDiagram {
  boxes: CompiledBox[]
  parts: CompiledPart[]
  edges: RoutedEdge[]
  bounds: { width: number; height: number }
  /**
   * El diccionario de la codificacion visual, derivado de los roles presentes.
   * null cuando no hay nada que explicar.
   */
  legend: (Legend & { x: number; y: number }) | null
  /**
   * El titular del diagrama. Dice DE QUE habla el mapa; sin el, el lector tiene
   * que deducirlo leyendo los nodos. Estructural, no metadato.
   */
  title: {
    text: string; lines: string[]; style: TextStyle
    x: number; y: number; width: number; height: number
  } | null
  /** Problemas encontrados. Vacio = el diagrama es geometricamente sano. */
  issues: CompileIssue[]
}

export interface CompileOptions {
  /**
   * Proporcion de la superficie donde se va a ver (ancho/alto). Si se da, el
   * compilador PRUEBA las direcciones de layout y elige la que produce un
   * diagrama de proporcion mas parecida.
   *
   * Por que: un grafo de 6 nodos en horizontal sale 2507x639 — casi 4:1 —
   * contra una pantalla de 1.5:1. Encuadrar eso deja media pantalla vacia por
   * GEOMETRIA, no por descuido, y un critico ciego lo leyo como "un
   * work-in-progress abandonado en una esquina del canvas infinito".
   *
   * Es trabajo del compilador, no del ojo de quien mira: nadie deberia tener
   * que adivinar que su diagrama se veria mejor en vertical.
   */
  targetAspect?: number
  tokens?: ComposeTokens
  /** Estilo de las etiquetas de arista. */
  edgeLabelStyle?: TextStyle
  /** Se le pasa para detectar glifos que la fuente no puede pintar. */
  coverageCheck?: (text: string, node: DiagramNode) => string[]
}

export async function compileDiagram(
  ctx: MeasureContext, spec: DiagramSpec, options: CompileOptions = {},
): Promise<CompiledDiagram> {
  await initLayout()
  const tokens = options.tokens ?? DEFAULT_TOKENS
  const issues: CompileIssue[] = []

  // 1 · COMPONER — cada nodo decide su tamaño midiendo su propio texto.
  const composed = spec.nodes.map(node => {
    const c = composeNode(ctx, node, tokens)
    if (c.overflows) {
      issues.push({ kind: 'overflow', nodeId: node.id,
        detail: 'una palabra no cupo entera y hubo que partirla' })
    }
    if (options.coverageCheck) {
      const texts = [node.title, node.caption, ...(node.items ?? []), ...(node.chips ?? []).map(ch => ch.text)]
      for (const t of texts) {
        if (!t) continue
        const missing = options.coverageCheck(t, node)
        if (missing.length > 0) {
          issues.push({ kind: 'coverage', nodeId: node.id,
            detail: `la fuente no tiene ${missing.map(g => '"' + g + '"').join(' ')} — el navegador usara otra y la medida no aplica` })
        }
      }
    }
    return { node, composed: c }
  })

  // 2 · DISTRIBUIR — dagre recibe la HUELLA, no la caja. Ver arrange.ts.
  const edgeStyle = options.edgeLabelStyle ?? tokens.fontChip
  const arrangeEdges: ArrangeEdge[] = (spec.edges ?? []).map(e => ({
    from: e.from, to: e.to,
    label: e.label
      ? { width: Math.ceil(ctx.measure(e.label, edgeStyle)) + 12,
          height: Math.ceil(ctx.vertical(edgeStyle).naturalLineHeight) + 8 }
      : undefined,
  }))

  const arrangeNodes = composed.map(({ node, composed: c }) =>
    ({ id: node.id, width: c.footprint.width, height: c.footprint.height }))

  let layout = arrange(arrangeNodes, arrangeEdges, spec.layout)

  // Si se declaro una proporcion objetivo Y el spec no fijo una direccion a
  // mano, se prueban las dos y gana la mas parecida. Solo dos: BT y RL son las
  // mismas de TB y LR con el flujo invertido, y un diagrama que corre hacia
  // arriba o hacia la izquierda se lee peor sin ganar nada de proporcion.
  if (options.targetAspect && !spec.layout?.direction) {
    const candidatas: Array<'LR' | 'TB'> = ['LR', 'TB']
    let mejor = layout
    let mejorError = Infinity
    for (const direction of candidatas) {
      const l = arrange(arrangeNodes, arrangeEdges, { ...spec.layout, direction })
      if (l.bounds.height <= 0) continue
      const aspect = l.bounds.width / l.bounds.height
      // Error en escala logaritmica: 4:1 y 1:4 estan igual de lejos de 1.5:1,
      // y en lineal el ancho domina y siempre ganaria el horizontal.
      const error = Math.abs(Math.log(aspect / options.targetAspect))
      if (error < mejorError) { mejorError = error; mejor = l }
    }
    layout = mejor
  }
  const placedById = new Map(layout.nodes.map(n => [n.id, n]))

  // 3 · TRASLADAR — de coordenadas relativas del componente a mundo.
  const boxes: CompiledBox[] = []
  const parts: CompiledPart[] = []
  for (const { node, composed: c } of composed) {
    const placed = placedById.get(node.id)
    if (!placed) continue
    boxes.push({ nodeId: node.id, role: node.role,
      x: placed.x, y: placed.y, width: c.box.width, height: c.box.height })
    for (const p of c.parts) {
      parts.push({ ...p, nodeId: node.id, x: placed.x + p.x, y: placed.y + p.y })
    }
  }

  // 4 · RE-RUTEAR solo lo que hace falta.
  //
  // dagre resuelve DONDE va cada nodo, pero sus rutas ignoran los obstaculos:
  // con layout apretado, una arista pasa por encima de una caja ajena. El A*
  // ortogonal es caro comparado con no hacer nada, asi que se paga UNICAMENTE
  // en las aristas que de verdad cruzan algo — el resto conserva la curva suave
  // de dagre, que se ve mejor.
  // Cuanto cuelga el pie por debajo de cada tarjeta. Lo sabe el compositor y
  // nadie mas, asi que se lo pasa al router en vez de que este lo adivine.
  const pieDe = new Map<string, number>()
  for (const p of parts) {
    if (p.kind !== 'caption') continue
    const caja = boxes.find(b => b.nodeId === p.nodeId)
    if (!caja) continue
    pieDe.set(p.nodeId, Math.max(pieDe.get(p.nodeId) ?? 0, p.y + p.height - (caja.y + caja.height)))
  }
  const obstacles: Obstacle[] = boxes.map(b => ({
    id: b.nodeId, x: b.x, y: b.y, width: b.width, height: b.height,
    pieAlto: Math.max(0, pieDe.get(b.nodeId) ?? 0),
  }))

  /**
   * LOS PIES TAMBIEN SON OBSTACULOS.
   *
   * Un pie es texto visible colgando fuera de su tarjeta. El router solo
   * esquivaba rectangulos de tarjeta, asi que trazaba felizmente por encima de
   * un pie ajeno — y el juez lo reportaba despues como `cruce-texto`, que es
   * declarar el defecto en vez de evitarlo.
   *
   * Se les da el id de SU nodo: asi una arista que sale de "a" no se esquiva a
   * si misma al pasar junto a su propio pie, que es justo lo que la exencion
   * por origen y destino existe para permitir.
   */
  const obstaculosConPies: Obstacle[] = [
    ...obstacles,
    ...parts.filter(p => p.kind === 'caption')
      .map(p => ({ id: p.nodeId, x: p.x, y: p.y, width: p.width, height: p.height })),
  ]
  const obstacleById = new Map(obstacles.map(o => [o.id, o]))
  // La clase declarada en el spec viaja con la arista ruteada. dagre no la
  // conoce ni tiene por que: es semantica, no geometria.
  const claseDe = new Map((spec.edges ?? []).map(e => [`${e.from}->${e.to}`, e.kind]))
  const conClase = (e: RoutedEdge): RoutedEdge =>
    ({ ...e, kind: claseDe.get(`${e.from}->${e.to}`) })

  const edges: RoutedEdge[] = layout.edges.map(e0 => {
    const e = conClase(e0)
    if (!crossesAny(e.points, obstaculosConPies, e.from, e.to)) {
      // Aunque la ruta de dagre no cruce nada, sus extremos caen en el centro
      // del nodo y quedan ENTERRADOS bajo la tarjeta. Se recortan al borde para
      // que la flecha nazca y muera en un puerto visible.
      const from = obstacleById.get(e.from), to = obstacleById.get(e.to)
      if (!from || !to || e.points.length < 2) return e
      return { ...e, points: pegarALosBordes(clipToBorders(e.points, from, to), from, to) }
    }
    const from = obstacleById.get(e.from), to = obstacleById.get(e.to)
    if (!from || !to) return e
    // Holgura degradada: si no cabe con el margen comodo, se prueba con menos.
    // Un pasillo estrecho es mejor que atravesar una caja. Si NINGUNO cabe, el
    // problema no es del router: es que el layout no dejo corredores.
    for (const clearance of [14, 8, 4]) {
      const rerouted = routeOrthogonal(from, to, obstaculosConPies, { clearance })
      if (rerouted) {
        if (clearance < 14) {
          // Adaptarse a un layout apretado NO es un defecto: es la respuesta
          // correcta. Se informa para que el ojo lo mire, no se reprueba.
          issues.push({ kind: 'routing-tight', nodeId: `${e.from}→${e.to}`,
            detail: `ruteada con holgura de ${clearance}px en vez de 14 — el layout va apretado` })
        }
        return { ...e, points: pegarALosBordes(rerouted, from, to) }
      }
    }
    // Se conserva la ruta de dagre y se DECLARA con el diagnostico real. Jamas
    // se devuelve una ruta que atraviesa algo fingiendo que esta bien.
    issues.push({ kind: 'routing', nodeId: `${e.from}→${e.to}`,
      detail: 'sin corredor libre ni con holgura minima: el layout no deja pasillos entre las cajas (sube nodeSep o rankSep)' })
    return e
  })

  // 5 · LA LEYENDA. El gap que declaro el critico ciego y que el estandar
  // visual §3 ya exigia: sin diccionario, un borde rojo es una adivinanza.
  const legendStyle = { ...tokens.fontChip, weight: 600, size: LEGEND_SIZE }
  const legendBase = composeLegend(ctx, spec.nodes.map(n => n.role as never), legendStyle,
    edges.map(e => e.kind))

  // 5b · EL TITULO. `spec.title` llevaba declarado en el contrato desde el
  // principio y NADIE lo leia — la tercera capacidad-fantasma que aparece hoy,
  // y la regla del plan es explicita: o se construye de verdad, o no existe en
  // el contrato.
  //
  // Lo nombro el critico ciego como lo unico que el referente hacia mejor:
  // "su encabezado es un titular editorial que dice de que trata el mapa,
  // contra el de B que es puro metadato de herramienta y no anuncia el tema".
  // Tenia razon: un diagrama sin titulo obliga a deducir de que habla leyendo
  // sus nodos.
  //
  // Es texto ESTRUCTURAL, no metadato: a 34px se lee a 13.6px con el lienzo al
  // 40%, que es justo la vara de "se lee de lejos".
  /**
   * EL TITULAR VA EN SLAB, no en la sans del cuerpo.
   *
   * Gap que declaro el critico ciego: perdio el eje de tipografia contra el
   * referente porque este usaba UNA sola familia para todo — titular, titulos
   * de tarjeta, cuerpo y pies. Textual: *"el maridaje serif-display (titulo) +
   * sans-serif (cuerpo) tiene mas oficio editorial que la tipografia plana y
   * uniforme"*.
   *
   * El emparejamiento no es decorativo: separa de un vistazo el nivel EDITORIAL
   * (de que habla este mapa) del nivel de CONTENIDO (que dice cada caja). Con
   * una sola familia, el titular solo se distingue por ser mas grande, y a
   * tamaño reducido esa diferencia se evapora.
   *
   * Roboto Slab ya esta self-hosted y medido por fontkit igual que Montserrat,
   * asi que esto no abre ninguna puerta a divergencia de medicion.
   */
  const tituloStyle: TextStyle = { family: 'roboto-slab', weight: 900, size: 34 }
  const titulo = spec.title
    ? (() => {
        const laid = wrapText(ctx, spec.title!, tituloStyle, { maxWidth: 900 })
        return { text: spec.title!, lines: laid.lines.map(l => l.text),
                 style: tituloStyle, width: laid.width, height: laid.height }
      })()
    : null

  // El titulo y la leyenda comparten la banda de arriba — titulo a la
  // izquierda, diccionario a la derecha — SALVO que juntos no quepan a lo
  // ancho del diagrama. En ese caso se apilan, porque encimarlos seria repetir
  // exactamente el defecto que la banda existe para impedir.
  const anchoDiagrama = Math.max(layout.bounds.width, legendBase?.width ?? 0)
  const GAP_BANDA = 48
  const cabenJuntos = titulo != null && legendBase != null
    && titulo.width + GAP_BANDA + legendBase.width <= anchoDiagrama

  // La leyenda vive en su PROPIA BANDA arriba, y el diagrama baja para dejarsela.
  //
  // La primera version la metia dentro de los limites del diagrama —
  // `x: bounds.width - legend.width - 48, y: 20` — y confiaba en que la esquina
  // superior derecha estuviera libre. Eso no es colocar, es apostar: en cuanto el
  // diagrama se estrecho, la leyenda quedo ENCIMA del nodo raiz. Y el juez no lo
  // vio, porque su metrica de solapamiento solo compara cajas entre si.
  //
  // Reservar la banda lo vuelve imposible por construccion en vez de por suerte.
  const altoCabecera = cabenJuntos
    ? Math.max(titulo!.height, legendBase!.height)
    : (titulo?.height ?? 0) + (titulo && legendBase ? 18 : 0) + (legendBase?.height ?? 0)
  const BANDA = altoCabecera > 0 ? altoCabecera + 34 : 0
  if (BANDA > 0) {
    for (const b of boxes) b.y += BANDA
    for (const p of parts) p.y += BANDA
    for (const e of edges) e.points = e.points.map(pt => ({ x: pt.x, y: pt.y + BANDA }))
  }

  // El ancho del lienzo lo puede fijar la cabecera si es mas ancha que el diagrama.
  const anchoTotal = Math.max(anchoDiagrama, titulo?.width ?? 0)
  const title = titulo ? { ...titulo, x: 0, y: 0 } : null
  const legend = legendBase
    ? { ...legendBase,
        x: anchoTotal - legendBase.width,
        y: cabenJuntos ? 0 : (titulo ? titulo.height + 18 : 0) }
    : null
  const bounds = { width: anchoTotal, height: layout.bounds.height + BANDA }

  return { boxes, parts, edges, bounds, legend, title, issues }
}

/**
 * Recorta los extremos de una ruta al BORDE de sus cajas.
 *
 * dagre entrega la ruta de centro a centro; pintada asi, el arranque de la
 * flecha queda debajo de la tarjeta y la punta se clava en el medio del
 * destino. Se avanza desde cada extremo hasta el primer punto que ya esta
 * fuera de la caja, y se interpola el cruce exacto con el borde.
 */
function clipToBorders(points: Point[], from: Obstacle, to: Obstacle): Point[] {
  const dentro = (p: Point, o: Obstacle) =>
    p.x >= o.x && p.x <= o.x + o.width && p.y >= o.y && p.y <= o.y + o.height

  const cruce = (a: Point, b: Point, o: Obstacle): Point => {
    // Busqueda binaria del punto de salida: exacta a menos de un pixel en ~10
    // pasos, y no necesita casos especiales por lado de la caja.
    let lo = 0, hi = 1
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      const p = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid }
      if (dentro(p, o)) lo = mid; else hi = mid
    }
    return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi }
  }

  let inicio = 0
  while (inicio + 1 < points.length && dentro(points[inicio + 1], from)) inicio++
  let fin = points.length - 1
  while (fin - 1 > inicio && dentro(points[fin - 1], to)) fin--

  const cuerpo = points.slice(inicio, fin + 1)
  if (cuerpo.length < 2) return points

  const salida = dentro(cuerpo[0], from) ? cruce(cuerpo[0], cuerpo[1], from) : cuerpo[0]
  const llegada = dentro(cuerpo[cuerpo.length - 1], to)
    ? cruce(cuerpo[cuerpo.length - 1], cuerpo[cuerpo.length - 2], to)
    : cuerpo[cuerpo.length - 1]

  return [salida, ...cuerpo.slice(1, -1), llegada]
}

/** ¿Esta polilinea atraviesa una caja que no es su origen ni su destino? */
function crossesAny(points: Point[], obstacles: Obstacle[], from: string, to: string): boolean {
  const inset = 4
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1]
    for (const o of obstacles) {
      if (o.id === from || o.id === to) continue
      const x1 = o.x + inset, y1 = o.y + inset
      const x2 = o.x + o.width - inset, y2 = o.y + o.height - inset
      if (x1 >= x2 || y1 >= y2) continue
      // Liang-Barsky: el mismo criterio que usa el juez, para que no puedan
      // discrepar sobre si una ruta cruza o no.
      let t0 = 0, t1 = 1
      const dx = b.x - a.x, dy = b.y - a.y
      const clip = (p: number, q: number): boolean => {
        if (p === 0) return q >= 0
        const t = q / p
        if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
        else { if (t < t0) return false; if (t < t1) t1 = t }
        return true
      }
      if (clip(-dx, a.x - x1) && clip(dx, x2 - a.x) && clip(-dy, a.y - y1) && clip(dy, y2 - a.y)) return true
    }
  }
  return false
}



/**
 * Compila el diagrama en las DOS direcciones y devuelve la que sale mejor.
 *
 * ⚠️ ESTO EXISTE PORQUE ADIVINAR NO FUNCIONÓ.
 *
 * El 20 ago 2026, con los tres sistemas del negocio, horizontal daba 5, 4 y 6
 * flechas atravesando texto; vertical daba CERO en los tres. Se intentó
 * PREDECIR ese numero sin compilar —primero con las polilineas de dagre,
 * despues con el segmento centro-a-centro, despues con una regla sobre la boca
 * sur— y las tres versiones fallaron por el mismo motivo: la boca por la que
 * entra una flecha no depende de donde estan las cajas, depende de la RUTA, y
 * la ruta depende de los obstaculos. Un proxy que no puede saberlo devuelve
 * cero y elige mal en silencio, que es exactamente la clase de sensor que este
 * canvas existe para no tener.
 *
 * Compilar dos veces cuesta ~40 ms para un diagrama de doce nodos. Es un precio
 * ridiculo por dejar de adivinar, y se paga UNA vez por diagrama generado.
 *
 * `medirDefectos` la inyecta quien llama (con el juez), para que el compilador
 * no tenga que importar la auditoria y quedarse los dos acoplados.
 */
export async function compileMejorDireccion(
  ctx: MeasureContext,
  spec: DiagramSpec,
  options: CompileOptions,
  medirDefectos: (d: CompiledDiagram) => number,
): Promise<{ diagrama: CompiledDiagram; direccion: 'LR' | 'TB'; defectos: number }> {
  // Si el spec FIJA una direccion, manda: quien la escribio sabe algo que el
  // compilador no. Elegir por el seria pisar una decision.
  if (spec.layout?.direction) {
    const d = await compileDiagram(ctx, spec, options)
    return { diagrama: d, direccion: spec.layout.direction as 'LR' | 'TB', defectos: medirDefectos(d) }
  }

  let mejor: { diagrama: CompiledDiagram; direccion: 'LR' | 'TB'; defectos: number } | null = null
  for (const direccion of ['TB', 'LR'] as const) {
    const d = await compileDiagram(ctx, { ...spec, layout: { ...spec.layout, direction: direccion } }, options)
    const defectos = medirDefectos(d)
    if (!mejor || defectos < mejor.defectos) mejor = { diagrama: d, direccion, defectos }
  }
  // El orden del bucle es el desempate: con los mismos defectos gana TB, que es
  // la que se lee de arriba a abajo como cualquier texto.
  return mejor!
}
