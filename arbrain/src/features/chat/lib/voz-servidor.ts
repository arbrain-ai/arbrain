/**
 * VOZ DE SERVIDOR PARA EL LECTOR (22 oct 2026).
 *
 * Daniel: «la velocidad 1.75x no funciona en mi laptop». La voz del navegador (speechSynthesis) acelera o no según la
 * voz y el navegador, y en su equipo ignora `rate` aunque se cambie de voz (18499cb7 no bastó). El remedio robusto es no
 * depender de ella: el servidor genera el audio del párrafo A 1x y el navegador lo reproduce en un `<audio>` con
 * `playbackRate` y `preservesPitch`, que acelera igual en Chrome, Safari, WKWebView y el iPhone.
 *
 * Motor: voz-agentes del Studio (Juan Enhanced, la voz de Levy) por el `/tts` del servidor. LemonFox estaba en el
 * encargo, pero sus llaves dan 401 (medido el 22 oct en las dos de la casa).
 *
 * Resaltado: `say` no da marcas de tiempo, así que se estiman con la DURACIÓN REAL del audio repartida por caracteres,
 * con un peso extra por la pausa que la voz hace en la puntuación (ver tiemposDePalabras()).
 *
 * Este módulo no sabe nada del chat: recibe texto hablado, devuelve audio y tiempos. Si el servidor falla, quien lo usa
 * vuelve a la voz del navegador.
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

/** Índice de la palabra que suena en el segundo `t` (la última que ya empezó). */
export function palabraEn(tiempos: number[], t: number): number {
  let lo = 0
  let hi = tiempos.length - 1
  if (hi < 0) return -1
  if (t < tiempos[0]) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tiempos[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

// MP3 de 0.15 s de silencio: se reproduce DENTRO del gesto del usuario para que Safari y WKWebView dejen sonar después
// el audio que llega de la red (sin gesto, `play()` se rechaza con NotAllowedError).
const SILENCIO = 'data:audio/mpeg;base64,//NAxAAAAANIAAAAAExBTUU0LjBVVVVVVVVVVVVVVVVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEWwAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80DEpAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsSjAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU='

const CACHE_MAX = 24

type AudioConPitch = HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean }

export class VozServidor {
  private audio: AudioConPitch | null = null
  private cache = new Map<string, Promise<string>>()
  private desbloqueado = false
  /** `false` tras un fallo del servidor: el lector vuelve a la voz del navegador hasta recargar. */
  disponible = typeof window !== 'undefined' && typeof Audio !== 'undefined'

  constructor(private pedir: (texto: string) => Promise<Response>) {}

  elemento(): AudioConPitch | null {
    if (!this.audio && typeof Audio !== 'undefined') {
      const a = new Audio() as AudioConPitch
      a.preload = 'auto'
      // Acelerar sin voz de ardilla: el estándar, Safari viejo (webkit) y Firefox viejo (moz).
      a.preservesPitch = true
      a.webkitPreservesPitch = true
      a.mozPreservesPitch = true
      this.audio = a
    }
    return this.audio
  }

  /** Llamar dentro de un clic o tecla: deja el elemento autorizado para sonar más tarde. */
  desbloquear() {
    const a = this.elemento()
    if (!a || this.desbloqueado) return
    this.desbloqueado = true
    try {
      a.src = SILENCIO
      a.play().catch(() => { this.desbloqueado = false })
    } catch { this.desbloqueado = false }
  }

  /** Audio del texto (URL de blob). Comparte la petición en vuelo y guarda las últimas en memoria. */
  cargar(texto: string): Promise<string> {
    const hit = this.cache.get(texto)
    if (hit) {
      // Más reciente al final (LRU).
      this.cache.delete(texto)
      this.cache.set(texto, hit)
      return hit
    }
    const p = this.pedir(texto).then(async (r) => {
      if (!r.ok) throw new Error(`tts ${r.status}`)
      const tipo = r.headers.get('content-type') || ''
      if (!tipo.startsWith('audio/')) throw new Error(`tts ${tipo || 'sin tipo'}`)
      return URL.createObjectURL(await r.blob())
    })
    p.catch(() => this.cache.delete(texto))
    this.cache.set(texto, p)
    while (this.cache.size > CACHE_MAX) {
      const [k, v] = this.cache.entries().next().value as [string, Promise<string>]
      this.cache.delete(k)
      v.then((u) => URL.revokeObjectURL(u)).catch(() => {})
    }
    return p
  }

  precargar(texto: string) {
    if (texto.trim()) this.cargar(texto).catch(() => {})
  }

  velocidad(rate: number) {
    const a = this.audio
    if (!a) return
    a.playbackRate = rate
    a.defaultPlaybackRate = rate
  }

  /** Detiene lo que suena sin descargar el audio (reanudar en la misma frase no vuelve a pedirlo). */
  parar() {
    try { this.audio?.pause() } catch { /* nada que parar */ }
  }
}
