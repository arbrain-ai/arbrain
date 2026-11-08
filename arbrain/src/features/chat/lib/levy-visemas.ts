// Visemas por fonema desde la alineación POR CARÁCTER de ElevenLabs (Levy vivo, 7-8 nov 2026).
//
// Puerto exacto de `labs/god-animation/practicas/2026-11-07-levy-v3/scripts/fonemas.py`, la pista que ganó la comparación
// (camino C: r labios↔visemas 0.93, 8/8 cierres p/b/m). Contra los visemas estimados del texto + DTW de levy-lipsync.ts
// (r 0.40-0.66) la diferencia es que aquí cada letra trae SU tiempo de la propia síntesis: no hay nada que estimar.
//
//  1. Español → fonemas por reglas de ortografía, CONSERVANDO el tiempo de cada letra: h muda (le pasa su tiempo a la
//     siguiente); qu/gu + e,i (la u no suena); ll, ch, rr dígrafos; c+e,i y z → s (seseo); y final → i; x → ks.
//  2. Cada fonema → uno de 15 visemas y 5 canales articulatorios: abre, ancho, redondo, cierra (p/b/m), muerde (f).
//  3. Afinado con el audio (opcional): cada oclusiva se recentra en el valle de energía a ±45 ms; tras un silencio arranca
//     con la voz; las vocales abren según su energía, las tónicas más (tilde o regla llana/aguda).
//  4. Coarticulación: la boca se adelanta 40 ms y se suaviza con una gaussiana de σ 22 ms. Los cierres bilabiales (y la
//     mordida de la f) se fuerzan al máximo dentro de la ventana del cuadro, para que nunca se pierdan entre cuadros.
//
// Se evalúa en cualquier instante sin rejilla: la convolución de un tramo constante con la gaussiana es una resta de dos
// funciones de error. Paridad con fonemas.py comprobada en tests/chat/levy-visemas.test.ts.

export const VISEMAS = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'] as const
export type Visema = (typeof VISEMAS)[number]
/** abre, ancho, redondo, cierra, muerde (copia de CAN en fonemas.py). */
export const CANALES: Record<Visema, readonly [number, number, number, number, number]> = {
  sil: [0, 0, 0, 0, 0], PP: [0.02, 0, 0.05, 1, 0], FF: [0.1, 0.15, 0, 0, 1], TH: [0.15, 0.2, 0, 0, 0],
  DD: [0.24, 0.25, 0, 0, 0], kk: [0.3, 0.1, 0, 0, 0], CH: [0.2, 0, 0.3, 0, 0], SS: [0.12, 0.45, 0, 0, 0],
  nn: [0.2, 0.2, 0, 0, 0], RR: [0.26, 0.1, 0.1, 0, 0], aa: [1.0, 0.25, 0, 0, 0], E: [0.55, 0.65, 0, 0, 0],
  I: [0.3, 0.9, 0, 0, 0], O: [0.65, 0, 0.75, 0, 0], U: [0.3, 0, 1.0, 0, 0],
}
const VOCALES: readonly Visema[] = ['aa', 'E', 'I', 'O', 'U']
const VOC: Record<string, Visema> = { a: 'aa', á: 'aa', e: 'E', é: 'E', i: 'I', í: 'I', o: 'O', ó: 'O', u: 'U', ú: 'U', ü: 'U' }
const OCLUSIVA = new Set(['p', 'b', 'm', 't', 'd', 'k', 'g'])
export const LEAD_MS = 40
export const SIGMA_MS = 22
/** Peso mínimo de la tesela de cierre (o mordida) en un cuadro que toca el fonema. */
export const FORZADO = 0.95

/** Respuesta de ElevenLabs (`alignment` de with-timestamps): un carácter por posición, tiempos en segundos. */
export type Alineacion = { chars: string[]; starts: number[]; ends: number[] }
export type Fonema = { f: string; v: Visema; s: number; e: number; tonica: boolean; amp: number; letra: string; palabra: number; i: number }
/** Energía del audio a 10 ms (la misma que levy-lipsync calcula del PCM que suena). */
export type Energia = { rms: ArrayLike<number>; frames: number }

const esLetra = (c: string) => /\p{L}/u.test(c)
const base = (c: string) => c.normalize('NFD')[0]

type Crudo = [f: string, v: Visema, s: number, e: number, i: number, palabra: number]

