/**
 * VOZ DE SERVIDOR PARA EL LECTOR (22 oct 2026; Web Audio desde el 23 oct).
 *
 * Daniel: «la velocidad 1.75x no funciona en mi laptop». La voz del navegador (speechSynthesis) acelera o no según la
 * voz y el navegador, y en su equipo ignora `rate` aunque se cambie de voz (18499cb7 no bastó). El remedio robusto es no
 * depender de ella: el servidor genera el audio de cada tramo YA A LA VELOCIDAD pedida (atempo, sin cambiar el tono).
 *
 * 23 oct, Daniel: «siento lento el lector y la velocidad no la escucho a x2». Medido en un WKWebView como el de la app:
 * el `<audio>` con playbackRate sí acelera, pero cada tramo nuevo tarda ~0.4 s en empezar a sonar (con precarga y con
 * dos elementos alternos, igual), y con la precarga de un solo tramo los párrafos cortos dejaban huecos de 0.7 s. Un
 * texto de 44 s a 1x duraba 26.2 s a «2x» (1.68x real). Web Audio arranca cada tramo en ~0.02 s, pero su playbackRate
 * cambia el tono: por eso la velocidad la hornea el servidor y aquí el audio suena a 1x de su propio buffer.
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

// Buffers decodificados (PCM a la frecuencia del contexto, ~2 MB por tramo largo): los últimos bastan para reanudar,
// retroceder un párrafo y la precarga.
const CACHE_MAX = 16

/** Audio de un tramo listo para sonar. `tempo` es cuánto lo aceleró el servidor (1 si no supo hacerlo). `mp3` guarda
 *  los bytes por si hay que acelerarlo aquí (ver sonar()). */
export interface AudioTramo {
  buffer: AudioBuffer
  tempo: number
  mp3?: Blob
}

/** Cuánto le falta acelerar en el cliente a un tramo que el servidor dejó en `tempo` para sonar a `velocidad`. */
export function faltaAcelerar(velocidad: number, tempo: number): number {
  const f = velocidad / (tempo > 0 ? tempo : 1)
  return Number.isFinite(f) && f > 1.01 ? f : 1
}

// WAV mudo de 1 muestra: el `play()` dentro del gesto que libera al `<audio>` de respaldo para los tramos siguientes.
const WAV_MUDO = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA=='
// Holgura del vigía del final de un tramo: si `onended` no llegó medio segundo después de la duración, se da por terminado.
const HOLGURA_FIN_S = 0.5

type ConAudioSession = Navigator & { audioSession?: { type: string } }

export class VozServidor {
  private ctx: AudioContext | null = null
  private cache = new Map<string, Promise<AudioTramo>>()
  private fuente: AudioBufferSourceNode | null = null
  // Segundo del contexto en que sonaría el instante 0 del buffer: posicion() sale de ahí.
  private origen = 0
  private vigia: ReturnType<typeof setTimeout> | null = null
  // Respaldo cuando el servidor no aceleró (X-Tempo menor que lo pedido): `<audio>` con preservesPitch, liberado en el gesto.
  private elemento: HTMLAudioElement | null = null
  private enElemento = false
  private urlElemento: string | null = null
  private soportado =
    typeof window !== 'undefined' && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
  /** `false` tras un fallo del servidor: esa lectura sigue con la voz del navegador. */
  disponible = this.soportado

  constructor(private pedir: (texto: string, velocidad: number) => Promise<Response>) {}

