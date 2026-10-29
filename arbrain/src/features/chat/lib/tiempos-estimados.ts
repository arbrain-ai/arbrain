/**
 * RESPALDO PARA VOCES SIN MARCAS (separado de voz-servidor.ts el 29 oct 2026).
 *
 * La voz del lector (`levy`, sayd) trae las marcas exactas de cada palabra (marcas-voz.ts) y esto NO se usa con ella.
 * Tampoco con LemonFox desde el 29 oct si el alumno tiene su llave de Groq: su daemon saca las marcas con whisper y las
 * ancla a las pausas del audio (arbrain/server/src/cliente/marcas-groq.ts). Queda para las voces que solo devuelven
 * audio: LemonFox sin llave de Groq (o con Groq ocupado), voz-agentes (`say`) cuando el sintetizador caliente falla, y
 * un agent-server anterior al 29 oct que todavía no manda `X-Marcas`. Es una ESTIMACIÓN: medida el 23 oct contra las
 * marcas reales, error medio 0.051 s y p95 0.083 s (ver 67a86033).
 */

export interface Tramo {
  from: number
  to: number
}

// Pausa que la voz hace tras la puntuación, en «caracteres equivalentes». Medido con Juan Enhanced a 175 ppm: un punto
// calla ~0.35 s (≈5 caracteres a 14/s), una coma ~0.15 s.
const PAUSA: Array<[RegExp, number]> = [
  [/[.!?…]/, 6],
  [/[:;]/, 4],
  [/[,—–]/, 2.5],
]
// Silencio de arranque y de cierre de `say` + ffmpeg (≈0.05 s cada uno, medido en los MP3 de voz-agentes).
const MARGEN_S = 0.05

function pausaTras(spoken: string, w: Tramo): number {
  // La puntuación pegada al final de la palabra («hoy,», «fin.»), o la que viene sola después de ella.
  let peso = 0
  const cola = spoken.slice(Math.max(w.from, w.to - 2), w.to) + (spoken.slice(w.to).match(/^\s*([.,;:!?…—–])/)?.[1] ?? '')
  for (const [re, p] of PAUSA) if (re.test(cola)) peso = Math.max(peso, p)
  return peso
}

/**
 * Segundo en que empieza cada palabra, repartiendo la duración real del audio por caracteres: cada palabra pesa su
 * longitud más el espacio que la sigue y la pausa de su puntuación. Puro, para poder testearlo sin navegador.
 */
export function tiemposDePalabras(spoken: string, words: Tramo[], duracion: number): number[] {
  if (!words.length || !(duracion > 0)) return words.map(() => 0)
  const pesos = words.map((w) => w.to - w.from + 1 + pausaTras(spoken, w))
  const total = pesos.reduce((a, b) => a + b, 0)
  const util = Math.max(0.1, duracion - 2 * MARGEN_S)
  const out: number[] = []
  let acc = 0
  for (const p of pesos) {
    out.push(MARGEN_S + (acc / total) * util)
    acc += p
  }
  return out
}

/**
 * Silencios del audio, `[inicio, fin]` en segundos. Ventanas de 5 ms; callado = 35 dB por debajo de lo fuerte de la
 * propia voz (percentil 95), así no depende del volumen del tramo. El silencio de arranque y el de cierre cuentan aunque
 * sean cortos; los de en medio, desde `minimo`.
 */
export function silenciosDe(pcm: Float32Array, sr: number, minimo = 0.03): Array<[number, number]> {
  const h = Math.max(1, Math.round(sr * 0.005))
  const n = Math.floor(pcm.length / h)
  if (n < 2) return []
  const db = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = i * h; j < (i + 1) * h; j++) s += pcm[j] * pcm[j]
    db[i] = 10 * Math.log10(s / h + 1e-12)
  }
  const umbral = Array.from(db).sort((a, b) => a - b)[Math.floor(0.95 * (n - 1))] - 35
  const out: Array<[number, number]> = []
  let ini = -1
  for (let i = 0; i <= n; i++) {
    const callado = i < n && db[i] < umbral
    if (callado && ini < 0) ini = i
    else if (!callado && ini >= 0) {
      if (ini === 0 || i === n || ((i - ini) * h) / sr >= minimo) out.push([(ini * h) / sr, (i * h) / sr])
      ini = -1
    }
  }
  return out
}

/**
 * Segundo en que empieza cada palabra, ANCLADO AL AUDIO REAL (23 oct 2026, Daniel: «el fondo amarillo va
 * desincronizado, el verdadero sonido va unas palabras más adelante»).
 *
 * Medido contra las marcas exactas de la misma voz (AVSpeechSynthesizer con Juan Enhanced a rate 0.5 produce el MISMO
 * audio, muestra por muestra, que `say -r 175`, y su `willSpeakRange` da el inicio de cada palabra): repartir la
 * duración por caracteres con un peso fijo por puntuación (tiemposDePalabras) se desvía hasta 0.68 s a 1x y 0.34 s a 2x,
 * porque la pausa real de cada coma o punto varía y el error se acumula de frase en frase. Aquí las pausas no se
 * adivinan: se buscan los silencios en el PCM decodificado, cada puntuación se empareja con el silencio más cercano a
 * donde la estimación la esperaba (programación dinámica, en orden), y solo DENTRO de cada frase se reparte por
 * caracteres entre el fin de un silencio y el inicio del siguiente. Arranque y cierre salen del audio, no de un margen.
 */