/** Español → fonemas con los tiempos de cada letra (g2p de fonemas.py, regla por regla). */
export function g2p(al: Alineacion): Crudo[] {
  const C = al.chars, S = al.starts, E = al.ends, n = C.length
  const low = C.map(c => c.toLowerCase())
  const out: Crudo[] = []
  let i = 0, palabra = 0, pend: number | null = null
  while (i < n) {
    const c = low[i], nx = i + 1 < n ? low[i + 1] : ''
    const s: number = pend ?? S[i], e: number = E[i]
    pend = null
    if (c === ' ') { palabra++; i++; continue }
    if (',.;:?!¿¡…"'.includes(c)) { i++; continue }
    if (c === 'h' && !(i > 0 && low[i - 1] === 'c')) { pend = s; i++; continue }   // muda: su tiempo pasa a la siguiente
    const fin = i + 1 >= n || !esLetra(low[i + 1])
    const add = (f: string, v: Visema, a = s, b = e) => { out.push([f, v, a, b, i, palabra]) }
    if ((c === 'q' || c === 'g') && nx === 'u' && i + 2 < n && 'eéií'.includes(low[i + 2])) { add(c, 'kk', s, E[i + 1]); i += 2; continue }
    if (c === 'c' && nx === 'h') { add('ch', 'CH', s, E[i + 1]); i += 2; continue }
    if (c === 'l' && nx === 'l') { add('ʝ', 'CH', s, E[i + 1]); i += 2; continue }
    if (c === 'r' && nx === 'r') { add('rr', 'RR', s, E[i + 1]); i += 2; continue }
    if (c === 'y' && (fin || !(nx in VOC))) { add('i', 'I'); i++; continue }
    if (c in VOC) { add(base(c), VOC[c]); i++; continue }
    if ('mbpv'.includes(c)) add(c === 'v' ? 'b' : c, 'PP')
    else if (c === 'f') add('f', 'FF')
    else if (c === 'z' || (c === 'c' && nx !== '' && 'eéií'.includes(nx))) add('s', 'SS')
    else if (c === 's') add('s', 'SS')
    else if (c === 'ñ' || c === 'y') add(c, 'CH')
    else if (c === 'd' || c === 't') add(c, 'DD')
    else if (c === 'n' || c === 'l') add(c, 'nn')
    else if (c === 'r') add('r', 'RR')
    else if ('ckqgj'.includes(c)) add(({ c: 'k', q: 'k', j: 'x' } as Record<string, string>)[c] ?? c, 'kk')
    else if (c === 'x') { const m = (s + e) / 2; add('k', 'kk', s, m); add('s', 'SS', m, e) }
    else if (c === 'w') add('u', 'U')
    i++
  }
  return out
}

/** Índices de las vocales tónicas: tilde, o regla llana/aguda (en diptongo manda la vocal fuerte). */
export function tonicas(F: Crudo[], chars: string[]): Set<number> {
  const ton = new Set<number>(), por = new Map<number, number[]>()
  F.forEach((f, k) => { const l = por.get(f[5]); if (l) l.push(k); else por.set(f[5], [k]) })
  for (const ks of por.values()) {
    const vs = ks.filter(k => VOCALES.includes(F[k][1]))
    if (!vs.length) continue
    const til = vs.filter(k => 'áéíóú'.includes(chars[F[k][4]].toLowerCase()))
    if (til.length) { ton.add(til[0]); continue }
    const grupos: number[][] = [[vs[0]]]
    for (let j = 1; j < vs.length; j++) { if (F[vs[j]][4] - F[vs[j - 1]][4] === 1) grupos[grupos.length - 1].push(vs[j]); else grupos.push([vs[j]]) }
    const nuc = grupos.map(g => g.find(k => 'aeo'.includes(F[k][0])) ?? g[g.length - 1])
    const ult = F[ks[ks.length - 1]][0]
    ton.add(nuc.length > 1 && ('aeiou'.includes(ult) || ult === 'n' || ult === 's') ? nuc[nuc.length - 2] : nuc[nuc.length - 1])
  }
  return ton
}

function percentil90(v: number[]) { const s = [...v].sort((a, b) => a - b); const x = 0.9 * (s.length - 1), i = Math.floor(x), j = Math.min(s.length - 1, i + 1); return s[i] + (s[j] - s[i]) * (x - i) }

