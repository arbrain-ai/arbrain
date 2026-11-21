// La boca de los VIDEOS de Levy en tiempo real (18 nov 2026).
//
// Daniel, viendo hablar a Levy en Live: «el movimiento de los labios está culerísimo, esto ya lo habíamos resuelto en mis
// videos de levy». La boca de los videos es `boca_nueva.py` (labs/god-animation/practicas/2026-11-11-levy-2d-labios, el
// comando `labios.sh`): letras con su tiempo → fonemas en español → 4 canales de LivePortrait (abre, ancho, redondo, cierra).
// Este archivo es su puerto exacto, regla por regla, evaluable en cualquier instante del audio que suena:
//
//  1. Cada letra dura de su inicio al inicio de la siguiente letra de la MISMA palabra; la última de la palabra se alarga
//     mientras haya voz (energía), hasta 0,3 s o la palabra siguiente.
//  2. Formas medidas en la rejilla de LivePortrait: la o y la u redondean ESTRECHANDO las comisuras (ancho negativo), sin
//     «redondo» (que adelanta los labios en beso); la e y la i estiran; la a abre más que ninguna (0,82: más arriba
//     LivePortrait dibuja dientes y labio doble). Vocal átona: apertura × 0,8; o/u átonas redondean × 0,6.
//  3. p, b, v y m CIERRAN: labios juntos desde que empieza el sonido hasta que suelta, como mínimo 2,5 cuadros de 30 cps
//     (siempre el centro de 2 cuadros), con presión; mientras cierra, ni la e separa los labios ni la o los frunce.
//  4. Coarticulación: las consonantes de lengua (t d n l s r k g…) toman la forma de labios de la vocal vecina y abren poco;
//     el cierre conserva la forma de la vocal que viene («mo», «bu»). Adelanto de 10 ms, transiciones con σ 20 ms.
//  5. Antibeso: en cada instante el redondeo no pasa de lo que abre la boca (ancho ≥ −2·abre, redondo ≤ 2·abre).
//  6. Silencio = reposo: fuera de la voz (−48 dBFS, ±2 cuadros) la boca descansa.
//
// La alineación de Live (voz local, Qwen3-ForcedAligner por palabra y letras repartidas) va ~0 ms de la de MMS_FA que usa
// labios.sh con su adelanto de 30 ms ya aplicado (mediana +4 ms en la frase de prueba del 18 nov): se usa tal cual.
// Paridad con boca_nueva.py en tests/chat/levy-boca.test.ts.
import { g2p, tonicas, type Alineacion, type Energia } from './levy-visemas'

type Forma = readonly [abre: number, ancho: number | null, redondo: number | null]
/** Formas de boca_nueva.py (PAR['formas'], ronda r18 «FINAL» del 11 nov). null = toma la forma de la vocal vecina. */
export const FORMAS: Record<string, Forma> = {
  aa: [0.82, 0.20, 0.0], E: [0.26, 0.70, 0.0], I: [0.10, 0.80, 0.0], O: [0.55, -1.10, 0.0], U: [0.18, -1.30, 0.0],
  PP: [0.0, 0.0, 0.0], FF: [0.05, 0.30, 0.0], DD: [0.12, null, null], nn: [0.10, null, null], TH: [0.10, null, null],
  SS: [0.06, null, null], kk: [0.16, null, null], RR: [0.14, null, null], CH: [0.12, -0.6, 0.6], sil: [0.0, 0.0, 0.0],
}
export const PAR = {
  atona: 0.80, adelanto: 0.010, sigmaMs: 20, cierreMinCuadros: 2.5, mezclaVocal: 0.60, mezclaRedondo: 0.40,
  antibeso: 2.0, redondeoAtona: 0.6, fps: 30, umbralDb: -48,
} as const
const VOCALES = new Set(['aa', 'E', 'I', 'O', 'U'])
const esLetra = (c: string) => /\p{L}/u.test(c)

