// Boca de la cara 2D sincronizada con la voz REAL (4 oct 2026, frente 2D de la noche de Levy).
//
// Antes la boca leía visemas estimados del texto, repartidos por una duración también estimada
// (`elapsed / duration`), y la energía de un analizador de la mezcla. Medido contra el audio que sonó:
// correlación apertura↔voz 0.24 y la boca a medio abrir en los silencios (0.12 de mandíbula contra 0.23
// con voz), porque el reloj del texto y el del audio se desalineaban a mitad de frase.
//
// Ahora, con el PCM ya decodificado que el reproductor guarda por frase (VoiceTrack):
//   1. ENERGÍA exacta del instante que suena, cada 10 ms, con una banda aguda (sibilantes) aparte.
//   2. ALINEACIÓN: en cuanto la frase termina de llegar (ElevenLabs entrega más rápido que el tiempo
//      real, así que pasa en los primeros instantes) se alinea por DTW la curva esperada de los visemas
//      del texto (vocal alta, consonante media, pausa cero) con la energía real. Cada vocal cae sobre su
//      sílaba y cada pausa sobre su silencio. Mientras llega, el reparto lineal de siempre.
// Nada de esto añade latencia: todo se calcula sobre audio que ya está en memoria.
import type { VoiceTrack } from '@/features/live/voice/player'

const HOP = 0.01
type Event = { t: number; dur: number; viseme: string }
export type Timeline = { events: Event[]; total: number }

type Features = { frames: number; rms: Float32Array; hf: Float32Array; samples: number; chunk: number; offset: number; acc: Float32Array; accN: number; prev: number }
const cache = new WeakMap<VoiceTrack, Features>()

/** Avanza las características de la pista hasta la última muestra recibida (incremental, O(nuevas)). */
export function features(track: VoiceTrack): Features {
  const hop = Math.round(track.rate * HOP)
  let f = cache.get(track)
  if (!f) { f = { frames: 0, rms: new Float32Array(1024), hf: new Float32Array(1024), samples: 0, chunk: 0, offset: 0, acc: new Float32Array(hop), accN: 0, prev: 0 }; cache.set(track, f) }
  while (f.chunk < track.chunks.length) {
    const c = track.chunks[f.chunk]
    while (f.offset < c.length) {
      const take = Math.min(hop - f.accN, c.length - f.offset)
      f.acc.set(c.subarray(f.offset, f.offset + take), f.accN)
      f.accN += take; f.offset += take
      if (f.accN === hop) {
        let e = 0, d = 0, p = f.prev
        for (let i = 0; i < hop; i++) { const v = f.acc[i]; e += v * v; d += (v - p) * (v - p); p = v }
        f.prev = p
        if (f.frames >= f.rms.length) { const grow = (a: Float32Array) => { const b = new Float32Array(a.length * 2); b.set(a); return b }; f.rms = grow(f.rms); f.hf = grow(f.hf) }
        const rms = Math.sqrt(e / hop)
        f.rms[f.frames] = rms
        // Cociente derivada/señal: ~0.1-0.3 en vocales, >1 en ruido de fricación (s, ch, f).
        f.hf[f.frames] = rms > 1e-4 ? Math.sqrt(d / hop) / rms : 0
        f.frames++; f.accN = 0
      }
    }
    if (f.chunk === track.chunks.length - 1) break
    f.chunk++; f.offset = 0
  }
  return f
}

/** Referencia de volumen de la frase: el percentil 90 de la energía con voz (cada frase se normaliza sola). */
function reference(f: Features) {
  const voiced: number[] = []
  for (let i = 0; i < f.frames; i++) if (f.rms[i] > 0.004) voiced.push(f.rms[i])
  if (voiced.length < 5) return 0.08
  voiced.sort((a, b) => a - b)
  return Math.max(0.02, voiced[Math.floor(voiced.length * 0.9)])
}

