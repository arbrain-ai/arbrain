// Movimiento del Levy 3D para la cara 2D en vivo (7-8 nov 2026).
//
// En la comparación del 7 nov (labs/god-animation/practicas/2026-11-07-levy-v3, camino C) la cara oficial ganó con el
// movimiento del 3D v2: cabeza (asentir en las palabras fuertes, ladeo que alterna por frase, inclinación en «grande» o
// «poco»), cejas en el ancla de cada frase y parpadeos. Aquí están esas MISMAS reglas (2026-11-06-levy-cuerpo/www/
// gestos-auto.js, solo los canales de cara y cabeza) y los mismos resortes de segundo orden de su index.html, para que el
// vivo y los videos compartan el gesto. Diferencia firmada: parpadeo ~15 por minuto (el 3D sembraba ~45).
//
// Sin dependencias del rig: devuelve ángulos (rad) y ceja/parpadeo 0..1. LevyFace los pasa al rig 2D como deformación
// (desplazamiento, rotación y parallax de profundidad), nunca como fundido de vistas: el giro no duplica la cara.

export type Palabra = { w: string; s: number; e: number }
export type Gesto = { cabeceo: number; inclina: number; ladeo: number; giro: number; ceja: number; parpadeo: number }

class Resorte {
  x: number; v = 0; t: number; f: number; z: number
  constructor(x: number, f = 3, z = 0.7) { this.x = x; this.t = x; this.f = f; this.z = z }
  paso(dt: number) { const w = 2 * Math.PI * this.f; const a = w * w * (this.t - this.x) - 2 * this.z * w * this.v; this.v += a * dt; this.x += this.v * dt }
}
type Clave = { t: number; set: Partial<Record<Canal, number>>; f?: number; z?: number }
type Canal = 'cabeceo' | 'cabInc' | 'cabLado' | 'cabGiro' | 'ceja'
const CANALES: Canal[] = ['cabeceo', 'cabInc', 'cabLado', 'cabGiro', 'ceja']

