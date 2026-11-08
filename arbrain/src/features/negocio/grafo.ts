/**
 * Tu negocio › El sistema como grafo (5 nov 2026, Daniel: «tenemos dos sistemas… qué te parece en lugar de ser los dos
 * tuviéramos sólo uno… podemos utilizar mejor tecnología diseñada precisamente para sistemas»). Geometría pura del
 * grafo que pinta React Flow: dónde va cada embudo, cada etapa y por dónde pasa cada arista. Sin React y sin DOM, para
 * que la prueba fije el dibujo (tests/negocio/grafo.test.ts).
 *
 * Dos niveles. Ancho (escritorio, Ampliar): dagre acomoda los EMBUDOS como nodos y la escalera de valor (las aristas
 * `upsell`) como aristas: los pisos que traen gente quedan arriba y cada oferta debajo de lo que sube a ella, sin
 * coordenadas escritas a mano, y las etapas de cada embudo van en fila. Estrecho (el panel, el teléfono a 390 px): una
 * sola columna en el orden declarado de `embudos` (el esquema lo define como el orden de arriba abajo), con tarjetas a
 * todo lo ancho para leerlas a tamaño real; la escalera corre por los pasillos laterales. Las aristas se trazan aquí, ortogonales, por los pasillos entre embudos: ninguna atraviesa una
 * etapa. El giro de vuelta (casos → contenido) rodea el dibujo por la izquierda.
 *
 * Los nodos no se arrastran: el archivo manda y la posición sale de él cada vez. Se acerca, se aleja y se recorre.
 */
import dagre from 'dagre'
import { agrupar, esPiso, porConstruir, type Arista, type Embudo, type Etapa, type Grupo, type InfoEmbudo } from './embudo'

export type Orientacion = 'ancho' | 'estrecho'
export interface Rect { x: number; y: number; w: number; h: number }
export interface Punto { x: number; y: number }

/** Medidas en px a zoom 1. Ancho: la cabeza del embudo a la izquierda de su fila. Estrecho: arriba de su columna. */
export const MEDIDAS = {
  ancho: { nodo: { w: 180, h: 88 }, paso: 26, pad: 14, cabeza: 156, separacion: 40, rangos: 70 },
  estrecho: { nodo: { w: 256, h: 76 }, paso: 18, pad: 10, cabeza: 50, separacion: 22, rangos: 60 },
} as const

/** Ancho del contenedor desde el que el grafo se acuesta en filas. Debajo, columnas: se lee bajando, como en el teléfono. */
export const ANCHO_FILAS = 900
export const orientacionPara = (anchoContenedor: number): Orientacion => anchoContenedor >= ANCHO_FILAS ? 'ancho' : 'estrecho'

export interface NodoEmbudo { id: string; rect: Rect; info: InfoEmbudo; piso: boolean; porConstruir: boolean; etapas: string[] }
export interface NodoEtapa { id: string; embudo: string; rect: Rect; etapa: Etapa; indice: number; ultimo: boolean }
export type TipoArista = Arista['tipo']
export interface Trazo {
  id: string; desde: string; hacia: string; tipo: TipoArista; arista: Arista
  /** Punteada: por construir, o une una etapa que no opera hoy. */
  porConstruir: boolean
  puntos: Punto[]
  etiqueta: string | null
  /** Dónde va la etiqueta: el centro del tramo más largo que corre por un pasillo. */
  ancla: Punto | null
}
export interface Grafo { orientacion: Orientacion; embudos: NodoEmbudo[]; etapas: NodoEtapa[]; aristas: Trazo[]; limites: Rect }

const der = (r: Rect) => r.x + r.w
const abajo = (r: Rect) => r.y + r.h
const cx = (r: Rect) => r.x + r.w / 2
const cy = (r: Rect) => r.y + r.h / 2

/** Tamaño del marco de un embudo con n etapas. */
export function tamanoEmbudo(n: number, o: Orientacion): { w: number; h: number } {
  const m = MEDIDAS[o]
  if (o === 'ancho') return { w: m.pad + m.cabeza + n * m.nodo.w + (n - 1) * m.paso + m.pad, h: m.pad + m.nodo.h + m.pad }
  return { w: m.pad + m.nodo.w + m.pad, h: m.cabeza + n * m.nodo.h + (n - 1) * m.paso + m.pad }
}

/** Dónde va la etapa i dentro de su embudo, relativo al marco. */
export function posicionEtapa(i: number, o: Orientacion): Punto {
  const m = MEDIDAS[o]
  return o === 'ancho' ? { x: m.pad + m.cabeza + i * (m.nodo.w + m.paso), y: m.pad } : { x: m.pad, y: m.cabeza + i * (m.nodo.h + m.paso) }
}