const refCache = new WeakMap<Features, { frames: number; ref: number }>()
function ref(f: Features) {
  const r = refCache.get(f)
  if (r && (r.frames === f.frames || f.frames - r.frames < 25)) return r.ref
  const value = reference(f); refCache.set(f, { frames: f.frames, ref: value }); return value
}

/** [mandíbula 0..1, sibilancia 0..1] en el segundo `t` de la frase, interpolado entre cuadros de 10 ms. */
export function energyAt(track: VoiceTrack, t: number): [number, number] {
  const f = features(track)
  if (!f.frames) return [0, 0]
  const x = t / HOP - 0.5, i = Math.max(0, Math.min(f.frames - 1, Math.floor(x))), j = Math.min(f.frames - 1, i + 1), w = Math.max(0, Math.min(1, x - i))
  const rms = f.rms[i] * (1 - w) + f.rms[j] * w
  const hf = f.hf[i] * (1 - w) + f.hf[j] * w
  const r = ref(f)
  const lo = Math.min(1, Math.pow(Math.max(0, rms - 0.003) / r, 0.6))
  const hi = Math.min(1, Math.max(0, (hf - 0.45) / 0.7)) * Math.min(1, (rms / r) * 3)
  return [lo, hi]
}

/** Curva que el texto «espera» oír: vocal = fuerte, consonante = media, cierre y pausa = silencio. */
const LOUD: Record<string, number> = { aa: 1, E: 0.95, O: 0.95, I: 0.85, U: 0.8, DD: 0.45, kk: 0.35, CH: 0.45, FF: 0.3, PP: 0.12, sil: 0 }

/**
 * Alinea la timeline de visemas (ms, sin escalar) con la energía de la pista completa. Devuelve el mapa
 * cuadro de audio → ms de timeline. Sakoe-Chiba sobre la reescala lineal: nunca se aleja más de 0.7 s
 * de la proporción, así que un texto con números o siglas mal leídos degrada al reparto lineal.
 */
export function align(tl: Timeline, track: VoiceTrack): Float32Array | null {
  const f = features(track)
  const n = f.frames
  if (n < 10 || !tl.total || !tl.events.length) return null
  const m = Math.max(10, Math.round(tl.total / (HOP * 1000)))
  const expected = new Float32Array(m)
  for (const e of tl.events) {
    const a = Math.floor(e.t / (HOP * 1000)), b = Math.min(m, Math.ceil((e.t + e.dur) / (HOP * 1000)))
    for (let k = a; k < b; k++) expected[k] = Math.max(expected[k], LOUD[e.viseme] ?? 0.4)
  }
  const r = ref(f)
  const audio = new Float32Array(n)
  for (let i = 0; i < n; i++) audio[i] = Math.min(1, Math.max(0, f.rms[i] - 0.003) / r)
  const band = Math.max(25, Math.round(0.7 / HOP))
  const INF = 1e9
  const cost = new Float32Array(n * m).fill(INF)
  const at = (i: number, j: number) => cost[i * m + j]
  for (let i = 0; i < n; i++) {
    const center = Math.round(i * (m - 1) / Math.max(1, n - 1))
    const j0 = Math.max(0, center - band), j1 = Math.min(m - 1, center + band)
    for (let j = j0; j <= j1; j++) {
      const d = Math.abs(audio[i] - expected[j])
      if (i === 0 && j === 0) { cost[0] = d; continue }
      const best = Math.min(i > 0 && j > 0 ? at(i - 1, j - 1) : INF, i > 0 ? at(i - 1, j) + 0.02 : INF, j > 0 ? at(i, j - 1) + 0.02 : INF)
      cost[i * m + j] = d + best
    }
  }
  if (at(n - 1, m - 1) >= INF) return null
  // Recorrido inverso: para cada cuadro de audio, el promedio de los cuadros de texto que le tocan.
  const sum = new Float32Array(n), cnt = new Float32Array(n)
  let i = n - 1, j = m - 1
  while (i > 0 || j > 0) {
    sum[i] += j; cnt[i]++
    const d = i > 0 && j > 0 ? at(i - 1, j - 1) : INF, u = i > 0 ? at(i - 1, j) : INF, l = j > 0 ? at(i, j - 1) : INF
    if (d <= u && d <= l) { i--; j-- } else if (u <= l) i--; else j--
  }
  sum[0] += 0; cnt[0]++
  const map = new Float32Array(n)
  let last = 0
  for (let k = 0; k < n; k++) { const v = Math.max(last, (sum[k] / cnt[k]) * HOP * 1000); map[k] = v; last = v }
  // Suavizado corto (30 ms): el camino de DTW escalona y la boca lo notaría como tic.
  const out = new Float32Array(n)
  for (let k = 0; k < n; k++) { let s = 0, c = 0; for (let q = Math.max(0, k - 1); q <= Math.min(n - 1, k + 1); q++) { s += map[q]; c++ } out[k] = s / c }
  return out
}

