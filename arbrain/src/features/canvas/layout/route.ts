/**
 * Canvas v4 — ruteo de conectores por corredores libres.
 *
 * La unica pieza del pipeline que no existia en ninguna libreria y hubo que
 * escribir. Se mantiene chica a proposito.
 *
 * Por que hace falta: dagre resuelve DONDE va cada nodo, pero las rutas que
 * devuelve son polilineas suaves que ignoran los obstaculos. Con el layout
 * apretado, una arista de A a D atraviesa la caja C — el juez mecanico lo
 * reporto como fallo y tenia razon.
 *
 * Y en el v3 esto se resolvia a mano: los generadores traian corredores
 * hardcodeados como constantes magicas ("corredor derecho x~5470"). Aqui los
 * corredores se DERIVAN del layout real: las coordenadas entre cajas ya son los
 * pasillos libres, solo hay que verlos.
 *
 * Algoritmo: A* ortogonal sobre una grilla ESPARSA. Los candidatos no son
 * pixeles (seria carisimo) sino las lineas que importan: bordes de cajas con
 * holgura, centros de cajas, y los puntos medios de los huecos. Para un
 * diagrama tipico son decenas de lineas, no miles de pixeles.
 */

export interface Obstacle {
  /**
   * Cuanto se extiende la parte VISIBLE por debajo de la caja.
   *
   * El pie de una tarjeta cuelga FUERA de ella, y para el ojo es parte del
   * objeto. Sin esto, la boca de abajo nace en el borde del rectangulo y la
   * flecha atraviesa el texto — medido: cuatro aristas cruzando su propio pie
   * en cuanto se centraron las bocas. Ausente = la caja es todo lo que hay.
   */
  pieAlto?: number
  id: string; x: number; y: number; width: number; height: number
}
export interface Point { x: number; y: number }

export interface RouteOptions {
  /** Holgura alrededor de cada obstaculo. */
  clearance?: number
  /** Cuanto cuesta girar, en px equivalentes. Alto = rutas mas limpias. */
  turnPenalty?: number
  /** Tope de nodos explorados. Red de seguridad contra grafos patologicos. */
  maxNodes?: number
}

const DEFAULTS: Required<RouteOptions> = { clearance: 14, turnPenalty: 30, maxNodes: 20000 }

const uniqSorted = (xs: number[]): number[] => {
  const out = [...new Set(xs.map(v => Math.round(v)))].sort((a, b) => a - b)
  return out
}

/**
 * INDICE ESPACIAL (6 oct 2026). `blocked` y `segmentBlocked` recorrian TODOS los obstaculos por cada vecino de
 * cada nodo explorado: con 937 elementos y 59 conectores un solo clic (que re-rutea todo al soltar) congelaba la
 * pagina 13-23 s. Se reparten los obstaculos en celdas de lado fijo y se consultan solo las que toca el punto o
 * el segmento: mismo resultado booleano (cualquier traslape cuenta), sin recorrer los que estan lejos.
 */
const CELDA = 256

interface Indice { celdas: Map<number, Obstacle[]>; exento: Set<string>; clearance: number }

const llave = (cx: number, cy: number): number => (cx + 32768) * 65536 + (cy + 32768)

function construirIndice(obstacles: Obstacle[], clearance: number, exento: Set<string>): Indice {
  const celdas = new Map<number, Obstacle[]>()
  for (const o of obstacles) {
    if (exento.has(o.id)) continue
    const c0 = Math.floor((o.x - clearance) / CELDA), c1 = Math.floor((o.x + o.width + clearance) / CELDA)
    const r0 = Math.floor((o.y - clearance) / CELDA), r1 = Math.floor((o.y + o.height + clearance) / CELDA)
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const k = llave(cx, cy)
      const l = celdas.get(k)
      if (l) l.push(o); else celdas.set(k, [o])
    }
  }
  return { celdas, exento, clearance }
}

/** ¿El punto cae dentro de algun obstaculo (con holgura)? */
function blocked(p: Point, ix: Indice): boolean {
  const l = ix.celdas.get(llave(Math.floor(p.x / CELDA), Math.floor(p.y / CELDA)))
  if (!l) return false
  const c = ix.clearance
  for (const o of l) {
    if (p.x > o.x - c && p.x < o.x + o.width + c
     && p.y > o.y - c && p.y < o.y + o.height + c) return true
  }
  return false
}

