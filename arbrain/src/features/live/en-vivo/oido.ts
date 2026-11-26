/**
 * El oído de Levy en vivo (18 nov 2026): micrófono abierto con cancelación de eco, nivel de tu voz, detección de turno
 * (turno.ts) y la frase en WAV de 16 kHz con 350 ms de pre-roll (la primera sílaba no se pierde). Nada se graba fuera de
 * la frase en curso; nada se manda solo: quien lo usa decide (palabras.ts).
 *
 * Idea de un «modo coche» compartido en la comunidad: el micrófono se pide UNA vez y se silencia entre turnos en vez de
 * soltarlo; aquí se suelta al apagar el modo o tras 2 minutos sin oír a nadie.
 */
import { Turno, wav16k, type Evento } from './turno.ts'

/** `id`: una por frase hablada (la pausa y el fin de la misma frase comparten id). `adelanto`: transcripción de la pausa. */
export type Frase = { id: number; wav: Blob; finDeVoz: number; detectado: number; duracionS: number; adelanto?: boolean }
export type OidoEventos = {
  onEvento?: (e: Evento, now: number) => void
  onFrase?: (f: Frase) => void
  onError?: (mensaje: string) => void
}

const PREROLL_S = 0.35
const TOPE_S = 60

export class OidoEnVivo {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private nodo: ScriptProcessorNode | null = null
  private previo: Float32Array[] = []
  private frase: Float32Array[] | null = null
  private muestras = 0
  private idFrase = 0
  private rate = 48000
  readonly turno = new Turno()
  nivel = 0
  /** La cara y la voz: si Levy está sonando (umbral alto contra el eco). */
  levyHabla: () => boolean = () => false
  constructor(private ev: OidoEventos = {}) {}

  get abierto() { return !!this.stream }

  async abrir() {
    if (this.stream) return
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    } catch (e) {
      this.ev.onError?.(e instanceof Error && e.name === 'NotAllowedError' ? 'Arbrain no tiene permiso para el micrófono.' : 'No pude abrir el micrófono.')
      throw e
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    const fuente = ctx.createMediaStreamSource(this.stream)
    const nodo = ctx.createScriptProcessor(2048, 1, 1)
    const mudo = ctx.createGain(); mudo.gain.value = 0
    fuente.connect(nodo); nodo.connect(mudo); mudo.connect(ctx.destination)
    this.nodo = nodo
    this.turno.reiniciar(performance.now())
    nodo.onaudioprocess = (e) => this.procesar(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate)
    await ctx.resume()
  }

  private procesar(x: Float32Array, rate: number) {
    const now = performance.now()
    let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]
    const rms = Math.sqrt(s / x.length)
    this.nivel = Math.min(1, rms * 6)
    if (this.frase) { this.frase.push(x); this.muestras += x.length }
    else {
      this.previo.push(x)
      let n = this.previo.reduce((a, b) => a + b.length, 0)
      while (n - this.previo[0].length > PREROLL_S * rate) { n -= this.previo[0].length; this.previo.shift() }
    }
    const evento = this.turno.sample(rms, now, this.levyHabla())
    this.rate = rate
    if (evento === 'inicio') { this.idFrase++; this.frase = [...this.previo]; this.muestras = this.frase.reduce((a, b) => a + b.length, 0); this.previo = [] }
    if (evento === 'fin' && this.frase) {
      const wav = wav16k(this.frase, rate)
      this.ev.onFrase?.({ id: this.idFrase, wav: new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }), finDeVoz: this.turno.finDeVoz, detectado: now, duracionS: this.muestras / rate })
      this.frase = null
    }
    if (evento === 'pausa' && this.frase) {
      const wav = wav16k(this.frase, rate)
      this.ev.onFrase?.({ id: this.idFrase, wav: new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }), finDeVoz: this.turno.finDeVoz, detectado: now, duracionS: this.muestras / rate, adelanto: true })
    }
    if (evento === 'descartar') this.frase = null
    if (this.frase && this.muestras > TOPE_S * rate) { this.frase = null; this.ev.onError?.('La frase pasó de un minuto: la corté. Habla en partes.') }
    if (evento !== 'nada') this.ev.onEvento?.(evento, now)
  }

  /** Dos notas suaves que suben: «ya te escucho» (idea del tilín del modo coche). */
  tilin() {
    const ctx = this.ctx; if (!ctx) return
    const t = ctx.currentTime + 0.02
    for (const [f, d] of [[659.25, 0], [880, 0.11]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = f; o.type = 'sine'
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.07, t + d + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22)
      o.connect(g); g.connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.25)
    }
  }

  cerrar() {
    if (this.nodo) { this.nodo.onaudioprocess = null; this.nodo.disconnect() }
    this.stream?.getTracks().forEach(t => t.stop())
    void this.ctx?.close().catch(() => {})
    this.nodo = null; this.stream = null; this.ctx = null; this.frase = null; this.previo = []; this.nivel = 0
  }
}