/** Fonemas con tiempos afinados y apertura por energía. Sin `energia`, solo reglas (amp 1 tónica, 0.82 átona). */
export function fonemas(al: Alineacion, energia?: Energia): Fonema[] {
  const F = g2p(al), TON = tonicas(F, al.chars)
  const n = energia?.frames ?? 0
  const rms = (j: number) => (energia && j >= 0 && j < n ? energia.rms[j] : 0)
  let ref = 0.08
  if (energia && n) { const v: number[] = []; for (let j = 0; j < n; j++) if (energia.rms[j] > 0.004) v.push(energia.rms[j]); if (v.length) ref = percentil90(v) }
  const en = (a: number, b: number) => {
    const i0 = Math.max(0, Math.trunc(a * 100)), i1 = Math.max(Math.trunc(a * 100) + 1, Math.trunc(b * 100))
    let s = 0, c = 0; for (let j = i0; j < Math.min(i1, n); j++) { s += rms(j); c++ }
    return c ? s / c / ref : 0
  }
  const thr = 0.12 * ref
  return F.map(([ph, v, s0, e0, i, p], k) => {
    let s = s0, e = e0
    if (n) {
      if (OCLUSIVA.has(ph) && e - s < 0.2) {   // recentra el cierre en el valle de energía cercano
        const c = (s + e) / 2, lo = Math.trunc((c - 0.045) * 100), hi = Math.trunc((c + 0.045) * 100) + 1
        let j = Math.trunc(c * 100)
        if (hi > Math.max(0, lo)) { let best = Infinity; for (let q = Math.max(0, lo); q < hi; q++) { const r = q < n ? rms(q) : Infinity; if (r < best) { best = r; j = q } } }
        const d = (j + 0.5) / 100 - c; s += d * 0.8; e += d * 0.8
      }
      const trasH = F[k][4] > 0 ? (k > 0 && F[k - 1][5] !== p && al.chars[F[k][4] - 1] === 'h') : false
      if (k === 0 || s - F[k - 1][3] > 0.08 || trasH) {   // tras silencio (o h muda): arranca con la voz
        for (let j = Math.trunc(s * 100); j < Math.trunc(e * 100); j++) if (rms(j) > thr) { s = Math.max(s, j / 100 - 0.01); break }
      }
      if (k + 1 < F.length && F[k + 1][2] - e > 0.08) {     // antes de pausa: dura lo que dura la voz
        const a = Math.trunc(e * 100), b = Math.trunc(F[k + 1][2] * 100)
        let ult = -1; for (let j = a; j < b; j++) if (rms(j) > thr) ult = j
        if (ult >= 0) { let todo = true; for (let j = a; j <= ult; j++) if (!(rms(j) > thr)) { todo = false; break } if (todo) e = Math.max(e, (ult + 1) / 100) }
      }
    }
    let amp = 1
    if (VOCALES.includes(v)) amp = (n ? Math.min(1, Math.max(0.45, 0.45 + 0.55 * Math.min(1, en(s, e)))) : 1) * (TON.has(k) ? 1 : 0.82)
    return { f: ph, v, s: Math.round(s * 1000) / 1000, e: Math.round(e * 1000) / 1000, tonica: TON.has(k), amp: Math.round(amp * 1000) / 1000, letra: al.chars[i], palabra: p, i }
  })
}

// ---------------- evaluación continua (coarticulación) ----------------

/** Tramo [a, b) en ms con la boca objetivo de un fonema (ya con el adelanto de 40 ms y sin solapes). */
type Tramo = { a: number; b: number; v: Visema; amp: number; c: [number, number, number, number, number] }
export type Pista = { tramos: Tramo[]; fonemas: Fonema[]; dur: number }

/** Monta la pista: como fonemas.py, cada fonema escribe su tramo encima de los anteriores (el último manda). */
export function pista(F: Fonema[], durS?: number): Pista {
  const MS = Math.floor((durS ?? (F.length ? F[F.length - 1].e + 0.5 : 0)) * 1000) + 1
  const raw = F.map(f => {
    let a = Math.trunc((f.s - LEAD_MS / 1000) * 1000), b = Math.trunc((f.e - LEAD_MS / 1000) * 1000)
    a = Math.max(0, a); b = Math.max(a + 1, Math.min(MS, b))
    let c = [...CANALES[f.v]] as [number, number, number, number, number]
    if (VOCALES.includes(f.v)) { const k = 0.7 + 0.3 * f.amp; c = [c[0] * f.amp, c[1] * k, c[2] * k, c[3], c[4]] }
    return { a, b, v: f.v, amp: f.amp, c }
  })
  // un tramo posterior pisa al anterior donde se solapan: se recorta el anterior (puede partirse en dos)
  const tramos: Tramo[] = []
  raw.forEach((t, k) => {
    let partes: [number, number][] = [[t.a, t.b]]
    for (let q = k + 1; q < raw.length; q++) {
      const o = raw[q]; const sig: [number, number][] = []
      for (const [a, b] of partes) { if (o.b <= a || o.a >= b) sig.push([a, b]); else { if (o.a > a) sig.push([a, o.a]); if (o.b < b) sig.push([o.b, b]) } }
      partes = sig; if (!partes.length) break
    }
    for (const [a, b] of partes) tramos.push({ ...t, a, b })
  })
  tramos.sort((x, y) => x.a - y.a)
  return { tramos, fonemas: F, dur: MS / 1000 }
}