/** ¿El segmento (siempre horizontal o vertical) cruza algun obstaculo? */
function segmentBlocked(a: Point, b: Point, ix: Indice): boolean {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y)
  const c = ix.clearance
  const c0 = Math.floor(minX / CELDA), c1 = Math.floor(maxX / CELDA)
  const r0 = Math.floor(minY / CELDA), r1 = Math.floor(maxY / CELDA)
  for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
    const l = ix.celdas.get(llave(cx, cy))
    if (!l) continue
    for (const o of l) {
      const ox1 = o.x - c, oy1 = o.y - c
      const ox2 = o.x + o.width + c, oy2 = o.y + o.height + c
      if (maxX > ox1 && minX < ox2 && maxY > oy1 && minY < oy2) return true
    }
  }
  return false
}

/**
 * Cola de prioridad por (f, orden de entrada). El orden de entrada reproduce EXACTAMENTE el desempate del
 * `sort` estable + `shift` que habia (el empate sale en el orden en que entro), asi que las rutas no cambian.
 */
class ColaMin<T extends { f: number }> {
  private a: Array<{ it: T; n: number }> = []
  private n = 0
  get length(): number { return this.a.length }
  private menor(i: number, j: number): boolean {
    const x = this.a[i], y = this.a[j]
    return x.it.f < y.it.f || (x.it.f === y.it.f && x.n < y.n)
  }
  push(it: T): void {
    const a = this.a
    a.push({ it, n: this.n++ })
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.menor(i, p)) break
      ;[a[i], a[p]] = [a[p], a[i]]; i = p
    }
  }
  pop(): T {
    const a = this.a
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < a.length && this.menor(l, m)) m = l
        if (r < a.length && this.menor(r, m)) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]; i = m
      }
    }
    return top.it
  }
}

/** El punto del borde de la caja por donde debe salir o entrar la ruta. */
/** Los cuatro lados por los que una flecha puede entrar o salir. */
export type Lado = 'n' | 'e' | 's' | 'w'

/** El punto exacto de un lado concreto. */
export function bocaDelLado(box: Obstacle, lado: Lado, clearance: number): Point {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  switch (lado) {
    case 'e': return { x: box.x + box.width + clearance, y: Math.round(cy) }
    case 'w': return { x: box.x - clearance, y: Math.round(cy) }
    case 'n': return { x: Math.round(cx), y: box.y - clearance }
    // La boca de ABAJO sale por debajo del pie, no por el borde del rectangulo:
    // el pie es visible y una flecha que lo atraviesa se lee como error.
    case 's': return { x: Math.round(cx), y: box.y + box.height + (box.pieAlto ?? 0) + clearance }
  }
}

/**
 * Donde entra o sale una flecha de una caja.
 *
 * Con `lado`, ESE lado manda pase lo que pase. Es la peticion de Daniel, y no
 * es cosmetica:
 *
 *   *"la flecha, si la conecte del lado izquierdo, por mas que mueva el
 *   componente al que se conecto, no se cambia de lugar. Siempre se va a
 *   quedar en el lugar donde se conecto."*
 *
 * Sin eso, un diagrama que armaste a mano se REORGANIZA solo cada vez que
 * mueves una caja: la flecha que salia por la izquierda salta a la derecha
 * porque el algoritmo cree saber mejor. Para un mapa generado eso esta bien
 * —nadie eligio ese lado— pero cuando la mano lo eligio, cambiarlo es borrar
 * una decision.
 *
 * Sin `lado` se elige el dominante, como haria cualquiera a mano. Ese sigue
 * siendo el comportamiento de todo lo compilado.
 */
export function anchorOn(box: Obstacle, toward: Point, clearance: number, lado?: Lado): Point {
  if (lado) return bocaDelLado(box, lado, clearance)
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const dx = toward.x - cx, dy = toward.y - cy
  // Se elige el lado dominante, como haria cualquiera a mano.
  if (Math.abs(dx) * box.height > Math.abs(dy) * box.width) {
    return { x: dx > 0 ? box.x + box.width + clearance : box.x - clearance, y: Math.round(cy) }
  }
  const abajo = box.y + box.height + (box.pieAlto ?? 0) + clearance
  return { x: Math.round(cx), y: dy > 0 ? abajo : box.y - clearance }
}

/** De que lado de la caja cae un punto. Para recordar por donde se conecto. */
export function ladoMasCercano(box: Obstacle, p: Point): Lado {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const dx = p.x - cx, dy = p.y - cy
  if (Math.abs(dx) * box.height > Math.abs(dy) * box.width) return dx > 0 ? 'e' : 'w'
  return dy > 0 ? 's' : 'n'
}

