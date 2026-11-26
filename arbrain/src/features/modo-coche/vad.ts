/**
 * Cuándo hablas y cuándo terminaste (detector de voz, sin React y sin tope de 30 s: se puede dictar largo).
 *
 * Lo importante: amplitud REAL (RMS en el dominio del tiempo, no el espectro); el piso de ruido de ESTA cabina se
 * calibra en los primeros 300 ms de cada escucha; los umbrales son relativos a ese piso; sin habla vista no se
 * transcribe (Whisper ante ruido inventa).
 *   - 3 s de silencio para dar por terminado, con su avance (0 a 1) para la barrita de la pantalla: una pausa breve
 *     para pensar no corta el mensaje.
 *   - En cada pausa de ~0,9 s se avisa una vez («mirar adelante»): ahí se transcribe lo dicho hasta ese momento para
 *     notar «cambio», «dale»… y enviar sin esperar los 3 s.
 *   - Menos de medio segundo de voz en total (una tos, un golpe) no cuenta: se tira sin transcribir.
 *
 * Lo primero que dices tras el tilín (antes se perdía): la grabación ya corre ANTES del tilín. El detector no oye el
 * tilín (`ignorar`: esa ventana no cuenta ni para el piso de ruido ni como voz), pero lo que dices durante y después
 * del tilín sí queda grabado. Y si ya estabas hablando cuando el detector empieza a evaluar (al acabar el tilín y la
 * calibración), esa voz continua se le cuenta: un «Termina.» corto dicho encima del tilín no se tira como si fuera una
 * tos. (La cola del tilín, al cerrar su ventana, queda muy por debajo del umbral de voz: el tilín solo no se cuenta.)
 */

export const CALIBRA_MS = 300
/** Silencio que da por terminado el mensaje. */
export const SILENCIO_MS = 3000
/** Por turnos: el toque es lo que manda; el silencio es solo la red para que el micrófono no se quede abierto si se te
 *  olvida tocar. Por eso más paciente: da tiempo de pensar a media idea. */
export const SILENCIO_TURNOS_MS = 6000
/** Una pausa así ya puede ser el final («…dale.»): se mira adelante. */
export const PAUSA_CORTA_MS = 900
/** Voz mínima (suma de los momentos con voz) para que algo se transcriba. */
export const VOZ_MINIMA_MS = 500
/** Sin habla en este tiempo: se tira lo grabado y la escucha empieza de nuevo (el micrófono sigue abierto). */
export const SIN_HABLA_MS = 20_000
/** Red de seguridad: un dictado nunca pasa de 10 minutos (Groq acepta hasta 25 MB). */
export const TOPE_MS = 10 * 60_000

/** El ruido de un coche en marcha ronda 0,01 a 0,04: un «piso» más alto es que ya estabas hablando al abrir. */
export const PISO_MAX = 0.04
const SOBRE_PISO_HABLA = 3
const SOBRE_PISO_SILENCIO = 1.6
const HABLA_MIN = 0.025
const HABLA_MAX = 0.2
const SILENCIO_MIN = 0.012
const SILENCIO_DE_HABLA = 0.6