/** El grafo completo de un embudo, listo para pintar. */
export function construirGrafo(e: Embudo, o: Orientacion): Grafo {
  const m = MEDIDAS[o]
  const grupos = agrupar(e)
  const embudoDe = new Map<string, Grupo>()
  for (const g of grupos) for (const et of g.etapas) embudoDe.set(et.id, g)

  // 1. Dónde va cada embudo. Estrecho: uno debajo de otro, en el orden declarado. Ancho: dagre, por la escalera de
  //    valor (el giro de vuelta no cuenta: subiría lo que va abajo).
  const { embudos, rangoDe } = o === 'estrecho' ? enColumna(grupos, o) : porEscalera(grupos, e, embudoDe, o)
  const nRangos = Math.max(...rangoDe.values()) + 1
  const filas = Array.from({ length: nRangos }, (_, i) => {
    const en = embudos.filter(b => rangoDe.get(b.id) === i)
    return { arriba: Math.min(...en.map(b => b.rect.y)), abajo: Math.max(...en.map(b => abajo(b.rect))) }
  })

  // 2. Las etapas, en fila o en columna dentro de su marco.
  const etapas: NodoEtapa[] = []
  for (const b of embudos) {
    const gr = grupos.find(x => x.info.id === b.id)!
    gr.etapas.forEach((et, i) => {
      const p = posicionEtapa(i, o)
      etapas.push({ id: et.id, embudo: b.id, etapa: et, indice: i, ultimo: i === gr.etapas.length - 1, rect: { x: b.rect.x + p.x, y: b.rect.y + p.y, w: m.nodo.w, h: m.nodo.h } })
    })
  }
  const nodo = new Map(etapas.map(n => [n.id, n]))
  const marco = new Map(embudos.map(b => [b.id, b]))

  // 3. Las aristas, por los pasillos.
  const aristas: Trazo[] = []
  for (const a of e.aristas) {
    const S = nodo.get(a.desde), T = nodo.get(a.hacia)
    if (!S || !T) continue
    const GS = marco.get(S.embudo)!, GT = marco.get(T.embudo)!
    const puntos = S.embudo === T.embudo && a.tipo === 'flujo' ? rutaFlujo(S, T, o) : rutaEntre(S, T, GS, GT, rangoDe, filas, embudos, o)
    const opera = S.etapa.opera_hoy && T.etapa.opera_hoy
    const etiqueta = a.tipo === 'flujo' ? null : (a.accion ?? (a.tipo === 'volante' ? 'De vuelta al inicio' : 'Sube'))
    aristas.push({ id: `${a.desde}->${a.hacia}`, desde: a.desde, hacia: a.hacia, tipo: a.tipo, arista: a, porConstruir: /construir/i.test(a.estado) || !opera, puntos, etiqueta, ancla: null })
  }
  colocarEtiquetas(aristas, embudos.map(b => b.rect))

  // 4. Todo a coordenadas positivas, con el giro de vuelta adentro.
  const xs = [...embudos.flatMap(b => [b.rect.x, der(b.rect)]), ...aristas.flatMap(t => t.puntos.map(p => p.x))]
  const ys = [...embudos.flatMap(b => [b.rect.y, abajo(b.rect)]), ...aristas.flatMap(t => t.puntos.map(p => p.y))]
  const dx = -Math.min(...xs), dy = -Math.min(...ys)
  const mover = (r: Rect): Rect => ({ ...r, x: r.x + dx, y: r.y + dy })
  const moverP = (p: Punto): Punto => ({ x: p.x + dx, y: p.y + dy })
  return {
    orientacion: o,
    embudos: embudos.map(b => ({ ...b, rect: mover(b.rect) })),
    etapas: etapas.map(n => ({ ...n, rect: mover(n.rect) })),
    aristas: aristas.map(t => ({ ...t, puntos: t.puntos.map(moverP), ancla: t.ancla && moverP(t.ancla) })),
    limites: { x: 0, y: 0, w: Math.max(...xs) + dx, h: Math.max(...ys) + dy },
  }
}