/**
 * PEGA los extremos de una ruta a las CUATRO bocas cardinales de su caja.
 *
 * Daniel, textual: *"asegúrate que las flechas no salgan del centro sino salgan
 * del borde, ya sea derecha izquierda arriba abajo"*.
 *
 * Las rutas ya tocaban el borde, pero en el punto que le convenia al algoritmo:
 * medido, un conector arrancaba 54px descentrado sobre el borde inferior.
 * Toca el borde y aun asi se lee arbitrario — el ojo espera que una flecha
 * nazca en el MEDIO de un lado, como si la caja tuviera cuatro bocas.
 *
 * ⚠️ VIVE AQUI, no en cada router. Hay DOS caminos que producen rutas —el del
 * compilador (dagre + recorte al borde) y el de la mano (A* propio)— y la
 * primera version de este arreglo solo toco uno: el diagrama compilado seguia
 * saliendo descentrado y parecia que el arreglo no funcionaba. Es la misma
 * regla que ya rige el hit-test: la geometria en UN solo lugar, o diverge.
 */
export function pegarALosBordes(
  ruta: Point[], a: Obstacle, b: Obstacle, ladoA?: Lado, ladoB?: Lado,
): Point[] {
  if (ruta.length < 2) return ruta
  const inicio = anchorOn(a, ruta[1], 0, ladoA)
  const fin = anchorOn(b, ruta[ruta.length - 2], 0, ladoB)
  // Una boca es VERTICAL (norte o sur) cuando su x coincide con el centro de la
  // caja. Con lado fijo se sabe directo, sin deducirlo de la geometria: la
  // deduccion falla en una caja tan angosta que su centro y su borde caen a
  // menos de 1px.
  const bocaVertical = (o: Obstacle, p: Point, lado?: Lado) =>
    lado ? (lado === 'n' || lado === 's') : Math.abs(p.x - (o.x + o.width / 2)) < 1

  // El CODO se INSERTA, no se empuja al vecino.
  //
  // La primera version movia el punto contiguo al eje de la boca. Falla en dos
  // casos que se midieron: con una ruta de tres puntos, los dos ajustes caen
  // sobre el MISMO punto y el segundo pisa al primero; y con una spline de
  // dagre, empujar solo al vecino deja el resto del tramo en diagonal.
  //
  // Insertar una esquina en L garantiza la ortogonalidad sea cual sea la ruta,
  // y cuando el codo coincide con lo que ya habia se descarta por duplicado.
  const cuerpo = ruta.slice(1, -1)
  const p1 = cuerpo[0] ?? fin
  const pN = cuerpo[cuerpo.length - 1] ?? inicio
  const codoInicio = bocaVertical(a, inicio, ladoA) ? { x: inicio.x, y: p1.y } : { x: p1.x, y: inicio.y }
  const codoFin = bocaVertical(b, fin, ladoB) ? { x: fin.x, y: pN.y } : { x: pN.x, y: fin.y }

  const casiIgual = (p: Point, q: Point) => Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1
  const out: Point[] = [inicio]
  const empujar = (p: Point) => { if (!casiIgual(out[out.length - 1], p)) out.push(p) }
  empujar(codoInicio)
  for (const p of cuerpo) empujar(p)
  empujar(codoFin)
  empujar(fin)
  return out.length >= 2 ? out : [inicio, fin]
}

/**
 * Rutea de `from` a `to` esquivando los obstaculos.
 * Devuelve null si no hay camino: el llamador decide (dejar la recta, avisar).
 * Nunca devuelve una ruta que atraviesa algo y finge que esta bien.
 */
