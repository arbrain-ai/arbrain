'use client'

/**
 * AudioEngine — Web Audio core para Command Center Live.
 *
 * Responsabilidades (todas con latencia como prioridad #1):
 *  - Cola de reproducción TTS: cada oración llega como mp3 y se reproduce con un
 *    HTMLAudioElement ruteado al grafo Web Audio (createMediaElementSource). El
 *    audio empieza con la PRIMERA oración, no al final de la respuesta.
 *  - Por qué <audio> y no AudioBufferSourceNode: el elemento <audio> preserva el
 *    TONO al acelerar (preservesPitch). Con BufferSource el playbackRate sube el
 *    pitch (voz "chipmunk" a 2×). Mismo enfoque que /chat.
 *  - Analyser sobre la salida TTS → alimenta el orbe (estado "speaking").
 *  - Analyser sobre el micrófono → alimenta el orbe (estado "listening") + VAD + barge-in.
 *  - Barge-in: si el usuario habla mientras Levy habla, dispara onBargeIn().
 *  - Progreso real por oración (currentTime/duration del elemento que suena) →
 *    el resaltado karaoke queda en sync a cualquier velocidad sin recálculos.
 *
 * Una sola instancia AudioContext (creada en gesto del usuario para cumplir autoplay policy).
 */

export type EngineLevel = number // 0..1 amplitud RMS normalizada

interface AudioEngineCallbacks {
  /** Disparado cuando se detecta voz del usuario mientras el TTS está sonando. */
  onBargeIn?: () => void
  /** Disparado cuando termina de sonar TODA la cola TTS (vuelve a idle). */
  onSpeakEnd?: () => void
}

/** Permite el atributo prefijado de Firefox sin romper el tipado estándar. */
type PitchAudio = HTMLAudioElement & { mozPreservesPitch?: boolean }

interface QueueItem {
  el: HTMLAudioElement
  node: MediaElementAudioSourceNode
  url: string | null   // objectURL a revocar al terminar (null = elemento reutilizable: opener)
  counts: boolean      // cuenta para el resaltado karaoke (false para el opener)
  reusable: boolean    // no destruir al terminar (opener cacheado)
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private ttsGain: GainNode | null = null
  private ttsAnalyser: AnalyserNode | null = null
  private micAnalyser: AnalyserNode | null = null
  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null

  // Cola de reproducción (HTMLAudioElement por oración, secuencial)
  private queue: QueueItem[] = []
  private current: QueueItem | null = null
  private playing = false
  private completedSubtitles = 0 // oraciones-con-subtítulo ya terminadas (para el karaoke)
  private openerItem: QueueItem | null = null // "A ver." pre-cacheado → primer audio instantáneo
  private speaking = false
  private playbackRate = 1 // velocidad de reproducción TTS (1× / 1.5× / 2×)

  // Análisis (reutilizamos buffers para no allocar en el RAF loop)
  private ttsFreq: Uint8Array | null = null
  private micFreq: Uint8Array | null = null

  // Barge-in / VAD
  private bargeInArmed = false
  private bargeInFrames = 0
  private rafId = 0
  private callbacks: AudioEngineCallbacks = {}

  // Umbrales (tuneables)
  static BARGE_IN_THRESHOLD = 0.055 // RMS mic para considerar "el usuario está hablando"
  static BARGE_IN_FRAMES = 6        // ~100ms sostenidos (a 60fps) para evitar falsos positivos

  constructor(callbacks: AudioEngineCallbacks = {}) {
    this.callbacks = callbacks
  }