/** Reloj de la timeline para el segundo `t` de audio: alineado si ya se pudo, si no reparto lineal. */
export function timelineMs(map: Float32Array | null, tl: Timeline, t: number, duration: number) {
  if (map && map.length) {
    const x = t / HOP, i = Math.max(0, Math.min(map.length - 1, Math.floor(x))), j = Math.min(map.length - 1, i + 1), w = Math.max(0, Math.min(1, x - i))
    return map[i] * (1 - w) + map[j] * w
  }
  return Math.min(1, t / Math.max(0.2, duration)) * tl.total
}

/**
 * Desfase entre el reloj de posición y lo que de verdad está saliendo. Con el Studio cargado (una
 * compilación en paralelo) medimos el AnalyserNode ~0.25 s por delante de `position.elapsed` en las
 * mismas frases; sin carga, 0 ms. El analizador es lo último que el motor entregó al dispositivo, así
 * que se calibra contra él: se guarda (elapsed, nivel) y se busca el corrimiento que mejor alinea el
 * nivel con la energía del PCM. Sin carga sale 0 y nada cambia; con carga la boca deja de atrasarse.
 */
export class Calibrador {
  private muestras: { e: number; l: number }[] = []
  private track: VoiceTrack | null = null
  private ultimo = 0
  offset = 0
  observar(track: VoiceTrack, elapsed: number, level: number, ahora: number) {
    if (track !== this.track) { this.track = track; this.muestras = [] }
    const previa = this.muestras.at(-1)
    if (!previa || elapsed - previa.e > 0.008) this.muestras.push({ e: elapsed, l: level })
    if (this.muestras.length > 150) this.muestras.shift()
    if (ahora - this.ultimo < 500 || this.muestras.length < 45) return
    this.ultimo = ahora
    const f = features(track)
    const rms = (t: number) => { const i = Math.round(t / HOP); return i >= 0 && i < f.frames ? f.rms[i] : 0 }
    const ls = this.muestras.map(m => m.l), ml = ls.reduce((a, b) => a + b, 0) / ls.length
    let mejor = { c: -1, d: 0 }
    for (let d = 0; d <= 0.4001; d += 0.02) {
      const es = this.muestras.map(m => rms(m.e + d)), me = es.reduce((a, b) => a + b, 0) / es.length
      let num = 0, va = 0, vb = 0
      for (let k = 0; k < es.length; k++) { const a = es[k] - me, b = ls[k] - ml; num += a * b; va += a * a; vb += b * b }
      const c = va > 0 && vb > 0 ? num / Math.sqrt(va * vb) : -1
      if (c > mejor.c + 0.02 || (Math.abs(c - mejor.c) <= 0.02 && d < mejor.d)) mejor = { c, d }
    }
    // Solo con evidencia clara (correlación alta) y con inercia: un tramo ambiguo no mueve la boca.
    if (mejor.c > 0.6) this.offset += (mejor.d - this.offset) * 0.5
  }
}