// Gaussiana discreta de fonemas.py (núcleo de ±4σ, normalizado). La convolución de un tramo [a,b) en el ms t es la masa
// del núcleo sobre los k con t−k ∈ [a,b); se usa la CDF continua con corrección de medio ms (error < 1e-3).
function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
const R = 4 * SIGMA_MS
const NORM = (() => { let s = 0; for (let k = -R; k <= R; k++) s += Math.exp(-0.5 * (k / SIGMA_MS) ** 2); return s })()
const PHI = (x: number) => 0.5 * (1 + erf(x / (SIGMA_MS * Math.SQRT2)))
/** Peso del tramo [a,b) en el ms t tras el suavizado (núcleo truncado a ±4σ como np.convolve). */
function masa(a: number, b: number, t: number) {
  // k ∈ [t−b+1, t−a] ∩ [−R, R]
  const k0 = Math.max(-R, t - b + 1), k1 = Math.min(R, t - a)
  if (k1 < k0) return 0
  return (PHI(k1 + 0.5) - PHI(k0 - 0.5)) * Math.sqrt(2 * Math.PI) * SIGMA_MS / NORM
}

function cerca(p: Pista, t: number) {
  // tramos que tocan [t−R, t+R]
  const out: Tramo[] = []
  for (const tr of p.tramos) { if (tr.a > t + R) break; if (tr.b > t - R) out.push(tr) }
  return out
}

export type Boca = { abre: number; ancho: number; redondo: number; cierra: number; muerde: number; pesos: Record<Visema, number> }

/** Canales suavizados en el ms t (sin forzar cierres). */
function canales(p: Pista, t: number) {
  const ch = [0, 0, 0, 0, 0]
  for (const tr of cerca(p, t)) { const w = masa(tr.a, tr.b, t); if (w) for (let j = 0; j < 5; j++) ch[j] += w * tr.c[j] }
  return ch
}

/**
 * La boca en el segundo `tS` de la pista: los 5 canales y los 15 pesos de visema, como un cuadro de visemas.json.
 * `ventanaMs` es la media ventana donde se fuerza el máximo de cierra/muerde (16 ms a 30 cps, 8 ms a 60).
 */
export function boca(p: Pista, tS: number, ventanaMs = 16): Boca {
  const t = Math.trunc(tS * 1000)
  const v = canales(p, t)
  let cierra = v[3], muerde = v[4]
  for (let q = Math.max(0, t - ventanaMs); q < t + ventanaMs + 1; q++) { const c = canales(p, q); if (c[3] > cierra) cierra = c[3]; if (c[4] > muerde) muerde = c[4] }
  let abre = v[0]
  if (cierra > 0.5) abre *= (1 - cierra) * 0.6   // labios juntos ⇒ mandíbula casi cerrada
  const pesos = Object.fromEntries(VISEMAS.map(x => [x, 0])) as Record<Visema, number>
  let suma = 0
  for (const tr of cerca(p, t)) { const w = masa(tr.a, tr.b, t); pesos[tr.v] += w; suma += w }
  pesos.sil += 1 - suma
  return { abre, ancho: v[1], redondo: v[2], cierra, muerde, pesos }
}

// ---------------- pesos del atlas de bocas ----------------

/**
 * Apertura de una vocal en el atlas a partir de su `amp` (0.45-1 por energía, ×0.82 si es átona). Juez ciego del 7 nov
 * (vivo/LEEME.md): con la amp tal cual, las vocales átonas (mediana 0.74) se quedaban en la tesela de media apertura y
 * «los 16 recortes muestran la misma rendija». Con esta curva la vocal típica llega a la tesela entera y la átona débil
 * (0.4) a dos tercios; el orden entre vocales se conserva.
 */
/** Cuánto de su tesela pone una consonante abierta (d, k, s, n, r…): el resto es el neutro. Con la tesela entera la boca
 *  quedaba entreabierta en casi todos los sonidos y las vocales no destacaban (juez ciego, 3.ª ronda). p/b/m y f, enteras. */
export const CONSONANTE = 0.7
export function aperturaAtlas(amp: number) { return Math.min(1, Math.max(0, 0.3 + 0.9 * amp)) }

