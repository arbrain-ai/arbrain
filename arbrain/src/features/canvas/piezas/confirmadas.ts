/**
 * Lienzo · lo que el HOST de piezas confirmó (17 nov 2026). Puro: `tests/canvas/piezas-confirmadas.test.ts`.
 *
 * Bug: con la máquina cargada, una viva se veía con la colocación de una cámara anterior (más grande y corrida), un marco
 * quedaba vacío (ni viva ni póster) y las vivas se dormían y despertaban con la cámara quieta. Tres invariantes:
 *
 *   1. Una viva solo QUITA su póster cuando el host confirmó (`colocado`) el pedido VIGENTE con ella dentro y medida a
 *      menos de 1 px de su caja. Hasta entonces, póster.
 *   2. Cualquier cosa que cambie la caja de pantalla (cámara o tamaño de la vista) invalida lo confirmado: el host se
 *      oculta y todo vuelve a póster. Una confirmación que llega tarde, de un pedido anterior, no muestra nada.
 *   3. El presupuesto de vivas solo baja dentro de una página (nunca sube con la cámara quieta) y solo con una medida
 *      tomada con el host visible y confirmado. Pedir la misma colocación otra vez no manda nada (sin parpadeo).
 */

import { worldToScreen, type Viewport } from '../render/viewport'

/** La caja de pantalla de una pieza viva: traslado y escala desde su ancho lógico. */
export function colocacion(caja: { x: number; y: number; width: number }, ficha: { ancho: number }, cam: { x: number; y: number; zoom: number }, vp: Viewport) {
  const tl = worldToScreen({ x: caja.x, y: caja.y }, cam, vp)
  return { x: Math.round(tl.x * 100) / 100, y: Math.round(tl.y * 100) / 100, escala: (caja.width * cam.zoom) / ficha.ancho }
}

/**
 * La ESCALA del host (17 nov 2026, la causa raíz): cuántos px del lienzo (layout) vale un px del host. Con el zoom de
 * interfaz de la app (`mc-ui-zoom`, `zoom` de CSS en <html>), WebKit escala el contenido del iframe: su ventana interna
 * mide `ancho del lienzo / 1.2` y una viva colocada en px del lienzo salía 1.2 veces más grande y corrida. Se calibra con
 * lo que el host MIDE de sí mismo (no con --ui-zoom): vale en cualquier motor y cualquier nivel. 1 si no hay medida.
 */
export function escalaDelHost(anchoLienzo: number, anchoHost: number | null | undefined, uiZoom = 1): number {
  // Lo esperado por construcción (el host va neutralizado con 1/--ui-zoom y su tamaño × --ui-zoom): k = 1/--ui-zoom, exacto.
  // `innerWidth` es entero (a zoom 1.5, 0.05 % de error: más de 1 px en una pantalla de 2048): solo confirma o corrige.
  const esperada = uiZoom > 0 ? 1 / uiZoom : 1
  if (!anchoHost || !(anchoHost > 0) || !(anchoLienzo > 0)) return esperada
  const k = anchoLienzo / anchoHost
  return Math.abs(k / esperada - 1) < 0.01 ? esperada : k
}
/** El zoom de interfaz vigente (`--ui-zoom` en <html>, ZoomController); 1 sin él. */
export function zoomDeInterfaz(): number {
  if (typeof document === 'undefined') return 1
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom'))
  return Number.isFinite(z) && z > 0 ? z : 1
}
/** Una colocación en px del lienzo → en px del host. */
export function aHost(c: Colocacion, k: number): Colocacion {
  return k === 1 ? c : { id: c.id, x: Math.round((c.x / k) * 100) / 100, y: Math.round((c.y / k) * 100) / 100, escala: c.escala / k }
}
/** Una medida del host → en px del lienzo. */
export function deHost(m: Medida, k: number): Medida {
  return k === 1 ? m : { id: m.id, x: m.x * k, y: m.y * k, ancho: m.ancho * k }
}

export interface Colocacion { id: string; x: number; y: number; escala: number }
/** Lo que el host mide de cada viva tras colocarla (getBoundingClientRect de su raíz, en px del host). */
export interface Medida { id: string; x: number; y: number; ancho: number }

/** Tolerancia del invariante: a menos de 1 px de su caja. */
export const TOLERANCIA_PX = 1

