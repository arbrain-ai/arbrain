/**
 * Scroll medido por accesibilidad para apps de escritorio que no son navegador (25 nov 2026).
 *
 * Caso real: WhatsApp para Mac (26.x) es una app Catalyst (UIKit de iPad adaptada a Mac). Lo mismo pasa en otras apps
 * Catalyst y en cualquier lista que no expone una barra de desplazamiento por accesibilidad.
 *   1. `actuar scroll` (Motor.desplazar) busca una AXScrollArea con barra para moverla por AX. El hilo de mensajes es un
 *      AXGroup sin barra, así que cae a la rueda por proceso (`Puntero.rueda`: `postToPid`, en líneas, sin ventana).
 *      Catalyst la ignora: no se mueve nada y la respuesta dice `sin_verificar`.
 *   2. La herramienta `rueda` (Pluma.rueda, SkyLight a la ventana) SÍ mueve la lista: positivo = el contenido baja y se
 *      ve lo de arriba (en WhatsApp llega doble: 120 px → ~240 pt). Pero su comprobación por imagen (`Firma.franja` +
 *      `Firma.desplazamiento`, que con dy > 0 espera que el contenido SUBA) dice ✗; la cascada manda entonces Av Pág /
 *      Re Pág y AXScrollToVisible, que lo regresan o lo mueven al azar, y responde `fallo` aunque sí se movió.
 *      Aquí se mide en el sentido que describe la herramienta («positivo = bajar el contenido»); si una app lo mueve al
 *      revés, no se confirma y sigue la cascada de siempre.
 *   3. Las listas virtuales reciclan sus celdas: el mismo ref pasa a mostrar otro mensaje. Medir por ref engaña en los
 *      saltos largos; hay que medir por el TEXTO de lo que se ve.
 *
 * Arreglo (solo servidor; no hace falta recompilar ArbrainManos):
 *   - medir el desplazamiento por ACCESIBILIDAD: la y de los mismos elementos (por texto) de la columna, antes y
 *     después, como ya hace `rueda` en los navegadores;
 *   - `actuar scroll` fuera de navegadores: primero el camino de siempre; si no movió nada (medido), rueda a la
 *     ventana por SkyLight (la misma vía de fondo de `rueda`: no toca el cursor ni el teclado de la persona) en tramos
 *     medidos;
 *   - `rueda` fuera de navegadores: rueda sin la comprobación por imagen y medida por accesibilidad; si no movió, la
 *     cascada de siempre.
 * Si la app no expone al menos dos elementos con texto y posición en esa zona (lienzos, apps sin accesibilidad), todo
 * queda exactamente como antes. Navegadores, vía `hid`, horizontal y zoom con modificadores: sin cambio.
 */
import type { Objetivo, PedidoActuar, ResultadoAccion } from './contrato.js'

export interface Llamador { llamar(op: string, args?: Record<string, unknown>, tiempoMs?: number): Promise<any> }
interface Marco { x: number; y: number; w: number; h: number }
interface Nodo { ref: string; rol: string; marco?: Marco; etiqueta?: string }
export interface Lectura { pid?: number; ventana?: number; url?: string; win?: Marco; elementos: Nodo[] }

const CONTENEDORES = new Set(['AXGroup', 'AXScrollArea', 'AXList', 'AXTable', 'AXOutline', 'AXCollection', 'AXLayoutArea', 'AXWebArea'])
/** Px de rueda por unidad de `cantidad` (WhatsApp los recibe dobles: 3 → 240 pt, ~30 % de una ventana de 800). */
export const PX_POR_CANTIDAD = 40
const ESPERA_MS = 280

const dentro = (m: Marco, x: number, y: number) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h

async function leer(c: Llamador, obj: Objetivo): Promise<Lectura> {
  const r = await c.llamar('observar', { ...obj, max_elementos: 400 }, 30_000)
  const elementos: Nodo[] = (r.elementos ?? []).map((e: any) => ({ ref: e.ref, rol: e.rol, marco: e.marco, etiqueta: e.etiqueta }))
  const win = elementos.find(e => e.rol === 'AXWindow' && e.marco)?.marco
  return { pid: r.pid, ventana: r.ventana, url: r.url, win, elementos }
}

