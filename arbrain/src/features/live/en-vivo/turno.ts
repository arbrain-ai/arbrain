/**
 * Cuándo hablas y cuándo terminaste, en Levy en vivo (18 nov 2026). Puro (sin audio ni React), para las pruebas.
 *
 * Del «modo coche» de la comunidad se toma la idea del piso de ruido: los primeros 300 ms de cada escucha miden el ruido
 * de ESTA habitación y los umbrales son relativos a él (un umbral fijo falla con el aire acondicionado o con la voz baja).
 * Del SpeechEndpoint de Live se conserva el ritmo de conversación: 850 ms de silencio cierran la frase.
 *
 *  - `inicio`: empezó a hablar (para la grabación con pre-roll y para la cara: «te escucho»).
 *  - `pausa`: 300 ms de silencio a media frase (idea «mirar adelante» del modo coche): se transcribe lo dicho hasta aquí;
 *    si terminaste con tu palabra («…cambio») se manda sin esperar los 850 ms. Si sigues hablando, no pasa nada.
 *  - `fin`: terminó una frase con voz suficiente (≥ 300 ms): se transcribe.
 *  - `descartar`: sonó algo corto (tos, golpe): no se transcribe.
 *  - `interrumpe`: habla encima de Levy (≥ 200 ms con umbral alto, por el eco de las bocinas): Levy se calla.
 *  - `dormir`: 2 minutos sin oír a nadie: el micrófono se suelta (el modo coche pausa igual en la computadora).
 */
export type Evento = 'nada' | 'inicio' | 'pausa' | 'fin' | 'descartar' | 'interrumpe' | 'dormir'

export const CALIBRA_MS = 300
export const FIN_MS = 850
export const PAUSA_MS = 300
export const VOZ_MINIMA_MS = 300
export const INTERRUMPE_MS = 200
export const DORMIR_MS = 120_000

export function umbrales(piso: number, levyHabla: boolean) {
  const habla = Math.min(0.2, Math.max(0.022, piso * 3.2))
  // Con Levy hablando el eco de las bocinas entra al micrófono aunque el navegador lo cancele: hace falta más voz.
  return { habla: levyHabla ? Math.max(0.09, habla * 2.2) : habla, silencio: Math.max(0.012, piso * 1.6) }
}

export class Turno {
  private inicioEscucha = -1
  private muestras: number[] = []
  piso = 0.008
  private hablando = false
  private voz = 0
  private ultimaVoz = 0
  private ultimaActividad = 0
  private interrumpio = false
  private miro = false
  private ultimo = 0
  /** performance.now() del último instante con voz de la frase que acaba de cerrar (el «fin de voz» de la latencia). */
  finDeVoz = 0

  reiniciar(now: number) { this.inicioEscucha = now; this.muestras = []; this.hablando = false; this.voz = 0; this.interrumpio = false; this.ultimo = now; this.ultimaActividad = now }

  sample(nivel: number, now: number, levyHabla: boolean): Evento {
    if (this.inicioEscucha < 0) this.reiniciar(now)
    const dt = Math.max(0, Math.min(200, now - this.ultimo)); this.ultimo = now
    if (now - this.inicioEscucha < CALIBRA_MS && !this.hablando) {
      this.muestras.push(nivel)
      return 'nada'
    }
    if (this.muestras.length) {
      const s = [...this.muestras].sort((a, b) => a - b)
      // Si ya hablabas al abrir, el «piso» sale alto: se topa para no volverse sordo.
      this.piso = Math.min(0.04, s[Math.floor(s.length / 2)])
      this.muestras = []
    }
    const u = umbrales(this.piso, levyHabla)
    if (nivel > u.habla) {
      this.ultimaVoz = now; this.ultimaActividad = now
      this.voz += dt
      this.miro = false
      if (!this.hablando) { this.hablando = true; return 'inicio' }
      if (levyHabla && !this.interrumpio && this.voz >= INTERRUMPE_MS) { this.interrumpio = true; return 'interrumpe' }
      return 'nada'
    }
    if (this.hablando && nivel > u.silencio) return 'nada'   // entre umbrales: la frase sigue (sílabas débiles)
    if (this.hablando && !this.miro && this.voz >= VOZ_MINIMA_MS && now - this.ultimaVoz > PAUSA_MS && now - this.ultimaVoz <= FIN_MS) {
      this.miro = true; this.finDeVoz = this.ultimaVoz; return 'pausa'
    }
    if (this.hablando && now - this.ultimaVoz > FIN_MS) {
      const valida = this.voz >= VOZ_MINIMA_MS
      this.finDeVoz = this.ultimaVoz
      this.hablando = false; this.voz = 0; this.interrumpio = false; this.miro = false
      return valida ? 'fin' : 'descartar'
    }
    if (!this.hablando && now - this.ultimaActividad > DORMIR_MS) { this.ultimaActividad = now; return 'dormir' }
    return 'nada'
  }

  /** performance.now() de la última voz de la frase en curso: si cambió desde una `pausa`, seguiste hablando. */
  get ultimaVozAhora() { return this.ultimaVoz }

  /** Levy habló o trabajó: eso cuenta como actividad (no se duerme a media respuesta). */
  actividad(now: number) { this.ultimaActividad = now }
}

/** PCM float (cualquier frecuencia) → WAV mono 16 kHz s16le, lo que espera el oído local. */
export function wav16k(trozos: Float32Array[], rate: number): Uint8Array {
  const total = trozos.reduce((n, t) => n + t.length, 0)
  const entrada = new Float32Array(total)
  let o = 0; for (const t of trozos) { entrada.set(t, o); o += t.length }
  const n = rate === 16000 ? total : Math.floor(total * 16000 / rate)
  const out = new Uint8Array(44 + n * 2), v = new DataView(out.buffer)
  const txt = (p: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)) }
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true)
  v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, n * 2, true)
  const paso = total / Math.max(1, n)
  for (let i = 0; i < n; i++) {
    const x = i * paso, a = Math.floor(x), b = Math.min(total - 1, a + 1), f = x - a
    const s = rate === 16000 ? entrada[i] : entrada[a] * (1 - f) + entrada[b] * f
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true)
  }
  return out
}