const entre = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function mediana(valores: number[]): number {
  if (!valores.length) return 0
  const s = [...valores].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function percentil(valores: number[], p: number): number {
  if (!valores.length) return 0
  const s = [...valores].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}

export function umbralesDesdePiso(piso: number): { habla: number; silencio: number } {
  const habla = entre(piso * SOBRE_PISO_HABLA, HABLA_MIN, HABLA_MAX)
  const silencio = entre(piso * SOBRE_PISO_SILENCIO, SILENCIO_MIN, habla * SILENCIO_DE_HABLA)
  return { habla, silencio }
}

/** Lo que pide el detector después de cada medición. */
export type Paso = 'sigue' | 'mirar-adelante' | 'terminaste' | 'empezar-de-nuevo'

/** Una escucha: se crea al abrir el micrófono (o al empezar de nuevo) y se le pasa cada medición. */
export class DetectorHabla {
  private readonly inicio: number
  private calibracion: number[] = []
  private umbrales: { habla: number; silencio: number } | null = null
  private inicioSilencio = 0
  private ultimaVoz = -Infinity
  private ultimaMedicion = 0
  private miroEstaPausa = false
  private ignorarHasta = 0
  private ignorado = 0
  /** Mediciones que todavía no se pudieron evaluar (el tilín y la calibración). */
  private sinEvaluar: { t: number; dt: number; nivel: number }[] = []
  private readonly silencioMs: number
  /** Cuántos milisegundos con voz lleva esta escucha. */
  vozMs = 0
  /** Sube cada vez que vuelves a hablar después de una pausa: una mirada adelantada vieja ya no vale. */
  pausa = 0
  /** ¿Ya hablaste en esta escucha? Sin esto, nada se transcribe. */
  hablaVista = false

  constructor(ahora: number, silencioMs = SILENCIO_MS) {
    this.inicio = ahora
    this.silencioMs = silencioMs
    this.ultimaMedicion = ahora
  }

  /** ¿Estás hablando en este momento (o hace menos de medio segundo)? */
  hablandoEn(ahora: number): boolean {
    return ahora - this.ultimaVoz < 500
  }

  /** Cuánto del silencio final ya pasó (0 a 1): la barrita que se llena antes de enviar. */
  avanceSilencio(ahora: number): number {
    if (!this.hablaVista || this.inicioSilencio === 0) return 0
    return Math.min(1, (ahora - this.inicioSilencio) / this.silencioMs)
  }

  /** ¿Sigue la misma pausa en la que se miró adelante? */
  sigueLaPausa(pausa: number): boolean {
    return pausa === this.pausa && this.inicioSilencio !== 0
  }

  /** Lo que suena en esta ventana (el tilín) no es tu voz ni el ruido de la cabina: no se mide. */
  ignorar(desde: number, ms: number): void {
    this.ignorarHasta = Math.max(this.ignorarHasta, desde + ms)
  }

  paso(ahora: number, nivel: number): Paso {
    const dt = Math.min(200, Math.max(0, ahora - this.ultimaMedicion))
    this.ultimaMedicion = ahora
    if (ahora < this.ignorarHasta) {
      this.ignorado += dt
      if (!this.umbrales) this.sinEvaluar.push({ t: ahora, dt, nivel })
      return 'sigue'
    }
    const pasado = ahora - this.inicio - this.ignorado
    if (!this.umbrales) {
      this.calibracion.push(nivel)
      if (pasado < CALIBRA_MS) { this.sinEvaluar.push({ t: ahora, dt, nivel }); return 'sigue' }
      // Si empiezas a hablar en cuanto suena el tilín, la calibración oye tu voz: se toma lo más bajo (los huecos entre
      // sílabas) y con tope, para que tu voz nunca quede por debajo del umbral.
      this.umbrales = umbralesDesdePiso(Math.min(percentil(this.calibracion, 0.2), PISO_MAX))
      this.recuperarArranque(this.umbrales.habla)
    }
    const { habla, silencio } = this.umbrales
    if (nivel > habla) {
      if (this.inicioSilencio !== 0 || !this.hablaVista) this.pausa++
      this.hablaVista = true
      this.ultimaVoz = ahora
      this.vozMs += dt
      this.inicioSilencio = 0
      this.miroEstaPausa = false
    } else if (this.hablaVista && nivel < silencio) {
      if (this.inicioSilencio === 0) this.inicioSilencio = ahora
      const callado = ahora - this.inicioSilencio
      if (callado > this.silencioMs) return this.vozMs >= VOZ_MINIMA_MS ? 'terminaste' : 'empezar-de-nuevo'
      if (callado > PAUSA_CORTA_MS && !this.miroEstaPausa && this.vozMs >= VOZ_MINIMA_MS) {
        this.miroEstaPausa = true
        return 'mirar-adelante'
      }
    }
    if (!this.hablaVista && pasado > SIN_HABLA_MS) return 'empezar-de-nuevo'
    if (pasado > TOPE_MS) return this.vozMs >= VOZ_MINIMA_MS ? 'terminaste' : 'empezar-de-nuevo'
    return 'sigue'
  }

  /** Ya estabas hablando cuando se empezó a evaluar: la voz continua que venía de antes cuenta (no se tira). */
  private recuperarArranque(habla: number): void {
    let voz = 0
    let ultima = -Infinity
    for (let i = this.sinEvaluar.length - 1; i >= 0; i--) {
      const m = this.sinEvaluar[i]
      if (m.nivel <= habla) break
      voz += m.dt
      if (ultima === -Infinity) ultima = m.t
    }
    this.sinEvaluar = []
    if (voz <= 0) return
    this.hablaVista = true
    this.pausa++
    this.vozMs += voz
    this.ultimaVoz = ultima
  }

  /** La app volvió de segundo plano: los relojes se re-anclan (el tiempo oculto no cuenta como silencio). */
  reanclar(ahora: number): void {
    if (this.inicioSilencio !== 0) this.inicioSilencio = ahora
    this.ultimaMedicion = ahora
  }
}