export type FonemaBoca = { f: string; v: string; s: number; e: number; abre: number; ancho: number; redondo: number; palabra: number; tonica: boolean; letra: string }
/** La pista de una frase: objetivo por ms (abre, ancho, redondo), cierres por ms y la compuerta de silencio a 30 cps. */
export type PistaBoca = { ms: number; tgt: Float32Array; cie: Uint8Array; comp: Float32Array; fonemas: FonemaBoca[]; dur: number }
export type Canales = { abre: number; ancho: number; redondo: number; cierra: number }

const NUCLEO = (() => {
  const s = PAR.sigmaMs, k: number[] = []
  for (let i = -4 * s; i <= 4 * s; i++) k.push(Math.exp(-0.5 * (i / s) ** 2))
  const t = k.reduce((a, b) => a + b, 0)
  return Float32Array.from(k.map(x => x / t))
})()

/** Percentil como numpy (interpolación lineal). */
function percentil(v: number[], q: number) {
  const s = [...v].sort((a, b) => a - b), x = q * (s.length - 1), i = Math.floor(x), j = Math.min(s.length - 1, i + 1)
  return s[i] + (s[j] - s[i]) * (x - i)
}

/**
 * Monta la pista de boca de una frase. `energia` = RMS del audio a 10 ms (levy-lipsync `features`, la misma medida que
 * boca_nueva.py hace del WAV). `durS` = segundos de audio de la frase (lo recibido hasta ahora si sigue llegando).
 */
