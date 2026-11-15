/**
 * Mapa v16 · el DIBUJO LIGERO de las islas nativas (14 nov 2026): lo que el lienzo pinta en el canvas mientras la cámara se
 * mueve o la isla está lejos. Mismas cajas que el componente vivo (`modelo.ts`), los mismos datos vivos (el almacén) y la
 * misma paleta que las variables de la app (globals.css), en vector: nítido a cualquier zoom y barato a 60 fps (unas
 * decenas de llamadas por isla, texto partido en renglones con caché). Sin animación: al despertar, el componente vivo
 * aparece encima en el mismo sitio.
 *
 * Un tipo nuevo de bloque registra aquí su `pintar` con el mismo nombre que su esquema y su componente.
 */
import { ORGANO } from '@/features/negocio/pulso'
import type { LecturaFuente } from '../fuentes'
import type { IslaLista } from '../modelo'
import { serieDe } from '../modelo'
import { campo, llenar, type Caja } from '../receta'
import type { BotonP, PropsDe, TipoBloque } from './esquemas'
import { pintarIslas } from '@/features/mapa/pintar'
import { datosDelCartel, formaCartel, pintarCartel } from './cartel'

export interface PaletaIsla {
  arriba: string; abajo: string; borde: string; texto: string; muted: string; tinta: string; brand: string; oro: string; dolor: string; card: string
}
/** Las mismas que `--placa-*`, `--foreground`, `--muted`, `--brand`, `--gold` de la app (globals.css y bi.module.css). */
export const PALETAS: Record<'claro' | 'oscuro', PaletaIsla> = {
  claro: { arriba: '#ffffff', abajo: '#f6f6f8', borde: '#e4e4e7', texto: '#0f172a', muted: '#64748b', tinta: '#8C27F1', brand: '#8C27F1', oro: '#ff9101', dolor: '#e0484d', card: '#ffffff' },
  oscuro: { arriba: '#201d29', abajo: '#19171f', borde: '#2a2a30', texto: '#f7f8f8', muted: '#a1a1aa', tinta: '#c4a1ff', brand: '#8C27F1', oro: '#ffac3d', dolor: '#f0676b', card: '#16161c' },
}

type Leer = (f: string) => LecturaFuente | undefined
interface Pincel { ctx: CanvasRenderingContext2D; P: PaletaIsla; leer: Leer; s: number; variante: IslaLista['receta']['variante'] }

let SANS = 'system-ui, -apple-system, sans-serif'
const SERIF = "ui-serif, 'New York', 'Iowan Old Style', Georgia, serif"
let resuelta = false
function letras() {
  if (resuelta || typeof document === 'undefined') return
  resuelta = true
  try { const f = getComputedStyle(document.body).fontFamily; if (f) SANS = f } catch { /* sin documento */ }
}

const renglones = new Map<string, string[]>()
/** El texto partido en renglones a ese ancho (con caché: el mismo texto no se vuelve a medir cada cuadro). */
function partir(ctx: CanvasRenderingContext2D, t: string, w: number): string[] {
  const k = `${ctx.font}|${Math.round(w)}|${t}`
  const ya = renglones.get(k)
  if (ya) return ya
  const out: string[] = []
  for (const parrafo of t.split('\n')) {
    let linea = ''
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (ctx.measureText(prueba).width <= w || !linea) linea = prueba
      else { out.push(linea); linea = palabra }
    }
    out.push(linea)
  }
  if (renglones.size > 3000) renglones.clear()
  renglones.set(k, out)
  return out
}

