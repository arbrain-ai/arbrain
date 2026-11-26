/**
 * El oído del modo coche. Abre el micrófono, mide tu voz y, cuando terminas de hablar, entrega lo grabado para
 * transcribir; en seguida vuelve a escuchar (el micrófono no se cierra entre mensajes). Sin tope de 30 s.
 *
 * - El micrófono se pide UNA vez y queda abierto toda la sesión del modo coche (si se cierra del todo mientras el
 *   agente procesa, tras varios minutos el iPhone vuelve a pedir el permiso y, manejando, nadie toca «Permitir»).
 *   `pausar()` lo SILENCIA (pista desactivada, sin grabar: ni eco de las bocinas ni ruidos); `reanudar()` lo vuelve a
 *   activar sin pedir nada. Solo `cerrar()` (la ✕) lo suelta. Si iOS lo cortó (llamada, otra app), se vuelve a pedir.
 * - La ÉPOCA: cada pausa o cierre sube un número; lo que llegue tarde de una escucha vieja (un micrófono que abrió
 *   después de pausar, una grabación que terminó de juntarse) se tira.
 * - El reloj es un intervalo de 50 ms y no `requestAnimationFrame`: con la pantalla quieta Safari baja los cuadros.
 * - Por turnos: `entregarYa()` es el toque que manda lo dicho; `soltar()` suelta el micrófono del todo entre turnos (se
 *   vuelve a pedir al tocar, dentro del gesto); `silencioMs` da más paciencia al silencio en ese modo.
 * - Lo primero que dices tras el tilín: antes el tilín sonaba y el micrófono se abría 500 ms DESPUÉS (y por turnos,
 *   además, se volvía a pedir al sistema en ese momento): se perdían de 0,3 a 1 s de lo dicho. Ahora `reanudar()`
 *   termina cuando la grabación YA corre (evento `start` del MediaRecorder, el micrófono entregando sonido y un colchón
 *   de `PREVIO_MS`); el tilín suena después y `ignorar()` hace que el detector no lo tome por tu voz. Todo lo que digas
 *   desde que empieza el tilín queda grabado.
 */
import { formatoGrabacion, tipoDeGrabacion } from '@/features/chat/lib/voz-sistema'
import { DetectorHabla, SILENCIO_MS } from './vad'

export type Grabacion = { audio: Blob; nombre: string }

/** Grabación corriendo como mínimo esto antes del tilín (el colchón: lo de iOS al cambiar de reproducir a grabar). */
export const PREVIO_MS = 150
/** Tope para esperar a que la grabación arranque y el micrófono entregue sonido (no se queda colgado). */
export const LISTO_MAX_MS = 700

type Avisos = {
  /** Terminaste de hablar: esto se transcribe y se manda. */
  alTerminar: (g: Grabacion) => void
  /** Una pausa corta después de hablar: lo dicho hasta aquí, para notar «cambio», «dale»… sin esperar el silencio largo. */
  alMirarAdelante?: (g: Grabacion, pausa: number) => void
  /** Una escucha sin habla (o solo con ruido) empezó de nuevo (la voz que esperaba ya puede sonar). */
  alEmpezarDeNuevo?: () => void
  /** No se pudo abrir el micrófono. */
  alFallar: (motivo: string) => void
  /** Por turnos: tocaste para enviar, pero lo grabado era tan corto que no hay nada que transcribir. */
  alVacio?: () => void
}

export class Oido {
  private readonly ctx: AudioContext
  private readonly avisos: Avisos
  private epoca = 0
  private stream: MediaStream | null = null
  private fuente: MediaStreamAudioSourceNode | null = null
  private analizador: AnalyserNode | null = null
  private muestras: Uint8Array<ArrayBuffer> | null = null
  private grabadora: MediaRecorder | null = null
  private pedazos: BlobPart[] = []
  private detector: DetectorHabla | null = null
  private reloj: ReturnType<typeof setInterval> | null = null
  private _nivel = 0
  /** ¿Debe estar escuchando? (false mientras suena la voz o con la app oculta). */
  private activo = false
  /** Cuánto silencio da por terminado lo que dices (3 s fluido, 6 s por turnos). Vale desde la siguiente escucha. */
  silencioMs = SILENCIO_MS

  constructor(ctx: AudioContext, avisos: Avisos) {
    this.ctx = ctx
    this.avisos = avisos
  }

  /** Tu voz ahora (0 a 1, ya con ganancia para el Orbe). */
  get nivel(): number { return this.activo ? this._nivel : 0 }
  /** ¿Estás hablando en esta escucha? (la voz espera). */
  get hablaVista(): boolean { return this.activo && !!this.detector?.hablaVista }
  /** ¿Estás hablando en este momento? */
  hablandoAhora(): boolean { return this.activo && !!this.detector?.hablandoEn(performance.now()) }
  get escuchando(): boolean { return this.activo && !!this.grabadora }
  /** La barrita: cuánto del silencio final ya pasó (0 a 1). */
  avanceSilencio(): number { return this.activo ? this.detector?.avanceSilencio(performance.now()) ?? 0 : 0 }
  /** ¿Sigues callado en la misma pausa en que se miró adelante? */
  sigueLaPausa(pausa: number): boolean { return this.activo && !!this.detector?.sigueLaPausa(pausa) }