export function pistaBoca(al: Alineacion, energia: Energia, durS: number): PistaBoca {
  const C = al.chars, S = [...al.starts], E = [...al.ends], n = energia.frames
  const rms = (j: number) => (n ? energia.rms[Math.min(n - 1, Math.max(0, j))] : 0)
  const voces: number[] = []
  for (let j = 0; j < n; j++) if (energia.rms[j] > 0.004) voces.push(energia.rms[j])
  const ref = voces.length > 10 ? percentil(voces, 0.9) : 0.05
  const voz = (t: number) => rms(Math.trunc(t * 100)) > 0.10 * ref
  const DUR = Math.max(durS, 0.01)
  // 1. intervalos por letra
  const letras: number[] = []
  C.forEach((c, i) => { if (esLetra(c)) letras.push(i) })
  letras.forEach((a, k) => {
    const b = k + 1 < letras.length ? letras[k + 1] : null
    let mismo = b !== null
    if (b !== null) for (let q = a + 1; q < b; q++) if (C[q] !== "'") { mismo = false; break }
    if (mismo) E[a] = S[b!]
    else {
      const lim = Math.min(S[a] + 0.30, b !== null ? S[b] : DUR)
      let t = Math.max(E[a], S[a] + 0.04)
      while (t + 0.01 < lim && voz(t)) t += 0.01
      E[a] = Math.max(E[a], t)
    }
  })
  const F = g2p({ chars: C, starts: S, ends: E }), TON = tonicas(F, C)
  // 2. objetivo por fonema
  const fon: FonemaBoca[] = F.map(([f, v, s, e, i, p], k) => {
    let [ab, an, re] = FORMAS[v] ?? FORMAS.DD
    if (VOCALES.has(v) && !TON.has(k)) {
      ab *= PAR.atona
      if (v === 'O' || v === 'U') { an = an! * PAR.redondeoAtona; re = re! * PAR.redondeoAtona }
    }
    return { f, v, s, e, abre: ab, ancho: an as number, redondo: re as number, palabra: p, tonica: TON.has(k), letra: C[i] }
  })
  const pendientes = new Set<number>()
  F.forEach(([, v], k) => { if ((FORMAS[v] ?? FORMAS.DD)[1] === null) pendientes.add(k) })
  const voc = fon.flatMap((f, k) => (VOCALES.has(f.v) ? [k] : []))
  fon.forEach((f, k) => {
    if (pendientes.has(k)) {   // consonante de lengua: labios de la vocal vecina (la siguiente de su palabra; si no, la anterior)
      const sig = voc.find(j => j > k && fon[j].palabra === f.palabra)
      let ant: number | undefined
      for (let q = voc.length - 1; q >= 0; q--) if (voc[q] < k) { ant = voc[q]; break }
      const j = sig ?? ant
      const va = j !== undefined ? fon[j].ancho : 0.3
      const mr = va < 0 ? PAR.mezclaRedondo : PAR.mezclaVocal   // el redondeo se anticipa menos
      f.ancho = j !== undefined ? mr * va + (1 - mr) * 0.3 : 0.3
      f.redondo = j !== undefined ? mr * fon[j].redondo : 0
    }
    if (f.v === 'PP') {   // el cierre conserva la forma de la vocal que viene en su palabra
      const sig = voc.find(j => j > k)
      const misma = sig !== undefined && fon[sig].palabra === f.palabra
      f.ancho = misma ? 0.6 * fon[sig!].ancho : 0
      f.redondo = misma ? 0.6 * fon[sig!].redondo : 0
    }
  })
  // 3. objetivo por ms (el último fonema manda donde se solapan) y cierres de ≥ 2,5 cuadros
  const MS = Math.trunc(DUR * 1000) + 2, LEAD = PAR.adelanto
  const tgt = new Float32Array(MS * 3), cie = new Uint8Array(MS)
  for (const f of fon) {
    let a = Math.max(0, Math.trunc((f.s - LEAD) * 1000)), b = Math.trunc((f.e - LEAD) * 1000)
    b = Math.max(a + 1, Math.min(MS, b))
    for (let t = a; t < b; t++) { tgt[t * 3] = f.abre; tgt[t * 3 + 1] = f.ancho; tgt[t * 3 + 2] = f.redondo }
    if (f.v === 'PP') {
      const mn = Math.trunc(PAR.cierreMinCuadros * 1000 / PAR.fps), c = Math.trunc((a + b) / 2)
      if (b - a < mn) { a = Math.max(0, c - Math.trunc(mn / 2)); b = Math.min(MS, c + mn - Math.trunc(mn / 2)) }
      cie.fill(1, a, b)
    }
  }
  // 4. compuerta de silencio a 30 cps (la del 9 nov): voz si el cuadro pasa de −48 dBFS, ±2 cuadros, media de 3
  const N = Math.max(1, Math.round(DUR * PAR.fps))
  const v = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const j0 = Math.trunc(i / PAR.fps * 100), j1 = Math.max(j0 + 1, Math.trunc((i + 1) / PAR.fps * 100))
    if (j1 > n) { v[i] = 0; continue }
    let e2 = 0; for (let j = j0; j < j1; j++) e2 += energia.rms[j] ** 2
    v[i] = 20 * Math.log10(Math.sqrt(e2 / (j1 - j0)) + 1e-7) > PAR.umbralDb ? 1 : 0
  }
  const d = new Float32Array(N), comp = new Float32Array(N)
  for (let i = 0; i < N; i++) { let m = 0; for (let s = -2; s <= 2; s++) m = Math.max(m, v[(i + s + N) % N]); d[i] = m }   // np.roll: da la vuelta
  for (let i = 0; i < N; i++) comp[i] = ((i > 0 ? d[i - 1] : 0) + d[i] + (i + 1 < N ? d[i + 1] : 0)) / 3
  return { ms: MS, tgt, cie, comp, fonemas: fon, dur: DUR }
}