/** Escribe un bloque de texto en su caja: renglones, con elipsis si no cabe; de muy lejos, barras (greeking). */
function escribir(pc: Pincel, t: string, x: number, y: number, w: number, maxH: number, tam: number, font: string, color: string, alto = 1.3, alinear: 'izq' | 'centro' | 'der' = 'izq'): number {
  const { ctx } = pc
  if (!t) return 0
  ctx.font = font
  const lh = tam * alto
  const lineas = partir(ctx, t, w)
  const caben = Math.max(1, Math.floor(maxH / lh))
  const usadas = lineas.slice(0, caben)
  if (lineas.length > caben) usadas[caben - 1] = usadas[caben - 1].replace(/\s*\S*$/, '') + '…'
  const ax = alinear === 'centro' ? x + w / 2 : alinear === 'der' ? x + w : x
  if (tam * pc.s < 4.5) {
    ctx.fillStyle = color
    ctx.globalAlpha *= 0.35
    usadas.forEach((l, i) => {
      const lw = Math.min(w, ctx.measureText(l).width)
      const lx = alinear === 'centro' ? x + (w - lw) / 2 : alinear === 'der' ? x + w - lw : x
      ctx.fillRect(lx, y + i * lh + lh * 0.25, lw, tam * 0.55)
    })
    ctx.globalAlpha /= 0.35
    return usadas.length * lh
  }
  ctx.fillStyle = color
  ctx.textAlign = alinear === 'centro' ? 'center' : alinear === 'der' ? 'right' : 'left'
  ctx.textBaseline = 'top'
  usadas.forEach((l, i) => ctx.fillText(l, ax, y + i * lh + (lh - tam) / 2))
  ctx.textAlign = 'left'
  return usadas.length * lh
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, q)
  else ctx.rect(x, y, w, h)
}

const llenarT = (pc: Pincel, t: string | undefined, sin = 'sin dato') => (t ? llenar(t, pc.leer, sin) : '')
const colorCifra = (pc: Pincel, v?: string) => ((v ?? pc.variante) === 'oro' ? pc.P.oro : (v ?? pc.variante) === 'dolor' ? pc.P.dolor : pc.P.texto)
const sinTexto = (l: LecturaFuente | undefined, sin: string) => (!l || l.estado === 'leyendo' ? '…' : l.estado === 'oculto' ? 'oculto' : sin)

function boton(pc: Pincel, p: BotonP, c: Caja) {
  const { ctx, P } = pc
  const h = Math.min(c.h, 56), y = c.y + (c.h - h) / 2
  ctx.font = `680 20px ${SANS}`
  const w = Math.min(c.w, ctx.measureText(p.texto).width + 52)
  rr(ctx, c.x, y, w, h, h / 2)
  if (p.estilo === 'oro') { ctx.fillStyle = P.oro; ctx.fill() }
  else if (p.estilo === 'contorno') { ctx.fillStyle = P.arriba; ctx.fill(); ctx.strokeStyle = P.brand; ctx.globalAlpha *= 0.4; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha /= 0.4 }
  escribir(pc, p.texto, c.x, y + (h - 26) / 2, w, 26, 20, `680 20px ${SANS}`, p.estilo === 'oro' ? '#1a0f00' : p.estilo === 'fantasma' ? P.tinta : P.texto, 1.3, 'centro')
}

type Pintor<T extends TipoBloque> = (pc: Pincel, p: PropsDe[T], c: Caja, variante?: string) => void