  /**
   * La primera vez, dentro del toque (iOS pide el micrófono en el gesto). Luego, al volver de una pausa. Devuelve true
   * cuando ya se está grabando de verdad (ahí suena el tilín); false si se pausó, se cerró o no hubo micrófono.
   */
  async reanudar(): Promise<boolean> {
    if (this.cerrado) return false
    if (this.activo) return this.escuchando
    this.activo = true
    const epoca = ++this.epoca
    try {
      void this.ctx.resume().catch(() => {})
      if (!this.vivo()) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        this.liberar()
        if (this.cerrado) { stream.getTracks().forEach(t => t.stop()); return false }
        this.stream = stream
        this.pedidos++
        this.fuente = this.ctx.createMediaStreamSource(stream)
        this.analizador = this.ctx.createAnalyser()
        this.analizador.fftSize = 512
        this.analizador.smoothingTimeConstant = 0.6
        this.fuente.connect(this.analizador)
        this.muestras = new Uint8Array(new ArrayBuffer(this.analizador.fftSize))
      }
      if (epoca !== this.epoca) { this.silenciar(); return false } // se pausó mientras el iPhone preguntaba: queda listo y callado
      this.stream?.getAudioTracks().forEach(t => { t.enabled = true })
      this.empezarGrabacion()
      this.reloj = setInterval(() => this.medir(), 50)
      await this.esperarGrabando()
      return epoca === this.epoca && this.escuchando
    } catch (e) {
      if (epoca !== this.epoca) return false
      this.activo = false
      this.avisos.alFallar(e instanceof Error && e.name === 'NotAllowedError' ? 'El micrófono no tiene permiso.' : 'No se pudo abrir el micrófono.')
      return false
    }
  }

  /** Hasta que la grabadora arrancó, el micrófono entrega sonido y pasó el colchón (con tope: nunca se cuelga). */
  private async esperarGrabando(): Promise<void> {
    const g = this.grabadora
    if (!g) return
    const desde = performance.now()
    if (g.state !== 'recording' || !this.grabandoDesde) {
      await new Promise<void>(listo => {
        const t = setTimeout(listo, LISTO_MAX_MS)
        g.addEventListener('start', () => { clearTimeout(t); listo() }, { once: true })
      })
    }
    while (this.grabadora === g && performance.now() - desde < LISTO_MAX_MS) {
      const inicio = this.grabandoDesde || desde
      if (performance.now() - inicio >= PREVIO_MS && this.hayCorriente()) return
      await new Promise(f => setTimeout(f, 20))
    }
  }

  /** ¿El micrófono ya entrega sonido? (al cambiar la sesión de audio, iOS da ceros los primeros momentos). */
  private hayCorriente(): boolean {
    if (!this.analizador || !this.muestras) return true
    this.analizador.getByteTimeDomainData(this.muestras)
    for (const v of this.muestras) if (v !== 128) return true
    return false
  }

  /** Cuándo empezó a grabar de verdad la grabación actual (0 si todavía no). */
  private grabandoDesde = 0
  /** Cuánto lleva grabando la grabación actual (ms). Para la bitácora: el colchón antes del tilín. */
  grabandoHace(): number { return this.grabandoDesde ? performance.now() - this.grabandoDesde : 0 }

  /** El tilín: el detector no lo toma por tu voz ni por el ruido de la cabina (la grabación sí sigue). */
  ignorar(ms: number): void { if (ms > 0) this.detector?.ignorar(performance.now(), ms) }

  /** Cuántas veces se pidió el micrófono al sistema en esta sesión (debe ser 1). */
  pedidos = 0

  /** Silencia el micrófono sin soltarlo (lo que se estaba grabando se tira). */
  pausar(): void {
    this.epoca++
    this.activo = false
    this.detener()
    this.silenciar()
  }

  private cerrado = false
  /** La ✕: ahora sí se suelta el micrófono. */
  cerrar(): void { this.cerrado = true; this.pausar(); this.liberar() }

  /** Por turnos, entre un turno y otro: el micrófono se suelta del todo (el sistema deja de mostrarlo en uso). */
  soltar(): void { this.pausar(); this.liberar() }
  /** ¿Está tomado el micrófono (aunque sea en silencio)? */
  get tomado(): boolean { return this.vivo() }

  /**
   * Por turnos: tocaste el Orbe para enviar. Lo que llevas dicho sale para transcribir (aunque no hayas callado) y el
   * micrófono deja de escuchar. Devuelve false si no habías hablado (no hay nada que mandar).
   */
  entregarYa(): boolean {
    const g = this.grabadora
    const pedazos = this.pedazos
    if (!g || !this.detector?.hablaVista) return false
    this.grabadora = null
    this.detector = null
    this.epoca++
    this.activo = false
    if (this.reloj) clearInterval(this.reloj)
    this.reloj = null
    g.onstop = () => {
      if (this.cerrado) return
      const { tipo, nombre } = tipoDeGrabacion(g.mimeType)
      const audio = new Blob(pedazos, { type: tipo })
      if (audio.size >= 2000) this.avisos.alTerminar({ audio, nombre })
      else this.avisos.alVacio?.()
    }
    if (g.state !== 'inactive') { try { g.stop() } catch { this.avisos.alVacio?.() } } else this.avisos.alVacio?.()
    this._nivel = 0
    return true
  }

  /** ¿Hay un micrófono abierto que sirva? (iOS lo corta en una llamada o al cambiar de app). */
  private vivo(): boolean {
    return !!this.stream && this.stream.getAudioTracks().some(t => t.readyState === 'live')
  }

  private silenciar(): void {
    this.stream?.getAudioTracks().forEach(t => { t.enabled = false })
    this._nivel = 0
  }

  /** La app volvió a la vista: el tiempo oculto no cuenta como silencio. */
  reanclar(): void { this.detector?.reanclar(performance.now()) }

  private empezarGrabacion(): void {
    if (!this.stream) return
    const tipo = formatoGrabacion(t => MediaRecorder.isTypeSupported(t))
    const g = tipo ? new MediaRecorder(this.stream, { mimeType: tipo }) : new MediaRecorder(this.stream)
    const pedazos: BlobPart[] = []
    this.pedazos = pedazos
    g.ondataavailable = e => { if (e.data.size > 0) pedazos.push(e.data) }
    this.grabandoDesde = 0
    g.addEventListener('start', () => { if (this.grabadora === g) this.grabandoDesde = performance.now() }, { once: true })
    g.start(250)
    this.grabadora = g
    this.detector = new DetectorHabla(performance.now(), this.silencioMs)
  }

  /** Cierra la grabación actual; con `entregar`, lo grabado sale para transcribir. Luego empieza otra. */
  private cortar(entregar: boolean): void {
    const g = this.grabadora
    const pedazos = this.pedazos
    this.grabadora = null
    this.detector = null
    if (g && g.state !== 'inactive') {
      // Lo que ya terminaste de decir se entrega aunque en seguida se pause el micrófono (la voz entra justo
      // después): solo se tira si se cerró el modo coche.
      g.onstop = () => {
        if (!entregar || this.cerrado) return
        const { tipo, nombre } = tipoDeGrabacion(g.mimeType)
        const audio = new Blob(pedazos, { type: tipo })
        if (audio.size >= 2000) this.avisos.alTerminar({ audio, nombre })
      }
      try { g.stop() } catch { /* ya parada */ }
    }
    if (this.activo) this.empezarGrabacion()
  }

  private medir(): void {
    if (!this.activo || !this.analizador || !this.muestras) return
    this.analizador.getByteTimeDomainData(this.muestras)
    let suma = 0
    for (const v of this.muestras) { const x = (v - 128) / 128; suma += x * x }
    const rms = Math.min(1, Math.sqrt(suma / this.muestras.length))
    this._nivel = Math.min(1, rms * 6)
    const d = this.detector
    if (!d) return
    const paso = d.paso(performance.now(), rms)
    if (paso === 'mirar-adelante') this.mirarAdelante(d.pausa)
    else if (paso === 'terminaste') this.cortar(true)
    else if (paso === 'empezar-de-nuevo') { this.cortar(false); this.avisos.alEmpezarDeNuevo?.() }
  }

  private mirarAdelante(pausa: number): void {
    const g = this.grabadora
    if (!g || !this.pedazos.length) return
    const { tipo, nombre } = tipoDeGrabacion(g.mimeType)
    const audio = new Blob(this.pedazos.slice(), { type: tipo })
    if (audio.size >= 2000) this.avisos.alMirarAdelante?.({ audio, nombre }, pausa)
  }

  /** Deja de grabar y de medir (el micrófono sigue abierto). */
  private detener(): void {
    if (this.reloj) clearInterval(this.reloj)
    this.reloj = null
    const g = this.grabadora
    this.grabadora = null
    this.detector = null
    if (g && g.state !== 'inactive') { g.onstop = null; try { g.stop() } catch { /* ya parada */ } }
  }

  /** Suelta el micrófono del todo. */
  private liberar(): void {
    try { this.fuente?.disconnect() } catch { /* ya suelta */ }
    this.fuente = null
    this.analizador = null
    this.muestras = null
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    this._nivel = 0
  }
}