  private contexto(): AudioContext | null {
    if (!this.ctx && this.disponible) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      try { this.ctx = new C() } catch { this.soportado = this.disponible = false }
    }
    return this.ctx
  }

  /** Nueva lectura: vuelve a intentar con el servidor aunque la anterior haya caído a la voz del navegador. */
  reintentar() {
    this.disponible = this.soportado
  }

  /** Llamar dentro de un clic o tecla: Chrome y Safari solo dejan arrancar el contexto con un gesto. */
  desbloquear() {
    // iPhone: sin esto el interruptor de silencio calla Web Audio (el `<audio>` no lo respetaba).
    try { const s = (navigator as ConAudioSession).audioSession; if (s) s.type = 'playback' } catch { /* Safari viejo */ }
    if (!this.elemento && typeof Audio !== 'undefined') {
      try {
        const el = new Audio()
        el.preload = 'auto'
        el.muted = true
        el.src = WAV_MUDO
        el.play().then(() => { el.pause(); el.muted = false }, () => { el.muted = false })
        this.elemento = el
      } catch { /* sin <audio>: el respaldo suena a 1x */ }
    }
    const ctx = this.contexto()
    if (!ctx) return
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
    try {
      // Un sample mudo dentro del gesto: el desbloqueo que exige iOS viejo.
      const b = ctx.createBufferSource()
      b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      b.connect(ctx.destination)
      b.start()
    } catch { /* nada que desbloquear */ }
  }

  /** Vuelta del background: iOS deja el contexto «interrupted» y no lo reanuda solo. */
  reanudar() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {})
  }

  /** Audio del texto a esa velocidad. Comparte la petición en vuelo y guarda los últimos en memoria. */
  cargar(texto: string, velocidad: number): Promise<AudioTramo> {
    const clave = `${velocidad}|${texto}`
    const hit = this.cache.get(clave)
    if (hit) {
      // Más reciente al final (LRU).
      this.cache.delete(clave)
      this.cache.set(clave, hit)
      return hit
    }
    const p = this.pedir(texto, velocidad).then(async (r) => {
      if (!r.ok) throw new Error(`tts ${r.status}`)
      const tipo = r.headers.get('content-type') || ''
      if (!tipo.startsWith('audio/')) throw new Error(`tts ${tipo || 'sin tipo'}`)
      const tempo = Number(r.headers.get('x-tempo')) || 1
      const datos = await r.arrayBuffer()
      const ctx = this.contexto()
      if (!ctx) throw new Error('sin Web Audio')
      // Copia de los bytes ANTES de decodificar (decodeAudioData se queda con el ArrayBuffer): solo si hará falta.
      const mp3 = faltaAcelerar(velocidad, tempo) > 1 ? new Blob([datos.slice(0)], { type: tipo }) : undefined
      // Safari viejo solo tiene la firma de callbacks.
      const buffer = await new Promise<AudioBuffer>((ok, mal) => {
        const pr = ctx.decodeAudioData(datos, ok, mal)
        if (pr && typeof pr.then === 'function') pr.then(ok, mal)
      })
      return { buffer, tempo, mp3 }
    })
    p.catch(() => this.cache.delete(clave))
    this.cache.set(clave, p)
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string)
    return p
  }

  precargar(texto: string, velocidad: number) {
    if (texto.trim()) this.cargar(texto, velocidad).catch(() => {})
  }

  /**
   * Suena `audio` desde el segundo `desde` de su buffer y llama `alTerminar` si llega al final (no si se para o lo
   * releva otro). La velocidad la pone el servidor: por Web Audio suena SIEMPRE a ritmo 1 (23 oct 9:29, Daniel: «la voz
   * suena como ardilla» a 2x; el playbackRate de Web Audio cambia el tono). Si el servidor aceleró menos de `velocidad`
   * (agent-server o voz-agentes viejos, X-Tempo 1), el tramo suena en un `<audio>` con preservesPitch a la velocidad
   * que falta: nunca a 1x en silencio. Si ese `<audio>` no arranca, suena a 1x por Web Audio y lo dice la consola.
   */
  sonar(audio: AudioTramo, desde: number, alTerminar: () => void, velocidad = audio.tempo) {
    const ctx = this.contexto()
    if (!ctx) throw new Error('sin Web Audio')
    this.parar()
    const falta = faltaAcelerar(velocidad, audio.tempo)
    if (falta > 1 && audio.mp3 && this.elemento) return this.sonarEnElemento(audio, desde, alTerminar, falta)
    if (falta > 1) console.warn(`[lector] el servidor aceleró ${audio.tempo}x de ${velocidad}x y no hay <audio> de respaldo: suena a ${audio.tempo}x`)
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
    const f = ctx.createBufferSource()
    f.buffer = audio.buffer
    f.connect(ctx.destination)
    const fin = () => {
      if (this.fuente !== f) return
      this.fuente = null
      this.soltarVigia()
      alTerminar()
    }
    f.onended = fin
    const inicio = Math.max(0, Math.min(desde, audio.buffer.duration - 0.01))
    this.origen = ctx.currentTime - inicio
    this.fuente = f
    f.start(0, inicio)
    // Vigía del final (23 oct 2026, medido en WKWebView y Playwright WebKit): a veces `onended` no llega y la lectura
    // se quedaba muda para siempre con el siguiente tramo ya descargado. Si la posición ya pasó la duración, se termina
    // aquí; si el contexto se suspendió (la posición no avanza), se vuelve a mirar cuando debería acabar.
    const mira = () => {
      this.vigia = null
      if (this.fuente !== f) return
      const queda = audio.buffer.duration - this.posicion()
      if (queda <= 0.05) return fin()
      this.vigia = setTimeout(mira, (queda + HOLGURA_FIN_S) * 1000)
    }
    this.vigia = setTimeout(mira, (audio.buffer.duration - inicio + HOLGURA_FIN_S) * 1000)
  }

  private sonarEnElemento(audio: AudioTramo, desde: number, alTerminar: () => void, rate: number) {
    const el = this.elemento!
    const url = URL.createObjectURL(audio.mp3!)
    this.urlElemento = url
    this.enElemento = true
    const conTono = el as HTMLAudioElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean }
    conTono.preservesPitch = true
    conTono.webkitPreservesPitch = true
    el.muted = false
    el.onended = () => {
      if (this.urlElemento !== url) return
      this.parar()
      alTerminar()
    }
    el.src = `${url}#t=${Math.max(0, desde).toFixed(2)}`
    el.playbackRate = rate
    el.defaultPlaybackRate = rate
    console.warn(`[lector] el servidor aceleró ${audio.tempo}x; el cliente pone el ${rate.toFixed(2)}x que falta (mismo tono)`)
    el.play().then(
      () => { if (this.urlElemento === url) el.playbackRate = rate },
      () => {
        // WebKit no dejó sonar el <audio> fuera del gesto: a 1x por Web Audio antes que el silencio.
        if (this.urlElemento !== url) return
        console.warn('[lector] el <audio> de respaldo no arrancó; suena a la velocidad del servidor')
        this.parar()
        this.sonar({ buffer: audio.buffer, tempo: audio.tempo }, desde, alTerminar)
      },
    )
  }

  private soltarVigia() {
    if (this.vigia) clearTimeout(this.vigia)
    this.vigia = null
  }

  /** Segundo del buffer que se oye ahora (descuenta la latencia de salida para que el resaltado no se adelante). */
  posicion(): number {
    if (this.enElemento && this.elemento) return this.elemento.currentTime
    const ctx = this.ctx
    if (!ctx || !this.fuente) return 0
    const latencia = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0
    return Math.max(0, ctx.currentTime - latencia - this.origen)
  }

  /** ¿El contexto está sonando? (`false` si el navegador lo dejó suspendido sin gesto). */
  corriendo(): boolean {
    if (this.enElemento && this.elemento) return !this.elemento.paused
    return this.ctx?.state === 'running'
  }

  /** Detiene lo que suena; el buffer queda en caché (reanudar en la misma frase no vuelve a pedirlo). */
  parar() {
    this.soltarVigia()
    if (this.enElemento && this.elemento) {
      const el = this.elemento
      this.enElemento = false
      el.onended = null
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    if (this.urlElemento) URL.revokeObjectURL(this.urlElemento)
    this.urlElemento = null
    const f = this.fuente
    this.fuente = null
    if (!f) return
    f.onended = null
    try { f.stop() } catch { /* ya había terminado */ }
    try { f.disconnect() } catch { /* sin conexión */ }
  }
}
