/**
 * VOZ DE SERVIDOR PARA EL LECTOR (22 oct 2026; Web Audio desde el 23 oct; marcas exactas desde el 29 oct).
 *
 * Daniel: «la velocidad 1.75x no funciona en mi laptop». La voz del navegador acelera o no según la voz y el navegador:
 * el servidor genera el audio de cada tramo YA A LA VELOCIDAD pedida (atempo, sin cambiar el tono) y aquí suena por
 * Web Audio a ritmo 1 de su propio buffer. Medido el 23 oct en un WKWebView como el de la app: un `<audio>` tarda ~0.4 s
 * en arrancar cada tramo y deja huecos; Web Audio arranca en ~0.02 s. Su playbackRate cambia el tono: nunca se usa.
 *
 * RESALTADO (29 oct, Daniel: «si solo es preciso 95% del tiempo hay desfases que me cortan la concentración»): la voz
 * `levy` trae en `X-Marcas` el instante exacto de cada palabra, sacado de la MISMA síntesis que el audio (marcas-voz.ts).
 * El audio llega en WAV: la muestra N del archivo es la N que suena (el MP3 metía un relleno de arranque que cada
 * decodificador recorta a su manera). Un solo reloj: posicion() = lo que está saliendo por la bocina AHORA. LemonFox
 * (edición cliente) trae las mismas marcas desde el 29 oct si el alumno tiene su llave de Groq (cliente/marcas-groq.ts del
 * daemon). Las voces sin marcas (LemonFox sin esa llave, voz-agentes) traen `marcas: null` y el lector usa el respaldo de
 * tiempos-estimados.ts.
 *
 * Este módulo no sabe nada del chat: recibe texto hablado, devuelve audio, marcas y reloj. Si el servidor falla, quien lo
 * usa vuelve a la voz del navegador.
 */
import { leerMarcas, type MarcaPalabra } from './marcas-voz'
import { marcasFaltan } from './aviso-groq-lector'

// Buffers decodificados (PCM a la frecuencia del contexto, ~2 MB por tramo largo): los últimos bastan para reanudar,
// retroceder un párrafo y la precarga.
const CACHE_MAX = 16

/** Audio de un tramo listo para sonar. `tempo`: cuánto lo aceleró el servidor. `marcas`: null si la voz no las da. */
export interface AudioTramo {
  buffer: AudioBuffer
  tempo: number
  marcas: MarcaPalabra[] | null
}

// Holgura del vigía del final de un tramo: si `onended` no llegó medio segundo después de la duración, se da por terminado.
const HOLGURA_FIN_S = 0.5
// Reposo del contexto (24 oct 2026, Daniel: «el TTS + lector amarillo sigue sin funcionar tan smooth, ahora mismo no lo
// escucho»). Un AudioContext que queda «corriendo» sin fuentes no suena, pero el proceso de audio de WebKit le sigue
// pidiendo muestras cada 2.7 ms. Con la ventana oculta, WebKit congela la página y ese hilo se queda sin respuesta: en la
// app del Studio, 250–950 «skipping cycle due to overload» por minuto en com.apple.WebKit.GPU entre ocultar y volver a
// mostrar la ventana. Reproducido en un WKWebView nativo con 6 min oculto: contexto corriendo 4,154 ciclos saltados,
// contexto suspendido 1. Por eso el contexto se suspende al quedar sin fuente y se reanuda al sonar.
const REPOSO_MS = 1500

type ConAudioSession = Navigator & { audioSession?: { type: string } }
type ConLatencia = AudioContext & { outputLatency?: number }

/**
 * Segundo del buffer que sale por la bocina: el contexto va adelantado lo que tarda su propio búfer (`baseLatency`) más
 * la salida del sistema (`outputLatency`; con audífonos Bluetooth, WebKit reporta ~0.15 s). Negativo justo después de
 * arrancar: el principio del buffer todavía no llega a la bocina. Pura, para el test.
 */
export function posicionAudible(currentTime: number, origen: number, baseLatency = 0, outputLatency = 0): number {
  const lat = (Number.isFinite(baseLatency) ? baseLatency : 0) + (Number.isFinite(outputLatency) ? outputLatency : 0)
  return currentTime - lat - origen
}

