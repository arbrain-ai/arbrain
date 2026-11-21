/**
 * El DIBUJO LIGERO de los bloques del agente ISLAS (mapa v16, 14 nov 2026): lo que el lienzo pinta en el canvas de lejos o
 * con la cámara en movimiento, antes de despertar el componente vivo. Misma firma que los pintores del MOTOR
 * (`features/canvas/islas/bloques/pintar.ts`: `(pincel, props, caja) => void`), en vector y barato: una placa con su bisel,
 * el texto que importa y, cuando el bloque la tiene, su forma (los anillos NOVA, el número vivo del órgano, la escalera, la
 * tira de semanas, el triángulo, las etapas). Sin animación. Los números salen de `leer(fuente)`: sin dato, «sin dato».
 *
 * Para el MOTOR: `PINTORES = { ...PINTORES, ...PINTORES_ISLAS }`.
 */

export interface PaletaLigera { arriba: string; abajo: string; borde: string; texto: string; muted: string; tinta: string; brand: string; oro: string; dolor: string; card: string }
export interface PincelLigero { ctx: CanvasRenderingContext2D; P: PaletaLigera; leer: (f: string) => { estado: string; valor?: unknown } | undefined; s: number }
export interface CajaLigera { x: number; y: number; w: number; h: number }
type Props = Record<string, unknown>
type Pintor = (pc: PincelLigero, p: Props, c: CajaLigera) => void

const SANS = 'system-ui, -apple-system, sans-serif'
const SERIF = "ui-serif, 'New York', 'Iowan Old Style', Georgia, serif"
const obj = (x: unknown): x is Props => !!x && typeof x === 'object' && !Array.isArray(x)
const t = (x: unknown) => (typeof x === 'string' ? x : '')
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const campoDe = (v: unknown, ruta: string): unknown => { let x: unknown = v; for (const k of ruta.split('.')) { if (!obj(x)) return null; x = x[k] } return x }

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, q); else ctx.rect(x, y, w, h)
}
const renglones = new Map<string, string[]>()
function partir(ctx: CanvasRenderingContext2D, s: string, w: number): string[] {
  const k = `${ctx.font}|${Math.round(w)}|${s}`
  const ya = renglones.get(k); if (ya) return ya
  const out: string[] = []
  for (const par of s.split('\n')) {
    let l = ''
    for (const p of par.split(/\s+/)) { const pr = l ? `${l} ${p}` : p; if (ctx.measureText(pr).width <= w || !l) l = pr; else { out.push(l); l = p } }
    out.push(l)
  }
  if (renglones.size > 3000) renglones.clear()
  renglones.set(k, out); return out
}
/** Texto en su caja (con elipsis); de muy lejos, barras: el ojo lee la forma del párrafo, no las letras. */
function escribir(pc: PincelLigero, s: string, x: number, y: number, w: number, maxH: number, tam: number, font: string, color: string, alto = 1.3): number {
  const { ctx } = pc
  if (!s || maxH <= 0) return 0
  ctx.font = font
  const lh = tam * alto, ls = partir(ctx, s, w), caben = Math.max(1, Math.floor(maxH / lh)), us = ls.slice(0, caben)
  if (ls.length > caben) us[caben - 1] = us[caben - 1].replace(/\s*\S*$/, '') + '…'
  ctx.fillStyle = color
  if (tam * pc.s < 4.5) {
    ctx.globalAlpha *= 0.35
    us.forEach((l, i) => ctx.fillRect(x, y + i * lh + lh * 0.25, Math.min(w, ctx.measureText(l).width), tam * 0.55))
    ctx.globalAlpha /= 0.35
  } else { ctx.textBaseline = 'top'; us.forEach((l, i) => ctx.fillText(l, x, y + i * lh + (lh - tam) / 2)) }
  return us.length * lh
}
function placa(pc: PincelLigero, c: CajaLigera, borde?: string) {
  const { ctx, P } = pc
  rr(ctx, c.x, c.y, c.w, c.h, 22)
  const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.h); g.addColorStop(0, P.arriba); g.addColorStop(1, P.abajo)
  ctx.fillStyle = g; ctx.fill()
  ctx.strokeStyle = borde ?? P.borde; ctx.lineWidth = borde ? 2 : 1; ctx.stroke()
}
const ceja = (pc: PincelLigero, s: string, x: number, y: number, w: number, color?: string) =>
  escribir(pc, s.toUpperCase(), x, y, w, 20, 13, `800 13px ${SANS}`, color ?? pc.P.muted)