/** Estrecho: una columna, en el orden declarado; cada embudo es su propio rango. */
function enColumna(grupos: Grupo[], o: Orientacion): { embudos: NodoEmbudo[]; rangoDe: Map<string, number> } {
  const m = MEDIDAS[o]
  let y = 0
  const embudos = grupos.map(gr => {
    const t = tamanoEmbudo(gr.etapas.length, o)
    const b: NodoEmbudo = { id: gr.info.id, rect: { x: 0, y, w: t.w, h: t.h }, info: gr.info, piso: esPiso(gr.info), porConstruir: porConstruir(gr.info), etapas: gr.etapas.map(et => et.id) }
    y += t.h + m.rangos
    return b
  })
  return { embudos, rangoDe: new Map(embudos.map((b, i) => [b.id, i])) }
}

/** Ancho: dagre acomoda los embudos por la escalera de valor y cada rango alinea sus marcos por arriba. */
function porEscalera(grupos: Grupo[], e: Embudo, embudoDe: Map<string, Grupo>, o: Orientacion): { embudos: NodoEmbudo[]; rangoDe: Map<string, number> } {
  const m = MEDIDAS[o]
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: m.separacion, ranksep: m.rangos, marginx: 0, marginy: 0, align: 'UR' })
  g.setDefaultEdgeLabel(() => ({}))
  for (const gr of grupos) { const t = tamanoEmbudo(gr.etapas.length, o); g.setNode(gr.info.id, { width: t.w, height: t.h }) }
  for (const a of e.aristas) {
    if (a.tipo !== 'upsell') continue
    const d = embudoDe.get(a.desde)?.info.id, h = embudoDe.get(a.hacia)?.info.id
    if (d && h && d !== h && !g.hasEdge(d, h)) g.setEdge(d, h)
  }
  dagre.layout(g)

  // Un rango alinea sus marcos por arriba (dagre los centra): un piso de una etapa no flota a media altura del vecino.
  const crudos = grupos.map(gr => { const n = g.node(gr.info.id); return { gr, x: n.x - n.width / 2, cyD: n.y, w: n.width, h: n.height } })
  const rangos = [...new Set(crudos.map(c => Math.round(c.cyD)))].sort((a, b) => a - b)
  const topeRango = new Map(rangos.map(r => [r, Math.min(...crudos.filter(c => Math.round(c.cyD) === r).map(c => c.cyD - c.h / 2))]))
  const embudos: NodoEmbudo[] = crudos.map(c => ({
    id: c.gr.info.id,
    rect: { x: c.x, y: topeRango.get(Math.round(c.cyD))!, w: c.w, h: c.h },
    info: c.gr.info, piso: esPiso(c.gr.info), porConstruir: porConstruir(c.gr.info), etapas: c.gr.etapas.map(et => et.id),
  }))
  const rangoDe = new Map(crudos.map(c => [c.gr.info.id, rangos.indexOf(Math.round(c.cyD))]))
  return { embudos, rangoDe }
}

/** Dentro de un embudo: de una etapa a la siguiente, recto. */
function rutaFlujo(S: NodoEtapa, T: NodoEtapa, o: Orientacion): Punto[] {
  if (o === 'ancho') return [{ x: der(S.rect), y: cy(S.rect) }, { x: T.rect.x, y: cy(T.rect) }]
  return [{ x: cx(S.rect), y: abajo(S.rect) }, { x: cx(T.rect), y: T.rect.y }]
}

/**
 * Entre embudos (la escalera y el giro de vuelta). Sale por un lado libre de la etapa, corre por el pasillo entre rangos
 * y entra por un lado libre de la otra. Ancho: sale por abajo y entra por arriba (las filas dejan libres esos lados).
 * Estrecho: sale por la derecha y entra por la izquierda (en la columna, arriba y abajo los ocupa el flujo). Si la
 * vertical directa cruzaría un embudo de en medio, rodea por el pasillo lateral más cercano.
 */