export function routeOrthogonal(
  from: Obstacle, to: Obstacle, obstacles: Obstacle[], options: RouteOptions = {},
): Point[] | null {
  const o = { ...DEFAULTS, ...options }
  const exempt = new Set([from.id, to.id])
  const indice = construirIndice(obstacles, o.clearance, exempt)

  const start = anchorOn(from, { x: to.x + to.width / 2, y: to.y + to.height / 2 }, o.clearance)
  const goal = anchorOn(to, { x: from.x + from.width / 2, y: from.y + from.height / 2 }, o.clearance)

  // Corredores: las lineas que de verdad importan. Los huecos ENTRE cajas son
  // los pasillos, y sus centros son por donde pasa una ruta limpia.
  const xs: number[] = [start.x, goal.x]
  const ys: number[] = [start.y, goal.y]
  for (const ob of obstacles) {
    xs.push(ob.x - o.clearance, ob.x + ob.width + o.clearance, ob.x + ob.width / 2)
    ys.push(ob.y - o.clearance, ob.y + ob.height + o.clearance, ob.y + ob.height / 2)
  }
  const gx = uniqSorted(xs), gy = uniqSorted(ys)
  const midpoints = (arr: number[]) => {
    const out = [...arr]
    for (let i = 0; i + 1 < arr.length; i++) out.push(Math.round((arr[i] + arr[i + 1]) / 2))
    return uniqSorted(out)
  }
  const gridX = midpoints(gx), gridY = midpoints(gy)

  const idx = (xi: number, yi: number) => yi * gridX.length + xi
  const xiOf = (v: number) => gridX.indexOf(v)
  const yiOf = (v: number) => gridY.indexOf(v)
  const sx = xiOf(start.x), sy = yiOf(start.y)
  const tx = xiOf(goal.x), ty = yiOf(goal.y)
  if (sx < 0 || sy < 0 || tx < 0 || ty < 0) return null

  /*
   * ⚠️ BASE 5, NO DOS BITS. Encontrado el 20 ago 2026 portando el router a
   * Swift, con una prueba que exige que cada tramo sea horizontal o vertical.
   *
   * `dir` va de 0 a 4 (ninguna + las cuatro) y 4 NO CABE en dos bits: `| 4` se
   * derrama al bit siguiente y devuelve la llave del nodo SIGUIENTE. Dos
   * casillas distintas comparten entrada en `gScore` y en `cameFrom`, y la
   * reconstruccion salta entre caminos que no se tocan.
   *
   * No se ve como un fallo: se ve como una ruta FEA — una polilinea diagonal
   * que retrocede sobre si misma. Medido en un caso de tres cajas: cuatro
   * puntos de zigzag donde la ruta limpia tiene dos codos.
   */
  const key = (xi: number, yi: number, dir: number) => idx(xi, yi) * 5 + dir
  const gScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const h = (xi: number, yi: number) => Math.abs(gridX[xi] - goal.x) + Math.abs(gridY[yi] - goal.y)

  type Item = { xi: number; yi: number; dir: number; f: number }
  const open = new ColaMin<Item>()
  open.push({ xi: sx, yi: sy, dir: 0, f: h(sx, sy) })
  gScore.set(key(sx, sy, 0), 0)
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  let explored = 0

  while (open.length > 0) {
    if (++explored > o.maxNodes) return null
    const cur = open.pop()
    if (cur.xi === tx && cur.yi === ty) {
      // Reconstruir y colapsar los puntos colineales.
      const path: Point[] = []
      let k = key(cur.xi, cur.yi, cur.dir)
      while (k !== undefined) {
        const node = Math.floor(k / 5)
        path.push({ x: gridX[node % gridX.length], y: gridY[Math.floor(node / gridX.length)] })
        const prev = cameFrom.get(k)
        if (prev === undefined) break
        k = prev
      }
      path.reverse()
      const simple: Point[] = []
      for (const p of path) {
        const n = simple.length
        if (n >= 2) {
          const a = simple[n - 2], b = simple[n - 1]
          const colineal = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)
          if (colineal) { simple[n - 1] = p; continue }
        }
        if (n === 0 || simple[n - 1].x !== p.x || simple[n - 1].y !== p.y) simple.push(p)
      }
      // Se cose por los PUERTOS del borde, no por los centros.
      //
      // Un critico ciego lo nombro exactamente: las flechas "no anclan en un
      // punto consistente del borde de la caja, se sienten trazadas
      // centro-a-centro a mano alzada". Coser por el centro deja el arranque de
      // la flecha ENTERRADO bajo la tarjeta y su angulo de salida arbitrario.
      // El puerto es el punto del borde hacia el destino: sale limpio y
      // perpendicular, como en cualquier herramienta seria.
      return [start, ...simple, goal]
    }

    const curKey = key(cur.xi, cur.yi, cur.dir)
    const curG = gScore.get(curKey) ?? Infinity
    for (let di = 0; di < 4; di++) {
      const [dx, dy] = DIRS[di]
      const nx = cur.xi + dx, ny = cur.yi + dy
      if (nx < 0 || ny < 0 || nx >= gridX.length || ny >= gridY.length) continue
      const a = { x: gridX[cur.xi], y: gridY[cur.yi] }
      const b = { x: gridX[nx], y: gridY[ny] }
      if (blocked(b, indice)) continue
      if (segmentBlocked(a, b, indice)) continue
      const dir = di + 1
      const cost = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
        + (cur.dir !== 0 && cur.dir !== dir ? o.turnPenalty : 0)
      const nk = key(nx, ny, dir)
      const tentative = curG + cost
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentative)
        cameFrom.set(nk, curKey)
        open.push({ xi: nx, yi: ny, dir, f: tentative + h(nx, ny) })
      }
    }
  }
  return null
}