export const PINTORES: { [T in TipoBloque]: Pintor<T> } = {
  titulo: (pc, p, c) => {
    let y = c.y
    const al = p.alinear === 'centro' ? 'centro' : 'izq'
    const ceja = llenarT(pc, p.ceja)
    if (ceja) y += escribir(pc, ceja.toUpperCase(), c.x, y, c.w, 26, 17, `650 17px ${SANS}`, pc.P.muted, 1.4, al) + 8
    const tam = p.tamano === 'xl' ? 76 : p.tamano === 'l' ? 54 : 38
    escribir(pc, llenarT(pc, p.texto), c.x, y, c.w, c.y + c.h - y, tam, `600 ${tam}px ${SERIF}`, pc.P.texto, 1.04, al)
  },
  texto: (pc, p, c) => {
    const [tam, font, color, alto] = p.estilo === 'display' ? [40, `600 40px ${SERIF}`, pc.P.texto, 1.15] as const
      : p.estilo === 'nota' ? [20, `400 20px ${SANS}`, pc.P.muted, 1.4] as const
      : p.estilo === 'mono' ? [19, `400 19px ui-monospace, Menlo, monospace`, pc.P.muted, 1.5] as const
      : [24, `400 24px ${SANS}`, pc.P.texto, 1.45] as const
    escribir(pc, llenarT(pc, p.texto), c.x, c.y, c.w, c.h, tam, font, color, alto, p.alinear)
  },
  cita: (pc, p, c) => {
    pc.ctx.fillStyle = pc.P.oro
    pc.ctx.fillRect(c.x, c.y, 4, c.h)
    const h = escribir(pc, `«${llenarT(pc, p.texto)}»`, c.x + 28, c.y, c.w - 28, c.h - (p.autor ? 34 : 0), 32, `italic 400 32px ${SERIF}`, pc.P.texto, 1.32)
    if (p.autor) escribir(pc, `— ${p.autor}`, c.x + 28, c.y + h + 12, c.w - 28, 26, 18, `600 18px ${SANS}`, pc.P.muted)
  },
  numero: (pc, p, c, variante) => {
    const { ctx, P } = pc
    let y = c.y
    const etiqueta = llenarT(pc, p.etiqueta)
    if (etiqueta) y += escribir(pc, etiqueta.toUpperCase(), c.x, y, c.w, 24, 16, `700 16px ${SANS}`, P.muted, 1.4) + 8
    const l = pc.leer(p.fuente)
    const v = l?.estado === 'ok' ? campo(l.valor, p.campo) : null
    const hay = l?.estado === 'ok' && v !== null && v !== undefined && v !== ''
    if (hay) {
      const t = String(v)
      escribir(pc, t, c.x, y, c.w, 112, 112, `800 112px ${SANS}`, colorCifra(pc, variante), 0.95)
      ctx.font = `800 112px ${SANS}`
      const ancho = ctx.measureText(t).width
      const unidad = llenarT(pc, p.unidad, '')
      if (unidad) escribir(pc, unidad, c.x + ancho + 18, y + 56, Math.max(60, c.w - ancho - 18), 64, 26, `600 26px ${SANS}`, P.texto, 1.2)
      y += 112
    } else {
      escribir(pc, sinTexto(l, p.sin), c.x, y + 20, c.w, 60, 44, `italic 600 44px ${SANS}`, P.muted)
      y += 112
    }
    const detalle = llenarT(pc, p.detalle, '')
    if (detalle) y += escribir(pc, detalle, c.x, y + 12, c.w, 52, 18, `400 18px ${SANS}`, P.muted, 1.4) + 12
    if (p.tendencia) {
      const lt = pc.leer(p.tendencia.fuente)
      const serie = lt?.estado === 'ok' ? serieDe(campo(lt.valor, p.tendencia.campo)) : []
      if (serie.length > 1) {
        const h = 72, y0 = c.y + c.h - h, min = Math.min(...serie), max = Math.max(...serie), span = max - min || 1
        ctx.beginPath()
        serie.forEach((n, i) => { const x = c.x + (i / (serie.length - 1)) * c.w, yy = y0 + h - 6 - ((n - min) / span) * (h - 12); if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy) })
        ctx.strokeStyle = P.tinta; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke()
        const u = serie[serie.length - 1]
        ctx.beginPath(); ctx.arc(c.x + c.w, y0 + h - 6 - ((u - min) / span) * (h - 12), 6, 0, Math.PI * 2); ctx.fillStyle = P.oro; ctx.fill()
      }
    }
  },
  organo: (pc, p, c) => {
    const { ctx, P } = pc
    rr(ctx, c.x, c.y, c.w, c.h, 22)
    ctx.fillStyle = P.card; ctx.globalAlpha *= 0.85; ctx.fill(); ctx.globalAlpha /= 0.85
    const l = pc.leer(p.fuente)
    const pulso = (l?.estado === 'ok' || l?.estado === 'sin-dato' ? l.valor : null) as { cifra?: string; unidad?: string; detalle?: string[]; falta?: string; senal?: { tono?: string } } | null
    const dolor = pulso?.senal?.tono === 'dolor'
    ctx.strokeStyle = dolor ? P.dolor : P.borde; ctx.lineWidth = dolor ? 2 : 1; ctx.stroke()
    const conocido = (ORGANO as Record<string, { nombre: string; pregunta: string }>)[p.organo]
    const x = c.x + 28, w = c.w - 56
    let y = c.y + 26
    y += escribir(pc, p.nombre ?? conocido?.nombre ?? p.organo, x, y, w - 30, 48, 36, `600 36px ${SERIF}`, P.texto, 1.2) + 4
    ctx.beginPath(); ctx.arc(c.x + c.w - 35, c.y + 26 + 22, 7, 0, Math.PI * 2)
    ctx.fillStyle = dolor ? P.dolor : l?.estado === 'ok' ? P.brand : P.muted; ctx.fill()
    y += escribir(pc, p.pregunta ?? conocido?.pregunta ?? '', x, y, w, 30, 18, `400 18px ${SANS}`, P.muted) + 6
    if (l?.estado === 'ok' && pulso?.cifra) {
      escribir(pc, pulso.cifra, x, y, w, 84, 84, `800 84px ${SANS}`, P.oro, 0.95)
      ctx.font = `800 84px ${SANS}`
      const a = ctx.measureText(pulso.cifra).width
      if (pulso.unidad) escribir(pc, pulso.unidad, x + a + 16, y + 40, Math.max(60, w - a - 16), 56, 22, `600 22px ${SANS}`, P.texto, 1.2)
      y += 90
      if (pulso.detalle?.length) escribir(pc, pulso.detalle.join(' · '), x, y + 6, w, 50, 18, `400 18px ${SANS}`, P.muted, 1.4)
    } else {
      const t = !l || l.estado === 'leyendo' ? 'Leyendo…' : l.estado === 'oculto' ? 'Oculto en modo directo.' : l.estado === 'error' ? 'La fuente no respondió (no es cero).' : pulso?.falta ?? 'Sin dato todavía.'
      escribir(pc, t, x, y + 4, w, 80, 18, `italic 400 18px ${SANS}`, P.muted, 1.4)
    }
    let bx = x
    for (const btn of p.botones) {
      ctx.font = `680 20px ${SANS}`
      const bw = Math.min(w, ctx.measureText(btn.texto).width + 52)
      boton(pc, btn, { x: bx, y: c.y + c.h - 22 - 52, w: bw, h: 52 })
      bx += bw + 10
    }
  },
  boton: (pc, p, c) => boton(pc, p, c),
  progreso: (pc, p, c) => {
    const { ctx, P } = pc
    const l = p.fuente ? pc.leer(p.fuente) : undefined
    const num = (x: number | string) => (typeof x === 'number' ? x : l?.estado === 'ok' ? Number(campo(l.valor, x)) : NaN)
    const v = num(p.valor), t = num(p.total), ok = Number.isFinite(v) && Number.isFinite(t) && t > 0
    escribir(pc, llenarT(pc, p.etiqueta), c.x, c.y, c.w * 0.7, 28, 19, `600 19px ${SANS}`, P.texto)
    escribir(pc, ok ? `${v} de ${t}` : sinTexto(l, 'sin dato'), c.x + c.w * 0.7, c.y, c.w * 0.3, 28, 19, `600 19px ${SANS}`, P.muted, 1.3, 'der')
    rr(ctx, c.x, c.y + 40, c.w, 14, 7); ctx.fillStyle = P.texto; ctx.globalAlpha *= 0.08; ctx.fill(); ctx.globalAlpha /= 0.08
    if (ok) { const g = ctx.createLinearGradient(c.x, 0, c.x + c.w, 0); g.addColorStop(0, P.brand); g.addColorStop(1, P.oro); rr(ctx, c.x, c.y + 40, c.w * Math.max(0, Math.min(1, v / t)), 14, 7); ctx.fillStyle = g; ctx.fill() }
  },
  nova: (pc, p, c) => {
    const { ctx, P } = pc
    const S = Math.min(c.w, c.h), k = S / 1000, cx = c.x + c.w / 2, cy = c.y + c.h / 2
    const n = p.anillos.length, r0 = 150 * k, paso = (500 * k - 30 * k - r0) / Math.max(1, n)
    p.anillos.forEach((a, i) => {
      const r = r0 + paso * (i + 1)
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = i === 0 ? P.oro : P.tinta; ctx.lineWidth = (i === 0 ? 3 : 2) * k; ctx.globalAlpha *= i === 0 ? 1 : 0.55; ctx.stroke(); ctx.globalAlpha /= i === 0 ? 1 : 0.55
      escribir(pc, a.nombre.toUpperCase(), cx - 200 * k, cy - r + 12 * k, 400 * k, 30 * k, 19 * k, `750 ${19 * k}px ${SANS}`, P.tinta, 1.2, 'centro')
    })
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, Math.PI * 2); ctx.fillStyle = P.oro; ctx.globalAlpha *= 0.14; ctx.fill(); ctx.globalAlpha /= 0.14
    ctx.strokeStyle = P.oro; ctx.lineWidth = 2 * k; ctx.stroke()
    const h = escribir(pc, p.centro.texto, cx - r0 + 20 * k, cy - 60 * k, (r0 - 20 * k) * 2, 120 * k, 28 * k, `600 ${28 * k}px ${SERIF}`, P.texto, 1.15, 'centro')
    if (p.centro.sub) escribir(pc, p.centro.sub, cx - r0 + 20 * k, cy - 60 * k + h + 8 * k, (r0 - 20 * k) * 2, 80 * k, 17 * k, `400 ${17 * k}px ${SANS}`, P.muted, 1.3, 'centro')
  },
  escalera: (pc, p, c) => {
    const { ctx, P } = pc
    const top = p.titulo ? 34 : 8
    if (p.titulo) escribir(pc, p.titulo.toUpperCase(), c.x, c.y, c.w, 24, 16, `700 16px ${SANS}`, P.muted)
    const n = p.peldanos.length, g = 14, w = (c.w - g * (n - 1)) / n, H = c.h - top
    p.peldanos.forEach((q, i) => {
      const h = H * (0.4 + (0.6 * (i + 1)) / n), x = c.x + i * (w + g), y = c.y + c.h - h
      rr(ctx, x, y, w, h, 18)
      const color = q.estado === 'hueco' ? P.dolor : q.estado === 'tu' ? P.oro : q.estado === 'vivo' ? P.brand : P.muted
      if (q.estado === 'vivo' || q.estado === 'tu') { ctx.fillStyle = P.brand; ctx.globalAlpha *= 0.12; ctx.fill(); ctx.globalAlpha /= 0.12 }
      ctx.setLineDash(q.estado === 'abierto' || q.estado === 'por-firmar' || q.estado === 'hueco' ? [8, 6] : [])
      ctx.strokeStyle = color; ctx.lineWidth = q.estado === 'tu' ? 2.5 : 1.5; ctx.stroke(); ctx.setLineDash([])
      const precio = llenarT(pc, q.precio, '')
      let yy = c.y + c.h - 18
      const nombre = llenarT(pc, q.nombre)
      ctx.font = `700 20px ${SANS}`
      const lineas = partir(ctx, nombre, w - 36).length
      yy -= lineas * 24
      escribir(pc, nombre, x + 18, yy, w - 36, lineas * 24, 20, `700 20px ${SANS}`, P.texto, 1.2)
      if (precio) escribir(pc, precio, x + 18, yy - 38, w - 36, 34, 26, `800 26px ${SANS}`, P.oro, 1.2)
    })
  },
  'linea-tiempo': (pc, p, c) => {
    const { ctx, P } = pc
    const y = c.y + 41, n = p.hitos.length, w = c.w / n
    ctx.fillStyle = P.texto; ctx.globalAlpha *= 0.14; ctx.fillRect(c.x + 8, y, c.w - 16, 2); ctx.globalAlpha /= 0.14
    p.hitos.forEach((h, i) => {
      const x = c.x + i * w + 16
      ctx.beginPath(); ctx.arc(x, y + 1, 8, 0, Math.PI * 2)
      ctx.fillStyle = h.estado === 'hoy' ? P.oro : h.estado === 'hecho' ? P.tinta : P.arriba; ctx.fill()
      ctx.strokeStyle = h.estado === 'hoy' ? P.oro : P.tinta; ctx.lineWidth = 2; ctx.stroke()
      let yy = y + 22
      if (h.fecha) yy += escribir(pc, h.fecha.toUpperCase(), x - 8, yy, w - 16, 20, 14, `700 14px ${SANS}`, P.muted) + 4
      escribir(pc, h.texto, x - 8, yy, w - 16, c.y + c.h - yy, 18, `400 18px ${SANS}`, P.texto)
    })
  },
  lista: (pc, p, c) => {
    const { ctx, P } = pc
    if (p.estilo === 'chips') {
      let x = c.x
      for (const t of p.items) {
        const txt = llenarT(pc, t)
        ctx.font = `650 17px ${SANS}`
        const w = ctx.measureText(txt).width + 32
        if (x + w > c.x + c.w) break
        rr(ctx, x, c.y + (c.h - 40) / 2, w, 40, 20); ctx.fillStyle = P.brand; ctx.globalAlpha *= 0.08; ctx.fill(); ctx.globalAlpha /= 0.08
        escribir(pc, txt, x, c.y + (c.h - 40) / 2 + 9, w, 24, 17, `650 17px ${SANS}`, P.texto, 1.3, 'centro')
        x += w + 10
      }
      return
    }
    let y = c.y
    for (const t of p.items) {
      if (y > c.y + c.h - 20) break
      ctx.beginPath(); ctx.arc(c.x + 8, y + 16, 3.5, 0, Math.PI * 2); ctx.fillStyle = P.texto; ctx.fill()
      y += escribir(pc, llenarT(pc, t), c.x + 26, y, c.w - 26, c.y + c.h - y, 22, `400 22px ${SANS}`, P.texto, 1.5)
    }
  },
  separador: (pc, p, c) => {
    const { ctx, P } = pc
    const y = c.y + c.h / 2
    ctx.fillStyle = P.texto; ctx.globalAlpha *= 0.14
    if (p.etiqueta) {
      ctx.font = `700 15px ${SANS}`
      const w = ctx.measureText(p.etiqueta.toUpperCase()).width + 28
      ctx.fillRect(c.x, y, (c.w - w) / 2, 1); ctx.fillRect(c.x + (c.w + w) / 2, y, (c.w - w) / 2, 1)
      ctx.globalAlpha /= 0.14
      escribir(pc, p.etiqueta.toUpperCase(), c.x, y - 11, c.w, 22, 15, `700 15px ${SANS}`, P.muted, 1.4, 'centro')
    } else { ctx.fillRect(c.x, y, c.w, 1); ctx.globalAlpha /= 0.14 }
  },
}