/** La zona que se desplaza: el contenedor más chico que contiene el punto y ocupa al menos el 40 % del alto de la ventana. */
export function zonaEn(l: Lectura, punto: { x: number; y: number }, ref?: string): { zona: Marco; ref?: string } | null {
  if (!l.win) return null
  const minAlto = l.win.h * 0.4
  const propio = ref ? l.elementos.find(e => e.ref === ref && e.marco) : undefined
  if (propio?.marco && CONTENEDORES.has(propio.rol) && propio.marco.h >= minAlto) return { zona: propio.marco, ref: propio.ref }
  const candidatos = l.elementos.filter(e => e.marco && CONTENEDORES.has(e.rol) && e.marco.h >= minAlto && e.marco.w < l.win!.w * 0.98 && dentro(e.marco, punto.x, punto.y))
  candidatos.sort((a, b) => a.marco!.w * a.marco!.h - b.marco!.w * b.marco!.h)
  if (candidatos[0]) return { zona: candidatos[0].marco!, ref: candidatos[0].ref }
  // Sin contenedor: la columna del punto en toda la ventana.
  const ancho = Math.max(120, l.win.w * 0.3)
  return { zona: { x: punto.x - ancho / 2, y: l.win.y, w: ancho, h: l.win.h } }
}

/**
 * y de cada elemento de la zona que está entero a la vista (los que se cortan en el borde no cuentan), por su TEXTO:
 * las listas virtuales reciclan las celdas y un mismo ref pasa a mostrar otro contenido (un salto largo hacia arriba
 * se leía «al revés»). Sin texto, o con texto repetido en la zona, no cuenta.
 */
export function posiciones(l: Lectura, zona: Marco, sinRef?: string): Map<string, number> {
  const r = new Map<string, number>()
  const repetidos = new Set<string>()
  for (const e of l.elementos) {
    const clave = e.etiqueta?.trim() ? `${e.rol}|${e.etiqueta.trim()}` : ''
    if (!clave) continue
    const m = e.marco
    if (!m || e.ref === sinRef || e.rol === 'AXWindow' || m.h <= 2 || m.h >= zona.h * 0.9) continue
    const cx = m.x + m.w / 2
    if (cx < zona.x || cx > zona.x + zona.w) continue
    if (m.y <= zona.y + 2 || m.y + m.h >= zona.y + zona.h - 2) continue
    if (r.has(clave)) repetidos.add(clave)
    r.set(clave, m.y)
  }
  for (const k of repetidos) r.delete(k)
  return r
}

/** Cuánto bajó el contenido (positivo = bajó, se ve lo de arriba). NaN = lo visible se reemplazó entero (salto largo). null = no se movió. */
export function medir(antes: Map<string, number>, despues: Map<string, number>): number | null {
  const comunes = [...antes.keys()].filter(k => despues.has(k))
  const saltos = comunes.map(k => despues.get(k)! - antes.get(k)!).filter(d => Math.abs(d) >= 8).sort((a, b) => a - b)
  if (saltos.length >= 2 || (saltos.length === 1 && comunes.length <= 2)) return saltos[Math.floor(saltos.length / 2)]
  const nuevos = [...despues.keys()].filter(k => !antes.has(k)).length
  if (saltos.length === 0 && nuevos >= 3 && comunes.length <= Math.max(1, antes.size * 0.25)) return Number.NaN
  return null
}

const enSentido = (d: number | null, dy: number) => d !== null && (Number.isNaN(d) || (d > 0) === (dy > 0))
const textoMovido = (d: number, dy: number) => Number.isNaN(d)
  ? `lo visible cambió entero (salto largo hacia ${dy > 0 ? 'arriba' : 'abajo'})`
  : `el contenido se movió ${Math.round(Math.abs(d))} pt (${d > 0 ? 'se ve lo de arriba' : 'se ve lo de abajo'})`

async function esperar(ms: number) { await new Promise(r => setTimeout(r, ms)) }

export interface Viaje { movido: boolean; pt: number; aproximado: boolean; tramos: number; alReves?: number; via?: string; cursor?: { cursor_movido_por?: string; cursor_real_movido?: boolean } }

/**
 * Rueda a la ventana por SkyLight (de fondo: el cursor y el teclado de la persona no se tocan) en TRAMOS de a lo más
 * ~55 % del alto de la zona, cada uno medido por accesibilidad: un salto más largo que la ventana no deja nada en
 * común con qué comparar. El primer tramo calibra cuántos pt mueve cada px (WhatsApp: 2). Si un tramo no mueve nada se
 * espera y se reenvía (ver `quietos`); si sigue quieto, se para: ahí está el principio (o el final) de lo cargado.
 */