export function mismaColocacion(a: readonly Colocacion[], b: readonly Colocacion[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i]
    if (x.id !== y.id || Math.abs(x.x - y.x) > 0.01 || Math.abs(x.y - y.y) > 0.01 || Math.abs(x.escala - y.escala) > 1e-6) return false
  }
  return true
}

/** ¿La medida del host cae a menos de 1 px de lo pedido? (ancho lógico × escala = ancho en pantalla). */
export function medidaFiel(pedida: readonly Colocacion[], medidas: readonly Medida[] | undefined, anchos: (id: string) => number | undefined): string[] {
  const malas: string[] = []
  if (!medidas) return malas   // un host anterior que no mide: se confía en el pedido
  for (const c of pedida) {
    const m = medidas.find(x => x.id === c.id), w = anchos(c.id)
    if (!m || w == null) { malas.push(c.id); continue }
    if (Math.abs(m.x - c.x) >= TOLERANCIA_PX || Math.abs(m.y - c.y) >= TOLERANCIA_PX || Math.abs(m.ancho - w * c.escala) >= TOLERANCIA_PX) malas.push(c.id)
  }
  return malas
}

export interface Confirmadas {
  /** La cámara o la vista cambió: nada de lo confirmado vale. Devuelve si el host estaba visible (hay que ocultarlo). */
  invalidar(): boolean
  /** Una pieza se vuelve a montar en el host: su colocación hay que pedirla y confirmarla otra vez. */
  olvidar(id: string): void
  /** Nueva decisión. `null` = es la misma que la vigente: no se manda nada. Si cambia, devuelve el pedido a mandar. */
  pedir(lista: readonly Colocacion[], pedido: number): { pedido: number } | null
  /** El host respondió `colocado`. ¿Se puede mostrar? (pedido vigente, nada invalidado desde entonces, medida fiel) */
  confirmar(pedido: number, medidas: readonly Medida[] | undefined, anchos: (id: string) => number | undefined): { mostrar: boolean; malas: string[] }
  /** ¿Esta pieza está viva Y confirmada en pantalla? Solo entonces el lienzo puede quitar su póster. */
  confirmada(id: string): boolean
  visible(): boolean
  /** Las ids pedidas en el pedido vigente. */
  pedidas(): string[]
}

export function crearConfirmadas(): Confirmadas {
  let vigente = 0
  let pedida: Colocacion[] = []
  let enviada = false
  let confirmadas = new Set<string>()
  let visible = false
  return {
    invalidar() {
      const habia = visible
      visible = false
      confirmadas = new Set()
      pedida = []
      enviada = false
      return habia
    },
    olvidar(id) {
      confirmadas.delete(id)
      if (pedida.some(c => c.id === id)) enviada = false
    },
    pedir(lista, pedido) {
      if (enviada && mismaColocacion(lista, pedida)) return null
      // Lo que sale del pedido nuevo vuelve a póster al instante; lo que entra espera su confirmación.
      const ids = new Set(lista.map(c => c.id))
      confirmadas = new Set([...confirmadas].filter(id => ids.has(id) && pedida.some(c => c.id === id && mismaColocacion([c], [lista.find(z => z.id === id)!]))))
      pedida = lista.map(c => ({ ...c }))
      vigente = pedido
      enviada = true
      if (!lista.length) visible = false
      return { pedido }
    },
    confirmar(pedido, medidas, anchos) {
      if (pedido !== vigente || !enviada || !pedida.length) return { mostrar: false, malas: [] }
      const malas = medidaFiel(pedida, medidas, anchos)
      if (malas.length) { visible = false; confirmadas = new Set(); enviada = false; return { mostrar: false, malas } }
      confirmadas = new Set(pedida.map(c => c.id))
      visible = true
      return { mostrar: true, malas }
    },
    confirmada: id => visible && confirmadas.has(id),
    visible: () => visible,
    pedidas: () => pedida.map(c => c.id),
  }
}

/** El presupuesto de vivas: baja una si el host, visible y confirmado, no llega al ritmo. Nunca sube aquí. */
export function siguientePresupuesto(actual: number, r: { fps: number; vivas: number; minimo: number; confirmado: boolean }): number {
  if (!r.confirmado || !(r.fps < r.minimo) || r.vivas <= 1) return actual
  return Math.max(1, Math.min(actual, r.vivas - 1))
}