/** El dato de una fuente para pintar: la cifra si la hay; si no, «sin dato» (nunca 0). */
function cifraDe(pc: PincelLigero, fuente: string): { texto: string; ok: boolean } {
  const l = pc.leer(fuente)
  if (!l || l.estado === 'leyendo') return { texto: '…', ok: false }
  if (l.estado === 'oculto') return { texto: '••••', ok: false }
  const v = l.valor
  if (obj(v) && v.estado === 'numero' && typeof v.cifra === 'string') return { texto: v.cifra, ok: true }
  if (obj(v) && typeof v.cifra === 'string' && l.estado === 'ok') return { texto: v.cifra, ok: true }
  if (obj(v) && v.estado === 'sin-sensor') return { texto: 'sin sensor', ok: false }
  return { texto: 'sin dato', ok: false }
}

// ── los pintores ──
/** Lo que casi todos dicen: su ceja, su título o frase y las primeras líneas. */
function generico(pc: PincelLigero, p: Props, c: CajaLigera, opc: { placa?: boolean; serif?: boolean } = {}) {
  if (opc.placa !== false) placa(pc, c)
  const pad = opc.placa === false ? 0 : 24
  let y = c.y + pad
  const k = t(p.ceja) || t(p.rotulo) || t(p.kicker)
  if (k) y += ceja(pc, k, c.x + pad, y, c.w - 2 * pad) + 8
  const titulo = t(p.titulo) || t(p.nombre)
  if (titulo) y += escribir(pc, titulo, c.x + pad, y, c.w - 2 * pad, c.y + c.h - y - pad, 34, `600 34px ${SERIF}`, pc.P.texto, 1.15) + 10
  const frase = t(p.frase) || t(p.texto) || t(p.identidad) || t(p.bajada) || t(p.glosa)
  if (frase) y += escribir(pc, frase, c.x + pad, y, c.w - 2 * pad, c.y + c.h - y - pad, opc.serif ? 24 : 17, opc.serif ? `italic 500 24px ${SERIF}` : `500 17px ${SANS}`, pc.P.muted, 1.35)
}