  /** Debe llamarse desde un gesto del usuario (click/tap) para desbloquear el AudioContext. */
  async resume(): Promise<void> {
    if (!this.ctx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      this.ctx = new Ctor()
      this.ttsGain = this.ctx.createGain()
      this.ttsAnalyser = this.ctx.createAnalyser()
      this.ttsAnalyser.fftSize = 256
      this.ttsAnalyser.smoothingTimeConstant = 0.8
      this.ttsGain.connect(this.ttsAnalyser)
      this.ttsAnalyser.connect(this.ctx.destination)
      this.ttsFreq = new Uint8Array(this.ttsAnalyser.frequencyBinCount)
      this.startAnalysisLoop()
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  get audioContext(): AudioContext | null {
    return this.ctx
  }

  /** Tiempo del reloj de audio (compat; el karaoke usa spokenSegments/activeFraction). */
  get currentTime(): number {
    return this.ctx?.currentTime ?? 0
  }

  // ─── Karaoke: progreso real basado en el elemento que suena ────────────────
  /** Oraciones-con-subtítulo ya completadas (índice del segmento en curso). */
  get spokenSegments(): number {
    return this.completedSubtitles
  }
  /** Fracción (0..1) de la oración-con-subtítulo en curso. 0 si suena el opener. */
  get activeFraction(): number {
    const c = this.current
    if (!c || !c.counts) return 0
    const d = c.el.duration
    if (!d || !Number.isFinite(d)) return 0
    return Math.min(1, c.el.currentTime / d)
  }

  // ─── Cola TTS ──────────────────────────────────────────────────────────────
  /** Crea un elemento <audio> ruteado al grafo, con pitch preservado. */
  private makeItem(mp3: ArrayBuffer, opts: { counts: boolean; reusable: boolean }): QueueItem | null {
    if (!this.ctx || !this.ttsGain) return null
    const blob = new Blob([mp3], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const el = new Audio(url) as PitchAudio
    el.preservesPitch = true
    el.mozPreservesPitch = true
    el.playbackRate = this.playbackRate
    el.preload = 'auto'
    const node = this.ctx.createMediaElementSource(el)
    node.connect(this.ttsGain)
    el.load() // empieza a bufferear ya, para que pump() arranque sin gap
    return { el, node, url, counts: opts.counts, reusable: opts.reusable }
  }

  /** Pre-cachea el opener ("A ver.") como elemento reutilizable → primer audio instantáneo. */
  primeOpener(mp3: ArrayBuffer): void {
    if (!this.ctx || this.openerItem) return
    this.openerItem = this.makeItem(mp3, { counts: false, reusable: true })
  }

  get hasOpener(): boolean {
    return !!this.openerItem
  }

  /** Encola el opener cacheado (no cuenta para subtítulos). */
  playOpener(): void {
    const op = this.openerItem
    if (!op) return
    if (this.current === op || this.queue.includes(op)) return
    op.el.playbackRate = this.playbackRate
    this.queue.push(op)
    this.pump()
  }

  /** Encola una oración (mp3). counts=true → entra al resaltado karaoke. */
  enqueueSentence(mp3: ArrayBuffer, counts = true): void {
    const item = this.makeItem(mp3, { counts, reusable: false })
    if (!item) return
    this.queue.push(item)
    this.pump()
  }

  private pump(): void {
    if (this.playing) return
    const item = this.queue.shift()
    if (!item) return
    this.current = item
    this.playing = true
    this.speaking = true
    this.armBargeIn()
    const el = item.el
    try { el.currentTime = 0 } catch { /* aún sin metadata; arranca igual desde 0 */ }
    el.playbackRate = this.playbackRate
    el.onended = () => this.onItemEnded(item)
    el.play().catch(() => this.onItemEnded(item)) // si falla, no bloquees la cola
  }

  private onItemEnded(item: QueueItem): void {
    if (this.current !== item) return
    if (item.counts) this.completedSubtitles++
    if (!item.reusable) {
      try { item.node.disconnect() } catch { /* noop */ }
      if (item.url) { try { URL.revokeObjectURL(item.url) } catch { /* noop */ } }
    }
    item.el.onended = null
    this.current = null
    this.playing = false
    if (this.queue.length > 0) {
      this.pump()
    } else {
      this.speaking = false
      this.disarmBargeIn()
      this.callbacks.onSpeakEnd?.()
    }
  }

  get isSpeaking(): boolean {
    return this.speaking
  }

  /** Velocidad de reproducción TTS actual (1 = normal). */
  get speed(): number {
    return this.playbackRate
  }

  /** Ajusta la velocidad de la voz (1× / 1.5× / 2×) PRESERVANDO el tono. En vivo y en lo siguiente. */
  setPlaybackRate(rate: number): void {
    this.playbackRate = Math.min(3, Math.max(0.5, rate))
    if (this.current) this.current.el.playbackRate = this.playbackRate
    for (const it of this.queue) it.el.playbackRate = this.playbackRate
    if (this.openerItem) this.openerItem.el.playbackRate = this.playbackRate
  }

  /** Corta inmediatamente toda la reproducción TTS (barge-in, ESC, nueva pregunta). */
  stopPlayback(): void {
    const items = this.current ? [this.current, ...this.queue] : [...this.queue]
    for (const it of items) {
      try { it.el.onended = null; it.el.pause() } catch { /* noop */ }
      if (!it.reusable) {
        try { it.node.disconnect() } catch { /* noop */ }
        if (it.url) { try { URL.revokeObjectURL(it.url) } catch { /* noop */ } }
      }
    }
    this.queue = []
    this.current = null
    this.playing = false
    this.completedSubtitles = 0
    this.speaking = false
    this.disarmBargeIn()
  }

  // ─── Micrófono / análisis ────────────────────────────────────────────────

  async attachMic(stream: MediaStream): Promise<void> {
    if (!this.ctx) await this.resume()
    if (!this.ctx) return
    this.detachMic()
    this.micStream = stream
    this.micSource = this.ctx.createMediaStreamSource(stream)
    this.micAnalyser = this.ctx.createAnalyser()
    this.micAnalyser.fftSize = 512
    this.micAnalyser.smoothingTimeConstant = 0.6
    this.micSource.connect(this.micAnalyser)
    this.micFreq = new Uint8Array(this.micAnalyser.frequencyBinCount)
  }

  detachMic(): void {
    try { this.micSource?.disconnect() } catch { /* noop */ }
    this.micSource = null
    this.micAnalyser = null
    this.micFreq = null
  }

  /** Activa la detección de barge-in mientras el TTS suena. */
  private armBargeIn() {
    this.bargeInArmed = true
    this.bargeInFrames = 0
  }
  private disarmBargeIn() {
    this.bargeInArmed = false
    this.bargeInFrames = 0
  }

  // Nivel actual del orbe: máximo entre TTS y mic (lo que esté activo)
  private _ttsLevel = 0
  private _micLevel = 0
  // Energía por banda (0..1) de la fuente activa — alimenta el movimiento orgánico del orbe.
  private _bands: { low: number; mid: number; high: number } = { low: 0, mid: 0, high: 0 }

  get ttsLevel(): EngineLevel { return this._ttsLevel }
  get micLevel(): EngineLevel { return this._micLevel }
  /** Nivel combinado para el orbe (0..1). */
  get level(): EngineLevel { return Math.max(this._ttsLevel, this._micLevel) }
  /** Energía por banda (graves/medios/agudos, 0..1) de la fuente dominante. Solo lectura. */
  get bands(): { low: number; mid: number; high: number } { return this._bands }

  /** Divide el espectro en 3 bandas y devuelve su energía normalizada. */
  private bandEnergy(analyser: AnalyserNode | null, buf: Uint8Array | null): { low: number; mid: number; high: number } | null {
    if (!analyser || !buf) return null
    // buf ya fue llenado por rms() en este mismo frame — reutilizamos sin re-leer.
    const n = buf.length
    const cut1 = Math.floor(n * 0.15)
    const cut2 = Math.floor(n * 0.5)
    let lo = 0, mi = 0, hi = 0
    for (let i = 0; i < cut1; i++) lo += buf[i]
    for (let i = cut1; i < cut2; i++) mi += buf[i]
    for (let i = cut2; i < n; i++) hi += buf[i]
    return {
      low: Math.min(1, (lo / Math.max(1, cut1)) / 255 * 1.5),
      mid: Math.min(1, (mi / Math.max(1, cut2 - cut1)) / 255 * 1.9),
      high: Math.min(1, (hi / Math.max(1, n - cut2)) / 255 * 2.6),
    }
  }

  private rms(analyser: AnalyserNode | null, buf: Uint8Array | null): number {
    if (!analyser || !buf) return 0
    analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    const rms = Math.sqrt(sum / buf.length) / 255
    return Math.min(1, rms * 1.6) // boost suave para sensibilidad visual
  }

  private startAnalysisLoop() {
    const tick = () => {
      this._ttsLevel = this.rms(this.ttsAnalyser, this.ttsFreq)
      this._micLevel = this.rms(this.micAnalyser, this.micFreq)

      // Bandas de la fuente dominante (TTS al hablar, mic al escuchar)
      const dominant = this._ttsLevel >= this._micLevel
        ? this.bandEnergy(this.ttsAnalyser, this.ttsFreq)
        : this.bandEnergy(this.micAnalyser, this.micFreq)
      if (dominant) this._bands = dominant
      else this._bands.low = this._bands.mid = this._bands.high = 0

      // Barge-in: voz del usuario sostenida mientras Levy habla
      if (this.bargeInArmed && this.speaking) {
        if (this._micLevel > AudioEngine.BARGE_IN_THRESHOLD) {
          this.bargeInFrames++
          if (this.bargeInFrames >= AudioEngine.BARGE_IN_FRAMES) {
            this.disarmBargeIn()
            this.callbacks.onBargeIn?.()
          }
        } else {
          this.bargeInFrames = Math.max(0, this.bargeInFrames - 1)
        }
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId)
    this.stopPlayback()
    if (this.openerItem) {
      try { this.openerItem.node.disconnect() } catch { /* noop */ }
      if (this.openerItem.url) { try { URL.revokeObjectURL(this.openerItem.url) } catch { /* noop */ } }
      this.openerItem = null
    }
    this.detachMic()
    try { this.micStream?.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
    this.micStream = null
    try { this.ctx?.close() } catch { /* noop */ }
    this.ctx = null
  }
}