export class VozServidor {
  private ctx: AudioContext | null = null
  private cache = new Map<string, Promise<AudioTramo>>()
  private fuente: AudioBufferSourceNode | null = null
  // Segundo del contexto en que sale del grafo el instante 0 del buffer: posicion() sale de ahí.
  private origen = 0
  // Segundo del buffer desde el que arrancó la fuente: antes de él, lo que se oye es la cola de la fuente anterior.
  private inicio = 0
  private vigia: ReturnType<typeof setTimeout> | null = null
  private reposo: ReturnType<typeof setTimeout> | null = null
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
    // iPhone: sin esto el interruptor de silencio calla Web Audio.
    try { const s = (navigator as ConAudioSession).audioSession; if (s) s.type = 'playback' } catch { /* Safari viejo */ }
    const ctx = this.contexto()
    if (!ctx) return
    this.soltarReposo()
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
    if (this.ctx && this.fuente && this.ctx.state !== 'running') this.ctx.resume().catch(() => {})
  }

  /** Audio y marcas del texto a esa velocidad. Comparte la petición en vuelo y guarda los últimos en memoria. */
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
      const marcas = leerMarcas(r.headers.get('x-marcas'), texto)
      // LemonFox sin llave de Groq: el lector se lo dice al alumno una vez (aviso-groq-lector.ts).
      marcasFaltan(r.headers.get('x-marcas-falta'))
      const datos = await r.arrayBuffer()
      const ctx = this.contexto()
      if (!ctx) throw new Error('sin Web Audio')
      // Safari viejo solo tiene la firma de callbacks.
      const buffer = await new Promise<AudioBuffer>((ok, mal) => {
        const pr = ctx.decodeAudioData(datos, ok, mal)
        if (pr && typeof pr.then === 'function') pr.then(ok, mal)
      })
      if (tempo + 0.01 < velocidad) console.warn(`[lector] el servidor aceleró ${tempo}x de ${velocidad}x: suena a ${tempo}x`)
      return { buffer, tempo, marcas }
    })
    p.catch(() => this.cache.delete(clave))
    this.cache.set(clave, p)
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string)
    return p
  }

  precargar(texto: string, velocidad: number) {
    if (texto.trim()) this.cargar(texto, velocidad).catch(() => {})
  }

  /** Suena `audio` desde el segundo `desde` de su buffer y llama `alTerminar` si llega al final (no si se para o lo
   *  releva otro). */
  sonar(audio: AudioTramo, desde: number, alTerminar: () => void) {
    const ctx = this.contexto()
    if (!ctx) throw new Error('sin Web Audio')
    this.parar()
    this.soltarReposo()
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
    this.inicio = inicio
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

  private soltarVigia() {
    if (this.vigia) clearTimeout(this.vigia)
    this.vigia = null
  }

  private soltarReposo() {
    if (this.reposo) clearTimeout(this.reposo)
    this.reposo = null
  }

  /** Sin fuente durante REPOSO_MS (pausa, fin de la lectura, cambio de mensaje): el contexto se suspende. */
  private programarReposo() {
    this.soltarReposo()
    const ctx = this.ctx
    if (!ctx || typeof ctx.suspend !== 'function') return
    this.reposo = setTimeout(() => {
      this.reposo = null
      if (this.fuente || ctx.state !== 'running') return
      ctx.suspend().catch(() => {})
    }, REPOSO_MS)
  }

  /** EL RELOJ DEL LECTOR: segundo del buffer que se OYE ahora (ver posicionAudible; negativo si aún no llega). 0 si no
   *  suena nada. */
  posicion(): number {
    const ctx = this.ctx as ConLatencia | null
    if (!ctx || !this.fuente) return 0
    return posicionAudible(ctx.currentTime, this.origen, ctx.baseLatency, ctx.outputLatency)
  }

  /** Segundo del contexto ahora (avanza mientras suena; si no avanza estando `running`, el reloj se congeló). */
  reloj(): number | null {
    return this.ctx && this.fuente ? this.ctx.currentTime : null
  }

  /**
   * Destrabe del reloj (29 oct 2026). Medido en el arnés scripts/qa/lector-marcas: cuando la salida del sistema cambia a
   * media lectura (audífonos Bluetooth que se conectan o se van: la latencia pasó de 152 ms a 8 ms y la frecuencia de
   * 44.1 a 48 kHz entre una corrida y otra), el contexto de WebKit se quedó `running` con `currentTime` quieto: sin
   * sonido, sin `onended` y el vigía del final esperando para siempre. Paso 1: suspender y reanudar el mismo contexto,
   * que reabre la salida en el dispositivo de ese momento y sigue en la misma muestra. Paso 2 (`nuevo`): cerrar el
   * contexto; el siguiente sonar() crea otro (los AudioBuffer de la caché sirven en cualquier contexto).
   */
  reabrir(nuevo = false) {
    const ctx = this.ctx
    if (!ctx) return
    if (!nuevo) {
      ctx.suspend().catch(() => {}).then(() => ctx.resume()).catch(() => {})
      return
    }
    this.parar()
    this.soltarReposo()
    this.ctx = null
    ctx.close().catch(() => {})
  }

  /** ¿El contexto está sonando? (`false` si el navegador lo dejó suspendido sin gesto). */
  corriendo(): boolean {
    return this.ctx?.state === 'running'
  }

  /** Detiene lo que suena; el buffer queda en caché (reanudar en la misma frase no vuelve a pedirlo). */
  parar() {
    this.soltarVigia()
    this.programarReposo()
    const f = this.fuente
    this.fuente = null
    if (!f) return
    f.onended = null
    try { f.stop() } catch { /* ya había terminado */ }
    try { f.disconnect() } catch { /* sin conexión */ }
  }
}