function rutaEntre(S: NodoEtapa, T: NodoEtapa, GS: NodoEmbudo, GT: NodoEmbudo, rangoDe: Map<string, number>, filas: { arriba: number; abajo: number }[], embudos: NodoEmbudo[], o: Orientacion): Punto[] {
  const m = MEDIDAS[o]
  const rS = rangoDe.get(GS.id)!, rT = rangoDe.get(GT.id)!
  const margen = m.separacion / 2
  const bajoDe = (r: number) => r + 1 < filas.length ? (filas[r].abajo + filas[r + 1].arriba) / 2 : filas[r].abajo + m.rangos / 2
  const sobreDe = (r: number, frac = 0.5) => r > 0 ? filas[r].arriba - (filas[r].arriba - filas[r - 1].abajo) * frac : filas[r].arriba - m.rangos * frac
  const entre = (a: number, b: number) => embudos.filter(x => { const r = rangoDe.get(x.id)!; return r > Math.min(a, b) && r < Math.max(a, b) })
  const libreV = (x: number, y1: number, y2: number, fuera: NodoEmbudo[]) => !fuera.some(b => x > b.rect.x - 2 && x < der(b.rect) + 2 && Math.max(y1, y2) > b.rect.y && Math.min(y1, y2) < abajo(b.rect))

  if (rT > rS) {
    // Hacia abajo: la escalera de valor.
    const medio = entre(rS, rT)
    const yIn = sobreDe(rT)
    if (o === 'ancho') {
      const p0 = { x: cx(S.rect), y: abajo(S.rect) }, pN = { x: cx(T.rect), y: T.rect.y }
      if (libreV(p0.x, p0.y, yIn, [...medio, ...embudos.filter(b => b !== GS && rangoDe.get(b.id) === rS)])) return limpiar([p0, { x: p0.x, y: yIn }, { x: pN.x, y: yIn }, pN])
      const yOut = bajoDe(rS), xC = pasillo(medio, p0.x, pN.x, margen)
      return limpiar([p0, { x: p0.x, y: yOut }, { x: xC, y: yOut }, { x: xC, y: yIn }, { x: pN.x, y: yIn }, pN])
    }
    const p0 = { x: der(S.rect), y: cy(S.rect) }, pN = { x: T.rect.x, y: cy(T.rect) }
    const xR = der(GS.rect) + margen, xL = GT.rect.x - margen
    if (libreV(xR, p0.y, yIn, [...medio, ...embudos.filter(b => b !== GS && rangoDe.get(b.id) === rS)])) return limpiar([p0, { x: xR, y: p0.y }, { x: xR, y: yIn }, { x: xL, y: yIn }, { x: xL, y: pN.y }, pN])
    const yOut = bajoDe(rS), xC = pasillo(medio, xR, xL, margen)
    return limpiar([p0, { x: xR, y: p0.y }, { x: xR, y: yOut }, { x: xC, y: yOut }, { x: xC, y: yIn }, { x: xL, y: yIn }, { x: xL, y: pN.y }, pN])
  }

  // Hacia arriba (el giro de vuelta) o en el mismo rango: baja al pasillo de abajo, rodea por la izquierda y entra desde
  // el pasillo de arriba del destino, más pegado a él que la escalera para no correr sobre ella.
  const yOut = bajoDe(rS)
  const tramo = embudos.filter(b => { const r = rangoDe.get(b.id)!; return r >= Math.min(rS, rT) && r <= Math.max(rS, rT) })
  const xC = Math.min(...tramo.map(b => b.rect.x)) - margen * 1.4
  const yIn = sobreDe(rT, 0.3)
  const p0 = o === 'ancho' || S.ultimo ? { x: cx(S.rect), y: abajo(S.rect) } : { x: der(S.rect), y: cy(S.rect) }
  const salida = o === 'ancho' || S.ultimo ? [p0] : [p0, { x: der(GS.rect) + margen, y: p0.y }]
  const ultima = salida[salida.length - 1]
  const rodeo = [...salida, { x: ultima.x, y: yOut }, { x: xC, y: yOut }]
  if (o === 'ancho') {
    const pN = { x: cx(T.rect), y: T.rect.y }
    return limpiar([...rodeo, { x: xC, y: yIn }, { x: pN.x, y: yIn }, pN])
  }
  // Estrecho: a la primera etapa de una columna sin vecinos a su izquierda se entra derecho desde el pasillo lateral.
  const vecinoIzq = embudos.some(b => b !== GT && rangoDe.get(b.id) === rT && b.rect.x < GT.rect.x)
  if (T.indice === 0 && !vecinoIzq) {
    const pN = { x: T.rect.x, y: cy(T.rect) }
    return limpiar([...rodeo, { x: xC, y: pN.y }, pN])
  }
  const pN = { x: T.rect.x, y: cy(T.rect) }, xL = GT.rect.x - margen
  return limpiar([...salida, { x: ultima.x, y: yOut }, { x: xC, y: yOut }, { x: xC, y: yIn }, { x: xL, y: yIn }, { x: xL, y: pN.y }, pN])
}

/** El pasillo vertical para rodear los embudos de en medio: a la derecha o a la izquierda, el que quede más cerca. */
function pasillo(medio: NodoEmbudo[], xa: number, xb: number, margen: number): number {
  const derecha = Math.max(...medio.map(b => der(b.rect))) + margen
  const izquierda = Math.min(...medio.map(b => b.rect.x)) - margen
  const costo = (x: number) => Math.abs(x - xa) + Math.abs(x - xb)
  return costo(derecha) <= costo(izquierda) ? derecha : izquierda
}