const LUZ: Record<IslaLista['receta']['variante'], keyof PaletaIsla | null> = { neutra: null, oro: 'oro', morado: 'brand', calma: 'brand', dolor: 'dolor' }

/**
 * La isla entera en su elemento (coordenadas de mundo): placa, luz de su variante, cada bloque en su caja y, si la receta
 * trae errores, la franja roja con ellos. `zoom` es el de la cámara (decide el greeking).
 */
/**
 * Desde qué ancho EN PANTALLA (px CSS) una isla deja su cartel y enseña sus bloques. Debajo, los bloques serían texto de
 * 3 a 8 px que no se lee: el cartel dice lo mismo en grande (`cartel.ts`). Con histéresis no hace falta: el cambio es un
 * solo cuadro y ambas caras dicen lo mismo.
 */
export const UMBRAL_CARTEL_PX = 560
/** ¿Esta isla, a este tamaño en pantalla, se pinta como cartel? */
export const usaCartel = (isla: IslaLista, anchoPantalla: number) => anchoPantalla < UMBRAL_CARTEL_PX && formaCartel(isla) !== null

export function pintarIsla(ctx: CanvasRenderingContext2D, el: { x: number; y: number; width: number; height: number }, isla: IslaLista, leer: Leer, modo: 'claro' | 'oscuro', zoom: number, cartel?: boolean): void {
  letras()
  const P = PALETAS[modo]
  // Escala UNIFORME y centrada: si la caja del elemento no tiene la proporción de la receta, la isla se encaja (el texto
  // nunca se deforma). Misma cuenta que IslaNativaEmbed (`encajar`).
  const { k, dx, dy } = encajar(el, isla)
  ctx.save()
  ctx.translate(el.x + dx, el.y + dy)
  ctx.scale(k, k)
  // De lejos: su cartel (identidad, número, estado y meta en grande), no sus bloques encogidos.
  const d = (cartel ?? usaCartel(isla, isla.ancho * k * zoom)) ? datosDelCartel(isla, leer) : null
  if (d) {
    rr(ctx, 0, 0, isla.ancho, isla.alto, 28)
    ctx.save(); ctx.clip()
    try { pintarCartel(ctx, d, isla.ancho, isla.alto, P, modo === 'oscuro') } catch { /* un cartel que falla no tumba el mapa */ }
    ctx.restore(); ctx.restore()
    return
  }
  rr(ctx, 0, 0, isla.ancho, isla.alto, 28)
  ctx.save()
  ctx.clip()
  const fondo = ctx.createLinearGradient(0, 0, 0, isla.alto)
  fondo.addColorStop(0, P.arriba); fondo.addColorStop(1, P.abajo)
  ctx.fillStyle = fondo
  ctx.fillRect(0, 0, isla.ancho, isla.alto)
  const luz = LUZ[isla.receta.variante]
  if (luz) {
    const g = ctx.createRadialGradient(isla.ancho / 2, 0, 0, isla.ancho / 2, 0, isla.ancho * 0.6)
    g.addColorStop(0, P[luz] + (modo === 'oscuro' ? '40' : '2a')); g.addColorStop(1, P[luz] + '00')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, isla.ancho, isla.alto * 0.7)
  }
  const pc: Pincel = { ctx, P, leer, s: k * zoom, variante: isla.receta.variante }
  for (const b of isla.bloques) {
    const c = b.caja
    if (!b.ok) {
      rr(ctx, c.x, c.y, c.w, c.h, 16); ctx.setLineDash([10, 8]); ctx.strokeStyle = P.dolor; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([])
      escribir(pc, `Bloque ${b.tipo}: ${b.motivo}`, c.x + 18, c.y + 14, c.w - 36, c.h - 28, 17, `400 17px ${SANS}`, P.dolor, 1.35)
      continue
    }
    // Un tipo del agente ISLAS (features/mapa) se pinta con su propio dibujo ligero (features/mapa/pintar.ts).
    const pintor = (PINTORES[b.tipo as TipoBloque] as Pintor<TipoBloque> | undefined)
      ?? ((pc2: Pincel, p: unknown, c2: Caja) => pintarIslas(pc2, b.tipo, p as Record<string, unknown>, c2))
    ctx.save()
    try { pintor(pc, b.p, c, b.variante) } catch { /* un bloque que falla al pintarse no tumba la isla */ }
    ctx.restore()
  }
  if (isla.errores.length) {
    const h = 56
    rr(ctx, 20, isla.alto - h - 16, isla.ancho - 40, h, 12); ctx.fillStyle = P.card; ctx.fill(); ctx.strokeStyle = P.dolor; ctx.lineWidth = 1; ctx.stroke()
    escribir(pc, isla.errores.slice(0, 2).join(' · '), 34, isla.alto - h - 6, isla.ancho - 68, 40, 15, `400 15px ${SANS}`, P.dolor, 1.3)
  }
  ctx.restore()
  // El borde, fuera del recorte (nítido a cualquier zoom).
  rr(ctx, 0, 0, isla.ancho, isla.alto, 28)
  ctx.strokeStyle = P.borde
  ctx.lineWidth = 1 / Math.max(k * zoom, 0.02)
  ctx.stroke()
  ctx.restore()
}