export async function ruedaPorTramos(c: Llamador, objV: Objetivo & { ventana: number }, l0: Lectura, zona: Marco, sinRef: string | undefined,
  dy: number, extra: Record<string, unknown> = {}): Promise<Viaje> {
  const win = l0.win!
  const x = zona.x + zona.w / 2 - win.x, y = zona.y + zona.h / 2 - win.y
  const s = Math.sign(dy)
  let restante = Math.abs(dy), razon = 0, pt = 0, aproximado = false, tramos = 0, via: string | undefined
  // Lo que el cursor real vivió en el peor tramo (cada tramo lo reporta; «nadie» es lo normal por fondo).
  const cursor: NonNullable<Viaje['cursor']> = {}
  let antes = posiciones(l0, zona, sinRef)
  // Tramos seguidos sin moverse. El primero a veces se pierde (medido dos veces en WhatsApp: «no se movió» y a la
  // tercera sí, sin cambiar nada): se reenvía hasta 3 veces; si ya venía moviéndose y se queda quieto 2, es el borde.
  let quietos = 0
  while (restante > 0 && tramos < 18) {
    const tope = razon > 0 ? Math.floor(zona.h * 0.55 / razon) : 120
    const px = Math.max(20, Math.min(restante, tope))
    const r = await c.llamar('rueda', { ...extra, ...objV, x, y, dy: s * px, pasos: Math.max(3, Math.min(30, Math.round(px / 30))), verificar: false }, 30_000)
    via ??= r?.via
    if (r?.cursor_movido_por && (cursor.cursor_movido_por == null || cursor.cursor_movido_por === 'nadie')) cursor.cursor_movido_por = r.cursor_movido_por
    if (r?.cursor_real_movido != null) cursor.cursor_real_movido = !!cursor.cursor_real_movido || !!r.cursor_real_movido
    tramos++
    await esperar(ESPERA_MS)
    let despues = posiciones(await leer(c, objV), zona, sinRef)
    let d = medir(antes, despues)
    if (d === null) {
      // ¿Llegó tarde? (Las listas también cargan lo anterior al llegar arriba.)
      await esperar(quietos === 0 ? 400 : 1_000)
      despues = posiciones(await leer(c, objV), zona, sinRef)
      d = medir(antes, despues)
      if (d === null) {
        quietos++
        if (quietos >= 3 || (pt > 0 && quietos >= 2)) break
        continue // se reenvía el mismo tramo
      }
    }
    quietos = 0
    if (!enSentido(d, dy)) return { movido: pt > 0, pt: Math.round(pt), aproximado, tramos, alReves: Number.isNaN(d) ? 0 : d, via, cursor }
    if (Number.isNaN(d)) { aproximado = true; pt += px * (razon || 1) } else { razon = Math.abs(d) / px; pt += Math.abs(d) }
    antes = despues; restante -= px
  }
  return { movido: pt > 0 || aproximado, pt: Math.round(pt), aproximado, tramos, via, cursor }
}

const resumen = (v: Viaje, dy: number) => `${v.aproximado ? 'unos ' : ''}${v.pt} pt hacia ${dy > 0 ? 'arriba' : 'abajo'} en ${v.tramos} tramo(s)`

/**
 * `actuar scroll` medido. null = no aplica (vía hid, horizontal, navegador o nada medible): el adaptador sigue como antes.
 * `nativo` es la llamada de siempre a ArbrainManos. `cantidad` × 40 px de rueda (WhatsApp: × 80 pt; 10 ≈ una ventana).
 */