const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[^a-z0-9ñ]/g, '')
const RX = {
  saludo: /^(hola|buenas|hey|bienvenid)/, pregunta: /\?/,
  yo: /^(yo|me|mi|mis|nosotros|nuestro|nuestra|conmigo)$/, tu: /^(tu|tus|te|ti|usted|ustedes|dime|mira|imagina)$/,
  cuenta: /^(uno|dos|tres|cuatro|cinco|primero|segundo|tercero|1|2|3|4|5)$/,
  grande: /^(todo|todos|toda|enorme|gran|grande|mucho|muchos|siempre|nunca|nada|mundo|completo)$/,
  chico: /^(poco|pequeno|detalle|exacto|preciso|solo|justo|apenas)$/,
}
const ruido = (t: number, s: number) => Math.sin(t * 0.71 + s) * 0.5 + Math.sin(t * 1.33 + s * 2.1) * 0.3 + Math.sin(t * 2.07 + s * 3.7) * 0.2
function azar(semilla: number) { let s = semilla | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

/** Agrupa palabras en frases por puntuación o pausas, de ~1.5-3.5 s (presentador/preparar.py del 3D, palabras_a_frases):
 *  así cada idea lleva su gesto aunque Live mande una cláusula larga de una vez. */
export function frasesDe(ws: Palabra[]): { s: number; e: number; texto: string; palabras: Palabra[] }[] {
  const out: { s: number; e: number; texto: string; palabras: Palabra[] }[] = []
  let cur: Palabra[] = []
  ws.forEach((w, i) => {
    cur.push(w); const nx = ws[i + 1]
    const larga = w.e - cur[0].s
    if (!nx || /[.?!…:;]$/.test(w.w) || nx.s - w.e > 0.3 || (larga > 1.6 && /,$/.test(w.w)) || larga > 3.5) {
      out.push({ s: cur[0].s, e: cur[cur.length - 1].e, texto: cur.map(c => c.w).join(' '), palabras: cur }); cur = []
    }
  })
  return out
}

/** Claves de cara/cabeza de UNA frase (gestos-auto.js, PLAN.claves, sin manos ni torso). Tiempos relativos a la frase. */
export function clavesDeFrase(i: number, texto: string, palabras: Palabra[], energia: (s: number, e: number) => number, primera: boolean): Clave[] {
  const K: Clave[] = []
  const k = (t: number, set: Clave['set'], f?: number, z?: number) => K.push({ t: Math.max(0, t), set, f, z })
  const nod = (t: number, a = 0.08) => { k(t - 0.06, { cabeceo: a }, 6, 0.6); k(t + 0.16, { cabeceo: 0 }, 3.5, 0.75) }
  if (!palabras.length) return K
  const s0 = palabras[0].s, e0 = palabras[palabras.length - 1].e, dur = e0 - s0
  const W = palabras.map(w => ({ ...w, n: norm(w.w), en: energia(w.s, w.e) }))
  const fuertes = [...W].filter(w => w.n.length > 3).sort((a, b) => b.en - a.en)
  const busca = (rx: RegExp) => W.find(w => rx.test(w.n))
  const ancla = (fuertes[0] ?? W[0]).s
  k(s0, { cabLado: i % 2 ? -0.04 : 0.04 }, 0.8, 0.9)
  const txt = texto.toLowerCase()
  let ta = ancla
  if (dur < 0.8) nod(ancla, 0.07)
  else if (primera && RX.saludo.test(W[0].n)) { const t = W[0].s; k(t, { cabLado: 0.06, ceja: 0.5 }, 2, 0.8); k(t + 1.0, { cabLado: 0, ceja: 0 }, 1.5, 0.8); ta = t + 0.6 }
  else if (W.filter(w => RX.cuenta.test(w.n)).length >= 2) { const ns = W.filter(w => RX.cuenta.test(w.n)); ns.forEach(w => nod(w.s, 0.09)); k(ns[0].s - 0.3, { ceja: 0.35 }, 2, 0.8); ta = ns[ns.length - 1].s }
  else if (RX.pregunta.test(txt)) k(ancla, { cabLado: 0.08, ceja: 0.45 }, 3, 0.6)
  else if (busca(RX.tu)) { const w = busca(RX.tu)!; ta = w.s; k(w.s - 0.2, { ceja: 0.25 }, 2, 0.8); nod(w.s + 0.1, 0.07) }
  else if (busca(RX.yo)) { const w = busca(RX.yo)!; ta = w.s; nod(w.s, 0.08) }
  else if (busca(RX.grande)) { const w = busca(RX.grande)!; ta = w.s; k(w.s - 0.05, { cabInc: -0.08, ceja: 0.55 }, 2.2, 0.65) }
  else if (busca(RX.chico)) { const w = busca(RX.chico)!; ta = w.s; k(w.s - 0.3, { cabInc: 0.08, ceja: 0.3 }, 2.2, 0.8) }
  else { const v = i % 3; if (v === 0) k(ancla - 0.2, { ceja: 0.25 }, 1.8, 0.8); else if (v === 1) k(ancla - 0.2, { ceja: 0.2 }, 1.8, 0.8); else nod(ancla, 0.09); nod(ancla, 0.08) }
  fuertes.slice(1, dur > 2.5 ? 3 : 2).filter(w => Math.abs(w.s - ta) > 0.45).forEach(w => nod(w.s, 0.06))
  k(e0 + 0.25, { cabInc: 0, cabLado: 0, ceja: 0 }, 1.5, 0.8)
  return K
}

/**
 * Reloj de gestos de toda la conversación: cada frase (cláusula de voz de Live) suma sus claves en su instante absoluto y
 * los resortes corren con el reloj real. Los parpadeos van solos, ~15 por minuto (cada 2.8-5.2 s), más uno al empezar
 * cada frase si el último quedó lejos.
 */
export class MovimientoVivo {
  private R = Object.fromEntries(CANALES.map(c => [c, new Resorte(0)])) as Record<Canal, Resorte>
  private claves: (Clave & { frase: string })[] = []
  private i = 0
  private frases = new Map<string, { n: number; t0: number }>()
  private parpadeos: number[] = []
  private siguiente: number
  private azar: () => number
  private t = -1
  constructor(semilla = 20261106, t0 = 0) { this.azar = azar(semilla); this.siguiente = t0 + 1.3 }

  /** Registra (o rehace, si llegó más alineación) la frase `id` que empieza en `t0` (s, reloj absoluto). */
  frase(id: string, t0: number, texto: string, palabras: Palabra[], energia: (s: number, e: number) => number) {
    let f = this.frases.get(id)
    if (!f) {
      f = { n: this.frases.size, t0 }; this.frases.set(id, f)
      const ultimo = this.parpadeos.length ? this.parpadeos[this.parpadeos.length - 1] : -9
      const b = t0 + (palabras[0]?.s ?? 0) - 0.12   // parpadeo al empezar la frase (como el 3D), si el último quedó lejos
      if (f.n > 0 && b - ultimo > 1.2 && this.siguiente - b > 1.2) this.parpadeos.push(b)
    }
    const nuevas = clavesDeFrase(f.n, texto, palabras, energia, f.n === 0).map(c => ({ ...c, t: c.t + f!.t0, frase: id }))
    // las claves de esta frase que aún no se aplicaron se reemplazan
    this.claves = [...this.claves.filter(c => c.frase !== id || c.t <= this.t), ...nuevas.filter(c => c.t > this.t)].sort((a, b) => a.t - b.t)
    this.i = this.claves.findIndex(c => c.t > this.t); if (this.i < 0) this.i = this.claves.length
  }

  /** Avanza al segundo absoluto `t` y devuelve el gesto. */
  tick(t: number): Gesto {
    if (this.t < 0) this.t = t
    const dt = Math.min(0.1, Math.max(0, t - this.t))
    const N = Math.max(1, Math.ceil(dt * 240)), h = dt / N
    for (let s = 0; s < N; s++) {
      const ts = this.t + (s + 1) * h
      while (this.i < this.claves.length && this.claves[this.i].t <= ts) {
        const c = this.claves[this.i++]
        for (const [n, v] of Object.entries(c.set) as [Canal, number][]) { const r = this.R[n]; r.t = v; if (c.f) r.f = c.f; if (c.z) r.z = c.z }
      }
      for (const c of CANALES) this.R[c].paso(h)
    }
    this.t = t
    while (this.siguiente <= t + 0.5) { this.parpadeos.push(this.siguiente); this.siguiente += 2.8 + this.azar() * 2.4 }
    this.parpadeos = this.parpadeos.filter(b => b > t - 1)
    let parpadeo = 0
    for (const b of this.parpadeos) if (t >= b && t < b + 0.16) parpadeo = Math.min(1, Math.sin(((t - b) / 0.16) * Math.PI) * 1.6)
    const x = (c: Canal) => this.R[c].x
    return {
      cabeceo: x('cabeceo'), inclina: x('cabInc') + ruido(t * 0.6, 5) * 0.015,
      ladeo: x('cabLado') + ruido(t * 0.5, 7) * 0.012, giro: x('cabGiro') + ruido(t * 0.45, 6) * 0.02,
      ceja: x('ceja'), parpadeo,
    }
  }
}