const encabezado: Pintor = (pc, p, c) => {
  let y = c.y
  if (t(p.ceja)) y += ceja(pc, t(p.ceja), c.x, y, c.w * 0.7, pc.P.oro) + 14
  const tam = p.tam === 'grande' ? 96 : 72
  y += escribir(pc, t(p.titulo), c.x, y, c.w, tam * 2.2, tam, `600 ${tam}px ${SERIF}`, pc.P.texto, 1.05) + 10
  escribir(pc, t(p.bajada), c.x, y, c.w * 0.62, c.y + c.h - y, 19, `italic 500 19px ${SANS}`, pc.P.muted, 1.4)
  botones(pc, { botones: p.botones }, { x: c.x + c.w * 0.62, y: c.y + c.h - 56, w: c.w * 0.38, h: 52 })
}
function botones(pc: PincelLigero, p: Props, c: CajaLigera) {
  const { ctx, P } = pc
  let x = c.x
  for (const b of arr(p.botones)) {
    if (!obj(b)) continue
    ctx.font = `700 16px ${SANS}`
    const w = Math.min(c.x + c.w - x, ctx.measureText(t(b.texto)).width + 74)
    if (w < 60) break
    rr(ctx, x, c.y, w, 48, 24); ctx.fillStyle = P.arriba; ctx.fill(); ctx.strokeStyle = P.borde; ctx.lineWidth = 1; ctx.stroke()
    ctx.beginPath(); ctx.arc(x + 25, c.y + 24, 17, 0, 7); ctx.fillStyle = b.tono === 'oro' ? P.oro : P.brand; ctx.fill()
    escribir(pc, t(b.texto), x + 50, c.y + 14, w - 58, 22, 16, `700 16px ${SANS}`, P.texto)
    x += w + 12
  }
}
const firma: Pintor = (pc, p, c) => {
  const { ctx, P } = pc
  ctx.fillStyle = p.tono === 'morado' ? P.brand : P.oro; ctx.fillRect(c.x, c.y + 6, 3, c.h - 12)
  let y = c.y
  if (t(p.rotulo)) y += ceja(pc, t(p.rotulo), c.x + 26, y, c.w - 26, P.oro) + 10
  escribir(pc, t(p.frase), c.x + 26, y, c.w - 26, c.y + c.h - y, Number(p.tam) || 28, `italic 500 ${Number(p.tam) || 28}px ${SERIF}`, P.texto, 1.3)
}
const numerada: Pintor = (pc, p, c) => {
  let y = c.y
  if (t(p.ceja)) y += ceja(pc, t(p.ceja), c.x, y, c.w, pc.P.oro) + 14
  arr(p.items).forEach((it, i) => {
    const s = typeof it === 'string' ? it : obj(it) ? t(it.texto) : ''
    escribir(pc, String(i + 1), c.x, y, 30, 30, 24, `600 24px ${SERIF}`, pc.P.oro)
    y += escribir(pc, s, c.x + 40, y + 2, c.w - 40, c.y + c.h - y, 19, `700 19px ${SANS}`, obj(it) && it.resalta ? pc.P.tinta : pc.P.texto, 1.35) + 10
  })
}
/** NOVA: los anillos de adentro hacia afuera, el núcleo de oro y las iniciales sobre el eje; la lámina, en renglones. */
const estrella: Pintor = (pc, p, c) => {
  const { ctx, P } = pc
  const anillos = arr(p.anillos).filter(obj)
  const D = Math.min(c.h, c.w - 520), R = D / 2, cx = c.x + R, cy = c.y + c.h / 2, r0 = R * 0.264
  const paso = (R * 0.934 - r0) / Math.max(1, anillos.length)
  for (let i = anillos.length - 1; i >= 0; i--) {
    const r1 = r0 + (i + 1) * paso
    ctx.beginPath(); ctx.arc(cx, cy, r1, 0, 7)
    ctx.fillStyle = i < 1 ? P.oro : P.brand; ctx.globalAlpha = 0.06 + (anillos.length - i) * 0.012; ctx.fill(); ctx.globalAlpha = 1
    ctx.strokeStyle = i < 1 ? P.oro : P.brand; ctx.lineWidth = 1.4; ctx.stroke()
  }
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0 * 1.3); g.addColorStop(0, '#fff6e6'); g.addColorStop(0.45, P.oro); g.addColorStop(1, 'rgba(255,145,1,0)')
  ctx.beginPath(); ctx.arc(cx, cy, r0 * 1.3, 0, 7); ctx.fillStyle = g; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1
  ctx.beginPath(); ctx.arc(cx, cy, r0, 0, 7); ctx.fillStyle = '#2a1a07'; ctx.fill(); ctx.strokeStyle = P.oro; ctx.stroke()
  const nucleo = obj(p.nucleo) ? p.nucleo : {}
  escribir(pc, t(nucleo.frase).replace(/\n/g, ' '), cx - r0 * 0.78, cy - r0 * 0.42, r0 * 1.56, r0, 26, `italic 600 26px ${SERIF}`, '#fff3df', 1.15)
  anillos.forEach((a, i) => {
    if (!t(a.inicial)) return
    ctx.font = `600 ${Math.round(paso * 0.75)}px ${SERIF}`; ctx.fillStyle = i < 1 ? P.oro : P.texto; ctx.textBaseline = 'middle'
    ctx.fillText(t(a.inicial), cx + r0 + (i + 0.5) * paso - paso * 0.22, cy)
  })
  // la lámina
  const lx = c.x + c.w - 470, notas = arr(p.notas).filter(obj)
  let y = c.y
  const hNota = c.h / Math.max(1, notas.length)
  notas.forEach(nota => {
    const parte = obj(arr(nota.partes)[0]) ? arr(nota.partes)[0] as Props : {}
    ctx.fillStyle = nota.anillo === 'nucleo' || nota.anillo === 'juego' ? P.oro : P.brand; ctx.fillRect(lx, y + 4, 2, hNota - 24)
    const yy = y + ceja(pc, t(parte.rotulo), lx + 20, y, 440, nota.anillo === 'nucleo' || nota.anillo === 'juego' ? P.oro : P.tinta) + 8
    escribir(pc, t(parte.frase), lx + 20, yy, 440, hNota - (yy - y) - 20, 21, `italic 500 21px ${SERIF}`, P.texto, 1.3)
    y += hNota
  })
}
const ecuacion: Pintor = (pc, p, c) => generico(pc, { titulo: t(p.titulo), texto: `${arr(p.arriba).join(' × ')} / ${arr(p.abajo).join(' × ')}` }, c, { placa: false })
const triangulo: Pintor = (pc, p, c) => {
  const { ctx, P } = pc
  let y = c.y + ceja(pc, t(p.ceja), c.x, c.y, c.w, P.oro) + 10
  y += escribir(pc, t(p.titulo), c.x, y, c.w, 70, 24, `800 24px ${SANS}`, P.texto) + 20
  const h = Math.min(c.y + c.h - y - 60, c.w * 0.6), w = h * 1.6
  const V = [[c.x + w / 2, y], [c.x, y + h], [c.x + w, y + h]]
  ctx.beginPath(); ctx.moveTo(V[0][0], V[0][1]); ctx.lineTo(V[1][0], V[1][1]); ctx.lineTo(V[2][0], V[2][1]); ctx.closePath(); ctx.strokeStyle = P.brand; ctx.lineWidth = 2.5; ctx.stroke()
  V.forEach(([x, yy]) => { ctx.beginPath(); ctx.arc(x, yy, 13, 0, 7); ctx.fillStyle = P.brand; ctx.fill() })
  escribir(pc, t(p.frase), c.x, y + h + 30, c.w, 40, 22, `italic 600 22px ${SERIF}`, P.tinta)
}
const etapas: Pintor = (pc, p, c) => {
  const { ctx, P } = pc
  let y = c.y + ceja(pc, t(p.ceja), c.x, c.y, c.w, P.oro) + 10
  y += escribir(pc, t(p.titulo), c.x, y, c.w, 70, 24, `800 24px ${SANS}`, P.texto) + 30
  const n = Number(p.n) || 5, base = c.y + c.h - 40, alto = base - y, bw = (c.w - (n - 1) * 14) / n
  const marcas = arr(p.marcas).filter(obj)
  for (let i = 0; i < n; i++) {
    const m = marcas.find(x => x.etapa === i + 1), h = alto * (0.24 + (i / (n - 1)) * 0.72)
    rr(ctx, c.x + i * (bw + 14), base - h, bw, h, 8)
    ctx.fillStyle = m ? (m.tono === 'oro' ? P.oro : P.brand) : P.abajo; ctx.globalAlpha = m ? 0.25 : 1; ctx.fill(); ctx.globalAlpha = 1
    ctx.strokeStyle = m ? (m.tono === 'oro' ? P.oro : P.brand) : P.borde; ctx.lineWidth = 1.5; ctx.stroke()
  }
}
const identidad: Pintor = (pc, p, c) => generico(pc, p, c, { placa: false })
/** El órgano: su glifo, su nombre, su pregunta y su número vivo (de El pulso). */
const organoVivo: Pintor = (pc, p, c) => {
  const { ctx, P } = pc
  const organo = t(p.organo), d = 96
  const n = cifraDe(pc, `pulso:${organo}`)
  ctx.beginPath(); ctx.arc(c.x + d / 2, c.y + d / 2, d / 2, 0, 7); ctx.fillStyle = n.ok ? P.brand : P.abajo; ctx.fill()
  if (!n.ok) { ctx.strokeStyle = P.borde; ctx.lineWidth = 2; ctx.stroke() }
  const nombre = t(p.nombre) || ({ marketing: 'Marketing', venta: 'Venta', comprador: 'Mente del comprador', entrega: 'Entrega', finanzas: 'Finanzas', sistemas: 'Sistemas' } as Record<string, string>)[organo] || organo
  ceja(pc, t(p.capa), c.x + d + 24, c.y, c.w - d - 24, P.tinta)
  escribir(pc, nombre, c.x + d + 24, c.y + 24, c.w - d - 24, 100, p.forma === 'franja' ? 60 : 84, `600 ${p.forma === 'franja' ? 60 : 84}px ${SERIF}`, P.texto, 1.05)
  const y = c.y + (p.forma === 'franja' ? 150 : 170)
  const tam = n.ok ? (n.texto.length > 11 ? 76 : n.texto.length > 7 ? 96 : 128) : 52
  escribir(pc, n.texto, c.x, y, c.w * 0.45, tam * 1.1, tam, `800 ${tam}px ${SANS}`, n.ok ? P.oro : P.muted, 1)
  // el monitor, quieto
  const mx = c.x + c.w * 0.48, mw = c.w * 0.52, mh = c.y + c.h - y
  placa(pc, { x: mx, y, w: mw, h: mh })
  ctx.strokeStyle = n.ok ? P.brand : P.muted; ctx.lineWidth = 2.5; ctx.setLineDash(n.ok ? [] : [10, 8])
  ctx.beginPath(); ctx.moveTo(mx + 10, y + mh * 0.62); ctx.lineTo(mx + mw - 10, y + mh * 0.62); ctx.stroke(); ctx.setLineDash([])
}
/** Meta · realidad · error: sus tres valores; el que duele, con borde rojo. */
const metaError: Pintor = (pc, p, c) => {
  const { P } = pc
  const serie = obj(p.serie) ? t(p.serie.consulta) : ''
  const l = serie ? pc.leer(`bi:${serie}`) : undefined
  const v = l && obj(l.valor) ? l.valor : null
  const duele = !!(v && obj(v.senal) && v.senal.tono === 'dolor')
  placa(pc, c, duele ? P.dolor : undefined)
  ceja(pc, 'meta · realidad · error', c.x + 26, c.y + 24, c.w - 52, P.tinta)
  const meta = obj(p.meta) ? p.meta : null
  const col = (c.w - 52) / 3
  // Sin la fuente en el almacén del dibujo (el `bi:` del MOTOR aún no existe), la realidad no se conoce AQUÍ, pero sí de
  // cerca: «…», nunca «sin dato» (sería decir que no hay medición cuando la isla viva la muestra).
  // La realidad: la serie del BI (`bi:<consulta>` del MOTOR, su último día) o la `realidad` que la receta declare.
  const rv = obj(p.realidad) && typeof p.realidad.fuente === 'string' ? p.realidad : null
  const lr = rv ? pc.leer(t(rv.fuente)) : undefined
  const vr = rv && lr && lr.estado === 'ok' ? campoDe(lr.valor, t(rv.campo)) : null
  const tr0 = rv && lr && lr.estado === 'ok' && rv.total ? campoDe(lr.valor, t(rv.total)) : null
  const ultimo = typeof vr === 'number' ? vr : v && typeof v.ultimo === 'number' ? v.ultimo : null
  const lect = l ?? lr
  const real = typeof vr === 'number' ? `${vr}${typeof tr0 === 'number' ? ` de ${tr0}` : ''}` : v && typeof v.cifra === 'string' ? v.cifra : (lect === undefined || lect.estado === 'leyendo') ? '…' : 'sin dato'
  const usd = (meta && meta.unidad === 'USD') || (v && v.usd === true)
  const err = meta && typeof meta.valor === 'number' && ultimo !== null ? `${usd ? '$' : ''}${Math.round(Math.abs(meta.valor - ultimo)).toLocaleString('es-MX')}` : meta ? '…' : '—'
  ;[['la meta', meta ? `${usd ? '$' : ''}${Number(meta.valor).toLocaleString('es-MX')}` : 'sin meta', P.oro], ['la realidad', real, P.texto], ['el error', err, duele ? P.dolor : P.texto]]
    .forEach(([k, val, color], i) => {
      ceja(pc, k, c.x + 26 + i * col, c.y + 70, col - 10)
      escribir(pc, val, c.x + 26 + i * col, c.y + 98, col - 10, 44, 32, `800 32px ${SANS}`, color, 1.1)
    })
  // Lo que NO es meta, dicho aparte (15 nov 2026): las cuotas del Acompañamiento no son MRR recurrente.
  const ap = obj(p.aparte) && typeof p.aparte.fuente === 'string' ? p.aparte : null
  const la = ap ? pc.leer(t(ap.fuente)) : undefined
  const apTexto = ap && la && la.estado === 'ok' ? campoDe(la.valor, t(ap.campo)) : null
  if (typeof apTexto === 'string' && c.h > 170) escribir(pc, apTexto, c.x + 26, c.y + 162, c.w - 52, c.h - 180, 22, `600 22px ${SANS}`, P.muted, 1.25)
}
const tablero = (rotulo: string): Pintor => (pc, p, c) => generico(pc, { ceja: t(p.ceja) || rotulo, texto: '' }, c)
const timonel: Pintor = (pc, p, c) => {
  const { ctx, P } = pc
  const e = pc.leer('embudo'), emb = e && obj(e.valor) ? e.valor : null
  const cu = emb ? arr(emb.etapas).filter(obj).find(x => obj(x.cuello) && x.cuello.es) : null
  const w = (c.w - 140) / 3, y = c.y + 60, h = Math.min(270, c.h - 120)
  const textos = [cu && obj(cu.cuello) ? t(cu.cuello.frase).split(/(?<=[.!?])\s+/).filter(s => !/\d/.test(s)).join(' ') : 'sin dato del embudo',
    cu && obj(cu.mide) ? t(cu.mide.nombre) : '', cu ? `Empujar «${t(cu.nombre)}»` : '']
  ;[P.oro, P.dolor, P.oro].forEach((col, i) => {
    const x = c.x + i * (w + 70)
    rr(ctx, x, y, w, h, 22); ctx.fillStyle = P.arriba; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(i ? [8, 6] : []); ctx.stroke(); ctx.setLineDash([])
    escribir(pc, textos[i], x + 26, y + 60, w - 52, h - 80, i ? 24 : 26, i ? `750 24px ${SANS}` : `italic 600 26px ${SERIF}`, P.texto, 1.28)
    if (i < 2) escribir(pc, i ? '=' : '−', x + w + 18, y + h / 2 - 36, 40, 72, 64, `300 64px ${SANS}`, P.texto)
  })
}
const escaleraValor: Pintor = (pc, p, c) => {
  const { ctx, P } = pc
  const es = arr(p.escalones).filter(obj)
  const total = es.reduce((a, e) => a + (Number(e.peso) || 1), 0) || 1
  let x = c.x
  es.forEach((e, i) => {
    const w = (c.w - (es.length - 1) * 16) * (Number(e.peso) || 1) / total, h = c.h * (0.45 + 0.5 * i / Math.max(1, es.length - 1))
    rr(ctx, x, c.y + c.h - h, w, h, 16)
    ctx.fillStyle = e.tono === 'oro' ? P.oro : e.tono === 'morado' ? P.brand : P.abajo; ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1
    ctx.strokeStyle = e.tono === 'oro' ? P.oro : e.tono === 'morado' ? P.brand : P.muted; ctx.lineWidth = 2; ctx.setLineDash(e.estado === 'idea' ? [3, 6] : e.estado === 'abierto' ? [10, 7] : []); ctx.stroke(); ctx.setLineDash([])
    escribir(pc, t(e.nombre), x + 20, c.y + c.h - h + 30, w - 40, 90, Math.min(64, w / 6), `600 ${Math.min(64, w / 6)}px ${SERIF}`, P.texto, 1.1)
    x += w + 16
  })
}
const tiraSemanas: Pintor = (pc, p, c) => {
  const { ctx, P } = pc
  const fases = arr(p.fases).filter(obj)
  const rango = Array.isArray(p.semanas) ? (p.semanas as number[]) : [0, (Number(p.semanas) || 14) - 1]
  const s0 = Number(rango[0]) || 0, sem = (Number(rango[1]) || 13) - s0 + 1
  const y = c.y + c.h * 0.35, h = Math.min(90, c.h * 0.3), u = c.w / sem
  fases.forEach(f => {
    const a = Number(f.desde ?? 0) - s0, b = Number(f.hasta ?? f.desde ?? 0) - s0
    rr(ctx, c.x + a * u + 3, y, Math.max(8, (b - a + 1) * u - 6), h, 12); ctx.fillStyle = P.oro; ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1
    ctx.strokeStyle = P.oro; ctx.lineWidth = 1.5; ctx.stroke()
    escribir(pc, t(f.nombre), c.x + a * u + 14, y + 14, Math.max(10, (b - a + 1) * u - 28), h - 20, 20, `800 20px ${SANS}`, P.texto)
  })
  // HOY: la semana de hoy (fecha del sistema); `inicio` es el día 1 de S1, así que S0 empieza 7 días antes
  const ini = Date.parse(t(p.inicio)); if (Number.isFinite(ini)) {
    const s = (Date.now() - (ini - (1 - s0) * 7 * 86400000)) / (7 * 86400000)
    if (s >= 0 && s <= sem) { ctx.fillStyle = P.dolor; ctx.fillRect(c.x + s * u - 3, y - 30, 6, h + 60) }
  }
}

export const PINTORES_ISLAS: Record<string, Pintor> = {
  encabezado, firma, parrafo: (pc, p, c) => generico(pc, { texto: p.texto }, c, { placa: false }), botones, numerada,
  estrella, ecuacion, triangulo, etapas, identidad,
  'organo-vivo': organoVivo, 'meta-error': metaError, actividad: tablero('quién lo trabaja'), decision: tablero('decisiones de la bandeja'), terminales: tablero('sus terminales'), timonel,
  'escalera-valor': escaleraValor, 'tira-semanas': tiraSemanas,
}

/** Cualquier tipo del agente ISLAS sin pintor propio: su placa con lo que dice (nunca un hueco en blanco). */
export function pintarIslas(pc: PincelLigero, tipo: string, p: Props, c: CajaLigera) {
  const f = PINTORES_ISLAS[tipo]
  if (f) f(pc, p, c); else generico(pc, p, c, { serif: true })
}
