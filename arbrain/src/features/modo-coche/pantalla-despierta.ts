/**
 * La pantalla despierta mientras el modo coche está abierto.
 *
 * 1. Wake Lock del navegador (Safari 16.4+; en la app de la pantalla de inicio, iOS 18.4+). Se vuelve a pedir al regresar
 *    a la app, porque iOS lo suelta al ocultarla.
 * 2. Plan B, el truco clásico (NoSleep): un video mudo de 2 s en bucle, 16×16 px, invisible. iOS no apaga la pantalla
 *    mientras un video se reproduce. Arranca dentro del toque que abre el modo coche (iOS lo exige).
 * Lo que ninguno evita: cambiar de app o bloquear el celular con el botón. Tu Arbrain sigue trabajando igual.
 */

const VIDEO = 'data:video/mp4;base64,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'

type Candado = { release: () => Promise<void> }
type ConWakeLock = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Candado> } }

export class PantallaDespierta {
  private candado: Candado | null = null
  private video: HTMLVideoElement | null = null
  private alCambiar: (despierta: boolean) => void

  constructor(alCambiar: (despierta: boolean) => void) {
    this.alCambiar = alCambiar
  }

  get despierta(): boolean {
    return !!this.candado || (!!this.video && !this.video.paused)
  }

  /** Dentro del toque: pide el candado y, si no se puede, arranca el video. */
  encender(): void {
    void this.pedirCandado()
    this.arrancarVideo()
  }

  /** Al volver a la app. */
  async renovar(): Promise<void> {
    await this.pedirCandado()
    if (this.video?.paused) void this.video.play().catch(() => {})
    this.alCambiar(this.despierta)
  }

  apagar(): void {
    void this.candado?.release().catch(() => {})
    this.candado = null
    if (this.video) { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.video.remove() }
    this.video = null
    this.alCambiar(false)
  }

  private async pedirCandado(): Promise<void> {
    try {
      this.candado = await (navigator as ConWakeLock).wakeLock?.request('screen') ?? null
    } catch { this.candado = null }
    this.alCambiar(this.despierta)
  }

  private arrancarVideo(): void {
    if (this.video) return
    try {
      const v = document.createElement('video')
      v.setAttribute('playsinline', '')
      v.setAttribute('muted', '')
      v.muted = true
      v.loop = true
      v.src = VIDEO
      v.setAttribute('aria-hidden', 'true')
      Object.assign(v.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none', left: '0', bottom: '0' })
      document.body.appendChild(v)
      this.video = v
      v.addEventListener('playing', () => this.alCambiar(this.despierta))
      void v.play().catch(() => { /* sin video: queda el candado */ })
    } catch { this.video = null }
  }
}
