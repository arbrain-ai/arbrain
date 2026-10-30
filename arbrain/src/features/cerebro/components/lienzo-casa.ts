// Piezas compartidas por los dos lienzos del cerebro (5 oct 2026, Taller › Memoria · «Ver tu cerebro»), en el
// lenguaje de la casa (docs/lenguaje-de-movimiento.md):
//  · Paleta: oro solo para «el ahora» (lo que cambió en 48 h); lo demás, morado de marca o neutro. El 2D lee el tema
//    (claro u oscuro, tokens de globals.css); la 3D es un planetario oscuro siempre y usa TYPE_META tal cual.
//  · Forma por familia: memoria = círculo, skill = rombo, documento = cuadro. Así se lee sin depender del color.
//  · Entrada una sola vez: las neuronas se encienden escalonadas (los hubs primero) la primera vez que se abre en la
//    sesión; una relectura o volver a la pestaña no vuelve a animar. Quieto con «reducir movimiento».
import { prefiereQuieto } from '@/shared/movimiento'
import type { CerebroNode, CerebroNodeType } from '../types'
import { TYPE_META } from '../types'

export type Forma = 'circulo' | 'rombo' | 'cuadro'
export const formaDe = (t: CerebroNodeType): Forma => TYPE_META[t].forma

/** Traza (sin pintar) la forma de un nodo de radio `r`. El rombo y el cuadro se compensan para pesar lo mismo que el círculo. */
export function trazarForma(ctx: CanvasRenderingContext2D, forma: Forma, x: number, y: number, r: number) {
  ctx.beginPath()
  if (forma === 'rombo') {
    const d = r * 1.25
    ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath()
  } else if (forma === 'cuadro') {
    const l = r * 0.9, k = Math.min(l * 0.35, 3)
    ctx.roundRect(x - l, y - l, l * 2, l * 2, k)
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
}

export interface PaletaLienzo {
  oscuro: boolean
  fondo: string
  texto: string
  textoTenue: string
  /** Halo detrás de las etiquetas: el fondo, para que se lean sobre las aristas. */
  halo: string
  arista: string
  aristaTenue: string
  /** Arista y anillo de lo enfocado: morado de marca. */
  marca: string
  marcaSuave: string
  oro: string
  tipos: Record<CerebroNodeType, string>
}

// Tema claro: los mismos papeles con más tinta, para que se lean sobre #f4f4f5.
export const TIPOS_CLARO: Record<CerebroNodeType, string> = {
  user: '#8C27F1', project: '#683ACC', feedback: '#9F7AEA', reference: '#A397C9',
  skill: '#3F3F46', documento: '#8A8A93', concept: '#A1A1AA', connection: '#C4C4CC',
}

/** Lee la paleta del tema vigente desde los tokens CSS del elemento. */
export function leerPaleta(el: Element): PaletaLienzo {
  const cs = getComputedStyle(el)
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  const oscuro = document.documentElement.classList.contains('dark')
  const gold = v('--gold-rgb', '255, 145, 1')
  const brand = v('--primary-rgb', oscuro ? '139, 92, 246' : '104, 58, 204')
  const fondo = v('--background', oscuro ? '#09090b' : '#f4f4f5')
  return {
    oscuro,
    fondo,
    texto: v('--foreground', oscuro ? '#f7f8f8' : '#0f172a'),
    textoTenue: v('--muted', oscuro ? '#a1a1aa' : '#64748b'),
    halo: fondo,
    arista: oscuro ? 'rgba(161,161,170,0.17)' : 'rgba(63,63,70,0.16)',
    aristaTenue: oscuro ? 'rgba(161,161,170,0.05)' : 'rgba(63,63,70,0.05)',
    marca: `rgba(${brand}, 0.9)`,
    marcaSuave: `rgba(${brand}, 0.18)`,
    oro: `rgba(${gold}, 0.95)`,
    tipos: oscuro ? Object.fromEntries(Object.entries(TYPE_META).map(([k, m]) => [k, m.color])) as Record<CerebroNodeType, string> : TIPOS_CLARO,
  }
}

/** Escucha el cambio de tema (la clase `dark` en <html>). */
export function alCambiarTema(fn: () => void): () => void {
  const mo = new MutationObserver(fn)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => mo.disconnect()
}

// ── Entrada una sola vez ──────────────────────────────────────────────────────
const yaEntraron = new Set<string>()
const PASO_MS = 45, ENTRADA_MS = 560, ESCALONES = 14

/** Marca de nacimiento para un lienzo y dataset; null = ya entró (o «reducir movimiento»): se pinta quieto. */
export function nacer(clave: string): number | null {
  if (yaEntraron.has(clave) || prefiereQuieto()) { yaEntraron.add(clave); return null }
  yaEntraron.add(clave)
  return performance.now()
}

/** Escalón de cada nodo (0..14): los más conectados primero. */
export function escalones(nodos: CerebroNode[]): Map<string, number> {
  const orden = [...nodos].sort((a, b) => b.degree - a.degree)
  const por = Math.max(1, Math.ceil(orden.length / (ESCALONES + 1)))
  return new Map(orden.map((n, i) => [n.id, Math.min(ESCALONES, Math.floor(i / por))]))
}

/** 0..1 de la entrada de un nodo (ease-out expo, la curva de la casa). 1 si no hay entrada en curso. */
export function entrada(nacio: number | null, escalon: number, ahora = performance.now()): number {
  if (nacio == null) return 1
  const p = Math.min(1, Math.max(0, (ahora - nacio - escalon * PASO_MS) / ENTRADA_MS))
  return p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
}

/** Búsqueda: título, ruta, etiquetas y la descripción curada del índice. */
export function coincide(n: CerebroNode, q: string): boolean {
  return n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) ||
    n.tags.some((t) => t.toLowerCase().includes(q)) || (n.description?.toLowerCase().includes(q) ?? false)
}