/** Los 4 canales en el segundo `tS` de la frase (como un cuadro de boca.json, en cualquier instante). */
export function canalesEn(p: PistaBoca, tS: number): Canales {
  const t = Math.min(p.ms - 1, Math.max(0, Math.trunc(tS * 1000)))
  const R = (NUCLEO.length - 1) / 2
  let ab = 0, an = 0, re = 0
  for (let k = 0; k < NUCLEO.length; k++) {
    const q = Math.min(p.ms - 1, Math.max(0, t + k - R)) * 3, g = NUCLEO[k]
    ab += g * p.tgt[q]; an += g * p.tgt[q + 1]; re += g * p.tgt[q + 2]
  }
  const c = p.cie[t]
  if (an < 0) an = Math.max(an, -PAR.antibeso * ab)
  re = Math.min(re, PAR.antibeso * ab)
  if (c > 0.5) { ab = 0; an = Math.min(0.3, Math.max(-0.3, an)); re = Math.min(re, 0.4) }
  // compuerta, interpolada entre centros de cuadro de 30 cps
  const x = tS * PAR.fps - 0.5, i = Math.floor(x), w = x - i, N = p.comp.length
  const ci = (j: number) => p.comp[Math.min(N - 1, Math.max(0, j))]
  const g = ci(i) * (1 - w) + ci(i + 1) * w
  return { abre: Math.max(0, ab) * g, ancho: an * g, redondo: Math.max(0, re) * g, cierra: c }
}

/** Manifiesto del atlas POR CANALES (atlas.json v2, `modo: 'canales'`): la rejilla en la que se hornearon las poses. */
export type AtlasCanales = { modo: 'canales'; teselas: string[]; rejilla_canales: { abre: number[]; ancho: number[]; cierre_ancho: number[]; ch: { abre: number; ancho: number; redondo: number } }
  /** Cuánto más abre la pose que el canal. En los videos LivePortrait recibe además el cabeceo y la sonrisa del movimiento,
   *  que abren la boca (medido el 18 nov: con los mismos canales, apertura del video ÷ la de Live ≈ 1,3 en la mediana); en Live
   *  la cabeza se mueve aparte y no abre la boca, así que el atlas lo compensa aquí. La regla de la boca no cambia. */
  ganancia_abre?: number }
export const esAtlasCanales = (m: unknown): m is AtlasCanales => !!m && (m as { modo?: string }).modo === 'canales'

const nombreRejilla = (a: number, w: number) => `g${a.toFixed(2)}_${w >= 0 ? '+' : '-'}${Math.abs(w).toFixed(2)}`
const nombreCierre = (w: number) => `PP_${w >= 0 ? '+' : '-'}${Math.abs(w).toFixed(2)}`
function celda(xs: number[], x: number): [number, number] {
  const v = Math.min(xs[xs.length - 1], Math.max(xs[0], x))
  let i = 0; while (i < xs.length - 2 && v > xs[i + 1]) i++
  return [i, (v - xs[i]) / (xs[i + 1] - xs[i])]
}

/**
 * Pesos de las teselas para unos canales: bilineal en la rejilla abre × ancho; con los labios juntos, las teselas de cierre
 * (bilineal en ancho); el redondeo de la ch, su tesela. El neutro (tesela 0, «sil») se lleva lo que sobra.
 */
export function pesosCanales(c: Canales, m: AtlasCanales): [number, number][] {
  const idx = new Map(m.teselas.map((k, i) => [k, i]))
  const w = new Map<number, number>()
  const suma = (k: string, x: number) => { if (x <= 1e-5) return; const i = idx.get(k); if (i === undefined || i === 0) return; w.set(i, (w.get(i) ?? 0) + x) }
  const R = m.rejilla_canales
  if (c.cierra > 0.5) {
    const [j, f] = celda(R.cierre_ancho, c.ancho)
    suma(nombreCierre(R.cierre_ancho[j]), 1 - f); suma(nombreCierre(R.cierre_ancho[j + 1]), f)
  } else {
    const r = Math.min(1, Math.max(0, c.redondo / Math.max(1e-6, R.ch.redondo)))
    const [ia, fa] = celda(R.abre, c.abre * (m.ganancia_abre ?? 1)), [iw, fw] = celda(R.ancho, c.ancho)
    for (const [da, pa] of [[0, 1 - fa], [1, fa]] as const) for (const [dw, pw] of [[0, 1 - fw], [1, fw]] as const) {
      const a = R.abre[ia + da], an = R.ancho[iw + dw]
      if (a === 0 && an === 0) continue   // el neutro
      suma(nombreRejilla(a, an), (1 - r) * pa * pw)
    }
    suma('CH', r)
  }
  return [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
}