export async function scrollEnActuar(c: Llamador, obj: Objetivo, p: PedidoActuar, nativo: () => Promise<any>): Promise<ResultadoAccion | null> {
  if (p.accion !== 'scroll' || (p as any).via === 'hid' || (p as any).hid) return null
  const dir = p.direccion ?? 'abajo'
  if (dir !== 'arriba' && dir !== 'abajo') return null
  let l0: Lectura
  try { l0 = await leer(c, obj) } catch { return null }
  if (l0.url || !l0.win || l0.ventana == null) return null
  const refMarco = p.ref ? l0.elementos.find(e => e.ref === p.ref)?.marco : undefined
  const punto = refMarco ? { x: refMarco.x + refMarco.w / 2, y: refMarco.y + refMarco.h / 2 } : { x: l0.win.x + l0.win.w / 2, y: l0.win.y + l0.win.h / 2 }
  const z = zonaEn(l0, punto, p.ref)
  if (!z) return null
  const pos0 = posiciones(l0, z.zona, z.ref)
  if (pos0.size < 2) return null
  const dy = (dir === 'arriba' ? 1 : -1) * Math.max(1, Math.min(50, p.cantidad ?? 3)) * PX_POR_CANTIDAD
  const objV = { ...obj, ventana: l0.ventana }

  // 1. El camino de siempre (barra por accesibilidad o rueda por proceso).
  const r1 = await nativo()
  if (r1?.efecto === 'confirmado') return { ok: true, efecto: 'confirmado', detalle: r1.detalle }
  await esperar(ESPERA_MS)
  const l1 = await leer(c, objV)
  const d1 = medir(pos0, posiciones(l1, z.zona, z.ref))
  if (enSentido(d1, dy)) return { ok: true, efecto: 'confirmado', detalle: `${r1?.detalle ?? 'rueda'}: ${textoMovido(d1!, dy)}` }

  // 2. Rueda a la ventana por tramos medidos.
  let v: Viaje
  try { v = await ruedaPorTramos(c, objV, { ...l1, win: l1.win ?? l0.win }, z.zona, z.ref, dy) } catch (e) {
    return { ok: false, efecto: 'fallo', detalle: `${r1?.detalle ?? 'rueda por proceso'} no movió nada y la rueda a la ventana falló: ${(e as Error).message}` }
  }
  if (v.alReves !== undefined && !v.movido) return { ok: false, efecto: 'fallo', detalle: `la rueda movió el contenido al revés de lo pedido (${Math.round(v.alReves)} pt); vuelve a observar` }
  if (v.movido) return { ok: true, efecto: 'confirmado', detalle: `rueda a la ventana (la rueda por proceso no movió nada): ${resumen(v, dy)}. Vuelve a observar para leer.` }
  return { ok: false, efecto: 'fallo', detalle: `no se movió nada (medido por accesibilidad, con 3 intentos y esperas): ya está ${dir === 'arriba' ? 'al principio de lo cargado' : 'al final'}, o la app no acepta la rueda; mira con ojos` }
}

/** La herramienta `rueda` medida por accesibilidad fuera de navegadores. null = no aplica o no movió: la cascada de siempre. */
export async function ruedaMedida(c: Llamador, a: Record<string, any>): Promise<Record<string, any> | null> {
  const dy = Number(a.dy ?? 0)
  if (!dy || a.verificar === false || (Array.isArray(a.modificadores) && a.modificadores.length) || a.via === 'hid' || a.lineas === true) return null
  const obj: Objetivo = { ...(a.app ? { app: a.app } : {}), ...(a.pid ? { pid: a.pid } : {}), ...(a.ventana ? { ventana: a.ventana } : {}) }
  let l0: Lectura
  try { l0 = await leer(c, obj) } catch { return null }
  if (l0.url || !l0.win || l0.ventana == null) return null
  const local = typeof a.x === 'number' && typeof a.y === 'number' ? { x: a.x, y: a.y } : { x: l0.win.w / 2, y: l0.win.h / 2 }
  const z = zonaEn(l0, { x: l0.win.x + local.x, y: l0.win.y + local.y })
  if (!z) return null
  if (posiciones(l0, z.zona, z.ref).size < 2) return null
  const { dy: _dy, x: _x, y: _y, pasos: _p, ventana: _v, app: _a, pid: _pid, ...extra } = a
  const v = await ruedaPorTramos(c, { ...obj, ventana: l0.ventana }, l0, z.zona, z.ref, dy, extra)
  if (!v.movido) return null
  return { ...v.cursor, via: v.via ?? 'fondo', desplazado: true, efecto: 'confirmado', via_scroll: 'rueda', cambio_visual: v.pt, desplazado_pt: v.pt,
    punto: { x: z.zona.x + z.zona.w / 2 - l0.win.x, y: z.zona.y + z.zona.h / 2 - l0.win.y },
    intentos: [`rueda ${v.via ?? 'fondo'} ✓ (medida por accesibilidad: ${resumen(v, dy)})`] }
}