/**
 * Pesos de las teselas del atlas (rig.js, capa `atlas`) en el segundo `tS`. Cada fonema reparte su peso suavizado entre
 * las teselas de su visema según su apertura: las vocales tienen tesela a 0.5 y a 1.0 y se interpola entre el neutro, la
 * media y la entera; las consonantes, una. Los cierres p/b/m (y la f) se fuerzan al máximo de la ventana del cuadro y
 * los demás ceden lo que haga falta para no pasar de 1. El neutro es lo que sobra (1 − suma), implícito.
 * Devuelve las `max` teselas de más peso: [índice, peso][].
 */
export function pesosAtlas(p: Pista, tS: number, teselas: readonly string[], max = 6, ventanaMs = 8): [number, number][] {
  const t = Math.trunc(tS * 1000)
  const idx = new Map(teselas.map((k, i) => [k, i]))
  const w = new Map<number, number>()
  const suma = (k: string, x: number) => { const i = idx.get(k); if (i === undefined || !x) return; w.set(i, (w.get(i) ?? 0) + x) }
  for (const tr of cerca(p, t)) {
    const m = masa(tr.a, tr.b, t); if (!m || tr.v === 'sil') continue
    if (VOCALES.includes(tr.v) && idx.has(`${tr.v}@0.50`)) {
      const a = aperturaAtlas(tr.amp)
      if (a >= 0.5) { suma(`${tr.v}@1.00`, m * (a - 0.5) / 0.5); suma(`${tr.v}@0.50`, m * (1 - a) / 0.5) } else suma(`${tr.v}@0.50`, m * a / 0.5)
    } else suma(`${tr.v}@1.00`, m * (VOCALES.includes(tr.v) ? aperturaAtlas(tr.amp) : tr.v === 'PP' || tr.v === 'FF' ? 1 : CONSONANTE))
  }
  // cierres y mordida: el máximo de su peso en la ventana del cuadro
  for (const v of ['PP', 'FF'] as const) {
    const i = idx.get(`${v}@1.00`); if (i === undefined) continue
    let f = w.get(i) ?? 0
    for (let q = Math.max(0, t - ventanaMs); q < t + ventanaMs + 1; q += 2) {
      let x = 0; for (const tr of cerca(p, q)) if (tr.v === v) x += masa(tr.a, tr.b, q)
      if (x > f) f = x
    }
    // CIERRE FORZADO: si el cuadro toca el núcleo de un p/b/m (o f), los labios se juntan aunque el fonema dure menos que
    // un cuadro y el suavizado lo deje a medias (a 20 ms por letra llegaba a 0.35: «papá» rápido no cerraba).
    for (const tr of cerca(p, t)) if (tr.v === v && tr.a <= t + ventanaMs && tr.b > t - ventanaMs) f = Math.max(f, FORZADO)
    if (f > (w.get(i) ?? 0)) {
      w.set(i, f)
      let otros = 0; for (const [j, x] of w) if (j !== i) otros += x
      if (otros > 1 - f && otros > 0) { const k = Math.max(0, 1 - f) / otros; for (const [j, x] of w) if (j !== i) w.set(j, x * k) }
    }
  }
  const lista = [...w.entries()].filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, max)
  const tot = lista.reduce((s, [, x]) => s + x, 0)
  return tot > 1 ? lista.map(([i, x]) => [i, x / tot]) : lista
}

/** Une los trozos de alineación que llegan en streaming. Si un trozo trae tiempos relativos a sí mismo (empiezan antes de
 *  donde terminó el anterior), se corren al audio ya recibido. */
export function unirAlineacion(destino: Alineacion, trozo: Alineacion, audioPrevioS: number) {
  if (!trozo.chars.length) return destino
  const ultimo = destino.ends.length ? destino.ends[destino.ends.length - 1] : 0
  const corre = destino.chars.length && trozo.starts[0] + 0.02 < ultimo ? audioPrevioS : 0
  destino.chars.push(...trozo.chars)
  destino.starts.push(...trozo.starts.map(x => x + corre))
  destino.ends.push(...trozo.ends.map(x => x + corre))
  return destino
}

/** Palabras con su tiempo (para los gestos): [{w, s, e}] de la alineación. */
export function palabras(al: Alineacion) {
  const out: { w: string; s: number; e: number }[] = []
  let cur: { w: string; s: number; e: number } | null = null
  al.chars.forEach((c, i) => {
    if (c === ' ') { if (cur) out.push(cur); cur = null; return }
    cur ??= { w: '', s: al.starts[i], e: al.ends[i] }
    cur.w += c; cur.e = al.ends[i]
  })
  if (cur) out.push(cur)
  return out
}