/** Cómo cabe la isla (ancho×alto lógicos) en la caja del elemento: escala uniforme y desplazamiento para centrarla. */
export function encajar(el: { width: number; height: number }, isla: { ancho: number; alto: number }) {
  const k = Math.min(el.width / isla.ancho, el.height / isla.alto)
  return { k, dx: (el.width - isla.ancho * k) / 2, dy: (el.height - isla.alto * k) / 2 }
}

/**
 * El dibujo ligero con CACHÉ (medido el 14 nov: de cerca, con dos islas grandes en pantalla, rasterizar su texto cada cuadro
 * bajaba el paneo a 54 fps en Chromium sin GPU). Una isla que ocupa más de unos cientos de px se pinta UNA vez en un lienzo
 * aparte, a la escala de pantalla redondeada hacia arriba a potencia de dos (máx. 2048 px de ancho), y cada cuadro es un
 * `drawImage`. Se rehace solo si cambia la receta (otra `IslaLista`), los datos (`version` del almacén), el tema o si la
 * escala se sale de su margen (histéresis), y nunca más de PRESUPUESTO_MS por cuadro: lo que no alcanza se pinta con su
 * caché vieja o en vector. De lejos se dibuja directo: el greeking ya es barato. Tope de memoria: MAX_MPX.
 */