/** Quita puntos repetidos y los de en medio de un tramo recto. */
export function limpiar(p: Punto[]): Punto[] {
  const r: Punto[] = []
  for (const q of p) {
    const a = r[r.length - 1]
    if (a && Math.abs(a.x - q.x) < 0.5 && Math.abs(a.y - q.y) < 0.5) continue
    const b = r[r.length - 2]
    if (a && b && ((Math.abs(b.x - a.x) < 0.5 && Math.abs(a.x - q.x) < 0.5) || (Math.abs(b.y - a.y) < 0.5 && Math.abs(a.y - q.y) < 0.5))) r[r.length - 1] = q
    else r.push(q)
  }
  return r
}

/** Caja aproximada de una etiqueta a zoom 1 (10.5 px, Inter): la usa el acomodo y la pinta el componente. */
export const cajaEtiqueta = (texto: string, centro: Punto): Rect => {
  const w = Math.round(texto.length * 5.9 + 18), h = 20
  return { x: centro.x - w / 2, y: centro.y - h / 2, w, h }
}
const choca = (a: Rect, b: Rect, aire = 3) => a.x < der(b) + aire && der(a) + aire > b.x && a.y < abajo(b) + aire && abajo(a) + aire > b.y

/**
 * Cada etiqueta en un pasillo: sobre un tramo de su arista (primero los horizontales, del más largo al más corto, al
 * centro y luego hacia los lados), sin tapar un embudo ni encimarse con otra. Si no cabe en ningún lado se queda sin
 * etiqueta en el dibujo; la escalera completa se lee igual al tocar la etapa.
 */
function colocarEtiquetas(aristas: Trazo[], obstaculos: Rect[]) {
  const puestas: Rect[] = []
  for (const t of aristas) {
    if (!t.etiqueta) continue
    const tramos = t.puntos.slice(1).map((b, i) => ({ a: t.puntos[i], b, h: Math.abs(t.puntos[i].y - b.y) < 0.5, l: Math.abs(t.puntos[i].x - b.x) + Math.abs(t.puntos[i].y - b.y) }))
      .sort((x, y) => Number(y.h) - Number(x.h) || y.l - x.l)
    let ancla: Punto | null = null
    // Sobre un horizontal, la etiqueta va arriba de la línea (o abajo): dos aristas que comparten pasillo caben las dos.
    buscar: for (const s of tramos) for (const dy of s.h ? [-12, 12, 0] : [0]) for (const f of [0.5, 0.35, 0.65, 0.22, 0.78]) {
      const c = { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f + dy }
      const caja = cajaEtiqueta(t.etiqueta, c)
      if (obstaculos.some(r => choca(caja, r)) || puestas.some(r => choca(caja, r))) continue
      ancla = c; puestas.push(caja); break buscar
    }
    t.ancla = ancla
  }
}

/** Un trazo ortogonal con esquinas redondeadas (radio r, recortado a la mitad del tramo más corto que toca). */
export function trazoSvg(p: Punto[], r = 12): string {
  if (!p.length) return ''
  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1]
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y)
    const k = Math.min(r, l1 / 2, l2 / 2)
    const e1 = { x: b.x - ((b.x - a.x) / (l1 || 1)) * k, y: b.y - ((b.y - a.y) / (l1 || 1)) * k }
    const e2 = { x: b.x + ((c.x - b.x) / (l2 || 1)) * k, y: b.y + ((c.y - b.y) / (l2 || 1)) * k }
    d += ` L ${e1.x} ${e1.y} Q ${b.x} ${b.y} ${e2.x} ${e2.y}`
  }
  const z = p[p.length - 1]
  return `${d} L ${z.x} ${z.y}`
}

/** ¿El tramo a→b (horizontal o vertical) pasa por dentro del rectángulo? Tocar el borde no cuenta. */
export function cruza(a: Punto, b: Punto, r: Rect, holgura = 1): boolean {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y)
  return x2 > r.x + holgura && x1 < der(r) - holgura && y2 > r.y + holgura && y1 < abajo(r) - holgura
}

/** Lo que conecta una etapa: de dónde le llega gente y a dónde la manda. */
export function conexiones(e: Embudo, id: string): { llega: Arista[]; sale: Arista[] } {
  return { llega: e.aristas.filter(a => a.hacia === id), sale: e.aristas.filter(a => a.desde === id) }
}