export function tiemposDelAudio(spoken: string, words: Tramo[], pcm: Float32Array, sr: number): number[] {
  const duracion = pcm.length / sr
  if (!words.length || !(duracion > 0)) return words.map(() => 0)
  const sil = silenciosDe(pcm, sr)
  let voz0 = 0
  let vozFin = duracion
  if (sil.length && sil[0][0] === 0) voz0 = sil[0][1]
  if (sil.length && sil[sil.length - 1][1] >= duracion - 0.006) vozFin = sil[sil.length - 1][0]
  if (!(vozFin - voz0 > 0.05)) return tiemposDePalabras(spoken, words, duracion)
  const interiores = sil.filter(([a, b]) => a > voz0 && b < vozFin)

  const largo = words.map((w) => w.to - w.from + 1)
  const pausa = words.map((w) => pausaTras(spoken, w))
  const fr: number[] = []
  for (let i = 0; i < words.length - 1; i++) if (pausa[i] > 0) fr.push(i)
  // Las pausas de puntuación duran varias veces lo que el cierre de una oclusiva («p», «t»): a cualquier velocidad, las
  // candidatas son las que llegan al 45 % de la mediana de las K más largas (K = puntuaciones del tramo).
  const durs = interiores.map(([a, b]) => b - a).sort((a, b) => b - a).slice(0, Math.max(1, fr.length))
  const minPausa = 0.45 * (durs[durs.length >> 1] ?? 0)
  const dentro = interiores.filter(([a, b]) => b - a >= minPausa)

  // Estimación base sobre la voz (sin los silencios de los bordes): dice dónde ESPERAR cada pausa.
  const base = tiemposDePalabras(spoken, words, vozFin - voz0 + 2 * MARGEN_S).map((t) => t - MARGEN_S + voz0)
  const totalPeso = largo.reduce((a, b) => a + b, 0) + pausa.reduce((a, b) => a + b, 0)
  const porCaracter = (vozFin - voz0) / totalPeso

  // Fronteras con puntuación (entre la palabra i y la i+1) contra silencios interiores, en orden. Una frontera puede
  // quedarse sin silencio (coma que la voz no calló) y un silencio sin frontera (oclusiva larga): ambos con costo.
  const K = fr.length
  const S = dentro.length
  const SIN_SILENCIO = 15 * porCaracter
  const TOPE = 40 * porCaracter
  const costo = (k: number, s: number) => {
    const d = Math.abs(base[fr[k] + 1] - dentro[s][1])
    return d > TOPE ? Infinity : d - Math.min(dentro[s][1] - dentro[s][0], 4 * porCaracter)
  }
  // dp[k][s]: mejor costo usando las primeras k fronteras y los primeros s silencios.
  const dp: number[][] = Array.from({ length: K + 1 }, () => new Array<number>(S + 1).fill(Infinity))
  const de: Array<Array<0 | 1 | 2>> = Array.from({ length: K + 1 }, () => new Array<0 | 1 | 2>(S + 1).fill(0))
  dp[0][0] = 0
  for (let k = 0; k <= K; k++) for (let s = 0; s <= S; s++) {
    const v = dp[k][s]
    if (v === Infinity) continue
    if (k < K && v + SIN_SILENCIO < dp[k + 1][s]) { dp[k + 1][s] = v + SIN_SILENCIO; de[k + 1][s] = 1 }
    if (s < S && v < dp[k][s + 1]) { dp[k][s + 1] = v; de[k][s + 1] = 2 }
    if (k < K && s < S) {
      const c = v + costo(k, s)
      if (c < dp[k + 1][s + 1]) { dp[k + 1][s + 1] = c; de[k + 1][s + 1] = 0 }
    }
  }
  // Silencio asignado a cada palabra que cierra frase (índice de palabra → silencio).
  const ancla = new Map<number, [number, number]>()
  for (let k = K, s = S; k > 0 || s > 0;) {
    const paso = de[k][s]
    if (paso === 0 && k > 0 && s > 0) { ancla.set(fr[k - 1], dentro[s - 1]); k--; s-- }
    else if (paso === 1 && k > 0) k--
    else s--
  }

  // Dentro de cada frase (de un ancla a la siguiente), por caracteres; la pausa de una puntuación sin silencio propio
  // sigue contando como antes.
  const out = new Array<number>(words.length)
  let ini = 0
  let t0 = voz0
  for (let i = 0; i < words.length; i++) {
    const a = ancla.get(i)
    if (!a && i < words.length - 1) continue
    const t1 = a ? a[0] : vozFin
    const pesos: number[] = []
    for (let j = ini; j <= i; j++) pesos.push(j === i ? largo[j] - 1 : largo[j] + pausa[j])
    const total = pesos.reduce((x, y) => x + y, 0) || 1
    let acc = 0
    for (let j = ini; j <= i; j++) {
      out[j] = t0 + (acc / total) * Math.max(0, t1 - t0)
      acc += pesos[j - ini]
    }
    if (a) t0 = a[1]
    ini = i + 1
  }
  return out
}