const LODS = new Map<IslaLista, { clave: string; s: number; c: HTMLCanvasElement; usado: number }>()
/** Tope por MEMORIA, no por cantidad (con 8 islas en pantalla y un tope de 6 se desalojaban entre sí cada cuadro). */
const MAX_MPX = 48
/** Lo que se puede gastar rehaciendo cachés en UN cuadro: lo demás espera al siguiente (se pinta la caché vieja). */
const PRESUPUESTO_MS = 4
/** Ancho en px de pantalla (con DPR) desde el que una isla se pinta desde su caché. */
const UMBRAL_CACHE_PX = 280
let gastado = 0
/** El motor lo llama al empezar cada cuadro. */
export function iniciarCuadroIslas() { gastado = 0 }
export function pintarIslaRapida(ctx: CanvasRenderingContext2D, el: { x: number; y: number; width: number; height: number }, isla: IslaLista, leer: Leer, modo: 'claro' | 'oscuro', zoom: number, dpr: number, version: number): void {
  const { k, dx, dy } = encajar(el, isla)
  const px = k * zoom * Math.max(1, dpr)
  const cartel = usaCartel(isla, isla.ancho * k * zoom)
  // Muy de lejos el vector con greeking es casi gratis; desde unos cientos de px, una receta rica (las de ISLAS miden hasta
  // 2,700 px de alto) cuesta redibujarla cada cuadro (medido: 46 fps con impulsos en vuelo) y el bitmap gana.
  if (isla.ancho * px < UMBRAL_CACHE_PX || typeof document === 'undefined') { pintarIsla(ctx, el, isla, leer, modo, zoom, cartel); return }
  const tope = 2048 / isla.ancho
  let e = LODS.get(isla)
  // Cartel o bloques va en la clave: cruzar el umbral rehace la caché una sola vez.
  const base = `${modo}|${version}|${cartel ? 'cartel' : 'bloques'}`
  // Histéresis: la caché sirve mientras tenga resolución suficiente y no sea más de 3 veces la necesaria. Así un zoom que
  // oscila alrededor de un escalón no la rehace en cada cruce.
  const sirve = !!e && e.clave === base && (e.s >= Math.min(px, tope) * 0.98) && e.s <= px * 3
  const ahora = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (!sirve && gastado < PRESUPUESTO_MS) {
    const t0 = ahora
    const s = Math.min(tope, Math.pow(2, Math.ceil(Math.log2(px * 1.2))))
    const c = e?.c ?? document.createElement('canvas')
    c.width = Math.ceil(isla.ancho * s); c.height = Math.ceil(isla.alto * s)
    const x = c.getContext('2d')
    if (!x) { pintarIsla(ctx, el, isla, leer, modo, zoom); return }
    x.setTransform(s, 0, 0, s, 0, 0)
    pintarIsla(x, { x: 0, y: 0, width: isla.ancho, height: isla.alto }, isla, leer, modo, s, cartel)
    e = { clave: base, s, c, usado: 0 }
    LODS.set(isla, e)
    // Lo menos usado se suelta mientras el total pase del tope (nunca la que se acaba de pintar).
    let mpx = [...LODS.values()].reduce((m, x) => m + (x.c.width * x.c.height) / 1e6, 0)
    for (const [i, x] of [...LODS.entries()].sort((a, b) => a[1].usado - b[1].usado)) {
      if (mpx <= MAX_MPX) break
      if (i === isla) continue
      mpx -= (x.c.width * x.c.height) / 1e6
      x.c.width = 0
      LODS.delete(i)
    }
    gastado += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
  }
  if (!e) { pintarIsla(ctx, el, isla, leer, modo, zoom, cartel); return }
  e.usado = ahora
  // Bilineal: la caché ya está a la escala de pantalla (redondeada hacia arriba), no hace falta un filtro caro.
  ctx.imageSmoothingQuality = 'low'
  ctx.drawImage(e.c, el.x + dx, el.y + dy, isla.ancho * k, isla.alto * k)
}
